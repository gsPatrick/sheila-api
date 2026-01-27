const express = require('express');
const router = express.Router();
const settingsController = require('./settings.controller');
const authMiddleware = require('../../config/auth');

// router.use(authMiddleware);

router.get('/', settingsController.get);
router.put('/', settingsController.update);

module.exports = router;
