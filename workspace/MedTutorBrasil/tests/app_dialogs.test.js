const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Iniciando testes dos diálogos do app...');
const webDir = path.join(__dirname, '..', 'web');
const appSource = fs.readFileSync(path.join(webDir, 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(webDir, 'styles.css'), 'utf8');

const nativeDialogs = /(?:^|[^\w.])(?:window\.)?(?:alert|confirm|prompt)\s*\(/m;
for (const file of fs.readdirSync(webDir).filter(name => name.endsWith('.js') && name !== 'app.min.js')) {
  const source = fs.readFileSync(path.join(webDir, file), 'utf8');
  const match = source.match(nativeDialogs);
  assert(!match, `${file} não deve usar alert/confirm/prompt nativos: ${match && source.slice(match.index, match.index + 60)}`);
}
console.log('  [PASS] Nenhuma janela nativa do navegador no app');

for (const name of ['appDialog', 'appAlert', 'appConfirm', 'appPrompt', 'showUndoToast', 'restoreDeletedQuestion']) {
  assert(new RegExp(`function\\s+${name}\\s*\\(`).test(appSource), `${name} deve existir`);
}
assert(appSource.includes("event.key === 'Escape'") && appSource.includes("event.key === 'Tab'") && appSource.includes('previousFocus.focus()'), 'o diálogo deve fechar com Esc, prender o foco e devolvê-lo ao sair');
assert(/showUndoToast\('🗑️ Pergunta eliminada/.test(appSource), 'excluir pergunta deve oferecer Desfazer');
console.log('  [PASS] Diálogos acessíveis e Desfazer na exclusão de perguntas');

assert(/@media \(prefers-reduced-motion: reduce\) \{\s*\.profile-frame-svg,\s*\.profile-frame-svg \* \{ animation:none !important; \}/.test(styles), 'o SVG das molduras deve parar com reduzir movimento');
assert(/@media \(prefers-reduced-motion: reduce\) \{\s*\[data-frame\]::before, \[data-frame\]::after \{ animation: none !important; \}/.test(styles), 'o halo do Pulso Neon também deve parar');
console.log('  [PASS] Molduras respeitam "reduzir movimento"');
console.log('🎉 Testes dos diálogos do app concluídos!\n');
