const { Chat, Message } = require('../../models');
const sequelize = require('../../config/database');
const { Op } = require('sequelize');

class ChatService {
    async getAll(query = {}, page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        const where = {};

        if (query.search) {
            where[Op.or] = [
                { contactNumber: { [Op.iLike]: `%${query.search}%` } },
                { contactName: { [Op.iLike]: `%${query.search}%` } },
                { email: { [Op.iLike]: `%${query.search}%` } },
                { cpf: { [Op.iLike]: `%${query.search}%` } }
            ];
        }

        if (query.isAiActive !== undefined) {
            where.isAiActive = query.isAiActive === 'true' || query.isAiActive === true;
        }

        const { count, rows } = await Chat.findAndCountAll({
            where,
            limit,
            offset,
            include: [{
                model: Message,
                limit: 1,
                order: [['timestamp', 'DESC']]
            }],
            order: [
                [sequelize.literal('(SELECT MAX("timestamp") FROM "Messages" WHERE "Messages"."ChatId" = "Chat"."id")'), 'DESC NULLS LAST']
            ]
        });

        return {
            total: count,
            pages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            data: rows
        };
    }

    async getChatDetails(chatId) {
        const chat = await Chat.findByPk(chatId, {
            include: [{
                model: Message,
                limit: 10,
                order: [['timestamp', 'DESC']]
            }]
        });
        if (!chat) throw new Error('Chat não encontrado');
        return chat;
    }

    async getMessages(chatId, page = 1, limit = 50) {
        const offset = (page - 1) * limit;
        return await Message.findAndCountAll({
            where: { ChatId: chatId },
            limit,
            offset,
            order: [['timestamp', 'DESC']]
        });
    }

    async findOrCreateChat(contactNumber, contactName = null) {
        const [chat, created] = await Chat.findOrCreate({
            where: { contactNumber },
            defaults: { contactName, isAiActive: true }
        });
        return chat;
    }

    async toggleAi(chatId) {
        const chat = await Chat.findByPk(chatId);
        if (!chat) throw new Error('Chat não encontrado');
        chat.isAiActive = !chat.isAiActive;
        await chat.save();
        return chat;
    }

    async updateAiStatus(chatId, status) {
        const chat = await Chat.findByPk(chatId);
        if (!chat) throw new Error('Chat não encontrado');
        chat.isAiActive = status;
        await chat.save();
        return chat;
    }

    async updateChat(chatId, data) {
        const chat = await Chat.findByPk(chatId);
        if (!chat) throw new Error('Chat não encontrado');
        return await chat.update(data);
    }

    async getStats() {
        const total = await Chat.count();
        const active = await Chat.count({ where: { isAiActive: true } });
        const inactive = await Chat.count({ where: { isAiActive: false } });

        return {
            total,
            active,
            inactive
        };
    }
}

module.exports = new ChatService();
