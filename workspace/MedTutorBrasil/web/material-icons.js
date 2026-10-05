(function setupMedTutorMaterialIcons() {
  'use strict';

  const iconByEmoji = [...new Map([
    ['⚠️', 'warning'], ['⚡', 'bolt'], ['💡', 'lightbulb'], ['✅', 'check_circle'], ['✨', 'auto_awesome'],
    ['📄', 'description'], ['↗', 'open_in_new'], ['📖', 'menu_book'], ['📋', 'assignment'], ['⏳', 'hourglass_top'],
    ['🔬', 'biotech'], ['📚', 'library_books'], ['🗑️', 'delete'], ['⭐', 'star'], ['🩺', 'medical_services'],
    ['🎯', 'gps_fixed'], ['🔄', 'sync'], ['🟢', 'circle'], ['⚔️', 'sports_martial_arts'], ['👎', 'thumb_down'],
    ['📝', 'edit_note'], ['👍', 'thumb_up'], ['🏛️', 'account_balance'], ['📥', 'move_to_inbox'], ['ℹ️', 'info'],
    ['❌', 'cancel'], ['📌', 'push_pin'], ['🔍', 'search'], ['🗂️', 'folder_copy'], ['🛡️', 'shield'],
    ['🎓', 'school'], ['📑', 'difference'], ['💊', 'medication'], ['📊', 'analytics'], ['🎉', 'celebration'],
    ['📁', 'folder'], ['🧠', 'psychology'], ['⏱️', 'timer'], ['📤', 'outbox'], ['✍️', 'edit'],
    ['🚀', 'rocket_launch'], ['🖨️', 'print'], ['🧭', 'explore'], ['🔗', 'link'], ['☁️', 'cloud'],
    ['✏️', 'edit'], ['📷', 'photo_camera'], ['⚙️', 'settings'], ['🎲', 'casino'], ['🏥', 'local_hospital'],
    ['💾', 'save'], ['🏆', 'emoji_events'], ['👥', 'groups'], ['🔐', 'lock'], ['🔁', 'cached'],
    ['🚨', 'emergency'], ['📅', 'calendar_month'], ['👆', 'touch_app'], ['🔎', 'search'], ['🟡', 'circle'],
    ['🔴', 'circle'], ['🧪', 'science'], ['➕', 'add'], ['👋', 'waving_hand'], ['▪', 'square'],
    ['🖼️', 'image'], ['🗓️', 'event'], ['🔵', 'circle'], ['🟠', 'circle'], ['◀', 'arrow_back'],
    ['▶', 'arrow_forward'], ['💬', 'chat'], ['🏁', 'flag'], ['📬', 'mark_email_unread'], ['📭', 'inventory_2'],
    ['🧹', 'cleaning_services'], ['💸', 'payments'], ['🔥', 'local_fire_department'], ['📂', 'folder_open'],
    ['🔑', 'key'], ['↘', 'south_east'], ['📘', 'menu_book'], ['👤', 'person'], ['⚖️', 'balance'],
    ['🧬', 'genetics'], ['❤️', 'favorite'], ['🫁', 'pulmonology'], ['👶', 'child_care'], ['🔔', 'notifications'],
    ['⏭️', 'skip_next'], ['🤖', 'smart_toy'], ['🌐', 'public'], ['📢', 'campaign'], ['✉️', 'mail'],
    ['🏅', 'military_tech'], ['↔', 'swap_horiz'], ['🌙', 'dark_mode'], ['🩻', 'radiology'], ['🫀', 'cardiology'],
    ['📍', 'location_on'], ['📎', 'attach_file'], ['❓', 'help'], ['➡️', 'arrow_forward'], ['👁️', 'visibility'],
    ['✕', 'close'], ['→', 'arrow_forward'], ['←', 'arrow_back']
  ]).entries()].sort((a, b) => b[0].length - a[0].length);

  const iconUiSelector = [
    'button', 'a[role="button"]', '.button', '.back', '[role="tab"]', '.nav-link', '.mobile-nav-btn', '.badge', '[class*="badge"]',
    '.pill', '[class*="-pill"]', '.toast-popup', '.toast', '.empty-state-icon', '.empty-state-notice',
    '.finish-badge', '.modal-head', '.waze-title', '.topbar-title', '.reading-doc-badge', '.learning-step-pill',
    '.support-modal-icon', '.auth-session-mark', '.level-up-heading', '.gamification-level-mark', 'label',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
  ].join(',');
  const contentSelectors = [
    '.chat-message', '.chat-response', '.message-content', '.report-content', '.report-preview', '.report-body',
    '.flashcard-question', '.flashcard-answer', '.quiz-question', '.quiz-explanation', '.study-material-content',
    '[contenteditable="true"]', 'textarea', 'input'
  ].join(',');

  const semanticRules = [
    [/close|fechar|cancel|dismiss/i, 'close'], [/back|voltar|retornar/i, 'arrow_back'],
    [/next|pr[oó]xim|avançar|avancar/i, 'arrow_forward'], [/chat|mensagem|conversa|d[uú]vida/i, 'chat_bubble'],
    [/flash ?card|cart[aã]o/i, 'style'], [/quiz|quest[aã]o|question|caso/i, 'quiz'],
    [/mat[eé]ria|ementa|disciplina|material|livro/i, 'menu_book'], [/sce|waze|rota|cronograma|evolu[cç][aã]o/i, 'monitoring'],
    [/desafio|duelo|combate/i, 'sports_martial_arts'], [/config|settings|prefer[eê]ncia/i, 'settings'],
    [/upload|anex|enviar arquivo/i, 'upload_file'], [/suporte|support|ajuda|help/i, 'help'],
    [/pesquis|buscar|search/i, 'search'], [/delete|excluir|remover|lixeira/i, 'delete'],
    [/salvar|save|gravar/i, 'save'], [/editar|renomear|edit/i, 'edit'], [/sincron|cloud|nuvem/i, 'cloud_sync'],
    [/sair|logout|sign.?out|encerrar sess[aã]o/i, 'logout'], [/perfil|usu[aá]rio|conta|user/i, 'person'],
    [/calend[aá]rio|data|agenda|cronograma/i, 'calendar_month'], [/pasta|folder|drive/i, 'folder_open'],
    [/pesquisar|lupa/i, 'search'], [/copiar|clipboard/i, 'content_copy'], [/refresh|recalcul|tentar novamente/i, 'refresh'],
    [/abrir|open|acessar/i, 'open_in_new'], [/seguran[cç]a|cadeado|bloquear/i, 'lock'],
    [/imagem|foto|picture/i, 'image'], [/espera|carreg|processando/i, 'progress_activity'],
    [/conclu|correto|success|confirm/i, 'check_circle'], [/erro|error|alerta|warning/i, 'warning'],
    [/upload|arquivo|documento|pdf/i, 'description'], [/ponto|xp|n[ií]vel|gamifica/i, 'emoji_events'],
    [/google/i, 'login'], [/tema|noite|dark/i, 'dark_mode'], [/menu|sidebar|hist[oó]rico/i, 'menu']
  ];

  function shouldPreserveSvg(svg) {
    return Boolean(svg.closest('.brand-logo, .brand-mark, .cta-mark, .footer-brand, .auth-logo-badge, .pwa-boot-mark, .google-icon, .sidebar-toggle-icon, .topbar-utility-icon, .chat-message, .chat-response, .message-content, .report-content, .report-preview, .report-body, .flashcard-question, .flashcard-answer, .quiz-question, .quiz-explanation, .study-material-content'));
  }

  function inferIconName(element) {
    const svg = element.matches('svg') ? element : null;
    const button = element.closest('button, a, [role="button"], [role="tab"]');
    const host = button || element.closest('.empty-state, .empty-state-icon, .modal-head, .waze-title, .topbar-title, label, h1, h2, h3, h4, h5, h6') || element.parentElement;
    const context = [
      element.getAttribute('aria-label'), element.getAttribute('title'), element.id, element.className?.baseVal || element.className,
      host?.getAttribute('aria-label'), host?.getAttribute('title'), host?.getAttribute('onclick'), host?.textContent
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    if (/sidebar-toggle-icon/i.test(context)) return 'menu';
    if (/themeIcon/i.test(context)) return 'dark_mode';
    if (/class=.?[^>]*sparkle-hero-icon/i.test(context)) return 'auto_awesome';
    for (const [pattern, name] of semanticRules) if (pattern.test(context)) return name;

    const pathData = svg ? Array.from(svg.querySelectorAll('path, line, polyline, rect, circle')).map(shape => shape.getAttribute('d') || shape.getAttribute('points') || '').join(' ') : '';
    if (/M18 6L6 18|M6 6l12 12|M18 6 6 18/i.test(pathData)) return 'close';
    if (/M12 5v14|M12 5v14|M5 12h14/i.test(pathData)) return 'add';
    if (/M21 15a2 2 0 0 1-2 2H7/i.test(pathData)) return 'chat_bubble';
    if (/M21 15v4a2 2 0 0 1-2 2H5/i.test(pathData)) return 'upload_file';
    if (/M3 6h18|M3 6h18/i.test(pathData)) return 'delete';
    return 'auto_awesome';
  }

  function createMaterialIcon(name, className = '', size = '') {
    const icon = document.createElement('span');
    icon.className = `material-symbol-font${className ? ` ${className}` : ''}`;
    icon.textContent = name;
    icon.setAttribute('aria-hidden', 'true');
    icon.dataset.materialIcon = name;
    if (size) icon.style.fontSize = size;
    return icon;
  }

  function convertSvg(svg) {
    if (svg.dataset.materialConverted || shouldPreserveSvg(svg)) return;
    const name = inferIconName(svg);
    const classes = svg.getAttribute('class') || '';
    const rawSize = svg.style.width || svg.getAttribute('width') || '';
    const size = /^\d+(?:\.\d+)?$/.test(rawSize) ? `${rawSize}px` : rawSize;
    const replacement = createMaterialIcon(name, classes, size);
    if (svg.id) replacement.id = svg.id;
    if (svg.getAttribute('style')) replacement.setAttribute('style', svg.getAttribute('style'));
    if (size) replacement.style.fontSize = size;
    if (svg.getAttribute('title')) replacement.setAttribute('title', svg.getAttribute('title'));
    if (svg.getAttribute('aria-label')) replacement.setAttribute('aria-label', svg.getAttribute('aria-label'));
    if (svg.hasAttribute('aria-hidden')) replacement.setAttribute('aria-hidden', svg.getAttribute('aria-hidden'));
    if (svg.hasAttribute('role')) replacement.setAttribute('role', svg.getAttribute('role'));
    svg.replaceWith(replacement);
  }

  function isIconUiText(textNode) {
    const parent = textNode.parentElement;
    if (!parent || parent.closest(contentSelectors) || parent.closest('.material-symbol-font')) return false;
    return Boolean(parent.closest(iconUiSelector));
  }

  function convertLeadingEmoji(textNode) {
    if (!isIconUiText(textNode)) return;
    const value = textNode.nodeValue || '';
    const whitespace = value.match(/^\s*/)?.[0] || '';
    const text = value.slice(whitespace.length);
    const match = iconByEmoji.find(([emoji]) => text.startsWith(emoji));
    if (!match) return;
    const rest = text.slice(match[0].length);
    if (rest && !/^\s/.test(rest)) return;
    const parent = textNode.parentNode;
    if (!parent) return;
    if (whitespace) parent.insertBefore(document.createTextNode(whitespace), textNode);
    parent.insertBefore(createMaterialIcon(match[1]), textNode);
    textNode.nodeValue = rest;
  }

  function processRoot(root) {
    if (!root) return;
    if (root.nodeType === Node.ELEMENT_NODE && root.matches('svg')) convertSvg(root);
    if (root.querySelectorAll) root.querySelectorAll('svg').forEach(convertSvg);
    if (root.nodeType === Node.TEXT_NODE) {
      convertLeadingEmoji(root);
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(convertLeadingEmoji);
  }

  function init() {
    if (!document.body) return;
    processRoot(document.body);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') processRoot(record.target);
        record.addedNodes?.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) processRoot(node); });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
