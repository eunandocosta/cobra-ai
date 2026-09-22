// src/modules/drive/drive.routes.js
const express = require('../../shared/express');
const router = express.Router();
const { withAccess } = require('../../shared/access.middleware');
const driveController = require('./drive.controller');

// GET e POST /api/drive (compatível com query params e body)
router.get('/', withAccess((req, res) => driveController.scan(req, res)));
router.post('/scan', withAccess((req, res) => driveController.scan(req, res)));
router.get('/file/:fileId', withAccess((req, res) => driveController.download(req, res)));
router.get('/download', withAccess((req, res) => driveController.download(req, res)));

module.exports = router;
