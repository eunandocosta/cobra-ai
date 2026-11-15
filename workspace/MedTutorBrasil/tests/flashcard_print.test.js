const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');

// Botão na aba de flashcards, da matéria selecionada.
assert.match(html, /id="fcPrintFlashcardsBtn" onclick="openFlashcardPrintModal\(\)"/, 'botão de imprimir flashcards na aba de flashcards');
assert.ok(html.indexOf('id="fcPrintFlashcardsBtn"') < html.indexOf('id="fcUploadMaterialBtn"'), 'botão fica na barra de estudo de flashcards');

// Flashcards saem sempre no formato discursivo, com linhas para resposta.
assert.match(app, /function openFlashcardPrintModal\(\) \{\s*quizPrintState\.source = 'flashcards';\s*quizPrintState\.format = 'discursive';/, 'modo flashcards força formato discursivo');
assert.match(app, /function selectQuizPrintFormat\(format\) \{\s*quizPrintState\.format = \(quizPrintState\.source === 'flashcards' \|\| format === 'discursive'\)/, 'não volta para múltipla escolha no modo flashcards');
assert.match(app, /if \(quizPrintState\.source === 'flashcards'\) return getFlashcardPrintItems\(\);/, 'lista de impressão usa os flashcards');
assert.match(app, /front = String\(item\.flashcard\?\.front \|\| item\.front \|\| item\.question/, 'frente do flashcard vira o enunciado');
assert.match(app, /back = String\(item\.flashcard\?\.back \|\| item\.back/, 'verso do flashcard vira a resposta de referência');
assert.match(app, /function closeQuizPrintModal\(\) \{[\s\S]*?quizPrintState\.source = 'quiz';/, 'fechar o modal volta ao modo quiz');

// Quiz continua imprimindo as questões da matéria, como antes.
assert.match(app, /if \(quizPrintState\.source === 'flashcards'\) return getFlashcardPrintItems\(\);\s*let list = \(typeof getFilteredQuestions/, 'quiz mantém o filtro de questões');
console.log('  [PASS] Botão "Imprimir Flashcards" na aba de flashcards, com linhas para resposta, da matéria selecionada');

// A área de impressão só é limpa quando o diálogo fecha; prazo curto deixava o PDF em branco.
assert.doesNotMatch(app, /window\.print\(\);\s*setTimeout\(cleanupPrint, 3000\);/, 'a limpeza não ocorre 3 s após abrir o diálogo');
assert.match(app, /window\.print\(\);\s*\/\/ O conteúdo só sai[\s\S]*?setTimeout\(cleanupPrint, 600000\);/, 'limpeza feita pelo afterprint, com rede de segurança longa');
console.log('  [PASS] Área de impressão permanece até o diálogo fechar, sem PDF em branco');
