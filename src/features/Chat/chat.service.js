const { Chat, Message } = require('../../models');
const sequelize = require('../../config/database');
const { Op } = require('sequelize');
const tramitacaoService = require('../TramitacaoInteligente/tramitacaoInteligente.service');

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

        if (query.syncStatus) {
            if (query.syncStatus === 'Sincronizado') {
                where.syncStatus = 'Sincronizado';
            } else {
                where.syncStatus = { [Op.or]: [null, 'Pendente', ''] };
            }
        }

        if (query.triageStatus) {
            where.triageStatus = query.triageStatus;
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
        let chat = await Chat.findByPk(chatId, {
            include: [{
                model: Message,
                limit: 10,
                order: [['timestamp', 'DESC']]
            }]
        });
        if (!chat) throw new Error('Chat não encontrado');

        // 🔄 Sync PULL from TI Portal if linked to ensure data is fresh on view
        if (chat.tramitacaoCustomerId) {
            try {
                const tiData = await tramitacaoService.getCustomerById(chatId);
                const customer = tiData.customer || tiData;

                await chat.update({
                    phone_1: customer.phone_1,
                    phone_2: customer.phone_2,
                    country: customer.country,
                    state: customer.state,
                    city: customer.city,
                    neighborhood: customer.neighborhood,
                    zipcode: customer.zipcode,
                    street: customer.street,
                    street_number: customer.street_number,
                    sexo: customer.sexo,
                    birthdate: customer.birthdate,
                    deathdate: customer.deathdate,
                    marital_status: customer.marital_status,
                    profession: customer.profession,
                    meu_inss_pass: customer.meu_inss_pass,
                    rg_numero: customer.rg_numero,
                    rg_data_emissao: customer.rg_data_emissao,
                    father_name: customer.father_name,
                    mother_name: customer.mother_name
                });
                console.log(`✅ Synced fresh data from TI for customer ${chat.tramitacaoCustomerId}`);
            } catch (e) {
                console.error(`⚠️ TI Pull Error for chat ${chatId}:`, e.message);
            }
        }

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

    async findOrCreateChat(contactNumber, contactName = null, defaultAiStatus = true) {
        const [chat, created] = await Chat.findOrCreate({
            where: { contactNumber },
            defaults: { contactName, isAiActive: defaultAiStatus }
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

        const updatedChat = await chat.update(data);

        // 🔄 Sync to TI Portal if linked
        if (updatedChat.tramitacaoCustomerId) {
            console.log(`🚀 Property update detected. Syncing to TI customer ${updatedChat.tramitacaoCustomerId}...`);
            // Format data for TI (customer: { ... })
            const tiPayload = {
                customer: {
                    name: updatedChat.contactName,
                    cpf_cnpj: updatedChat.cpf?.replace(/\D/g, ''),
                    email: updatedChat.email,
                    sexo: updatedChat.sexo,
                    birthdate: updatedChat.birthdate,
                    profession: updatedChat.profession,
                    marital_status: updatedChat.marital_status,
                    rg_numero: updatedChat.rg_numero,
                    meu_inss_pass: updatedChat.meu_inss_pass,
                    mother_name: updatedChat.mother_name,
                    father_name: updatedChat.father_name,
                    state: updatedChat.state,
                    city: updatedChat.city,
                    neighborhood: updatedChat.neighborhood,
                    zipcode: updatedChat.zipcode,
                    street: updatedChat.street,
                    street_number: updatedChat.street_number
                }
            };
            tramitacaoService.updateCustomer(chatId, tiPayload).catch(e =>
                console.error('❌ Failed to sync update to TI:', e.message)
            );
        }

        return updatedChat;
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
