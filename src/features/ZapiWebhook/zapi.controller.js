const zapiService = require('./zapi.service');

class ZapiController {
    async listInstances(req, res) {
        try {
            const instances = await zapiService.listInstances();
            return res.json(instances);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async getStatus(req, res) {
        const { instanceId, token } = req.query;
        if (!instanceId || !token) {
            return res.status(400).json({ error: 'instanceId and token are required' });
        }
        try {
            const status = await zapiService.getStatus(instanceId, token);
            return res.json(status);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async getQrCode(req, res) {
        const { instanceId, token } = req.query;
        if (!instanceId || !token) {
            return res.status(400).json({ error: 'instanceId and token are required' });
        }
        try {
            const qrCode = await zapiService.getQrCode(instanceId, token);
            return res.json(qrCode);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async logout(req, res) {
        const { instanceId, token } = req.body;
        if (!instanceId || !token) {
            return res.status(400).json({ error: 'instanceId and token are required' });
        }
        try {
            const result = await zapiService.logout(instanceId, token);
            return res.json(result);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new ZapiController();
