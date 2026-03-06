const express = require('express');
const router = express.Router();
const zapiWebhookController = require('./zapiWebhook.controller');

router.post('/z-api', zapiWebhookController.handle);

module.exports = router;
