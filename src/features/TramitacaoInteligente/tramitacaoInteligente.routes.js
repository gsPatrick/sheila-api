const express = require('express');
const router = express.Router();
const tramitacaoController = require('./tramitacaoInteligente.controller');
const authMiddleware = require('../../config/auth');

// Public Webhook (No auth)
router.post('/webhook', tramitacaoController.handleWebhook.bind(tramitacaoController));

// Internal routes (Authorized)
// router.use(authMiddleware);

router.post('/customer', tramitacaoController.createCustomer.bind(tramitacaoController));
router.patch('/customer/:chatId', tramitacaoController.updateCustomer.bind(tramitacaoController));
router.post('/note', tramitacaoController.createNote.bind(tramitacaoController));
router.get('/customer/search', tramitacaoController.search.bind(tramitacaoController));
router.get('/customer/:chatId/full', tramitacaoController.getFullCustomer.bind(tramitacaoController));
router.post('/sync-all', tramitacaoController.syncAll.bind(tramitacaoController));

// New Notes Routes
router.get('/notes/:chatId', tramitacaoController.getNotes.bind(tramitacaoController));
router.patch('/note/:id', tramitacaoController.updateNote.bind(tramitacaoController));
router.delete('/note/:id', tramitacaoController.deleteNote.bind(tramitacaoController));

// Alerts Management
router.get('/alerts', tramitacaoController.getAlerts.bind(tramitacaoController));
router.put('/alerts/:id/read', tramitacaoController.markAlertAsRead.bind(tramitacaoController));

module.exports = router;
