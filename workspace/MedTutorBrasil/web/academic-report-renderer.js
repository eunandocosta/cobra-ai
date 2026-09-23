(function attachAcademicReportRenderer(root, factory) {
  const renderer = factory();
  if (typeof module === 'object' && module.exports) module.exports = renderer;
  if (root) root.AcademicReportRenderer = renderer;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAcademicReportRenderer() {
  'use strict';

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

  function legacyHtmlToMarkdown(input) {
    let text = decodeEntities(input).replace(/\\(?=<\/?(?:h[1-6]|ul|ol|li|p|div|br|strong|b|em|i|u)\b)/gi, '');
    text = text.replace(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi, (_, body) => {
      const rows = [...String(body).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map(([, row]) => ({
        heading: /<th\b/i.test(row),
        cells: [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)].map(([, cell]) => inlineText(cell).replace(/\|/g, '\\|'))
      })).filter(row => row.cells.length);
      if (!rows.length) return '\n';
      if (!rows[0].heading) return '\n' + rows.map(row => '- ' + row.cells.join('; ')).join('\n') + '\n';
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

  function readMarkdownTable(lines, start) {
    const rows = [];
    let index = start;
    while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
      const line = lines[index];
      if (!/^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)) {
        rows.push(line.trim().replace(/^\|/, '').replace(/\|$/, '')
          .split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|')));
      }
      index += 1;
    }
    return { rows, next: index };
  }

  function tableFitsA4(headers, rows) {
    if (!headers.length || headers.length > 3 || rows.length < 1) return false;
    const matrix = [headers, ...rows];
    return matrix.every(row => row.length === headers.length && row.every(cell => {
      const value = String(cell).replace(/[*_`]/g, '').trim();
      return value.length <= 100 && value.split(/\s+/).filter(Boolean).length <= 16;
    })) && rows.every(row => row.reduce((sum, cell) => sum + String(cell).length, 0) <= 240);
  }

  function normalize(markdown) {
    const lines = removeDiagramSyntax(legacyHtmlToMarkdown(String(markdown || '').replace(/\r\n?/g, '\n'))).split('\n');
    const output = [];
    for (let index = 0; index < lines.length;) {
      if (!/^\s*\|.*\|\s*$/.test(lines[index])) { output.push(lines[index++]); continue; }
      const parsed = readMarkdownTable(lines, index);
      const hasHeader = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[index + 1] || '');
      if (!hasHeader || parsed.rows.length < 2) {
        output.push(lines[index++].replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, ''));
        continue;
      }
      const [headers, ...rows] = parsed.rows;
      if (tableFitsA4(headers, rows)) {
        output.push(`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`);
        rows.forEach(row => output.push(`| ${row.join(' | ')} |`));
      } else {
        rows.forEach(row => {
          const fields = row.map((cell, cellIndex) => cell ? `**${headers[cellIndex] || 'Item'}:** ${cell}` : '').filter(Boolean);
          if (fields.length) output.push(`- ${fields.join('; ')}`);
        });
      }
      index = parsed.next;
    }
    return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
      if (children.length) html += `<ul class="academic-report-list report-list-subalineas">${children.map(child => `<li><span aria-hidden="true">—</span>${inline(child.text, options)}</li>`).join('')}</ul>`;
      html += '</li>';
    });
    return { html: `${html}</ol>`, next: i };
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
      if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1] || '')) {
        const parsed = readMarkdownTable(lines, i);
        const [headers = [], ...rows] = parsed.rows;
        if (tableFitsA4(headers, rows)) {
          html.push(`<table class="academic-report-table"><thead><tr>${headers.map(cell => `<th scope="col">${inline(cell, options)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${inline(cell, options)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
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
        && !/^\s*\|.*\|\s*$/.test(lines[i])
        && !/^!\[[^\]]*\]\(https?:\/\/[^\s)]+(?:\s+"[^"]*")?\)$/.test(lines[i].trim())) paragraph.push(lines[i++].trim());
      html.push(`<p class="academic-report-paragraph">${inline(paragraph.join(' '), options)}</p>`);
    }
    return html.join('\n');
  }

  return { normalize, render, tableFitsA4 };
});
