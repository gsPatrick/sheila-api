const axios = require('axios');
const { Chat } = require('../../models');
const settingsService = require('../Settings/settings.service');

class TramitacaoInteligenteService {
    async getHeaders() {
        const apiKey = await settingsService.getByKey('tramitacaoApiKey');
        if (!apiKey) throw new Error('Tramitacao Inteligente API key not configured');

        return {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    async getBaseUrl() {
        const baseUrl = await settingsService.getByKey('tramitacaoApiBaseUrl');
        // Using default if not set, but adhering to /api/v1 expectation
        return baseUrl || 'https://api.tramitacaointeligente.com.br/api/v1';
    }

    // A. Serviços de Escrita
    async createCustomer(chatId) {
        const chat = await Chat.findByPk(chatId);
        if (!chat) throw new Error('Chat not found');

        if (!chat.cpf) throw new Error('CPF is required to create a customer in Tramitacao Inteligente');

        const headers = await this.getHeaders();
        const baseUrl = await this.getBaseUrl();

        // Ensure proper phone format (only digits)
        const cleanPhone = chat.contactNumber ? chat.contactNumber.replace(/\D/g, '') : '';
        const cleanCpf = chat.cpf.replace(/\D/g, '');

        const customerData = {
            customer: {
                name: chat.contactName || 'Cliente WhatsApp',
                phone_mobile: cleanPhone,
                cpf_cnpj: cleanCpf
            }
        };

        try {
            const response = await axios.post(`${baseUrl}/clientes`, customerData, { headers });

            const createdCustomer = response.data.customer || response.data;
            const { id, uuid } = createdCustomer;

            await chat.update({
                tramitacaoCustomerId: id,
                tramitacaoCustomerUuid: uuid
            });

            return chat;
        } catch (error) {
            console.error('Error creating customer in TI:', error.response?.data || error.message);
            throw new Error('Failed to create customer in Tramitacao Inteligente');
        }
    }

    async updateCustomer(chatId, updateData) {
        const chat = await Chat.findByPk(chatId);
        if (!chat || !chat.tramitacaoCustomerId) {
            throw new Error('Chat not found or not linked to TI');
        }

        const headers = await this.getHeaders();
        const baseUrl = await this.getBaseUrl();

        try {
            const response = await axios.patch(`${baseUrl}/clientes/${chat.tramitacaoCustomerId}`, updateData, { headers });
            return response.data;
        } catch (error) {
            console.error('Error updating customer in TI:', error.response?.data || error.message);
            throw new Error('Failed to update customer in Tramitacao Inteligente');
        }
    }

    async createNotaTriagem(chatId, triagemContent) {
        const chat = await Chat.findByPk(chatId);
        if (!chat || !chat.tramitacaoCustomerId) {
            throw new Error('Chat not found or not linked to TI');
        }

        const headers = await this.getHeaders();
        const baseUrl = await this.getBaseUrl();

        const noteData = {
            customer_id: chat.tramitacaoCustomerId,
            content: triagemContent
        };

        try {
            const response = await axios.post(`${baseUrl}/notas`, noteData, { headers });
            return response.data;
        } catch (error) {
            console.error('Error creating note in TI:', error.response?.data || error.message);
            throw new Error('Failed to create note in Tramitacao Inteligente');
        }
    }

    // B. Serviços de Leitura
    async searchCustomers(cpfCnpj) {
        const headers = await this.getHeaders();
        const baseUrl = await this.getBaseUrl();

        try {
            const response = await axios.get(`${baseUrl}/clientes`, {
                headers,
                params: { cpf_cnpj: cpfCnpj }
            });
            return response.data;
        } catch (error) {
            console.error('Error searching customers in TI:', error.response?.data || error.message);
            throw new Error('Failed to search customers in Tramitacao Inteligente');
        }
    }

    async getCustomerById(chatId) {
        const chat = await Chat.findByPk(chatId);
        if (!chat || !chat.tramitacaoCustomerId) {
            throw new Error('Chat not found or not linked to TI');
        }

        const headers = await this.getHeaders();
        const baseUrl = await this.getBaseUrl();

        try {
            const response = await axios.get(`${baseUrl}/clientes/${chat.tramitacaoCustomerId}`, { headers });
            return response.data;
        } catch (error) {
            console.error('Error fetching customer from TI:', error.response?.data || error.message);
            throw new Error('Failed to fetch customer from Tramitacao Inteligente');
        }
    }
}

module.exports = new TramitacaoInteligenteService();
