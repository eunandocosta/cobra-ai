// FERRAMENTA TEMPORÁRIA (somente conta admin): repara as imagens já gravadas
// antes da correção de figuras. Para remover: apagar este arquivo, a tag
// <script> dele no index.html e o item #adminImageRepairMenuEntry do menu.
(function attachAdminImageRepair() {
  'use strict';

  const PAGES_PER_BATCH = 4;
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
      <p class="app-dialog-message" id="imageRepairLog" aria-live="polite"></p>
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

  async function analyzeBatch(material, batch) {
    const payloadImages = [];
    const failed = [];
    for (const item of batch) {
      try {
        const response = await fetch(item.image.imageUrl || item.image.thumbnailUrl, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        payloadImages.push({ image: await makeVisionSafeImage(await blobToDataUrl(await response.blob())), page: pageFromTitle(item.image) || item.index + 1, sourceImageIndex: item.index });
      } catch (error) {
        failed.push(item.index);
      }
    }
    if (!payloadImages.length) return { analyzed: [], failed, cost: 0 };
    const response = await fetch('/api/imagens/analisar-associacao-visual-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: payloadImages, fileName: material.name || material.originalFileName || 'Material', subject: material.subject || '' })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(result.associations)) throw new Error(result.details || result.error || `HTTP ${response.status}`);
    const analyzed = result.associations
      .map((association, index) => ({ ...association, sourceImageIndex: payloadImages[index]?.sourceImageIndex, model: result.model }))
      .filter(association => association.analyzed && Number.isInteger(association.sourceImageIndex));
    payloadImages.forEach(item => { if (!analyzed.some(a => a.sourceImageIndex === item.sourceImageIndex)) failed.push(item.sourceImageIndex); });
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
    ui.close.textContent = 'Parar';

    let done = 0;
    let spent = 0;
    let hidden = 0;
    let failed = 0;
    for (const item of plan.work) {
      if (stop) break;
      const label = item.material.name || item.material.originalFileName || 'Material';
      for (let offset = 0; offset < item.pending.length && !stop; offset += PAGES_PER_BATCH) {
        const batch = item.pending.slice(offset, offset + PAGES_PER_BATCH);
        ui.log.textContent = `${label}: páginas ${offset + 1}–${offset + batch.length} de ${item.pending.length}…`;
        let outcome;
        try {
          outcome = await analyzeBatch(item.material, batch);
        } catch (error) {
          console.warn('[Reparo de imagens] Lote falhou; segue para o próximo.', label, error);
          outcome = { analyzed: [], failed: batch.map(entry => entry.index), cost: 0 };
        }
        if (outcome.analyzed.length) {
          const images = item.material.clinicalImages.map(image => ({ ...image, page: pageFromTitle(image) }));
          await MedTutorFirebaseService.saveMaterialVisualAssociations(item.material.id, outcome.analyzed, images);
          hidden += outcome.analyzed.filter(association => association.isVisualStudyMaterial === false).length;
        }
        spent += outcome.cost;
        failed += outcome.failed.length;
        done += batch.length;
        ui.bar.style.width = `${Math.round(done / Math.max(1, plan.pendingPages) * 100)}%`;
        ui.text.textContent = `${done} de ${plan.pendingPages} páginas • ${hidden} ocultada(s) • ${failed} com falha • custo até agora: ${brl(spent)}`;
      }
    }
    ui.log.textContent = 'Religando as questões às figuras…';
    const links = relinkQuestions();
    ui.log.textContent = `${stop ? 'Interrompido' : 'Concluído'}: ${done} página(s) processada(s), ${hidden} ocultada(s), ${failed} com falha (pode rodar de novo para tentar só as que faltaram). Questões: ${links.unlinked} desligada(s) e ${links.relinked} religada(s). Custo: ${brl(spent)}.`;
    ui.close.textContent = 'Fechar';
    ui.start.hidden = true;
    console.info('[Reparo de imagens] Resultado', { done, hidden, failed, spent, ...links });
  }

  window.runAdminImageRepair = run;
})();
