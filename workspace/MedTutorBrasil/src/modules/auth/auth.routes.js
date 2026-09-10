// Roteador Isolado do Domínio Auth (MedTutor Brasil)
const express = require('../../shared/express');
const router = express.Router();
const authController = require('./auth.controller');

router.post('/session', (req, res) => authController.session(req, res));
router.get('/profile', (req, res) => authController.profile(req, res));
router.put('/preferences', (req, res) => authController.preferences(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));

module.exports = router;
