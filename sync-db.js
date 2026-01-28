require('dotenv').config();
const bcrypt = require('bcryptjs');
const sequelize = require('./src/config/database');
const { User, Setting, Chat, Message } = require('./src/models');

async function resetAndSeed() {
    try {
        console.log('🚀 Iniciando reset do banco de dados (FORCE SYNC)...');

        // Sincroniza e apaga tudo
        await sequelize.sync({ force: true });
        console.log('✅ Banco de dados resetado com sucesso.');

        // 1. Criar Usuário Admin do .env (ou padrão)
        const adminEmail = 'admin@admin.com';
        const adminPassword = 'admin';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        await User.create({
            email: adminEmail,
            password: hashedPassword
        });
        console.log(`👤 Usuário admin criado: ${adminEmail}`);

        // 2. Preencher Configurações do .env
        const settings = [
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

        for (const s of settings) {
            await Setting.create(s);
        }
        console.log('⚙️ Configurações iniciais importadas do .env');

        // 3. Criar Chats Mock (Opcional)
        const mockChats = [
            { contactNumber: '71982862912', contactName: 'Patrick Siqueira', isAiActive: true },
        ];

        for (const c of mockChats) {
            const chat = await Chat.create(c);
            await Message.create({
                ChatId: chat.id,
                body: 'Olá! Sistema resetado e pronto para uso.',
                isFromMe: true,
                timestamp: new Date()
            });
        }
        console.log('💬 Chats de teste criados');

        console.log('\n✨ Tudo pronto! O banco de dados foi limpo e reconfigurado.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro no reset/seed:', error);
        process.exit(1);
    }
}

resetAndSeed();
