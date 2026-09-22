const assert = require('assert');
const accessService = require('../src/modules/access/access.service');
const { getCouponConfig, isGateEnabled, accessSnapshot, ACCESS_COUPON_VERSION } = accessService;
const { requireAccess } = require('../src/shared/access.middleware');

const original = {
  enabled: process.env.ACCESS_GATE_ENABLED,
  code: process.env.ACCESS_COUPON_CODE,
  max: process.env.ACCESS_COUPON_MAX_REDEMPTIONS,
  days: process.env.ACCESS_COUPON_ACCESS_DAYS
};

(async () => {
try {
  process.env.ACCESS_GATE_ENABLED = 'false';
  assert.strictEqual(isGateEnabled(), false, 'gate must be disabled unless explicitly enabled');

  process.env.ACCESS_GATE_ENABLED = 'true';
  process.env.ACCESS_COUPON_CODE = '  beta-2026  ';
  process.env.ACCESS_COUPON_MAX_REDEMPTIONS = '0';
  process.env.ACCESS_COUPON_ACCESS_DAYS = '0';
  assert.deepStrictEqual(getCouponConfig(), { code: 'BETA-2026', maxRedemptions: 0, accessDays: 0 });
  assert.strictEqual(accessSnapshot({ active: true }).active, false, 'old grants without a version must be revalidated');
  assert.strictEqual(accessSnapshot({ active: true, couponVersion: 'previous-version' }).active, false, 'old coupon versions must be revalidated');
  assert.strictEqual(accessSnapshot({ active: true, couponVersion: ACCESS_COUPON_VERSION }).active, true, 'the current coupon version remains active');

  process.env.ACCESS_COUPON_MAX_REDEMPTIONS = '25';
  assert.deepStrictEqual(getCouponConfig(), { code: 'BETA-2026', maxRedemptions: 25, accessDays: 0 });

  process.env.ACCESS_COUPON_CODE = '';
  assert.throws(() => getCouponConfig(), error => error.code === 'coupon_configuration_missing' && error.statusCode === 503);

  process.env.ACCESS_COUPON_CODE = 'beta-2026';
  const originalVerify = accessService.verifyIdToken;
  accessService.verifyIdToken = async () => ({ uid: 'student-test', medtutorAccess: false });
  let deniedStatus = 0;
  await requireAccess({ headers: { authorization: 'Bearer test-token' } }, {
    status(code) { deniedStatus = code; return this; },
    json() { return this; }
  }, () => assert.fail('an account without an entitlement must not pass'));
  assert.strictEqual(deniedStatus, 403, 'valid Firebase accounts without an active entitlement are denied');

  accessService.verifyIdToken = async () => ({ uid: 'student-test', medtutorAccess: true, medtutorAccessVersion: 'previous-version' });
  let staleVersionStatus = 0;
  await requireAccess({ headers: { authorization: 'Bearer test-token' } }, {
    status(code) { staleVersionStatus = code; return this; },
    json() { return this; }
  }, () => assert.fail('an entitlement from an older coupon version must not pass'));
  assert.strictEqual(staleVersionStatus, 403, 'older access grants must be forced to redeem the current coupon');

  accessService.verifyIdToken = async () => ({ uid: 'student-test', medtutorAccess: true, medtutorAccessVersion: ACCESS_COUPON_VERSION });
  let passed = false;
  await requireAccess({ headers: { authorization: 'Bearer test-token' } }, {}, () => { passed = true; });
  assert.strictEqual(passed, true, 'a valid active entitlement must pass the gate');
  accessService.verifyIdToken = originalVerify;

  const originalFirebaseConfig = {
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS
  };
  const originalConsoleError = console.error;
  const adminLogs = [];
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  console.error = (...args) => adminLogs.push(args);
  try {
    await assert.rejects(accessService.verifyIdToken('test-token'), error =>
      error.statusCode === 503 && error.code === 'firebase_admin_not_configured'
    );
  } finally {
    console.error = originalConsoleError;
    if (originalFirebaseConfig.serviceAccount == null) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalFirebaseConfig.serviceAccount;
    if (originalFirebaseConfig.credentialsPath == null) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    else process.env.GOOGLE_APPLICATION_CREDENTIALS = originalFirebaseConfig.credentialsPath;
  }
  const serializedAdminLog = JSON.stringify(adminLogs);
  assert(serializedAdminLog.includes('firebase_admin_credentials_missing'), 'Render diagnostics must identify missing Firebase Admin credentials');
  assert(!serializedAdminLog.includes('private_key'), 'Firebase Admin diagnostics must not log private key material');
  console.log('✅ Testes de configuração do acesso por cupom aprovados.');
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
  console.error('❌ Falha nos testes de cupom:', error);
  process.exitCode = 1;
});
