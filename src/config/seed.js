require('dotenv').config({ path: '../../.env' });
const bcrypt = require('bcryptjs');
const { User, Setting, Chat, Message } = require('../models');
const sequelize = require('./database');

async function seed() {
    try {
        // WARNING: force: true DROPS ALL TABLES. Use only for full reset.
        await sequelize.sync({ force: true });

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
        // REMOVED to ensure clean state for testing
        console.log('Mock chats skipped for clean reset.');

        process.exit(0);
    } catch (error) {
        console.error('Seeding error:', error);
        process.exit(1);
    }
}

seed();
