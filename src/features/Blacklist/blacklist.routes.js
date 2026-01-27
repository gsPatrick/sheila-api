const express = require('express');
const router = express.Router();
const blacklistController = require('./blacklist.controller');
const authMiddleware = require('../../config/auth');

// router.use(authMiddleware);

router.get('/', blacklistController.index);
router.post('/', blacklistController.store);
router.delete('/:id', blacklistController.delete);

module.exports = router;
