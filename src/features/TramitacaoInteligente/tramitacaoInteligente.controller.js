const tramitacaoService = require('./tramitacaoInteligente.service');
const zapiService = require('../ZapiWebhook/zapi.service');
const { Chat, AlertLog } = require('../../models');
const settingsService = require('../Settings/settings.service');

const crypto = require('crypto');

class TramitacaoInteligenteController {
    // REST Endpoints
    async createCustomer(req, res) {
        const { chatId } = req.body;
        try {
            const chat = await tramitacaoService.createCustomer(chatId);
            return res.json(chat);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async updateCustomer(req, res) {
        const { chatId } = req.params;
        const updateData = req.body;
        try {
            const data = await tramitacaoService.updateCustomer(chatId, updateData);
            return res.json(data);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async createNote(req, res) {
        const { chatId, content, userId } = req.body;
        try {
            const data = await tramitacaoService.createNote(chatId, content, userId);
            return res.json(data);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async updateNote(req, res) {
        const { id } = req.params;
        const { content, userId } = req.body;
        try {
            const data = await tramitacaoService.updateNote(id, content, userId);
            return res.json(data);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async deleteNote(req, res) {
        const { id } = req.params;
        try {
            const data = await tramitacaoService.deleteNote(id);
            return res.json(data);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async getNotes(req, res) {
        const { chatId } = req.params;
        const { page = 1 } = req.query;
        try {
            const data = await tramitacaoService.getCustomerNotes(chatId, page);
            return res.json(data);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async search(req, res) {
        const { cpfCnpj, q } = req.query;
        try {
            const data = await tramitacaoService.searchCustomers(q || cpfCnpj);
            return res.json(data);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async getFullCustomer(req, res) {
        const { chatId } = req.params;
        try {
            const data = await tramitacaoService.getCustomerById(chatId);
            return res.json(data);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async getAlerts(req, res) {
        const { page = 1, limit = 20, isRead } = req.query;
        const offset = (page - 1) * limit;
        const where = {};
        if (isRead !== undefined) where.isRead = isRead === 'true';

        try {
            const alerts = await AlertLog.findAndCountAll({
                where,
                limit: parseInt(limit),
                offset: parseInt(offset),
                order: [['createdAt', 'DESC']],
                include: [{ model: Chat, attributes: ['id', 'contactName', 'contactNumber'] }]
            });
            return res.json(alerts);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async markAlertAsRead(req, res) {
        const { id } = req.params;
        try {
            const alert = await AlertLog.findByPk(id);
            if (!alert) return res.status(404).json({ error: 'Alerta não encontrado' });
            alert.isRead = true;
            await alert.save();
            return res.json(alert);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // Webhook Handler
    async handleWebhook(req, res) {
        // 1. Respond ACK immediately
        res.status(200).send('OK');

        const payload = req.body;
        const io = req.app.get('io');

        try {
            // A. Process publications.created (Alerta de Prazos)
            if (payload.event_type === 'publications.created') {
                const publications = payload.publications || [];
                const carolNumber = await settingsService.getByKey('carol_alert_number');

                for (const pub of publications) {
                    const { texto, numero_processo, link_tramitacao } = pub;

                    // Persistir no Banco de Dados
                    const newAlert = await AlertLog.create({
                        title: 'Nova Publicação Judicial',
                        processNumber: numero_processo,
                        body: texto,
                        link: link_tramitacao,
                        rawPayload: pub
                    });

                    // Notificação Real-Time (Painel)
                    if (io) {
                        io.emit('ti_publication_alert', newAlert);
                    }

                    // Notificação WhatsApp (Alerta Urgente)
                    if (carolNumber) {
                        const summary = `🔔 Nova publicação judicial:\n\nProcesso: ${numero_processo}\n\nResumo: ${texto.substring(0, 200)}...\n\nLink: ${link_tramitacao}`;
                        await zapiService.sendMessage(carolNumber, summary).catch(err => {
                            console.error('Error sending WA notification to Carol:', err.message);
                        });
                    }
                }
            }

            // B. Process customer.created / customer.updated (Sincronia)
            if (payload.event_type === 'customer.created' || payload.event_type === 'customer.updated') {
                const customer = payload.customer;
                if (customer && customer.uuid) {
                    const chat = await Chat.findOne({ where: { tramitacaoCustomerUuid: customer.uuid } });
                    if (chat) {
                        // Sync relevant fields
                        const updateData = {};
                        if (customer.name) updateData.contactName = customer.name;

                        await chat.update(updateData);

                        if (io) {
                            io.emit('chat_updated', chat);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error processing TI Webhook:', error.message);
        }
    }
}

module.exports = new TramitacaoInteligenteController();
