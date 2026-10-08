// Controlador HTTP do Domínio Quizzes & Flashcards (MedTutor Brasil)
const quizzesService = require('./quizzes.service');

class QuizzesController {
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
