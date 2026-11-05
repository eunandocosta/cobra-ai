// FERRAMENTA TEMPORÁRIA (somente conta admin): repara as imagens já gravadas
// antes da correção de figuras. Para remover: apagar este arquivo, a tag
// <script> dele no index.html e o item #adminImageRepairMenuEntry do menu.
(function attachAdminImageRepair() {
  'use strict';

  const PAGES_PER_BATCH = 2;
  const ESTIMATE_BRL_PER_PAGE = { low: 0.03, high: 0.07 };

  const pageFromTitle = image => Number(image?.page) || Number(String(image?.title || '').match(/p[aá]gina\s+(\d+)/i)?.[1]) || null;
  const needsAnalysis = image => /^https?:\/\//i.test(String(image?.imageUrl || image?.thumbnailUrl || ''))
    && !image?.visualAnalysisCompleted && !image?.hiddenFromFigures;

  function collectWork() {
    const materials = (Array.isArray(chatDriveMaterials) ? chatDriveMaterials : [])
      .filter(material => Array.isArray(material?.clinicalImages) && material.clinicalImages.length);
    const work = materials.map(material => ({
      material,
      pending: material.clinicalImages.map((image, index) => ({ image, index })).filter(item => needsAnalysis(item.image))
    }));
    return {
      materials: materials.length,
      images: materials.reduce((sum, material) => sum + material.clinicalImages.length, 0),
      pendingPages: work.reduce((sum, item) => sum + item.pending.length, 0),
      work: work.filter(item => item.pending.length)
    };
  }

  function costFromUsage(usage, model) {
    const pricing = GEMINI_CONFIG_2026.pricing[model] || GEMINI_CONFIG_2026.pricing['gemini-3.5-flash'];
    const usd = (Number(usage?.inputTokens) || 0) / 1e6 * pricing.inputPerMillion + (Number(usage?.outputTokens) || 0) / 1e6 * pricing.outputPerMillion;
    return usd * GEMINI_CONFIG_2026.usdToBrlRate;
  }

  const brl = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  async function isAdmin() {
    try {
      const response = await fetch('/api/announcements/admin/status', { cache: 'no-store' });
      return response.ok && (await response.json())?.isAdmin === true;
    } catch (error) {
      return false;
    }
  }

  function openPanel() {
    document.querySelector('.image-repair-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay image-repair-overlay';
    overlay.innerHTML = `<div class="app-dialog image-repair" role="dialog" aria-modal="true" aria-labelledby="imageRepairTitle">
      <h3 class="app-dialog-title" id="imageRepairTitle">🛠️ Reparar imagens dos materiais</h3>
      <p class="app-dialog-message" id="imageRepairText">Contando páginas…</p>
      <div class="home-goal-track" aria-hidden="true"><i id="imageRepairBar" style="width:0%"></i></div>
      <p class="app-dialog-message" id="imageRepairLog" aria-live="polite" style="white-space:pre-line"></p>
      <div class="app-dialog-actions"><button type="button" class="app-dialog-button app-dialog-cancel" id="imageRepairClose">Fechar</button><button type="button" class="app-dialog-button app-dialog-confirm" id="imageRepairStart" disabled>Começar</button></div>
    </div>`;
    document.body.appendChild(overlay);
    return {
      overlay,
      text: overlay.querySelector('#imageRepairText'),
      log: overlay.querySelector('#imageRepairLog'),
      bar: overlay.querySelector('#imageRepairBar'),
      start: overlay.querySelector('#imageRepairStart'),
      close: overlay.querySelector('#imageRepairClose')
    };
  }

  const IMAGE_TIMEOUT_MS = 25000;
  const ANALYSIS_TIMEOUT_MS = 150000;

  function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: tempo esgotado (${Math.round(ms / 1000)} s)`)), ms); })
    ]).finally(() => clearTimeout(timer));
  }

  async function fetchWithTimeout(url, options, ms, label) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      throw new Error(error?.name === 'AbortError' ? `${label}: tempo esgotado (${Math.round(ms / 1000)} s)` : `${label}: ${error?.message || error}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // As figuras ficam no Supabase Storage (bucket privado, link assinado).
  // Primeiro usa o link assinado; se falhar, baixa pelo cliente do Supabase.
  async function downloadStoredImage(image) {
    const url = image.imageUrl || image.thumbnailUrl;
    let firstError;
    try {
      const response = await fetchWithTimeout(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' }, IMAGE_TIMEOUT_MS, 'download');
      if (!response.ok) throw new Error(`download HTTP ${response.status}`);
      return await withTimeout(response.blob(), IMAGE_TIMEOUT_MS, 'download');
    } catch (error) {
      firstError = error;
    }
    if (typeof supabaseSignedImagePath === 'function' && supabaseSignedImagePath(url) && typeof getSupabaseStorageClient === 'function') {
      const { client, config } = await withTimeout(getSupabaseStorageClient(), IMAGE_TIMEOUT_MS, 'Supabase');
      const path = supabaseSignedImagePath(url, config.bucket);
      if (path) {
        const { data, error } = await withTimeout(client.storage.from(config.bucket).download(path), IMAGE_TIMEOUT_MS, 'Supabase download');
        if (data && !error) return data;
        throw new Error(`${firstError?.message || 'link'}; Supabase: ${error?.message || 'sem arquivo'}`);
      }
    }
    throw firstError;
  }

  async function analyzeBatch(material, batch, report) {
    const payloadImages = [];
    const failed = [];
    for (let position = 0; position < batch.length; position++) {
      const item = batch[position];
      report(`baixando figura ${position + 1} de ${batch.length} do Supabase…`);
      try {
        const blob = await downloadStoredImage(item.image);
        report(`preparando figura ${position + 1} de ${batch.length}…`);
        const dataUrl = await withTimeout(blobToDataUrl(blob), IMAGE_TIMEOUT_MS, 'leitura');
        const image = await withTimeout(makeVisionSafeImage(dataUrl), IMAGE_TIMEOUT_MS, 'conversão');
        if (!image?.data) throw new Error('imagem vazia');
        payloadImages.push({ image, page: pageFromTitle(item.image) || item.index + 1, sourceImageIndex: item.index });
      } catch (error) {
        console.warn('[Reparo de imagens] Figura ignorada.', material.name, item.index, error);
        failed.push({ index: item.index, reason: String(error?.message || error) });
      }
    }
    if (!payloadImages.length) return { analyzed: [], failed, cost: 0 };
    report(`analisando ${payloadImages.length} figura(s) com IA…`, true);
    const response = await fetchWithTimeout('/api/imagens/analisar-associacao-visual-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: payloadImages, fileName: material.name || material.originalFileName || 'Material', subject: material.subject || '' })
    }, ANALYSIS_TIMEOUT_MS, 'análise');
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(result.associations)) throw new Error(`análise: ${result.details || result.error || `HTTP ${response.status}`}`);
    const analyzed = result.associations
      .map((association, index) => ({ ...association, sourceImageIndex: payloadImages[index]?.sourceImageIndex, model: result.model }))
      .filter(association => association.analyzed && Number.isInteger(association.sourceImageIndex));
    payloadImages.forEach(item => {
      if (!analyzed.some(a => a.sourceImageIndex === item.sourceImageIndex)) failed.push({ index: item.sourceImageIndex, reason: 'sem resposta da IA' });
    });
    return { analyzed, failed, cost: costFromUsage(result.usage, result.model) };
  }

  // Questões ligadas automaticamente a figuras do material são religadas com
  // as descrições novas (e sem as páginas ocultadas).
  function relinkQuestions() {
    let unlinked = 0;
    (sharedQuestionsBank || []).forEach(question => {
      if (question?.imageOrigin === 'material_enviado' && question.medicalImage) {
        delete question.medicalImage;
        delete question.medicalImages;
        unlinked++;
      }
    });
    studyImageRelinkTried.clear();
    const relinked = attachMaterialImagesToStudyItems((sharedQuestionsBank || []).filter(question => !getStudySupportImage(question)));
    saveSharedQuestionsBank();
    return { unlinked, relinked };
  }

  async function run() {
    if (!await isAdmin()) {
      appAlert('Esta ferramenta é exclusiva da conta admin.', { title: 'Acesso restrito' });
      return;
    }
    const ui = openPanel();
    let stop = false;
    ui.close.addEventListener('click', () => { stop = true; ui.overlay.remove(); });
    const plan = collectWork();
    const low = plan.pendingPages * ESTIMATE_BRL_PER_PAGE.low;
    const high = plan.pendingPages * ESTIMATE_BRL_PER_PAGE.high;
    ui.text.textContent = plan.pendingPages
      ? `${plan.materials} material(is), ${plan.images} imagem(ns) guardada(s). ${plan.pendingPages} página(s) ainda sem descrição serão analisadas em lotes de ${PAGES_PER_BATCH} (Gemini 3.5 Flash). Custo estimado: ${brl(low)} a ${brl(high)}. Capas e slides só de texto serão ocultados como figura (os arquivos não são apagados).`
      : `${plan.materials} material(is), ${plan.images} imagem(ns). Nenhuma página pendente de análise. Você ainda pode religar as questões às figuras.`;
    ui.start.disabled = false;
    ui.start.textContent = plan.pendingPages ? `Começar (${plan.pendingPages} páginas)` : 'Religar questões';
    await new Promise(resolve => ui.start.addEventListener('click', resolve, { once: true }));
    ui.start.disabled = true;
    ui.start.hidden = true;
    ui.close.textContent = 'Parar';

    let done = 0;
    let spent = 0;
    let hidden = 0;
    let failed = 0;
    let lastError = '';
    for (const item of plan.work) {
      if (stop) break;
      const label = item.material.name || item.material.originalFileName || 'Material';
      for (let offset = 0; offset < item.pending.length && !stop; offset += PAGES_PER_BATCH) {
        const batch = item.pending.slice(offset, offset + PAGES_PER_BATCH);
        const where = `${label}: páginas ${offset + 1}–${offset + batch.length} de ${item.pending.length}`;
        let ticker = null;
        const report = (step, timed) => {
          clearInterval(ticker);
          const started = Date.now();
          const paint = () => { ui.log.textContent = `${where} — ${step}${timed ? ` ${Math.round((Date.now() - started) / 1000)} s` : ''}${lastError ? `\nÚltima falha: ${lastError}` : ''}`; };
          paint();
          if (timed) ticker = setInterval(paint, 1000);
        };
        let outcome;
        try {
          outcome = await analyzeBatch(item.material, batch, report);
        } catch (error) {
          console.warn('[Reparo de imagens] Lote falhou; segue para o próximo.', label, error);
          outcome = { analyzed: [], failed: batch.map(entry => ({ index: entry.index, reason: String(error?.message || error) })), cost: 0 };
        } finally {
          clearInterval(ticker);
        }
        if (outcome.failed.length) lastError = outcome.failed[outcome.failed.length - 1].reason;
        if (stop) break;
        if (outcome.analyzed.length) {
          const images = item.material.clinicalImages.map(image => ({ ...image, page: pageFromTitle(image) }));
          try {
            await withTimeout(MedTutorFirebaseService.saveMaterialVisualAssociations(item.material.id, outcome.analyzed, images), 60000, 'gravação');
          } catch (error) {
            console.warn('[Reparo de imagens] Falha ao gravar o lote.', label, error);
            lastError = String(error?.message || error);
          }
          hidden += outcome.analyzed.filter(association => association.isVisualStudyMaterial === false).length;
        }
        spent += outcome.cost;
        failed += outcome.failed.length;
        done += batch.length;
        ui.bar.style.width = `${Math.round(done / Math.max(1, plan.pendingPages) * 100)}%`;
        ui.text.textContent = `${done} de ${plan.pendingPages} páginas • ${hidden} ocultada(s) • ${failed} com falha • custo até agora: ${brl(spent)}`;
      }
    }
    if (!document.body.contains(ui.overlay)) document.body.appendChild(ui.overlay);
    ui.log.textContent = 'Religando as questões às figuras…';
    const links = relinkQuestions();
    ui.log.textContent = `${stop ? 'Interrompido' : 'Concluído'}: ${done} página(s) processada(s), ${hidden} ocultada(s), ${failed} com falha (pode rodar de novo para tentar só as que faltaram). Questões: ${links.unlinked} desligada(s) e ${links.relinked} religada(s). Custo: ${brl(spent)}.${lastError ? ` Última falha: ${lastError}` : ''}`;
    ui.close.textContent = 'Fechar';
    ui.start.hidden = true;
    console.info('[Reparo de imagens] Resultado', { done, hidden, failed, spent, ...links });
  }

  window.runAdminImageRepair = run;
})();
