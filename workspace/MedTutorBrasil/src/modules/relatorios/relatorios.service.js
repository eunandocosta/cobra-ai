const { GoogleGenerativeAI } = require('@google/generative-ai');

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ [RelatoriosService] GEMINI_API_KEY não foi encontrada nas variáveis de ambiente!');
    throw new Error('GEMINI_API_KEY não configurada no ambiente.');
  }
  return new GoogleGenerativeAI(apiKey);
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
1. RIGOR E PROFUNDIDADE: Detalhe os mecanismos etiopatogênicos, moleculares, correlações semiológicas e farmacológicas presentes no conteúdo. Jamais use resumos superficiais ou clichês vazios.
2. FIDELIDADE CONCEITUAL: Todo o embasamento teórico deve vir do material fornecido. Não invente afirmações incompatíveis com a fonte.
3. DIRETRIZES NACIONAIS: Correlacione condutas com os consensos vigentes do SUS e protocolos clínicos (PCDT).
4. FECHAMENTO DIDÁTICO:
   - Finalize com 1 Caso Clínico autossuficiente contendo Enunciado, Pergunta e Gabarito comentado com diagnósticos diferenciais.
   - Apresente de 3 a 5 "💡 Pérolas de Plantão e Prova" focadas em temas quentes para ENARE e Revalida.

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

    // 3. Inicialização do modelo Gemini 3.7 Flash com raciocínio analítico
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: process.env.MODEL_REASONING || "gemini-3.7-flash",
      systemInstruction,
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        maxOutputTokens: 65536
      }
    });

    // 4. Montagem do prompt contextualizado
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
Escreva o Tratado Acadêmico completo em Markdown. Inicie diretamente com o título H1 e metadados, desenvolvendo as seguintes seções de forma detalhada e técnica:

# ${cleanTitle}
**Disciplina:** ${cleanSubject} | **Autor:** ${author} | **Instituição:** ${institution}

## 1. Introdução e Objetivos de Aprendizagem
## 2. Fisiopatologia, Bases Moleculares e Anatomoclínica (ilustrada com as figuras pertinentes do catálogo)
## 3. Apresentação Clínica, Semiologia e Diagnóstico Diferencial (com tabela comparativa obrigatória)
## 4. Abordagem Terapêutica e Farmacologia Aplicada (PCDT / SUS)
## 5. Avaliação Ativa: Caso Clínico Comentado
## 6. Pérolas de Prova (ENARE / Revalida)
`;

    try {
      const result = await model.generateContent(prompt);
      const generatedMarkdown = result.response.text();

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
        hasFigures: Array.isArray(figures) && figures.length > 0,
        filenames,
        createdAt: new Date().toISOString()
      };

      if (this.repository) {
        await this.repository.save(reportData);
      }

      return reportData;

    } catch (error) {
      console.error('❌ [RelatoriosService] Falha na geração do tratado acadêmico:', error);
      throw new Error(`Erro ao gerar o relatório acadêmico via IA: ${error.message}`);
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