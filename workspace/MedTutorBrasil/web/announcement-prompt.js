(() => {
  'use strict';
  const DEFAULT_CONFIG = {
    apiKey: 'AIzaSyBoqV_J-QDapbAGfisZ-vmxCMOxWkq9ZUs',
    authDomain: 'cobra-ai-6549d.firebaseapp.com', projectId: 'cobra-ai-6549d',
    storageBucket: 'cobra-ai-6549d.firebasestorage.app', messagingSenderId: '275562725419',
    appId: '1:275562725419:web:015ed34d8e933ef64bea6e'
  };
  let checkedUid = '';

  function showPrompt(item, uid) {
    const key = `medtutor-announcement-dismissed:${uid}:${item.id}`;
    if (sessionStorage.getItem(key) || document.querySelector('.announcement-first-access-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'announcement-first-access-overlay';
    const dialog = document.createElement('section');
    dialog.className = 'announcement-first-access-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'announcementFirstAccessTitle');
    const version = document.createElement('span');
    version.className = 'announcement-first-access-version';
    version.textContent = item.kind === 'notice' ? 'Aviso da MedTutor Brasil' : `Atualização ${item.version || ''}`;
    const title = document.createElement('h2');
    title.id = 'announcementFirstAccessTitle';
    title.textContent = item.kind === 'notice' ? `Aviso da MedTutor Brasil: ${item.title || ''}` : (item.title || 'Novidades do MedTutor');
    const description = document.createElement('p');
    description.textContent = String(item.description || '').slice(0, 360);
    const actions = document.createElement('div');
    actions.className = 'announcement-first-access-actions';
    const open = document.createElement('a');
    open.href = `/anuncios?id=${encodeURIComponent(item.id)}`;
    open.textContent = item.kind === 'notice' ? 'Ver aviso' : 'Ver atualização';
    const responseStatus = document.createElement('p');
    responseStatus.className = 'announcement-first-access-status';
    responseStatus.setAttribute('role', 'status');
    responseStatus.setAttribute('aria-live', 'polite');
    const consent = item.emailConsentPrompt === true;
    const respond = async choice => {
      const buttons = actions.querySelectorAll('button');
      buttons.forEach(button => { button.disabled = true; });
      responseStatus.textContent = 'Salvando sua resposta…';
      try {
        const token = await firebase.auth().currentUser.getIdToken();
        const response = await fetch(`/api/announcements/me/${encodeURIComponent(item.id)}/answer`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ choice })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Não foi possível salvar sua resposta.');
        overlay.remove();
      } catch (error) {
        responseStatus.textContent = error.message;
        buttons.forEach(button => { button.disabled = false; });
      }
    };
    if (consent) {
      const question = document.createElement('p');
      question.className = 'announcement-first-access-question';
      question.textContent = item.promptText || 'Você deseja receber novidades e atualizações do MedTutor Brasil por e-mail?';
      const accept = document.createElement('button');
      accept.type = 'button';
      accept.className = 'announcement-consent-yes';
      accept.textContent = 'Sim, quero receber';
      accept.addEventListener('click', () => respond('accepted'));
      const decline = document.createElement('button');
      decline.type = 'button';
      decline.className = 'announcement-consent-no';
      decline.textContent = 'Não, obrigado';
      decline.addEventListener('click', () => respond('declined'));
      actions.append(accept, decline);
      if (item.promptResponseRequired !== true) {
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.textContent = 'Agora não';
        skip.addEventListener('click', () => respond('skipped'));
        actions.appendChild(skip);
      }
      dialog.appendChild(question);
      if (item.promptResponseRequired !== true) actions.appendChild(open);
    } else {
      const later = document.createElement('button');
      later.type = 'button';
      later.textContent = 'Agora não';
      later.addEventListener('click', () => {
        sessionStorage.setItem(key, '1');
        overlay.remove();
      });
      actions.append(later, open);
    }
    dialog.append(version, title, description, actions, responseStatus);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    (actions.querySelector('button') || open).focus();
  }

  async function check(user) {
    if (!user?.uid || checkedUid === user.uid || location.pathname === '/anuncios') return;
    checkedUid = user.uid;
    window.setTimeout(async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/announcements/me/unseen', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!response.ok) return;
        const { announcement } = await response.json();
        if (announcement && firebase.auth().currentUser?.uid === user.uid) showPrompt(announcement, user.uid);
      } catch (error) {
        console.info('[Anúncios MedTutor] Consulta de novidade indisponível:', error?.message || 'indisponível');
      }
    }, 4500);
  }

  try {
    if (!window.firebase) return;
    const config = JSON.parse(localStorage.getItem('medtutor_custom_firebase_config') || 'null') || DEFAULT_CONFIG;
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
    app.auth().onAuthStateChanged(check);
  } catch (error) {
    console.info('[Anúncios MedTutor] Aviso de primeira visita desativado:', error?.message || 'indisponível');
  }
})();
