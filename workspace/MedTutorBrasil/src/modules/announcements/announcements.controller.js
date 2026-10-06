const { getFirebaseAuth, getFirebaseFirestore } = require('../../shared/firebase-admin');
const announcementEmail = require('./announcements.email');

const ANNOUNCEMENTS_COLLECTION = 'announcements';

function bearer(req) {
  return String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

async function authenticatedUser(req) {
  const token = bearer(req);
  if (!token) {
    const error = new Error('Entre na sua conta para continuar.');
    error.statusCode = 401;
    throw error;
  }
  const decoded = await getFirebaseAuth().verifyIdToken(token);
  return decoded;
}

async function authenticatedUid(req) {
  return (await authenticatedUser(req)).uid;
}

async function requireAdmin(req) {
  const uid = await authenticatedUid(req);
  const profile = await getFirebaseFirestore().collection('users').doc(uid).get();
  // Comparação estrita intencional: nenhuma variação, campo vazio ou outro
  // texto concede privilégio administrativo.
  if (!profile.exists || profile.get('role') !== 'admin') {
    const error = new Error('Acesso restrito à administração.');
    error.statusCode = 403;
    throw error;
  }
  return uid;
}

function serializeAnnouncement(doc) {
  const data = doc.data() || {};
  const publishedAt = data.publishedAt?.toDate?.() || (data.publishedAt ? new Date(data.publishedAt) : null);
  const kind = data.kind === 'notice' ? 'notice' : 'update';
  return {
    id: doc.id,
    kind,
    version: kind === 'update' ? String(data.version || '') : '',
    title: String(data.title || ''),
    description: String(data.description || ''),
    bannerUrl: data.bannerUrl ? String(data.bannerUrl) : '',
    bannerAlt: data.bannerAlt ? String(data.bannerAlt) : '',
    channels: { inApp: data.channels?.inApp !== false, email: data.channels?.email === true },
    showProductHighlights: data.showProductHighlights === true,
    emailConsentPrompt: data.emailConsentPrompt === true,
    promptResponseRequired: data.promptResponseRequired === true,
    promptText: String(data.promptText || ''),
    publishedAt: publishedAt && Number.isFinite(publishedAt.getTime()) ? publishedAt.toISOString() : null
  };
}

function versionParts(value) {
  const match = String(value || '').match(/^v?(\d+)\.(\d+)(?:\.\d+)?$/i);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

function validatePayload(body = {}) {
  const kind = body.kind === 'notice' ? 'notice' : body.kind === 'update' || !body.kind ? 'update' : '';
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const bannerUrl = String(body.bannerUrl || '').trim();
  const bannerAlt = String(body.bannerAlt || '').trim();
  const channels = { inApp: body.channels?.inApp === true, email: body.channels?.email === true };
  const showProductHighlights = body.showProductHighlights === true;
  const emailConsentPrompt = body.emailConsentPrompt === true;
  const promptResponseRequired = body.promptResponseRequired === true;
  const promptText = String(body.promptText || '').trim();
  if (!kind) throw Object.assign(new Error('Selecione aviso ou atualização.'), { statusCode: 400 });
  if (!title || title.length > 160) throw Object.assign(new Error('Informe um título de até 160 caracteres.'), { statusCode: 400 });
  if (!description || description.length > 30000) throw Object.assign(new Error('Informe a descrição detalhada (até 30.000 caracteres).'), { statusCode: 400 });
  if (!channels.inApp && !channels.email) throw Object.assign(new Error('Selecione ao menos um canal de publicação.'), { statusCode: 400 });
  if (emailConsentPrompt && !channels.inApp) throw Object.assign(new Error('A pergunta de consentimento exige publicação no painel.'), { statusCode: 400 });
  if (showProductHighlights && !channels.email) throw Object.assign(new Error('Os destaques do produto só podem ser enviados por e-mail.'), { statusCode: 400 });
  if (promptText.length > 300) throw Object.assign(new Error('A pergunta deve ter até 300 caracteres.'), { statusCode: 400 });
  if (bannerUrl && (!/^https:\/\//i.test(bannerUrl) || bannerUrl.length > 2048)) {
    throw Object.assign(new Error('O banner deve ser uma URL HTTPS válida ou ficar vazio.'), { statusCode: 400 });
  }
  if (bannerAlt.length > 300) throw Object.assign(new Error('O texto alternativo do banner deve ter até 300 caracteres.'), { statusCode: 400 });
  return { kind, title, description, bannerUrl, bannerAlt, channels, showProductHighlights, emailConsentPrompt, promptResponseRequired, promptText };
}

function maskEmail(value) {
  const email = String(value || '');
  const [local, domain] = email.split('@');
  if (!local || !domain) return '';
  return `${local.slice(0, 1)}${local.length > 1 ? '***' : '**'}@${domain}`;
}

function serializeUser(doc) {
  const data = doc.data() || {};
  const dateString = value => {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    return date && Number.isFinite(date.getTime()) ? date.toISOString() : '';
  };
  return {
    uid: doc.id,
    name: String(data.nome || 'Estudante').slice(0, 120),
    maskedEmail: maskEmail(data.email),
    faculty: String(data.faculdade || '').slice(0, 120),
    period: String(data.periodo_atual || '').slice(0, 60),
    cycle: String(data.ciclo || '').slice(0, 60),
    role: data.role === 'admin' ? 'admin' : 'user',
    createdAt: dateString(data.data_criacao),
    lastAccess: dateString(data.ultimo_acesso)
  };
}

function respondError(res, error) {
  const status = error.statusCode || (error.code === 'firebase_admin_credentials_missing' ? 503 : 500);
  res.status(status).json({ error: status === 500 ? 'Não foi possível concluir a operação de anúncios.' : error.message, code: error.code || 'announcement_request_failed' });
}

async function listPublished(req, res) {
  try {
    const collection = getFirebaseFirestore().collection(ANNOUNCEMENTS_COLLECTION);
    const announcements = [];
    let cursor = null;
    while (announcements.length < 100) {
      let query = collection.orderBy('publishedAt', 'desc').limit(50);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.get();
      if (!snapshot.size) break;
      announcements.push(...snapshot.docs.filter(doc => doc.get('published') === true).map(serializeAnnouncement).filter(item => item.channels.inApp));
      cursor = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < 50) break;
    }
    announcements.splice(100);
    return res.json({ announcements });
  } catch (error) { return respondError(res, error); }
}

async function adminStatus(req, res) {
  try {
    const uid = await authenticatedUid(req);
    const profile = await getFirebaseFirestore().collection('users').doc(uid).get();
    return res.json({ isAdmin: profile.exists && profile.get('role') === 'admin', emailConfigured: announcementEmail.isEmailConfigured() });
  } catch (error) { return respondError(res, error); }
}

async function unseen(req, res) {
  try {
    const uid = await authenticatedUid(req);
    const db = getFirebaseFirestore();
    const collection = db.collection(ANNOUNCEMENTS_COLLECTION);
    let cursor = null;
    let newest = null;
    while (!newest) {
      let query = collection.orderBy('publishedAt', 'desc').limit(25);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (!page.size) break;
      newest = page.docs.map(serializeAnnouncement).find(item => item.channels.inApp) || null;
      cursor = page.docs[page.docs.length - 1];
      if (page.size < 25) break;
    }
    if (!newest) return res.json({ announcement: null });
    const seen = await db.collection('users').doc(uid).collection('announcement_reads').doc(newest.id).get();
    const response = newest.emailConsentPrompt
      ? await db.collection('users').doc(uid).collection('announcement_responses').doc(newest.id).get()
      : null;
    return res.json({ announcement: seen.exists || response?.exists ? null : newest });
  } catch (error) { return respondError(res, error); }
}

async function answerPrompt(req, res) {
  try {
    const uid = await authenticatedUid(req);
    const id = String(req.params.id || '').trim();
    const choice = String(req.body?.choice || '');
    if (!id || id.length > 160 || !['accepted', 'declined', 'skipped'].includes(choice)) return res.status(400).json({ error: 'Resposta inválida.' });
    const db = getFirebaseFirestore();
    const announcement = await db.collection(ANNOUNCEMENTS_COLLECTION).doc(id).get();
    if (!announcement.exists || announcement.get('published') !== true || announcement.get('emailConsentPrompt') !== true) return res.status(404).json({ error: 'Pergunta de autorização não encontrada.' });
    if (choice === 'skipped' && announcement.get('promptResponseRequired') === true) return res.status(400).json({ error: 'Escolha uma opção para continuar.' });
    const { FieldValue } = require('firebase-admin/firestore');
    const answerRef = db.collection('users').doc(uid).collection('announcement_responses').doc(id);
    const batch = db.batch();
    batch.set(answerRef, { announcementId: id, choice, answeredAt: FieldValue.serverTimestamp() });
    if (choice === 'accepted' || choice === 'declined') {
      const decoded = await authenticatedUser(req);
      if (choice === 'accepted' && (decoded.email_verified !== true || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(decoded.email || '')))) {
        return res.status(403).json({ error: 'Confirme seu e-mail no Firebase antes de autorizar o recebimento.' });
      }
      batch.set(db.collection('announcement_email_subscribers').doc(uid), {
        uid,
        email: String(decoded.email || '').trim().toLowerCase(),
        displayName: String(decoded.name || '').slice(0, 120),
        optIn: choice === 'accepted',
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    batch.set(db.collection('users').doc(uid).collection('announcement_reads').doc(id), { readAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return res.json({ saved: true, choice });
  } catch (error) { return respondError(res, error); }
}

async function markRead(req, res) {
  try {
    const uid = await authenticatedUid(req);
    const id = String(req.params.id || '').trim();
    if (!id || id.length > 160) return res.status(400).json({ error: 'Identificador de anúncio inválido.' });
    const db = getFirebaseFirestore();
    const release = await db.collection(ANNOUNCEMENTS_COLLECTION).doc(id).get();
    if (!release.exists || release.get('published') !== true) return res.status(404).json({ error: 'Anúncio não encontrado.' });
    const { FieldValue } = require('firebase-admin/firestore');
    await db.collection('users').doc(uid).collection('announcement_reads').doc(id).set({ readAt: FieldValue.serverTimestamp() });
    return res.status(204).end();
  } catch (error) { return respondError(res, error); }
}

async function emailPreference(req, res) {
  try {
    const user = await authenticatedUser(req);
    const result = await announcementEmail.getEmailPreference(user.uid);
    return res.json(result);
  } catch (error) { return respondError(res, error); }
}

async function updateEmailPreference(req, res) {
  try {
    const user = await authenticatedUser(req);
    if (typeof req.body?.optIn !== 'boolean') return res.status(400).json({ error: 'Informe uma preferência válida.' });
    if (req.body.optIn === true && (user.email_verified !== true || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(user.email || '')))) {
      return res.status(403).json({ error: 'Confirme seu e-mail no Firebase antes de ativar os avisos.' });
    }
    const snapshot = await announcementEmail.setEmailPreference(user.uid, user.email || '', user.name || '', req.body.optIn);
    return res.json({ optIn: snapshot.get('optIn') === true, email: String(snapshot.get('email') || '') });
  } catch (error) { return respondError(res, error); }
}

async function unsubscribe(req, res) {
  try {
    const success = await announcementEmail.unsubscribe(req.body?.token || req.query?.token);
    if (!success) return res.status(400).json({ error: 'Link de cancelamento inválido.' });
    return res.json({ unsubscribed: true });
  } catch (error) { return respondError(res, error); }
}

async function listEmailCampaigns(req, res) {
  try {
    await requireAdmin(req);
    return res.json({ configured: announcementEmail.isEmailConfigured(), campaigns: await announcementEmail.listCampaigns() });
  } catch (error) { return respondError(res, error); }
}

async function adminSummary(req, res) {
  try {
    await requireAdmin(req);
    const db = getFirebaseFirestore();
    const snapshot = await db.collection(ANNOUNCEMENTS_COLLECTION).orderBy('publishedAt', 'desc').limit(100).get();
    const recent = snapshot.docs.filter(doc => doc.get('published') === true).map(serializeAnnouncement).slice(0, 3);
    const announcements = await Promise.all(recent.map(async item => {
      const campaign = await db.collection('announcement_email_campaigns').doc(item.id).get();
      const campaignData = campaign.exists ? campaign.data() : null;
      return { ...item, emailStatus: campaignData?.status || 'not_requested', recipientCount: Number(campaignData?.recipientCount) || 0, sentCount: Number(campaignData?.sentCount) || 0, failedCount: Number(campaignData?.failedCount) || 0 };
    }));
    return res.json({ announcements });
  } catch (error) { return respondError(res, error); }
}

async function listAdminPublications(req, res) {
  try {
    await requireAdmin(req);
    const db = getFirebaseFirestore();
    const collection = db.collection(ANNOUNCEMENTS_COLLECTION);
    let query = collection.orderBy('publishedAt', 'desc');
    const pageToken = String(req.query.pageToken || '').trim();
    if (pageToken && pageToken.length <= 160) {
      const cursor = await collection.doc(pageToken).get();
      if (cursor.exists) query = query.startAfter(cursor);
    }
    const snapshot = await query.limit(6).get();
    const publishedDocs = snapshot.docs.filter(doc => doc.get('published') === true);
    const docs = publishedDocs.slice(0, 5);
    return res.json({ announcements: docs.map(serializeAnnouncement), nextPageToken: snapshot.size > 5 ? snapshot.docs[4]?.id || null : null });
  } catch (error) { return respondError(res, error); }
}

async function editPublication(req, res) {
  try {
    const adminUid = await requireAdmin(req);
    const id = String(req.params.id || '').trim();
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const bannerUrl = String(req.body?.bannerUrl || '').trim();
    const bannerAlt = String(req.body?.bannerAlt || '').trim();
    if (!id || id.length > 160) return res.status(400).json({ error: 'Identificador de publicação inválido.' });
    if (!title || title.length > 160 || !description || description.length > 30000) return res.status(400).json({ error: 'Informe título e descrição dentro dos limites permitidos.' });
    if (bannerUrl && (!/^https:\/\//i.test(bannerUrl) || bannerUrl.length > 2048)) return res.status(400).json({ error: 'O banner deve ser uma URL HTTPS válida ou ficar vazio.' });
    if (bannerAlt.length > 300) return res.status(400).json({ error: 'O texto alternativo deve ter até 300 caracteres.' });
    const db = getFirebaseFirestore();
    const ref = db.collection(ANNOUNCEMENTS_COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.get('published') !== true) return res.status(404).json({ error: 'Publicação não encontrada.' });
    const showProductHighlights = doc.get('channels.email') === true && req.body?.showProductHighlights === true;
    await ref.update({ title, description, bannerUrl, bannerAlt, showProductHighlights, editedAt: new Date(), editedBy: adminUid });
    return res.json({ announcement: serializeAnnouncement(await ref.get()) });
  } catch (error) { return respondError(res, error); }
}

async function listAdminUsers(req, res) {
  try {
    await requireAdmin(req);
    const db = getFirebaseFirestore();
    const collection = db.collection('users');
    const pageToken = String(req.query.pageToken || '').trim();
    const { FieldPath } = require('firebase-admin/firestore');
    let query = collection.orderBy(FieldPath.documentId());
    if (pageToken && pageToken.length <= 160) {
      const cursor = await collection.doc(pageToken).get();
      if (cursor.exists) query = query.startAfter(cursor);
    }
    const snapshot = await query.limit(6).get();
    const page = snapshot.docs.slice(0, 5);
    return res.json({ users: page.map(serializeUser), nextPageToken: snapshot.size > 5 ? page[page.length - 1]?.id || null : null });
  } catch (error) { return respondError(res, error); }
}

async function updateUserRole(req, res) {
  try {
    const adminUid = await requireAdmin(req);
    const targetUid = String(req.params.uid || '').trim();
    const role = String(req.body?.role || '');
    if (!targetUid || targetUid.length > 160 || !['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Escolha um perfil válido.' });
    if (adminUid === targetUid && role !== 'admin') return res.status(400).json({ error: 'Você não pode remover seu próprio acesso administrativo.' });
    const db = getFirebaseFirestore();
    const targetRef = db.collection('users').doc(targetUid);
    await db.runTransaction(async transaction => {
      const target = await transaction.get(targetRef);
      if (!target.exists) throw Object.assign(new Error('Usuário não encontrado.'), { statusCode: 404 });
      if (target.get('role') === 'admin' && role !== 'admin') {
        const admins = await transaction.get(db.collection('users').where('role', '==', 'admin'));
        if (admins.size <= 1) throw Object.assign(new Error('O último administrador não pode ser removido.'), { statusCode: 409 });
      }
      transaction.update(targetRef, { role, role_updated_at: new Date().toISOString(), role_updated_by: adminUid });
    });
    return res.json({ uid: targetUid, role });
  } catch (error) { return respondError(res, error); }
}

async function nextVersion(req, res) {
  try {
    await requireAdmin(req);
    const db = getFirebaseFirestore();
    const meta = await db.collection('announcement_meta').doc('versioning').get();
    let current = meta.exists && Number.isInteger(meta.get('lastMajor')) && Number.isInteger(meta.get('lastMinor'))
      ? [meta.get('lastMajor'), meta.get('lastMinor')]
      : [1, -1];
    let foundVersion = meta.exists;
    if (!meta.exists) {
      const existing = await db.collection(ANNOUNCEMENTS_COLLECTION).limit(1000).get();
      for (const doc of existing.docs) {
        const parts = versionParts(doc.get('version'));
        if (doc.get('version') && parts[0] > 0) foundVersion = true;
        if (parts[0] > current[0] || (parts[0] === current[0] && parts[1] > current[1])) current = parts;
      }
    }
    const next = current[1] < 0 || !foundVersion ? [current[0], 0] : [current[0], current[1] + 1];
    return res.json({ version: `v${next[0]}.${next[1]}` });
  } catch (error) { return respondError(res, error); }
}

async function retryEmailCampaign(req, res) {
  try {
    await requireAdmin(req);
    const id = String(req.params.id || '');
    if (!announcementEmail.isEmailConfigured()) return res.status(503).json({ error: 'Configure o serviço de e-mail no servidor antes de tentar novamente.' });
    const release = await getFirebaseFirestore().collection(ANNOUNCEMENTS_COLLECTION).doc(id).get();
    if (!release.exists || release.get('published') !== true) return res.status(404).json({ error: 'Anúncio não encontrado.' });
    await announcementEmail.retryCampaign(id);
    return res.status(202).json({ queued: true });
  } catch (error) { return respondError(res, error); }
}

async function publish(req, res) {
  try {
    const uid = await requireAdmin(req);
    const data = validatePayload(req.body);
    const db = getFirebaseFirestore();
    const ref = db.collection(ANNOUNCEMENTS_COLLECTION).doc();
    const campaignRef = db.collection('announcement_email_campaigns').doc(ref.id);
    const { FieldValue } = require('firebase-admin/firestore');
    let publishedData;
    let emailStatus = data.channels.email ? (announcementEmail.isEmailConfigured() ? 'queued' : 'configuration_required') : 'not_requested';
    await db.runTransaction(async transaction => {
      let version = '';
      let askConsent = data.emailConsentPrompt;
      if (data.kind === 'update') {
        const versionRef = db.collection('announcement_meta').doc('versioning');
        const meta = await transaction.get(versionRef);
        let current = meta.exists && Number.isInteger(meta.get('lastMajor')) && Number.isInteger(meta.get('lastMinor'))
          ? [meta.get('lastMajor'), meta.get('lastMinor')]
          : [1, -1];
        let foundVersion = meta.exists;
        if (!meta.exists) {
          const existing = await transaction.get(db.collection(ANNOUNCEMENTS_COLLECTION).limit(1000));
          for (const doc of existing.docs) {
            const parts = versionParts(doc.get('version'));
            if (doc.get('version') && parts[0] > 0) foundVersion = true;
            if (parts[0] > current[0] || (parts[0] === current[0] && parts[1] > current[1])) current = parts;
          }
        }
        const next = current[1] < 0 || !foundVersion ? [current[0], 0] : [current[0], current[1] + 1];
        version = `v${next[0]}.${next[1]}`;
        if (!meta.exists || meta.get('firstUpdateConsentPromptPublished') !== true) askConsent = true;
        transaction.set(versionRef, { lastMajor: next[0], lastMinor: next[1], firstUpdateConsentPromptPublished: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      const asksConsent = askConsent && data.channels.inApp;
      publishedData = { ...data, version, emailConsentPrompt: asksConsent, promptText: asksConsent ? (data.promptText || 'Você deseja receber novidades e atualizações do MedTutor Brasil por e-mail?') : '', published: true, publishedAt: FieldValue.serverTimestamp(), publishedBy: uid };
      transaction.create(ref, publishedData);
      if (data.channels.email) transaction.set(campaignRef, { announcementId: ref.id, status: emailStatus, recipientCount: 0, sentCount: 0, failedCount: 0, recipientsInitialized: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    if (data.channels.email) {
      if (emailStatus === 'queued') announcementEmail.queueCampaign(ref.id);
    }
    return res.status(201).json({ announcement: serializeAnnouncement(await ref.get()), emailStatus, version: publishedData.version });
  } catch (error) { return respondError(res, error); }
}

module.exports = { listPublished, adminStatus, adminSummary, listAdminPublications, editPublication, unseen, answerPrompt, markRead, emailPreference, updateEmailPreference, unsubscribe, listEmailCampaigns, listAdminUsers, updateUserRole, nextVersion, retryEmailCampaign, publish, serializeUser, validatePayload, versionParts };
