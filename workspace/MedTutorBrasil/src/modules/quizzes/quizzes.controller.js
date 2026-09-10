// Controlador HTTP do Domínio Quizzes & Flashcards (MedTutor Brasil)
const quizzesService = require('./quizzes.service');

class QuizzesController {
  async generate(req, res) {
    try {
      const data = await quizzesService.generateQuestions(req.body || {});
      return res.json(data);
    } catch (err) {
      console.error("❌ Erro capturado no QuizzesController:", err);
      return res.status(500).json({ error: 'Erro ao gerar questões', details: err.message });
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
    try {
      const subject = req.params.subjectId;
      const cards = quizzesService.getFlashcards(subject);
      return res.json({ count: cards.length, flashcards: cards });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao carregar flashcards', details: err.message });
    }
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
}

module.exports = new QuizzesController();