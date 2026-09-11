const { GoogleGenerativeAI } = require('@google/generative-ai');
const { runWithAiLimit } = require('../../shared/ai-limiter');

const MAX_USER_PROMPTS_PER_SESSION = 100;
const MAX_MESSAGE_CHARS = 6_000;
const MAX_MATERIAL_CHARS = 120_000;

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ [ChatService] GEMINI_API_KEY não foi encontrada nas variáveis de ambiente!');
  }
  return new GoogleGenerativeAI(apiKey || '');
}

class ChatService {
  constructor({ sessionRepository = null } = {}) {
    this.repository = sessionRepository;
    // Fallback local caso não haja repositório injetado
    this.sessions = new Map();
  }

  limitHistory(history, maximumUserPrompts = MAX_USER_PROMPTS_PER_SESSION) {
    const userIndexes = history.reduce((indexes, item, index) => {
      if (item?.role === 'user') indexes.push(index);
      return indexes;
    }, []);
    if (userIndexes.length <= maximumUserPrompts) return history;
    return history.slice(userIndexes[userIndexes.length - maximumUserPrompts]);
  }

  // Sanitização simplificada focada em extrair palavras-chave médicas limpas
  extractMedicalKeywords(text) {
    if (!text) return '';
    const clean = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-zA-Z0-9\s]/g, ' ') // Remove pontuação
      .toLowerCase();

    const stopWords = new Set([
      'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'para', 'por', 'com',
      'como', 'qual', 'quais', 'que', 'sobre', 'aula', 'resumo', 'slide', 'pdf',
      'paciente', 'caso', 'duvida', 'explicar', 'o', 'a', 'os', 'as', 'um', 'uma'
    ]);

    const keywords = clean
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    return Array.from(new Set(keywords)).slice(0, 5).join(' ');
  }

  getEvidenceUrls(query, subject = 'Medicina') {
    const rawSearch = `${query} ${subject}`;
    const cleaned = this.extractMedicalKeywords(rawSearch) || 'clinical medicine';

    return {
      query: cleaned,
      urls: {
        pubmed: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(cleaned)}`,
        scielo: `https://search.scielo.org/?q=${encodeURIComponent(cleaned)}&lang=pt`,
        bvs: `https://pesquisa.bvsalud.org/portal/?q=${encodeURIComponent(cleaned)}`,
        cochrane: `https://www.cochranelibrary.com/search?q=${encodeURIComponent(cleaned)}`,
        elsevier: `https://www.sciencedirect.com/search?qs=${encodeURIComponent(cleaned)}`
      }
    };
  }

  async processMessage({ sessionId, message, materialContent, subject }) {
    if (!message || !message.trim()) {
      throw new Error('A mensagem do usuário não pode estar vazia.');
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      throw new Error(`A mensagem excede o limite de ${MAX_MESSAGE_CHARS} caracteres.`);
    }
    if (materialContent && materialContent.length > MAX_MATERIAL_CHARS) {
      throw new Error(`O material excede o limite de ${MAX_MATERIAL_CHARS} caracteres.`);
    }

    const sId = sessionId || `session_${Date.now()}`;
    const session = this.sessions.get(sId) || { id: sId, history: [] };
    session.history = this.limitHistory(session.history, MAX_USER_PROMPTS_PER_SESSION - 1);

    const isReport = /\b(relat[oó]rio|laudo|parecer|tratado|artigo formal)\b/i.test(message);
    const isBooklet = /\b(apostila\s+de\s+quest[oõ]es|caderno\s+de\s+quest[oõ]es|lista\s+de\s+quest[oõ]es|lista\s+de\s+exerc[ií]cios|exerc[ií]cios|perguntas|quizzes?|flashcards?|simulado|teste|caderno|apostila)\b/i.test(message) &&
      (/\b(ger[ea]|crie|elabore|fa[cç]a|monte|produza|construa|inclua|f[aá]ceis|dif[ií]ceis|casos?\s+cl[ií]nicos?|apostila|caderno|exerc[ií]cios|quest[oõ]es)\b/i.test(message));

    let systemInstruction = `
Você é o MedCopilot, tutor médico inteligente da plataforma MedTutor Brasil.
Seu objetivo principal é fazer o estudante COMPREENDER e recuperar o conteúdo: primeiro estrutura, localização, componentes e função; depois mecanismos, causa, alteração e consequência; por último, aplicação clínica. Conduta prática (PCDT/SUS e ENARE/Revalida) é uma aplicação importante, mas não deve substituir os fundamentos.

REGRAS DE CONDUTA:
1. SE HOUVER MATERIAL FORNECIDO: Suas respostas devem ser 100% ancoradas no conteúdo do material. Se a informação não constar no material, avise educadamente e explique o conceito com base nas diretrizes médicas canônicas.
2. DIDÁTICA: Quando a pergunta permitir uma explicação completa, use a progressão: (a) o que é/onde está/partes e função, (b) mecanismo e relação causa → alteração → consequência, (c) aplicação clínica. Direcione aproximadamente 65% da explicação aos fundamentos, 25% aos mecanismos e consequências e no máximo 10% a conduta/prova, salvo quando o estudante pedir explicitamente uma decisão clínica urgente.
3. DIRETO AO PONTO: Responda diretamente ao que o estudante perguntou, sem rodeios ou saudações excessivas.
4. PROIBIÇÃO ABSOLUTA DE DIAGRAMAS ASCII: É ESTRITAMENTE PROIBIDO desenhar esquemas usando texto, caixas ASCII ("+---+", "|", "--+--"), traços ou setas ("--->", "↓") para representar artérias, vias, lesões ou fluxogramas. Para sínteses anatômicas, relações e síndromes clínicas, utilize EXCLUSIVAMENTE Tabelas Markdown bem estruturadas (| Estrutura / Nível | Relação / Vias Acometidas | Prejuízo / Síndrome Clínica |). A documentação visual oficial será fornecida através de figuras médicas e esquemas anatômicos curados.
5. RETENÇÃO ATIVA: Quando fizer sentido, finalize com uma pergunta curta de evocação e uma "💡 Pérola de compreensão" que conecte estrutura, função e consequência. Use pérola de plantão/prova apenas como complemento clínico.
`;

    if (isBooklet) {
      systemInstruction += `
5. DIRETRIZ OBRIGATÓRIA DE APOSTILA / CADERNO DE QUESTÕES COM PROGRESSÃO GRADUAL:
O estudante solicitou expressamente a criação de uma APOSTILA / CADERNO DE QUESTÕES a partir do material de estudo.
Estruture a resposta com rigor pedagógico e progressão cognitiva em 5 MÓDULOS OBRIGATÓRIOS:

# APOSTILA DE QUESTÕES & AVALIAÇÃO FORMATIVA: [TÍTULO DO TEMA]

### MÓDULO 1: FIXAÇÃO BÁSICA E RECONHECIMENTO ANATÔMICO (NÍVEL FÁCIL)
Questões diretas de reconhecimento conceitual e anatômico ("o que é tal estrutura", "onde fica", limites e relações anatômicas essenciais).
- Inclua pelo menos 2 questões de múltipla escolha com opções no formato:
[ ] A) ...
[ ] B) ...
[ ] C) ...
[ ] D) ...
- Inclua 1 questão discursiva com linhas para escrita manual:
Linha 01: __________________________________________________
Linha 02: __________________________________________________
Linha 03: __________________________________________________

### MÓDULO 2: CORRELAÇÃO ANATOMOCLÍNICA E FISIOPATOLOGIA (NÍVEL INTERMEDIÁRIO)
Questões sobre mecanismos de lesão, vias de condução motora e sensitiva, correlações semiológicas e fisiopatologia abordada no material.
- Inclua pelo menos 2 questões de múltipla escolha com opções [ ] A), [ ] B), [ ] C), [ ] D).
- Inclua 1 questão discursiva/semiológica com linhas para escrita manual:
Linha 01: __________________________________________________
Linha 02: __________________________________________________
Linha 03: __________________________________________________

### MÓDULO 3: CASOS CLÍNICOS APROFUNDADOS & CONDUTA ENARE (NÍVEL AVANÇADO)
Casos clínicos complexos e desafiadores diretamente fundamentados no material anexado (vinheta clínica completa com história, exame físico, diagnóstico topográfico e conduta resolutiva SUS / ENARE).
- Inclua pelo menos 2 questões de múltipla escolha com vinheta e opções [ ] A), [ ] B), [ ] C), [ ] D).
- Inclua 1 questão discursiva de conduta resolutiva com linhas para resposta:
Linha 01: __________________________________________________
Linha 02: __________________________________________________
Linha 03: __________________________________________________

### MÓDULO 4: GABARITO COMENTADO & CRITÉRIOS DE CORREÇÃO
Apresente o gabarito detalhado de TODAS as questões dos módulos anteriores:
- Para cada questão de múltipla escolha: indique a alternativa correta (ex: "Questão 1: Alternativa A"), a justificativa fisiopatológica precisa e a análise detalhada de por que cada distrator está incorreto.
- Para as questões discursivas: apresente o espelho de resposta esperado e os critérios de pontuação.
- Pérola prática de retenção (💡 Pérola de Prova / ENARE).

### MÓDULO 5: FLASHCARDS DE REVISÃO ATIVA
Apresente de 4 a 6 flashcards essenciais no formato estrito:
- **Card 1 | Frente:** [Pergunta conceitual, anatômica ou clínica direta]
  **Verso:** [Resposta objetiva com pérola clínica de memorização]
`;
    } else if (isReport) {
      systemInstruction += `
5. DIRETRIZ OBRIGATÓRIA DE RELATÓRIO MÉDICO PARA EMISSÃO EM PDF (A4):
O usuário solicitou explicitamente um RELATÓRIO MÉDICO / ACADÊMICO que será emitido em PDF.
Estruture o documento de forma formal, completa e pronta para impressão/exportação em formato A4:
- Inicie com Título H1 (#) representativo do caso/tema.
- Apresente seções completas e detalhadas (H2: ##) nesta ordem: 1. Fundamentos: definição, localização e organização; 2. Componentes, relações e função; 3. Mecanismos; 4. Causa → alteração → consequência; 5. Recuperação ativa; 6. Aplicação clínica/semiologia; 7. Manejo apenas quando sustentado pela fonte; 8. Referências.
- Reserve aproximadamente 65% do texto aos fundamentos, 25% a mecanismos/consequências e no máximo 10% a manejo/prova, exceto quando o próprio material for predominantemente clínico.
- REGRA VISUAL E EDITORIAL RIGOROSA: É ESTRITAMENTE PROIBIDO desenhar esquemas usando texto, caixas ASCII, traços ou setas (como '|', '--+--', '↓' para representar artérias ou vias). Para sínteses conceituais, utilize EXCLUSIVAMENTE Tabelas Markdown com cabeçalhos bem delineados (| Estrutura | Função / Anastomose | Relevância Clínica |). A documentação visual oficial será integrada diretamente através de figuras médicas de alta definição.
`;
    }

    // Configura Gemini 3.5 Flash para agilidade na conversação
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      systemInstruction,
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        thinkingConfig: {
          thinkingBudget: 1024*1.5 // Pensamento rápido para raciocínio clínico sem travar a interface
        }
      }
    });

    // Inicia a sessão de chat mantendo o histórico de turnos anteriores
    const chat = model.startChat({
      history: session.history
    });

    // Anexa o material de estudo apenas se for a primeira mensagem ou se houver material novo
    let promptPayload = message;
    if (session.history.length === 0 && materialContent && materialContent.trim().length > 50) {
      promptPayload = `
<<<MATERIAL_DE_ESTUDO_ANEXADO>>>
${materialContent}
<<<FIM_DO_MATERIAL>>>

Dúvida do aluno: ${message}
`;
    }

    try {
      const result = await runWithAiLimit(() => chat.sendMessage(promptPayload));
      const replyText = result.response.text();

      // Atualiza o histórico no formato esperado pelo SDK do Gemini
      session.history.push({ role: 'user', parts: [{ text: message }] });
      session.history.push({ role: 'model', parts: [{ text: replyText }] });
      session.history = this.limitHistory(session.history);
      this.sessions.set(sId, session);

      const evidence = this.getEvidenceUrls(message, subject);

      // Busca e curadoria inteligente de imagem médica (Open-i NIH / ISIC Archive / Wikimedia)
      let medicalImage = null;
      let medicalImages = [];
      try {
        const imagensService = require('../imagens/imagens.service');
        if (isReport || imagensService.detectImageIntent(message, subject)) {
          const imgResult = await imagensService.getCuratedMedicalImage(message, subject, isReport);
          if (imgResult && imgResult.success) {
            medicalImage = imgResult.image;
            medicalImages = imgResult.images || (imgResult.image ? [imgResult.image] : []);
          }
        }
      } catch (imgErr) {
        console.warn('⚠️ [ChatService] Falha na curadoria de imagem médica:', imgErr.message);
      }

      return {
        sessionId: sId,
        reply: replyText,
        generatorEngine: 'backend-gemini',
        generatorModel: process.env.MODEL_CHAT || 'gemini-3.5-flash',
        evidence: evidence.urls,
        isReport,
        reportTitle: isReport ? this.extractReportTitle(message, subject) : null,
        pdfReady: isReport || isBooklet,
        isBooklet,
        bookletTitle: isBooklet ? this.extractBookletTitle(message, subject) : null,
        medicalImage,
        medicalImages
      };

    } catch (error) {
      console.error('❌ [ChatService] Erro ao comunicar com Gemini:', error);
      throw new Error(`Falha no processamento do MedCopilot: ${error.message}`);
    }
  }

  extractBookletTitle(message, subject = 'Medicina') {
    const clean = String(message || '')
      .replace(/^(fa[çc]a|gere|emita|crie|quero|monte|elabore|escreva|redija)\s+(um|uma)?\s*(apostila|caderno|lista|banco)\s*(de\s+quest[oõ]es|de\s+exerc[ií]cios)?\s*(de|da|do|sobre)?\s*/i, '')
      .replace(/\s+(em\s+pdf|para\s+pdf|em\s+formato\s+pdf|para\s+impress[aã]o)\s*$/i, '')
      .trim();
    if (clean.length > 3) {
      return 'Apostila de Questões: ' + clean.slice(0, 50).charAt(0).toUpperCase() + clean.slice(1, 50);
    }
    return `Caderno de Questões - ${subject}`;
  }

  extractReportTitle(message, subject = 'Medicina') {
    const clean = String(message || '')
      .replace(/^(fa[çc]a|gere|emita|crie|quero|monte|elabore|escreva|redija)\s+(um|uma)?\s*(relat[oó]rio|laudo|parecer|tratado|resumo)\s*(de|da|do|sobre)?\s*/i, '')
      .replace(/\s+(em\s+pdf|para\s+pdf|em\s+formato\s+pdf)\s*$/i, '')
      .trim();
    if (clean.length > 3) {
      return clean.slice(0, 50).charAt(0).toUpperCase() + clean.slice(1, 50);
    }
    return `Relatório Clínico - ${subject}`;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || { id: sessionId, history: [] };
  }
}

const chatServiceInstance = new ChatService();
module.exports = chatServiceInstance;
module.exports.ChatService = ChatService;
module.exports.default = chatServiceInstance;
