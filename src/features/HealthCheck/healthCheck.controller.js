const healthCheckService = require('./healthCheck.service');

class HealthCheckController {
    async check(req, res) {
        try {
            // Run tests in parallel or sequence. Sequence is safer to analyze logs.
            const openai = await healthCheckService.testOpenAIConnection();
            const zapi = await healthCheckService.testZapiStatus();
            const tramitacao_api = await healthCheckService.testTramitacaoInteligenteAPI();
            const critical_flows = await healthCheckService.testCriticalFlows();

            const results = {
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development',
                tests: {
                    openai,
                    zapi,
                    tramitacao_api,
                    critical_flows
                }
            };

            // Determine HTTP Status
            const allPassed =
                openai.status !== 'FAIL' &&
                zapi.status !== 'FAIL' &&
                tramitacao_api.status !== 'FAIL' &&
                critical_flows.status !== 'FAIL';

            return res.status(allPassed ? 200 : 503).json(results);

        } catch (error) {
            console.error('Health Check Error:', error);
            return res.status(500).json({ error: 'Internal Server Error during Health Check' });
        }
    }
}

module.exports = new HealthCheckController();
