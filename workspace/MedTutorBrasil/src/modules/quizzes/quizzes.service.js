const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

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
  description: "Lista de questões de residência médica",
  items: {
    type: SchemaType.OBJECT,
    properties: {
      pergunta: {
        type: SchemaType.STRING,
        description: "Enunciado focado em caso clínico ou correlação anátomo-funcional direta. Nunca cite o texto, índice ou apostila."
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
        description: "Explicação fisiopatológica e anatômica completa"
      },
      perola_clinica: {
        type: SchemaType.STRING,
        description: "Regra prática de memorização ou conduta clínica"
      }
    },
    required: [
      "pergunta",
      "alternativas",
      "gabarito",
      "texto_resposta_correta",
      "justificativa",
      "perola_clinica"
    ]
  }
};

const SYSTEM_INSTRUCTION = `
Você é a banca oficial de elaboração de provas para Residência Médica (ENARE / Revalida).
Seu objetivo é redigir questões estritamente sobre a prática médica e anatomoclínica.

DIRETRIZES FUNDAMENTAIS:
1. JAMAIS trate termos anatômicos, disciplinas ou tópicos como doenças (ex.: nunca escreva "paciente com diagnóstico de Tronco Encefálico").
2. Sempre elabore casos clínicos clássicos com base no conteúdo (ex.: AVCs isquêmicos de PICA/AICA/Basilar, Síndromes de Wallenberg/Weber/Dejerine, paralisias de nervos cranianos ou hidrocefalia).
3. PROIBIDO usar palavras como: "índice", "sumário", "material", "slide", "apostila", "item", "seção", "mencionado", "de acordo com o texto".
4. O aluno não tem acesso ao documento; o enunciado deve ser 100% autocontido.
`;

class QuizzesService {
  /**
   * Extrai o texto clínico e parâmetros enviados no req.body
   */
  async generateQuestions(payload = {}) {
    // Captura o texto independentemente do nome do campo enviado pelo frontend
    const materialText = payload.materialText || payload.text || payload.conteudo || payload.content || '';
    const quantidade = payload.quantidade || payload.amount || payload.total || 5;

    console.log("➡️ [Quiz Engine] Iniciando geração...");
    console.log("📄 [Quiz Engine] Tamanho do texto recebido:", materialText ? materialText.length : 0);

    if (!materialText || materialText.trim().length < 20) {
      throw new Error("O texto fornecido para a IA está vazio ou é excessivamente curto.");
    }

    const totalQuestoes = Math.min(Math.max(Number(quantidade) || 5, 1), 30);

    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: process.env.MODEL_FAST || "gemini-3.5-flash-lite",
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        responseMimeType: "application/json",
        responseSchema: questionsSchema,
      }
    });

    const prompt = `
Com base nas estruturas anatômicas, vias neurais, síndromes e vascularização presentes abaixo, crie ${totalQuestoes} questões clínicas de padrão ENARE/Residência Médica:

--- CONTEÚDO MÉDICO ---
${materialText}
--- FIM DO CONTEÚDO ---

Regras: Crie casos clínicos ou correlações diretas. Não mencione o texto nem termos de índice. Não trate anatomia como se fosse nome de doença.
`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const questoes = JSON.parse(responseText);

      const letterToIndex = { A: 0, B: 1, C: 2, D: 3 };

      const formatadas = questoes.map((q, index) => {
        const correctIdx = letterToIndex[q.gabarito] ?? 0;
        const cleanAlternatives = Array.isArray(q.alternativas) ? q.alternativas : [];

        return {
          id: `q_${Date.now()}_${index + 1}`,
          question: q.pergunta,
          pergunta: q.pergunta,
          quizOptions: cleanAlternatives,
          alternativas: cleanAlternatives,
          gabarito: q.gabarito,
          correctIndex: correctIdx,
          correctAnswerText: q.texto_resposta_correta || cleanAlternatives[correctIdx] || '',
          resposta_correta: q.texto_resposta_correta || cleanAlternatives[correctIdx] || '',
          justificativa: q.justificativa,
          explanation: q.justificativa,
          perola_clinica: q.perola_clinica,
          clinicalPearl: q.perola_clinica,
          flashcard: {
            front: q.pergunta,
            back: `${q.texto_resposta_correta || cleanAlternatives[correctIdx]}\n\n💡 Pérola Clínica: ${q.perola_clinica}`
          },
          quizStats: {
            attempts: 0,
            correct: 0,
            lastAnswered: null
          }
        };
      });

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
      const res = await model.generateContent(prompt);
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
   * preserva vinhetas clínicas e transforma teoria em itens com padrão ENARE/Residência.
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
      systemInstruction: `Você é a banca oficial de Residência Médica (ENARE / Revalida / USP / SUS-SP).
Sua missão é analisar o material biomédico fornecido pelo estudante (caderno de questões, estudo dirigido com gabarito, apostila ou resumo didático) e convertê-lo em Quizzes e Flashcards de alta excelência pedagógica.

DIRETRIZES OBRIGATÓRIAS:
1. IDENTIFICAÇÃO DO TIPO DE CONTEÚDO:
   - "questions_only": o material contém questões de prova ou estudo dirigido com perguntas e respostas/gabarito (ex: "1) Em qual espaço...? Resposta: ..."), mesmo sem alternativas A/B/C/D prévias.
   - "text_only": o material é composto exclusivamente por texto expositivo, conceitos, diretrizes ou notas teóricas sem exercícios.
   - "both": o material possui seções didáticas teóricas E blocos de questões ou exercícios com gabarito.

2. REAPROVEITAMENTO INTELIGENTE ("questions_only" ou "both"):
   - Quando houver perguntas no material (sejam de múltipla escolha ou discursivas de Estudo Dirigido/Gabarito): REAPROVEITE-AS INTEGRALMENTE!
   - Se houver caso clínico / vinheta descrita no material (ex: "Sebastião, 58 anos, sofreu trauma de crânio, pior cefaleia da vida, rigidez de nuca..."), PRESERVE E ATRIBUA essa vinheta às respectivas questões!
   - Cada questão deve ser convertida em um item de Quiz com exatamente 4 opções técnicas (A, B, C, D). A alternativa correta deve refletir fielmente o gabarito/resposta oficial do material, e as outras 3 devem ser distratores médicos verossímeis e instrutivos.
   - Forneça justificativa anatomo-clínica completa, pérola clínica (clinical pearl) e um par de Flashcard com pergunta reflexiva na frente e resposta fundamentada no verso.
   - Marque essas questões com "source": "reused".

3. TRANSFORMAÇÃO DE TEORIA DIDÁTICA ("text_only" ou "both"):
   - Para trechos exclusivamente teóricos, elabore questões inéditas no padrão ENARE com vinheta clínica, 4 alternativas, gabarito justificado e flashcard.
   - Marque com "source": "generated_from_text".

4. RIGOR TERMINOLÓGICO ABSOLUTO:
   - JAMAIS confunda nomes de arquivo, cabeçalhos ou termos de metadados ("GABARITO", "E.D.", "ESTUDO DIRIGIDO", "SIMULADO", "PROVA", "APOSTILA") com nomes de doenças!
   - Identifique e defina o tema clínico real em "clinicalSubject" (ex: "Hemorragia Subaracnóidea", "Hipertensão Intracraniana", "Síndrome de Wallenberg", "Neuroanatomia do Líquor e Meninges").
   - Nunca crie frases como "paciente com sintomas característicos de GABARITO E.D".`,
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
      "question": "enunciado da questão",
      "options": ["Opção A", "Opção B", "Opção C", "Opção D"],
      "correctIndex": número (0, 1, 2 ou 3),
      "explanation": "explicação fisiopatológica e justificativa da alternativa correta",
      "pearl": "regra de ouro ou pérola de conduta clínica",
      "flashcardFront": "pergunta conceitual de alta retenção para a frente do flashcard",
      "flashcardBack": "resposta sintetizada e memorável para o verso do flashcard",
      "difficulty": "iniciante" | "intermediario" | "avancado"
    }
  ]
}`;

    try {
      const result = await model.generateContent(prompt);
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

        return {
          source: isReused ? 'reused' : 'generated_from_text',
          vignette: item.vignette || '',
          question: item.question || `Questão ${index + 1} sobre ${parsed.clinicalSubject || targetSubject}`,
          options: opts,
          correctIndex: cIdx,
          correctAnswerText: opts[cIdx] || '',
          explanation: item.explanation || 'Conforme diretrizes clínicas e material didático.',
          pearl: item.pearl || '',
          flashcardFront: item.flashcardFront || item.question,
          flashcardBack: item.flashcardBack || opts[cIdx] || item.explanation,
          difficulty: item.difficulty || 'intermediario'
        };
      });

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