// Roteador Isolado do Domínio Relatórios & Tratados (MedTutor Brasil)
const express = require('../../shared/express');
const router = express.Router();
const relatoriosController = require('./relatorios.controller');

router.post('/gerar', (req, res) => relatoriosController.generate(req, res));
router.get('/:id', (req, res) => relatoriosController.getById(req, res));
router.post('/exportar/pdf', (req, res) => relatoriosController.exportPdf(req, res));
router.get('/materiais/:materialId', (req, res) => relatoriosController.getByMaterial(req, res));

module.exports = router;
