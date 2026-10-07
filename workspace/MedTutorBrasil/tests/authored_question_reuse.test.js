require('dotenv').config();
const assert = require('assert');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const quizzesService = require('../src/modules/quizzes/quizzes.service');

(async () => {
  console.log('🧪 Testando preservação integral de questão autoral...');
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalQuizModel = process.env.MODEL_QUIZ;
  const originalBalancedModel = process.env.MODEL_BALANCED;
  const originalGetModel = GoogleGenerativeAI.prototype.getGenerativeModel;
  const sourceLine = 'Questão 1: No caso 1, qual estrutura anatômica conduz as fibras da coluna dorsal até o bulbo?';
  let mockQuestions;
  const makeQuestion = (question, sourceIndex, origin, answer) => ({
    pergunta: question,
    alternativas: [answer, 'Alternativa incorreta A', 'Alternativa incorreta B', 'Alternativa incorreta C'],
    gabarito: 'A',
    texto_resposta_correta: answer,
    justificativa: `A resposta se apoia no conteúdo: ${answer}.`,
    analise_distratores: [
      { alternativa: 'Alternativa incorreta A', explicacao: 'Confunde a função descrita.' },
      { alternativa: 'Alternativa incorreta B', explicacao: 'Indica outra estrutura.' },
      { alternativa: 'Alternativa incorreta C', explicacao: 'Não corresponde ao trajeto.' }
    ],
    perola_clinica: 'Relacione estrutura e função.',
    titulo_flashcard: 'Trajeto das fibras',
    origem_pergunta: origin,
    indice_questao_fonte: sourceIndex,
    nivel_dificuldade: 'iniciante',
    secao_origem: 'Vias sensitivas',
    eixo_aprendizagem: 'base',
    evidencia_fonte: 'As fibras sobem ipsilateralmente pelas colunas dorsais até os núcleos grácil e cuneiforme no bulbo.'
  });

  try {
    process.env.GEMINI_API_KEY = 'test-api-key';
    process.env.MODEL_QUIZ = 'gemini-test-quiz';
    GoogleGenerativeAI.prototype.getGenerativeModel = function () {
      return {
        generateContent: async () => ({ response: { text: () => JSON.stringify(mockQuestions) } })
      };
    };

    mockQuestions = [
      makeQuestion('No caso 1, qual estrutura anatômica conduz as fibras da coluna dorsal até o bulbo?', 0, 'reaproveitada_da_fonte', 'Fascículo grácil e cuneiforme'),
      { ...makeQuestion('Por qual região da medula as fibras sobem até os núcleos grácil e cuneiforme?', 0, 'inspirada_na_fonte', 'Pelas colunas dorsais, ipsilateralmente'), evidencia_fonte: 'As fibras sobem ipsilateralmente pelas colunas dorsais até os núcleos grácil e cuneiforme no bulbo.' }
    ];
    const generated = await quizzesService.generateQuestions({
      materialText: `Caso 1: Homem de 19 anos apresenta perda sensitiva vibratória distal.\n${sourceLine}\nAs fibras sobem ipsilateralmente pelas colunas dorsais até os núcleos grácil e cuneiforme no bulbo.`,
      quantidade: 1,
      generationMode: 'science_based',
      difficulty: 'balanced'
    });

    const reused = generated.find(item => item.sourceQuestionOrigin === 'reaproveitada_da_fonte');
    const inspired = generated.find(item => item.sourceQuestionOrigin === 'inspirada_na_fonte');
    assert(reused, 'A questão autoral deve ser mantida no resultado');
    assert.strictEqual(reused.question, 'Contexto: Homem de 19 anos apresenta perda sensitiva vibratória distal. Qual estrutura anatômica conduz as fibras da coluna dorsal até o bulbo?');
    assert.strictEqual(reused.sourceQuestionText, sourceLine);
    assert(inspired, 'O lote também deve conter uma questão adicional inspirada');
    console.log('  [PASS] Questão autoral com "no caso 1" e índice omitido é reconciliada pelo enunciado');
    console.log('  [PASS] Referência a caso é substituída pelos achados correspondentes da fonte');
    console.log('  [PASS] Questão inspirada permanece adicional');

    mockQuestions = [
      { ...makeQuestion('Qual glândula produz secreção holócrina, conforme a Figura 2?', 0, 'inspirada_na_fonte', 'Glândula sebácea'), evidencia_fonte: 'As glândulas sebáceas produzem secreção holócrina.' },
      makeQuestion('Qual estrutura está indicada na Figura 2?', 0, 'inspirada_na_fonte', 'Estrutura visual')
    ];
    const visualReferenceQuestions = await quizzesService.generateQuestions({
      materialText: 'As glândulas sebáceas produzem secreção holócrina.',
      quantidade: 2,
      generationMode: 'science_based',
      difficulty: 'balanced'
    });
    assert.strictEqual(visualReferenceQuestions.length, 1, 'A questão impossível deve ser descartada sem eliminar as demais');
    assert.strictEqual(visualReferenceQuestions[0].question, 'Qual glândula produz secreção holócrina?');
    assert(!/Figura\s*2/i.test(visualReferenceQuestions[0].question), 'A referência à figura ausente deve sair do enunciado');
    console.log('  [PASS] Referência a figura removida quando o enunciado continua completo');
    console.log('  [PASS] Questão dependente exclusivamente de figura é descartada individualmente');

    mockQuestions = [
      { ...makeQuestion('Como as fibras percorrem as colunas dorsais até o bulbo?', 0, 'inspirada_na_fonte', 'Sobem ipsilateralmente pelas colunas dorsais'), evidencia_fonte: 'As fibras sobem ipsilateralmente pelas colunas dorsais até os núcleos grácil e cuneiforme no bulbo.' }
    ];
    const withoutCaseDetails = await quizzesService.generateQuestions({
      materialText: `${sourceLine}\nAs fibras sobem ipsilateralmente pelas colunas dorsais até os núcleos grácil e cuneiforme no bulbo.`,
      quantidade: 1,
      generationMode: 'science_based',
      difficulty: 'balanced'
    });
    assert.strictEqual(withoutCaseDetails.length, 1, 'A questão com contexto não recuperável deve ser descartada sem cancelar o lote');
    assert.strictEqual(withoutCaseDetails[0].sourceQuestionOrigin, 'inspirada_na_fonte');
    console.log('  [PASS] Sem contexto recuperável, apenas a questão problemática é descartada');

    mockQuestions = [
      makeQuestion('sintoma do paciente está associado a cada um deles?', 0, 'inspirada_na_fonte', 'Relação anatômico-funcional'),
      makeQuestion('(ipsilateral) ou do lado oposto (contralateral) à lesão?', 0, 'inspirada_na_fonte', 'Depende do nível de decussação'),
      { ...makeQuestion('Para qual lado seguem as fibras após cruzar na decussação sensitiva?', 0, 'inspirada_na_fonte', 'Pelo lado oposto'), evidencia_fonte: 'As fibras da via cruzam na decussação sensitiva e seguem pelo lado oposto.' }
    ];
    const completeQuestions = await quizzesService.generateQuestions({
      materialText: 'As fibras da via cruzam na decussação sensitiva e seguem pelo lado oposto.',
      quantidade: 3,
      generationMode: 'science_based',
      difficulty: 'balanced'
    });
    assert.strictEqual(completeQuestions.length, 1, 'Fragmentos devem ser descartados individualmente');
    assert.strictEqual(completeQuestions[0].question, 'Para qual lado seguem as fibras após cruzar na decussação sensitiva?');
    console.log('  [PASS] Fragmentos iniciados em minúscula ou parênteses são descartados; questão completa é mantida');

    mockQuestions = [
      {
        ...makeQuestion('Qual é a ordem correta da paramentação cirúrgica?', 0, 'nova_a_partir_da_fonte', 'Gorro, máscara e óculos, avental estéril e luvas estéreis'),
        secao_origem: 'Paramentação cirúrgica',
        evidencia_fonte: 'Gorro primeiro; máscara e óculos; avental estéril; luvas estéreis.'
      },
      {
        ...makeQuestion('Qual trato conduz as fibras da coluna dorsal até o bulbo?', 0, 'nova_a_partir_da_fonte', 'Fascículo grácil e cuneiforme'),
        secao_origem: 'Vias sensitivas',
        evidencia_fonte: 'Gorro primeiro; máscara e óculos; avental estéril; luvas estéreis.'
      }
    ];
    const groundedBatch = await quizzesService.generateQuestions({
      materialText: 'Paramentação cirúrgica: gorro primeiro, cobrindo todo o cabelo; máscara e óculos; avental estéril; luvas estéreis por último.',
      materialName: 'Biossegurança cirúrgica',
      materialId: 'material-biosseguranca',
      targetSubject: 'Clínica Médica',
      quantidade: 2,
      difficulty: 'balanced'
    });
    assert.strictEqual(groundedBatch.length, 1, 'Questão de outro assunto deve ser rejeitada, mesmo se o modelo disser que veio da fonte');
    assert.match(groundedBatch[0].question, /paramentação/i);
    assert.strictEqual(groundedBatch[0].sourceEvidence, 'Gorro primeiro; máscara e óculos; avental estéril; luvas estéreis.');
    console.log('  [PASS] Questão fora do tema é rejeitada individualmente por falta de evidência alinhada ao texto-base');

    const trochlearEvidence = 'O nervo troclear é o único nervo craniano que emerge dorsalmente do tronco encefálico.';
    mockQuestions = [
      {
        ...makeQuestion('Qual nervo craniano é singular por sair pela face posterior do tronco encefálico?', 0, 'nova_a_partir_da_fonte', 'Nervo troclear'),
        evidencia_fonte: trochlearEvidence
      }
    ];
    const paraphrasedGroundedQuestion = await quizzesService.generateQuestions({
      materialText: trochlearEvidence,
      materialName: 'Neuroanatomia do tronco encefálico',
      quantidade: 1,
      difficulty: 'balanced'
    });
    assert.strictEqual(paraphrasedGroundedQuestion.length, 1, 'Paráfrase didática ancorada por evidência literal não deve ser rejeitada por diferença lexical');
    console.log('  [PASS] Paráfrase com resposta e evidência ancoradas no material passa pela validação lexical tolerante');

    const kahootChromeMaterial = 'Kahoot — plataforma de quiz interativo. Zona restrita: acesso exclusivo da equipe paramentada. A paramentação cirúrgica segue esta ordem: gorro, máscara e óculos, avental estéril e luvas estéreis.';
    mockQuestions = [
      {
        ...makeQuestion('Qual foi a plataforma utilizada para gerar o quiz interativo?', 0, 'nova_a_partir_da_fonte', 'Kahoot'),
        evidencia_fonte: 'Kahoot — plataforma de quiz interativo.'
      },
      {
        ...makeQuestion('Qual é a sequência correta dos itens de paramentação cirúrgica?', 0, 'nova_a_partir_da_fonte', 'Gorro, máscara e óculos, avental estéril e luvas estéreis'),
        evidencia_fonte: 'A paramentação cirúrgica segue esta ordem: gorro, máscara e óculos, avental estéril e luvas estéreis.'
      }
    ];
    const kahootFiltered = await quizzesService.generateQuestions({
      materialText: kahootChromeMaterial,
      materialName: 'Quiz de biossegurança',
      materialId: 'material-kahoot-biosseguranca',
      targetSubject: 'Clínica Médica',
      quantidade: 2,
      difficulty: 'balanced'
    });
    assert.strictEqual(kahootFiltered.length, 1, 'Metadados Kahoot não devem virar questão, mesmo se aparecerem no texto extraído');
    assert.match(kahootFiltered[0].question, /paramentação cirúrgica/i);
    console.log('  [PASS] Marca/descrição do Kahoot não vira questão; conteúdo do quiz continua aproveitável');

    const authoredMetaQuestion = 'Qual plataforma foi usada para gerar o quiz interativo?';
    mockQuestions = [
      makeQuestion(authoredMetaQuestion, 1, 'reaproveitada_da_fonte', 'Kahoot')
    ];
    const sourceQuizQuestion = await quizzesService.generateQuestions({
      materialText: `Questão 1: ${authoredMetaQuestion}\nA) Kahoot\nB) Moodle\nC) Canvas\nD) Google Forms`,
      quantidade: 1,
      difficulty: 'balanced'
    });
    assert.strictEqual(sourceQuizQuestion.length, 1, 'Pergunta realmente presente no quiz autoral deve ser preservada integralmente');
    assert.strictEqual(sourceQuizQuestion[0].sourceQuestionOrigin, 'reaproveitada_da_fonte');
    console.log('  [PASS] Questão autoral real é preservada; filtro se aplica apenas a conteúdo inventado a partir da interface');

    const kahootQuestionText = [
      'Questão 1: Qual é a ordem correta da paramentação cirúrgica?',
      'A) Gorro, máscara e óculos, avental estéril e luvas estéreis',
      'B) Máscara, gorro, luvas estéreis e avental',
      'C) Luvas, avental, gorro e máscara',
      'D) Avental, gorro, máscara e luvas',
      'Gabarito: A'
    ].join('\n');
    mockQuestions = [
      makeQuestion('Qual é a ordem correta da paramentação cirúrgica?', 1, 'reaproveitada_da_fonte', 'Gorro, máscara e óculos, avental estéril e luvas estéreis')
    ];
    const kahootQuizPage = await quizzesService.generateQuestions({
      materialText: `Kahoot • Questão 1 de 10\n${kahootQuestionText}`,
      quantidade: 1,
      difficulty: 'balanced'
    });
    assert.strictEqual(kahootQuizPage.length, 1, 'Página de quiz deve ser reconhecida como fonte didática');
    assert.deepStrictEqual([...kahootQuizPage[0].quizOptions].sort(), [
      'Gorro, máscara e óculos, avental estéril e luvas estéreis',
      'Máscara, gorro, luvas estéreis e avental',
      'Luvas, avental, gorro e máscara',
      'Avental, gorro, máscara e luvas'
    ].sort(), 'Alternativas autorais devem ser preservadas, não substituídas por perguntas sobre a interface');
    assert.strictEqual(kahootQuizPage[0].correctAnswerText, 'Gorro, máscara e óculos, avental estéril e luvas estéreis');
    console.log('  [PASS] Página Kahoot mantém enunciado, alternativas e gabarito da questão autoral');

    mockQuestions = [
      {
        ...makeQuestion('Qual estrutura conduz o impulso nervoso até o córtex cerebral?', 0, 'nova_a_partir_da_fonte', 'Trato corticoespinhal'),
        evidencia_fonte: 'O trato corticoespinhal conduz o impulso nervoso até o córtex cerebral.'
      }
    ];
    let emptyValidationError;
    try {
      await quizzesService.generateQuestions({
        materialText: 'A paramentação cirúrgica segue a ordem: gorro, máscara e óculos, avental estéril e luvas estéreis.',
        materialName: 'Paramentação cirúrgica',
        quantidade: 1,
        difficulty: 'balanced'
      });
    } catch (error) {
      emptyValidationError = error;
    }
    assert(emptyValidationError, 'Lote sem questões válidas deve expor erro diagnóstico em vez de resposta vazia silenciosa');
    assert.strictEqual(emptyValidationError.statusCode, 422);
    assert.strictEqual(emptyValidationError.code, 'QUIZ-EMPTY-VALIDATION');
    assert.strictEqual(emptyValidationError.diagnostics.rejected.insufficient_evidence, 1);
    assert.strictEqual(emptyValidationError.diagnostics.rejected.evidence_reasons.evidence_not_in_source, 1);
    assert.strictEqual(emptyValidationError.diagnostics.acceptedCount, 0);
    console.log('  [PASS] Lote vazio retorna código e contagem da etapa de validação que rejeitou a questão');
  } finally {
    GoogleGenerativeAI.prototype.getGenerativeModel = originalGetModel;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalApiKey;
    if (originalQuizModel === undefined) delete process.env.MODEL_QUIZ; else process.env.MODEL_QUIZ = originalQuizModel;
    if (originalBalancedModel === undefined) delete process.env.MODEL_BALANCED; else process.env.MODEL_BALANCED = originalBalancedModel;
  }
  console.log('🎉 Testes de reaproveitamento de questão autoral concluídos.');
})().catch(error => {
  console.error('❌ Teste de questão autoral falhou:', error);
  process.exit(1);
});
