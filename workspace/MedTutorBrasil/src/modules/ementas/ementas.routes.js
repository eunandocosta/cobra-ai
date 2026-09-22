const express = require('express');
const router = express.Router();
const { withAccess } = require('../../shared/access.middleware');
const ementasController = require('./ementas.controller');

// Endpoint principal que recebe qualquer texto/PDF de ementa e processa no Gemini
router.post('/processar', withAccess((req, res) => ementasController.processSyllabus(req, res)));
router.post('/classificar-material', withAccess((req, res) => ementasController.classifyMaterial(req, res)));

router.get('/', withAccess((req, res) => ementasController.getCurriculum(req, res)));
router.get('/:subjectId', withAccess((req, res) => ementasController.getSubject(req, res)));
router.post('/materiais/ordenar', withAccess((req, res) => ementasController.orderMaterials(req, res)));
router.post('/alocar', withAccess((req, res) => ementasController.allocate(req, res)));

module.exports = router;
