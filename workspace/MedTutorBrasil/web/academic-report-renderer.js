(function attachAcademicReportRenderer(root, factory) {
  const renderer = factory();
  if (typeof module === 'object' && module.exports) module.exports = renderer;
  if (root) root.AcademicReportRenderer = renderer;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAcademicReportRenderer() {
  'use strict';

  // Quebra de linha dentro de célula de tabela. Caractere de uso privado: não é
  // espaço (sobrevive a .replace(/\s+/)) e nunca aparece em texto real.
  const CELL_BREAK = '\uE000';
  const CELL_BREAK_RE = /\uE000/g;
  const escapeHtml = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function decodeEntities(value) {
    return String(value || '').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&')
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
  }

  function inlineText(html) {
    return decodeEntities(String(html || '').replace(/<br\b[^>]*\/?>/gi, ' ')
      .replace(/<\/(?:p|div)\s*>/gi, ' ').replace(/<\/?(?:strong|b)\b[^>]*>/gi, '**')
      .replace(/<\/?(?:em|i)\b[^>]*>/gi, '*').replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ').trim();
  }

  function cleanReportTitleCandidate(value) {
    return inlineText(String(value || '')
      .replace(/^\s*#{1,6}\s*/, '')
      .replace(/!{0,1}\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|__|`|~~/g, '')
      .replace(/^\s*\d+(?:\.\d+)*[.)\s:-]+/, '')
      .replace(/^(?:t[ií]tulo|tema central|tema principal)\s*:\s*/i, ''))
      .replace(/^[\s:;,.–—-]+|[\s:;,.–—-]+$/g, '')
      .slice(0, 120);
  }

  function reportTitleKey(value) {
    return cleanReportTitleCandidate(value)
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(?:artigo cientifico|tratado academico(?: de medicina)?|revisao|aula|slide|slides|documento|arquivo|pdf|pptx|ppt|docx?)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }

  function isGenericReportHeading(value) {
    const key = reportTitleKey(value);
    return !key || /^(?:introducao|objetivos?|sumario|resumo|abstract|fundamentos|fundamentos em camadas|componentes e relacoes|mecanismos?|recuperacao ativa|aplicacao clinica|caso clinico|conclusao|referencias bibliograficas|referencias|tratado academico|relatorio academico|artigo cientifico)$/.test(key);
  }

  function extractReportTitle(markdown, sourceTitle = '', subject = '') {
    const text = normalize(markdown);
    const sourceKey = reportTitleKey(sourceTitle);
    const headings = [...text.matchAll(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/gm)]
      .map(match => ({ level: match[1].length, title: cleanReportTitleCandidate(match[2]) }))
      .filter(item => item.title);
    const usefulHeading = headings.find(item => {
      const candidateKey = reportTitleKey(item.title);
      return !isGenericReportHeading(item.title) && candidateKey !== sourceKey;
    });
    if (usefulHeading) return usefulHeading.title;

    const lines = text.split('\n');
    for (const line of lines) {
      const paragraph = cleanReportTitleCandidate(line
        .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '')
        .replace(/^\*\*[^*]+:\*\*\s*/, ''));
      if (paragraph.length < 18 || /^(?:disciplina|autor|instituicao|per[ií]odo|data|arquivo|nome original)\s*:/i.test(paragraph)) continue;
      const sentence = paragraph.split(/(?<=[.!?])\s+/)[0].replace(/[.!?]+$/, '').trim();
      if (sentence.length < 18 || reportTitleKey(sentence) === sourceKey) continue;
      const words = sentence.split(/\s+/);
      return words.length > 12 ? words.slice(0, 12).join(' ') : sentence;
    }

    const cleanSubject = cleanReportTitleCandidate(subject);
    return cleanSubject ? `${cleanSubject}: síntese dos conceitos centrais` : 'Síntese dos conceitos centrais';
  }

  function legacyHtmlToMarkdown(input) {
    let text = decodeEntities(input).replace(/\\(?=<\/?(?:h[1-6]|ul|ol|li|p|div|br|strong|b|em|i|u)\b)/gi, '');
    text = text.replace(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi, (_, body) => {
      const rows = [...String(body).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map(([, row]) => ({
        heading: /<th\b/i.test(row),
        cells: [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)].map(([, cell]) => inlineText(cell.replace(/<br\b[^>]*\/?>/gi, CELL_BREAK)).replace(/\|/g, '\\|'))
      })).filter(row => row.cells.length);
      if (!rows.length) return '\n';
      // Sem <th>, a primeira linha vira cabeçalho quando todas têm o mesmo
      // número de colunas (tabela HTML comum); senão vira lista.
      const sameWidth = rows.every(row => row.cells.length === rows[0].cells.length);
      if (!rows[0].heading && !(rows.length >= 2 && sameWidth && rows[0].cells.length >= 2)) return '\n' + rows.map(row => '- ' + row.cells.join('; ')).join('\n') + '\n';
      const head = rows[0].cells;
      return '\n| ' + head.join(' | ') + ' |\n| ' + head.map(() => '---').join(' | ') + ' |\n'
        + rows.slice(1).map(row => '| ' + row.cells.join(' | ') + ' |').join('\n') + '\n';
    });
    const listStack = [];
    text = text.replace(/<\/?(?:ul|ol)\b[^>]*>|<\/?li\b[^>]*>/gi, tag => {
      const openingList = tag.match(/^<(ul|ol)\b/i);
      if (openingList) { listStack.push(openingList[1].toLowerCase()); return '\n'; }
      if (/^<\/(?:ul|ol)\b/i.test(tag)) { listStack.pop(); return '\n'; }
      if (/^<li\b/i.test(tag)) {
        const depth = Math.max(0, listStack.length - 1);
        const marker = listStack[listStack.length - 1] === 'ol' ? '1.' : '-';
        return `\n${'  '.repeat(depth)}${marker} `;
      }
      return '\n';
    });
    text = text
      .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_, level, body) => `\n${'#'.repeat(Number(level))} ${body.trim()}\n`)
      .replace(/<h([1-6])\b[^>]*>/gi, (_, level) => `\n${'#'.repeat(Number(level))} `)
      .replace(/<\/h[1-6]\s*>/gi, '\n')
      .replace(/<\/?(?:ul|ol)\b[^>]*>/gi, '\n')
      .replace(/<br\b[^>]*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|section|article)\s*>/gi, '\n\n')
      .replace(/<(?:p|div|section|article)\b[^>]*>/gi, '\n')
      .replace(/<\/(?:strong|b)\s*>/gi, '**').replace(/<(?:strong|b)\b[^>]*>/gi, '**')
      .replace(/<\/(?:em|i)\s*>/gi, '*').replace(/<(?:em|i)\b[^>]*>/gi, '*')
      .replace(/<\/?(?:u|sup|sub)\b[^>]*>/gi, '').replace(/<[^>]*>/g, ' ')
      .replace(/\\([*_#`])/g, '$1').replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n');
    return text;
  }

  function removeDiagramSyntax(markdown) {
    const lines = String(markdown || '').split('\n');
    const output = [];
    let inCodeFence = false;
    for (let line of lines) {
      if (/^\s*```/.test(line)) { inCodeFence = !inCodeFence; continue; }
      if (inCodeFence || /^\s*[+┌┐└┘├┤┬┴╔╗╚╝╠╣╦╩╬═─━│║\s-]{5,}\s*$/.test(line)) continue;
      line = line.replace(/(?:--?>|=>|→|↘|⟶|➜|←|⟵)/g, ' leva a ')
        .replace(/[ \t]{2,}/g, ' ');
      output.push(line);
    }
    return output.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  // Linha separadora: aceita "---", "-", ":--:" e bordas sem barra ("--- | ---").
  const SEPARATOR_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;
  const hasUnescapedPipe = line => /(?<!\\)\|/.test(String(line || '').replace(/`[^`]*`/g, ''));

  function splitTableRow(line) {
    let row = String(line || '').trim();
    if (row.startsWith('|')) row = row.slice(1);
    if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
    return row.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
  }

  // Lê uma tabela a partir da linha do cabeçalho (seguida do separador). Aceita
  // linhas com ou sem barras nas pontas e acerta o número de células de cada
  // linha pelo separador: falta vira célula vazia; sobra vai para a última.
  function readMarkdownTable(lines, start) {
    const width = splitTableRow(lines[start + 1]).length;
    const fit = cells => {
      const row = cells.slice(0, width);
      if (cells.length > width) {
        const extra = cells.slice(width).filter(Boolean);
        if (extra.length) row[width - 1] = [row[width - 1], ...extra].filter(Boolean).join(' / ');
      }
      while (row.length < width) row.push('');
      return row;
    };
    const rows = [fit(splitTableRow(lines[start]))];
    let index = start + 2;
    while (index < lines.length && lines[index].trim() && hasUnescapedPipe(lines[index]) && !SEPARATOR_RE.test(lines[index])) {
      rows.push(fit(splitTableRow(lines[index])));
      index += 1;
    }
    while (index < lines.length && SEPARATOR_RE.test(lines[index])) index += 1;
    return { rows, next: index };
  }

  function isTableStart(lines, index) {
    return hasUnescapedPipe(lines[index]) && !SEPARATOR_RE.test(lines[index]) && SEPARATOR_RE.test(lines[index + 1] || '')
      && splitTableRow(lines[index]).length >= 2;
  }

  // Limites alinhados ao pedido feito à IA (até 4 colunas, células de até ~30
  // palavras), com folga. Acima disso a tabela não cabe com leitura confortável
  // numa folha A4 e vira lista rotulada.
  function tableFitsA4(headers, rows) {
    if (headers.length < 2 || headers.length > 5 || rows.length < 1) return false;
    const matrix = [headers, ...rows];
    return matrix.every(row => row.length === headers.length && row.every(cell => {
      const value = String(cell).replace(/[*_`]/g, '').replace(CELL_BREAK_RE, ' ').trim();
      return value.length <= 320 && value.split(/\s+/).filter(Boolean).length <= 45;
    })) && rows.every(row => row.reduce((sum, cell) => sum + String(cell).length, 0) <= 900);
  }

  function normalize(markdown) {
    // A IA às vezes quebra a célula com <br>; sem esta proteção a conversão de
    // HTML partia a linha da tabela em várias e a tabela inteira desmontava.
    const protectedBreaks = String(markdown || '').replace(/\r\n?/g, '\n').split('\n')
      .map(line => (hasUnescapedPipe(line) ? line.replace(/<br\b[^>]*>/gi, CELL_BREAK) : line))
      .join('\n');
    const lines = removeDiagramSyntax(legacyHtmlToMarkdown(protectedBreaks)).split('\n');
    const output = [];
    const escapeCell = cell => String(cell).replace(/\|/g, '\\|').replace(CELL_BREAK_RE, '<br>');
    for (let index = 0; index < lines.length;) {
      if (!isTableStart(lines, index)) {
        // Linha solta com barras (sem separador) não é tabela: some com as barras das pontas.
        const line = lines[index++];
        output.push(/^\s*\|.*\|\s*$/.test(line) ? line.replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '').replace(/\s*(?<!\\)\|\s*/g, ' — ') : line);
        continue;
      }
      const parsed = readMarkdownTable(lines, index);
      const [headers, ...rows] = parsed.rows;
      if (output.length && output[output.length - 1].trim()) output.push('');
      if (tableFitsA4(headers, rows)) {
        output.push(`| ${headers.map(escapeCell).join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`);
        rows.forEach(row => output.push(`| ${row.map(escapeCell).join(' | ')} |`));
      } else {
        rows.forEach(row => {
          const fields = row.map((cell, cellIndex) => cell ? `**${(headers[cellIndex] || 'Item').replace(CELL_BREAK_RE, ' ')}:** ${cell.replace(CELL_BREAK_RE, '; ')}` : '').filter(Boolean);
          if (fields.length) output.push(`- ${fields.join('; ')}`);
        });
      }
      output.push('');
      index = parsed.next;
    }
    return output.join('\n').replace(CELL_BREAK_RE, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(decodeEntities(value));
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }

  function inline(value, options) {
    let text = escapeHtml(value);
    const parts = [];
    const prefix = `REPORTPART${Math.random().toString(36).slice(2)}`;
    const hold = html => { const key = `${prefix}${parts.length}END`; parts.push(html); return key; };
    text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+"([^"]*)")?\)/g, (_, alt, source, caption) => {
      const url = safeHttpUrl(source);
      if (!url || (Array.isArray(options.allowedImageUrls) && !options.allowedImageUrls.includes(url))) return escapeHtml(alt);
      return hold(`<figure class="academic-report-figure"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`);
    });
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, source) => {
      const url = safeHttpUrl(source);
      return url ? hold(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`) : label;
    });
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>').replace(/`([^`]+)`/g, '$1');
    const safePrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`${safePrefix}(\\d+)END`, 'g'), (_, index) => parts[Number(index)] || '');
  }

  function heading(line, options) {
    const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) return '';
    const title = match[2].trim();
    const numbering = title.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
    const level = numbering ? Math.min(4, numbering[1].split('.').length + 1) : Math.min(4, Math.max(2, match[1].length));
    const content = numbering ? `${numbering[1]} ${numbering[2]}` : title;
    const style = level === 2 ? 'report-heading-primary' : level === 3 ? 'report-heading-secondary' : 'report-heading-tertiary';
    return `<h${level} class="academic-report-heading ${style}">${inline(content, options)}</h${level}>`;
  }

  function renderList(lines, start, options) {
    const entries = [];
    let i = start;
    let base = null;
    let parent = -1;
    while (i < lines.length) {
      const match = lines[i].match(/^(\s*)([-*+]\s+|\d+[.)]\s+)(.*)$/);
      if (!match) break;
      const indent = match[1].replace(/\t/g, '  ').length;
      if (base == null) base = indent;
      const parentIndex = indent === base ? ++parent : parent;
      entries.push({ indent, parentIndex, ordered: /^\d/.test(match[2]), text: match[3] });
      i += 1;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^(\s*)([-*+]\s+|\d+[.)]\s+)/.test(lines[i])) {
        entries[entries.length - 1].text += ` ${lines[i].trim()}`;
        i += 1;
      }
    }
    const minimum = Math.min(...entries.map(entry => entry.indent));
    const roots = entries.filter(entry => entry.indent === minimum);
    const subs = entries.filter(entry => entry.indent > minimum);
    const ordered = roots[0]?.ordered;
    let html = `<ol class="academic-report-list ${ordered ? 'report-list-numbered' : 'report-list-alineas'}"${ordered ? '' : ' type="a"'}>`;
    roots.forEach((root, index) => {
      html += `<li>${inline(root.text, options)}`;
      const children = subs.filter(child => child.parentIndex === index);
      if (children.length) html += `<ul class="academic-report-list report-list-subalineas">${children.map(child => `<li>${inline(child.text, options)}</li>`).join('')}</ul>`;
      html += '</li>';
    });
    return { html: `${html}</ol>`, next: i };
  }

  // Célula com quebras (<br>) é renderizada parte a parte, sem liberar HTML.
  function inlineCell(cell, options) {
    return String(cell || '').split(/<br\s*\/?>/i).map(part => inline(part.trim(), options)).join('<br>');
  }

  // Largura de cada coluna proporcional ao texto que ela carrega (entre 12% e
  // 55%), para "Classe" não ocupar o mesmo espaço que "Mecanismo".
  function columnWidths(headers, rows) {
    const plain = cell => String(cell || '').replace(/<br\s*\/?>/gi, ' ').replace(/[*_`]/g, '').trim();
    const weights = headers.map((header, column) => {
      const lengths = [header, ...rows.map(row => row[column])].map(cell => plain(cell).length);
      const average = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
      return Math.max(6, Math.sqrt(average * Math.max(...lengths)));
    });
    // Piso por coluna: cabe a palavra mais longa dela (≈4,8pt por caractere a
    // 9,5pt numa área útil de 16 cm), para não hifenizar "Betabloqueador".
    const floors = headers.map((header, column) => {
      const longestWord = Math.max(0, ...[header, ...rows.map(row => row[column])]
        .flatMap(cell => plain(cell).split(/\s+/)).map(word => word.length));
      return Math.min(30, Math.max(10, (longestWord * 4.8 + 14) / 453 * 100));
    });
    let widths = weights.map(weight => weight / weights.reduce((sum, value) => sum + value, 0) * 100);
    for (let pass = 0; pass < 4; pass++) {
      widths = widths.map((width, column) => Math.min(55, Math.max(floors[column], width)));
      const total = widths.reduce((sum, value) => sum + value, 0);
      widths = widths.map(width => width / total * 100);
    }
    return widths.map(width => Math.round(width * 10) / 10);
  }

  function renderTable(headers, rows, options) {
    const widths = columnWidths(headers, rows);
    return `<table class="academic-report-table"><colgroup>${widths.map(width => `<col style="width:${width}%">`).join('')}</colgroup>`
      + `<thead><tr>${headers.map(cell => `<th scope="col">${inlineCell(cell, options)}</th>`).join('')}</tr></thead>`
      + `<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${inlineCell(cell, options)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function render(markdown, options = {}) {
    if (Array.isArray(options.allowedImageUrls)) options.allowedImageUrls = options.allowedImageUrls.map(safeHttpUrl).filter(Boolean);
    const lines = normalize(markdown).split('\n');
    const html = [];
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      if (!line.trim()) { i += 1; continue; }
      const sectionHeading = heading(line, options);
      if (sectionHeading) { html.push(sectionHeading); i += 1; continue; }
      if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) { i += 1; continue; }
      if (isTableStart(lines, i)) {
        const parsed = readMarkdownTable(lines, i);
        const [headers = [], ...rows] = parsed.rows;
        if (tableFitsA4(headers, rows)) {
          html.push(renderTable(headers, rows, options));
          i = parsed.next;
          continue;
        }
      }
      if (/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line)) {
        const list = renderList(lines, i, options);
        html.push(list.html);
        i = list.next;
        continue;
      }
      if (/^\s*>/.test(line)) {
        const quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, '').trim());
        html.push(`<blockquote class="academic-report-quote"><p>${inline(quote.join(' '), options)}</p></blockquote>`);
        continue;
      }
      if (/^!\[[^\]]*\]\(https?:\/\/[^\s)]+(?:\s+"[^"]*")?\)$/.test(line.trim())) {
        html.push(inline(line.trim(), options));
        i += 1;
        continue;
      }
      const paragraph = [line.trim()];
      i += 1;
      while (i < lines.length && lines[i].trim() && !heading(lines[i], options)
        && !/^\s*(?:[-*+]\s+|\d+[.)]\s+|>)/.test(lines[i])
        && !/^\s*\|.*\|\s*$/.test(lines[i]) && !isTableStart(lines, i)
        && !/^\s*(?:[-*_]\s*){3,}$/.test(lines[i])
        && !/^!\[[^\]]*\]\(https?:\/\/[^\s)]+(?:\s+"[^"]*")?\)$/.test(lines[i].trim())) paragraph.push(lines[i++].trim());
      html.push(`<p class="academic-report-paragraph">${inline(paragraph.join(' '), options)}</p>`);
    }
    return html.join('\n');
  }

  return { normalize, render, tableFitsA4, extractReportTitle };
});
