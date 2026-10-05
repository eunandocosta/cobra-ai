const assert = require('node:assert/strict');
const { signedUnsubscribeToken, verifyUnsubscribeToken } = require('../src/modules/announcements/announcements.email');

const secret = 'test-secret-not-used-in-production';
const uid = 'firebase.uid.with.period';
const token = signedUnsubscribeToken(uid, secret);

assert.equal(verifyUnsubscribeToken(token, secret), uid, 'signed token should preserve a UID containing periods');
assert.equal(verifyUnsubscribeToken(`${token}x`, secret), '', 'tampered tokens must be rejected');
assert.equal(verifyUnsubscribeToken('', secret), '', 'empty tokens must be rejected');

console.log('✓ announcement email unsubscribe signatures are validated');
