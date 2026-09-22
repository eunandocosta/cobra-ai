// Roteador Isolado do Domínio Relatórios & Tratados (MedTutor Brasil)
const express = require('../../shared/express');
const router = express.Router();
const { withAccess } = require('../../shared/access.middleware');
const relatoriosController = require('./relatorios.controller');

router.post('/gerar', withAccess((req, res) => relatoriosController.generate(req, res)));
router.get('/:id', withAccess((req, res) => relatoriosController.getById(req, res)));
router.post('/exportar/pdf', withAccess((req, res) => relatoriosController.exportPdf(req, res)));
router.get('/materiais/:materialId', withAccess((req, res) => relatoriosController.getByMaterial(req, res)));

module.exports = router;
