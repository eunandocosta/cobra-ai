const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { runWithAiLimit } = require('../../shared/ai-limiter');

const MAX_MATERIAL_CHARS = 120_000;

function questionTokenSet(value) {
  return new Set(String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(token => token.length >= 4 && !['qual', 'sobre', 'para', 'como', 'essa', 'este', 'com', 'uma', 'entre'].includes(token)));
}

function areQuestionsTooSimilar(first, second) {
  const a = questionTokenSet(first);
  const b = questionTokenSet(second);
  if (!a.size || !b.size) return false;
  const intersection = [...a].filter(token => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size >= 0.45;
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
  // A resposta pode ser breve (por exemplo, apenas o nome de uma estrutura) em
  // um card e explicada por extenso em outro. Cobrir quase todos os termos da
  // menor resposta indica o mesmo gabarito, mesmo com enunciados diferentes.
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
  description: "Lista de questões formativas ancoradas no conteúdo enviado",
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
      "origem_pergunta"
    ]
  }
};

const SYSTEM_INSTRUCTION = `
Você cria questões formativas para estudantes de medicina estritamente baseadas no conteúdo enviado.

DIRETRIZES FUNDAMENTAIS:
1. FOCO EXCLUSIVAMENTE BIOMÉDICO: A pergunta deve cobrar raciocínio clínico, anatomia, fisiopatologia, semiologia, critérios diagnósticos, condutas ou farmacologia. NUNCA faça meta-perguntas sobre o documento, a aula, a disciplina, o módulo ou o professor (ex.: É EXPRESSAMENTE PROIBIDO perguntar "Qual é o tema principal da aula...", "Na disciplina de...", "De acordo com o material...").
2. Use somente fatos, relações e termos que estejam explícitos na fonte. Não complete lacunas com conhecimento externo, dados de prova, condutas ou casos inventados.
3. JAMAIS trate termos anatômicos, disciplinas ou tópicos como doenças (ex.: nunca escreva "paciente com diagnóstico de Tronco Encefálico").
4. Comece pelo entendimento direto do conteúdo. Use situação clínica somente se ela estiver descrita na fonte e o nível solicitado for avançado.
5. PROIBIDO usar no enunciado e nas alternativas termos como: "aula", "disciplina", "módulo", "curso", "professor", "índice", "sumário", "material", "slide", "apostila", "item", "seção", "mencionado", "de acordo com o texto".
6. O aluno não tem acesso ao documento; o enunciado deve ser 100% autocontido no contexto médico/biológico real.
7. COMPATIBILIDADE QUIZ + FLASHCARD: escreva cada pergunta como questão aberta e respondível sem ver alternativas. É proibido usar 'assinale a alternativa', 'marque a opção', 'de acordo com as opções' ou qualquer referência a alternativas/opções. As quatro alternativas pertencem exclusivamente ao campo alternativas e jamais aparecem em pergunta.
8. COBERTURA ESTRUTURAL DO MARKDOWN: Quando o material for extenso ou estruturado em títulos (#, ##), listas, tabelas comparativas ou critérios diagnósticos, distribua as questões de forma equilibrada por toda a extensão do documento (início, meio e fim). Não concentre as perguntas apenas nas seções iniciais. Explore ativamente relações, classificações e diferenciações descritas nas tabelas e seções conceituais distintas.
`;

class QuizzesService {
  /**
   * Extrai o texto clínico e parâmetros enviados no req.body
   */
  async generateQuestions(payload = {}) {
    // Captura o texto independentemente do nome do campo enviado pelo frontend
    const materialText = payload.materialText || payload.text || payload.conteudo || payload.content || '';
    const quantidade = payload.quantidade || payload.amount || payload.total || 5;
    const requestedDifficulty = ['iniciante', 'intermediario', 'avancado'].includes(payload.difficulty)
      ? payload.difficulty
      : 'iniciante';
    const previousQuestions = Array.isArray(payload.previousQuestions) ? payload.previousQuestions.slice(0, 30) : [];
    const previousQuestionAnswers = Array.isArray(payload.previousQuestionAnswers)
      ? payload.previousQuestionAnswers.map(item => ({
        question: String(item?.question || '').replace(/\s+/g, ' ').trim(),
        answer: String(item?.answer || '').replace(/\s+/g, ' ').trim()
      })).filter(item => item.question || item.answer).slice(0, 30)
      : [];
    const providedSourceQuestions = Array.isArray(payload.sourceQuestions)
      ? payload.sourceQuestions.map(question => String(question || '').replace(/\s+/g, ' ').trim()).filter(question => question.length >= 20).slice(0, 12)
      : [];
    const authoredSourceQuestions = providedSourceQuestions.length
      ? providedSourceQuestions
      : extractAuthoredQuestionsFromMaterial(materialText);

    const targetConcept = String(payload.targetConcept || payload.topic || '').trim();
    const focusExcerpt = String(payload.focusExcerpt || '').trim();

    console.log("➡️ [Quiz Engine] Iniciando geração...");
    console.log("📄 [Quiz Engine] Tamanho do texto recebido:", materialText ? materialText.length : 0);
    if (targetConcept) console.log("🎯 [Quiz Engine] Foco conceitual:", targetConcept);
    console.log("📝 [Quiz Engine] Questões autorais identificadas:", authoredSourceQuestions.length);

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
Com base exclusivamente no conteúdo abaixo, crie ${totalQuestoes} questões de avaliação formativa. Nível solicitado: ${requestedDifficulty}.
${targetConcept ? `\nFOCO CONCEITUAL PRIORITÁRIO: "${targetConcept}".\nFormule a questão aprofundando este conceito e suas bases anátomo-fisiopatológicas ou semiológicas contidas no material.` : ''}
${focusExcerpt ? `Trecho de referência no documento: "${focusExcerpt}"\n` : ''}
${authoredSourceQuestions.length ? `--- QUESTÕES JÁ CRIADAS PELO PROFESSOR NA FONTE ---
${authoredSourceQuestions.map((question, index) => `${index + 1}. ${question}`).join('\n')}
--- FIM DAS QUESTÕES AUTORAIS ---

Antes de redigir, analise essas questões autorais. Priorize reaproveitar seu objetivo e sua formulação quando a resposta estiver explícita no conteúdo: nesse caso, remova comandos de múltipla escolha e alternativas do enunciado e marque origem_pergunta como "reaproveitada_da_fonte". Se a questão autoral não trouxer base suficiente para uma resposta verificável, use apenas seu estilo e foco didático, marque "inspirada_na_fonte" e construa uma pergunta nova sustentada pela fonte. Nunca invente resposta, gabarito ou dado ausente para reaproveitar uma questão.
` : 'Não foram encontradas questões autorais claras na fonte; crie perguntas diretamente do conteúdo verificável e marque origem_pergunta como "nova_a_partir_da_fonte".\n'}

--- CONTEÚDO MÉDICO ---
${materialText}
--- FIM DO CONTEÚDO ---

Regras: selecione trechos diferentes e verificáveis do conteúdo para cada questão, distribuindo a seleção proporcionalmente por toda a extensão do material (início, meio e fim), contemplando diferentes tópicos de títulos (#, ##), critérios diagnósticos e tabelas comparativas presentes no Markdown. Em nível iniciante, cobre reconhecimento, definição, partes, localização, relação ou função que estejam escritos na fonte, em linguagem direta. Em nível intermediário, peça comparação ou relação que a própria fonte permita concluir (incluindo diferenciações entre colunas de tabelas ou critérios). Em nível avançado, aumente a integração sem inserir dados externos; uma situação clínica só é permitida se estiver presente na fonte. Não mencione o texto nem termos de índice. Não trate anatomia como se fosse nome de doença. A pergunta deve ser aberta e autocontida: o estudante precisa conseguir respondê-la no Flashcard sem ler opções. Nunca escreva no enunciado “assinale”, “alternativa”, “opção”, “marque” ou as próprias alternativas. Em titulo_flashcard, forneça um rótulo temático curto que contextualize a pergunta sem antecipar sua resposta; nunca use a resposta correta ou um dado que resolva a questão. A justificativa e o ponto-chave devem permanecer estritamente dentro da fonte.
${previousQuestions.length ? `Não repita nem reformule estas questões já aceitas:\n${previousQuestions.map((question, index) => `${index + 1}. ${String(question).slice(0, 500)}`).join('\n')}` : ''}
${previousQuestionAnswers.length ? `Também não reutilize o mesmo gabarito, ainda que o enunciado pareça diferente. Questões e respostas já aceitas:\n${previousQuestionAnswers.map((item, index) => `${index + 1}. Pergunta: ${item.question.slice(0, 260)} | Resposta: ${item.answer.slice(0, 260)}`).join('\n')}` : ''}
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
          areQuestionsTooSimilar(current, previous?.pergunta || '') || areAnswersTooSimilar(currentAnswer, getCorrectAnswer(previous))
        );
        const repeatsPreviousAnswer = previousQuestionAnswers.some(previous =>
          areQuestionsTooSimilar(current, previous.question) || areAnswersTooSimilar(currentAnswer, previous.answer)
        );
        return !repeatsInBatch && !repeatsPreviousAnswer;
      });
      if (questoesUnicas.length === 0) {
        throw new Error('A IA retornou questões redundantes ou sem enunciados válidos.');
      }

      const formatadas = questoesUnicas.map((q, index) => {
        const correctIdx = letterToIndex[q.gabarito] ?? 0;
        const cleanAlternatives = Array.isArray(q.alternativas) ? q.alternativas : [];
        if (cleanAlternatives.length !== 4 || cleanAlternatives.some(option => !String(option || '').trim()) || correctIdx > 3) {
          return null;
        }
        const correctAnswer = q.texto_resposta_correta || cleanAlternatives[correctIdx] || '';
        const flashcardTitle = buildSafeFlashcardTitle(q.titulo_flashcard, correctAnswer);

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
          justificativa: q.justificativa,
          explanation: q.justificativa,
          perola_clinica: q.perola_clinica,
          clinicalPearl: q.perola_clinica,
          learningFocus: 'material_base',
          difficultyLevel: requestedDifficulty,
          cognitiveLevel: requestedDifficulty,
          cognitiveDomain: 'compreensao',
          sourceQuestionOrigin: q.origem_pergunta || (authoredSourceQuestions.length ? 'inspirada_na_fonte' : 'nova_a_partir_da_fonte'),
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
        responseMimeType: 'application/json'
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

Retorne EXCLUSIVAMENTE um JSON com:
- "accuracy": número inteiro de 0 a 100 representando a porcentagem de acerto.
- "score": número (1.0, 0.5 ou 0.0) correspondente à regra de pontuação.
- "status": string ("completamente_correta", "parcialmente_correta" ou "insuficiente").
- "strengths": texto ou array curto destacando os acertos do estudante.
- "gaps": texto ou array curto apontando o que faltou ou erros.
- "feedback": síntese pedagógica encorajadora e orientações clínicas.`;

    try {
      const res = await runWithAiLimit(() => model.generateContent(prompt));
      const text = res.response.text();
      let parsed = JSON.parse(text);

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
      let parsed = JSON.parse(responseText);

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
