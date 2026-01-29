const chatService = require('./chat.service');
const zapiService = require('../ZapiWebhook/zapi.service');
const { Message, Chat } = require('../../models');
const tramitacaoService = require('../TramitacaoInteligente/tramitacaoInteligente.service');
const tiAutomationService = require('../TramitacaoInteligente/tiAutomation.service');
const trelloService = require('../Trello/trello.service');

class ChatController {
    constructor(io) {
        this.io = io;
    }

    async index(req, res) {
        const { search, page, limit, isAiActive, syncStatus, triageStatus } = req.query;
        try {
            const result = await chatService.getAll({ search, isAiActive, syncStatus, triageStatus }, page, limit);
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

            // AUTO SYNC - TI & TRELLO
            try {
                // TI Sync
                if (chat.tramitacaoCustomerId) {
                    // We pass the updated chat data directly. 
                    // IMPORTANT: Ensure fields match what updateCustomer expects (which are basically chat fields)
                    // Since updateCustomer in service filters or maps, we can pass req.body or the chat object
                    // Looking at service, it sends updateData directly. The fields in formData in frontend match TI fields generally.
                    await tramitacaoService.updateCustomer(id, req.body);
                    console.log(`✅ TI Synced for Chat ${id}`);
                }

                // Trello Sync
                await trelloService.syncTrelloCard(id);
                console.log(`✅ Trello Synced for Chat ${id}`);

            } catch (syncError) {
                console.error('⚠️ Sync Error (TI/Trello):', syncError.message);
                // We do NOT fail the request if sync fails, just log it.
            }

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
            return res.json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async generateDocs(req, res) {
        const { id } = req.params;
        try {
            const chat = await Chat.findByPk(id);
            if (!chat) return res.status(404).json({ error: 'Chat não encontrado' });

            const result = await tiAutomationService.generateFullPackage(chat);
            return res.json(result);
        } catch (error) {
            console.error('❌ Error in generateDocs controller:', error.message);
            return res.status(500).json({ error: error.message });
        }
    }
}

module.exports = ChatController;
