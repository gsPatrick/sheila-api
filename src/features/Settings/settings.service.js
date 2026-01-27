const { Setting } = require('../../models');

class SettingsService {
    async getAll() {
        const settings = await Setting.findAll();
        return settings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});
    }

    async update(settingsObj) {
        for (const [key, value] of Object.entries(settingsObj)) {
            await Setting.upsert({ key, value });
        }
        return this.getAll();
    }

    async getByKey(key) {
        const setting = await Setting.findByPk(key);
        return setting ? setting.value : null;
    }
}

module.exports = new SettingsService();
