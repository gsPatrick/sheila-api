const chatService = require('./chat.service');
const zapiService = require('../ZapiWebhook/zapi.service');
const { Message } = require('../../models');

class ChatController {
    constructor(io) {
        this.io = io;
    }

    async index(req, res) {
        const { search, page, limit, isAiActive } = req.query;
        try {
            const result = await chatService.getAll({ search, isAiActive }, page, limit);
            return res.json(result);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async stats(req, res) {
        try {
            const stats = await chatService.getStats();
            return res.json(stats);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async show(req, res) {
        const { id } = req.params;
        try {
            const chat = await chatService.getChatDetails(id);
            return res.json(chat);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async update(req, res) {
        const { id } = req.params;
        try {
            const chat = await chatService.updateChat(id, req.body);
            return res.json(chat);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async messages(req, res) {
        const { id } = req.params;
        const { page, limit } = req.query;
        try {
            const messages = await chatService.getMessages(id, page, limit);
            return res.json(messages.rows); // Frontend currently expects literal array or similar
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async toggleAi(req, res) {
        const { id } = req.params;
        try {
            const chat = await chatService.toggleAi(id);
            if (req.app.get('io')) {
                req.app.get('io').emit('chat_updated', chat);
            }
            return res.json(chat);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async sendManualMessage(req, res) {
        const { chatId, messageBody, body } = req.body;
        const finalBody = messageBody || body; // Handle both versions from previous code
        const finalChatId = chatId || req.body.chatId;

        try {
            const targetChat = await chatService.sequelize.models.Chat.findByPk(finalChatId);

            if (!targetChat) {
                return res.status(404).json({ error: 'Chat não encontrado' });
            }

            await zapiService.sendMessage(targetChat.contactNumber, finalBody);

            const message = await Message.create({
                ChatId: finalChatId,
                body: finalBody,
                isFromMe: true,
                timestamp: new Date()
            });

            if (req.app.get('io')) {
                req.app.get('io').emit('new_message', message);
            }

            return res.json(message);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}

module.exports = ChatController;
