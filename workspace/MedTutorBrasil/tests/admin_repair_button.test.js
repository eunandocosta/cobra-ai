const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const repairSource = fs.readFileSync(path.join(root, 'web', 'admin-image-repair.js'), 'utf8');

// Botão de descrever figuras: só admin e só em material com figura sem descrição.
assert.match(appSource, /MedTutorAuthService\?\.adminMenuIsAdmin === true && typeof window\.adminImageRepairPendingCount === 'function' && window\.adminImageRepairPendingCount\(m\) > 0/, 'botão só aparece para admin com figuras pendentes');
assert.match(appSource, /runAdminImageRepairForMaterial && window\.runAdminImageRepairForMaterial\('\$\{safeMatId\}'\)/, 'botão chama o reparo do material');
assert.match(appSource, /this\.adminMenuIsAdmin = isAdmin;/, 'status de admin é guardado ao confirmar');
assert.equal((appSource.match(/this\.adminMenuIsAdmin = false;/g) || []).length, 2, 'status volta a falso ao sair ou trocar de conta');

// Contagem e filtro por material, executados com o arquivo real.
const ctx = vm.createContext({
  console, chatDriveMaterials: [], window: {}, document: { getElementById: () => null, querySelectorAll: () => [] },
  fetch: async () => ({ ok: false }), setTimeout, Promise
});
ctx.window = ctx;
vm.runInContext(repairSource, ctx);
const pending = { imageUrl: 'https://x.supabase.co/storage/v1/object/sign/aulas/a.jpg?token=t', title: 'Página 1' };
const done = { imageUrl: 'https://x.supabase.co/storage/v1/object/sign/aulas/b.jpg?token=t', title: 'Página 2', visualAnalysisCompleted: true };
const hidden = { imageUrl: 'https://x.supabase.co/storage/v1/object/sign/aulas/c.jpg?token=t', title: 'Página 3', hiddenFromFigures: true };
assert.equal(ctx.adminImageRepairPendingCount({ clinicalImages: [pending, done, hidden] }), 1, 'conta só figuras sem análise e visíveis');
assert.equal(ctx.adminImageRepairPendingCount({ clinicalImages: [done] }), 0, 'material já descrito não mostra o botão');
assert.equal(ctx.adminImageRepairPendingCount({}), 0, 'material sem figuras não mostra o botão');
assert.equal(typeof ctx.runAdminImageRepairForMaterial, 'function', 'reparo por material exposto');
assert.equal(typeof ctx.runAdminImageRepair, 'function', 'reparo do acervo continua exposto');
assert.match(repairSource, /\.filter\(material => !materialId \|\| String\(material\.id\) === String\(materialId\)\)/, 'coleta só o material escolhido');
console.log('  [PASS] Botão "Descrever figuras" só para admin e só em material com figuras sem descrição');
