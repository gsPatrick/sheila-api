const blacklistService = require('./blacklist.service');

class BlacklistController {
    async index(req, res) {
        const { search, page, limit } = req.query;
        try {
            const result = await blacklistService.getAll({ search }, page, limit);
            return res.json(result);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async store(req, res) {
        const { phoneNumber, contactName } = req.body;
        try {
            const blacklisted = await blacklistService.add({ phoneNumber, contactName });
            return res.json(blacklisted);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async delete(req, res) {
        const { id } = req.params;
        try {
            const result = await blacklistService.remove(id);
            return res.json(result);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new BlacklistController();
