// Roteador Isolado do Domínio Quizzes & Flashcards (MedTutor Brasil)
const express = require('../../shared/express');
const router = express.Router();
const quizzesController = require('./quizzes.controller');

router.post('/gerar', (req, res) => quizzesController.generate(req, res));
router.post('/gerar-derivada', (req, res) => quizzesController.generateDerived(req, res));
router.post('/analisar-material', (req, res) => quizzesController.analyzeMaterial(req, res));
router.post('/responder', (req, res) => quizzesController.submit(req, res));
router.get('/flashcards/:subjectId', (req, res) => quizzesController.getFlashcards(req, res));
router.post('/flashcards/revisar', (req, res) => quizzesController.reviewFlashcard(req, res));
router.post('/flashcards/corrigir', (req, res) => quizzesController.evaluateFlashcard(req, res));

module.exports = router;
