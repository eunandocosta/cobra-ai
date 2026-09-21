const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { runWithAiLimit } = require('../../shared/ai-limiter');

function questionTokenSet(value) {
  return new Set(String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(token => token.length >= 4 && !['qual', 'sobre', 'para', 'como', 'essa', 'este', 'com', 'uma', 'entre'].includes(token)));
}

function areQuestionsTooSimilar(first, second, firstAnswer = '', secondAnswer = '') {
  const a = questionTokenSet(first);
  const b = questionTokenSet(second);
  if (!a.size || !b.size) return false;
  const intersection = [...a].filter(token => b.has(token)).length;
  const jaccard = intersection / new Set([...a, ...b]).size;
  // Se ambas tiverem respostas/gabaritos muito similares, tolerância menor
  if (firstAnswer && secondAnswer && areAnswersTooSimilar(firstAnswer, secondAnswer)) {
    return jaccard >= 0.55;
  }
  // Se as respostas forem diferentes, só descarta se os enunciados forem essencialmente idênticos
  return jaccard >= 0.75;
}

function areAnswersTooSimilar(first, second) {
  const normalizedFirst = String(first || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedSecond = String(second || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalizedFirst.length < 3 || normalizedSecond.length < 3) return false;
  if (normalizedFirst === normalizedSecond) return true;
  const a = questionTokenSet(normalizedFirst);
  const b = questionTokenSet(normalizedSecond);
  if (!a.size || !b.size) return false;
  const intersection = [...a].filter(token => b.has(token)).length;
  return intersection / Math.min(a.size, b.size) >= 0.85;
}

function isAuthoredQuestionCandidate(line) {
  const clean = String(line || '').trim();
  if (clean.length < 18) return false;
  // Cabeçalhos que terminam com dois pontos (ex: "Perguntas do Caso 1:", "Questões para discutir:")
  if (/^.*[:]\s*$/.test(clean) && !clean.includes('?')) return false;
  // Seções estruturais de sumário/índice
  if (/\b(fundamentos|propedeutica|metodos diagnosticos|diagnostico diferencial|diretrizes|sumario|indice|apostila|slides|modulo|capitulo|secao|conteudo programatico|referencias|objetivos|etiopatogenicos|fisiopatologia)\b/i.test(clean) && !clean.includes('?')) return false;

  const startsQuestion = /^(?:(?:quest[aã]o|pergunta|exerc[ií]cio|caso)\s*\d*\s*[:.)-]*|\d{1,3}\s*[.)-])\s*/i;
  const hasInterrogative = /\b(qual|quais|como|por que|porque|explique|descreva|discuta|identifique|cite|justifique|analise|calcule|relacione|aponte|defina)\b/i.test(clean);

  if (clean.includes('?')) return true;
  if (startsQuestion.test(clean) && hasInterrogative) return true;
  return false;
}

function shuffleQuestionAlternatives(alternativas, correctIdx) {
  const safeIdx = (typeof correctIdx === 'number' && correctIdx >= 0 && correctIdx < alternativas.length) ? correctIdx : 0;
  const items = alternativas.map((text, idx) => ({ text, isCorrect: idx === safeIdx }));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  const letters = ['A', 'B', 'C', 'D'];
  const newIndex = items.findIndex(it => it.isCorrect);
  const finalIdx = newIndex >= 0 ? newIndex : 0;
  return {
    shuffledOptions: items.map(it => it.text),
    newCorrectIndex: finalIdx,
    newGabarito: letters[finalIdx] || 'A'
  };
}

function sanitizeTopicName(candidate, fallback) {
  const text = String(candidate || '').trim();
  if (!text || text.length < 3) return fallback || 'Tema de estudo';
  if (/\b(fundamentos|propedeutica|metodos diagnosticos|diagnostico diferencial|diretrizes|oficiais|sus|protocolos|apostila|slides|modulo|secao)\b/i.test(text)) {
    return fallback || 'Tema Clínico';
  }
  return text;
}

// Muitos slides trazem exercícios elaborados pelo próprio professor. Eles são uma
// referência didática mais fiel que um tema solto: preservamos o foco e a redação
// quando a resposta puder ser comprovada no conteúdo, sem transformar alternativas
// ou comandos de múltipla escolha no enunciado compartilhado.
function extractAuthoredQuestionsFromMaterial(value, limit = 12) {
  const lines = String(value || '').replace(/\r/g, '').split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const questions = [];
  const startsQuestion = /^(?:(?:quest[aã]o|pergunta|exerc[ií]cio|caso)\s*\d*\s*[:.)-]*|\d{1,3}\s*[.)-])\s*/i;
  const isContinuation = /^(?:[A-E]\s*[.)-]|(?:gabarito|resposta)\s*[:.)-])/i;

  for (let index = 0; index < lines.length && questions.length < limit; index++) {
    const line = lines[index];
    if (!isAuthoredQuestionCandidate(line)) continue;

    let candidate = line;
    for (let next = index + 1; next < lines.length && next <= index + 5; next++) {
      const continuation = lines[next];
      if (startsQuestion.test(continuation) && isAuthoredQuestionCandidate(continuation)) break;
      if (!isContinuation.test(continuation) && candidate.includes('?')) break;
      candidate = `${candidate} ${continuation}`.slice(0, 700);
    }
    candidate = candidate.replace(/\s+/g, ' ').trim();
    if (candidate.length < 20 || !isAuthoredQuestionCandidate(candidate)) continue;
    if (!questions.some(existing => areQuestionsTooSimilar(existing, candidate))) questions.push(candidate);
  }
  // Alguns extratores de PDF entregam uma aula inteira em uma única linha. Nesse
  // caso, a interrogação ainda é um sinal útil para recuperar a questão original.
  const inlineQuestions = String(value || '').replace(/\s+/g, ' ').match(/[^?]{20,700}\?/g) || [];
  inlineQuestions.forEach(candidate => {
    const normalized = candidate.replace(/\s+/g, ' ').trim();
    if (questions.length < limit && isAuthoredQuestionCandidate(normalized) && !questions.some(existing => areQuestionsTooSimilar(existing, normalized))) {
      questions.push(normalized);
    }
  });
  return questions;
}

// O mesmo enunciado é usado no Quiz (com opções) e no Flashcard (sem opções).
// Remove instruções que só fazem sentido em múltipla escolha antes de persistir.
function sanitizeSharedQuestionStem(value) {
  return String(value || '')
    .replace(/(?:^|\s)(?:de acordo com (?:as )?opções|com base nas alternativas|considerando as alternativas)[,:;]?\s*/gi, ' ')
    .replace(/(?:^|\s)(?:assinale|marque|selecione|indique)\s+(?:a\s+)?alternativa\s+(?:correta|mais correta|adequada|incorreta)[,:;]?\s*/gi, ' ')
    .replace(/(?:^|\n)\s*(?:\[\s*\]\s*)?[A-D][).:\-]\s*[^\n]+/gim, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSharedQuestionStemValid(stem) {
  if (!stem || stem.length < 18) return false;
  if (/\b(alternativa|opções?|assinale|marque|selecione)\b/i.test(stem)) return false;
  if (/\b(definid[oa] na aula|tema (?:cl[ií]nico )?principal da aula|da disciplina de|na aula de|no slide|na apostila|no material de estudo|conforme a aula|ministrad[oa] na aula|abordad[oa] na aula)\b/i.test(stem)) return false;
  if (/\b(?:no|do|na|da|segundo|conforme|mencionad[oa]\s+no)\s+caso\s*\d*\b/i.test(stem)) return false;
  if (/\bqual\s+(?:[eé]\s+)?(?:a\s+)?idade\s+(?:do|da|de|dos|das)?\s*paciente\b/i.test(stem)) return false;
  if (/\bqual\s+[eé]\s+a\s+idade\b/i.test(stem)) return false;
  return true;
}

function buildSafeFlashcardTitle(title, correctAnswer) {
  const candidate = String(title || '').replace(/\s+/g, ' ').trim();
  const normalize = value => String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedTitle = normalize(candidate);
  const normalizedAnswer = normalize(correctAnswer);
  const titleRevealsAnswer = normalizedTitle && normalizedAnswer && (
    normalizedAnswer.includes(normalizedTitle) || normalizedTitle.includes(normalizedAnswer)
  );
  if (candidate.length >= 3 && candidate.length <= 72 && !titleRevealsAnswer) return candidate;
  return 'Tema em revisão';
}

function buildDifficultyPlan(total, requestedDifficulty) {
  if (requestedDifficulty !== 'balanced') return Array(total).fill(requestedDifficulty);
  // "Balanceado" privilegia a construção de base: a aplicação é importante,
  // mas não pode transformar uma aula introdutória em prova de residência.
  const advancedCount = total >= 5 ? Math.max(1, Math.round(total * 0.1)) : 0;
  const intermediateCount = Math.max(1, Math.round(total * 0.3));
  const beginnerCount = Math.max(0, total - intermediateCount - advancedCount);
  return [
    ...Array(beginnerCount).fill('iniciante'),
    ...Array(intermediateCount).fill('intermediario'),
    ...Array(advancedCount).fill('avancado')
  ];
}

// Mantém a cobertura do documento: a geração percorre cada seção/página antes
// de voltar ao início. Se o extrator não preservou títulos, parágrafos longos
// ainda formam blocos didáticos, sem descartar conteúdo do material.
function splitMaterialIntoQuestionSections(value) {
  const text = String(value || '').replace(/\r/g, '').trim();
  if (!text) return [];
  const headingPattern = /^(?:#{1,6}\s+.+|(?:p[aá]gina|slide)\s+\d+\b.*)$/gim;
  const matches = [...text.matchAll(headingPattern)];
  const rawSections = matches.length > 1
    ? matches.map((match, index) => text.slice(match.index, matches[index + 1]?.index || text.length).trim())
    : text.split(/\n\s*\n(?=[^\n]{12,})/).map(part => part.trim()).filter(Boolean);
  const sections = [];
  rawSections.forEach((raw, index) => {
    if (raw.length < 80) return;
    const firstLine = raw.split('\n').find(line => line.trim()) || '';
    const baseLabel = firstLine.replace(/^#{1,6}\s*/, '').replace(/^(?:p[aá]gina|slide)\s+\d+\s*[:\-–]?\s*/i, '').trim() || `Bloco ${index + 1}`;
    // Um bloco sem subtítulos pode ser enorme após a extração de PDF. Ele é
    // fatiado em trechos contíguos para caber em uma chamada, mas todos os
    // caracteres continuam no ciclo de cobertura.
    let remaining = raw;
    let part = 1;
    while (remaining.length) {
      if (remaining.length <= 16000) {
        sections.push({ id: `secao-${sections.length + 1}`, label: part === 1 ? baseLabel.slice(0, 160) : `${baseLabel.slice(0, 140)} — parte ${part}`, content: remaining });
        break;
      }
      const windowText = remaining.slice(0, 16000);
      const splitAt = Math.max(windowText.lastIndexOf('\n\n'), windowText.lastIndexOf('\n'), windowText.lastIndexOf('. '), windowText.lastIndexOf(' '));
      const safeSplit = splitAt > 4000 ? splitAt + 1 : 16000;
      sections.push({ id: `secao-${sections.length + 1}`, label: `${baseLabel.slice(0, 140)} — parte ${part}`, content: remaining.slice(0, safeSplit).trim() });
      remaining = remaining.slice(safeSplit).trim();
      part++;
    }
  });
  return sections.length ? sections : [{ id: 'secao-1', label: 'Conteúdo do material', content: text }];
}

function buildSectionQuestionPlan(sections, total, offset = 0) {
  if (!sections.length) return [];
  return Array.from({ length: total }, (_, index) => sections[(index + offset) % sections.length]);
}

function classifyLearningAxis(excerpt) {
  const text = String(excerpt || '').toLowerCase();
  if (/\b(tratamento|terapia|medicamento|dose|cirurgia|procedimento|antibi[oó]tico|cortic[oó]ide|quimioterapia|prescri[cç][aã]o|indica[cç][aã]o cir[uú]rgica|exame de escolha|tomografia|resson[aâ]ncia|pun[cç][aã]o|biópsia)\b/i.test(text)) return 'tratamento';
  if (/\b(sinal|sintoma|quadro cl[ií]nico|manifesta[cç][aã]o|identifica|diagn[oó]stico|achado|exame f[ií]sico|apresenta|paciente|les[aã]o|deficit|semiologia)\b/i.test(text)) return 'reconhecimento';
  return 'base';
}

// Varre o arquivo inteiro antes de decidir o que entra no prompt. Os trechos
// são distribuídos por todas as seções/páginas; assim uma introdução extensa
// não esconde o restante do PDF. O Gemini recebe no máximo 60 candidatos para
// uma segunda curadoria de importância e geração.
function collectCuratedMaterialExcerpts(materialText, maxCandidates = 60) {
  const sections = splitMaterialIntoQuestionSections(materialText);
  const fragments = [];
  sections.forEach(section => {
    const source = String(section.content || '').replace(/\s+/g, ' ').trim();
    for (let start = 0; start < source.length; start += 1100) {
      const excerpt = source.slice(start, start + 1100).trim();
      if (excerpt.length >= 140) fragments.push({ label: section.label, excerpt, axis: classifyLearningAxis(excerpt) });
    }
  });
  if (fragments.length <= maxCandidates) return fragments;
  const selected = [];
  // Amostragem estratificada: cada posição percorre o documento por inteiro.
  for (let index = 0; index < maxCandidates; index++) {
    selected.push(fragments[Math.floor((index * fragments.length) / maxCandidates)]);
  }
  return selected;
}

function buildCuratedAxisPlan(total, candidates) {
  const treatmentAvailable = candidates.some(candidate => candidate.axis === 'tratamento');
  const base = Math.round(total * (treatmentAvailable ? 0.5 : 0.6));
  const recognition = total - base - (treatmentAvailable ? Math.round(total * 0.2) : 0);
  const treatment = Math.max(0, total - base - recognition);
  return { base, reconhecimento: recognition, tratamento: treatment, treatmentAvailable };
}

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ [Quiz Engine] GEMINI_API_KEY não foi encontrada nas variáveis de ambiente!");
    throw new Error("GEMINI_API_KEY não configurada no ambiente.");
  }
  return new GoogleGenerativeAI(apiKey);
}

const questionsSchema = {
  type: SchemaType.ARRAY,
  description: "Lista de questões formativas estruturadas por seções e escada de dificuldade",
  items: {
    type: SchemaType.OBJECT,
    properties: {
      pergunta: {
        type: SchemaType.STRING,
        description: "Pergunta aberta, autocontida e respondível sem alternativas; será usada igual no Quiz e no Flashcard. Nunca use 'assinale', 'alternativa', 'opções', nem inclua opções no enunciado."
      },
      alternativas: {
        type: SchemaType.ARRAY,
        description: "Exatamente 4 opções de resposta técnicas e diretas, sem 'A)', 'B)'",
        items: { type: SchemaType.STRING }
      },
      gabarito: {
        type: SchemaType.STRING,
        format: "enum",
        enum: ["A", "B", "C", "D"],
        description: "Letra da alternativa correta (A, B, C ou D)"
      },
      texto_resposta_correta: {
        type: SchemaType.STRING,
        description: "Texto exato da alternativa correta"
      },
      justificativa: {
        type: SchemaType.STRING,
        description: "Explicação clara baseada exclusivamente no conteúdo enviado"
      },
      analise_distratores: {
        type: SchemaType.ARRAY,
        description: "Uma análise para CADA alternativa incorreta. A alternativa deve reproduzir exatamente o texto usado em alternativas; explique objetivamente por que ela está errada com base na fonte, sem inventar fatos.",
        items: {
          type: SchemaType.OBJECT,
          properties: {
            alternativa: { type: SchemaType.STRING, description: "Texto exato da alternativa incorreta" },
            explicacao: { type: SchemaType.STRING, description: "Motivo objetivo pelo qual esta alternativa está incorreta" }
          },
          required: ["alternativa", "explicacao"]
        }
      },
      perola_clinica: {
        type: SchemaType.STRING,
        description: "Ponto-chave breve para memorização, sem acrescentar informações ausentes da fonte"
      },
      titulo_flashcard: {
        type: SchemaType.STRING,
        description: "Título de contexto do flashcard, com 3 a 7 palavras. Nunca revele resposta, diagnóstico, alternativa correta ou conduta."
      },
      origem_pergunta: {
        type: SchemaType.STRING,
        format: "enum",
        enum: ["reaproveitada_da_fonte", "inspirada_na_fonte", "nova_a_partir_da_fonte"],
        description: "Indique se a pergunta reaproveita uma questão autoral da fonte, usa apenas seu estilo/foco, ou foi criada diretamente a partir do conteúdo."
      },
      nivel_dificuldade: {
        type: SchemaType.STRING,
        format: "enum",
        enum: ["iniciante", "intermediario", "avancado"],
        description: "Nível acadêmico de graduação: iniciante (um fato explícito), intermediario (uma relação simples) ou avancado (aplicação limitada de um conceito explícito). Nunca use nível de residência."
      },
      secao_origem: {
        type: SchemaType.STRING,
        description: "Nome ou tema da seção temática do material da qual esta questão foi extraída"
      },
      eixo_aprendizagem: {
        type: SchemaType.STRING,
        format: "enum",
        enum: ["base", "reconhecimento", "tratamento"],
        description: "Eixo pedagógico: base (estrutura/localização/componentes), reconhecimento (sinais, comportamento, achados e estruturas acometidas) ou tratamento (apenas se explicitamente presente na fonte)."
      }
    },
    required: [
      "pergunta",
      "alternativas",
      "gabarito",
      "texto_resposta_correta",
      "justificativa",
      "analise_distratores",
      "perola_clinica",
      "titulo_flashcard",
      "origem_pergunta",
      "nivel_dificuldade",
      "secao_origem",
      "eixo_aprendizagem"
    ]
  }
};

const SYSTEM_INSTRUCTION = `
Você cria questões formativas para estudantes de medicina estritamente baseadas no conteúdo enviado.

DIRETRIZES FUNDAMENTAIS DE LEITURA E GERAÇÃO POR SEÇÕES:
1. LEITURA POR SEÇÕES TEMÁTICAS REAIS:
   - Divida o material nas suas seções temáticas conceituais reais (ex: Anatomia e Formação, Dinâmica Liquórica, Fisiopatologia, Apresentação Clínica/Semiologia, Diagnóstico e Conduta).
   - IGNORE categoricamente cabeçalhos de universidade, sumários, índices, numeração de páginas/slides, nomes de docentes, datas, referências bibliográficas ou títulos vazios.

2. ESCALA PEDAGÓGICA DE GRADUAÇÃO (OBRIGATÓRIA):
   - INICIANTE: cobre UM único fato declarado de forma explícita (nome, definição, localização, parte, função ou associação direta). Resposta curta. Não use caso clínico, diagnóstico, conduta, diretriz, cálculo ou duas perguntas na mesma frase.
   - INTERMEDIÁRIO: cobre UMA relação simples que a fonte explica (causa→efeito, estrutura→função ou comparação direta entre dois elementos). Não use vinheta clínica, diagnóstico diferencial, conduta, protocolo ou múltiplas etapas de raciocínio.
   - AVANÇADO: cobre a aplicação limitada de UM conceito já apresentado. Só use um contexto breve se ele estiver na própria fonte. Não peça diagnóstico diferencial, investigação em sequência, escolha terapêutica, gravidade, emergência, guideline, cálculo ou integração de três ou mais variáveis. É nível de graduação, NUNCA de residência.
   - Não force todos os níveis em cada seção: escolha o nível pedido e somente eleve a complexidade quando a fonte realmente oferecer base explícita.

3. PULAR QUESTÕES JÁ EXISTENTES NO DECK:
   - Se uma pergunta, conceito ou gabarito já constar nas questões já aceitas/existentes no deck do aluno, PULE-A SUMARIAMENTE e formule a questão sobre outro ponto da mesma seção ou da seção seguinte.
   - Nunca gere perguntas redundantes ou com o mesmo foco que as já existentes no deck.

4. FOCO EXCLUSIVAMENTE BIOMÉDICO: A pergunta deve cobrar raciocínio clínico, anatomia, fisiopatologia, semiologia, critérios diagnósticos, condutas ou farmacologia. NUNCA faça meta-perguntas sobre o documento, a aula, a disciplina, o módulo ou o professor (ex.: É EXPRESSAMENTE PROIBIDO perguntar "Qual é o tema principal da aula...", "Na disciplina de...", "De acordo com o material...").
5. Use somente fatos, relações e termos que estejam explícitos na fonte. Não complete lacunas com conhecimento externo, dados de prova, condutas ou casos inventados.
6. JAMAIS trate termos anatômicos, disciplinas ou tópicos como doenças (ex.: nunca escreva "paciente com diagnóstico de Tronco Encefálico").
7. Comece pelo entendimento direto do conteúdo. Use situação clínica somente se ela estiver descrita na fonte e o nível solicitado for avançado; mesmo nesse caso, mantenha uma única decisão conceitual simples.
8. PROIBIDO usar no enunciado e nas alternativas termos como: "aula", "disciplina", "módulo", "curso", "professor", "índice", "sumário", "material", "slide", "apostila", "item", "seção", "mencionado", "de acordo com o texto", "caso 1", "caso 2", "caso clínico X".
9. O aluno não tem acesso ao documento; o enunciado deve ser 100% autocontido no contexto médico/biológico real.
10. COMPATIBILIDADE QUIZ + FLASHCARD: escreva cada pergunta como questão aberta e respondível sem ver alternativas. É proibido usar 'assinale a alternativa', 'marque a opção', 'de acordo com os opções' ou qualquer referência a alternativas/opções. As quatro alternativas pertencem exclusivamente ao campo alternativas e jamais aparecem em pergunta.
11. ALTA QUALIDADE DOS DISTRATORES MÉDICOS:
    - Todas as 4 alternativas (1 correta e 3 distratores) devem pertencer rigorosamente ao mesmo universo anatomofisiológico ou clínico do tema.
    - É EXPRESSAMENTE PROIBIDO criar distratores ingênuos, caricatos ou absurdos (ex.: em questão sobre exame de líquor, NUNCA use 'eletroencefalograma' ou 'biópsia de nervo'; use alternativas e diagnósticos diferenciais reais do contexto neurológico).
    - As 4 alternativas devem ter extensão, formato e refinamento técnico homogêneos.
12. ANCORAGEM CLÍNICA NOS CASOS DO MATERIAL (REGRAS ANTI-DECOREBA):
    - Se o material contiver relatos de pacientes ou vinhetas clínicas, descreva os achados médicos relevantes diretamente no enunciado (ex.: "Um paciente apresenta perda progressiva do campo visual bitemporal...").
    - É EXPRESSAMENTE PROIBIDO perguntar a idade exata, o sexo, a profissão ou a numeração do caso isoladamente (ex.: NUNCA pergunte "Qual é a idade do paciente no Caso 2?", "Qual a profissão do paciente?"). A pergunta DEVE cobrar raciocínio médico (etiologia, fisiopatologia, diagnóstico diferencial, exame de escolha ou conduta).
    - É EXPRESSAMENTE PROIBIDO citar "no Caso 1", "no Caso 2" ou "no Caso X" no enunciado ou nas alternativas. O enunciado deve ser 100% autossuficiente e independente de rótulos do documento.
    - O campo secao_origem deve ser um tema anatômico ou clínico específico (ex.: 'Pares Cranianos e Sensibilidade Lingual', 'Hemorragia Subaracnóidea'), NUNCA títulos vazios de sumário como 'Fundamentos Etiopatogênicos'.
13. DISTRIBUIÇÃO DAS RESPOSTAS:
    - Varie a alternativa correta naturalmente entre A, B, C e D no array e no gabarito ao longo do lote gerado.
`;

class QuizzesService {
  /**
   * Extrai o texto clínico e parâmetros enviados no req.body
   */
  async generateQuestions(payload = {}) {
    // Captura o texto mais completo dentre qualquer campo que o frontend/cliente tenha enviado
    const candidates = [
      payload.materialText,
      payload.material_md,
      payload.materialMd,
      payload.conteudo_md,
      payload.conteudoMd,
      payload.markdownText,
      payload.text,
      payload.texto,
      payload.conteudo,
      payload.content,
      payload.corpo,
      payload.body
    ].filter(c => typeof c === 'string' && c.trim().length > 0);
    candidates.sort((a, b) => b.length - a.length);
    const materialText = candidates[0] || '';

    const quantidade = payload.quantidade || payload.amount || payload.total || 5;
    const requestedDifficulty = ['iniciante', 'intermediario', 'avancado'].includes(payload.difficulty)
      ? payload.difficulty
      : 'balanced';
    const generationMode = ['curated', 'science_based'].includes(payload.generationMode) ? payload.generationMode : 'sections';
    const sourcePrioritizedMode = ['curated', 'science_based'].includes(generationMode);
    const sectionOffset = Number.isSafeInteger(Number(payload.sectionOffset)) && Number(payload.sectionOffset) >= 0
      ? Number(payload.sectionOffset)
      : 0;
    const customInstructions = typeof payload.customInstructions === 'string' ? payload.customInstructions.trim() : '';
    const previousQuestions = Array.isArray(payload.previousQuestions) ? payload.previousQuestions.slice(0, 40) : [];
    const previousQuestionAnswers = Array.isArray(payload.previousQuestionAnswers)
      ? payload.previousQuestionAnswers.map(item => ({
        question: String(item?.question || '').replace(/\s+/g, ' ').trim(),
        answer: String(item?.answer || '').replace(/\s+/g, ' ').trim()
      })).filter(item => item.question || item.answer).slice(0, 40)
      : [];
    const providedSourceQuestions = Array.isArray(payload.sourceQuestions)
      ? payload.sourceQuestions.map(question => String(question || '').replace(/\s+/g, ' ').trim()).filter(question => question.length >= 20).slice(0, 12)
      : [];
    // Banco persistente da disciplina: questões autorais encontradas em todos
    // os materiais enviados, usado como referência de estilo e não como fonte
    // de fatos para o conteúdo novo.
    const disciplineQuestionBank = Array.isArray(payload.disciplineQuestionBank)
      ? payload.disciplineQuestionBank.map(question => String(question || '').replace(/\s+/g, ' ').trim()).filter(question => question.length >= 20).slice(0, 40)
      : [];
    const authoredSourceQuestions = providedSourceQuestions.length
      ? providedSourceQuestions
      : extractAuthoredQuestionsFromMaterial(materialText);

    console.log(generationMode === 'science_based'
      ? "➡️ [Quiz Engine] Iniciando geração Science Based..."
      : generationMode === 'curated'
        ? "➡️ [Quiz Engine] Iniciando geração por curadoria integral..."
        : "➡️ [Quiz Engine] Iniciando geração por seções...");
    console.log("📄 [Quiz Engine] Tamanho do texto recebido:", materialText ? materialText.length : 0);
    if (materialText) {
      console.log("🔍 [Quiz Engine] Início do texto recebido:", materialText.slice(0, 150).replace(/\s+/g, ' '));
    }
    console.log("📝 [Quiz Engine] Questões autorais identificadas:", authoredSourceQuestions.length);
    console.log("🏛️ [Quiz Engine] Amostras do banco da disciplina:", disciplineQuestionBank.length);
    console.log("📚 [Quiz Engine] Questões já existentes no deck:", previousQuestions.length);
    console.log("🧭 [Quiz Engine] Instruções personalizadas:", customInstructions ? `${customInstructions.length} caracteres` : 'não informadas');

    if (!materialText || materialText.trim().length < 20) {
      throw new Error("O texto fornecido para a IA está vazio ou é excessivamente curto.");
    }
    const parsedTotal = Number(quantidade);
    const requestedTotal = Number.isSafeInteger(parsedTotal) && parsedTotal > 0 ? parsedTotal : 5;
    const authoredQuestionsMissingFromDeck = authoredSourceQuestions.filter(sourceQuestion => !previousQuestions.some(existingQuestion =>
      areQuestionsTooSimilar(sourceQuestion, existingQuestion)
    ));
    // Nos modos que varrem o material integralmente, questões autorais que ainda
    // não estejam no deck têm prioridade, mesmo que superem o lote solicitado.
    const totalQuestoes = sourcePrioritizedMode
      ? Math.max(requestedTotal, authoredQuestionsMissingFromDeck.length)
      : requestedTotal;
    const difficultyPlan = buildDifficultyPlan(totalQuestoes, requestedDifficulty);
    const materialSections = splitMaterialIntoQuestionSections(materialText);
    const sectionPlan = buildSectionQuestionPlan(materialSections, totalQuestoes, sectionOffset);
    const uniquePlannedSections = [...new Map(sectionPlan.map(section => [section.id, section])).values()];
    const sectionPlanInstructions = sectionPlan.map((section, index) =>
      `Questão ${index + 1}: ${section.label} (${section.id})`
    ).join('\n');
    const sectionedMaterialText = uniquePlannedSections.map(section =>
      `--- ${section.id}: ${section.label} ---\n${section.content}\n--- FIM ${section.id} ---`
    ).join('\n\n');
    const curatedCandidates = sourcePrioritizedMode
      ? collectCuratedMaterialExcerpts(materialText, 60)
      : [];
    const curatedAxisPlan = generationMode === 'curated'
      ? buildCuratedAxisPlan(totalQuestoes, curatedCandidates)
      : null;
    const curatedMaterialText = curatedCandidates.map((candidate, index) =>
      `--- TRECHO ${index + 1} • ${candidate.label} • eixo sugerido: ${candidate.axis} ---\n${candidate.excerpt}\n--- FIM TRECHO ${index + 1} ---`
    ).join('\n\n');
    console.log("🧩 [Quiz Engine] Seções/páginas identificadas:", materialSections.length);
    if (generationMode === 'sections') {
      console.log("🔁 [Quiz Engine] Plano de cobertura:", `${sectionPlan.length} questão(ões) em ciclo por seção/página, iniciando na posição ${sectionOffset + 1}.`);
    }
    if (sourcePrioritizedMode) {
      console.log(generationMode === 'science_based' ? "🧪 [Quiz Engine] Science Based ativado:" : "🧠 [Quiz Engine] Curadoria integral ativada:", {
        trechosColetados: curatedCandidates.length,
        ...(curatedAxisPlan ? {
          base: curatedAxisPlan.base,
          reconhecimento: curatedAxisPlan.reconhecimento,
          tratamento: curatedAxisPlan.tratamento
        } : { progressao: 'fundamentos → relações/mecanismos → reconhecimento/aplicação' })
      });
    }

    const genAI = getGenAI();
    // Um único caminho de configuração: se não houver modelo exclusivo de quiz,
    // usa os modelos já validados no .env, sem cair em nome fixo desatualizado.
    const quizModel = process.env.MODEL_QUIZ || process.env.MODEL_BALANCED || process.env.MODEL_FAST || 'gemini-3.5-flash';
    const model = genAI.getGenerativeModel({
      model: quizModel,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        responseMimeType: "application/json",
        responseSchema: questionsSchema,
      }
    });

    const difficultyInstructions = requestedDifficulty === 'balanced'
      ? `Use exatamente esta sequência de níveis, uma questão por posição: ${difficultyPlan.map((level, index) => `${index + 1}:${level}`).join(', ')}.`
      : `Todas as ${totalQuestoes} questões devem ser exatamente do nível "${requestedDifficulty}".`;

    const curatedModeInstructions = generationMode === 'curated' ? `
MODO CURADORIA INTEGRAL ATIVO:
O arquivo inteiro foi varrido antes desta etapa e os ${curatedCandidates.length} trechos candidatos abaixo foram coletados de forma distribuída por todas as páginas/seções. Primeiro compare todos eles e escolha os conceitos de maior rendimento; não use a ordem dos trechos como critério de importância.

DISTRIBUIÇÃO OBRIGATÓRIA DO LOTE:
- ${curatedAxisPlan.base} questão(ões) de BASE: estruturas importantes, localização, constituintes internos, relações anatômicas ou função elementar.
- ${curatedAxisPlan.reconhecimento} questão(ões) de RECONHECIMENTO: identificação de patologia/estrutura, comportamento do paciente, sinais, achados, estruturas ou componentes acometidos.
${curatedAxisPlan.treatmentAvailable ? `- ${curatedAxisPlan.tratamento} questão(ões) de TRATAMENTO: medicamento, exame de identificação, cirurgia ou procedimento SOMENTE se estiver explícito nos trechos.` : '- Não gere questões de tratamento: o material não apresentou conteúdo terapêutico explícito.'}
Registre o eixo correspondente em eixo_aprendizagem. Não invente tratamento para preencher proporção.

QUESTÕES AUTORAIS DA FONTE:
Cada questão autoral abaixo ainda não existe semanticamente no deck e, portanto, é prioritária. Reescreva-a como pergunta aberta e autocontida; se ela cobrar dois ou mais conceitos independentes, divida-a em mais de uma questão atômica. Marque origem_pergunta como "reaproveitada_da_fonte". Não deixe nenhuma de fora, salvo se sua informação já estiver coberta por outra pergunta do mesmo lote.
` : '';

    const scienceBasedInstructions = generationMode === 'science_based' ? `
MODO SCIENCE BASED ATIVO:
O texto integral foi varrido e os trechos abaixo foram amostrados ao longo das seções/páginas. Construa questões para recuperação ativa e aprendizagem duradoura em uma progressão coerente, sem impor proporções numéricas fixas:
1. Comece pelos conhecimentos prévios necessários: estruturas, localização, componentes, definições e funções explicitamente ensinados.
2. Avance para relações explicativas do próprio texto: estrutura-função, causa-efeito, mecanismos e comparações que conectem os fundamentos.
3. Depois use reconhecimento ou aplicação em contexto somente quando os achados, exemplos ou casos estiverem descritos na fonte; não eleve a dificuldade só por adicionar uma vinheta.
4. Inclua tratamento, exames ou procedimentos apenas quando estiverem explicitamente ensinados e após cobrir fundamentos e mecanismos necessários.
Escolha um objetivo de aprendizagem por questão, cubra primeiro os objetivos centrais e pré-requisitos, distribua as questões entre temas distintos e aumente a complexidade gradualmente. Não force questões repetidas para preencher a quantidade pedida: retorne apenas questões sustentadas por conceitos distintos da fonte. Priorize questões autorais da fonte que ainda não estejam no deck e preserve sua intenção, marcando origem_pergunta como "reaproveitada_da_fonte".
` : '';

    const coverageInstructions = generationMode === 'curated'
      ? 'Selecione os trechos de maior valor pedagógico entre os candidatos curados; não concentre o lote em um único tema e respeite estritamente a distribuição de eixos abaixo.'
      : generationMode === 'science_based'
        ? 'Analise os objetivos dos trechos candidatos em conjunto, escolha conceitos diferentes e siga a progressão de aprendizagem Science Based. Evite cobrar repetidamente o mesmo fato com outra redação.'
        : `PLANO OBRIGATÓRIO DE COBERTURA:\n${sectionPlanInstructions}\nProduza exatamente uma questão para cada linha acima, na mesma ordem. Depois de cobrir cada seção/página disponível, retorne à primeira seção e use outro conceito explícito dela. Não concentre questões em uma única seção.`;

    const prompt = `
Crie ${totalQuestoes} questões de avaliação formativa a partir das seções/páginas do conteúdo médico abaixo.

${coverageInstructions}

${curatedModeInstructions}

${scienceBasedInstructions}

METODOLOGIA OBRIGATÓRIA:
1. Ignore cabeçalhos institucionais, sumários, numeração de páginas/slides, nomes de docentes ou títulos vazios.
2. Divida o conteúdo nas suas seções temáticas conceituais reais.
3. DIFICULDADE PEDIDA PELO ALUNO: ${difficultyInstructions}
   - Iniciante = um fato explícito e direto, sem vinheta ou decisão clínica.
   - Intermediário = uma relação simples causa→efeito, estrutura→função ou comparação direta, sem vinheta e sem conduta.
   - Avançado = aplicação limitada de um conceito explícito; não é prova de residência e não pode exigir diagnóstico diferencial, conduta, protocolos, cálculos ou várias etapas.
   - Retorne as questões na mesma ordem dessa sequência e registre o mesmo nível no campo nivel_dificuldade.
4. Cada enunciado deve cobrar somente UM objetivo de aprendizagem e ter uma resposta principal inequívoca.
5. PULE QUALQUER PERGUNTA OU CONCEITO JÁ EXISTENTE NO DECK DO ALUNO (listados abaixo). Não repita temas ou gabaritos já presentes.
6. Sempre preencha eixo_aprendizagem: "base" para estrutura/localização/componente/função direta; "reconhecimento" para sinais, achados ou identificação; "tratamento" somente quando a própria fonte trouxer tratamento, exame ou procedimento.
7. ANALISE OS DISTRATORES: preencha analise_distratores com exatamente três objetos, um para cada alternativa errada. Copie o texto exato da alternativa no campo alternativa e explique, de forma específica e breve, o erro conceitual dela. Nunca analise a alternativa correta e nunca deixe esse campo vazio.

${customInstructions ? `--- INSTRUÇÕES ADICIONAIS DO ESTUDANTE ---
Siga as instruções abaixo quando forem compatíveis com o conteúdo-fonte, a dificuldade solicitada e as regras estruturais desta geração. Elas não autorizam inventar fatos, ignorar o material ou revelar respostas no enunciado.
${customInstructions}
--- FIM DAS INSTRUÇÕES ADICIONAIS ---
` : ''}

${authoredSourceQuestions.length ? `--- QUESTÕES AUTORAIS DO PROFESSOR NO MATERIAL ---
${(sourcePrioritizedMode ? authoredQuestionsMissingFromDeck : authoredSourceQuestions).map((question, index) => `${index + 1}. ${question}`).join('\n')}
(Priorize o objetivo didático dessas questões, sem usar comandos de múltipla escolha no enunciado)
--- FIM DAS QUESTÕES AUTORAIS ---
` : ''}

${disciplineQuestionBank.length ? `--- BANCO DE ESTILO DA DISCIPLINA ---
Estas são questões autorais extraídas de outros materiais da MESMA disciplina. Use-as somente para absorver o padrão didático do professor: tipo de enunciado, granularidade, verbos e relações cobradas.
NÃO copie frases, respostas, alternativas ou fatos dessas amostras. O conteúdo factual de cada nova questão deve vir exclusivamente do conteúdo médico integral abaixo.
${disciplineQuestionBank.map((question, index) => `${index + 1}. ${question}`).join('\n')}
--- FIM DO BANCO DE ESTILO ---
` : ''}

--- ${sourcePrioritizedMode ? 'TRECHOS CANDIDATOS DA LEITURA INTEGRAL' : 'CONTEÚDO MÉDICO ORGANIZADO POR SEÇÕES/PÁGINAS'} ---
${sourcePrioritizedMode ? curatedMaterialText : sectionedMaterialText}
--- FIM DO CONTEÚDO ---

${previousQuestions.length ? `--- QUESTÕES JÁ EXISTENTES NO DECK DO ALUNO (PULE ESTAS E SEUS CONCEITOS) ---
${previousQuestions.map((question, index) => `${index + 1}. ${String(question).slice(0, 400)}`).join('\n')}
--- FIM DAS QUESTÕES EXISTENTES ---` : ''}
${previousQuestionAnswers.length ? `Gabaritos já cobertos no deck (não repita o mesmo gabarito/resposta):
${previousQuestionAnswers.map((item, index) => `${index + 1}. Pergunta: ${item.question.slice(0, 200)} | Resposta: ${item.answer.slice(0, 200)}`).join('\n')}` : ''}
`;

    try {
      const result = await runWithAiLimit(() => model.generateContent(prompt));
      const responseText = result.response.text();
      const questoes = JSON.parse(responseText);
      const questoesNormalizadas = (Array.isArray(questoes) ? questoes : []).map(question => ({
        ...question,
        pergunta: sanitizeSharedQuestionStem(question?.pergunta)
      })).filter(question => isSharedQuestionStemValid(question.pergunta));
      const letterToIndex = { A: 0, B: 1, C: 2, D: 3 };
      const getCorrectAnswer = question => {
        const correctIdx = letterToIndex[question?.gabarito] ?? 0;
        return question?.texto_resposta_correta || question?.alternativas?.[correctIdx] || '';
      };
      const questoesUnicas = questoesNormalizadas.filter((question, index, all) => {
        const current = question?.pergunta || '';
        const currentAnswer = getCorrectAnswer(question);
        const repeatsInBatch = all.slice(0, index).some(previous =>
          areQuestionsTooSimilar(current, previous?.pergunta || '', currentAnswer, getCorrectAnswer(previous))
        );
        const repeatsPreviousAnswer = previousQuestionAnswers.some(previous =>
          areQuestionsTooSimilar(current, previous.question, currentAnswer, previous.answer)
        );
        return !repeatsInBatch && !repeatsPreviousAnswer;
      });

      if (questoesUnicas.length === 0) {
        console.warn('⚠️ [Quiz Engine] Todas as questões sugeridas pela IA já constam no deck do aluno.');
        return [];
      }

      const formatadas = questoesUnicas.map((q, index) => {
        const correctIdx = letterToIndex[q.gabarito] ?? 0;
        const cleanAlternatives = Array.isArray(q.alternativas) ? q.alternativas : [];
        if (cleanAlternatives.length !== 4 || cleanAlternatives.some(option => !String(option || '').trim()) || correctIdx > 3) {
          return null;
        }
        const correctAnswer = q.texto_resposta_correta || cleanAlternatives[correctIdx] || '';
        const analysisByAlternative = new Map((Array.isArray(q.analise_distratores) ? q.analise_distratores : [])
          .map(entry => [String(entry?.alternativa || '').trim(), String(entry?.explicacao || '').trim()])
          .filter(([alternative, explanation]) => alternative && explanation));
        const rawDistractorAnalysis = {};
        cleanAlternatives.forEach((alternative, optionIndex) => {
          if (optionIndex === correctIdx) return;
          rawDistractorAnalysis[optionIndex] = analysisByAlternative.get(String(alternative).trim())
            || `Esta alternativa não corresponde ao conceito exigido. A justificativa correta é: ${String(q.justificativa || correctAnswer).trim()}`;
        });
        const flashcardTitle = buildSafeFlashcardTitle(q.titulo_flashcard, correctAnswer);
        // A etiqueta segue o plano solicitado, e não uma classificação livre
        // do modelo. Isso impede que "iniciante" seja salvo como avançado.
        const actualDifficulty = difficultyPlan[index] || requestedDifficulty || 'iniciante';

        // Embaralha as 4 alternativas para distribuir uniformemente o gabarito (A, B, C, D)
        const { shuffledOptions, newCorrectIndex, newGabarito } = shuffleQuestionAlternatives(cleanAlternatives, correctIdx);
        const remappedDistractorAnalysis = {};
        shuffledOptions.forEach((alternative, optionIndex) => {
          if (optionIndex === newCorrectIndex) return;
          const originalIndex = cleanAlternatives.indexOf(alternative);
          remappedDistractorAnalysis[optionIndex] = rawDistractorAnalysis[originalIndex]
            || `Esta alternativa não corresponde ao conceito exigido. A justificativa correta é: ${String(q.justificativa || correctAnswer).trim()}`;
        });
        const rawSection = q.secao_origem || '';
        const cleanTopic = sanitizeTopicName(rawSection, payload.targetSubject || payload.materialName || 'Clínica Médica');
        const cleanDisease = sanitizeTopicName(rawSection, payload.disease || payload.materialName || cleanTopic);

        return {
          id: `q_${Date.now()}_${index + 1}`,
          generatorModel: quizModel,
          generatorEngine: 'backend-gemini',
          question: q.pergunta,
          pergunta: q.pergunta,
          quizOptions: shuffledOptions,
          alternativas: shuffledOptions,
          options: shuffledOptions,
          gabarito: newGabarito,
          correctIndex: newCorrectIndex,
          correctAnswerText: correctAnswer,
          resposta_correta: correctAnswer,
          answer: correctAnswer,
          reference_answer: correctAnswer,
          justificativa: q.justificativa,
          explanation: q.justificativa,
          perola_clinica: q.perola_clinica,
          clinicalPearl: q.perola_clinica,
          tripartite: {
            correctReason: q.justificativa || correctAnswer,
            distractorAnalysis: remappedDistractorAnalysis,
            pearl: q.perola_clinica || ''
          },
          learningFocus: 'material_base',
          difficultyLevel: actualDifficulty,
          cognitiveLevel: actualDifficulty,
          cognitive_level: actualDifficulty,
          cognitiveDomain: actualDifficulty === 'avancado' ? 'aplicacao' : (actualDifficulty === 'intermediario' ? 'analise' : 'compreensao'),
          // A tag é reservada para questão efetivamente reaproveitada ou
          // inspirada numa pergunta autoral; a simples presença de exercícios
          // no PDF não marca todo o lote como se viesse deles.
          sourceQuestionOrigin: q.origem_pergunta || 'nova_a_partir_da_fonte',
          learningAxis: ['base', 'reconhecimento', 'tratamento'].includes(q.eixo_aprendizagem) ? q.eixo_aprendizagem : (sourcePrioritizedMode ? 'base' : ''),
          generationMode,
          topic: cleanTopic,
          disease: cleanDisease,
          sectionOrigin: rawSection || cleanTopic,
          flashcardTitle,
          flashcard: {
            title: flashcardTitle,
            front: q.pergunta,
            back: `${correctAnswer}\n\n💡 Ponto-chave: ${q.perola_clinica}`
          },
          quizStats: {
            attempts: 0,
            correct: 0,
            lastAnswered: null
          }
        };
      }).filter(Boolean);

      if (formatadas.length === 0) {
        throw new Error('A IA não retornou questões com quatro alternativas válidas.');
      }

      console.log(`✅ [Quiz Engine] ${formatadas.length} questões geradas com sucesso.`);
      return formatadas;

    } catch (error) {
      console.error("❌ [Quiz Engine] Falha na chamada da API Gemini:", error);
      throw error;
    }
  }

  submitAnswer(data) {
    return { success: true, received: data };
  }

  getFlashcards(subjectId) {
    throw new Error(`A leitura de flashcards é feita pelo armazenamento autenticado do estudante (disciplina: ${subjectId || 'não informada'}).`);
  }

  reviewFlashcard(data) {
    return { success: true, updated: data };
  }

  /**
   * Avalia a resposta discursiva digitada no flashcard usando o motor de menor custo (gemini-3.5-flash-lite).
   * Regras de pontuação (cada questão vale 1.0 ponto):
   * - Acurácia > 80%: 1.0 ponto (Completamente correta)
   * - Acurácia > 50% e <= 80%: 0.5 ponto (Parcialmente correta)
   * - Acurácia <= 50%: 0.0 pontos (Insuficiente)
   */
  async evaluateFlashcardAnswer({ question = '', referenceAnswer = '', keyConcepts = [], studentAnswer = '' } = {}) {
    if (!studentAnswer || !studentAnswer.trim()) {
      throw new Error('A resposta do estudante não pode estar vazia.');
    }

    const genAI = getGenAI();
    const modelName = process.env.MODEL_FAST || 'gemini-3.5-flash-lite';
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: "OBJECT",
          properties: {
            accuracy: { type: "INTEGER" },
            score: { type: "NUMBER" },
            status: { type: "STRING" },
            strengths: { type: "STRING" },
            gaps: { type: "STRING" },
            feedback: { type: "STRING" }
          },
          required: ["accuracy", "score", "status", "feedback"]
        }
      }
    });

    const prompt = `Você é um avaliador médico e preceptor clínico estrito e pedagógico.
Compare a resposta do estudante com a Resposta de Referência e os Conceitos-Chave esperados para o flashcard médico.

Pergunta / Caso Clínico: ${question}
Resposta de Referência: ${referenceAnswer}
Conceitos-Chave Esperados: ${Array.isArray(keyConcepts) ? keyConcepts.join(', ') : keyConcepts}
Resposta do Estudante: "${studentAnswer}"

Avalie a precisão clínica e conceitual da resposta do estudante atribuindo uma porcentagem de acerto de 0 a 100%.

REGRAS OBRIGATÓRIAS DE PONTUAÇÃO (Cada questão vale 1.0 ponto):
- Acima de 80% (> 80%): Resposta completamente correta. Pontuação = 1.0 ponto.
- Acima de 50% até 80% (> 50% e <= 80%): Resposta parcialmente correta. Pontuação = 0.5 ponto.
- 50% ou menos (<= 50%): Resposta insuficiente ou incorreta. Pontuação = 0.0 pontos.

Retorne EXCLUSIVAMENTE um objeto JSON contendo:
- "accuracy": número inteiro de 0 a 100 representando a porcentagem de acerto.
- "score": número (1.0, 0.5 ou 0.0) correspondente à regra de pontuação.
- "status": string ("completamente_correta", "parcialmente_correta" ou "insuficiente").
- "strengths": texto destacando os acertos conceituais do estudante.
- "gaps": texto apontando o que faltou ou erros.
- "feedback": síntese pedagógica encorajadora e orientações clínicas.`;

    try {
      const res = await runWithAiLimit(() => model.generateContent(prompt));
      const rawText = res.response.text();
      let parsed = null;

      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        // Tenta sanitizar JSON se houver caracteres residuais
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const sanitized = jsonMatch[0]
              .replace(/,\s*([}\]])/g, '$1')
              .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
            parsed = JSON.parse(sanitized);
          } catch (e2) {
            console.warn('⚠️ [Quiz Engine] Fallback no parse de JSON da avaliação:', e2.message);
          }
        }
      }

      if (!parsed || typeof parsed !== 'object') {
        const expectedTerms = Array.isArray(keyConcepts) && keyConcepts.length > 0
          ? keyConcepts
          : String(referenceAnswer).split(/[,;.\s]+/).filter(w => w.length >= 4);
        const lowerStudent = studentAnswer.toLowerCase();
        const matched = expectedTerms.filter(t => lowerStudent.includes(String(t).toLowerCase()));
        const calcAccuracy = expectedTerms.length > 0
          ? Math.round((matched.length / expectedTerms.length) * 100)
          : 60;
        parsed = {
          accuracy: calcAccuracy,
          score: calcAccuracy > 80 ? 1.0 : (calcAccuracy > 50 ? 0.5 : 0.0),
          status: calcAccuracy > 80 ? 'completamente_correta' : (calcAccuracy > 50 ? 'parcialmente_correta' : 'insuficiente'),
          strengths: matched.length > 0 ? `Termos identificados: ${matched.join(', ')}` : 'Resposta recebida.',
          gaps: matched.length < expectedTerms.length ? 'Aprofunde os conceitos da referência.' : 'Sem lacunas críticas.',
          feedback: 'Avaliação de correspondência conceitual concluída.'
        };
      }

      let accuracy = Math.min(100, Math.max(0, parseInt(parsed.accuracy, 10) || 0));
      let score = 0.0;
      let status = 'insuficiente';

      // Aplicação estrita das regras definidas pelo usuário
      if (accuracy > 80) {
        score = 1.0;
        status = 'completamente_correta';
      } else if (accuracy > 50) {
        score = 0.5;
        status = 'parcialmente_correta';
      } else {
        score = 0.0;
        status = 'insuficiente';
      }

      return {
        success: true,
        accuracy,
        score,
        maxScore: 1.0,
        status,
        statusLabel: score === 1.0 ? 'Completamente Correta (1,0 pt)' : (score === 0.5 ? 'Parcialmente Correta (0,5 pt)' : 'Insuficiente (0,0 pt)'),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.join(' ') : (parsed.strengths || 'Conceitos abordados corretamente.'),
        gaps: Array.isArray(parsed.gaps) ? parsed.gaps.join(' ') : (parsed.gaps || 'Sem lacunas significativas.'),
        feedback: parsed.feedback || 'Avaliação concluída.',
        model: modelName
      };
    } catch (err) {
      console.error('❌ [Quiz Engine] Erro ao avaliar resposta do flashcard:', err.message);
      throw err;
    }
  }

  /**
   * Analisa e transforma material biomédico (apostilas, listas de exercícios, estudos dirigidos, gabaritos ou teoria).
   * Reconhece questões existentes (inclusive discursivas com gabarito/respostas) reaproveitando-as com fidelidade,
   * preserva questões existentes e transforma teoria em itens diretos e fiéis à fonte.
   */
  async analyzeMaterial(payload = {}) {
    const text = payload.text || payload.materialText || payload.conteudo || payload.content || '';
    const fileName = payload.fileName || payload.filename || 'Material de Estudo';
    const targetSubject = payload.targetSubject || payload.subject || 'Medicina';

    console.log(`➡️ [Quiz Engine - Analisar Material] Analisando "${fileName}" (${targetSubject}), tamanho: ${text.length} caracteres...`);

    if (!text || text.trim().length < 20) {
      throw new Error("O texto fornecido para análise está vazio ou é excessivamente curto.");
    }

    const cleanSample = text.slice(0, 30000);

    const genAI = getGenAI();
    const modelName = process.env.MODEL_FAST || 'gemini-3.5-flash-lite';
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: `Você é uma banca de avaliação formativa para estudantes de medicina.
Sua missão é analisar o conteúdo fornecido pelo estudante e convertê-lo em Quizzes e Flashcards diretos, estritamente fiéis à fonte.

DIRETRIZES OBRIGATÓRIAS:
1. IDENTIFICAÇÃO DO TIPO DE CONTEÚDO:
   - "questions_only": o material contém questões de prova ou estudo dirigido com perguntas e respostas/gabarito (ex: "1) Em qual espaço...? Resposta: ..."), mesmo sem alternativas A/B/C/D prévias.
   - "text_only": o material é composto exclusivamente por texto expositivo, conceitos, diretrizes ou notas teóricas sem exercícios.
   - "both": o material possui seções didáticas teóricas E blocos de questões ou exercícios com gabarito.

2. REAPROVEITAMENTO INTELIGENTE ("questions_only" ou "both"):
   - Quando houver perguntas no material (sejam de múltipla escolha ou discursivas de Estudo Dirigido/Gabarito): REAPROVEITE-AS INTEGRALMENTE!
   - Se houver caso clínico / vinheta descrita no material (ex: "Sebastião, 58 anos, sofreu trauma de crânio, pior cefaleia da vida, rigidez de nuca..."), PRESERVE E ATRIBUA essa vinheta às respectivas questões!
   - Cada questão deve ser convertida em um item de Quiz com exatamente 4 opções técnicas (A, B, C, D). A alternativa correta deve refletir fielmente o gabarito/resposta oficial do material, e as outras 3 devem ser distratores médicos verossímeis e instrutivos.
   - Forneça justificativa e ponto-chave de memorização usando apenas informações presentes na fonte.
   - Marque essas questões com "source": "reused".

3. TRANSFORMAÇÃO DE TEORIA DIDÁTICA ("text_only" ou "both"):
   - Para trechos teóricos, formule perguntas diretas sobre informações explícitas, como definições, partes, localização, função e relações descritas. Não invente situações, condutas ou dados externos.
   - Marque com "source": "generated_from_text".

4. RIGOR TERMINOLÓGICO ABSOLUTO:
   - JAMAIS confunda nomes de arquivo, cabeçalhos ou termos de metadados ("GABARITO", "E.D.", "ESTUDO DIRIGIDO", "SIMULADO", "PROVA", "APOSTILA") com nomes de doenças!
   - Identifique e defina o tema clínico real em "clinicalSubject" (ex: "Hemorragia Subaracnóidea", "Hipertensão Intracraniana", "Síndrome de Wallenberg", "Neuroanatomia do Líquor e Meninges").
   - Nunca crie frases como "paciente com sintomas característicos de GABARITO E.D".

5. ENUNCIADO COMPARTILHADO:
   - O campo question será usado igual no Quiz e na frente do Flashcard. Ele deve ser uma pergunta aberta, autocontida e respondível sem alternativas.
   - É proibido escrever “assinale a alternativa”, “marque a opção”, “de acordo com as opções” ou incluir opções no próprio enunciado.

6. COBERTURA ESTRUTURAL E TABELAS:
   - Distribua as questões de forma equilibrada ao longo de todo o documento (início, meio e fim), contemplando os diferentes tópicos (#, ##), critérios diagnósticos e tabelas comparativas presentes no material, evitando concentrar perguntas apenas no trecho inicial.`,
      generationConfig: {
        temperature: 0.15,
        responseMimeType: "application/json"
      }
    });

    const prompt = `Analise detalhadamente o material médico a seguir e estruture os Quizzes e Flashcards:
Arquivo: "${fileName}"
Disciplina Alvo: "${targetSubject}"

--- CONTEÚDO DO MATERIAL ---
${cleanSample}
--- FIM DO CONTEÚDO ---

Retorne ESTRITAMENTE um JSON estruturado com o seguinte esquema:
{
  "detectedType": "questions_only" | "text_only" | "both",
  "detectedTypeDescription": "descrição clara do material identificado",
  "clinicalSubject": "nome limpo da afecção clínica ou tópico biomédico real",
  "reusedQuestionsCount": número de questões reaproveitadas do material,
  "generatedFromTextCount": número de questões inéditas formuladas a partir do texto,
  "items": [
    {
      "source": "reused" | "generated_from_text",
      "vignette": "vinheta clínica ou caso de estudo (se presente)",
      "question": "pergunta aberta, autocontida e respondível sem alternativas",
      "options": ["Opção A", "Opção B", "Opção C", "Opção D"],
      "correctIndex": número (0, 1, 2 ou 3),
      "explanation": "explicação baseada exclusivamente no conteúdo fornecido",
      "pearl": "ponto-chave de memorização baseado exclusivamente no conteúdo fornecido",
      "flashcardFront": "pergunta conceitual de alta retenção para a frente do flashcard",
      "flashcardBack": "resposta sintetizada e memorável para o verso do flashcard",
      "difficulty": "iniciante" | "intermediario" | "avancado"
    }
  ]
}`;

    try {
      const result = await runWithAiLimit(() => model.generateContent(prompt));
      const responseText = result.response.text();
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (parseErr) {
        const cleaned = responseText
          .replace(/```json\s*/gi, '')
          .replace(/```\s*$/gi, '')
          .replace(/,\s*([}\]])/g, '$1')
          .trim();
        parsed = JSON.parse(cleaned);
      }

      let reusedCount = 0;
      let genCount = 0;
      const cleanItems = (Array.isArray(parsed.items) ? parsed.items : []).map((item, index) => {
        const isReused = item.source === 'reused';
        if (isReused) reusedCount++; else genCount++;

        let opts = Array.isArray(item.options) && item.options.length >= 2 
          ? item.options 
          : ['Opção A', 'Opção B', 'Opção C', 'Opção D'];
        
        let cIdx = typeof item.correctIndex === 'number' && item.correctIndex >= 0 && item.correctIndex < opts.length 
          ? item.correctIndex 
          : 0;

        const sharedStem = sanitizeSharedQuestionStem(item.question || `Questão ${index + 1} sobre ${parsed.clinicalSubject || targetSubject}`);
        if (!isSharedQuestionStemValid(sharedStem)) return null;
        return {
          source: isReused ? 'reused' : 'generated_from_text',
          vignette: item.vignette || '',
          question: sharedStem,
          options: opts,
          correctIndex: cIdx,
          correctAnswerText: opts[cIdx] || '',
          explanation: item.explanation || 'Conforme o conteúdo fornecido.',
          pearl: item.pearl || '',
          learningFocus: 'material_base',
          flashcardFront: sharedStem,
          flashcardBack: item.flashcardBack || opts[cIdx] || item.explanation,
          difficulty: ['iniciante', 'intermediario', 'avancado'].includes(item.difficulty) ? item.difficulty : 'iniciante'
        };
      }).filter(Boolean);

      console.log(`✅ [Quiz Engine - Analisar Material] Sucesso: Tipo "${parsed.detectedType}", ${reusedCount} reaproveitadas, ${genCount} geradas.`);

      return {
        success: true,
        detectedType: parsed.detectedType || (reusedCount > 0 ? 'questions_only' : 'text_only'),
        detectedTypeDescription: parsed.detectedTypeDescription || '',
        clinicalSubject: parsed.clinicalSubject || targetSubject,
        reusedQuestionsCount: reusedCount,
        generatedFromTextCount: genCount,
        items: cleanItems
      };
    } catch (err) {
      console.error("❌ [Quiz Engine - Analisar Material] Falha na análise com IA:", err.message);
      throw err;
    }
  }

  /**
   * Gera uma nova pergunta derivada incorporando a explicação base e os novos contextos do estudante.
   */
  async generateDerivedQuestion({ originalQuestion, originalExplanation, contexts = [], subject = 'Clínica Médica', topic = '' }) {
    const cleanQuestion = String(originalQuestion || '').trim();
    const cleanExplanation = String(originalExplanation || '').trim();
    const validContexts = (Array.isArray(contexts) ? contexts : [contexts]).map(c => String(c || '').trim()).filter(Boolean);

    if (!cleanQuestion && !cleanExplanation) {
      throw new Error('Pergunta ou explicação de referência não fornecida.');
    }
    if (validContexts.length === 0) {
      throw new Error('Informe ao menos um novo contexto para a geração da pergunta derivada.');
    }

    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: process.env.MODEL_REASONING || "gemini-3.5-flash-lite",
      generationConfig: {
        temperature: 0.3,
        topP: 0.9,
        responseMimeType: "application/json"
      }
    });

    const prompt = `Você é um preceptor médico sênior da MedTutor Brasil e elaborador de exames de residência médica.
Sua missão é criar UMA NOVA QUESTÃO DERIVADA (caso clínico inédito de múltipla escolha + flashcard) fundamentada na explicação/conceito biológico original e incorporando OBRIGATORIAMENTE os novos contextos clínicos fornecidos pelo estudante de medicina.

QUESTÃO ORIGINAL DE REFERÊNCIA:
${cleanQuestion}

EXPLICAÇÃO DE BASE / GABARITO:
${cleanExplanation}

NOVOS CONTEXTOS CLÍNICOS E VARIANTES ADICIONADOS PELO ESTUDANTE:
${validContexts.map((ctx, idx) => `[Novo Contexto #${idx + 1}]: ${ctx}`).join('\n')}

DIRETRIZES DE ESCRITA:
1. Formule uma vinheta clínica realista integrando os novos contextos trazidos pelo aluno com o mecanismo fisiopatológico de base.
2. Crie 4 alternativas de múltipla escolha (A, B, C, D) com distratores plausíveis e APENAS 1 alternativa correta.
3. Elabore a justificativa com: por que a resposta correta está certa, análise dos distratores errados e uma pérola clínica ("take-home message").
4. Elabore o título e o formato de Flashcard para revisão espaçada.

Retorne EXCLUSIVAMENTE um JSON no seguinte formato:
{
  "question": "Enunciado da nova questão baseada nos novos contextos...",
  "vignette": "Vinheta do caso clínico...",
  "quizOptions": ["Opção A", "Opção B", "Opção C", "Opção D"],
  "correctIndex": 0,
  "explanation": "Mecanismo central em 1-2 frases...",
  "tripartite": {
    "correctReason": "Explicação detalhada da alternativa correta...",
    "distractorAnalysis": {
      "0": "Por que A está errada ou certa",
      "1": "Por que B está errada ou certa",
      "2": "Por que C está errada ou certa",
      "3": "Por que D está errada ou certa"
    },
    "pearl": "Pérola clínica de plantão..."
  },
  "flashcardTitle": "Título do tema",
  "flashcardFront": "Pergunta em formato Flashcard",
  "flashcardBack": "Resposta do Flashcard"
}`;

    try {
      const result = await runWithAiLimit(() => model.generateContent(prompt));
      const rawText = result.response.text();
      let parsed = {};
      try {
        parsed = JSON.parse(rawText);
      } catch (e) {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      }

      const correctIdx = typeof parsed.correctIndex === 'number' ? parsed.correctIndex : 0;
      const options = Array.isArray(parsed.quizOptions) && parsed.quizOptions.length === 4 ? parsed.quizOptions : [
        'Conduta diagnóstica de primeira escolha',
        'Exame complementar de alta sensibilidade',
        'Manejo terapêutico farmacológico inicial',
        'Acompanhamento e estratificação de risco'
      ];

      const generatedQuestion = {
        id: `deriv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        subject: subject || 'Clínica Médica',
        topic: parsed.flashcardTitle || topic || 'Pergunta Derivada com Contexto',
        flashcardTitle: parsed.flashcardTitle || topic || 'Pergunta Derivada',
        question: parsed.question || 'Qual a conduta adequada perante os novos achados clínicos?',
        vignette: parsed.vignette || '',
        quizOptions: options,
        correctIndex: correctIdx,
        answer: options[correctIdx] || '',
        explanation: parsed.explanation || 'Resolução fundamentada na integração do caso clínico com os novos contextos.',
        tripartite: parsed.tripartite || {
          correctReason: parsed.explanation || 'Opção alinhada às diretrizes.',
          distractorAnalysis: {},
          pearl: 'A integração de múltiplos dados de anamnese e exames reduz erros de diagnóstico.'
        },
        flashcard: {
          front: parsed.flashcardFront || parsed.question || 'Qual o diagnóstico/conduta no caso?',
          back: parsed.flashcardBack || options[correctIdx] || 'Resposta de referência.'
        },
        derivedFromQuestionId: cleanQuestion,
        addedContexts: validContexts,
        generatorModel: 'gemini-3.5-flash-lite',
        createdAt: new Date().toISOString()
      };

      return {
        success: true,
        question: generatedQuestion
      };
    } catch (err) {
      console.error("❌ Erro ao gerar pergunta derivada com IA:", err);
      throw err;
    }
  }
}

module.exports = new QuizzesService();
