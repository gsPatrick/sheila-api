require('dotenv').config({ path: '../../.env' });
const bcrypt = require('bcryptjs');
const { User, Setting, Chat, Message } = require('../models');
const sequelize = require('./database');

async function seed() {
    try {
        await sequelize.sync({ alter: true });

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
            { key: 'zApiInstance', value: process.env.ZAPI_INSTANCE_ID || '' },
            { key: 'zApiToken', value: process.env.ZAPI_TOKEN || '' },
            { key: 'zApiClientToken', value: process.env.ZAPI_CLIENT_TOKEN || '' },
            { key: 'openAiKey', value: process.env.OPENAI_API_KEY || '' },
            { key: 'mainPrompt', value: 'Você é um assistente prestativo para atendimento ao cliente.' },
            { key: 'carol_alert_number', value: '' },
            { key: 'tramitacaoApiKey', value: process.env.TRAMITACAO_API_KEY || '' },
            { key: 'tramitacaoApiBaseUrl', value: process.env.TRAMITACAO_API_BASE_URL || 'https://api.tramitacaointeligente.com.br/api/v1' },
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
            { contactNumber: '71982862912', contactName: 'Patrick Siqueira', email: 'patrick@exemplo.com', cpf: '123.456.789-00', syncStatus: 'Sincronizado', isAiActive: true },
            { contactNumber: '5511999999999', contactName: 'João Silva', email: 'joao@servidor.com', cpf: '987.654.321-11', syncStatus: 'Pendente', isAiActive: true },
            { contactNumber: '5511888888888', contactName: 'Maria Souza', email: 'maria@web.com', cpf: '111.222.333-44', syncStatus: 'Pendente', isAiActive: false }
        ];

        for (const c of mockChats) {
            const [chat, created] = await Chat.findOrCreate({
                where: { contactNumber: c.contactNumber },
                defaults: c
            });

            if (!created) {
                await chat.update(c);
            }

            // Always create messages for mock chats if they don't have any
            const msgCount = await Message.count({ where: { ChatId: chat.id } });
            if (msgCount === 0) {
                await Message.create({
                    ChatId: chat.id,
                    body: 'Olá, gostaria de saber sobre meu processo.',
                    isFromMe: false,
                    timestamp: new Date(Date.now() - 3600000)
                });
                await Message.create({
                    ChatId: chat.id,
                    body: 'Olá! Vou verificar isso para você agora mesmo.',
                    isFromMe: true,
                    timestamp: new Date(Date.now() - 1800000)
                });
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
