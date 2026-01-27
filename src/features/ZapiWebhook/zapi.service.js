const axios = require('axios');
const settingsService = require('../Settings/settings.service');

class ZapiService {
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
            const response = await axios.post(
                `${baseUrl}/send-text`,
                {
                    phone: toNumber,
                    message: messageBody
                },
                { headers }
            );
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
            return response.data;
        } catch (error) {
            console.error('Error sending audio via Z-API:', error.response?.data || error.message);
            throw new Error('Failed to send audio via Z-API');
        }
    }
}

module.exports = new ZapiService();
