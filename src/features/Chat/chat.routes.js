const express = require('express');
const router = express.Router();
const ChatController = require('./chat.controller');
const authMiddleware = require('../../config/auth');

module.exports = (io) => {
    const chatController = new ChatController(io);

    // router.use(authMiddleware); // Temporarily commented for dev if needed, but let's keep it if login works

    router.get('/stats', chatController.stats.bind(chatController));
    router.get('/', chatController.index.bind(chatController));
    router.get('/:id', chatController.show.bind(chatController));
    router.put('/:id', chatController.update.bind(chatController));
    router.get('/:id/messages', chatController.messages.bind(chatController));
    router.post('/send-message', chatController.sendManualMessage.bind(chatController));
    router.put('/:id/toggle-ai', chatController.toggleAi.bind(chatController));

    return router;
};
