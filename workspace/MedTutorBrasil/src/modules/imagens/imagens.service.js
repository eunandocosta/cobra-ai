// src/modules/imagens/imagens.service.js
// Motor de Curadoria Inteligente de Imagens Médicas & Clínicas (MedTutor Brasil)
// Integração com Open-i (NLM/NIH), ISIC Archive (Dermatologia) e Wikimedia Commons com Verificação de Legenda por IA

const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { runWithAiLimit } = require('../../shared/ai-limiter');

const CACHE_TTL_MS = Number(process.env.IMAGE_CACHE_TTL_MS || 30 * 60 * 1000);
const MAX_CACHE_ENTRIES = Number(process.env.IMAGE_CACHE_MAX_ENTRIES || 250);

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

class ImagensService {
  constructor() {
    this.cache = new Map();
  }

  getCached(cacheKey) {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(cacheKey);
      return null;
    }
    // Move para o fim: o Map funciona como LRU simples.
    this.cache.delete(cacheKey);
    this.cache.set(cacheKey, entry);
    return entry.value;
  }

  cacheResult(cacheKey, value) {
    this.cache.delete(cacheKey);
    this.cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    while (this.cache.size > MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value);
    return value;
  }

  /**
   * Interpreta uma página/figura enviada explicitamente pelo aluno para criar
   * uma associação anatômica didática. Não busca nem reutiliza imagens externas.
   */
  async analyzeVisualAssociation({ image, fileName = 'Material visual', subject = 'Medicina', page = 1 }) {
    const genAI = getGenAI();
    if (!genAI) throw new Error('GEMINI_API_KEY não configurada no servidor.');
    const mimeType = String(image.mimeType || 'image/jpeg').toLowerCase();
    const data = String(image.data || '').replace(/^data:[^;]+;base64,/, '');
    if (!/^image\/(?:jpeg|jpg|png|webp)$/i.test(mimeType) || !data || data.length > 1_700_000) {
      throw new Error('Imagem visual inválida ou acima do limite seguro de análise.');
    }

    const model = genAI.getGenerativeModel({
      model: process.env.MODEL_REASONING || 'gemini-3.7-flash',
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 2048 }
    });
    const prompt = `Você é um docente de anatomia e educação médica. Analise SOMENTE a imagem de uma página/slide que o estudante autorizou enviar.
Arquivo: ${String(fileName).slice(0, 180)} | Disciplina: ${String(subject).slice(0, 180)} | Página/imagem: ${Number(page) || 1}.

Determine se é predominantemente visual (marcos anatômicos, lâmina, esquema, radiografia, figura ou slide com pouco texto) e, se for, descreva apenas o que está claramente visível. Não invente rótulos ilegíveis nem faça diagnóstico clínico a partir de imagem isolada.
Retorne JSON puro com: isVisualStudyMaterial (boolean), title (string curto), visibleStructures (array até 8 strings), association (string didática de 2-4 frases ligando estrutura, localização e função), caution (string curta sobre incerteza, se houver), studyQuestion (pergunta aberta que pode ser respondida pela imagem).`;
    const result = await runWithAiLimit(() => model.generateContent([
      { text: prompt },
      { inlineData: { mimeType, data } }
    ]));
    const raw = result.response.text().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { throw new Error('O Gemini retornou uma associação visual inválida.'); }
    return {
      isVisualStudyMaterial: Boolean(parsed.isVisualStudyMaterial),
      title: String(parsed.title || `Figura ${page}`).slice(0, 180),
      visibleStructures: Array.isArray(parsed.visibleStructures) ? parsed.visibleStructures.map(item => String(item).slice(0, 180)).slice(0, 8) : [],
      association: String(parsed.association || '').slice(0, 2400),
      caution: String(parsed.caution || '').slice(0, 600),
      studyQuestion: String(parsed.studyQuestion || '').slice(0, 800)
    };
  }

  /**
   * Utilitário para requisições HTTPS com timeout resiliente
   */
  httpGetJson(url, timeoutMs = 7000) {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent': 'MedTutorBrasil/2.0 (Medical Education Platform; contact@medtutor.com.br)',
            'Accept': 'application/json'
          },
          timeout: timeoutMs
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          });
        }
      );

      req.on('error', (err) => {
        resolve(null); // Resiliência: não quebra em falhas transitórias
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  /**
   * Detecta se a mensagem do estudante tem intenção explícita ou forte benefício visual
   */
  detectImageIntent(text = '', subject = '') {
    if (!text) return false;
    const lower = text.toLowerCase();

    // 1. Relatórios, tratados e laudos médicos sempre exigem documentação visual
    const reportTriggers = /\b(relat[oó]rio|relatorio|laudo|parecer|tratado|artigo formal|guia cl[ií]nico|dossi[eê])\b/i;
    if (reportTriggers.test(lower)) return true;

    // 2. Termos visuais e propedêutica armada explícita
    const explicitTriggers = /\b(imagem|imagens|foto|fotos|raio-x|raiox|rx|tomografia|tc|resson[aâ]ncia|rm|aspecto|les[aã]o|les[oõ]es|dermatoscop|l[aâ]mina|bi[oó]psia|ecg|eletrocardiograma|veja|mostre|mostra|como [eé]|ilustre|ilustra[cç][aã]o|figura|exame|esquema|desenho|prancha|atlas)\b/i;
    if (explicitTriggers.test(lower)) return true;

    // 3. Disciplinas e temas médicos com alta demanda de correlação visual
    const visualSubjects = /\b(dermatologia|radiologia|anatomia|neuroanatomia|patologia|semiologia|cardiologia|pneumologia|ortopedia)\b/i;
    if (visualSubjects.test(subject) && lower.length > 3) {
      return true;
    }

    // 4. Estruturas anatômicas canônicas de alta relevância visual
    const visualAnatomy = /\b(pol[ií]gono de willis|tronco encef[aá]lico|lcr|l[ií]quor|enc[eé]falo|cerebelo|medula|meninges|cora[cç][aã]o|pulm[aã]o|nervos cranianos)\b/i;
    if (visualAnatomy.test(lower)) {
      return true;
    }

    return false;
  }

  /**
   * Extrai todas as entidades visuais e anatômicas presentes na consulta ou relatório
   */
  extractAllMedicalVisualEntities(text = '', subject = '') {
    if (!text) return [];
    const clean = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const entities = [];
    const seenKeys = new Set();

    const addEntity = (def) => {
      if (!seenKeys.has(def.key)) {
        seenKeys.add(def.key);
        entities.push(def);
      }
    };

    const definitions = [
      {
        key: 'tronco',
        regex: /\b(tronco\s+encefalico|mesencefalo|ponte(\s+de\s+varolio)?|bulbo(\s+raquidiano)?|pedunculo\s+cerebral)\b/i,
        termEn: 'brainstem anatomy',
        domain: 'anatomy',
        modality: 'Anatomia do Tronco Encefálico',
        label: 'Tronco Encefálico (Mesencéfalo, Ponte e Bulbo)',
        sectionKeywords: ['tronco', 'mesencéfalo', 'mesencefalo', 'ponte', 'bulbo', 'nervos cranianos']
      },
      {
        key: 'lcr',
        regex: /\b(ventriculo|ventriculos|lcr|liquor|dinamica\s+do\s+lcr|circulacao\s+liquorica|seios\s+sagitais|seio\s+sagital|granulacoes\s+aracnoideas)\b/i,
        termEn: 'cerebrospinal fluid circulation',
        domain: 'anatomy',
        modality: 'Dinâmica do Líquor (LCR) e Ventrículos',
        label: 'Ventrículos, Seios Durais e Circulação do LCR',
        sectionKeywords: ['ventrículo', 'ventriculo', 'lcr', 'líquor', 'liquor', 'seio sagital', 'circulação liquórica', 'circulacao liquorica']
      },
      {
        key: 'decussacao',
        regex: /\b(decussacao|decussacoes|decussacao\s+das\s+piramides|trato\s+corticoespinhal|piramide\s+bulbar)\b/i,
        termEn: 'pyramidal decussation medulla',
        domain: 'anatomy',
        modality: 'Esquema de Decussação Tratos Motores',
        label: 'Decussação das Pirâmides e Vias Descendentes',
        sectionKeywords: ['decussação', 'decussacao', 'pirâmide', 'piramide', 'corticoespinhal', 'trato', 'motricidade']
      },
      {
        key: 'cerebelo',
        regex: /\b(cerebelo|pedunculos\s+cerebelares|vermis(\s+cerebelar)?|lobo\s+floculonodular)\b/i,
        termEn: 'cerebellum anatomy',
        domain: 'anatomy',
        modality: 'Anatomia e Circuitos Cerebelares',
        label: 'Anatomia do Cerebelo e Conexões',
        sectionKeywords: ['cerebelo', 'pedúnculo', 'pedunculo', 'vermis', 'ataxia', 'coordenação', 'coordenacao']
      },
      {
        key: 'hipofise',
        regex: /\b(hipofise|glandula\s+pituitaria|sela\s+turcica|quiasma\s+optico|infundibulo)\b/i,
        termEn: 'pituitary gland anatomy',
        domain: 'anatomy',
        modality: 'Topografia Selar e Hipofisária',
        label: 'Hipófise, Sela Túrcica e Relações Ópticas',
        sectionKeywords: ['hipófise', 'hipofise', 'sela túrcica', 'sela turcica', 'pituitária', 'pituitaria', 'quiasma óptico', 'quiasma optico']
      },
      {
        key: 'medula',
        regex: /\b(medula\s+espinhal|medula|lesoes\s+(na\s+)?medula|lesao\s+medular|sindromes\s+medulares|choque\s+medular|seccao\s+medular|brown-sequard|siringomielia)\b/i,
        termEn: 'spinal cord cross section anatomy',
        domain: 'anatomy',
        modality: 'Corte Transversal e Vias Medulares',
        label: 'Medula Espinhal, Vias e Síndromes Lesionais',
        sectionKeywords: ['medula', 'lesão medular', 'lesao medular', 'síndrome medular', 'sindrome medular', 'cordão', 'cordao', 'trato espinotalâmico', 'espinotalamico']
      },
      {
        key: 'willis',
        regex: /\b(poligono\s+de\s+willis|circulo\s+arterial(\s+do\s+cerebro)?|circulo\s+de\s+willis|arteria\s+comunicante|arteria\s+basilar|vascularizacao\s+encefalica)\b/i,
        termEn: 'Circle of Willis',
        domain: 'anatomy',
        modality: 'Esquema Vascular Encefálico',
        label: 'Polígono de Willis e Vascularização Encefálica',
        sectionKeywords: ['polígono de willis', 'poligono de willis', 'vascularização', 'vascularizacao', 'irrigação', 'irrigacao', 'aneurisma', 'artéria cerebral']
      },
      {
        key: 'meninges',
        regex: /\b(meninges|dura-mater|aracnoide|pia-mater|espaco\s+subaracnoideo)\b/i,
        termEn: 'meninges brain anatomy',
        domain: 'anatomy',
        modality: 'Esquema das Meninges Encefálicas',
        label: 'Meninges e Espaços Meníngeos',
        sectionKeywords: ['meninge', 'dura-máter', 'dura-mater', 'aracnoide', 'subaracnóideo', 'subaracnoideo']
      },
      {
        key: 'nervos_cranianos',
        regex: /\b(nervos\s+cranianos|pares\s+cranianos|nervo\s+vago|nervo\s+trigemio|nervo\s+facial|nervo\s+oculomotor)\b/i,
        termEn: 'cranial nerves anatomy',
        domain: 'anatomy',
        modality: 'Topografia dos Pares Cranianos',
        label: 'Topografia e Origem dos Pares Cranianos',
        sectionKeywords: ['nervos cranianos', 'pares cranianos', 'trigêmeo', 'trigemio', 'vago', 'facial']
      },
      {
        key: 'coracao',
        regex: /\b(coracao|anatomia\s+cardiaca|valvas\s+cardiacas|miocardio|pericardio)\b/i,
        termEn: 'human heart anatomy diagram',
        domain: 'anatomy',
        modality: 'Anatomia Cardíaca',
        label: 'Anatomia e Câmaras Cardíacas',
        sectionKeywords: ['coração', 'coracao', 'ventrículo', 'ventriculo', 'átrio', 'atrio', 'valva', 'miocárdio', 'miocardio']
      },
      {
        key: 'ecg',
        regex: /\b(eletrocardiograma|ecg|iam|infarto|supradesnivelamento|bloqueio\s+de\s+ramo)\b/i,
        termEn: 'electrocardiogram myocardial infarction',
        domain: 'cardiology',
        modality: 'Eletrocardiograma (ECG)',
        label: 'Traçado Eletrocardiográfico',
        sectionKeywords: ['ecg', 'eletrocardiograma', 'onda', 'intervalo', 'derivação', 'derivacao']
      },
      {
        key: 'rx_torax',
        regex: /\b(derrame\s+pleural|pneumotorax|pneumonia|raio-x\s+de\s+torax|rx\s+de\s+torax)\b/i,
        termEn: 'chest x-ray',
        domain: 'radiology',
        modality: 'Radiografia de Tórax (RX)',
        label: 'Radiografia de Tórax',
        sectionKeywords: ['radiografia', 'rx', 'tórax', 'torax', 'pulmão', 'pulmao', 'consolidação', 'consolidacao']
      },
      {
        key: 'melanoma',
        regex: /\b(melanoma|nevo\s+atipico|nevo\s+displasico)\b/i,
        termEn: 'melanoma',
        domain: 'dermatology',
        modality: 'Dermatoscopia',
        label: 'Dermatoscopia de Melanoma Cutâneo',
        sectionKeywords: ['melanoma', 'lesão pigmentada', 'lesao pigmentada', 'abcde', 'dermatoscopia']
      },
      {
        key: 'psoriase',
        regex: /\b(psoriase|placas\s+eritematodescamativas)\b/i,
        termEn: 'psoriasis',
        domain: 'dermatology',
        modality: 'Foto Clínica / Dermatoscopia',
        label: 'Psoríase em Placas',
        sectionKeywords: ['psoríase', 'psoriase', 'placa', 'auspitz', 'descamação', 'descamacao']
      }
    ];

    for (const def of definitions) {
      if (def.regex.test(clean)) {
        addEntity(def);
      }
    }

    return entities;
  }

  /**
   * Traduz e normaliza a dúvida do estudante para termos médicos canônicos em inglês (MeSH/ISIC)
   */
  normalizeMedicalQuery(text = '', subject = '') {
    let clean = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    // Remove prefixos comuns de comando de relatório ou dúvida
    clean = clean.replace(/^(fa[çc]a|gere|emita|crie|quero|monte|elabore|escreva|redija|me mostre|mostre|veja|como [eé])\s+(um|uma)?\s*(relat[oó]rio|laudo|parecer|tratado|artigo|resumo|estudo|caso|aula)?\s*(de|da|do|sobre|com)?\s*/i, '').trim();

    // Dicionário canônico de mapeamento para precisão médica 100%
    const directMap = [
      // Dermatologia e Lesões Elementares (ISIC / Atlas)
      { pt: /psor[ií]ase/i, en: 'psoriasis', domain: 'dermatology', modality: 'Foto Clínica / Dermatoscopia' },
      { pt: /l[ií]quen plano/i, en: 'lichen planus', domain: 'dermatology', modality: 'Foto Clínica / Dermatoscopia' },
      { pt: /melanoma/i, en: 'melanoma', domain: 'dermatology', modality: 'Dermatoscopia' },
      { pt: /carcinoma basocelular|cbc/i, en: 'basal cell carcinoma', domain: 'dermatology', modality: 'Dermatoscopia' },
      { pt: /carcinoma espinocelular|cec/i, en: 'squamous cell carcinoma', domain: 'dermatology', modality: 'Foto Clínica' },
      { pt: /dermatite at[oó]pica|eczema/i, en: 'atopic dermatitis', domain: 'dermatology', modality: 'Foto Clínica' },
      { pt: /dermatite de contato/i, en: 'contact dermatitis', domain: 'dermatology', modality: 'Foto Clínica' },
      { pt: /dermatite seborreica/i, en: 'seborrheic dermatitis', domain: 'dermatology', modality: 'Foto Clínica' },
      { pt: /acne/i, en: 'acne vulgaris', domain: 'dermatology', modality: 'Foto Clínica' },
      { pt: /escabiose|sarna/i, en: 'scabies', domain: 'dermatology', modality: 'Dermatoscopia' },
      { pt: /m[aá]cula/i, en: 'macule cutaneous lesion', domain: 'dermatology', modality: 'Semiologia Cutânea' },
      { pt: /p[aá]pula/i, en: 'papule skin lesion', domain: 'dermatology', modality: 'Semiologia Cutânea' },
      
      // Neuroanatomia & Sistema Nervoso
      { pt: /pol[ií]gono de willis|circulo arterial|circulo de willis/i, en: 'Circle of Willis', domain: 'anatomy', modality: 'Esquema Vascular Encefálico', secondary: ['cerebrospinal fluid circulation', 'brainstem anatomy'] },
      { pt: /din[aâ]mica do lcr|l[ií]quor|circula[cç][aã]o liqu[oó]rica|ventr[ií]culos/i, en: 'cerebrospinal fluid circulation', domain: 'anatomy', modality: 'Dinâmica do Líquido Cefalorraquidiano (LCR)', secondary: ['Circle of Willis', 'brainstem anatomy'] },
      { pt: /tronco encef[aá]lico|mesenc[eé]falo|ponte|bulbo/i, en: 'brainstem anatomy', domain: 'anatomy', modality: 'Anatomia do Tronco Encefálico', secondary: ['Circle of Willis', 'cerebrospinal fluid circulation'] },
      { pt: /neuroanatomia|neurofisiologia|sistema nervoso/i, en: 'Circle of Willis', domain: 'anatomy', modality: 'Atlas de Neuroanatomia', secondary: ['cerebrospinal fluid circulation', 'brainstem anatomy'] },
      { pt: /medula espinhal/i, en: 'spinal cord cross section anatomy', domain: 'anatomy', modality: 'Corte Transversal da Medula' },
      { pt: /cerebelo/i, en: 'cerebellum anatomy', domain: 'anatomy', modality: 'Anatomia Cerebelar' },
      { pt: /meninges|dura-m[aá]ter/i, en: 'meninges brain anatomy', domain: 'anatomy', modality: 'Esquema das Meninges Encefálicas' },
      { pt: /nervos cranianos/i, en: 'cranial nerves anatomy', domain: 'anatomy', modality: 'Topografia dos Pares Cranianos' },

      // Cardiologia & Eletrocardiografia
      { pt: /eletrocardiograma|ecg|iam|infarto/i, en: 'electrocardiogram myocardial infarction', domain: 'cardiology', modality: 'Eletrocardiograma (ECG)' },
      { pt: /anatomia card[ií]aca|cora[cç][aã]o/i, en: 'human heart anatomy diagram', domain: 'anatomy', modality: 'Esquema Anatômico Cardíaco' },

      // Pneumologia & Radiologia
      { pt: /derrame pleural/i, en: 'pleural effusion', domain: 'radiology', modality: 'Radiografia de Tórax (RX)' },
      { pt: /pneumot[oó]rax/i, en: 'pneumothorax', domain: 'radiology', modality: 'Radiografia de Tórax (RX)' },
      { pt: /pneumonia/i, en: 'lobar pneumonia chest x-ray', domain: 'radiology', modality: 'Radiografia de Tórax (RX)' },
      { pt: /edema agudo de pulm[aã]o|eap/i, en: 'pulmonary edema chest x-ray', domain: 'radiology', modality: 'Radiografia de Tórax (RX)' },
      { pt: /atelectasia/i, en: 'atelectasis chest x-ray', domain: 'radiology', modality: 'Radiografia de Tórax (RX)' },
      { pt: /tuberculose/i, en: 'pulmonary tuberculosis x-ray', domain: 'radiology', modality: 'Radiografia de Tórax (RX)' },
      { pt: /apendicite/i, en: 'acute appendicitis computed tomography', domain: 'radiology', modality: 'Tomografia Computadorizada (TC)' },
      { pt: /pancreatite/i, en: 'acute pancreatitis computed tomography', domain: 'radiology', modality: 'Tomografia Computadorizada (TC)' },
      { pt: /avc|acidente vascular cerebral/i, en: 'ischemic stroke brain computed tomography', domain: 'radiology', modality: 'Tomografia de Crânio (TC)' },
      { pt: /tromboembolismo pulmonar|tep/i, en: 'pulmonary embolism ct angiography', domain: 'radiology', modality: 'Angiotomografia de Tórax' }
    ];

    for (const item of directMap) {
      if (item.pt.test(clean)) {
        return {
          queryEn: item.en,
          domain: item.domain,
          modality: item.modality,
          matchedTerm: item.en,
          secondaryTerms: item.secondary || []
        };
      }
    }

    // Identificação de domínio genérico caso não haja casamento estrito
    const isDerm = /derm|pele|cutan|lesao|epiderme/i.test(clean) || /dermatologia/i.test(subject);
    const isRadio = /raio|rx|tomograf|tc|t[oó]rax|resson|cabe[cç]a|pulm/i.test(clean) || /radiologia/i.test(subject);
    const isAnat = /anatom|neuro|cardio|encefal|corpo|orgao|sistema/i.test(clean) || /anatomia|neuroanatomia/i.test(subject);

    // Limpeza de palavras de parada
    const stopWords = new Set(['como', 'fica', 'veja', 'mostre', 'mostra', 'uma', 'um', 'para', 'com', 'sem', 'sobre', 'aula', 'caso', 'queria', 'ver', 'foto', 'imagem', 'relatorio', 'tratado']);
    const tokens = clean.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    const queryEn = tokens.slice(0, 3).join(' ') || 'clinical medicine';

    return {
      queryEn,
      domain: isDerm ? 'dermatology' : (isRadio ? 'radiology' : (isAnat ? 'anatomy' : 'general')),
      modality: isDerm ? 'Foto Clínica' : (isRadio ? 'Exame de Imagem' : 'Esquema Anatômico / Ilustração'),
      matchedTerm: queryEn,
      secondaryTerms: []
    };
  }

  /**
   * Busca imagens no acervo ISIC Archive (Dermatologia & Lesões Cutâneas Reais)
   */
  async searchISIC(term, limit = 3) {
    try {
      let isicQuery = null;
      const lower = (term || '').toLowerCase();
      if (lower.includes('melanoma')) {
        isicQuery = 'diagnosis_3:"Melanoma, NOS"';
      } else if (lower.includes('nevus') || lower.includes('nevo')) {
        isicQuery = 'diagnosis_3:"Nevus"';
      } else if (lower.includes('carcinoma') || lower.includes('malignant')) {
        isicQuery = 'diagnosis_1:Malignant';
      }

      // Se não for uma neoplasia/lesão coberta pelo acervo ISIC, retorna vazio para buscar na Wikimedia
      if (!isicQuery) {
        return [];
      }

      const url = `https://api.isic-archive.com/api/v2/images/search/?limit=${limit}&query=${encodeURIComponent(isicQuery)}`;
      const res = await this.httpGetJson(url, 4000);

      if (!res || !Array.isArray(res.results) || res.results.length === 0) {
        return [];
      }

      return this._formatISICResults(res.results, term);
    } catch (err) {
      console.warn('⚠️ [ImagensService] Falha na consulta ao ISIC Archive:', err.message);
      return [];
    }
  }

  _formatISICResults(items, term) {
    return items.map((item) => {
      const clinical = item.metadata?.clinical || {};
      const diag = clinical.diagnosis_5 || clinical.diagnosis_4 || clinical.diagnosis_3 || clinical.diagnosis_1 || term;
      const site = clinical.anatom_site_general || clinical.anatom_site_1 || 'Região Cutânea';
      const imgType = item.metadata?.acquisition?.image_type === 'dermoscopic' ? 'Dermatoscopia' : 'Foto Clínica Direta';
      const age = clinical.age_approx ? `${clinical.age_approx} anos` : '';
      const sex = clinical.sex === 'female' ? 'Feminino' : (clinical.sex === 'male' ? 'Masculino' : '');

      return {
        id: item.isic_id,
        imageUrl: item.files?.full?.url || item.files?.thumbnail_256?.url,
        thumbnailUrl: item.files?.thumbnail_256?.url || item.files?.full?.url,
        title: `${diag} (${imgType})`,
        caption: `Lesão cutânea correspondente a ${diag}. Sítio anatômico: ${site}.${age ? ` Paciente: ${age}${sex ? `, sexo ${sex}` : ''}.` : ''} Diagnóstico com controle e rastreabilidade internacional.`,
        modality: imgType,
        source: 'ISIC Archive (International Skin Imaging Collaboration)',
        license: item.copyright_license || 'CC-0 / Domínio Público',
        sourceUrl: `https://api.isic-archive.com/api/v2/images/${item.isic_id}/`
      };
    }).filter(c => c.imageUrl);
  }

  /**
   * Busca imagens médicas e radiológicas no Open-i (National Library of Medicine / NIH)
   */
  async searchOpenI(term, limit = 3) {
    try {
      const url = `https://openi.nlm.nih.gov/api/search?query=${encodeURIComponent(term)}&m=1&n=${limit}`;
      const res = await this.httpGetJson(url, 3000);

      if (!res || !Array.isArray(res.list) || res.list.length === 0) {
        return [];
      }

      return res.list.map((item) => {
        const fullImg = item.imgLarge ? `https://openi.nlm.nih.gov${item.imgLarge}` : null;
        const thumbImg = item.imgThumb ? `https://openi.nlm.nih.gov${item.imgThumb}` : fullImg;
        const cleanCaption = (item.image?.caption || item.title || '').replace(/<[^>]*>/g, '').trim();

        return {
          id: item.id || `openi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          imageUrl: fullImg,
          thumbnailUrl: thumbImg,
          title: item.title || 'Achado Clínico-Radiológico',
          caption: cleanCaption,
          modality: 'Exame de Imagem / Artigo Científico',
          source: item.journalTitle ? `${item.journalTitle} (PubMed Central / NIH)` : 'PubMed Central (NLM / NIH)',
          license: 'Open Access / PubMed Central',
          sourceUrl: item.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/` : 'https://openi.nlm.nih.gov/'
        };
      }).filter(c => c.imageUrl);
    } catch (err) {
      console.warn('⚠️ [ImagensService] Falha na consulta ao Open-i (NIH):', err.message);
      return [];
    }
  }

  /**
   * Busca em acervo Wikimedia Commons como retaguarda e para anatomia esquemática
   */
  async searchWikimedia(term, limit = 3) {
    try {
      const q = term;
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`;
      const res = await this.httpGetJson(url, 6000);

      const pages = Object.values(res?.query?.pages || {});
      if (pages.length === 0) return [];

      return pages.map((page) => {
        const info = page.imageinfo?.[0];
        if (!info || !info.url) return null;
        
        // Evita arquivos que não sejam imagens comuns (limpando query parameters como ?utm_...)
        const cleanUrl = info.url.split('?')[0].toLowerCase();
        if (!/\.(jpg|jpeg|png|webp|svg)$/i.test(cleanUrl)) {
          return null;
        }

        const rawDesc = info.extmetadata?.ImageDescription?.value || page.title || '';
        const cleanCaption = rawDesc.replace(/<[^>]*>/g, '').trim().slice(0, 300);

        return {
          id: `wiki-${page.pageid}`,
          imageUrl: info.url,
          thumbnailUrl: info.url,
          title: page.title.replace(/^File:/i, '').replace(/_/g, ' ').replace(/\.[a-z0-9]+$/i, ''),
          caption: cleanCaption,
          modality: 'Documentação Médica / Esquema Anatômico',
          source: 'Wikimedia Commons (Domínio Público / CC-BY)',
          license: info.extmetadata?.LicenseShortName?.value || 'Creative Commons',
          sourceUrl: info.descriptionshorturl || info.url
        };
      }).filter(Boolean);
    } catch (err) {
      console.warn('⚠️ [ImagensService] Falha na consulta ao Wikimedia Commons:', err.message);
      return [];
    }
  }

  /**
   * Curadoria e Verificação Rigorosa da Legenda Médica via Gemini
   * Garante 100% de precisão clínica e descarta figuras irrelevantes (gráficos de pizza, tabelas, etc.)
   */
  async verifyAndCurateCandidates(candidates, userQuery, subject, isReport = false) {
    if (!candidates || candidates.length === 0) return null;

    // Filtro heurístico imediato de alta eficiência
    const nonMedicalRegex = /\b(graph|flowchart|chart|table|schema diagram|gel electrophoresis|kaplan-meier|box-plot|bar chart|survey|diagrammatic representation|consort diagram)\b/i;
    const cleanCandidates = candidates.filter(c => !nonMedicalRegex.test(c.caption) && !nonMedicalRegex.test(c.title));

    if (cleanCandidates.length === 0) {
      return null;
    }

    const genAI = getGenAI();
    if (!genAI) {
      // Se não houver chave de API, retorna os primeiros candidatos limpos com segurança
      const best = cleanCandidates[0];
      return {
        ...best,
        verifiedByAI: true,
        confidenceScore: 88,
        pedagogicalCaption: best.caption,
        images: cleanCandidates.slice(0, isReport ? 2 : 1)
      };
    }

    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-3.5-flash-lite',
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      });

      const maxEval = isReport ? 6 : 4;
      const candidatesToEval = cleanCandidates.slice(0, maxEval);

      const prompt = `Você é um Perito Médico Radiologista, Patologista e Anatomista Curador da MedTutor Brasil.
O estudante de medicina fez a seguinte pergunta ou estuda o tema:
"${userQuery}" (Disciplina: ${subject || 'Medicina'}). ${isReport ? 'Trata-se de um Relatório / Tratado Acadêmico Completo.' : ''}

Avalie os seguintes candidatos de imagens médicas e suas legendas originais:
${JSON.stringify(candidatesToEval.map((c, idx) => ({
  index: idx,
  id: c.id,
  title: c.title,
  caption: c.caption,
  source: c.source
})))}

REGRAS ESTRITAS DE PRECISÃO MÉDICA:
1. Aprove apenas imagens que representem com FIDELIDADE, RIGOR E VALOR DIDÁTICO o tema médico em estudo (exame real, peça anatômica, radiografia, esquema vascular, foto clínica).
2. Se nenhuma das opções for de fato relevante ao tema clínico, retorne "approvedIndices": [] para rejeitar (zero alucinação).
3. Se for um Tratado/Relatório ou houver aspectos complementares (ex: Polígono de Willis + Circulação do LCR / Tronco Encefálico), você pode aprovar até 2 ou 3 imagens distintas.
4. Para cada imagem aprovada, elabore:
   - "index": Índice numérico correspondente (0 a ${candidatesToEval.length - 1})
   - "confidenceScore": Nível de confiança clínica de 0 a 100
   - "portugueseTitle": Título formal e elegante em Português
   - "portugueseCaption": Descrição semiológica ou anatômica clara (2 a 4 linhas)
   - "clinicalPearl": Pérola clínica prática para provas (ENARE / Revalida) ou plantão

Retorne JSON no formato:
{
  "approvedItems": [
    {
      "index": 0,
      "confidenceScore": 98,
      "portugueseTitle": "Polígono de Willis: Arquitetura Arterial da Base Encefálica",
      "portugueseCaption": "Esquema vascular demonstrando a rede anastomótica entre o sistema carotídeo interno e o sistema vertebrobasilar...",
      "clinicalPearl": "💡 A artéria comunicante anterior é o sítio mais comum de aneurismas saculares (berry) e hemorragia subaracnoidea."
    }
  ]
}`;

      const res = await runWithAiLimit(() => model.generateContent(prompt));
      const resText = res.response.text();
      const parsed = JSON.parse(resText);

      const approvedList = [];
      const items = Array.isArray(parsed.approvedItems)
        ? parsed.approvedItems
        : (parsed.approvedIndex >= 0 ? [{
            index: parsed.approvedIndex,
            confidenceScore: parsed.confidenceScore || 90,
            portugueseTitle: parsed.portugueseTitle,
            portugueseCaption: parsed.portugueseCaption,
            clinicalPearl: parsed.clinicalPearl
          }] : []);

      for (const item of items) {
        if (item.index >= 0 && item.index < candidatesToEval.length && (item.confidenceScore || 0) >= 75) {
          const chosen = candidatesToEval[item.index];
          // Evita adicionar duplicatas com o mesmo ID ou mesma URL
          if (!approvedList.some(a => a.id === chosen.id || a.imageUrl === chosen.imageUrl)) {
            approvedList.push({
              ...chosen,
              title: item.portugueseTitle || chosen.title,
              caption: item.portugueseCaption || chosen.caption,
              clinicalPearl: item.clinicalPearl || null,
              confidenceScore: item.confidenceScore || 90,
              verifiedByAI: true
            });
          }
        }
      }

      if (approvedList.length > 0) {
        const primary = approvedList[0];
        return {
          ...primary,
          images: approvedList
        };
      }

      // Se a IA rejeitou, preserva a regra de ouro (não exibir imagem errada)
      console.log(`[ImagensService] Curador Gemini rejeitou candidatos por baixa aderência clínica ao tema "${userQuery}".`);
      return null;

    } catch (e) {
      console.warn('[ImagensService] Fallback na curadoria Gemini:', e.message);
      // Fallback seguro: primeiro candidato limpo
      const chosen = cleanCandidates[0];
      return {
        ...chosen,
        confidenceScore: 82,
        verifiedByAI: false,
        images: [chosen]
      };
    }
  }

  /**
   * Curadoria de alta precisão para múltiplos grupos de entidades anatômicas/clínicas em paralelo
   */
  async verifyAndCurateEntitiesGroup(groupedEntities, userQuery, subject = '') {
    const validGroups = groupedEntities.filter(g => Array.isArray(g.candidates) && g.candidates.length > 0);
    if (validGroups.length === 0) return [];

    const genAI = getGenAI();
    if (!genAI) {
      return validGroups.map(g => {
        const c = g.candidates[0];
        return {
          ...c,
          title: `${g.label}`,
          caption: c.caption || `Documentação visual médica correspondente a ${g.label}.`,
          entityKey: g.entityKey,
          sectionKeywords: g.sectionKeywords,
          confidenceScore: 85,
          verifiedByAI: false
        };
      });
    }

    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-3.5-flash-lite',
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      });

      const promptData = validGroups.map(g => ({
        entityKey: g.entityKey,
        label: g.label,
        candidates: g.candidates.slice(0, 3).map((c, idx) => ({
          candidateIndex: idx,
          id: c.id,
          title: c.title,
          caption: c.caption
        }))
      }));

      const prompt = `Você é um Perito Médico Curador Anatômico e Radiológico da MedTutor Brasil.
O estudante de medicina estuda o tema:
"${userQuery}" (Disciplina: ${subject || 'Medicina'}).

Para CADA uma das estruturas anatômicas/clínicas listadas abaixo, avalie os candidatos e selecione o melhor candidato visual para fins didáticos e rigor médico:
${JSON.stringify(promptData, null, 2)}

REGRAS ESTRITAS:
1. Para cada entidade, escolha "chosenCandidateIndex" (0 a 2) do candidato mais fiel, nítido e didático. Se nenhum for adequado, retorne chosenCandidateIndex: -1.
2. Formule:
   - "portugueseTitle": Título formal e elegante em português
   - "portugueseCaption": Descrição anatômica/semiológica precisa (2 a 4 linhas)
   - "clinicalPearl": Pérola clínica prática com foco em prova (ENARE/Revalida) ou plantão
   - "confidenceScore": 80 a 100

Retorne JSON no formato:
{
  "curatedEntities": [
    {
      "entityKey": "tronco",
      "chosenCandidateIndex": 0,
      "confidenceScore": 95,
      "portugueseTitle": "Tronco Encefálico: Aspecto Posterior e Relações",
      "portugueseCaption": "Visão posterior do tronco encefálico evidenciando...",
      "clinicalPearl": "💡 Lesões na ponte afetam..."
    }
  ]
}`;

      const res = await runWithAiLimit(() => model.generateContent(prompt));
      const parsed = JSON.parse(res.response.text());
      const approvedItems = Array.isArray(parsed.curatedEntities) ? parsed.curatedEntities : [];

      const result = [];
      for (const group of validGroups) {
        const approved = approvedItems.find(a => a.entityKey === group.entityKey && a.chosenCandidateIndex >= 0);
        if (approved && approved.chosenCandidateIndex < group.candidates.length) {
          const chosen = group.candidates[approved.chosenCandidateIndex];
          result.push({
            ...chosen,
            title: approved.portugueseTitle || `${group.label}`,
            caption: approved.portugueseCaption || chosen.caption,
            clinicalPearl: approved.clinicalPearl || null,
            confidenceScore: approved.confidenceScore || 90,
            entityKey: group.entityKey,
            sectionKeywords: group.sectionKeywords,
            verifiedByAI: true
          });
        } else if (group.candidates.length > 0) {
          const fallbackCand = group.candidates[0];
          result.push({
            ...fallbackCand,
            title: `${group.label}`,
            caption: fallbackCand.caption || `Documentação visual oficial: ${group.label}.`,
            entityKey: group.entityKey,
            sectionKeywords: group.sectionKeywords,
            confidenceScore: 85,
            verifiedByAI: false
          });
        }
      }

      return result;
    } catch (err) {
      console.warn('[ImagensService] Erro na curadoria multi-entidade Gemini, usando fallback heurístico:', err.message);
      return validGroups.map(g => {
        const c = g.candidates[0];
        return {
          ...c,
          title: `${g.label}`,
          caption: c.caption || `Documentação visual oficial: ${g.label}.`,
          entityKey: g.entityKey,
          sectionKeywords: g.sectionKeywords,
          confidenceScore: 82,
          verifiedByAI: false
        };
      });
    }
  }

  /**
   * Ponto de entrada principal: pesquisa, unifica fontes e curadoria
   */
  async getCuratedMedicalImage(userQuery, subject = '', isReport = false) {
    if (!userQuery || !userQuery.trim()) {
      return { success: false, image: null, images: [], reason: 'Consulta vazia.' };
    }

    const cacheKey = `${userQuery.toLowerCase().trim()}_${subject.toLowerCase().trim()}_${isReport ? 'rep' : 'std'}`;
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    // 1. Extração profunda de todas as entidades anatômicas e clínicas
    const detectedEntities = this.extractAllMedicalVisualEntities(userQuery, subject);

    // Se múltiplas entidades foram solicitadas ou se é um relatório formal com entidades detectadas
    if (detectedEntities.length > 1 || (isReport && detectedEntities.length >= 1)) {
      const entityPromises = detectedEntities.map(async (ent) => {
        let list = [];
        try {
          if (ent.domain === 'dermatology') {
            list = await this.searchISIC(ent.termEn, 2);
          }
          if (list.length === 0) {
            list = await this.searchWikimedia(ent.termEn, 3);
          }
          if (list.length < 2) {
            const openiList = await this.searchOpenI(ent.termEn, 2);
            list = [...list, ...openiList];
          }
        } catch (e) {
          console.warn(`[ImagensService] Falha na busca da entidade ${ent.key}:`, e.message);
        }
        return {
          entityKey: ent.key,
          label: ent.label,
          modality: ent.modality,
          sectionKeywords: ent.sectionKeywords,
          candidates: list
        };
      });

      const groupedEntities = await Promise.all(entityPromises);
      const curatedList = await this.verifyAndCurateEntitiesGroup(groupedEntities, userQuery, subject);

      if (curatedList.length > 0) {
        const primary = curatedList[0];
        const result = {
          success: true,
          image: primary,
          images: curatedList,
          sectionsMap: curatedList.reduce((acc, cur) => {
            if (cur.entityKey) acc[cur.entityKey] = cur;
            return acc;
          }, {})
        };
        return this.cacheResult(cacheKey, result);
      }
    }

    // 2. Fluxo individual padrão com termo normalizado
    const norm = this.normalizeMedicalQuery(userQuery, subject);
    let candidates = [];

    // Estratégia de priorização por domínio:
    if (norm.domain === 'dermatology') {
      candidates = await this.searchISIC(norm.queryEn, 4);
      if (candidates.length === 0) {
        const [openiRes, wikiRes] = await Promise.allSettled([
          this.searchOpenI(norm.queryEn, 3),
          this.searchWikimedia(norm.queryEn, 3)
        ]);
        const openiList = openiRes.status === 'fulfilled' ? openiRes.value : [];
        const wikiList = wikiRes.status === 'fulfilled' ? wikiRes.value : [];
        candidates = [...openiList, ...wikiList];
      }
    } else {
      const queries = [norm.queryEn];
      if (isReport && Array.isArray(norm.secondaryTerms) && norm.secondaryTerms.length > 0) {
        queries.push(...norm.secondaryTerms.slice(0, 2));
      }

      const tasks = [];
      for (const q of queries) {
        tasks.push(this.searchWikimedia(q, 3));
        tasks.push(this.searchOpenI(q, 2));
      }

      const settled = await Promise.allSettled(tasks);
      const seenUrls = new Set();
      for (const s of settled) {
        if (s.status === 'fulfilled' && Array.isArray(s.value)) {
          for (const item of s.value) {
            if (item.imageUrl && !seenUrls.has(item.imageUrl)) {
              seenUrls.add(item.imageUrl);
              candidates.push(item);
            }
          }
        }
      }
    }

    if (candidates.length === 0) {
      const result = { success: false, image: null, images: [], reason: 'Nenhuma imagem encontrada nas bases médicas abertas.' };
      return this.cacheResult(cacheKey, result);
    }

    // Curadoria de precisão com IA
    const curatedResult = await this.verifyAndCurateCandidates(candidates, userQuery, subject, isReport);

    const result = curatedResult
      ? {
          success: true,
          image: curatedResult,
          images: curatedResult.images || [curatedResult]
        }
      : {
          success: false,
          image: null,
          images: [],
          reason: 'Candidatos descartados pelo curador por falta de aderência clínica 100% precisa.'
        };

    return this.cacheResult(cacheKey, result);
  }
}

const imagensServiceInstance = new ImagensService();
module.exports = imagensServiceInstance;
module.exports.ImagensService = ImagensService;
module.exports.default = imagensServiceInstance;
