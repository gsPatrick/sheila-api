const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { User, Setting, Chat, Message } = require('../models');
const sequelize = require('./database');

async function seed() {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Database connected.');

        await sequelize.sync({ alter: true });
        console.log('Database synced.');

        // Create Admin User
        const adminEmail = 'admin@admin.com';
        const adminPassword = 'admin';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        const [user, created] = await User.findOrCreate({
            where: { email: adminEmail },
            defaults: {
                password: hashedPassword
            }
        });

        if (created) {
            console.log('Admin user created:', adminEmail);
        } else {
            console.log('Admin user already exists');
        }

        // Default Settings
        const defaultSettings = [
            { key: 'zApiInstance', value: '' },
            { key: 'zApiToken', value: '' },
            { key: 'zApiClientToken', value: '' },
            { key: 'openAiKey', value: '' },
            { key: 'mainPrompt', value: 'Você é um assistente prestativo para atendimento ao cliente.' },
            { key: 'carol_alert_number', value: '' },
            { key: 'tramitacaoApiKey', value: '' },
            { key: 'tramitacaoApiBaseUrl', value: 'https://api.tramitacaointeligente.com.br/api/v1' },
            { key: 'tramitacaoWebhookUrl', value: '' }
        ];

        for (const s of defaultSettings) {
            await Setting.findOrCreate({
                where: { key: s.key },
                defaults: { value: s.value }
            });
        }

        console.log('Default settings initialized');

        // Mock Chats and Messages
        const mockChats = [
            { contactNumber: '5571999991111', contactName: 'Dr. Roberto Mendes', email: 'roberto@mendesadv.com.br', cpf: '123.456.789-00', syncStatus: 'Sincronizado', isAiActive: true, tags: ['Parceiro', 'Prioridade'] },
            { contactNumber: '5511988882222', contactName: 'Fernanda Lins', email: 'fernanda.lins@gmail.com', cpf: '321.654.987-00', syncStatus: 'Sincronizado', isAiActive: true, tags: ['Cliente', 'Civil'] },
            { contactNumber: '5521977773333', contactName: 'Carlos Eduardo', email: 'carlos.edu@outlook.com', cpf: '000.111.222-33', syncStatus: 'Pendente', isAiActive: false, tags: ['Cliente', 'Trabalhista'] },
            { contactNumber: '5531966664444', contactName: 'Juliana Paes', email: 'juju@globo.com', cpf: '444.555.666-77', syncStatus: 'Sincronizado', isAiActive: true, tags: ['Celebridade', 'Urgente'] },
            { contactNumber: '5541955555555', contactName: 'Imobiliária Teto', email: 'contato@teto.com.br', cpf: '999.888.777-66', syncStatus: 'Sincronizado', isAiActive: true, tags: ['Empresa', 'Contratos'] },
            { contactNumber: '5551944446666', contactName: 'Novo Cliente Lead', email: '', cpf: '', syncStatus: 'Pendente', isAiActive: true, tags: ['Lead', 'WhatsApp'] },
        ];

        for (const c of mockChats) {
            // Remove tags for now as the model might not have it
            const { tags, ...chatData } = c;

            const [chat, created] = await Chat.findOrCreate({
                where: { contactNumber: c.contactNumber },
                defaults: chatData
            });

            if (created) {
                console.log(`Created chat for ${c.contactName}`);
            } else {
                console.log(`Chat already exists for ${c.contactName}`);
            }

            if (!created) {
                // await chat.update(c);
            }

            // Always create messages for mock chats if they don't have any
            const msgCount = await Message.count({ where: { ChatId: chat.id } });
            if (msgCount === 0) {
                const messages = [
                    { body: 'Olá, bom dia! Como posso ajudar com seu processo hoje?', isFromMe: true },
                    { body: 'Gostaria de saber se houve movimentação na minha ação trabalhista.', isFromMe: false },
                    { body: 'Um momento, vou consultar o sistema Tramitação Inteligente para você...', isFromMe: true },
                    { body: 'Certo, fico no aguardo.', isFromMe: false },
                    { body: 'Encontrei uma atualização: "Conclusos para Despacho" data de ontem. Isso significa que o juiz está analisando seu caso.', isFromMe: true },
                    { body: 'Ótima notícia! Muito obrigado, Carol.', isFromMe: false },
                    { body: 'Por nada! Qualquer outra dúvida estou à disposição.', isFromMe: true }
                ];

                let timeOffset = 3600000;
                for (const msg of messages) {
                    await Message.create({
                        ChatId: chat.id,
                        body: msg.body,
                        isFromMe: msg.isFromMe,
                        timestamp: new Date(Date.now() - timeOffset)
                    });
                    timeOffset -= 300000; // 5 min interval
                }
            }
        }

        console.log('Mock chats and messages initialized');
        process.exit(0);
    } catch (error) {
        console.error('Seeding error:', error);
        process.exit(1);
    }
}

seed();
