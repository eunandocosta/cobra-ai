const express = require('express');
const router = express.Router();
const ementasController = require('./ementas.controller');

// Endpoint principal que recebe qualquer texto/PDF de ementa e processa no Gemini
router.post('/processar', (req, res) => ementasController.processSyllabus(req, res));
router.post('/classificar-material', (req, res) => ementasController.classifyMaterial(req, res));

router.get('/', (req, res) => ementasController.getCurriculum(req, res));
router.get('/:subjectId', (req, res) => ementasController.getSubject(req, res));
router.post('/materiais/ordenar', (req, res) => ementasController.orderMaterials(req, res));
router.post('/alocar', (req, res) => ementasController.allocate(req, res));

module.exports = router;