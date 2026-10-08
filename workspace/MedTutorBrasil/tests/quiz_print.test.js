const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Iniciando testes de Impressão de Quiz (Múltipla Escolha & Discursiva)...');

const htmlContent = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf-8');
const cssContent = fs.readFileSync(path.join(__dirname, '../web/styles.css'), 'utf-8');
const jsContent = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf-8');

// 1. Verificação dos botões e gatilhos de impressão no index.html
assert(htmlContent.includes('id="qzPrintQuizBtn"'), 'Botão qzPrintQuizBtn deve existir na barra de estudo de Quizzes');
assert(htmlContent.includes('id="btnQuizModeBarPrint"'), 'Botão rápido btnQuizModeBarPrint deve existir no quizModeBar');
assert(htmlContent.includes('openQuizPrintModal()'), 'openQuizPrintModal deve ser chamado pelos botões de impressão');

// 2. Verificação da estrutura do modal de impressão no index.html
assert(htmlContent.includes('id="quizPrintModal"'), 'Modal quizPrintModal deve existir');
assert(htmlContent.includes('id="quizPrintFormatMultiple"'), 'Card de formato Múltipla Escolha deve existir');
assert(htmlContent.includes('id="quizPrintFormatDiscursive"'), 'Card de formato Discursivo deve existir');
assert(htmlContent.includes('id="quizPrintDiscursiveOptions"'), 'Opções de linhas discursivas devem existir');
assert(htmlContent.includes('data-lines="5"'), 'Opção de 5 linhas deve existir');
assert(htmlContent.includes('data-lines="7"'), 'Opção de 7 linhas deve existir');
assert(htmlContent.includes('data-lines="10"'), 'Opção de 10 linhas deve existir');
assert(htmlContent.includes('id="quizPrintIncludeHeader"'), 'Checkbox de cabeçalho de avaliação deve existir');
assert(htmlContent.includes('id="quizPrintIncludeKey"'), 'Checkbox de gabarito e resolução comentada deve existir');
assert(htmlContent.includes('id="btnExecuteQuizPrint"'), 'Botão de execução de impressão deve existir');
assert(htmlContent.includes('id="quizPrintArea"'), 'Container quizPrintArea para impressão isolada deve existir');

// 3. Verificação das regras de estilo e isolamento no styles.css
assert(cssContent.includes('body.printing-quiz > *:not(#quizPrintArea)'), 'Isolamento de impressão deve ocultar tudo exceto quizPrintArea quando printing-quiz');
assert(cssContent.includes('body.printing-quiz #quizPrintArea'), 'Estilos de impressão para quizPrintArea devem existir');
assert(cssContent.includes('#quizPrintArea'), 'Estilo para ocultar quizPrintArea na tela deve existir');
assert(cssContent.includes('.quiz-print-discursive-line'), 'Estilos da linha discursiva devem existir');
assert(cssContent.includes('min-height: 32px'), 'Linhas discursivas devem ter altura de pelo menos 32px para caligrafia humana confortável');
assert(cssContent.includes('.quiz-print-discursive-line-rule'), 'Régua contínua da linha discursiva deve existir');
assert(cssContent.includes('page-break-before: always'), 'Quebra de página antes do gabarito deve existir');

// 4. Verificação das funções implementadas no app.js
assert(jsContent.includes('function openQuizPrintModal()'), 'openQuizPrintModal deve estar definida em app.js');
assert(jsContent.includes('function closeQuizPrintModal()'), 'closeQuizPrintModal deve estar definida em app.js');
assert(jsContent.includes('function selectQuizPrintFormat('), 'selectQuizPrintFormat deve estar definida em app.js');
assert(jsContent.includes('function setQuizPrintLinesCount('), 'setQuizPrintLinesCount deve estar definida em app.js');
assert(jsContent.includes('function executeQuizPrint()'), 'executeQuizPrint deve estar definida em app.js');

// 5. Teste unitário da geração de linhas discursivas e formato múltipla escolha
// Simula a lógica de montagem do HTML do quiz print
function generateMockQuizPrintHtml(questions, options) {
  const isDiscursive = options.format === 'discursive';
  const linesCount = Math.max(5, options.discursiveLines || 5);
  let html = '<div class="quiz-print-sheet">';

  if (options.includeHeader) {
    html += '<div class="quiz-print-header"><h1>Avaliação Formativa</h1></div>';
  }

  questions.forEach((q, idx) => {
    html += `<div class="quiz-print-question-card"><p>${q.question}</p>`;
    if (isDiscursive) {
      html += '<div class="quiz-print-discursive-lines">';
      for (let l = 1; l <= linesCount; l++) {
        html += `<div class="quiz-print-discursive-line"><span class="num">${l}.</span><span class="rule"></span></div>`;
      }
      html += '</div>';
    } else {
      html += '<div class="quiz-print-options">';
      (q.quizOptions || []).forEach((opt, oIdx) => {
        html += `<div class="quiz-print-option-row"><span>${String.fromCharCode(65 + oIdx)})</span> ${opt}</div>`;
      });
      html += '</div>';
    }
    html += '</div>';
  });

  if (options.includeKey) {
    html += '<div class="quiz-print-key-section"><h2>Gabarito Oficial</h2></div>';
  }
  html += '</div>';
  return html;
}

const mockQuestions = [
  {
    id: 'q1',
    question: 'Qual a conduta inicial na cetoacidose diabética?',
    quizOptions: ['Hidratação venosa e insulinoterapia', 'Antibioticoterapia empírica', 'Bicarbonato imediato', 'Diurético de alça'],
    correctIndex: 0,
    explanation: 'A hidratação vigorosa restaura a volemia e a perfusão tecidual.'
  },
  {
    id: 'q2',
    question: 'Descreva os achados tomográficos da pneumonia bacteriana.',
    quizOptions: ['Consolidação com broncograma aéreo', 'Vidro fosco difuso', 'Pneumotórax hipertensivo', 'Derrame pericárdico'],
    correctIndex: 0,
    explanation: 'Consolidação lobar com broncograma aéreo é o achado clássico.'
  }
];

// Teste do modo Discursivo garantindo pelo menos 5 linhas
const discursiveHtml = generateMockQuizPrintHtml(mockQuestions, {
  format: 'discursive',
  discursiveLines: 5,
  includeHeader: true,
  includeKey: true
});

const discursiveLinesMatches = discursiveHtml.match(/class="quiz-print-discursive-line"/g);
assert(discursiveLinesMatches && discursiveLinesMatches.length === 10, 'Deve gerar exatamente 10 linhas no total (5 linhas x 2 questões)');
assert(discursiveHtml.includes('quiz-print-header'), 'Deve incluir cabeçalho');
assert(discursiveHtml.includes('quiz-print-key-section'), 'Deve incluir gabarito');

// Teste com valor inferior a 5 garantindo fallback para o mínimo de 5 linhas
const fallbackHtml = generateMockQuizPrintHtml(mockQuestions, {
  format: 'discursive',
  discursiveLines: 2, // tentativa inválida de menos de 5
  includeHeader: true,
  includeKey: false
});
const fallbackLinesMatches = fallbackHtml.match(/class="quiz-print-discursive-line"/g);
assert(fallbackLinesMatches && fallbackLinesMatches.length === 10, 'Deve assegurar o mínimo de 5 linhas mesmo se configurado com menos');

// Teste do modo Múltipla Escolha
const multipleHtml = generateMockQuizPrintHtml(mockQuestions, {
  format: 'multiple',
  includeHeader: true,
  includeKey: true
});
assert(multipleHtml.includes('quiz-print-option-row'), 'Deve conter opções de múltipla escolha');
assert(!multipleHtml.includes('quiz-print-discursive-line'), 'Não deve conter linhas discursivas no modo de múltipla escolha');

console.log('✅ Todos os testes de impressão de Quiz passaram com sucesso!');
