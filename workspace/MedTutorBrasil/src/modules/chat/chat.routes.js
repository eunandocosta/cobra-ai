// Roteador Isolado do Domínio Chat & MedCopilot (MedTutor Brasil)
const express = require('../../shared/express');
const router = express.Router();
const chatController = require('./chat.controller');

router.post('/mensagem', (req, res) => chatController.message(req, res));
router.get('/sessoes/:sessionId', (req, res) => chatController.getSession(req, res));
router.post('/evidencias', (req, res) => chatController.getEvidence(req, res));

module.exports = router;
