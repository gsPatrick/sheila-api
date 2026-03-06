const express = require('express');
const router = express.Router();
const zapiController = require('./zapi.controller');

router.get('/instances', zapiController.listInstances);
router.get('/status', zapiController.getStatus);
router.get('/qr-code', zapiController.getQrCode);
router.post('/logout', zapiController.logout);

module.exports = router;
