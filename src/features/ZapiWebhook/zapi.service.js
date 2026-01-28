const axios = require('axios');
const settingsService = require('../Settings/settings.service');

class ZapiService {
    constructor() {
        this.sentByBot = new Set();
    }

    async sendMessage(toNumber, messageBody) {
        const instanceId = await settingsService.getByKey('zApiInstance');
        const token = await settingsService.getByKey('zApiToken');
        let clientToken = await settingsService.getByKey('zApiClientToken');

        if (clientToken) clientToken = clientToken.trim();

        if (!instanceId || !token) {
            throw new Error('Z-API instanceId or token not configured');
        }

        const baseUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}`;
        const headers = { 'Content-Type': 'application/json' };
        if (clientToken) headers['Client-Token'] = clientToken;

        try {
            console.log(`📤 Sending Text to ${toNumber} (Instance: ${instanceId})`);
            const response = await axios.post(
                `${baseUrl}/send-text`,
                { phone: toNumber, message: messageBody },
                { headers }
            );
            console.log('✅ Message sent successfully');

            if (response.data?.messageId) {
                this.sentByBot.add(response.data.messageId);
                setTimeout(() => this.sentByBot.delete(response.data.messageId), 60000);
            }

            return response.data;
        } catch (error) {
            const errData = error.response?.data;
            console.error('❌ Error sending message:', JSON.stringify(errData || error.message));

            // If failed due to client-token, try WITHOUT it
            if (clientToken && (errData?.error?.includes('token') || error.response?.status === 401)) {
                try {
                    console.log('🔄 Retrying sendMessage WITHOUT Client-Token header...');
                    const retryRes = await axios.post(
                        `${baseUrl}/send-text`,
                        { phone: toNumber, message: messageBody },
                        { headers: { 'Content-Type': 'application/json' } }
                    );
                    return retryRes.data;
                } catch (retryError) {
                    console.error('❌ Retry sendMessage also failed');
                }
            }
            throw new Error('Failed to send message via Z-API');
        }
    }

    async sendAudio(toNumber, audioUrl) {
        const instanceId = await settingsService.getByKey('zApiInstance');
        const token = await settingsService.getByKey('zApiToken');
        let clientToken = await settingsService.getByKey('zApiClientToken');

        if (clientToken) clientToken = clientToken.trim();

        if (!instanceId || !token) {
            throw new Error('Z-API credentials missing');
        }

        const baseUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}`;
        const headers = { 'Content-Type': 'application/json' };
        if (clientToken) headers['Client-Token'] = clientToken;

        try {
            console.log(`📤 Sending Audio to ${toNumber}`);
            const response = await axios.post(
                `${baseUrl}/send-audio`,
                { phone: toNumber, audio: audioUrl },
                { headers }
            );
            if (response.data?.messageId) {
                this.sentByBot.add(response.data.messageId);
                setTimeout(() => this.sentByBot.delete(response.data.messageId), 60000);
            }
            return response.data;
        } catch (error) {
            const errData = error.response?.data;
            console.error('❌ Error sending audio:', JSON.stringify(errData || error.message));

            if (clientToken && (errData?.error?.includes('token') || error.response?.status === 401)) {
                try {
                    console.log('🔄 Retrying sendAudio WITHOUT Client-Token...');
                    const retryRes = await axios.post(
                        `${baseUrl}/send-audio`,
                        { phone: toNumber, audio: audioUrl },
                        { headers: { 'Content-Type': 'application/json' } }
                    );
                    return retryRes.data;
                } catch (e) { console.error('❌ Audio retry failed'); }
            }
            throw new Error('Failed to send audio via Z-API');
        }
    }

    async sendButtonList(toNumber, messageBody, buttons) {
        const instanceId = await settingsService.getByKey('zApiInstance');
        const token = await settingsService.getByKey('zApiToken');
        let clientToken = await settingsService.getByKey('zApiClientToken');

        if (clientToken) clientToken = clientToken.trim();
        if (!instanceId || !token) throw new Error('Z-API credentials missing');

        const baseUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}`;
        const headers = { 'Content-Type': 'application/json' };
        if (clientToken) headers['Client-Token'] = clientToken;

        try {
            console.log(`📤 Sending Buttons to ${toNumber}`);
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
            const errData = error.response?.data;
            console.error('❌ Error sending buttons:', JSON.stringify(errData || error.message));

            if (clientToken && (errData?.error?.includes('token') || error.response?.status === 401)) {
                try {
                    console.log('🔄 Retrying sendButtons WITHOUT Client-Token...');
                    const retryRes = await axios.post(
                        `${baseUrl}/send-button-list`,
                        {
                            phone: toNumber,
                            message: messageBody,
                            buttonList: {
                                buttons: buttons.map(b => ({ id: b.id, label: b.label }))
                            }
                        },
                        { headers: { 'Content-Type': 'application/json' } }
                    );
                    return retryRes.data;
                } catch (e) { console.error('❌ Buttons retry failed'); }
            }

            // Fallback to text
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

        console.log('🔍 Listing Z-API Instances - Token length:', clientToken?.length);

        let data = null;
        if (clientToken) {
            // Try 1: Standard with Client-Token
            try {
                const res = await axios.get('https://api.z-api.io/instances', {
                    headers: { 'Client-Token': clientToken }
                });
                data = res.data;
                console.log('✅ Z-API /instances Success');
            } catch (e1) {
                console.log('⚠️ Z-API /instances Failed, trying integrator...');
                // Try 2: Integrator endpoint
                try {
                    const res = await axios.get('https://api.z-api.io/instances/integrator/all', {
                        headers: { 'Client-Token': clientToken }
                    });
                    data = res.data;
                    console.log('✅ Z-API /integrator Success');
                } catch (e2) {
                    console.log('⚠️ Z-API /integrator Failed, trying with Authorization header...');
                    // Try 3: Standard with Authorization header
                    try {
                        const res = await axios.get('https://api.z-api.io/instances', {
                            headers: { 'Authorization': `Bearer ${clientToken}` }
                        });
                        data = res.data;
                        console.log('✅ Z-API /instances (Bearer) Success');
                    } catch (e3) {
                        console.error('❌ All listing attempts failed');
                    }
                }
            }
        }

        let instancesList = [];
        if (Array.isArray(data)) instancesList = data;
        else if (data && Array.isArray(data.content)) instancesList = data.content;

        if (instancesList.length === 0 && defaultInstanceId && defaultInstanceToken) {
            console.log('💡 Fallback: Using default instance');
            instancesList.push({
                instanceId: defaultInstanceId,
                token: defaultInstanceToken,
                name: 'Instância Local (Configurada)',
                connected: false
            });
        }

        return instancesList;
    }

    async getStatus(instanceId, token) {
        let clientToken = await settingsService.getByKey('zApiClientToken');
        if (clientToken) clientToken = clientToken.trim();

        const baseUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}`;

        try {
            const response = await axios.get(`${baseUrl}/status`, {
                headers: { 'Client-Token': clientToken }
            });
            return response.data;
        } catch (error) {
            const errData = error.response?.data;
            console.error(`❌ Z-API Status Error (${instanceId}):`, JSON.stringify(errData || error.message));

            // If it fails due to Client-Token, try WITHOUT it (many instances work without it)
            if (errData?.error?.includes('client-token') || error.response?.status === 401) {
                try {
                    console.log('🔄 Retrying status WITHOUT Client-Token header...');
                    const retryRes = await axios.get(`${baseUrl}/status`);
                    return retryRes.data;
                } catch (retryError) {
                    console.error('❌ Status retry also failed');
                }
            }

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
