const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const { runWithAiLimit } = require('../../shared/ai-limiter');
const AcademicReportRenderer = require('../../../web/academic-report-renderer');

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

function getGeminiReportCandidateModels() {
  // Configurações antigas podem apontar para modelos removidos. Mantemos os
  // valores do ambiente como prioridade, mas sempre oferecemos alternativas
  // estáveis para que a contingência não morra em um único 404.
  return [...new Set([
    'gemini-3.7-flash',
    process.env.REPORT_GEMINI_MODEL,
    process.env.MODEL_REASONING,
    process.env.MODEL_BALANCED,
    process.env.MODEL_FAST,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ].map(model => String(model || '').trim()).filter(Boolean))];
}

function canTryNextGeminiModel(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || '').toLowerCase();
  return status === 404 || /model(?:s)?\/.+not found|model.+not found|not supported for generatecontent|unsupported model/.test(message);
}

function normalizeGeneratedStructuralHtml(markdown) {
  const protectedBlocks = [];
  let text = String(markdown || '').replace(/\x60{3}[\s\S]*?\x60{3}|\x60[^\x60\n]*\x60/g, block => {
    const token = 'MEDTUTOR_PROTECTED_BLOCK_' + protectedBlocks.length + '_END';
    protectedBlocks.push(block);
    return token;
  });

  text = text.replace(/&lt;(\\*\/?(?:h[1-6]|ul|ol|li|p|div|br)\b(?:(?!&lt;|&gt;)[\s\S])*?)&gt;/gi, (_, tag) => {
    return '<' + tag.replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\\/g, '') + '>';
  });
  text = text.replace(/\\+(?=<\/?(?:h[1-6]|ul|ol|li|p|div|br|strong|b|em|i|u|sup|sub)\b)/gi, '');
  text = text.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_, level, heading) => '\n' + '#'.repeat(Number(level)) + ' ' + heading.trim() + '\n');
  text = text.replace(/<h([1-6])\b[^>]*>/gi, (_, level) => '\n' + '#'.repeat(Number(level)) + ' ')
    .replace(/<\/h[1-6]\s*>/gi, '\n');
  const listToMarkdown = (body, ordered) => {
    let itemNumber = 0;
    const items = body.replace(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi, (_, item) => {
      itemNumber += 1;
      return '\n' + (ordered ? itemNumber + '.' : '-') + ' ' + item.trim() + '\n';
    });
    return '\n' + items.replace(/<\/?li\b[^>]*>/gi, '\n') + '\n';
  };
  text = text.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul\s*>/gi, (_, body) => listToMarkdown(body, false));
  text = text.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol\s*>/gi, (_, body) => listToMarkdown(body, true));
  text = text.replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/li\s*>/gi, '\n');
  text = text.replace(/<\/?(?:ul|ol|li)\b[^>]*>/gi, '\n')
    .replace(/<br\b[^>]*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div)\b[^>]*>/gi, '\n')
    .replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n');

  return text.replace(/MEDTUTOR_PROTECTED_BLOCK_(\d+)_END/g, (_, index) => protectedBlocks[Number(index)] || '');
}

function normalizeReportTextArtifacts(markdown) {
  const protectedBlocks = [];
  let text = String(markdown || '').replace(/\x60{3}[\s\S]*?\x60{3}|\x60[^\x60\n]*\x60/g, block => {
    const token = 'MEDTUTOR_REPORT_PROTECTED_' + protectedBlocks.length + '_END';
    protectedBlocks.push(block);
    return token;
  });
  const currencies = [];
  const keepCurrency = value => {
    const token = 'MEDTUTOR_REPORT_CURRENCY_' + currencies.length + '_END';
    currencies.push(value);
    return token;
  };

  text = text.replace(/(?:R\$|US\$|U\$|EUR\$|BRL\$)\s*-?\d+(?:[.,]\d+)*/gi, keepCurrency);
  text = text.replace(/(^|[\s(])\$\s*(\d+(?:[.,]\d+)*)(?![\d.,])(?!\s*(?:[×x]|°\s?[CFK]\b|mm\s?Hg\b|mmol\b|mEq\b|bpm\b|irpm\b|kg\b|mg\b|mL\b|L\b|cm\b|mm\b|%|\/))/gi,
    (match, prefix, amount) => prefix + keepCurrency('$' + amount));
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$([^$\n]+)\$/g, '$1')
    .replace(/\$/g, '');

  const lines = text.split('\n');
  const output = [];
  let blockLines = [];
  const flushBlock = () => {
    if (!blockLines.length) return;
    const block = blockLines.join('\n');
    const visible = block
      .replace(/<[^>]*>/g, ' ')
      .replace(/\x60[^\x60]*\x60/g, ' ')
      .replace(/\[[^\]]*\]\([^)]*\)/g, ' ');
    let depth = 0;
    for (let index = 0; index < visible.length; index += 1) {
      if (visible[index] === '\\') { index += 1; continue; }
      if (visible[index] === '(') depth += 1;
      else if (visible[index] === ')' && depth > 0) depth -= 1;
    }
    const balancedBlock = block + (depth > 0 ? ')'.repeat(depth) : '');
    output.push(balancedBlock.replace(/([.!?])([)]+)$/g, '$2$1'));
    blockLines = [];
  };
  for (const line of lines) {
    const startsBlock = /^\s*(?:#{1,6}\s|[-*+]\s|>\s)/.test(line);
    if (!line.trim() || (startsBlock && blockLines.length)) flushBlock();
    if (line.trim()) blockLines.push(line);
    else output.push('');
  }
  flushBlock();

  text = output.join('\n')
    .replace(/MEDTUTOR_REPORT_CURRENCY_(\d+)_END/g, (_, index) => currencies[Number(index)] || '')
    .replace(/MEDTUTOR_REPORT_PROTECTED_(\d+)_END/g, (_, index) => protectedBlocks[Number(index)] || '');
  return text.replace(/\n{3,}/g, '\n\n');
}

function normalizeReportMarkdownForPrint(markdown) {
  return normalizeReportTextArtifacts(AcademicReportRenderer.normalize(markdown));
}

function normalizeReportMarkdownForPrintLegacy(markdown) {
  const lines = normalizeReportTextArtifacts(normalizeGeneratedStructuralHtml(markdown)).replace(/\r\n/g, '\n').split('\n');
  const output = [];
  const splitCells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '')
    .split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
  const isPipeRow = line => /^\s*\|.+\|\s*$/.test(line);
  const isSeparator = line => /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
  const tableNeedsReflow = (headers, rows, hasHeader) => {
    const width = headers.length || rows[0]?.length || 0;
    return !hasHeader || width < 2 || width > 4 || rows.some(row => row.length !== width)
      || [...headers, ...rows.flat()].some(cell => cell.length > 240)
      || rows.some(row => row.reduce((sum, cell) => sum + cell.length, 0) > 640);
  };
  const rowsToBullets = (headers, rows) => rows.map((row, rowIndex) => {
    const firstHeading = headers[0] && headers[0] !== '##' ? headers[0] : '';
    const label = row[0]
      ? (firstHeading ? '**' + firstHeading + ':** ' + row[0] : row[0])
      : (firstHeading || 'Item ' + (rowIndex + 1));
    const details = row.slice(1).map((value, columnIndex) => {
      if (!value) return '';
      const heading = headers[columnIndex + 1];
      return heading ? '**' + heading + ':** ' + value : value;
    }).filter(Boolean);
    return '- **' + label + ':** ' + (details.length ? details.join('; ') : row.slice(1).filter(Boolean).join('; '));
  }).join('\n');

  for (let index = 0; index < lines.length;) {
    if (!isPipeRow(lines[index])) {
      output.push(lines[index++]);
      continue;
    }

    const hasHeader = isPipeRow(lines[index]) && isSeparator(lines[index + 1] || '');
    const rawRows = [];
    let cursor = index;
    while (cursor < lines.length) {
      if (isSeparator(lines[cursor])) {
        cursor++;
        continue;
      }
      if (!isPipeRow(lines[cursor])) break;
      rawRows.push(splitCells(lines[cursor]));
      cursor++;
    }

    if (rawRows.length < 2) {
      output.push(lines[index++]);
      continue;
    }

    const headers = hasHeader ? rawRows.shift() : [];
    if (tableNeedsReflow(headers, rawRows, hasHeader)) {
      output.push(rowsToBullets(headers, rawRows));
      output.push('');
    } else {
      output.push(lines.slice(index, cursor).join('\n'));
    }
    index = cursor;
  }

  return output.join('\n')
    .replace(/```(?:mermaid|(?:ascii|text)\s+diagram)[^\n]*\n([\s\S]*?)```/gi, (_, body) => {
      const labels = [...new Set(String(body).split('\n').map(line => {
        const match = line.match(/(?:\w+\s*)?\[([^\]]+)\]|(?:\w+\s*)?\(([^)]+)\)/);
        return (match?.[1] || match?.[2] || line.replace(/^[\s\w-]+--?>\s*/, '').replace(/[|+┌┐└┘├┤┬┴─═]+/g, ' ').trim()).trim();
      }).filter(label => label.length > 2))];
      return labels.map(label => '- ' + label).join('\n');
    })
    .replace(/<table\b[\s\S]*?<\/table>/gi, table => {
      const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
      const matrix = rows.map(([, row]) => {
        return [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
          .map(([, cell]) => cell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      }).filter(row => row.length);
      const width = matrix[0]?.length || 0;
      const hasHeader = /<th\b/i.test(rows[0]?.[1] || '');
      const isReadable = hasHeader && width >= 2 && width <= 4 && matrix.every(row => row.length === width)
        && matrix.flat().every(cell => cell.length <= 240)
        && matrix.slice(1).every(row => row.reduce((sum, cell) => sum + cell.length, 0) <= 640);
      if (isReadable) return table;
      const headers = hasHeader ? (matrix[0] || []) : [];
      const dataRows = hasHeader ? matrix.slice(1) : matrix;
      return dataRows.map((row, rowIndex) => {
        const fields = row.map((cell, columnIndex) => {
          if (!cell) return '';
          const heading = headers[columnIndex] || (columnIndex === 0 ? 'Item ' + (rowIndex + 1) : 'Coluna ' + (columnIndex + 1));
          return heading ? '**' + heading + ':** ' + cell : cell;
        }).filter(Boolean);
        return fields.length ? '- ' + fields.join('; ') : '';
      }).filter(Boolean).join('\n');
    })
    // Converte apenas linhas isoladas de caixa ASCII; linhas Markdown com
    // múltiplas células devem permanecer como tabelas renderizáveis.
    .replace(/^\s*[|│]\s*([^|│\n]*?)\s*[|│]\s*$/gm, (_, content) => {
      const text = String(content).replace(/\s*[|│]\s*/g, ' — ').trim();
      return text ? '- ' + text : '';
    })
    .replace(/^\s*(.+?)\s*(?:--?>|={3,}|-{3,}|>{2,})\s*(.+?)\s*$/gm, (line, from, to) => {
      if (/^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(line)) return line;
      const left = from.replace(/[\[\](){}]/g, '').trim();
      const right = to.replace(/[\[\](){}]/g, '').trim();
      return left && right ? '- ' + left + '\n- ' + right : left || right;
    })
    .replace(/^\s*[+┌┐└┘├┤┬┴][+\-=═─┌┐└┘├┤┬┴\s]*[+┐┘┤┴]\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
0. TÍTULO EDITORIAL: crie, a partir do conteúdo médico real, um título conciso e específico para este relatório (preferencialmente até 12 palavras). Não copie o nome do arquivo, o título da aula, códigos, números de revisão ou metadados. O primeiro elemento da resposta deve ser um H1 com esse título.
1. FUNDAMENTOS EM CAMADAS: para cada estrutura, conceito, via ou fenômeno, ensine nesta ordem: o que é e onde está; partes e relações; função; mecanismo; alteração/lesão; consequência. A aplicação clínica vem depois, como confirmação da compreensão.
2. DISTRIBUIÇÃO DE ÊNFASE: priorize estrutura, localização, componentes, função, relações e mecanismos (cerca de 65%); depois consequências e correlações clínico-fisiopatológicas (25%); por último conduta, farmacologia e prova (10%), exceto quando o material for explicitamente clínico.
3. ANCORAGEM DIDÁTICA: organize cada bloco com subtítulos curtos e listas; para cada item, identifique estrutura/conceito, localização/relações, função, mecanismo e consequência quando pertinente. Use tabela somente quando facilitar uma comparação real.
4. RECUPERAÇÃO ATIVA: encerre cada bloco com duas perguntas curtas, uma de recordação e uma de comparação/consequência; apresente as respostas sob o subtítulo "Resposta comentada".
5. FIDELIDADE CONCEITUAL: Todo o embasamento teórico deve vir do material fornecido. Não invente afirmações incompatíveis com a fonte.
6. DIRETRIZES NACIONAIS: Correlacione condutas com os consensos vigentes do SUS e protocolos clínicos (PCDT), apenas após consolidar os fundamentos.
7. FECHAMENTO DIDÁTICO: finalize com um caso clínico autossuficiente que exija explicar estrutura, mecanismo e consequência, seguido de 3 a 5 pérolas de prova.

DIRETRIZES VISUAIS E DE DIAGRAMAÇÃO:
0. FORMATO E REVISÃO DE TEXTO: Retorne somente Markdown, nunca use HTML estrutural nem envolva o relatório em blocos de código. Não use delimitadores matemáticos com cifrão ($...$ ou $$...$$); escreva unidades e valores médicos em texto simples e Unicode (ex.: 39,2 °C; 90 × 55 mmHg; 4,2 mmol/L). Revise cada parêntese aberto e feche-o no mesmo parágrafo; não deixe parênteses pendentes.
1. HIERARQUIA ABNT: Use títulos numerados sem ponto após o último algarismo (1 INTRODUÇÃO; 1.1 Organização). Prefira hierarquia tipográfica discreta, sem caixa alta integral quando prejudicar a leitura.
2. DIAGRAMAÇÃO SEGURA PARA A4:
   - Não gere diagramas, fluxogramas, mapas conceituais, Mermaid, esquemas ASCII, caixas de caracteres nem sequências visuais de setas.
   - Tabelas são permitidas quando forem a forma mais clara de comparar dados. Limite a 4 colunas, use cabeçalhos curtos e consistentes e mantenha cada célula concisa (preferencialmente uma frase curta ou até 30 palavras). Não coloque parágrafos, listas longas ou subtítulos dentro das células.
   - Se uma comparação ficar larga ou exigir explicações extensas, divida-a em tabelas menores ou apresente-a como lista rotulada. Cada tabela deve ter cabeçalho semântico, linhas alinhadas e informação suficiente para ser entendida sem depender de cor.
   - Apresente relações causais em frases ou listas numeradas curtas, não em setas ou diagramas.
3. INTEGRAÇÃO DE ILUSTRAÇÕES MÉDICAS:
   - Você tem acesso a um catálogo de figuras do material.
   - Quando explicar um corte anatômico, ECG, radiografia ou mecanismo correspondente a uma dessas figuras, insira-a imediatamente após o parágrafo explicativo:
     ![Descrição técnica detalhada](URL_EXATA_DO_CATÁLOGO)
     *Figura: Detalhamento clínico dos marcos anatômicos ou achados observáveis.*
   - NUNCA invente links externos de imagem. Utilize APENAS as URLs fornecidas no catálogo.
`;

    // 3. Montagem do prompt contextualizado
    const prompt = `
METADADOS DO DOCUMENTO:
- RÓTULO DO ARQUIVO-FONTE (apenas para rastreabilidade; não usar como título): ${cleanTitle}
- DISCIPLINA: ${cleanSubject}
- AUTOR: ${author}
- INSTITUIÇÃO: ${institution}

CATÁLOGO DE ILUSTRAÇÕES DISPONÍVEIS:
${figuresCatalogText}

--- CONTEÚDO FONTE DO MATERIAL ---
${content}
--- FIM DO MATERIAL ---

INSTRUÇÕES DE ESCRITA:
Escreva o Tratado Acadêmico completo em Markdown. Antes de tudo, sintetize o eixo conceitual que realmente domina o conteúdo e crie um título original que o descreva; o título do arquivo acima serve somente para identificar a fonte. Não repita esse nome, códigos de turma/aula, “PDF”, número de revisão ou rótulo administrativo. Inicie diretamente com um H1 no formato # título editorial baseado no conteúdo e depois os metadados, desenvolvendo as seções abaixo. Não avance para clínica ou tratamento antes de consolidar as três primeiras seções:

**Disciplina:** ${cleanSubject} | **Autor:** ${author} | **Instituição:** ${institution}

## 1. Fundamentos: definição, localização e organização
## 2. Componentes, relações e função de cada estrutura/conceito
## 3. Mecanismos: como estrutura e função produzem o fenômeno
## 4. Causa → alteração → consequência, com correlação clínico-fisiopatológica
## 5. Recuperação ativa por blocos, com respostas comentadas
## 6. Aplicação clínica, semiologia e diagnóstico diferencial
## 7. Conduta e farmacologia aplicada (PCDT / SUS), apenas quando pertinentes
## 8. Caso clínico comentado e pérolas de prova

REQUISITO OBRIGATÓRIO DA SEÇÃO 5:
- Crie pelo menos 3 blocos e no máximo 5 blocos de recuperação ativa, cobrindo os conceitos mais centrais das seções 1 a 4.
- Use exatamente o formato abaixo em cada bloco, para que o relatório fique legível e útil para estudo:
  ### Bloco N: título curto do conceito
  **Pergunta de recordação:** pergunta objetiva, sem a resposta no enunciado.
  **Pergunta de comparação/consequência:** pergunta que exige diferenciar, relacionar causa e efeito ou prever uma consequência.
  **Resposta comentada:** resposta concisa para as duas perguntas, explicando o raciocínio.
- Não substitua esses blocos por texto corrido, listas de objetivos, "checkpoints" genéricos ou questões de múltipla escolha.
`;

    try {
      let generatedMarkdown = '';
      let generatorEngine = 'gemini';
      let generatorModel = getGeminiReportCandidateModels()[0] || 'gemini-2.5-flash';
      let usage = { inputTokens: 0, outputTokens: 0 };

      const generateWithGemini = async () => {
        const genAI = getGenAI();
        const candidates = getGeminiReportCandidateModels();
        let lastError = null;
        for (let index = 0; index < candidates.length; index += 1) {
          const candidate = candidates[index];
          try {
            generatorModel = candidate;
            const model = genAI.getGenerativeModel({
              model: candidate,
              systemInstruction,
              generationConfig: {
                temperature: 0.2,
                topP: 0.8,
                maxOutputTokens: 65536
              }
            });
            const result = await runWithAiLimit(() => model.generateContent(prompt));
            return result.response.text();
          } catch (geminiModelError) {
            lastError = geminiModelError;
            const hasNext = index < candidates.length - 1;
            if (!hasNext || !canTryNextGeminiModel(geminiModelError)) throw geminiModelError;
            console.warn(`⚠️ [Relatórios] Modelo Gemini "${candidate}" indisponível; tentando "${candidates[index + 1]}".`, {
              code: geminiModelError?.code || geminiModelError?.type || 'gemini-model-unavailable',
              status: geminiModelError?.status || geminiModelError?.statusCode || null
            });
          }
        }
        throw lastError || new Error('Nenhum modelo Gemini compatível está disponível para o relatório.');
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

      generatedMarkdown = normalizeReportMarkdownForPrint(generatedMarkdown);
      const generatedTitle = AcademicReportRenderer.extractReportTitle(generatedMarkdown, cleanTitle, cleanSubject);

      // Monta os nomes de arquivo sanitizados para download
      const filenameBase = { title: generatedTitle, subject: cleanSubject };
      const filenames = {
        markdown: this._generateSafeFilename({ ...filenameBase, extension: 'md' }),
        pdf: this._generateSafeFilename({ ...filenameBase, extension: 'pdf' })
      };

      const reportData = {
        id: `rel_${Date.now()}`,
        materialId: materialId || `mat_${Date.now()}`,
        title: generatedTitle,
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
module.exports.getGeminiReportCandidateModels = getGeminiReportCandidateModels;
module.exports.normalizeGeneratedStructuralHtml = normalizeGeneratedStructuralHtml;
module.exports.normalizeReportTextArtifacts = normalizeReportTextArtifacts;
module.exports.normalizeReportMarkdownForPrint = normalizeReportMarkdownForPrint;
