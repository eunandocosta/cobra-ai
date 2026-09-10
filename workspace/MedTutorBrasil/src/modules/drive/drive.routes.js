// src/modules/drive/drive.routes.js
const express = require('../../shared/express');
const router = express.Router();
const driveController = require('./drive.controller');

// GET e POST /api/drive (compatível com query params e body)
router.get('/', (req, res) => driveController.scan(req, res));
router.post('/scan', (req, res) => driveController.scan(req, res));
router.get('/file/:fileId', (req, res) => driveController.download(req, res));
router.get('/download', (req, res) => driveController.download(req, res));

module.exports = router;
