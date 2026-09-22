const crypto = require('crypto');
const { getFirebaseApp, getFirebaseAuth, getFirebaseFirestore } = require('../../shared/firebase-admin');

const ACCESS_CLAIM_REQUIRED = 'medtutorAccessRequired';
const ACCESS_CLAIM_GRANTED = 'medtutorAccess';
const ACCESS_CLAIM_EXPIRES_AT = 'medtutorAccessExpiresAt';
const ACCESS_CLAIM_VERSION = 'medtutorAccessVersion';
// Uma nova versão invalida liberações de testes ou de campanhas anteriores.
// Alterar esta versão força todas as contas a declararem o cupom novamente.
const ACCESS_COUPON_VERSION = '2026-09-22-v1';

function isGateEnabled() {
  return String(process.env.ACCESS_GATE_ENABLED || '').trim().toLowerCase() === 'true';
}

function getCouponConfig() {
  const code = String(process.env.ACCESS_COUPON_CODE || '').trim().toUpperCase();
  // 0 significa ilimitado: um cupom compartilhado pode liberar cada conta
  // individualmente. Valores positivos continuam impondo um teto global.
  const maxRedemptions = Number.parseInt(process.env.ACCESS_COUPON_MAX_REDEMPTIONS || '0', 10);
  const accessDays = Number.parseInt(process.env.ACCESS_COUPON_ACCESS_DAYS || '0', 10);
  if (!code || !Number.isSafeInteger(maxRedemptions) || maxRedemptions < 0 || !Number.isSafeInteger(accessDays) || accessDays < 0) {
    const error = new Error('O portão de acesso está ativo, mas a configuração do cupom está incompleta.');
    error.statusCode = 503;
    error.code = 'coupon_configuration_missing';
    throw error;
  }
  return { code, maxRedemptions, accessDays };
}

function hashCoupon(code) {
  return crypto.createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');
}

function timingSafeCouponMatch(submitted, configured) {
  const submittedHash = Buffer.from(hashCoupon(submitted), 'hex');
  const configuredHash = Buffer.from(hashCoupon(configured), 'hex');
  return submittedHash.length === configuredHash.length && crypto.timingSafeEqual(submittedHash, configuredHash);
}

function accessSnapshot(grantData = {}) {
  const expiresAtMs = grantData.expiresAtMs == null ? null : Number(grantData.expiresAtMs);
  const active = grantData.active === true && grantData.couponVersion === ACCESS_COUPON_VERSION &&
    (expiresAtMs == null || expiresAtMs > Date.now());
  return { active, expiresAtMs: active ? expiresAtMs : null };
}

async function updateAccessClaims(auth, uid, required, grant) {
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims || {}) };
  claims[ACCESS_CLAIM_REQUIRED] = required;
  claims[ACCESS_CLAIM_GRANTED] = grant.active;
  if (grant.active) claims[ACCESS_CLAIM_VERSION] = ACCESS_COUPON_VERSION;
  else delete claims[ACCESS_CLAIM_VERSION];
  if (grant.active && grant.expiresAtMs != null) claims[ACCESS_CLAIM_EXPIRES_AT] = grant.expiresAtMs;
  else delete claims[ACCESS_CLAIM_EXPIRES_AT];
  const unchanged = claims[ACCESS_CLAIM_REQUIRED] === user.customClaims?.[ACCESS_CLAIM_REQUIRED] &&
    claims[ACCESS_CLAIM_GRANTED] === user.customClaims?.[ACCESS_CLAIM_GRANTED] &&
    claims[ACCESS_CLAIM_VERSION] === user.customClaims?.[ACCESS_CLAIM_VERSION] &&
    claims[ACCESS_CLAIM_EXPIRES_AT] === user.customClaims?.[ACCESS_CLAIM_EXPIRES_AT];
  if (!unchanged) await auth.setCustomUserClaims(uid, claims);
}

async function getStatus(decodedToken) {
  if (!isGateEnabled()) {
    if (decodedToken?.uid) {
      try {
        await updateAccessClaims(getFirebaseAuth(), decodedToken.uid, false, { active: true, expiresAtMs: null });
      } catch (error) {
        // Access não está sendo cobrado/controlado; Admin não é requisito nesse modo.
      }
    }
    return { required: false, active: true, access: 'not_required', refreshToken: true };
  }
  if (!decodedToken?.uid) {
    const error = new Error('Entre na sua conta para verificar a liberação de acesso.');
    error.statusCode = 401;
    error.code = 'authentication_required';
    throw error;
  }
  getCouponConfig();

  getFirebaseApp();
  const db = getFirebaseFirestore();
  const grantDoc = await db.collection('access_grants').doc(decodedToken.uid).get();
  const grant = accessSnapshot(grantDoc.exists ? grantDoc.data() : {});
  await updateAccessClaims(getFirebaseAuth(), decodedToken.uid, true, grant);
  return {
    required: true,
    active: grant.active,
    access: grant.active ? 'granted' : 'coupon_required',
    expiresAt: grant.expiresAtMs == null ? null : new Date(grant.expiresAtMs).toISOString()
  };
}

async function redeemCoupon(decodedToken, submittedCode) {
  if (!isGateEnabled()) return { required: false, active: true, access: 'not_required' };
  if (!decodedToken?.uid) {
    const error = new Error('Entre na sua conta antes de ativar um cupom.');
    error.statusCode = 401;
    error.code = 'authentication_required';
    throw error;
  }

  const coupon = getCouponConfig();
  const normalizedCode = String(submittedCode || '').trim().toUpperCase();
  if (!normalizedCode || normalizedCode.length > 128 || !timingSafeCouponMatch(normalizedCode, coupon.code)) {
    const error = new Error('Cupom inválido ou indisponível. Confira o código e tente novamente.');
    error.statusCode = 400;
    error.code = 'invalid_coupon';
    throw error;
  }

  getFirebaseApp();
  const db = getFirebaseFirestore();
  const couponHash = hashCoupon(coupon.code);
  const couponEpochHash = hashCoupon(`${couponHash}:${ACCESS_COUPON_VERSION}`);
  const grantRef = db.collection('access_grants').doc(decodedToken.uid);
  const usageRef = db.collection('access_coupon_usage').doc(couponEpochHash);
  const redemptionRef = db.collection('access_coupon_redemptions').doc(`${couponEpochHash}_${decodedToken.uid}`);
  const now = Date.now();
  const expiresAtMs = coupon.accessDays > 0 ? now + coupon.accessDays * 24 * 60 * 60 * 1000 : null;

  const result = await db.runTransaction(async transaction => {
    const [grantDoc, usageDoc, redemptionDoc] = await Promise.all([
      transaction.get(grantRef), transaction.get(usageRef), transaction.get(redemptionRef)
    ]);
    const existingGrant = accessSnapshot(grantDoc.exists ? grantDoc.data() : {});
    if (existingGrant.active) return { active: true, expiresAtMs: existingGrant.expiresAtMs, alreadyActive: true };
    if (redemptionDoc.exists) {
      const error = new Error('Este cupom já foi utilizado nesta conta.');
      error.statusCode = 409;
      error.code = 'coupon_already_used';
      throw error;
    }

    const redeemedCount = Math.max(0, Number(usageDoc.exists ? usageDoc.data().redeemedCount : 0) || 0);
    if (coupon.maxRedemptions > 0 && redeemedCount >= coupon.maxRedemptions) {
      const error = new Error('Este cupom atingiu o limite de ativações.');
      error.statusCode = 409;
      error.code = 'coupon_exhausted';
      throw error;
    }

    const grantData = {
      uid: decodedToken.uid,
      active: true,
      couponHash,
      couponVersion: ACCESS_COUPON_VERSION,
      grantedAtMs: now,
      expiresAtMs
    };
    transaction.set(usageRef, {
      redeemedCount: redeemedCount + 1,
      maxRedemptions: coupon.maxRedemptions,
      updatedAtMs: now
    }, { merge: true });
    transaction.create(redemptionRef, { uid: decodedToken.uid, redeemedAtMs: now, expiresAtMs });
    transaction.set(grantRef, grantData);
    return { active: true, expiresAtMs, alreadyActive: false };
  });

  const grant = { active: result.active, expiresAtMs: result.expiresAtMs };
  await updateAccessClaims(getFirebaseAuth(), decodedToken.uid, true, grant);
  return {
    required: true,
    active: true,
    access: 'granted',
    alreadyActive: result.alreadyActive,
    expiresAt: grant.expiresAtMs == null ? null : new Date(grant.expiresAtMs).toISOString()
  };
}

async function verifyIdToken(idToken) {
  if (!idToken) {
    const error = new Error('Sessão inválida. Entre novamente na sua conta.');
    error.statusCode = 401;
    error.code = 'missing_auth_token';
    throw error;
  }
  let auth;
  try {
    getFirebaseApp();
    auth = getFirebaseAuth();
  } catch (cause) {
    const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
    const credentialsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
    console.error('[Firebase Admin] Falha ao inicializar o SDK:', {
      event: 'firebase_admin_initialization_failed',
      code: cause?.code || 'firebase_admin_initialization_failed',
      errorName: cause?.name || 'Error',
      credentialSource: serviceAccountJson ? 'FIREBASE_SERVICE_ACCOUNT_JSON' : credentialsPath ? 'GOOGLE_APPLICATION_CREDENTIALS' : 'none'
    });
    const error = new Error('A autenticação administrativa do Firebase não está configurada no servidor.');
    error.statusCode = 503;
    error.code = 'firebase_admin_not_configured';
    throw error;
  }
  try {
    return await auth.verifyIdToken(idToken);
  } catch (cause) {
    if (cause.statusCode) throw cause;
    const error = new Error('Sessão inválida ou expirada. Entre novamente.');
    error.statusCode = 401;
    error.code = 'invalid_auth_token';
    throw error;
  }
}

module.exports = {
  getStatus,
  isGateEnabled,
  redeemCoupon,
  verifyIdToken,
  accessSnapshot,
  getCouponConfig,
  ACCESS_CLAIM_GRANTED,
  ACCESS_CLAIM_EXPIRES_AT,
  ACCESS_CLAIM_VERSION,
  ACCESS_COUPON_VERSION
};
