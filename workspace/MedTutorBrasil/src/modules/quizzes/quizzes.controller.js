// Controlador HTTP do Domínio Quizzes & Flashcards (MedTutor Brasil)
const quizzesService = require('./quizzes.service');
const { getFirebaseAuth, getFirebaseFirestore } = require('../../shared/firebase-admin');

function curatedScopeId(value, prefix = '') {
  const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'sem_nome';
  return `${prefix}${normalized}`;
}

async function getCuratedUserContext(req, requireCurator = false) {
  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (!token) throw Object.assign(new Error('Entre na sua conta para acessar a curadoria.'), { statusCode: 401, code: 'CURATION-AUTH-REQUIRED' });
  const decoded = await getFirebaseAuth().verifyIdToken(token);
  const profileSnapshot = await getFirebaseFirestore().collection('users').doc(decoded.uid).get();
  if (!profileSnapshot.exists) throw Object.assign(new Error('Perfil de estudante não encontrado.'), { statusCode: 403, code: 'CURATION-PROFILE-MISSING' });
  const profile = profileSnapshot.data() || {};
  const role = profile.role === 'admin' ? 'admin' : (profile.role === 'partner' ? 'partner' : 'user');
  if (requireCurator && !['partner', 'admin'].includes(role)) {
    throw Object.assign(new Error('A seleção de questões é restrita a Partner e Administradores.'), { statusCode: 403, code: 'CURATION-ROLE-REQUIRED' });
  }
  const institution = String(profile.faculdade || '').trim();
  if (!institution) throw Object.assign(new Error('Informe a faculdade/universidade no perfil antes de usar a curadoria.'), { statusCode: 400, code: 'CURATION-INSTITUTION-MISSING' });
  return { uid: decoded.uid, role, institution, db: getFirebaseFirestore() };
}

function curatedQuestionsRef(context, discipline) {
  const institutionId = curatedScopeId(context.institution);
  const disciplineId = curatedScopeId(discipline, 'disciplina_');
  return context.db.collection('instituicoes').doc(institutionId)
    .collection('disciplinas').doc(disciplineId).collection('questoes_curadas');
}

function serializeCuratedQuestion(question, context, discipline, questionId) {
  const prompt = String(question.question || question.pergunta || question.flashcard?.front || question.front || '').trim();
  const answer = String(question.answer || question.referenceAnswer || question.reference_answer || question.correctAnswer || question.resposta_correta || question.gabarito || question.flashcard?.back || question.back || '').trim();
  const options = Array.isArray(question.quizOptions) ? question.quizOptions
    : (Array.isArray(question.options) ? question.options
      : (Array.isArray(question.alternatives) ? question.alternatives
        : (Array.isArray(question.alternativas) ? question.alternativas : [])));
  const requestedType = ['flashcards', 'quizzes'].includes(question.__curationType) ? question.__curationType : '';
  if (prompt.length < 5 || prompt.length > 5000 || !answer || answer.length > 5000) {
    throw Object.assign(new Error('A questão precisa ter enunciado e resposta válidos.'), { statusCode: 400, code: 'CURATION-QUESTION-INVALID' });
  }
  const contentTypes = {
    flashcards: requestedType ? requestedType === 'flashcards' : question.flashcardOnly === true,
    quizzes: requestedType ? requestedType === 'quizzes' : question.flashcardOnly !== true && options.length >= 2
  };
  if (!requestedType && !contentTypes.flashcards && !contentTypes.quizzes && answer) contentTypes.flashcards = true;
  if (!contentTypes.flashcards && !contentTypes.quizzes) {
    throw Object.assign(new Error('A questão não possui formato de estudo compatível.'), { statusCode: 400, code: 'CURATION-QUESTION-TYPE-INVALID' });
  }
  if (contentTypes.quizzes && options.length < 2) {
    throw Object.assign(new Error('Este conteúdo não tem alternativas suficientes para entrar na curadoria de Quiz.'), { statusCode: 400, code: 'CURATION-QUIZ-OPTIONS-MISSING' });
  }
  const cleanId = String(questionId || question.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  if (!cleanId) throw Object.assign(new Error('Identificador de questão inválido.'), { statusCode: 400, code: 'CURATION-QUESTION-ID-INVALID' });
  return {
    id: cleanId,
    question: prompt,
    answer,
    quizOptions: options.slice(0, 8).map(option => String(option).slice(0, 1000)),
    correctAnswerIndex: Number.isInteger(question.correctAnswerIndex) ? question.correctAnswerIndex
      : (Number.isInteger(question.correctIndex) ? question.correctIndex
        : (Number.isInteger(question.correctOptionIndex) ? question.correctOptionIndex : 0)),
    flashcardOnly: question.flashcardOnly === true,
    contentTypes,
    curationType: requestedType || (contentTypes.quizzes ? 'quizzes' : 'flashcards'),
    subject: discipline,
    topic: String(question.topic || '').slice(0, 200),
    slideName: String(question.slideName || question.materialName || '').slice(0, 250),
    difficultyLevel: String(question.difficultyLevel || question.nivel_dificuldade || '').slice(0, 40),
    learningAxis: String(question.learningAxis || question.eixo_aprendizagem || '').slice(0, 40),
    explanation: String(question.explanation || question.justification || question.explicacao || '').slice(0, 5000),
    institutionId: curatedScopeId(context.institution),
    institutionDisplay: context.institution,
    disciplineId: curatedScopeId(discipline, 'disciplina_'),
    createdByUid: context.uid,
    curatedAt: new Date().toISOString()
  };
}

class QuizzesController {
  async listCuratedQuestions(req, res) {
    try {
      const context = await getCuratedUserContext(req);
      const discipline = String(req.query.disciplina || '').trim();
      if (discipline.length < 2 || discipline.length > 200) {
        return res.status(400).json({ error: 'Selecione uma disciplina válida.', code: 'CURATION-DISCIPLINE-INVALID' });
      }
      const snapshot = await curatedQuestionsRef(context, discipline).get();
      const questions = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, subject: discipline, curated: true }));
      return res.json({ institution: context.institution, discipline, questions });
    } catch (error) {
      const status = error.statusCode || (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error' ? 401 : 500);
      if (status >= 500) console.error('[Curadoria] Falha ao consultar questões:', error);
      return res.status(status).json({ error: error.message || 'Não foi possível consultar a curadoria.', code: error.code || 'CURATION-LOAD-FAILED' });
    }
  }

  async saveCuratedQuestion(req, res) {
    try {
      const context = await getCuratedUserContext(req, true);
      const discipline = String(req.body?.discipline || '').trim();
      if (discipline.length < 2 || discipline.length > 200 || !req.body?.question || typeof req.body.question !== 'object') {
        return res.status(400).json({ error: 'Disciplina ou questão inválida.', code: 'CURATION-PAYLOAD-INVALID' });
      }
      const data = serializeCuratedQuestion(req.body.question, context, discipline, req.body.question.id);
      await curatedQuestionsRef(context, discipline).doc(data.id).set(data, { merge: true });
      return res.json({ success: true, question: { ...data, curated: true } });
    } catch (error) {
      const status = error.statusCode || (String(error.code || '').startsWith('auth/') ? 401 : 500);
      if (status >= 500) console.error('[Curadoria] Falha ao salvar questão:', error);
      return res.status(status).json({ error: error.message || 'Não foi possível salvar a questão na curadoria.', code: error.code || 'CURATION-SAVE-FAILED' });
    }
  }

  async deleteCuratedQuestion(req, res) {
    try {
      const context = await getCuratedUserContext(req, true);
      const discipline = String(req.query.disciplina || '').trim();
      const questionId = String(req.params.questionId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
      if (discipline.length < 2 || discipline.length > 200 || !questionId) {
        return res.status(400).json({ error: 'Disciplina ou identificador de questão inválido.', code: 'CURATION-PAYLOAD-INVALID' });
      }
      await curatedQuestionsRef(context, discipline).doc(questionId).delete();
      return res.json({ success: true, id: questionId });
    } catch (error) {
      const status = error.statusCode || (String(error.code || '').startsWith('auth/') ? 401 : 500);
      if (status >= 500) console.error('[Curadoria] Falha ao remover questão:', error);
      return res.status(status).json({ error: error.message || 'Não foi possível remover a questão da curadoria.', code: error.code || 'CURATION-DELETE-FAILED' });
    }
  }

  async recommendStudyGeneration(req, res) {
    try {
      const recommendation = await quizzesService.recommendStudyGeneration(req.body || {});
      return res.json(recommendation);
    } catch (err) {
      console.error('❌ [Quiz Recommendation] Falha na sugestão pedagógica:', err);
      const status = err.statusCode === 400 || err.statusCode === 413 ? err.statusCode : 502;
      return res.status(status).json({ error: 'Não foi possível obter a sugestão pedagógica da IA.', details: err.message });
    }
  }

  async generate(req, res) {
    try {
      const payload = req.body || {};
      const candidates = [
        payload.materialText,
        payload.material_md,
        payload.materialMd,
        payload.conteudo_md,
        payload.conteudoMd,
        payload.markdownText,
        payload.text,
        payload.texto,
        payload.conteudo,
        payload.content,
        payload.corpo,
        payload.body
      ].filter(c => typeof c === 'string' && c.trim().length > 0);
      candidates.sort((a, b) => b.length - a.length);
      const materialText = candidates[0] || '';
      if (typeof materialText !== 'string' || materialText.trim().length < 20) {
        return res.status(400).json({ error: 'Texto de estudo insuficiente para gerar questões.', details: 'Envie materialText, material_md, conteudo_md ou text com ao menos 20 caracteres.' });
      }
      payload.materialText = materialText;
      const data = await quizzesService.generateQuestions(payload);
      const items = Array.isArray(data) ? data : (Array.isArray(data?.questions) ? data.questions : []);
      const responseData = items.map((item, index) => index === 0 && data?.generationDiagnostics
        ? { ...item, __quizGenerationDiagnostics: data.generationDiagnostics }
        : item);
      return res.json(responseData);
    } catch (err) {
      console.error("❌ Erro capturado no QuizzesController:", err);
      const status = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 500
        ? err.statusCode : 500;
      return res.status(status).json({
        error: status === 422 ? 'As questões geradas não passaram pela validação.' : 'Erro ao gerar questões',
        code: err.code || 'QUIZ-GENERATION-FAILED',
        details: err.message,
        retryable: err.retryable !== false,
        diagnostics: err.diagnostics || undefined
      });
    }
  }

  submit(req, res) {
    try {
      const result = quizzesService.submitAnswer(req.body || {});
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao submeter resposta', details: err.message });
    }
  }

  getFlashcards(req, res) {
    // Os cards pertencem ao usuário autenticado e são lidos diretamente do
    // Firestore pelo cliente. O endpoint antigo devolvia silenciosamente uma
    // lista vazia, criando a impressão de que o estudante não tinha cards.
    return res.status(410).json({
      error: 'Endpoint de flashcards descontinuado',
      details: 'Use a sincronização autenticada do banco de questões no cliente.'
    });
  }

  async evaluateFlashcard(req, res) {
    try {
      const { question, referenceAnswer, keyConcepts, studentAnswer } = req.body || {};
      const result = await quizzesService.evaluateFlashcardAnswer({
        question,
        referenceAnswer,
        keyConcepts,
        studentAnswer
      });
      return res.json({
        ...result,
        evaluation: result
      });
    } catch (err) {
      console.error("❌ Erro ao avaliar resposta do flashcard:", err);
      return res.status(500).json({ error: 'Erro ao avaliar resposta com IA', details: err.message });
    }
  }

  async analyzeMaterial(req, res) {
    try {
      const data = await quizzesService.analyzeMaterial(req.body || {});
      return res.json(data);
    } catch (err) {
      console.error("❌ Erro no QuizzesController ao analisar material:", err);
      return res.status(500).json({ error: 'Erro ao analisar material de estudo', details: err.message });
    }
  }

  async generateDerived(req, res) {
    try {
      const result = await quizzesService.generateDerivedQuestion(req.body || {});
      return res.json(result);
    } catch (err) {
      console.error("❌ Erro no QuizzesController ao gerar pergunta derivada:", err);
      const status = err.statusCode || (err.status >= 400 && err.status < 600 ? err.status : 500);
      return res.status(status).json({
        error: err.statusCode === 400 ? err.message : 'Erro ao gerar pergunta derivada',
        details: err.message
      });
    }
  }
}

module.exports = new QuizzesController();
