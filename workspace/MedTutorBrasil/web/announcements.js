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
  const emailPreferences = document.getElementById('annEmailPreferences');
  const emailOptIn = document.getElementById('annEmailOptIn');
  const emailPreferenceStatus = document.getElementById('annEmailPreferenceStatus');
  const campaignList = document.getElementById('annCampaignList');
  const campaignConfig = document.getElementById('annCampaignConfig');
  const usersList = document.getElementById('annUserList');
  const usersStatus = document.getElementById('annUserStatus');
  const userSearch = document.getElementById('annUserSearch');
  const loadMoreUsersButton = document.getElementById('annLoadMoreUsers');
  const kindSelect = document.getElementById('annKind');
  const nextVersionInput = document.getElementById('annNextVersion');
  const askConsentInput = document.getElementById('annAskConsent');
  const promptRequiredInput = document.getElementById('annPromptRequired');
  const promptTextInput = form.elements.promptText;
  const authLink = document.getElementById('annAuthLink');
  let auth = null;
  let unsubscribeMessage = '';
  let adminUsers = [];
  let nextUserPageToken = null;
  let userPageTokens = [null];
  let userPageIndex = 0;
  let publicationPageToken = null;
  let editingPublicationId = '';
  let isAdmin = false;
  const loadedAdminViews = new Set();

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
    version.textContent = item.kind === 'notice'
      ? 'Aviso da MedTutor Brasil'
      : `Atualização ${escapeText(item.version || '—')}`;
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
      image.alt = escapeText(item.bannerAlt || `Banner ${item.kind === 'notice' ? 'do aviso' : `da atualização ${item.version}`}`);
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
      status.textContent = unsubscribeMessage || (result.announcements?.length ? '' : 'Ainda não há atualizações publicadas.');
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
    return {
      kind: String(data.get('kind') || 'update'),
      title: String(data.get('title') || '').trim(),
      description: String(data.get('description') || '').trim(),
      bannerUrl: String(data.get('bannerUrl') || '').trim(),
      bannerAlt: String(data.get('bannerAlt') || '').trim(),
      channels: { inApp: data.has('sendInApp'), email: data.has('sendEmail') },
      showProductHighlights: data.has('showProductHighlights'),
      emailConsentPrompt: data.has('emailConsentPrompt'),
      promptResponseRequired: data.has('promptResponseRequired'),
      promptText: String(data.get('promptText') || '').trim()
    };
  }

  function renderPreview(data) {
    preview.replaceChildren(makeCard({ ...data, version: data.kind === 'update' ? nextVersionInput.value : '', publishedAt: new Date().toISOString() }));
    preview.hidden = false;
    preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function setupAdmin() {
    isAdmin = false;
    document.getElementById('annPublicIntro').hidden = false;
    list.hidden = false;
    status.hidden = false;
    emailPreferences.hidden = !auth?.currentUser;
    if (authLink) {
      authLink.href = auth?.currentUser ? '/chat-ia' : '/login';
      authLink.textContent = auth?.currentUser ? 'Voltar ao app' : 'Entrar';
    }
    if (!auth?.currentUser) {
      adminPanel.hidden = true;
      return;
    }
    try {
      const result = await request('/api/announcements/admin/status');
      isAdmin = result.isAdmin === true;
      adminPanel.hidden = !isAdmin;
      document.getElementById('annPublicIntro').hidden = isAdmin;
      emailPreferences.hidden = isAdmin || !auth?.currentUser;
      list.hidden = isAdmin;
      status.hidden = isAdmin;
      if (authLink) {
        authLink.href = auth.currentUser ? '/chat-ia' : '/login';
        authLink.textContent = auth.currentUser ? 'Voltar ao app' : 'Entrar';
      }
      if (isAdmin) {
        showAdminView('overview');
        await loadAdminSummary();
        if (location.hash === '#annAdmin') {
          requestAnimationFrame(() => adminPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }
      }
    } catch (_) {
      adminPanel.hidden = true;
    }
    if (!isAdmin) await loadEmailPreference();
  }

  async function loadEmailPreference() {
    if (!auth?.currentUser) return;
    try {
      const result = await request('/api/announcements/me/email-preference');
      emailOptIn.checked = result.optIn === true;
      emailPreferenceStatus.textContent = result.email ? `E-mail cadastrado: ${result.email}` : 'O endereço confirmado da sua conta será usado.';
    } catch (error) {
      emailPreferenceStatus.textContent = error.message;
    }
  }

  function campaignLabel(statusValue) {
    return ({ queued: 'Na fila', sending: 'Enviando', sent: 'Concluído', partial: 'Parcial — requer atenção', failed: 'Falhou', configuration_required: 'Provedor não configurado' })[statusValue] || 'Status desconhecido';
  }

  async function loadEmailCampaigns() {
    if (!auth?.currentUser || adminPanel.hidden) return;
    try {
      const result = await request('/api/announcements/admin/email-campaigns');
      campaignConfig.textContent = result.configured ? 'Provedor de e-mail configurado no servidor.' : 'Para ativar envios, configure RESEND_API_KEY, ANNOUNCEMENT_FROM_EMAIL e ANNOUNCEMENT_UNSUBSCRIBE_SECRET nos secrets do servidor.';
      campaignList.replaceChildren();
      for (const campaign of result.campaigns || []) {
        const row = document.createElement('article');
        row.className = 'ann-campaign-row';
        const details = document.createElement('div');
        const heading = document.createElement('strong');
        heading.textContent = campaign.announcementId || campaign.id;
        const meta = document.createElement('p');
        meta.textContent = `${campaignLabel(campaign.status)} · ${Number(campaign.sentCount) || 0}/${Number(campaign.recipientCount) || 0} enviados${campaign.failedCount ? ` · ${campaign.failedCount} falhas` : ''}${campaign.lastError ? ` · ${campaign.lastError}` : ''}`;
        details.append(heading, meta);
        row.appendChild(details);
        if (result.configured && ['partial', 'failed', 'configuration_required'].includes(campaign.status)) {
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'ann-button secondary';
          retry.textContent = 'Tentar novamente';
          retry.addEventListener('click', async () => {
            retry.disabled = true;
            try {
              await request(`/api/announcements/${encodeURIComponent(campaign.announcementId || campaign.id)}/email/retry`, { method: 'POST' });
              await loadEmailCampaigns();
            } catch (error) {
              meta.textContent = error.message;
              retry.disabled = false;
            }
          });
          row.appendChild(retry);
        }
        campaignList.appendChild(row);
      }
      if (!campaignList.childElementCount) campaignList.textContent = 'Nenhuma campanha de e-mail ainda.';
    } catch (error) {
      campaignList.textContent = error.message;
    }
  }

  function publicationTitle(item) {
    return `${item.kind === 'notice' ? 'Aviso da MedTutor Brasil' : `Atualização ${item.version || ''}`} · ${item.title}`;
  }

  function renderSummary(items) {
    const container = document.getElementById('annSummaryList');
    container.replaceChildren();
    for (const item of items || []) {
      const row = document.createElement('article'); row.className = 'ann-summary-row';
      const info = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = publicationTitle(item);
      const description = document.createElement('p'); description.textContent = `${formatDate(item.publishedAt)} · ${item.channels?.inApp ? 'Blog + entrada do usuário' : 'Somente e-mail'}`;
      const meta = document.createElement('div'); meta.className = 'ann-summary-meta';
      const email = document.createElement('span'); email.textContent = item.channels?.email ? `${campaignLabel(item.emailStatus)} · ${item.sentCount}/${item.recipientCount} enviados` : 'E-mail não selecionado';
      meta.appendChild(email);
      if (item.failedCount) { const failed = document.createElement('span'); failed.textContent = `${item.failedCount} falha(s)`; meta.appendChild(failed); }
      info.append(title, description, meta);
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'ann-button secondary'; edit.textContent = 'Editar publicação'; edit.addEventListener('click', () => beginEdit(item));
      row.append(info, edit); container.appendChild(row);
    }
  }

  async function loadAdminSummary() {
    const target = document.getElementById('annSummaryStatus'); target.textContent = 'Carregando os três envios mais recentes…';
    try {
      const result = await request('/api/announcements/admin/summary'); renderSummary(result.announcements || []);
      target.textContent = result.announcements?.length ? '' : 'Nenhuma publicação foi feita ainda.';
    } catch (error) { target.textContent = error.message; }
  }

  function showAdminView(view) {
    if (!isAdmin) return;
    const mapping = { overview: 'annAdminOverview', publications: 'annAdminPublications', users: 'annAdminUsersView' };
    for (const [key, id] of Object.entries(mapping)) document.getElementById(id).hidden = key !== view;
    document.querySelectorAll('#annAdminTabs [data-admin-view]').forEach(button => {
      if (button.dataset.adminView === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    if (loadedAdminViews.has(view)) return;
    loadedAdminViews.add(view);
    if (view === 'publications') { loadNextVersion(); loadAdminPublications(); }
    if (view === 'users') loadAdminUsers();
  }

  function beginEdit(item) {
    editingPublicationId = item.id;
    form.elements.kind.value = item.kind;
    form.elements.title.value = item.title || '';
    form.elements.description.value = item.description || '';
    form.elements.bannerUrl.value = item.bannerUrl || '';
    form.elements.bannerAlt.value = item.bannerAlt || '';
    form.elements.sendInApp.checked = item.channels?.inApp !== false;
    form.elements.sendEmail.checked = item.channels?.email === true;
    form.elements.showProductHighlights.checked = item.showProductHighlights === true;
    form.elements.showProductHighlights.disabled = item.channels?.email !== true;
    form.elements.emailConsentPrompt.checked = false;
    form.elements.promptResponseRequired.checked = false;
    form.elements.sendInApp.disabled = true;
    form.elements.sendEmail.disabled = true;
    kindSelect.disabled = true;
    document.getElementById('annDistributionHint').textContent = 'Os canais e a versão ficam preservados ao editar. Alterações de texto são refletidas no blog e na entrada do usuário; e-mails já enviados não podem ser alterados.';
    updateKindControls();
    document.getElementById('annFormHeading').textContent = `Editar ${item.kind === 'notice' ? 'aviso' : `atualização ${item.version || ''}`}`;
    form.querySelector('[type="submit"]').textContent = 'Salvar alterações';
    document.getElementById('annCancelEdit').hidden = false;
    showAdminView('publications');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clearEdit() {
    editingPublicationId = '';
    form.reset(); form.elements.kind.value = 'update'; form.elements.sendInApp.checked = true;
    form.elements.sendInApp.disabled = false; form.elements.sendEmail.disabled = false; kindSelect.disabled = false;
    form.elements.showProductHighlights.disabled = false;
    document.getElementById('annDistributionHint').textContent = 'Blog e entrada do usuário usam a mesma publicação. A entrada mostra somente a mais recente; uma nova substitui a anterior ainda não visualizada.';
    document.getElementById('annFormHeading').textContent = 'Novo aviso ou atualização';
    form.querySelector('[type="submit"]').textContent = 'Publicar';
    document.getElementById('annCancelEdit').hidden = true;
    updatePromptControls(); updateKindControls();
  }

  async function loadAdminPublications(append = false) {
    const container = document.getElementById('annPublicationList');
    const target = document.getElementById('annPublicationStatus');
    target.textContent = append ? 'Carregando…' : 'Carregando publicações…';
    try {
      const query = append && publicationPageToken ? `?pageToken=${encodeURIComponent(publicationPageToken)}` : '';
      const result = await request(`/api/announcements/admin/publications${query}`);
      if (!append) container.replaceChildren();
      for (const item of result.announcements || []) {
        const row = document.createElement('article'); row.className = 'ann-publication-row';
        const info = document.createElement('div'); const title = document.createElement('strong'); title.textContent = publicationTitle(item);
        const description = document.createElement('p'); description.textContent = `${formatDate(item.publishedAt)} · ${item.channels?.inApp ? 'Blog + entrada' : 'Somente e-mail'}${item.channels?.email ? ' · E-mail habilitado' : ''}`;
        info.append(title, description);
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'ann-button secondary'; edit.textContent = 'Editar'; edit.addEventListener('click', () => beginEdit(item));
        row.append(info, edit); container.appendChild(row);
      }
      publicationPageToken = result.nextPageToken || null;
      document.getElementById('annLoadMorePublications').hidden = !publicationPageToken;
      target.textContent = result.announcements?.length ? '' : 'Nenhuma publicação encontrada.';
    } catch (error) { target.textContent = error.message; }
  }

  async function loadNextVersion() {
    try {
      const result = await request('/api/announcements/admin/next-version');
      nextVersionInput.value = result.version || 'Automática';
    } catch (_) { nextVersionInput.value = 'Calculada ao publicar'; }
  }

  function renderAdminUsers() {
    if (!usersList) return;
    const term = String(userSearch?.value || '').trim().toLocaleLowerCase('pt-BR');
    const matches = adminUsers.filter(user => [user.name, user.maskedEmail, user.faculty, user.period, user.cycle].join(' ').toLocaleLowerCase('pt-BR').includes(term));
    usersList.replaceChildren();
    if (!matches.length) {
      usersList.textContent = term ? 'Nenhum usuário corresponde à busca.' : 'Nenhum perfil encontrado.';
      return;
    }
    for (const user of matches) {
      const row = document.createElement('article');
      row.className = 'ann-user-row';
      const details = document.createElement('div');
      details.className = 'ann-user-details';
      const name = document.createElement('strong');
      name.textContent = user.name || 'Estudante';
      const meta = document.createElement('p');
      meta.textContent = [user.maskedEmail, user.faculty, user.period, user.cycle].filter(Boolean).join(' · ') || 'Dados de perfil não informados';
      const uid = document.createElement('small');
      uid.textContent = `UID ${user.uid}`;
      details.append(name, meta, uid);
      const role = document.createElement('select');
      role.setAttribute('aria-label', `Papel de ${user.name}`);
      for (const [value, label] of [['user', 'Usuário (Público Geral)'], ['partner', 'Partner (Curadoria)'], ['admin', 'Administrador']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = user.role === value;
        role.appendChild(option);
      }
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'ann-button secondary';
      save.textContent = 'Salvar papel';
      save.disabled = true;
      const originalRole = user.role;
      role.addEventListener('change', () => { save.disabled = role.value === originalRole; });
      save.addEventListener('click', async () => {
        save.disabled = true;
        usersStatus.textContent = `Atualizando papel de ${user.name}…`;
        try {
          await request(`/api/announcements/admin/users/${encodeURIComponent(user.uid)}/role`, { method: 'PATCH', body: JSON.stringify({ role: role.value }) });
          user.role = role.value;
          usersStatus.textContent = `Papel de ${user.name} atualizado.`;
          renderAdminUsers();
        } catch (error) {
          usersStatus.textContent = error.message;
          save.disabled = role.value === originalRole;
        }
      });
      row.append(details, role, save);
      usersList.appendChild(row);
    }
  }

  async function loadAdminUsers() {
    if (!auth?.currentUser || adminPanel.hidden) return;
    usersStatus.textContent = 'Carregando usuários…';
    try {
      const token = userPageTokens[userPageIndex];
      const query = token ? `?pageToken=${encodeURIComponent(token)}` : '';
      const result = await request(`/api/announcements/admin/users${query}`);
      adminUsers = result.users || [];
      nextUserPageToken = result.nextPageToken || null;
      loadMoreUsersButton.hidden = !nextUserPageToken;
      document.getElementById('annPreviousUsers').disabled = userPageIndex === 0;
      document.getElementById('annUserPage').textContent = `Página ${userPageIndex + 1} · até 5 usuários`;
      usersStatus.textContent = 'E-mails mascarados; credenciais não são consultadas.';
      renderAdminUsers();
    } catch (error) {
      usersStatus.textContent = error.message;
    }
  }

  function updatePromptControls() {
    const enabled = askConsentInput.checked && form.elements.sendInApp.checked;
    promptRequiredInput.disabled = !enabled;
    promptTextInput.disabled = !enabled;
    askConsentInput.disabled = !form.elements.sendInApp.checked || Boolean(editingPublicationId);
    document.getElementById('annEmailChannelLabel').textContent = form.elements.sendInApp.checked
      ? 'Enviar também por e-mail a quem autorizou'
      : 'Enviar por e-mail a quem autorizou';
  }

  function updateKindControls() {
    document.getElementById('annVersionField').hidden = kindSelect.value !== 'update';
    document.getElementById('annFormHeading').textContent = kindSelect.value === 'notice' ? 'Novo aviso' : 'Nova atualização';
  }

  document.getElementById('annPreviewButton').addEventListener('click', () => renderPreview(collectForm()));
  document.getElementById('annRefreshCampaigns').addEventListener('click', event => { event.preventDefault(); loadEmailCampaigns(); });
  document.getElementById('annRefreshUsers').addEventListener('click', () => { userPageIndex = 0; userPageTokens = [null]; loadAdminUsers(); });
  document.getElementById('annRefreshSummary').addEventListener('click', loadAdminSummary);
  document.getElementById('annRefreshPublications').addEventListener('click', () => { publicationPageToken = null; loadAdminPublications(); });
  document.getElementById('annLoadMorePublications').addEventListener('click', () => loadAdminPublications(true));
  loadMoreUsersButton.addEventListener('click', () => {
    if (!nextUserPageToken) return;
    userPageTokens[userPageIndex + 1] = nextUserPageToken;
    userPageIndex += 1;
    loadAdminUsers();
  });
  document.getElementById('annPreviousUsers').addEventListener('click', () => { if (userPageIndex > 0) { userPageIndex -= 1; loadAdminUsers(); } });
  document.getElementById('annCancelEdit').addEventListener('click', clearEdit);
  document.getElementById('annCampaignDetails').addEventListener('toggle', event => { if (event.target.open && !loadedAdminViews.has('campaigns')) { loadedAdminViews.add('campaigns'); loadEmailCampaigns(); } });
  userSearch.addEventListener('input', renderAdminUsers);
  askConsentInput.addEventListener('change', updatePromptControls);
  form.elements.sendInApp.addEventListener('change', updatePromptControls);
  kindSelect.addEventListener('change', updateKindControls);
  updatePromptControls();
  updateKindControls();
  emailOptIn.addEventListener('change', async () => {
    const requestedOptIn = emailOptIn.checked;
    emailOptIn.disabled = true;
    emailPreferenceStatus.textContent = 'Salvando preferência…';
    try {
      const result = await request('/api/announcements/me/email-preference', { method: 'POST', body: JSON.stringify({ optIn: requestedOptIn }) });
      emailOptIn.checked = result.optIn === true;
      emailPreferenceStatus.textContent = result.optIn ? `Avisos ativados para ${result.email}. Você pode cancelar quando quiser.` : 'Avisos por e-mail desativados.';
    } catch (error) {
      emailOptIn.checked = !requestedOptIn;
      emailPreferenceStatus.textContent = error.message;
    } finally {
      emailOptIn.disabled = false;
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    adminStatus.textContent = editingPublicationId ? 'Salvando alterações…' : 'Publicando…';
    try {
      const payload = collectForm();
      const result = editingPublicationId
        ? await request(`/api/announcements/admin/${encodeURIComponent(editingPublicationId)}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await request('/api/announcements', { method: 'POST', body: JSON.stringify(payload) });
      if (editingPublicationId) {
        adminStatus.textContent = 'Publicação atualizada. O blog e a entrada do usuário refletem o mesmo conteúdo; e-mails já enviados não são reenviados.';
        clearEdit(); preview.hidden = true; publicationPageToken = null;
        await Promise.all([loadAdminPublications(), loadAdminSummary()]);
        return;
      }
      const typeLabel = result.announcement?.kind === 'notice' ? 'Aviso' : `Atualização ${result.version || ''}`;
      const emailMessage = result.emailStatus === 'queued'
        ? ' O envio por e-mail aos usuários inscritos foi iniciado.'
        : result.emailStatus === 'configuration_required'
          ? ' Para enviar e-mail, configure o provedor no servidor.'
          : '';
      adminStatus.textContent = `${typeLabel} publicado no painel.${emailMessage}${result.announcement?.emailConsentPrompt ? ' A pergunta de consentimento será exibida aos usuários.' : ''}`;
      clearEdit();
      preview.hidden = true;
      await loadAdminSummary();
      publicationPageToken = null;
      if (loadedAdminViews.has('publications')) await loadAdminPublications();
      if (document.getElementById('annCampaignDetails').open) await loadEmailCampaigns();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      adminStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  async function init() {
    try {
      const unsubscribeToken = new URLSearchParams(location.search).get('unsubscribe');
      if (unsubscribeToken) {
        try {
          await request('/api/announcements/unsubscribe', { method: 'POST', body: JSON.stringify({ token: unsubscribeToken }) });
          unsubscribeMessage = 'Seu e-mail foi removido da lista de avisos.';
        } catch (error) {
          unsubscribeMessage = error.message;
        }
        const cleanUrl = new URL(location.href);
        cleanUrl.searchParams.delete('unsubscribe');
        history.replaceState({}, '', cleanUrl);
      }
      const config = JSON.parse(localStorage.getItem('medtutor_custom_firebase_config') || 'null') || DEFAULT_FIREBASE_CONFIG;
      if (window.firebase) {
        const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
        auth = app.auth();
        auth.onAuthStateChanged(async () => {
          await setupAdmin();
          if (!isAdmin) await loadAnnouncements();
        });
      } else {
        await loadAnnouncements();
      }
    } catch (error) {
      status.textContent = 'Não foi possível iniciar a página. Tente atualizar.';
      console.warn('[Anúncios MedTutor] Falha ao inicializar:', error);
    }
  }

  document.getElementById('annAdminTabs')?.addEventListener('click', event => {
    const button = event.target.closest('[data-admin-view]');
    if (button) showAdminView(button.dataset.adminView);
  });

  init();
})();
