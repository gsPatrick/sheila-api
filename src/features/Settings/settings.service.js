const { Setting } = require('../../models');

class SettingsService {
    // Map internal settings keys to Environment Variables
    envMapping = {
        'openAiKey': 'OPENAI_API_KEY',
        'zApiInstance': 'ZAPI_INSTANCE_ID',
        'zApiToken': 'ZAPI_TOKEN',
        'zApiClientToken': 'ZAPI_CLIENT_TOKEN',
        'tramitacaoApiKey': 'TRAMITACAO_API_KEY',
        'tramitacaoApiBaseUrl': 'TRAMITACAO_API_BASE_URL',
        'tramitacaoWebhookUrl': 'TRAMITACAO_WEBHOOK_URL',
        'tramitacaoWebhookSecret': 'TRAMITACAO_WEBHOOK_SECRET',
        'carol_alert_number': 'CAROL_ALERT_NUMBER',
        'trelloKey': 'TRELLO_KEY',
        'trelloToken': 'TRELLO_TOKEN',
        'trelloBoardId': 'TRELLO_BOARD_ID',
        'trelloListId': 'TRELLO_LIST_ID'
    };

    async getAll() {
        const settings = await Setting.findAll();
        const settingsMap = settings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});

        // Merge with Env Vars (DB takes precedence if exists and not empty)
        for (const [key, envVar] of Object.entries(this.envMapping)) {
            if (!settingsMap[key] && process.env[envVar]) {
                settingsMap[key] = process.env[envVar];
            }
        }

        return settingsMap;
    }

    async update(settingsObj) {
        for (const [key, value] of Object.entries(settingsObj)) {
            await Setting.upsert({ key, value });
        }
        return this.getAll();
    }

    async getByKey(key) {
        const setting = await Setting.findByPk(key);
        if (setting && setting.value) return setting.value;

        // Fallback to Env
        const envVar = this.envMapping[key];
        if (envVar && process.env[envVar]) {
            return process.env[envVar];
        }

        return null;
    }
}

module.exports = new SettingsService();
