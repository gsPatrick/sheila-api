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
}

module.exports = new ZapiService();
