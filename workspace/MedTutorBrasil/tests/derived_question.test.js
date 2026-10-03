require('dotenv').config();
const assert = require('assert');
const quizzesService = require('../src/modules/quizzes/quizzes.service');
const quizzesController = require('../src/modules/quizzes/quizzes.controller');

(async () => {
  console.log('🧪 Iniciando testes de Pergunta Derivada com Contexto...');

  // Teste 1: Validação de ausência de questão ou explicação
  try {
    await quizzesService.generateDerivedQuestion({
      originalQuestion: '',
      originalExplanation: '',
      contexts: ['Contexto 1']
    });
    assert.fail('Deveria ter lançado erro de validação');
  } catch (err) {
    assert.strictEqual(err.statusCode, 400, 'Deveria ter statusCode 400 para pergunta/explicação ausente');
    assert(err.message.includes('Pergunta ou explicação de referência'), 'Mensagem de erro adequada');
    console.log('  [PASS] Validação de pergunta/explicação ausente retorna statusCode 400');
  }

  // Teste 2: Validação de ausência de contextos clínicos
  try {
    await quizzesService.generateDerivedQuestion({
      originalQuestion: 'Caso clínico exemplo',
      originalExplanation: 'Gabarito exemplo',
      contexts: []
    });
    assert.fail('Deveria ter lançado erro de validação');
  } catch (err) {
    assert.strictEqual(err.statusCode, 400, 'Deveria ter statusCode 400 para contextos vazios');
    assert(err.message.includes('ao menos um novo contexto'), 'Mensagem de erro adequada');
    console.log('  [PASS] Validação de contextos ausentes retorna statusCode 400');
  }

  // Teste 3: Controller repassa status 400 e JSON com detalhes
  let respondedStatus = 0;
  let respondedJson = null;
  const mockRes = {
    status(code) {
      respondedStatus = code;
      return this;
    },
    json(data) {
      respondedJson = data;
      return this;
    }
  };

  await quizzesController.generateDerived({ body: { contexts: [] } }, mockRes);
  assert.strictEqual(respondedStatus, 400, 'Controller deve retornar 400 para requisição inválida');
  assert(respondedJson && respondedJson.error, 'Controller deve responder com campo error');
  console.log('  [PASS] QuizzesController propaga 400 Bad Request ao invés de 500');

  // Teste 4: Geração bem-sucedida de pergunta derivada com modelo real/cascade
  if (process.env.GEMINI_API_KEY) {
    console.log('  [INFO] Testando geração real com a esteira de modelos Gemini...');
    const result = await quizzesService.generateDerivedQuestion({
      originalQuestion: 'Paciente hipertenso de 60 anos com tosse seca pós-início de enalapril.',
      originalExplanation: 'O acúmulo de bradicinina e substância P causado pela inibição da ECA deflagra a tosse. A troca por BRA (losartana) é a conduta indicada.',
      contexts: ['Paciente desenvolve angioedema labial além da tosse.'],
      subject: 'Cardiologia',
      topic: 'Farmacologia Cardiovascular',
      studentMistake: 'Sugeriu apenas reduzir a dose do enalapril'
    });

    assert.strictEqual(result.success, true, 'Deve retornar success: true');
    assert(result.question, 'Deve retornar o objeto question');
    assert(result.question.id.startsWith('deriv_'), 'ID deve iniciar com deriv_');
    assert(result.question.question && result.question.question.length > 10, 'Deve conter enunciado');
    assert(Array.isArray(result.question.quizOptions) && result.question.quizOptions.length === 4, 'Deve conter exatamente 4 alternativas');
    assert(typeof result.question.correctIndex === 'number' && result.question.correctIndex >= 0 && result.question.correctIndex < 4, 'correctIndex válido');
    assert(result.question.explanation, 'Deve conter explicação');
    assert(result.question.tripartite && result.question.tripartite.correctReason, 'Deve conter tripartite');
    assert(result.question.flashcard && result.question.flashcard.front && result.question.flashcard.back, 'Deve conter flashcard estruturado');
    assert(result.question.generatorModel, 'Deve indicar o modelo gerador');
    console.log(`  [PASS] Geração real concluída com sucesso com o modelo: ${result.question.generatorModel}`);

    console.log('  [INFO] A ordem da cascata e o fallback por indisponibilidade são validados em gemini-model-fallback.test.js sem chamadas pagas.');
  }

  console.log('🎉 Todos os testes de Pergunta Derivada foram concluídos com sucesso!\n');
})().catch(err => {
  console.error('❌ Falha nos testes de Pergunta Derivada:', err);
  process.exit(1);
});
