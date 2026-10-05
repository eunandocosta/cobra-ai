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
    version.textContent = item.version || 'Atualização';
    const title = document.createElement('h2');
    title.id = 'announcementFirstAccessTitle';
    title.textContent = item.title || 'Novidades do MedTutor';
    const description = document.createElement('p');
    description.textContent = String(item.description || '').slice(0, 360);
    const actions = document.createElement('div');
    actions.className = 'announcement-first-access-actions';
    const later = document.createElement('button');
    later.type = 'button';
    later.textContent = 'Agora não';
    later.addEventListener('click', () => {
      sessionStorage.setItem(key, '1');
      overlay.remove();
    });
    const open = document.createElement('a');
    open.href = `/anuncios?id=${encodeURIComponent(item.id)}`;
    open.textContent = 'Ver atualização';
    actions.append(later, open);
    dialog.append(version, title, description, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    open.focus();
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
