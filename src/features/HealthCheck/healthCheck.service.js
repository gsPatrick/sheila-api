const axios = require('axios');
const settingsService = require('../Settings/settings.service');

class HealthCheckService {
    async getHeaders() {
        const apiKey = await settingsService.getByKey('tramitacaoApiKey');
        if (!apiKey) return null;

        return {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    async getBaseUrl() {
        const baseUrl = await settingsService.getByKey('tramitacaoApiBaseUrl');
        return baseUrl || 'https://api.tramitacaointeligente.com.br/api/v1';
    }

    async testOpenAIConnection() {
        return { status: 'SKIPPED', message: 'Test disabled by configuration' };
    }

    async testZapiStatus() {
        return { status: 'SKIPPED', message: 'Test disabled by configuration' };
    }

    async testTramitacaoInteligenteAPI() {
        try {
            const headers = await this.getHeaders();
            const baseUrl = await this.getBaseUrl();

            if (!headers) {
                return { status: 'FAIL', message: 'API Key not configured in Settings' };
            }

            // Using GET /users or similar resource that is lightweight. 
            // Since I don't see a users endpoint in service, I'll use /clientes with limit 1 as per instructions.
            // "Faz uma chamada de leitura inofensiva para o TI (ex: GET /usuarios?per_page=1)."
            // Using /clientes which is known to exist.
            const response = await axios.get(`${baseUrl}/clientes`, {
                headers,
                params: { per_page: 1 }
            });

            if (response.status === 200) {
                return { status: 'OK', message: 'Connection successful' };
            } else {
                return { status: 'FAIL', message: `Unexpected status code: ${response.status}` };
            }
        } catch (error) {
            return {
                status: 'FAIL',
                message: error.response?.data?.message || error.message || 'Connection failed'
            };
        }
    }

    generateCPF() {
        const rand = (n) => Math.floor(Math.random() * n);
        const mod = (dividend, divisor) => Math.round(dividend - (Math.floor(dividend / divisor) * divisor));
        const arr = Array.from({ length: 9 }, () => rand(10));

        const d1 = arr.reduce((acc, val, idx) => acc + (val * (10 - idx)), 0);
        arr.push(d1 % 11 < 2 ? 0 : 11 - (d1 % 11));

        const d2 = arr.reduce((acc, val, idx) => acc + (val * (11 - idx)), 0);
        arr.push(d2 % 11 < 2 ? 0 : 11 - (d2 % 11));

        return arr.join('');
    }

    async testCriticalFlows() {
        let createdId = null;
        try {
            const headers = await this.getHeaders();
            const baseUrl = await this.getBaseUrl();

            if (!headers) {
                return { status: 'FAIL', message: 'API Key not configured' };
            }

            // 1. Create Test Customer
            const testPayload = {
                customer: {
                    name: 'TESTE-API-CHECK-' + Date.now(),
                    phone_mobile: '11999999999',
                    cpf_cnpj: this.generateCPF()
                }
            };

            const createResponse = await axios.post(`${baseUrl}/clientes`, testPayload, { headers });

            if (createResponse.status !== 200 && createResponse.status !== 201) {
                throw new Error(`Failed to create test customer. Status: ${createResponse.status}`);
            }

            // Response usually contains { customer: { ... } } or just data. Check docs.yaml said { customer: ... }
            const createdCustomer = createResponse.data.customer || createResponse.data;
            const { id, uuid } = createdCustomer;
            createdId = id;

            if (!id || !uuid) {
                console.error('Create Response Data:', createResponse.data); // Log for debugging
                throw new Error('Response missing ID or UUID');
            }

            // 2. Cleanup (Delete)
            await axios.delete(`${baseUrl}/clientes/${createdId}`, { headers });

            return {
                status: 'OK',
                message: 'Critical flow (Create -> Delete) passed successfully'
            };

        } catch (error) {
            // Attempt cleanup if failed ensuring ID exists
            if (createdId) {
                try {
                    const headers = await this.getHeaders();
                    const baseUrl = await this.getBaseUrl();
                    await axios.delete(`${baseUrl}/clientes/${createdId}`, { headers });
                } catch (cleanupError) {
                    console.error('Failed to cleanup test customer:', cleanupError.message);
                }
            }

            return {
                status: 'FAIL',
                message: `Critical Flow Failed: ${error.response?.data?.message || error.message}`
            };
        }
    }
}

module.exports = new HealthCheckService();
