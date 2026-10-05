(() => {
  'use strict';

  const DEFAULT_FIREBASE_CONFIG = {
    apiKey: 'AIzaSyBoqV_J-QDapbAGfisZ-vmxCMOxWkq9ZUs',
    authDomain: 'cobra-ai-6549d.firebaseapp.com',
    projectId: 'cobra-ai-6549d',
    storageBucket: 'cobra-ai-6549d.firebasestorage.app',
    messagingSenderId: '275562725419',
    appId: '1:275562725419:web:015ed34d8e933ef64bea6e'
  };

  const status = document.getElementById('annStatus');
  const list = document.getElementById('annList');
  const adminPanel = document.getElementById('annAdmin');
  const adminStatus = document.getElementById('annAdminStatus');
  const form = document.getElementById('annForm');
  const preview = document.getElementById('annPreview');
  let auth = null;

  function escapeText(value) {
    return String(value || '');
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(date) : '';
  }

  function renderDescription(container, source) {
    container.replaceChildren();
    const paragraphs = String(source || '').split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
    for (const text of paragraphs) {
      const p = document.createElement('p');
      p.textContent = text;
      container.appendChild(p);
    }
  }

  function makeCard(item) {
    const article = document.createElement('article');
    article.className = 'ann-card';
    const heading = document.createElement('header');
    const version = document.createElement('span');
    version.className = 'ann-version';
    version.textContent = escapeText(item.version);
    heading.appendChild(version);
    const dateText = formatDate(item.publishedAt);
    if (dateText) {
      const date = document.createElement('time');
      date.className = 'ann-date';
      date.dateTime = item.publishedAt;
      date.textContent = dateText;
      heading.appendChild(date);
    }
    const title = document.createElement('h2');
    title.textContent = escapeText(item.title);
    article.append(heading, title);
    if (item.bannerUrl) {
      const image = document.createElement('img');
      image.className = 'ann-banner';
      image.src = item.bannerUrl;
      image.alt = escapeText(item.bannerAlt || `Banner da atualização ${item.version}`);
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      article.appendChild(image);
    }
    const description = document.createElement('div');
    description.className = 'ann-description';
    renderDescription(description, item.description);
    article.appendChild(description);
    return article;
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (auth?.currentUser) headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
    if (options.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...options, headers });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Não foi possível concluir a solicitação.');
    return body;
  }

  async function loadAnnouncements() {
    try {
      const result = await request('/api/announcements');
      list.replaceChildren(...(result.announcements || []).map(makeCard));
      status.textContent = result.announcements?.length ? '' : 'Ainda não há atualizações publicadas.';
      if (result.announcements?.length && auth?.currentUser) {
        const id = new URLSearchParams(location.search).get('id') || result.announcements[0].id;
        await request(`/api/announcements/me/${encodeURIComponent(id)}/read`, { method: 'POST' }).catch(() => {});
      }
    } catch (error) {
      status.textContent = `${error.message} Tente novamente em instantes.`;
    }
  }

  function collectForm() {
    const data = new FormData(form);
    return Object.fromEntries(['version', 'title', 'description', 'bannerUrl', 'bannerAlt'].map(key => [key, String(data.get(key) || '').trim()]));
  }

  function renderPreview(data) {
    preview.replaceChildren(makeCard({ ...data, publishedAt: new Date().toISOString() }));
    preview.hidden = false;
    preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function setupAdmin() {
    if (!auth?.currentUser) return;
    try {
      const result = await request('/api/announcements/admin/status');
      adminPanel.hidden = result.isAdmin !== true;
    } catch (_) {
      adminPanel.hidden = true;
    }
  }

  document.getElementById('annPreviewButton').addEventListener('click', () => renderPreview(collectForm()));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    adminStatus.textContent = 'Publicando atualização…';
    try {
      await request('/api/announcements', { method: 'POST', body: JSON.stringify(collectForm()) });
      adminStatus.textContent = 'Atualização publicada e disponível na página de anúncios.';
      form.reset();
      preview.hidden = true;
      await loadAnnouncements();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      adminStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  async function init() {
    try {
      const config = JSON.parse(localStorage.getItem('medtutor_custom_firebase_config') || 'null') || DEFAULT_FIREBASE_CONFIG;
      if (window.firebase) {
        const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
        auth = app.auth();
        auth.onAuthStateChanged(async () => {
          await setupAdmin();
          await loadAnnouncements();
        });
      } else {
        await loadAnnouncements();
      }
    } catch (error) {
      status.textContent = 'Não foi possível iniciar a página. Tente atualizar.';
      console.warn('[Anúncios MedTutor] Falha ao inicializar:', error);
    }
  }

  init();
})();
