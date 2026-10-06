const assert = require('node:assert/strict');
const fs = require('node:fs');
const { serializeUser, validatePayload, versionParts } = require('../src/modules/announcements/announcements.controller');
const { renderEmail } = require('../src/modules/announcements/announcements.email');

assert.deepEqual(versionParts('v1.12'), [1, 12]);
assert.deepEqual(versionParts('v2.4.9'), [2, 4]);
assert.deepEqual(versionParts('not-a-version'), [0, 0]);

const update = validatePayload({
  kind: 'update', title: 'Melhorias no app', description: 'Texto completo',
  channels: { inApp: true, email: true }, emailConsentPrompt: true,
  promptResponseRequired: false, promptText: 'Quer receber e-mails?'
});
assert.equal(update.kind, 'update');
assert.equal(update.channels.email, true);
assert.equal(update.emailConsentPrompt, true);
assert.equal(validatePayload({ kind: 'notice', title: 'Aviso', description: 'Texto', channels: { inApp: false, email: true } }).channels.email, true);
assert.throws(() => validatePayload({ kind: 'update', title: 'Sem canal', description: 'Texto', channels: { inApp: false, email: false } }), /ao menos um canal/);

const user = serializeUser({ id: 'uid-123', data: () => ({ nome: 'Pessoa Teste', email: 'pessoa@example.com', role: 'admin', faculdade: 'Universo', periodo_atual: '2º Período', senha: 'não deve sair', token: 'secreto' }) });
assert.equal(user.role, 'admin');
assert.equal(user.maskedEmail, 'p***@example.com');
assert.equal(Object.hasOwn(user, 'senha'), false);
assert.equal(Object.hasOwn(user, 'token'), false);
assert.equal(serializeUser({ id: 'uid-2', data: () => ({ role: 'Admin' }) }).role, 'user');

const common = { id: 'notice-1', title: 'Manutenção programada', description: 'Voltaremos em breve.', kind: 'notice' };
const noticeEmail = renderEmail(common, { uid: 'u1' }, { siteUrl: 'https://medtutorbrasil.com.br', unsubscribeSecret: 'test' });
assert.equal(noticeEmail.subject, 'Aviso da MedTutor Brasil: Manutenção programada');
assert.match(noticeEmail.html, /Aviso da MedTutor Brasil: Manutenção programada/);
const updateEmail = renderEmail({ ...common, kind: 'update', version: 'v1.13' }, { uid: 'u1' }, { siteUrl: 'https://medtutorbrasil.com.br', unsubscribeSecret: 'test' });
assert.equal(updateEmail.subject, 'Atualização V1.13 - Manutenção programada');

const adminMarkup = fs.readFileSync(require.resolve('../web/announcements.html'), 'utf8');
const adminUi = fs.readFileSync(require.resolve('../web/announcements.js'), 'utf8');
const firstAccessPrompt = fs.readFileSync(require.resolve('../web/announcement-prompt.js'), 'utf8');
const routes = fs.readFileSync(require.resolve('../src/modules/announcements/announcements.routes.js'), 'utf8');
assert.match(adminMarkup, /name="kind"[\s\S]*?Atualização[\s\S]*?Aviso/);
assert.match(adminMarkup, /name="sendEmail"/);
assert.match(adminMarkup, /name="sendInApp"/);
assert.match(adminMarkup, /name="emailConsentPrompt"[\s\S]*?name="promptResponseRequired"/);
assert.match(adminUi, /admin\/users/);
assert.match(adminUi, /admin\/next-version/);
assert.match(adminUi, /channels: \{ inApp: data\.has\('sendInApp'\), email:/);
assert.match(adminUi, /admin\/summary/);
assert.match(adminUi, /admin\/publications/);
assert.match(adminUi, /authLink\.href = auth(?:\?\.currentUser|\.currentUser) \? '\/chat-ia' : '\/login'/);
assert.match(adminMarkup, /ann-return-app" href="\/chat-ia"/);
assert.match(adminMarkup, /name="kind"[\s\S]*?id="annVersionField"[\s\S]*?Título breve/);
assert.match(adminMarkup, /Carregar mais usuários/);
assert.match(firstAccessPrompt, /announcement-consent-yes/);
assert.match(firstAccessPrompt, /promptResponseRequired !== true/);
assert.match(routes, /controller\.listAdminUsers/);
assert.match(routes, /controller\.updateUserRole/);
assert.match(routes, /controller\.answerPrompt/);

console.log('✓ announcement channels, automatic-version inputs, privacy masking, roles and email headings are validated');
