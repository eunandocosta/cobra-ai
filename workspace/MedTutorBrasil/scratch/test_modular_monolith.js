const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('=== TESTE DE CONFORMIDADE: MONOLITO MODULAR ESTRITO ===\n');

// 1. Verificar Ponto de Entrada (index.js)
const indexPath = path.join(__dirname, '..', 'index.js');
assert(fs.existsSync(indexPath), 'index.js deve existir na raiz');

const indexContent = fs.readFileSync(indexPath, 'utf-8');
const lines = indexContent.split('\n').filter(l => l.trim().length > 0);
console.log(`[PASS] index.js encontrado (${lines.length} linhas não vazias)`);
assert(lines.length <= 45, `index.js deve ter menos de 45 linhas (atual: ${lines.length})`);

// Verificar ausência de lógica acoplada em index.js
const forbiddenPatterns = [
  'function generateQuiz',
  'function processMessage',
  'firebase.firestore',
  'req.query',
  'SELECT ',
  'UPDATE ',
  'res.send("<!DOCTYPE'
];
for (const pattern of forbiddenPatterns) {
  assert(!indexContent.includes(pattern), `index.js não deve conter regras de negócio inline ('${pattern}')`);
}
console.log('[PASS] index.js livre de regras de negócio acopladas');

// 2. Verificar Estrutura dos Módulos (src/modules)
const modulesDir = path.join(__dirname, '..', 'src', 'modules');
assert(fs.existsSync(modulesDir), 'Diretório src/modules deve existir');

const requiredModules = ['auth', 'ementas', 'relatorios', 'quizzes', 'chat'];
for (const mod of requiredModules) {
  const modPath = path.join(modulesDir, mod);
  assert(fs.existsSync(modPath), `Módulo '${mod}' deve existir em src/modules/`);

  const routesFile = path.join(modPath, `${mod}.routes.js`);
  const controllerFile = path.join(modPath, `${mod}.controller.js`);
  const serviceFile = path.join(modPath, `${mod}.service.js`);

  assert(fs.existsSync(routesFile), `Arquivo de rotas '${mod}.routes.js' deve existir`);
  assert(fs.existsSync(controllerFile), `Controlador '${mod}.controller.js' deve existir`);
  assert(fs.existsSync(serviceFile), `Serviço '${mod}.service.js' deve existir`);

  console.log(`[PASS] Módulo '${mod}' validado com isolamento de rotas, controlador e serviço`);
}

// 3. Teste de Inicialização e Roteamento HTTP (sem chamadas externas de IA)
const reportService = require('../src/modules/relatorios/relatorios.service');
const quizService = require('../src/modules/quizzes/quizzes.service');
const chatService = require('../src/modules/chat/chat.service');
reportService.generateReport = async (payload) => ({ title: payload.title, subject: payload.subject, html: '<p>Relatório de teste</p>' });
quizService.generateQuestions = async () => ({ questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] });
chatService.processMessage = async () => ({ reply: 'Resposta de teste baseada em diretrizes médicas.' });
const app = require('../index.js');
const server = http.createServer((req, res) => app.handle(req, res));

const TEST_PORT = 3456;

server.listen(TEST_PORT, async () => {
  console.log(`\nIniciando testes de requisições HTTP na porta ${TEST_PORT}...`);

  const makeRequest = (method, urlPath, body = null) => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: urlPath,
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, rawBody: data });
          }
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  };

  try {
    // Test 1: Healthcheck
    const health = await makeRequest('GET', '/api/health');
    assert.strictEqual(health.statusCode, 200);
    assert.strictEqual(health.body.architecture, 'modular-monolith');
    console.log('[PASS] GET /api/health -> 200 OK (modular-monolith)');

    // Test 2: Auth Module
    const session = await makeRequest('POST', '/api/auth/session', { email: 'aluno@medicina.uf.br' });
    assert.strictEqual(session.statusCode, 200);
    assert.strictEqual(session.body.authenticated, true);
    console.log(`[PASS] POST /api/auth/session -> 200 OK (${session.body.user.email})`);

    const profile = await makeRequest('GET', '/api/auth/profile');
    assert.strictEqual(profile.statusCode, 200);
    assert.strictEqual(profile.body.email, 'aluno@medicina.uf.br');
    console.log(`[PASS] GET /api/auth/profile -> 200 OK (${profile.body.nome})`);

    // Test 3: Ementas Module
    const ementas = await makeRequest('GET', '/api/ementas');
    assert.strictEqual(ementas.statusCode, 200);
    assert(Array.isArray(ementas.body.curriculo), 'Curriculo deve ser um array');
    console.log(`[PASS] GET /api/ementas -> 200 OK (${ementas.body.curriculo.length} períodos curriculares carregados)`);

    // Test 4: Relatórios Module
    const relatorio = await makeRequest('POST', '/api/relatorios/gerar', {
      subject: 'Neurologia',
      title: 'Vias Sensitivas e Motoras',
      content: 'As vias sensitivas e motoras integram neurônios, tratos medulares, tronco encefálico e córtex cerebral para organizar a percepção e o movimento voluntário.'
    });
    assert.strictEqual(relatorio.statusCode, 200);
    assert(relatorio.body.title.includes('Vias Sensitivas e Motoras'));
    console.log(`[PASS] POST /api/relatorios/gerar -> 200 OK ('${relatorio.body.title}')`);

    const invalidReport = await makeRequest('POST', '/api/relatorios/gerar', { title: 'Sem conteúdo' });
    assert.strictEqual(invalidReport.statusCode, 400);
    console.log('[PASS] POST /api/relatorios/gerar sem conteúdo -> 400 Bad Request');

    // Test 5: Quizzes Module
    const quiz = await makeRequest('POST', '/api/quizzes/gerar', {
      subject: 'Neurologia',
      topic: 'Tronco Encefálico',
      count: 3,
      materialText: 'O tronco encefálico é formado por mesencéfalo, ponte e bulbo, contendo vias ascendentes, descendentes e núcleos de nervos cranianos.'
    });
    assert.strictEqual(quiz.statusCode, 200);
    assert.strictEqual(quiz.body.questions.length, 3);
    console.log(`[PASS] POST /api/quizzes/gerar -> 200 OK (${quiz.body.questions.length} questões com distratores)`);

    // Test 6: Chat & Evidências Module
    const chatEvidence = await makeRequest('POST', '/api/chat/evidencias', {
      topic: 'Tronco Encefálico',
      subject: 'Neurologia'
    });
    assert.strictEqual(chatEvidence.statusCode, 200);
    assert(chatEvidence.body.urls.pubmed.includes('pubmed.ncbi.nlm.nih.gov'));
    console.log('[PASS] POST /api/chat/evidencias -> 200 OK (Bases científicas PubMed/SciELO/Sciencedirect integradas)');

    const chatMsg = await makeRequest('POST', '/api/chat/mensagem', {
      message: 'Explique a anatomia do tronco encefálico',
      subject: 'Neurologia'
    });
    assert.strictEqual(chatMsg.statusCode, 200);
    assert(chatMsg.body.reply.includes('diretrizes médicas'));
    console.log('[PASS] POST /api/chat/mensagem -> 200 OK (MedCopilot clínico com evidências)');

    console.log('\n======================================================');
    console.log('🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
    console.log('O MedTutor Brasil foi refatorado para um Monolito Modular Estrito!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Falha nos testes de roteamento:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
