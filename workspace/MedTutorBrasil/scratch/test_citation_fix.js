const assert = require('assert');

// Mock do ScientificLiteratureService para reproduzir com precisão o ambiente de produção
const ScientificLiteratureService = {
  cleanSearchQuery(rawQuery, targetLanguage = 'en') {
    if (!rawQuery) return '';
    let s = String(rawQuery);
    try {
      if (s.includes('%')) s = decodeURIComponent(s);
    } catch (e) {}

    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/[()\[\]"'\\]/g, ' ');
    s = s.replace(/\bM\d{2,4}\b/gi, ' ');
    s = s.replace(/\bT\d{1,3}\b/gi, ' ');
    s = s.replace(/\bTURMA\s*\d+\b/gi, ' ');
    s = s.replace(/\bAULA\s*\d+\b/gi, ' ');
    s = s.replace(/\bMODULO\s*[IVXLCDM\d]*/gi, ' ');
    s = s.replace(/\bPERIODO\s*\d*\b/gi, ' ');
    s = s.replace(/\bINTEGRACAO\s+DE\s+SISTEMAS\s+HUMANOS\s*[IVXLCDM]*/gi, ' ');
    s = s.replace(/\bSISTEMAS\s+HUMANOS\s*[IVXLCDM]*/gi, ' ');
    s = s.replace(/\bGRADUACAO\s+MEDICA\b/gi, ' ');
    s = s.replace(/\b(INTRODUCAO|CONCEITO|CONCEITOS|VISAO\s+GERAL|APOSTILA|SLIDES?|RESUMO|NOTAS?|SEMINARIO|DISCIPLINA|ESTUDO|MATERIAL|DE|DA|DO|DAS|DOS|E|A|O|AS|OS|EM|NO|NA|NOS|NAS|PARA|POR|COM|SOBRE)\b/gi, ' ');

    let tokens = s.toLowerCase().split(/[^a-z0-9_-]+/).filter(w => w.length > 1);
    const seen = new Set();
    const uniqueTokens = [];
    for (const t of tokens) {
      if (!seen.has(t)) {
        seen.add(t);
        uniqueTokens.push(t);
      }
    }

    const combinedClean = uniqueTokens.join(' ');
    if (targetLanguage === 'en') {
      const enDict = {
        'vias aferentes': 'afferent sensory pathways',
        'vias eferentes': 'efferent motor pathways',
        'vias associativas': 'associative reflex spinal pathways',
        'medula espinhal': 'spinal cord',
        'medula': 'spinal cord',
        'vias': 'pathways tracts',
        'sistema nervoso': 'nervous system'
      };

      let translated = combinedClean;
      for (const [ptKey, enVal] of Object.entries(enDict)) {
        const reg = new RegExp('\\b' + ptKey + '\\b', 'gi');
        translated = translated.replace(reg, enVal);
      }

      const enTokens = translated.split(/\s+/).filter(Boolean);
      const seenEn = new Set();
      const finalEn = [];
      for (const et of enTokens) {
        if (!seenEn.has(et)) {
          seenEn.add(et);
          finalEn.push(et);
        }
      }
      return finalEn.slice(0, 8).join(' ');
    }

    return uniqueTokens.slice(0, 8).join(' ');
  },

  encodeSearchQuery(q) {
    return encodeURIComponent(q).replace(/%20/g, '+');
  },

  getPubMedSearchUrl(query) {
    return `https://pubmed.ncbi.nlm.nih.gov/?term=${this.encodeSearchQuery(this.cleanSearchQuery(query, 'en'))}`;
  },

  getSciELOSearchUrl(query) {
    return `https://search.scielo.org/?q=${this.encodeSearchQuery(this.cleanSearchQuery(query, 'pt'))}&lang=pt`;
  }
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeSearchUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = rawUrl.replace(/&amp;/g, '&').replace(/\\\)/g, ')').replace(/\\\(/g, '(').trim();
  
  try {
    const svc = ScientificLiteratureService;
    if (url.includes('pubmed.ncbi.nlm.nih.gov/?term=')) {
      const match = url.match(/term=([^&]+)/);
      if (match) {
        const cleanQuery = svc.cleanSearchQuery(match[1], 'en');
        const enc = svc.encodeSearchQuery(cleanQuery);
        return `https://pubmed.ncbi.nlm.nih.gov/?term=${enc}`;
      }
    } else if (url.includes('sciencedirect.com/search?qs=')) {
      const match = url.match(/qs=([^&]+)/);
      if (match) {
        const cleanQuery = svc.cleanSearchQuery(match[1], 'en');
        const enc = svc.encodeSearchQuery(cleanQuery);
        return `https://www.sciencedirect.com/search?qs=${enc}`;
      }
    } else if (url.includes('search.scielo.org/?q=')) {
      const match = url.match(/q=([^&]+)/);
      if (match) {
        const cleanQuery = svc.cleanSearchQuery(match[1], 'pt');
        const enc = svc.encodeSearchQuery(cleanQuery);
        return `https://search.scielo.org/?q=${enc}&lang=pt`;
      }
    } else if (url.includes('pesquisa.bvsalud.org/portal/?q=')) {
      const match = url.match(/q=([^&]+)/);
      if (match) {
        const cleanQuery = svc.cleanSearchQuery(match[1], 'pt');
        const enc = svc.encodeSearchQuery(cleanQuery);
        return `https://pesquisa.bvsalud.org/portal/?q=${enc}`;
      }
    } else if (url.includes('cochranelibrary.com/search?q=')) {
      const match = url.match(/q=([^&]+)/);
      if (match) {
        const cleanQuery = svc.cleanSearchQuery(match[1], 'en');
        const enc = svc.encodeSearchQuery(cleanQuery);
        return `https://www.cochranelibrary.com/search?q=${enc}`;
      }
    }
  } catch (e) {}

  return url;
}

function formatInlineMd(str) {
  if (!str) return '';
  let s = String(str).replace(/<br\s*[/]?>\s*<\/br>/gi, '<br>').replace(/<\/?br\s*[/]?>/gi, '<br>');

  // Pré-cura ativa 1: Injeções acidentais de tags aninhadas
  s = s.replace(/(?:\[[^\]]*?PubMed[^\]]*?\]\()?(?:https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\/?)%20%3Ca%20href=.*$/gim, (m, pmid) => {
    return `[PubMed: ${pmid}](https://pubmed.ncbi.nlm.nih.gov/${pmid}/)`;
  });

  s = escapeHtml(s);

  // 1. CONVERSÃO PRIORITÁRIA DE LINKS MARKDOWN COM SUPORTE A PARÊNTESES BALANCEADOS E ESCAPADOS
  s = s.replace(/(?:\[\[|\[)([^\]]+?)(?:\]\]|\])\s*\(\s*(https?:\/\/(?:\\?[()][^()\s"<>]*\\?[)]|[^()\s"<>])+)\s*\)+\]*/gi, (match, label, rawUrl) => {
    const url = sanitizeSearchUrl(rawUrl);
    let cleanLabel = label.replace(/<[^>]*>/g, '').replace(/^[🔬🇧🇷📑📄📚📖\s]+/, '').replace(/[\s↗→]+$/, '').trim();
    cleanLabel = cleanLabel.replace(/https?:\/\/[^\s]+/g, '').trim();
    if (!cleanLabel) cleanLabel = 'Evidência Científica';

    const lowerLabel = cleanLabel.toLowerCase();
    let badgeClass = 'citation-num';
    let icon = '';
    if (lowerLabel.includes('pubmed') || lowerLabel.includes('pmid')) {
      badgeClass = 'citation-pubmed pubmed-badge-link';
      icon = '🔬 ';
      const pmidMatch = cleanLabel.match(/\b(\d{5,10})\b/);
      if (pmidMatch) {
        cleanLabel = `PMID: ${pmidMatch[1]}`;
      }
    } else if (lowerLabel.includes('scielo')) {
      badgeClass = 'citation-scielo scielo-badge-link';
      icon = '🇧🇷 ';
    } else if (lowerLabel.includes('cochrane')) {
      badgeClass = 'citation-cochrane cochrane-badge-link';
      icon = '📑 ';
    } else if (lowerLabel.includes('elsevier') || lowerLabel.includes('sciencedirect')) {
      badgeClass = 'citation-elsevier elsevier-badge-link';
      icon = '📄 ';
    } else if (lowerLabel.includes('bvs') || lowerLabel.includes('lilacs') || lowerLabel.includes('bireme')) {
      badgeClass = 'citation-bvs bvs-badge-link';
      icon = '📚 ';
    } else if (/^\d+$/.test(cleanLabel)) {
      badgeClass = 'citation-num';
      icon = '';
    } else {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-external-link" title="Abrir referência">${escapeHtml(cleanLabel)} ↗</a>`;
    }
    const safeTitle = escapeHtml(`Consultar evidência em ${cleanLabel}`);
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="discrete-citation-link ${badgeClass}" title="${safeTitle}">${icon}${escapeHtml(cleanLabel)} ↗</a>`;
  });

  // 2. SINTAXE CONCISA INTELIGENTE: [[Base: query]] e [Base: query] (sem URL Markdown anexada)
  s = s.replace(/(?:\[\[|\[)(PubMed|SciELO|Cochrane|Elsevier|ScienceDirect|BVS|LILACS|BIREME):\s*([^\]\)]+?)(?:\]\]|\])(?!\s*\()/gi, (match, base, query) => {
    const b = base.toLowerCase();
    let url = '';
    let badgeClass = 'citation-pubmed pubmed-badge-link';
    let icon = '🔬 ';
    let cleanLabel = base;
    const qTrim = query.trim();
    const svc = ScientificLiteratureService;
    if (b.includes('pubmed')) {
      if (/^\d+$/.test(qTrim)) {
        url = `https://pubmed.ncbi.nlm.nih.gov/${qTrim}/`;
        icon = '🔬 ';
        cleanLabel = `PMID: ${qTrim}`;
      } else {
        url = svc ? svc.getPubMedSearchUrl(qTrim) : `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(qTrim)}`;
        icon = '🔬 ';
        cleanLabel = `PubMed: ${qTrim}`;
      }
    } else if (b.includes('scielo')) {
      url = svc ? svc.getSciELOSearchUrl(qTrim) : `https://search.scielo.org/?q=${encodeURIComponent(qTrim)}&lang=pt`;
      badgeClass = 'citation-scielo scielo-badge-link';
      icon = '🇧🇷 ';
      cleanLabel = `SciELO: ${qTrim}`;
    }
    const safeTitle = escapeHtml(`Consultar evidência em ${cleanLabel}`);
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="discrete-citation-link ${badgeClass}" title="${safeTitle}">${icon}${escapeHtml(cleanLabel)} ↗</a>`;
  });

  // 3. TAGS DIRETAS ENTRE COLCHETES
  s = s.replace(/\[(?:PubMed|PMID):\s*(\d+)\](?!\s*\()/gi, '<a href="https://pubmed.ncbi.nlm.nih.gov/$1/" target="_blank" rel="noopener noreferrer" class="discrete-citation-link citation-pubmed pubmed-badge-link" title="Consultar no PubMed Oficial">🔬 PMID: $1 ↗</a>');

  // 4. LIMPEZA DE RESÍDUOS VAZADOS E IDENTIFICADORES AVULSOS NO TEXTO (PROTEGIDO: NUNCA DENTRO DE <a>...</a>)
  s = s.split(/(<a\b[\s\S]*?<\/a>|<[^>]+>)/i).map(part => {
    if (part.startsWith('<')) return part;

    // Remove parênteses/colchetes órfãos no início do fragmento que sucede um link
    part = part.replace(/^(\)+|\]+|\)\s*\]+)(?=[,\.;:!\s]|$)/, '');

    // Remove resíduos vazados de query strings acadêmicas/edital de disciplinas
    part = part.replace(/(?:%20|&quot;|\s*)*(?:INTRODUC[^\s]*|M0\d{2,4}|Integra[cç][aã]o|Sistemas\s+Humanos|MEDULA\s+ESPINHAL)[^\n<]*?(?:&lang=\w+)?\)*\]+/gi, '');
    part = part.replace(/&lang=[a-z]{2,5}\)*\]+/gi, '');
    part = part.replace(/\(?Sistema(?:\s+|%20)Nervoso\)?\)*\]+/gi, '');

    return part.replace(/(?:https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\/?|(?:^|\s)PMID:\s*(\d+)|(?:^|\s)DOI:\s*(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+))/gi, (m, urlPmid, barePmid, doi) => {
      const pmid = urlPmid || barePmid;
      if (pmid) {
        return ` <a href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/" target="_blank" rel="noopener noreferrer" class="discrete-citation-link citation-pubmed pubmed-badge-link" title="Consultar no PubMed Oficial">🔬 PMID: ${pmid} ↗</a>`;
      }
      if (doi) {
        return ` <a href="https://doi.org/${doi}" target="_blank" rel="noopener noreferrer" class="discrete-citation-link citation-elsevier" title="Abrir publicação oficial via DOI">📄 DOI: ${doi} ↗</a>`;
      }
      return m;
    });
  }).join('');

  // 5. Pós-limpeza de parênteses e colchetes órfãos remanescentes logo após fechamento de tags <a>
  s = s.replace(/(<\/a>)\s*(?:(?:\)+|\]+|\)\s*\]+))(?=[,\.;:!\s]|$)/gi, '$1');

  return s;
}

// SUÍTE DE TESTES EXAUSTIVA
const testCases = [
  {
    name: '1. Relato original do usuário: PubMed e Elsevier com ementa complexa e parênteses aninhados',
    input: 'A organização funcional divide-se didaticamente em vias aferentes (sensitivas), que ascendem da periferia para os centros superiores [🔬 PubMed ↗](https://pubmed.ncbi.nlm.nih.gov/?term=INTRODUC%CC%A7A%CC%83O%20A%CC%80S%20VIAS%20E%20MEDULA%20ESPINHAL%20M011%20Integra%C3%A7%C3%A3o%20de%20Sistemas%20Humanos%20III%20\\(Sistema%20Nervoso)%20INTRODUC%CC%A7A%CC%83O%20A%CC%80S%20VIAS%20E%20MEDULA%20ESPINHAL%20M011%20Integra%C3%A7%C3%A3o%20de%20Sistemas%20Humanos%20III%20(Sistema%20Nervoso))], vias eferentes (motoras), que descendem para executar comandos voluntários e involuntários [📄 Elsevier ↗](https://www.sciencedirect.com/search?qs=INTRODUC%CC%A7A%CC%83O%20A%CC%80S%20VIAS%20E%20MEDULA%20ESPINHAL%20M011%20Integra%C3%A7%C3%A3o%20de%20Sistemas%20Humanos%20III%20\\(Sistema%20Nervoso)%20INTRODUC%CC%A7A%CC%83O%20A%CC%80S%20VIAS%20E%20MEDULA%20ESPINHAL%20M011%20Integra%C3%A7%C3%A3o%20de%20Sistemas%20Humanos%20III%20(Sistema%20Nervoso))], e vias associativas (mistas)...',
    check(output) {
      assert(!output.includes('INTRODUC'), 'Não deve conter ruído de ementa');
      assert(!output.includes('&lang=pt'), 'Não deve conter query param vazado');
      assert(!output.includes('))]'), 'Não deve conter parênteses ou colchetes vazados');
      assert(!output.includes(')]'), 'Não deve conter parênteses ou colchetes vazados');
      assert(output.includes('href="https://pubmed.ncbi.nlm.nih.gov/?term='), 'Deve gerar URL limpa do PubMed');
      assert(output.includes('href="https://www.sciencedirect.com/search?qs='), 'Deve gerar URL limpa da Elsevier');
    }
  },
  {
    name: '2. Link do SciELO com &lang=pt)] no final da query',
    input: 'Consulte a evidência no [🇧🇷 SciELO ↗](https://search.scielo.org/?q=INTRODUC%CC%A7A%CC%83O%20A%CC%80S%20VIAS%20E%20MEDULA%20ESPINHAL%20M011%20Integra%C3%A7%C3%A3o%20de%20Sistemas%20Humanos%20III%20(Sistema%20Nervoso)&lang=pt)] para detalhes.',
    check(output) {
      assert(!output.includes('INTRODUC'), 'Não deve conter ruído de ementa');
      assert(!output.includes('&lang=pt)]'), 'Não deve conter texto vazado no corpo da mensagem');
      assert(output.includes('href="https://search.scielo.org/?q='), 'Deve gerar URL sanitizada do SciELO');
      assert(output.includes('&lang=pt"'), 'O parâmetro lang=pt deve estar adequadamente dentro do href');
    }
  },
  {
    name: '3. Texto residual já gravado em histórico com fragmento vazado',
    input: 'Texto fisiológico %20INTRODUC%CC%A7A%CC%83O%20A%CC%80S%20VIAS%20E%20MEDULA%20ESPINHAL%20M011%20Integra%C3%A7%C3%A3o%20de%20Sistemas%20Humanos%20III%20(Sistema%20Nervoso)&lang=pt)] continua normalmente.',
    check(output) {
      assert(!output.includes('INTRODUC'), 'Deve curar resíduo gravado');
      assert(!output.includes('&lang=pt'), 'Deve curar parâmetro órfão');
      assert(output.includes('Texto fisiológico continua normalmente.'), 'Deve preservar o texto útil');
    }
  },
  {
    name: '4. Caso anterior com injeção de tag (%20%3Ca%20href=)',
    input: 'Karagulle M, et al. Macro-structural brainstem volumetry. Disponível em: [🔬 PubMed: 42702667 ↗](https://pubmed.ncbi.nlm.nih.gov/42702667/%20%3Ca%20href=)" target="_blank" rel="noopener noreferrer" class="discrete-citation-link citation-pubmed" title="Consultar evidência em PubMed - [🔬 PubMed: 42702667 ↗](https://pubmed.ncbi.nlm.nih.gov/42702667/%20%3Ca%20href=)" target="_blank" rel="noopener noreferrer" class="discrete-citation-link citation-pubmed" title="Consultar no PubMed Oficial">🔬 [🔬 PubMed: 42702667 ↗](https://pubmed.ncbi.nlm.nih.gov/42702667/%20%3Ca%20href=)" target="_blank" rel="noopener noreferrer" class="pubmed-badge-link" title="Consultar no PubMed Oficial">🔬 PMID: 42702667 ↗ ↗ ↗',
    check(output) {
      assert(!output.includes('%20%3Ca%20href='), 'Não deve conter escape de tag');
      assert(!output.includes('↗ ↗'), 'Não deve ter setas duplicadas');
      assert(output.includes('https://pubmed.ncbi.nlm.nih.gov/42702667/'), 'Deve conter link correto com PMID');
    }
  },
  {
    name: '5. Link normal com query simples e links múltiplos no mesmo parágrafo',
    input: 'Consulte [PubMed: Parkinson](https://pubmed.ncbi.nlm.nih.gov/?term=parkinson) e também [SciELO: AVC](https://search.scielo.org/?q=avc&lang=pt).',
    check(output) {
      assert(output.includes('href="https://pubmed.ncbi.nlm.nih.gov/?term='), 'Deve conter link do PubMed');
      assert(output.includes('href="https://search.scielo.org/?q='), 'Deve conter link do SciELO');
      assert(!output.includes('&lang=pt)'), 'Não deve vazar nada fora do href');
    }
  }
];

console.log('Iniciando suíte de testes de citações científicas e self-healing...\n');

testCases.forEach((tc, idx) => {
  console.log(`--- Teste ${idx + 1}: ${tc.name} ---`);
  const result = formatInlineMd(tc.input);
  console.log('Saída:', result);
  tc.check(result);
  console.log('✅ Passou com sucesso!\n');
});

console.log('🎉 TODOS OS TESTES PASSARAM COM SUCESSO E SEM REGRESSÕES!');

