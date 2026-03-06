const zapiWebhookService = require('./zapiWebhook.service');

class ZapiWebhookController {
    async handle(req, res) {
        console.log('🚀 [WEBHOOK] Request received at /webhook/z-api');
        console.log('📦 Body:', JSON.stringify(req.body, null, 2));
        const io = req.app.get('io');
        try {
            // Process in background to avoid Z-API timeouts
            zapiWebhookService.process(req.body, io);
            return res.status(200).send('OK');
        } catch (error) {
            console.error('❌ Webhook Controller Error:', error.message);
            return res.status(200).send('OK'); // Always return 200 as per Z-API docs
        }
    }
}

module.exports = new ZapiWebhookController();
