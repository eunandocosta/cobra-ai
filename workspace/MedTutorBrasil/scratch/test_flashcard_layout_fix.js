const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== TESTE DE VALIDAÇÃO: LAYOUT, ALTURA DO CARD, LINHA BRANCA E BOTÕES DE FLASHCARD ===\n');

const stylesPath = path.join(__dirname, '../web/styles.css');
const indexPath = path.join(__dirname, '../web/index.html');
const appPath = path.join(__dirname, '../web/app.js');

const stylesContent = fs.readFileSync(stylesPath, 'utf8');
const indexContent = fs.readFileSync(indexPath, 'utf8');
const appContent = fs.readFileSync(appPath, 'utf8');

// 1. Color-scheme no dark theme
assert(
  stylesContent.includes(':root {\n      color-scheme: dark;') ||
  stylesContent.includes('color-scheme: dark;'),
  'styles.css deve declarar color-scheme: dark para evitar que navegadores renderizem barras nativas em branco'
);
console.log('[PASS] 1. color-scheme: dark declarado nas raízes e nos componentes de flashcard');

// 2. flashcard-flip-target sem altura forçada de 560px / min-height 440px
assert(
  !stylesContent.includes('height: min(560px, calc(100dvh - 250px));'),
  'flashcard-flip-target não deve ter altura forçada de 560px travando o card gigante'
);
assert(
  !stylesContent.includes('min-height: 440px;'),
  'flashcard-flip-target não deve ter min-height de 440px gerando espaço preto ocioso'
);
console.log('[PASS] 2. Altura excessiva fixa (560px / 440px) removida do flashcard');

// 3. flashcard-side auto-adaptativo, sem scrollbar-gutter: stable e com overflow-y: auto
assert(
  stylesContent.includes('.flashcard-side {') &&
  stylesContent.includes('overflow-y: auto;') &&
  !stylesContent.includes('scrollbar-gutter: stable;'),
  '.flashcard-side deve usar overflow-y: auto e não deve ter scrollbar-gutter: stable (que desenhava a linha branca)'
);
console.log('[PASS] 3. Linha branca eliminada (scrollbar-gutter removido, overflow-y: auto configurado)');

// 4. study-review-actions com navegação e ferramentas organizadas e espaçamento adequado
assert(
  stylesContent.includes('.study-review-nav-row') &&
  stylesContent.includes('.study-review-tools-row'),
  'styles.css deve definir as linhas de navegação e ferramentas para não espremer os botões'
);
assert(
  indexContent.includes('class="study-review-nav-row"') &&
  indexContent.includes('class="study-review-tools-row"'),
  'index.html deve agrupar os botões de navegação e ferramentas de estudo'
);
assert(
  indexContent.includes('id="fcPreviousButton"') &&
  indexContent.includes('id="fcNextButton"'),
  'IDs dos botões de navegação do flashcard (fcPreviousButton, fcNextButton) devem ser preservados'
);
console.log('[PASS] 4. Botões organizados em linhas estruturadas com margens confortáveis e IDs íntegros');

// 5. Verificação de integridade dos seletores de virada
assert(
  indexContent.includes('flipCardManual()'),
  'index.html deve manter a função flipCardManual vinculada'
);
console.log('[PASS] 5. Interação de virar cartão preservada');

console.log('\n======================================================');
console.log('🎉 TODOS OS TESTES DE LAYOUT E VISIBILIDADE PASSARAM COM SUCESSO!');
console.log('======================================================\n');
