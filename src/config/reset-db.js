require('dotenv').config({ path: '../../.env' });
const bcrypt = require('bcryptjs');
const { User, Setting, Chat, Message, Blacklist, AlertLog, Contact } = require('../models');
const sequelize = require('./database');

async function resetDatabase() {
    try {
        console.log('🔄 Starting database reset...');

        // Force sync - this will drop and recreate all tables
        await sequelize.sync({ force: true });
        console.log('✅ All tables dropped and recreated.');

        // Create Admin User
        const adminEmail = 'admin@admin.com';
        const adminPassword = 'admin';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        await User.create({
            email: adminEmail,
            password: hashedPassword
        });
        console.log('✅ Admin user created:', adminEmail);

        // Default Settings (empty, ready for configuration)
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
            await Setting.create({ key: s.key, value: s.value });
        }
        console.log('✅ Default settings initialized (empty values).');

        console.log('\n🎉 Database reset complete!');
        console.log('   - Admin: admin@admin.com / admin');
        console.log('   - All chats, messages, and contacts cleared.');
        console.log('   - Settings reset to default (configure in panel).\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Reset error:', error);
        process.exit(1);
    }
}

resetDatabase();
