const { getFirebaseAuth, getFirebaseFirestore } = require('../../shared/firebase-admin');

const ANNOUNCEMENTS_COLLECTION = 'announcements';

function bearer(req) {
  return String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

async function authenticatedUid(req) {
  const token = bearer(req);
  if (!token) {
    const error = new Error('Entre na sua conta para continuar.');
    error.statusCode = 401;
    throw error;
  }
  const decoded = await getFirebaseAuth().verifyIdToken(token);
  return decoded.uid;
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
  return {
    id: doc.id,
    version: String(data.version || ''),
    title: String(data.title || ''),
    description: String(data.description || ''),
    bannerUrl: data.bannerUrl ? String(data.bannerUrl) : '',
    bannerAlt: data.bannerAlt ? String(data.bannerAlt) : '',
    publishedAt: publishedAt && Number.isFinite(publishedAt.getTime()) ? publishedAt.toISOString() : null
  };
}

function slugVersion(version) {
  return version.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function validatePayload(body = {}) {
  const version = String(body.version || '').trim();
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const bannerUrl = String(body.bannerUrl || '').trim();
  const bannerAlt = String(body.bannerAlt || '').trim();
  if (!/^v\d+\.\d+(?:\.\d+)?$/i.test(version)) throw Object.assign(new Error('Use uma versão como v1.12 ou v1.12.1.'), { statusCode: 400 });
  if (!title || title.length > 160) throw Object.assign(new Error('Informe um título de até 160 caracteres.'), { statusCode: 400 });
  if (!description || description.length > 30000) throw Object.assign(new Error('Informe a descrição detalhada (até 30.000 caracteres).'), { statusCode: 400 });
  if (bannerUrl && (!/^https:\/\//i.test(bannerUrl) || bannerUrl.length > 2048)) {
    throw Object.assign(new Error('O banner deve ser uma URL HTTPS válida ou ficar vazio.'), { statusCode: 400 });
  }
  if (bannerAlt.length > 300) throw Object.assign(new Error('O texto alternativo do banner deve ter até 300 caracteres.'), { statusCode: 400 });
  return { version, title, description, bannerUrl, bannerAlt };
}

function respondError(res, error) {
  const status = error.statusCode || (error.code === 'firebase_admin_credentials_missing' ? 503 : 500);
  res.status(status).json({ error: status === 500 ? 'Não foi possível concluir a operação de anúncios.' : error.message, code: error.code || 'announcement_request_failed' });
}

async function listPublished(req, res) {
  try {
    const snapshot = await getFirebaseFirestore().collection(ANNOUNCEMENTS_COLLECTION).where('published', '==', true).limit(100).get();
    const announcements = snapshot.docs.map(serializeAnnouncement).sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
    return res.json({ announcements });
  } catch (error) { return respondError(res, error); }
}

async function adminStatus(req, res) {
  try {
    const uid = await authenticatedUid(req);
    const profile = await getFirebaseFirestore().collection('users').doc(uid).get();
    return res.json({ isAdmin: profile.exists && profile.get('role') === 'admin' });
  } catch (error) { return respondError(res, error); }
}

async function unseen(req, res) {
  try {
    const uid = await authenticatedUid(req);
    const db = getFirebaseFirestore();
    const latest = await db.collection(ANNOUNCEMENTS_COLLECTION).where('published', '==', true).limit(100).get();
    const newest = latest.docs.map(serializeAnnouncement).sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))[0];
    if (!newest) return res.json({ announcement: null });
    const seen = await db.collection('users').doc(uid).collection('announcement_reads').doc(newest.id).get();
    return res.json({ announcement: seen.exists ? null : newest });
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

async function publish(req, res) {
  try {
    const uid = await requireAdmin(req);
    const data = validatePayload(req.body);
    const db = getFirebaseFirestore();
    const id = slugVersion(data.version);
    const ref = db.collection(ANNOUNCEMENTS_COLLECTION).doc(id);
    const { FieldValue } = require('firebase-admin/firestore');
    await db.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      if (existing.exists) throw Object.assign(new Error('Essa versão já foi publicada.'), { statusCode: 409 });
      transaction.create(ref, { ...data, published: true, publishedAt: FieldValue.serverTimestamp(), publishedBy: uid });
    });
    return res.status(201).json({ announcement: serializeAnnouncement(await ref.get()) });
  } catch (error) { return respondError(res, error); }
}

module.exports = { listPublished, adminStatus, unseen, markRead, publish };
