const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const { runWithAiLimit } = require('../../shared/ai-limiter');

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ [RelatoriosService] GEMINI_API_KEY não foi encontrada nas variáveis de ambiente!');
    throw new Error('GEMINI_API_KEY não configurada no ambiente.');
  }
  return new GoogleGenerativeAI(apiKey);
}

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada no ambiente.');
  return new OpenAI({ apiKey });
}

function getReportProvider() {
  const configuredProvider = String(process.env.REPORT_AI_PROVIDER || '').trim().toLowerCase();
  if (configuredProvider) return configuredProvider;
  // Uma chave OpenAI configurada torna o ChatGPT o motor padrão de relatórios,
  // inclusive no Render quando a variável de seleção não for cadastrada.
  return process.env.OPENAI_API_KEY ? 'openai' : 'gemini';
}

function getReportEngineLabel(provider, model) {
  const safeModel = String(model || 'modelo não informado').trim();
  if (provider === 'openai') return `ChatGPT ${safeModel}`;
  if (provider === 'gemini-fallback') return `Gemini ${safeModel} (contingência)`;
  return `Gemini ${safeModel}`;
}

class RelatoriosService {
  /**
   * @param {Object} options
   * @param {Object} [options.reportRepository] Repositório para persistência (Prisma, TypeORM, Mongo, etc.)
   */
  constructor({ reportRepository = null } = {}) {
    this.repository = reportRepository;
  }

  /**
   * Utilitário interno para gerar slugs de nomes de arquivo seguros e legíveis.
   * @private
   */
  _generateSafeFilename({ title, subject, extension = 'pdf' }) {
    const sanitize = (text) =>
      String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentuação
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')   // Converte espaços e símbolos em underline
        .replace(/^_+|_+$/g, '')         // Limpa extremidades
        .slice(0, 45);                   // Evita estouro de caminho em sistemas de arquivos

    const safeSubj = sanitize(subject) || 'medicina';
    const safeTitle = sanitize(title) || 'tratado_clinico';
    const dateStamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    return `medtutor_${safeSubj}_${safeTitle}_${dateStamp}.${extension}`;
  }

  /**
   * Gera um Tratado Acadêmico estruturado em Markdown com ilustrações reais do material.
   * 
   * @param {Object} params
   * @param {string} params.materialId Identificador do material fonte
   * @param {string} params.title Título da aula ou tema clínico
   * @param {string} params.subject Disciplina médica (ex: Cardiologia, Neuroanatomia)
   * @param {string} params.content Texto integral ou transcrição do material de estudo
   * @param {string} [params.studentName] Nome do estudante
   * @param {string} [params.medicalSchool] Nome da instituição
   * @param {Array<{id: string, url: string, description: string}>} [params.figures] Lista de figuras isoladas do PDF
   * @returns {Promise<Object>} Dados do relatório gerado com Markdown e nomes de arquivo para exportação
   */
  async generateReport({
    materialId,
    title,
    subject,
    content,
    studentName,
    medicalSchool,
    figures = []
  }) {
    if (!content || typeof content !== 'string' || content.trim().length < 80) {
      throw new Error('Conteúdo textual insuficiente para a síntese do tratado acadêmico (mínimo de 80 caracteres).');
    }

    const cleanTitle = (title || 'Tratado Acadêmico').replace(/\.[^/.]+$/, '').trim();
    const cleanSubject = (subject || 'Clínica Médica').trim();
    const author = (studentName || 'Estudante de Medicina').trim();
    const institution = (medicalSchool || 'Faculdade de Medicina').trim();
    const requestedProvider = getReportProvider();
    if (!['openai', 'gemini'].includes(requestedProvider)) {
      const configError = new Error(`REPORT_AI_PROVIDER inválido: "${requestedProvider}". Use "openai" ou "gemini".`);
      configError.code = 'invalid-report-provider';
      configError.provider = requestedProvider;
      throw configError;
    }
    const requestedModel = requestedProvider === 'openai'
      ? (process.env.OPENAI_REPORT_MODEL || 'gpt-5')
      : (process.env.MODEL_REASONING || 'gemini-3.7-flash');
    console.info(`🧠 [Relatórios] Utilizando ${getReportEngineLabel(requestedProvider, requestedModel)} para gerar este relatório.`, {
      arquivo: cleanTitle,
      disciplina: cleanSubject,
      provider: requestedProvider,
      model: requestedModel,
      caracteresFonte: content.length,
      figuras: Array.isArray(figures) ? figures.length : 0
    });

    // 1. Constrói o catálogo de figuras autorizadas para ilustração
    let figuresCatalogText = 'Nenhuma figura recortada disponível no material.';
    if (Array.isArray(figures) && figures.length > 0) {
      figuresCatalogText = figures
        .map((fig, index) => `- [FIGURA_${index + 1}]: "${fig.description || 'Ilustração médica'}" | URL: ${fig.url}`)
        .join('\n');
    }

    // 2. System Instruction com regras editoriais e anti-diagramas confusos
    const systemInstruction = `
Você é um preceptor médico sênior da MedTutor Brasil e editor-chefe de tratados acadêmicos.
Sua missão é sintetizar materiais médicos em um Tratado Acadêmico formal, aprofundado e diagramado em Markdown.

DIRETRIZES FUNDAMENTAIS DE CONTEÚDO:
1. FUNDAMENTOS EM CAMADAS: para cada estrutura, conceito, via ou fenômeno, ensine nesta ordem: o que é e onde está; partes e relações; função; mecanismo; alteração/lesão; consequência. A aplicação clínica vem depois, como confirmação da compreensão.
2. DISTRIBUIÇÃO DE ÊNFASE: priorize estrutura, localização, componentes, função, relações e mecanismos (cerca de 65%); depois consequências e correlações clínico-fisiopatológicas (25%); por último conduta, farmacologia e prova (10%), exceto quando o material for explicitamente clínico.
3. TABELA DE ANCORAGEM: em cada bloco, use uma tabela com Estrutura ou conceito | Onde está / relações | Função | Mecanismo | Se alterada, o que acontece.
4. RECUPERAÇÃO ATIVA: encerre cada bloco com duas perguntas curtas, uma de recordação e uma de comparação/consequência; apresente as respostas sob o subtítulo "Resposta comentada".
5. FIDELIDADE CONCEITUAL: Todo o embasamento teórico deve vir do material fornecido. Não invente afirmações incompatíveis com a fonte.
6. DIRETRIZES NACIONAIS: Correlacione condutas com os consensos vigentes do SUS e protocolos clínicos (PCDT), apenas após consolidar os fundamentos.
7. FECHAMENTO DIDÁTICO: finalize com um caso clínico autossuficiente que exija explicar estrutura, mecanismo e consequência, seguido de 3 a 5 pérolas de prova.

DIRETRIZES VISUAIS E DE DIAGRAMAÇÃO:
1. PROIBIÇÃO ABSOLUTA DE DIAGRAMAS EM TEXTO OU ASCII:
   - É ESTRITAMENTE PROIBIDO desenhar esquemas usando setas de texto ("--->"), caixas de caracteres ASCII ou fluxogramas Mermaid improvisados.
   - Para sínteses visuais e diagnósticos diferenciais, use EXCLUSIVAMENTE Tabelas Markdown com cabeçalhos bem delineados (| Parâmetro | Achado | Conduta |).
2. INTEGRAÇÃO DE ILUSTRAÇÕES MÉDICAS:
   - Você tem acesso a um catálogo de figuras do material.
   - Quando explicar um corte anatômico, ECG, radiografia ou mecanismo correspondente a uma dessas figuras, insira-a imediatamente após o parágrafo explicativo:
     ![Descrição técnica detalhada](URL_EXATA_DO_CATÁLOGO)
     *Figura: Detalhamento clínico dos marcos anatômicos ou achados observáveis.*
   - NUNCA invente links externos de imagem. Utilize APENAS as URLs fornecidas no catálogo.
`;

    // 3. Montagem do prompt contextualizado
    const prompt = `
METADADOS DO DOCUMENTO:
- TÍTULO: ${cleanTitle}
- DISCIPLINA: ${cleanSubject}
- AUTOR: ${author}
- INSTITUIÇÃO: ${institution}

CATÁLOGO DE ILUSTRAÇÕES DISPONÍVEIS:
${figuresCatalogText}

--- CONTEÚDO FONTE DO MATERIAL ---
${content}
--- FIM DO MATERIAL ---

INSTRUÇÕES DE ESCRITA:
Escreva o Tratado Acadêmico completo em Markdown. Inicie diretamente com o título H1 e metadados, desenvolvendo as seguintes seções de forma detalhada e técnica. Não avance para clínica ou tratamento antes de consolidar as três primeiras seções:

# ${cleanTitle}
**Disciplina:** ${cleanSubject} | **Autor:** ${author} | **Instituição:** ${institution}

## 1. Fundamentos: definição, localização e organização
## 2. Componentes, relações e função de cada estrutura/conceito
## 3. Mecanismos: como estrutura e função produzem o fenômeno
## 4. Causa → alteração → consequência, com correlação clínico-fisiopatológica
## 5. Recuperação ativa por blocos, com respostas comentadas
## 6. Aplicação clínica, semiologia e diagnóstico diferencial
## 7. Conduta e farmacologia aplicada (PCDT / SUS), apenas quando pertinentes
## 8. Caso clínico comentado e pérolas de prova
`;

    try {
      let generatedMarkdown = '';
      let generatorEngine = 'gemini';
      let generatorModel = process.env.MODEL_REASONING || 'gemini-3.7-flash';
      let usage = { inputTokens: 0, outputTokens: 0 };

      const generateWithGemini = async () => {
        const genAI = getGenAI();
        const model = genAI.getGenerativeModel({
          model: generatorModel,
          systemInstruction,
          generationConfig: {
            temperature: 0.2,
            topP: 0.8,
            maxOutputTokens: 65536
          }
        });
        const result = await runWithAiLimit(() => model.generateContent(prompt));
        return result.response.text();
      };

      if (requestedProvider === 'openai') {
        generatorEngine = 'openai';
        generatorModel = process.env.OPENAI_REPORT_MODEL || 'gpt-5';
        try {
          const openai = getOpenAI();
          const response = await runWithAiLimit(() => openai.responses.create({
            model: generatorModel,
            instructions: systemInstruction,
            input: prompt,
            // O relatório é salvo pelo MedTutor; não é necessário manter o
            // estado da resposta na API para continuar a conversa.
            store: false
          }));
          generatedMarkdown = String(response.output_text || '').trim();
          if (!generatedMarkdown) throw new Error('A OpenAI não retornou texto para o relatório.');
          generatorModel = response.model || generatorModel;
          usage = {
            inputTokens: Number(response.usage?.input_tokens) || 0,
            outputTokens: Number(response.usage?.output_tokens) || 0
          };
        } catch (openaiError) {
          if (!process.env.GEMINI_API_KEY) throw openaiError;
          console.warn(`⚠️ [Relatórios] ${getReportEngineLabel('openai', generatorModel)} falhou; utilizando Gemini como contingência.`, {
            arquivo: cleanTitle,
            code: openaiError?.code || openaiError?.type || 'openai-failed',
            status: openaiError?.status || openaiError?.statusCode || null,
            motivo: openaiError?.message || 'erro não informado'
          });
          generatorEngine = 'gemini-fallback';
          generatorModel = process.env.MODEL_REASONING || 'gemini-3.7-flash';
          try {
            generatedMarkdown = await generateWithGemini();
          } catch (geminiError) {
            const fallbackError = new Error(`ChatGPT falhou (${openaiError?.message || 'erro não informado'}) e o Gemini de contingência também falhou (${geminiError?.message || 'erro não informado'}).`);
            fallbackError.code = geminiError?.code || geminiError?.type || 'gemini-fallback-failed';
            fallbackError.status = geminiError?.status || geminiError?.statusCode;
            throw fallbackError;
          }
        }
      } else {
        generatedMarkdown = await generateWithGemini();
      }

      // Monta os nomes de arquivo sanitizados para download
      const filenameBase = { title: cleanTitle, subject: cleanSubject };
      const filenames = {
        markdown: this._generateSafeFilename({ ...filenameBase, extension: 'md' }),
        pdf: this._generateSafeFilename({ ...filenameBase, extension: 'pdf' })
      };

      const reportData = {
        id: `rel_${Date.now()}`,
        materialId: materialId || `mat_${Date.now()}`,
        title: cleanTitle,
        subject: cleanSubject,
        author,
        institution,
        markdown: generatedMarkdown,
        generatorEngine,
        generatorModel,
        usage,
        hasFigures: Array.isArray(figures) && figures.length > 0,
        filenames,
        createdAt: new Date().toISOString()
      };

      if (this.repository) {
        await this.repository.save(reportData);
      }

      console.info(`✅ [Relatórios] Relatório gerado com ${getReportEngineLabel(generatorEngine, generatorModel)} com sucesso.`, {
        arquivo: cleanTitle,
        provider: generatorEngine,
        model: generatorModel,
        caracteresGerados: generatedMarkdown.length,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      });

      return reportData;

    } catch (error) {
      console.error(`❌ [Relatórios] Relatório gerado com ${getReportEngineLabel(requestedProvider, requestedProvider === 'openai' ? (process.env.OPENAI_REPORT_MODEL || 'gpt-5') : (process.env.MODEL_REASONING || 'gemini-3.7-flash'))} falhou.`, {
        arquivo: cleanTitle,
        provider: requestedProvider,
        code: error?.code || error?.type || 'report-generation-failed',
        status: error?.status || error?.statusCode || null,
        motivo: error?.message || 'erro não informado'
      });
      const reportError = new Error(`Erro ao gerar o relatório acadêmico via IA: ${error.message}`);
      reportError.code = error?.code || error?.type || 'report-generation-failed';
      reportError.status = Number(error?.status || error?.statusCode || 0) || undefined;
      reportError.provider = requestedProvider;
      reportError.model = requestedProvider === 'openai'
        ? (process.env.OPENAI_REPORT_MODEL || 'gpt-5')
        : (process.env.MODEL_REASONING || 'gemini-3.7-flash');
      throw reportError;
    }
  }

  /**
   * Recupera um relatório previamente persistido.
   * @param {string} id 
   * @returns {Promise<Object|null>}
   */
  async getReportById(id) {
    if (!id) throw new Error('ID do relatório não informado.');

    if (this.repository) {
      const report = await this.repository.findById(id);
      return report || null;
    }

    return null;
  }

  /**
   * Recupera lista de relatórios vinculados a um material.
   * @param {string} materialId
   * @returns {Promise<Array>}
   */
  async getReportsByMaterial(materialId) {
    if (!materialId) return [];
    if (this.repository && typeof this.repository.findByMaterial === 'function') {
      return (await this.repository.findByMaterial(materialId)) || [];
    }
    return [];
  }

  /**
   * Prepara os metadados de exportação em PDF formato A4 para o relatório.
   * @param {string} reportId
   * @returns {Object}
   */
  preparePdfExport(reportId) {
    const safeId = reportId || `rel_${Date.now()}`;
    return {
      success: true,
      reportId: safeId,
      filename: `medtutor_relatorio_${safeId}.pdf`,
      format: 'A4',
      readyForPrint: true,
      exportEngine: 'browser-a4-print',
      message: 'Relatório preparado para emissão oficial em PDF A4.'
    };
  }
}

const relatoriosServiceInstance = new RelatoriosService();
module.exports = relatoriosServiceInstance;
module.exports.RelatoriosService = RelatoriosService;
module.exports.default = relatoriosServiceInstance;
module.exports.getReportEngineLabel = getReportEngineLabel;
