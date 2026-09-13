const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { runWithAiLimit } = require('../../shared/ai-limiter');

const MAX_MATERIAL_CHARS = 120_000;

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

// Muitos slides trazem exercícios elaborados pelo próprio professor. Eles são uma
// referência didática mais fiel que um tema solto: preservamos o foco e a redação
// quando a resposta puder ser comprovada no conteúdo, sem transformar alternativas
// ou comandos de múltipla escolha no enunciado compartilhado.
function extractAuthoredQuestionsFromMaterial(value, limit = 12) {
  const lines = String(value || '').replace(/\r/g, '').split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const questions = [];
  const startsQuestion = /^(?:(?:quest[aã]o|pergunta|exerc[ií]cio)\s*\d*\s*[:.)-]*|\d{1,3}\s*[.)-])\s*/i;
  const isContinuation = /^(?:[A-E]\s*[.)-]|(?:gabarito|resposta)\s*[:.)-])/i;

  for (let index = 0; index < lines.length && questions.length < limit; index++) {
    const line = lines[index];
    if (!startsQuestion.test(line) && !line.includes('?')) continue;

    let candidate = line;
    for (let next = index + 1; next < lines.length && next <= index + 5; next++) {
      const continuation = lines[next];
      if (startsQuestion.test(continuation)) break;
      if (!isContinuation.test(continuation) && candidate.includes('?')) break;
      candidate = `${candidate} ${continuation}`.slice(0, 700);
    }
    candidate = candidate.replace(/\s+/g, ' ').trim();
    if (candidate.length < 20 || (!candidate.includes('?') && !startsQuestion.test(candidate))) continue;
    if (!questions.some(existing => areQuestionsTooSimilar(existing, candidate))) questions.push(candidate);
  }
  // Alguns extratores de PDF entregam uma aula inteira em uma única linha. Nesse
  // caso, a interrogação ainda é um sinal útil para recuperar a questão original.
  const inlineQuestions = String(value || '').replace(/\s+/g, ' ').match(/[^?]{20,700}\?/g) || [];
  inlineQuestions.forEach(candidate => {
    const normalized = candidate.replace(/\s+/g, ' ').trim();
    if (questions.length < limit && !questions.some(existing => areQuestionsTooSimilar(existing, normalized))) {
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
        description: "Nível cognitivo da questão: iniciante (reconhecimento/definição direta), intermediario (fisiopatologia/relação/comparação) ou avancado (integração clínica/diagnóstico)"
      },
      secao_origem: {
        type: SchemaType.STRING,
        description: "Nome ou tema da seção temática do material da qual esta questão foi extraída"
      }
    },
    required: [
      "pergunta",
      "alternativas",
      "gabarito",
      "texto_resposta_correta",
      "justificativa",
      "perola_clinica",
      "titulo_flashcard",
      "origem_pergunta",
      "nivel_dificuldade",
      "secao_origem"
    ]
  }
};

const SYSTEM_INSTRUCTION = `
Você cria questões formativas para estudantes de medicina estritamente baseadas no conteúdo enviado.

DIRETRIZES FUNDAMENTAIS DE LEITURA E GERAÇÃO POR SEÇÕES:
1. LEITURA POR SEÇÕES TEMÁTICAS REAIS:
   - Divida o material nas suas seções temáticas conceituais reais (ex: Anatomia e Formação, Dinâmica Liquórica, Fisiopatologia, Apresentação Clínica/Semiologia, Diagnóstico e Conduta).
   - IGNORE categoricamente cabeçalhos de universidade, sumários, índices, numeração de páginas/slides, nomes de docentes, datas, referências bibliográficas ou títulos vazios.

2. ESCADA PEDAGÓGICA OBRIGATÓRIA POR SEÇÃO:
   Para CADA seção temática identificada no material:
   - Gere OBRIGATORIAMENTE ao menos 1 questão INICIANTE: cobra reconhecimento direto, definição anatômica/histológica, partes, localização ou função descrita na fonte de forma explícita.
   - Se a seção contiver mecanismos, relações causais ou diferenciações: gere TAMBÉM 1 questão INTERMEDIÁRIA: cobra fisiopatologia, relações causa-efeito, comparação entre estruturas/processos que a fonte permite concluir.
   - Se a seção contiver dados clínicos, gravidade, critérios propedêuticos ou condutas: gere TAMBÉM 1 questão AVANÇADA: cobra integração clínica, raciocínio diagnóstico ou conduta ancorada estritamente no texto.

3. PULAR QUESTÕES JÁ EXISTENTES NO DECK:
   - Se uma pergunta, conceito ou gabarito já constar nas questões já aceitas/existentes no deck do aluno, PULE-A SUMARIAMENTE e formule a questão sobre outro ponto da mesma seção ou da seção seguinte.
   - Nunca gere perguntas redundantes ou com o mesmo foco que as já existentes no deck.

4. FOCO EXCLUSIVAMENTE BIOMÉDICO: A pergunta deve cobrar raciocínio clínico, anatomia, fisiopatologia, semiologia, critérios diagnósticos, condutas ou farmacologia. NUNCA faça meta-perguntas sobre o documento, a aula, a disciplina, o módulo ou o professor (ex.: É EXPRESSAMENTE PROIBIDO perguntar "Qual é o tema principal da aula...", "Na disciplina de...", "De acordo com o material...").
5. Use somente fatos, relações e termos que estejam explícitos na fonte. Não complete lacunas com conhecimento externo, dados de prova, condutas ou casos inventados.
6. JAMAIS trate termos anatômicos, disciplinas ou tópicos como doenças (ex.: nunca escreva "paciente com diagnóstico de Tronco Encefálico").
7. Comece pelo entendimento direto do conteúdo. Use situação clínica somente se ela estiver descrita na fonte e o nível solicitado for avançado.
8. PROIBIDO usar no enunciado e nas alternativas termos como: "aula", "disciplina", "módulo", "curso", "professor", "índice", "sumário", "material", "slide", "apostila", "item", "seção", "mencionado", "de acordo com o texto".
9. O aluno não tem acesso ao documento; o enunciado deve ser 100% autocontido no contexto médico/biológico real.
10. COMPATIBILIDADE QUIZ + FLASHCARD: escreva cada pergunta como questão aberta e respondível sem ver alternativas. É proibido usar 'assinale a alternativa', 'marque a opção', 'de acordo com as opções' ou qualquer referência a alternativas/opções. As quatro alternativas pertencem exclusivamente ao campo alternativas e jamais aparecem em pergunta.
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
      : 'iniciante';
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
    const authoredSourceQuestions = providedSourceQuestions.length
      ? providedSourceQuestions
      : extractAuthoredQuestionsFromMaterial(materialText);

    console.log("➡️ [Quiz Engine] Iniciando geração por seções...");
    console.log("📄 [Quiz Engine] Tamanho do texto recebido:", materialText ? materialText.length : 0);
    if (materialText) {
      console.log("🔍 [Quiz Engine] Início do texto recebido:", materialText.slice(0, 150).replace(/\s+/g, ' '));
    }
    console.log("📝 [Quiz Engine] Questões autorais identificadas:", authoredSourceQuestions.length);
    console.log("📚 [Quiz Engine] Questões já existentes no deck:", previousQuestions.length);

    if (!materialText || materialText.trim().length < 20) {
      throw new Error("O texto fornecido para a IA está vazio ou é excessivamente curto.");
    }
    if (materialText.length > MAX_MATERIAL_CHARS) {
      throw new Error(`O texto excede o limite de ${MAX_MATERIAL_CHARS} caracteres.`);
    }

    const totalQuestoes = Math.min(Math.max(Number(quantidade) || 5, 1), 30);

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

    const prompt = `
Faça uma leitura integral por seções do conteúdo médico abaixo e crie ${totalQuestoes} questões de avaliação formativa.

METODOLOGIA OBRIGATÓRIA:
1. Ignore cabeçalhos institucionais, sumários, numeração de páginas/slides, nomes de docentes ou títulos vazios.
2. Divida o conteúdo nas suas seções temáticas conceituais reais.
3. Para CADA seção temática do material:
   - Crie ao menos 1 questão de nível "iniciante" (reconhecimento/anatomia/definição direta explícita).
   - Se a seção permitir aprofundar mecanismos fisiopatológicos ou comparações, crie também 1 questão de nível "intermediario".
   - Se a seção contiver elementos de raciocínio clínico, semiologia ou conduta, crie também 1 questão de nível "avancado".
4. DISTRIBUIÇÃO E PROPORÇÃO PEDAGÓGICA NO LOTE TOTAL DE ${totalQuestoes} QUESTÕES:
   - Distribua aproximadamente 40% Iniciante (fundamentos/definição/anatomia direta), 40% Intermediário (mecanismos fisiopatológicos/diagnóstico diferencial) e 20% Avançado (raciocínio clínico/semiologia aplicada/conduta).
   - Espalhe as questões harmonicamente ao longo de todas as seções do documento.
5. PULE QUALQUER PERGUNTA OU CONCEITO JÁ EXISTENTE NO DECK DO ALUNO (listados abaixo). Não repita temas ou gabaritos já presentes.

${authoredSourceQuestions.length ? `--- QUESTÕES AUTORAIS DO PROFESSOR NO MATERIAL ---
${authoredSourceQuestions.map((question, index) => `${index + 1}. ${question}`).join('\n')}
(Priorize o objetivo didático dessas questões, sem usar comandos de múltipla escolha no enunciado)
--- FIM DAS QUESTÕES AUTORAIS ---
` : ''}

--- CONTEÚDO MÉDICO INTEGRAL ---
${materialText}
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
        const flashcardTitle = buildSafeFlashcardTitle(q.titulo_flashcard, correctAnswer);
        const actualDifficulty = ['iniciante', 'intermediario', 'avancado'].includes(q.nivel_dificuldade)
          ? q.nivel_dificuldade
          : requestedDifficulty;
        const sectionTopic = q.secao_origem || 'Conceito da Seção';

        return {
          id: `q_${Date.now()}_${index + 1}`,
          generatorModel: quizModel,
          generatorEngine: 'backend-gemini',
          question: q.pergunta,
          pergunta: q.pergunta,
          quizOptions: cleanAlternatives,
          alternativas: cleanAlternatives,
          gabarito: q.gabarito,
          correctIndex: correctIdx,
          correctAnswerText: correctAnswer,
          resposta_correta: correctAnswer,
          answer: correctAnswer,
          reference_answer: correctAnswer,
          justificativa: q.justificativa,
          explanation: q.justificativa,
          perola_clinica: q.perola_clinica,
          clinicalPearl: q.perola_clinica,
          learningFocus: 'material_base',
          difficultyLevel: actualDifficulty,
          cognitiveLevel: actualDifficulty,
          cognitiveDomain: actualDifficulty === 'avancado' ? 'aplicacao' : (actualDifficulty === 'intermediario' ? 'analise' : 'compreensao'),
          sourceQuestionOrigin: q.origem_pergunta || (authoredSourceQuestions.length ? 'inspirada_na_fonte' : 'nova_a_partir_da_fonte'),
          topic: sectionTopic,
          disease: sectionTopic,
          sectionOrigin: sectionTopic,
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
    return [];
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
}

module.exports = new QuizzesService();
