// Roteador Isolado do Domínio Quizzes & Flashcards (MedTutor Brasil)
const express = require('../../shared/express');
const router = express.Router();
const { withAccess } = require('../../shared/access.middleware');
const quizzesController = require('./quizzes.controller');

router.post('/gerar', withAccess((req, res) => quizzesController.generate(req, res)));
router.post('/gerar-derivada', withAccess((req, res) => quizzesController.generateDerived(req, res)));
router.post('/analisar-material', withAccess((req, res) => quizzesController.analyzeMaterial(req, res)));
router.post('/responder', withAccess((req, res) => quizzesController.submit(req, res)));
router.get('/flashcards/:subjectId', withAccess((req, res) => quizzesController.getFlashcards(req, res)));
router.post('/flashcards/revisar', withAccess((req, res) => quizzesController.reviewFlashcard(req, res)));
router.post('/flashcards/corrigir', withAccess((req, res) => quizzesController.evaluateFlashcard(req, res)));

module.exports = router;
