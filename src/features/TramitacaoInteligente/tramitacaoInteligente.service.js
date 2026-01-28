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
        return baseUrl || 'https://tramitacaointeligente.com.br/api/v1';
    }

    // A. Serviços de Escrita
    async createCustomer(chatId, manualData = {}) {
        const chat = await Chat.findByPk(chatId);
        if (!chat) throw new Error('Chat not found');

        const cpf = manualData.cpf_cnpj || chat.cpf;
        if (!cpf) throw new Error('CPF is required to create a customer in Tramitacao Inteligente');

        const headers = await this.getHeaders();
        const baseUrl = await this.getBaseUrl();

        const cleanPhone = (manualData.phone_mobile || chat.contactNumber || '').replace(/\D/g, '');
        const cleanCpf = cpf.replace(/\D/g, '');

        const customerData = {
            customer: {
                name: manualData.name || chat.contactName || 'Cliente WhatsApp',
                phone_mobile: cleanPhone,
                cpf_cnpj: cleanCpf,
                email: manualData.email || chat.email || '',
                sexo: manualData.sexo || '',
                birthdate: manualData.birthdate || null,
                meu_inss_pass: manualData.meu_inss_pass || '',
                mother_name: manualData.mother_name || '',
                father_name: manualData.father_name || '',
                profession: manualData.profession || '',
                marital_status: manualData.marital_status || '',
                rg_numero: manualData.rg_numero || '',
                state: manualData.state || '',
                city: manualData.city || '',
                neighborhood: manualData.neighborhood || '',
                zipcode: manualData.zipcode || '',
                street: manualData.street || '',
                street_number: manualData.street_number || ''
            }
        };

        try {
            console.log(`📡 Creating customer in TI: ${baseUrl}/clientes`);
            const response = await axios.post(`${baseUrl}/clientes`, customerData, { headers });

            const createdCustomer = response.data.customer || response.data;
            const { id, uuid } = createdCustomer;

            await chat.update({
                tramitacaoCustomerId: id,
                tramitacaoCustomerUuid: uuid,
                cpf: cleanCpf,
                contactName: manualData.name || chat.contactName
            });

            return chat;
        } catch (error) {
            console.error('❌ Error creating customer in TI:', {
                url: `${baseUrl}/clientes`,
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw new Error(error.response?.data?.errors?.join(', ') || 'Failed to create customer in Tramitacao Inteligente');
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

    async createNote(chatId, content, userId = null) {
        const chat = await Chat.findByPk(chatId);
        if (!chat || !chat.tramitacaoCustomerId) {
            throw new Error('Chat not found or not linked to TI');
        }

        const headers = await this.getHeaders();
        const baseUrl = await this.getBaseUrl();

        // If no userId provided, attempt to use the first user from the organization
        let targetUserId = userId;
        if (!targetUserId) {
            try {
                const usersRes = await axios.get(`${baseUrl}/usuarios`, { headers });
                targetUserId = usersRes.data.users?.[0]?.id;
            } catch (e) {
                console.error('Error fetching TI users:', e.message);
            }
        }

        const noteData = {
            note: {
                customer_id: chat.tramitacaoCustomerId,
                content: content,
                user_id: targetUserId
            }
        };

        try {
            const response = await axios.post(`${baseUrl}/notas`, noteData, { headers });
            return response.data;
        } catch (error) {
            console.error('Error creating note in TI:', error.response?.data || error.message);
            throw new Error('Failed to create note in Tramitacao Inteligente');
        }
    }

    async updateNote(noteId, content, userId = null) {
        const headers = await this.getHeaders();
        const baseUrl = await this.getBaseUrl();

        const noteData = {
            note: {
                content: content
            }
        };
        if (userId) noteData.note.user_id = userId;

        try {
            const response = await axios.patch(`${baseUrl}/notas/${noteId}`, noteData, { headers });
            return response.data;
        } catch (error) {
            console.error('Error updating note in TI:', error.response?.data || error.message);
            throw new Error('Failed to update note in Tramitacao Inteligente');
        }
    }

    async deleteNote(noteId) {
        const headers = await this.getHeaders();
        const baseUrl = await this.getBaseUrl();

        try {
            await axios.delete(`${baseUrl}/notas/${noteId}`, { headers });
            return { success: true };
        } catch (error) {
            console.error('Error deleting note from TI:', error.response?.data || error.message);
            throw new Error('Failed to delete note from Tramitacao Inteligente');
        }
    }

    async getCustomerNotes(chatId, page = 1) {
        const chat = await Chat.findByPk(chatId);
        if (!chat || !chat.tramitacaoCustomerId) {
            return { notes: [], pagination: {} };
        }

        const headers = await this.getHeaders();
        const baseUrl = await this.getBaseUrl();

        try {
            const response = await axios.get(`${baseUrl}/notas`, {
                headers,
                params: {
                    customer_id: chat.tramitacaoCustomerId,
                    page
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching notes from TI:', error.response?.data || error.message);
            throw new Error('Failed to fetch notes from Tramitacao Inteligente');
        }
    }

    // B. Serviços de Leitura
    async searchCustomers(query) {
        const headers = await this.getHeaders();
        const baseUrl = await this.getBaseUrl();
        const url = `${baseUrl}/clientes`;

        // If query is numeric and has CPF/CNPJ length, try specific param, else use general 'q'
        const isNumeric = /^\d+$/.test(query?.replace(/\D/g, ''));
        const params = isNumeric ? { cpf_cnpj: query.replace(/\D/g, '') } : { q: query };

        try {
            console.log(`🔍 Searching customers in TI: ${url} (Params: ${JSON.stringify(params)})`);
            const response = await axios.get(url, {
                headers,
                params
            });
            return response.data;
        } catch (error) {
            console.error('❌ Error searching customers in TI:', {
                url,
                params,
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
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
