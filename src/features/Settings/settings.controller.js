const settingsService = require('./settings.service');

class SettingsController {
    async get(req, res) {
        try {
            const settings = await settingsService.getAll();
            return res.json(settings);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const settings = await settingsService.update(req.body);
            return res.json(settings);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new SettingsController();
