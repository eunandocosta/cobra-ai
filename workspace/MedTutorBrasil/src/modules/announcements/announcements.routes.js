const express = require('../../shared/express');
const controller = require('./announcements.controller');
const router = express.Router();

router.get('/', controller.listPublished);
router.get('/admin/status', controller.adminStatus);
router.get('/me/unseen', controller.unseen);
router.post('/me/:id/read', controller.markRead);
router.post('/', controller.publish);

module.exports = router;
