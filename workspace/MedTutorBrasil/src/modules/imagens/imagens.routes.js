// Roteador de Imagens Médicas & Curadoria Clínica
const express = require('../../shared/express');
const router = express.Router();
const { withAccess } = require('../../shared/access.middleware');
const imagensController = require('./imagens.controller');

router.post('/buscar', withAccess((req, res) => imagensController.search(req, res)));
router.post('/curar', withAccess((req, res) => imagensController.curate(req, res)));
router.post('/analisar-associacao-visual', withAccess((req, res) => imagensController.analyzeVisualAssociation(req, res)));
router.post('/analisar-mapeamento-material', withAccess((req, res) => imagensController.analyzeMaterialMapping(req, res)));

module.exports = router;
