const axios = require('axios');
const settingsService = require('../Settings/settings.service');

class ZapiService {
    constructor() {
        this.sentByBot = new Set();
    }

    async sendMessage(toNumber, messageBody) {
        const instanceId = await settingsService.getByKey('zApiInstance');
        const token = await settingsService.getByKey('zApiToken');
        const clientToken = await settingsService.getByKey('zApiClientToken');

        if (!instanceId || !token || !clientToken) {
            throw new Error('Z-API credentials not configured in settings');
        }

        const baseUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}`;
        const headers = {
            'Content-Type': 'application/json',
            'Client-Token': clientToken
        };

        try {
            console.log(`📤 Sending Text to ${toNumber}: "${messageBody.substring(0, 30)}..."`);
            const response = await axios.post(
                `${baseUrl}/send-text`,
                {
                    phone: toNumber,
                    message: messageBody
                },
                { headers }
            );
            console.log('✅ Z-API Response:', response.data?.messageId || 'OK');

            if (response.data?.messageId) {
                this.sentByBot.add(response.data.messageId);
                // Clear after 1 minute to avoid memory leaks
                setTimeout(() => this.sentByBot.delete(response.data.messageId), 60000);
            }

            return response.data;
        } catch (error) {
            console.error('Error sending message via Z-API:', error.response?.data || error.message);
            throw new Error('Failed to send message via Z-API');
        }
    }

    async sendAudio(toNumber, audioUrl) {
        const instanceId = await settingsService.getByKey('zApiInstance');
        const token = await settingsService.getByKey('zApiToken');
        const clientToken = await settingsService.getByKey('zApiClientToken');

        if (!instanceId || !token || !clientToken) {
            throw new Error('Z-API credentials not configured in settings');
        }

        const baseUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}`;
        const headers = {
            'Content-Type': 'application/json',
            'Client-Token': clientToken
        };

        try {
            const response = await axios.post(
                `${baseUrl}/send-audio`,
                {
                    phone: toNumber,
                    audio: audioUrl
                },
                { headers }
            );
            if (response.data?.messageId) {
                this.sentByBot.add(response.data.messageId);
                setTimeout(() => this.sentByBot.delete(response.data.messageId), 60000);
            }
            return response.data;
        } catch (error) {
            console.error('Error sending audio via Z-API:', error.response?.data || error.message);
            throw new Error('Failed to send audio via Z-API');
        }
    }

    async sendButtonList(toNumber, messageBody, buttons) {
        const instanceId = await settingsService.getByKey('zApiInstance');
        const token = await settingsService.getByKey('zApiToken');
        const clientToken = await settingsService.getByKey('zApiClientToken');

        if (!instanceId || !token || !clientToken) throw new Error('Z-API credentials missing');

        const baseUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}`;
        const headers = { 'Content-Type': 'application/json', 'Client-Token': clientToken };

        try {
            // buttons structure: [{ id: '1', label: 'Yes' }, ...]
            const response = await axios.post(
                `${baseUrl}/send-button-list`,
                {
                    phone: toNumber,
                    message: messageBody,
                    buttonList: {
                        buttons: buttons.map(b => ({ id: b.id, label: b.label }))
                    }
                },
                { headers }
            );
            return response.data;
        } catch (error) {
            console.error('Error sending buttons via Z-API:', error.response?.data || error.message);
            // Fallback to text if buttons fail (e.g. not supported on some clients)
            return this.sendMessage(toNumber, `${messageBody}\n\nOpções:\n${buttons.map(b => `- ${b.label}`).join('\n')}`);
        }
    }

    async sendOptionList(toNumber, messageBody, title, distinctOptions) {
        // Implement similar logic if needed for "List Messages" (Menu), 
        // but Button List is usually enough for Yes/No.
        return this.sendButtonList(toNumber, messageBody, distinctOptions);
    }

    async listInstances() {
        let clientToken = await settingsService.getByKey('zApiClientToken');
        const defaultInstanceId = await settingsService.getByKey('zApiInstance');
        const defaultInstanceToken = await settingsService.getByKey('zApiToken');

        if (clientToken) clientToken = clientToken.trim();

        console.log('🔍 Listing Instances - Token length:', clientToken?.length);

        let data = null;
        if (clientToken) {
            try {
                console.log('🔍 Calling Z-API /instances...');
                const response = await axios.get('https://api.z-api.io/instances', {
                    headers: { 'client-token': clientToken }
                });
                data = response.data;
            } catch (error) {
                const zapiError = error.response?.data;
                console.error('❌ Z-API Error Response:', JSON.stringify(zapiError));

                try {
                    console.log('🔄 Retrying with integrator endpoint...');
                    const retryRes = await axios.get('https://api.z-api.io/instances/integrator/all', {
                        headers: { 'Client-Token': clientToken }
                    });
                    data = retryRes.data;
                } catch (retryError) {
                    console.error('❌ Integrator Endpoint also failed');
                }
            }
        }

        let instancesList = [];
        if (Array.isArray(data)) instancesList = data;
        else if (data && Array.isArray(data.content)) instancesList = data.content;

        // Fallback to default instance if list is empty
        if (instancesList.length === 0 && defaultInstanceId && defaultInstanceToken) {
            console.log('💡 Using default instance as fallback');
            instancesList.push({
                instanceId: defaultInstanceId,
                token: defaultInstanceToken,
                name: 'Instância Local (Configurada)',
                connected: false // Status will be checked by individual status call
            });
        }

        return instancesList;
    }

    async getStatus(instanceId, token) {
        const clientToken = await settingsService.getByKey('zApiClientToken');
        const baseUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}`;

        try {
            const response = await axios.get(`${baseUrl}/status`, {
                headers: { 'Client-Token': clientToken }
            });
            return response.data;
        } catch (error) {
            console.error('Error getting Z-API status:', error.response?.data || error.message);
            throw new Error('Failed to get Z-API status');
        }
    }

    async getQrCode(instanceId, token) {
        const clientToken = await settingsService.getByKey('zApiClientToken');
        const baseUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}`;

        try {
            const response = await axios.get(`${baseUrl}/qr-code/image`, {
                headers: { 'Client-Token': clientToken }
            });
            return response.data; // Expecting { value: "base64..." }
        } catch (error) {
            console.error('Error getting Z-API QR code:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to get Z-API QR code');
        }
    }

    async logout(instanceId, token) {
        const clientToken = await settingsService.getByKey('zApiClientToken');
        const baseUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}`;

        try {
            const response = await axios.get(`${baseUrl}/logout`, {
                headers: { 'Client-Token': clientToken }
            });
            return response.data;
        } catch (error) {
            console.error('Error logging out Z-API instance:', error.response?.data || error.message);
            throw new Error('Failed to logout Z-API instance');
        }
    }

    checkAndClearBotMessage(messageId) {
        if (!messageId) return false;
        if (this.sentByBot.has(messageId)) {
            // Keep it for 5 more seconds just in case of duplicate Status webhooks, but usually Received comes first
            setTimeout(() => this.sentByBot.delete(messageId), 5000);
            return true;
        }
        return false;
    }
}

module.exports = new ZapiService();
