const assert = require('assert');
const Module = require('module');

const records = new Map();
const profileRecords = new Map([
  ['ordinary-user', { uid: 'ordinary-user', role: 'user', faculdade: 'Universo' }],
  ['partner-user', { uid: 'partner-user', role: 'partner', faculdade: 'Universo' }],
  ['admin-user', { uid: 'admin-user', role: 'admin', faculdade: 'Universo' }],
  ['other-user', { uid: 'other-user', role: 'user', faculdade: 'Outra Universidade' }]
]);

function recordKey(parts) { return parts.join('/'); }

class FakeDocumentReference {
  constructor(parts) { this.parts = parts; this.id = parts[parts.length - 1]; }
  collection(name) { return new FakeCollectionReference([...this.parts, name]); }
  async get() {
    const value = this.parts[0] === 'users' && this.parts.length === 2
      ? profileRecords.get(this.id)
      : records.get(recordKey(this.parts));
    return { exists: value !== undefined, data: () => value, get: key => value?.[key] };
  }
  async set(value, options = {}) {
    const key = recordKey(this.parts);
    records.set(key, options.merge ? { ...(records.get(key) || {}), ...value } : value);
  }
  async delete() { records.delete(recordKey(this.parts)); }
}

class FakeCollectionReference {
  constructor(parts) { this.parts = parts; }
  doc(id) { return new FakeDocumentReference([...this.parts, id]); }
  async get() {
    const prefix = `${recordKey(this.parts)}/`;
    const docs = [...records.entries()]
      .filter(([key]) => key.startsWith(prefix) && key.slice(prefix.length).indexOf('/') < 0)
      .map(([key, value]) => ({ id: key.slice(prefix.length), data: () => value }));
    return { docs };
  }
}

const fakeFirestore = { collection: name => new FakeCollectionReference([name]) };
const fakeFirebaseAdmin = {
  getFirebaseAuth: () => ({ verifyIdToken: async token => ({ uid: token }) }),
  getFirebaseFirestore: () => fakeFirestore
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../../shared/firebase-admin' && parent?.filename.endsWith('/src/modules/quizzes/quizzes.controller.js')) {
    return fakeFirebaseAdmin;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const controller = require('../src/modules/quizzes/quizzes.controller');
Module._load = originalLoad;

function responseRecorder() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function request(method, uid, extra = {}) {
  const req = {
    headers: { authorization: uid ? `Bearer ${uid}` : '' },
    query: extra.query || {},
    params: extra.params || {},
    body: extra.body || {}
  };
  const res = responseRecorder();
  await controller[method](req, res);
  return res;
}

async function run() {
  const discipline = 'M011 Integração de Sistemas Humanos III';
  const question = {
    id: 'quiz-123',
    question: 'Qual estrutura conduz o impulso nervoso?',
    answer: 'O axônio.',
    quizOptions: ['Axônio', 'Dendrito', 'Soma', 'Mielina'],
    correctAnswerIndex: 0,
    __curationType: 'quizzes'
  };

  const denied = await request('saveCuratedQuestion', 'ordinary-user', { body: { discipline, question } });
  assert.strictEqual(denied.statusCode, 403, 'usuário comum não pode publicar questão na curadoria');
  assert.strictEqual(records.size, 0, 'uma tentativa negada não deve gravar documento');

  const saved = await request('saveCuratedQuestion', 'partner-user', { body: { discipline, question } });
  assert.strictEqual(saved.statusCode, 200, 'Partner pode publicar questão curada');
  assert.strictEqual(saved.body.question.institutionDisplay, 'Universo');
  assert.deepStrictEqual(saved.body.question.contentTypes, { flashcards: false, quizzes: true });

  const savedFlashcard = await request('saveCuratedQuestion', 'partner-user', { body: {
    discipline,
    question: {
      id: 'flashcard-123',
      question: 'Qual é a principal função do axônio?',
      answer: 'Conduzir o impulso nervoso para longe do corpo celular.',
      __curationType: 'flashcards'
    }
  } });
  assert.strictEqual(savedFlashcard.statusCode, 200, 'Partner pode publicar flashcard curado');
  assert.deepStrictEqual(savedFlashcard.body.question.contentTypes, { flashcards: true, quizzes: false });

  const shared = await request('listCuratedQuestions', 'ordinary-user', { query: { disciplina: discipline } });
  assert.strictEqual(shared.statusCode, 200, 'usuários autenticados podem ler a curadoria da própria instituição');
  assert.strictEqual(shared.body.questions.length, 2, 'a curadoria fica disponível para colegas da mesma instituição');

  const isolated = await request('listCuratedQuestions', 'other-user', { query: { disciplina: discipline } });
  assert.strictEqual(isolated.body.questions.length, 0, 'a questão não vaza para outra faculdade/universidade');

  const removed = await request('deleteCuratedQuestion', 'admin-user', {
    query: { disciplina: discipline }, params: { questionId: 'quiz-123' }
  });
  assert.strictEqual(removed.statusCode, 200, 'administrador pode remover questão curada');

  const invalid = await request('saveCuratedQuestion', 'partner-user', {
    body: { discipline, question: { id: 'bad', question: 'Q?', answer: '' } }
  });
  assert.strictEqual(invalid.statusCode, 400, 'questões sem gabarito não são aceitas na curadoria');
  console.log('✅ Testes de permissão e escopo da curadoria passaram.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
