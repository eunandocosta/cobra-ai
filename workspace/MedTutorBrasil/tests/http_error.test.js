const assert = require('assert');
const { clientErrorMessage } = require('../src/shared/http-error');

console.log('🧪 Iniciando testes de mensagens de erro seguras...');

const intentional = new Error('Pergunta ou explicação de referência não fornecida.');
intentional.statusCode = 400;
assert.strictEqual(clientErrorMessage(intentional), intentional.message, 'erros intencionais (com statusCode) devem chegar ao cliente');
console.log('  [PASS] Erro com statusCode repassa a mensagem ao cliente');

const originalConsoleError = console.error;
let logged = null;
console.error = (...args) => { logged = args; };
try {
  const internal = new Error('GEMINI_API_KEY não configurada no servidor backend.');
  assert.strictEqual(clientErrorMessage(internal), undefined, 'erros inesperados não devem expor a mensagem interna');
  assert(logged && logged.includes(internal), 'erros ocultados devem ficar registrados no log do servidor');
  assert.strictEqual(clientErrorMessage(undefined), undefined, 'ausência de erro não deve quebrar a resposta');
} finally {
  console.error = originalConsoleError;
}
console.log('  [PASS] Erro inesperado é ocultado do cliente e registrado no servidor');

console.log('🎉 Testes de mensagens de erro seguras concluídos!\n');
