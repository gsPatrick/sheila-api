require('dotenv').config();
const { Setting } = require('./src/models');
const sequelize = require('./src/config/database');

async function syncSettings() {
    try {
        console.log('🔄 Syncing .env settings to Database...');

        const envMapping = {
            'openAiKey': 'OPENAI_API_KEY',
            'zApiInstance': 'ZAPI_INSTANCE_ID',
            'zApiToken': 'ZAPI_TOKEN',
            'zApiClientToken': 'ZAPI_CLIENT_TOKEN',
            'tramitacaoApiKey': 'TRAMITACAO_API_KEY',
            'tramitacaoApiBaseUrl': 'TRAMITACAO_API_BASE_URL'
        };

        for (const [dbKey, envKey] of Object.entries(envMapping)) {
            const value = process.env[envKey];
            if (value) {
                console.log(`📡 Updating ${dbKey}...`);
                await Setting.upsert({ key: dbKey, value: value });
            } else {
                console.warn(`⚠️ Warning: ${envKey} not found in .env`);
            }
        }

        console.log('✅ Settings synced successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Sync error:', error);
        process.exit(1);
    }
}

syncSettings();
