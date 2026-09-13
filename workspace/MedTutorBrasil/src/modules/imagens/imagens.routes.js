// Roteador de Imagens Médicas & Curadoria Clínica
const express = require('../../shared/express');
const router = express.Router();
const imagensController = require('./imagens.controller');

router.post('/buscar', (req, res) => imagensController.search(req, res));
router.post('/curar', (req, res) => imagensController.curate(req, res));
router.post('/analisar-associacao-visual', (req, res) => imagensController.analyzeVisualAssociation(req, res));

module.exports = router;
