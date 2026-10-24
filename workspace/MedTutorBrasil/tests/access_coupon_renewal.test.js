const assert = require('assert');
const path = require('path');

// Firestore e Auth em memória, injetados no lugar do Firebase Admin real.
const docs = new Map();
const claims = new Map();
const docRef = (collection, id) => ({ key: `${collection}/${id}` });
const snapshot = key => ({ exists: docs.has(key), data: () => docs.get(key) });
const fakeDb = {
  collection: name => ({ doc: id => docRef(name, id) }),
  runTransaction: async fn => {
    const writes = [];
    const result = await fn({
      get: async ref => snapshot(ref.key),
      set: (ref, data, options) => writes.push(() => docs.set(ref.key, options?.merge ? { ...(docs.get(ref.key) || {}), ...data } : data)),
      create: (ref, data) => {
        if (docs.has(ref.key)) throw new Error(`documento já existe: ${ref.key}`);
        writes.push(() => docs.set(ref.key, data));
      }
    });
    writes.forEach(write => write());
    return result;
  }
};
const fakeAuth = {
  getUser: async uid => ({ customClaims: claims.get(uid) || {} }),
  setCustomUserClaims: async (uid, value) => claims.set(uid, value)
};
const firebaseAdminPath = path.join(__dirname, '..', 'src', 'shared', 'firebase-admin.js');
require.cache[firebaseAdminPath] = {
  id: firebaseAdminPath,
  filename: firebaseAdminPath,
  loaded: true,
  exports: { getFirebaseApp: () => ({}), getFirebaseAuth: () => fakeAuth, getFirebaseFirestore: () => fakeDb }
};

const accessService = require('../src/modules/access/access.service');

const original = {
  enabled: process.env.ACCESS_GATE_ENABLED,
  code: process.env.ACCESS_COUPON_CODE,
  max: process.env.ACCESS_COUPON_MAX_REDEMPTIONS,
  days: process.env.ACCESS_COUPON_ACCESS_DAYS
};

(async () => {
  try {
    console.log('🧪 Iniciando testes de reativação de cupom...');
    process.env.ACCESS_GATE_ENABLED = 'true';
    process.env.ACCESS_COUPON_CODE = 'BETA-2026';
    process.env.ACCESS_COUPON_MAX_REDEMPTIONS = '1';
    process.env.ACCESS_COUPON_ACCESS_DAYS = '30';

    const first = await accessService.redeemCoupon({ uid: 'aluno-1' }, 'beta-2026');
    assert.strictEqual(first.active, true);
    assert.strictEqual(first.renewed, false, 'a primeira ativação não é uma renovação');
    assert.strictEqual(claims.get('aluno-1').medtutorAccess, true);
    console.log('  [PASS] Primeira ativação libera a conta');

    const again = await accessService.redeemCoupon({ uid: 'aluno-1' }, 'beta-2026');
    assert.strictEqual(again.alreadyActive, true, 'acesso ainda ativo não deve ser renovado');
    console.log('  [PASS] Acesso ainda ativo não gasta o cupom de novo');

    // Simula o vencimento do acesso.
    const grantKey = 'access_grants/aluno-1';
    docs.set(grantKey, { ...docs.get(grantKey), expiresAtMs: Date.now() - 1000 });
    const renewed = await accessService.redeemCoupon({ uid: 'aluno-1' }, 'beta-2026');
    assert.strictEqual(renewed.renewed, true, 'acesso expirado deve ser reativado com o mesmo cupom');
    assert(Date.parse(renewed.expiresAt) > Date.now(), 'a reativação deve conceder um novo prazo');
    assert.strictEqual(accessService.accessSnapshot(docs.get(grantKey)).active, true);
    const redemption = [...docs.entries()].find(([key]) => key.startsWith('access_coupon_redemptions/'))[1];
    assert.strictEqual(redemption.renewalCount, 1, 'a renovação deve ficar registrada');
    const usage = [...docs.entries()].find(([key]) => key.startsWith('access_coupon_usage/'))[1];
    assert.strictEqual(usage.redeemedCount, 1, 'a renovação não deve consumir o limite global de contas');
    console.log('  [PASS] Acesso expirado é reativado sem consumir o limite global');

    // Acesso removido manualmente no Firestore também pode ser reativado.
    docs.delete(grantKey);
    const afterRemoval = await accessService.redeemCoupon({ uid: 'aluno-1' }, 'beta-2026');
    assert.strictEqual(afterRemoval.renewed, true);
    console.log('  [PASS] Acesso removido é reativado com o mesmo cupom');

    await assert.rejects(accessService.redeemCoupon({ uid: 'aluno-2' }, 'beta-2026'), error => error.code === 'coupon_exhausted',
      'uma nova conta continua sujeita ao limite global');
    console.log('  [PASS] Limite global continua valendo para contas novas');

    console.log('🎉 Testes de reativação de cupom concluídos!\n');
  } finally {
    for (const [key, value] of Object.entries({
      ACCESS_GATE_ENABLED: original.enabled,
      ACCESS_COUPON_CODE: original.code,
      ACCESS_COUPON_MAX_REDEMPTIONS: original.max,
      ACCESS_COUPON_ACCESS_DAYS: original.days
    })) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
})().catch(error => {
  console.error('❌ Falha nos testes de reativação de cupom:', error);
  process.exit(1);
});
