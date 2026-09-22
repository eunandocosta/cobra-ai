// Roteador Isolado do Domínio Chat & MedCopilot (MedTutor Brasil)
const express = require('../../shared/express');
const router = express.Router();
const { withAccess } = require('../../shared/access.middleware');
const chatController = require('./chat.controller');

router.post('/mensagem', withAccess((req, res) => chatController.message(req, res)));
router.get('/sessoes/:sessionId', withAccess((req, res) => chatController.getSession(req, res)));
router.post('/evidencias', withAccess((req, res) => chatController.getEvidence(req, res)));

module.exports = router;
