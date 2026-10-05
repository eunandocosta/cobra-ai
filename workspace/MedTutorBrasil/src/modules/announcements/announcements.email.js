const crypto = require('crypto');
const { getFirebaseFirestore } = require('../../shared/firebase-admin');

const CAMPAIGNS = 'announcement_email_campaigns';
const DELIVERIES = 'announcement_email_deliveries';
const BATCHES = 'announcement_email_batches';
const SUBSCRIBERS = 'announcement_email_subscribers';
const BATCH_SIZE = 100;

function emailConfig() {
  return {
    apiKey: String(process.env.RESEND_API_KEY || '').trim(),
    from: String(process.env.ANNOUNCEMENT_FROM_EMAIL || '').trim(),
    unsubscribeSecret: String(process.env.ANNOUNCEMENT_UNSUBSCRIBE_SECRET || '').trim(),
    siteUrl: String(process.env.PUBLIC_SITE_URL || 'https://medtutorbrasil.com.br').trim().replace(/\/$/, '')
  };
}

function isEmailConfigured() {
  const config = emailConfig();
  return Boolean(config.apiKey && config.from && config.unsubscribeSecret);
}

function signedUnsubscribeToken(uid, secret = emailConfig().unsubscribeSecret) {
  const value = String(uid || '');
  const signature = crypto.createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${signature}`;
}

function verifyUnsubscribeToken(token, secret = emailConfig().unsubscribeSecret) {
  const value = String(token || '');
  const separator = value.lastIndexOf('.');
  const uid = separator > 0 ? value.slice(0, separator) : '';
  const supplied = separator > 0 ? value.slice(separator + 1) : '';
  if (!uid || !supplied || !secret) return '';
  const expected = crypto.createHmac('sha256', secret).update(uid).digest('base64url');
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right) ? uid : '';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function renderEmail(announcement, recipient, config) {
  const isNotice = announcement.kind === 'notice';
  const title = isNotice
    ? `Aviso da MedTutor Brasil: ${announcement.title}`
    : `Atualização ${String(announcement.version || '').toUpperCase()} - ${announcement.title}`;
  const paragraphs = String(announcement.description || '').split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
  const descriptionHtml = paragraphs.map(value => `<p style="margin:0 0 14px;line-height:1.7;color:#35443a;white-space:pre-wrap">${escapeHtml(value)}</p>`).join('');
  const bannerHtml = announcement.bannerUrl
    ? `<img src="${escapeHtml(announcement.bannerUrl)}" alt="${escapeHtml(announcement.bannerAlt || `Banner da atualização ${announcement.version}`)}" width="640" style="display:block;width:100%;max-width:640px;height:auto;max-height:260px;object-fit:cover;border-radius:10px;margin:0 0 22px">`
    : '';
  const unsubscribeToken = encodeURIComponent(signedUnsubscribeToken(recipient.uid, config.unsubscribeSecret));
  const unsubscribeUrl = `${config.siteUrl}/anuncios?unsubscribe=${unsubscribeToken}`;
  const category = isNotice ? 'AVISO DA MEDTUTOR BRASIL' : `ATUALIZAÇÃO ${String(announcement.version || '').toUpperCase()}`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f3f7f4;font-family:Arial,sans-serif;color:#142019"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#fff;border:1px solid #dce8df;border-radius:14px;overflow:hidden"><tr><td style="padding:28px 30px 8px"><p style="margin:0 0 8px;color:#008b49;font-size:12px;font-weight:bold;letter-spacing:1px">${escapeHtml(category)}</p><h1 style="margin:0 0 20px;font-size:25px;line-height:1.25">${escapeHtml(title)}</h1>${bannerHtml}${descriptionHtml}<p style="margin:24px 0"><a href="${config.siteUrl}/anuncios?id=${encodeURIComponent(announcement.id)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#00d66b;color:#062014;text-decoration:none;font-weight:bold">Ver no MedTutor Brasil</a></p></td></tr><tr><td style="padding:18px 30px;border-top:1px solid #e5ece7;color:#6c7b71;font-size:12px;line-height:1.6">Você recebeu este e-mail porque autorizou o recebimento de comunicações do MedTutor Brasil. <a href="${unsubscribeUrl}" style="color:#52665a">Cancelar recebimento</a>.</td></tr></table></td></tr></table></body></html>`;
  const text = `${title}\n\n${announcement.description}\n\nVer no MedTutor Brasil: ${config.siteUrl}/anuncios?id=${encodeURIComponent(announcement.id)}\n\nCancelar recebimento: ${unsubscribeUrl}`;
  return { subject: title, html, text, unsubscribeUrl };
}

function campaignRef(db, announcementId) {
  return db.collection(CAMPAIGNS).doc(announcementId);
}

async function initializeRecipients(db, announcementId) {
  const campaign = campaignRef(db, announcementId);
  const campaignSnapshot = await campaign.get();
  if (campaignSnapshot.get('recipientsInitialized') === true) return;
  const subscriberSnapshot = await db.collection(SUBSCRIBERS).where('optIn', '==', true).get();
  const existing = await db.collection(DELIVERIES).where('announcementId', '==', announcementId).get();
  const existingIds = new Set(existing.docs.map(doc => doc.id));
  const recipients = subscriberSnapshot.docs
    .map(doc => ({ uid: doc.id, ...(doc.data() || {}) }))
    .filter(item => item.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email));
  for (let offset = 0; offset < recipients.length; offset += 400) {
    const batch = db.batch();
    for (let index = offset; index < Math.min(offset + 400, recipients.length); index += 1) {
      const recipient = recipients[index];
      const id = `${announcementId}_${recipient.uid}`;
      if (existingIds.has(id)) continue;
      batch.create(db.collection(DELIVERIES).doc(id), {
        announcementId,
        uid: recipient.uid,
        email: recipient.email,
        displayName: String(recipient.displayName || '').slice(0, 120),
        status: 'pending',
        batchIndex: Math.floor(index / BATCH_SIZE),
        updatedAt: new Date()
      });
    }
    await batch.commit();
  }
  await campaign.set({ recipientsInitialized: true, recipientCount: recipients.length, updatedAt: new Date() }, { merge: true });
}

async function sendBatch(announcement, index, items, config) {
  const requests = items.map(item => {
    const rendered = renderEmail(announcement, item, config);
    return {
      from: config.from,
      to: [item.email],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {
        'List-Unsubscribe': `<${config.siteUrl}/api/announcements/unsubscribe?token=${encodeURIComponent(signedUnsubscribeToken(item.uid, config.unsubscribeSecret))}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      }
    };
  });
  const response = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `medtutor-announcement/${announcement.id}/batch/${index}`
    },
    body: JSON.stringify(requests)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(result?.message || result?.name || `Resend retornou HTTP ${response.status}`).slice(0, 500));
  return Array.isArray(result?.data) ? result.data : [];
}

async function claimCampaign(db, announcementId) {
  const ref = campaignRef(db, announcementId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.get('status') === 'sent') return false;
    const leaseUntil = Number(snapshot.get('leaseUntil') || 0);
    if (snapshot.get('status') === 'sending' && leaseUntil > Date.now()) return false;
    transaction.set(ref, { status: 'sending', leaseUntil: Date.now() + 10 * 60_000, updatedAt: new Date() }, { merge: true });
    return true;
  });
}

async function processEmailCampaign(announcementId) {
  const config = emailConfig();
  const db = getFirebaseFirestore();
  const campaign = campaignRef(db, announcementId);
  if (!isEmailConfigured()) {
    await campaign.set({ status: 'configuration_required', lastError: 'Configure RESEND_API_KEY, ANNOUNCEMENT_FROM_EMAIL e ANNOUNCEMENT_UNSUBSCRIBE_SECRET no servidor.', updatedAt: new Date() }, { merge: true });
    return;
  }
  if (!await claimCampaign(db, announcementId)) return;
  const release = await db.collection('announcements').doc(announcementId).get();
  if (!release.exists || release.get('published') !== true) {
    await campaign.set({ status: 'failed', lastError: 'Anúncio não encontrado ou não publicado.', updatedAt: new Date() }, { merge: true });
    return;
  }
  const announcement = { id: release.id, ...release.data() };
  try {
    await initializeRecipients(db, announcementId);
    const deliveries = await db.collection(DELIVERIES).where('announcementId', '==', announcementId).get();
    const pending = deliveries.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => item.status !== 'sent')
      .sort((a, b) => a.batchIndex - b.batchIndex || a.uid.localeCompare(b.uid));
    const groups = new Map();
    for (const item of pending) {
      const group = groups.get(item.batchIndex) || [];
      group.push(item);
      groups.set(item.batchIndex, group);
    }
    for (const [index, items] of groups) {
      const batchRef = db.collection(BATCHES).doc(`${announcementId}_${index}`);
      const batchSnapshot = await batchRef.get();
      if (batchSnapshot.get('status') === 'sent') {
        const skippedBatch = db.batch();
        items.forEach(item => skippedBatch.set(db.collection(DELIVERIES).doc(item.id), { status: 'sent', updatedAt: new Date() }, { merge: true }));
        await skippedBatch.commit();
        continue;
      }
      try {
        const providerResults = await sendBatch(announcement, index, items, config);
        if (providerResults.length !== items.length) throw new Error('O provedor não confirmou todos os destinatários do lote.');
        const writes = db.batch();
        items.forEach((item, resultIndex) => writes.set(db.collection(DELIVERIES).doc(item.id), {
          status: 'sent', providerMessageId: String(providerResults[resultIndex]?.id || ''), updatedAt: new Date()
        }, { merge: true }));
        writes.set(batchRef, { status: 'sent', sentCount: items.length, updatedAt: new Date() }, { merge: true });
        await writes.commit();
      } catch (error) {
        await batchRef.set({ status: 'failed', error: String(error.message || 'Falha no envio').slice(0, 500), updatedAt: new Date() }, { merge: true });
        throw error;
      }
      await campaign.set({ sentCount: (Number((await campaign.get()).get('sentCount')) || 0) + items.length, lastBatchIndex: index, leaseUntil: Date.now() + 10 * 60_000, updatedAt: new Date() }, { merge: true });
    }
    const all = await db.collection(DELIVERIES).where('announcementId', '==', announcementId).get();
    const sentCount = all.docs.filter(doc => doc.get('status') === 'sent').length;
    const failedCount = all.docs.filter(doc => doc.get('status') === 'failed').length;
    await campaign.set({ status: failedCount ? 'partial' : 'sent', sentCount, failedCount, recipientCount: all.size, leaseUntil: 0, lastError: '', completedAt: new Date(), updatedAt: new Date() }, { merge: true });
  } catch (error) {
    const current = await campaign.get();
    await campaign.set({ status: 'partial', lastError: String(error.message || 'Falha no envio').slice(0, 500), leaseUntil: 0, failedCount: Math.max(1, Number(current.get('failedCount')) || 0), updatedAt: new Date() }, { merge: true });
    console.error('[Anúncios MedTutor] Falha ao enviar e-mails:', { announcementId, message: error.message });
  }
}

async function setEmailPreference(uid, email, displayName, optIn) {
  const db = getFirebaseFirestore();
  const ref = db.collection(SUBSCRIBERS).doc(uid);
  const { FieldValue } = require('firebase-admin/firestore');
  await ref.set({ uid, email: String(email || '').trim().toLowerCase(), displayName: String(displayName || '').slice(0, 120), optIn: optIn === true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return ref.get();
}

async function getEmailPreference(uid) {
  const snapshot = await getFirebaseFirestore().collection(SUBSCRIBERS).doc(uid).get();
  return { optIn: snapshot.exists && snapshot.get('optIn') === true, email: snapshot.exists ? String(snapshot.get('email') || '') : '' };
}

async function unsubscribe(token) {
  const uid = verifyUnsubscribeToken(token);
  if (!uid) return false;
  const db = getFirebaseFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  await db.collection(SUBSCRIBERS).doc(uid).set({ optIn: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return true;
}

async function retryCampaign(announcementId) {
  await campaignRef(getFirebaseFirestore(), announcementId).set({ status: 'queued', lastError: '', leaseUntil: 0, updatedAt: new Date() }, { merge: true });
  setImmediate(() => processEmailCampaign(announcementId));
}

async function listCampaigns() {
  const snapshot = await getFirebaseFirestore().collection(CAMPAIGNS).orderBy('updatedAt', 'desc').limit(100).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function queueCampaign(announcementId) {
  setImmediate(() => processEmailCampaign(announcementId));
}

module.exports = {
  emailConfig,
  getEmailPreference,
  isEmailConfigured,
  listCampaigns,
  processEmailCampaign,
  queueCampaign,
  retryCampaign,
  renderEmail,
  setEmailPreference,
  signedUnsubscribeToken,
  unsubscribe,
  verifyUnsubscribeToken
};
