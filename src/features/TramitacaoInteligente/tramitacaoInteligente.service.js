const { Chat } = require('../../models');
const { Op } = require('sequelize');
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
                contactName: manualData.name || chat.contactName,
                // Full fields sync
                email: manualData.email || chat.email,
                phone_1: manualData.phone_1 || '',
                phone_2: manualData.phone_2 || '',
                country: manualData.country || '',
                state: manualData.state || '',
                city: manualData.city || '',
                neighborhood: manualData.neighborhood || '',
                zipcode: manualData.zipcode || '',
                street: manualData.street || '',
                street_number: manualData.street_number || '',
                sexo: manualData.sexo || '',
                birthdate: manualData.birthdate || null,
                deathdate: manualData.deathdate || null,
                marital_status: manualData.marital_status || '',
                profession: manualData.profession || '',
                meu_inss_pass: manualData.meu_inss_pass || '',
                rg_numero: manualData.rg_numero || '',
                rg_data_emissao: manualData.rg_data_emissao || null,
                father_name: manualData.father_name || '',
                mother_name: manualData.mother_name || '',
                syncStatus: 'Sincronizado'
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
    async syncAllTICustomers() {
        const headers = await this.getHeaders();
        const baseUrl = await this.getBaseUrl();
        let allCustomers = [];
        let page = 1;
        let totalPages = 1;

        try {
            do {
                console.log(`📡 Fetching TI customers page ${page}...`);
                const response = await axios.get(`${baseUrl}/clientes`, {
                    headers,
                    params: { page, per_page: 100 }
                });

                const { customers, pagination } = response.data;
                allCustomers = allCustomers.concat(customers);
                totalPages = pagination.pages;
                page++;
            } while (page <= totalPages);

            console.log(`✅ Fetched ${allCustomers.length} customers from TI. Syncing to local DB...`);

            for (const customer of allCustomers) {
                const cleanCpf = (customer.cpf_cnpj || '').replace(/\D/g, '');

                // Try to find local chat by TI ID or CPF
                let chat = await Chat.findOne({
                    where: {
                        [Op.or]: [
                            { tramitacaoCustomerId: customer.id },
                            { cpf: cleanCpf }
                        ]
                    }
                });

                const updatePayload = {
                    tramitacaoCustomerId: customer.id,
                    tramitacaoCustomerUuid: customer.uuid,
                    contactName: customer.name || chat.contactName,
                    cpf: cleanCpf || chat.cpf,
                    email: customer.email || chat.email,
                    phone_1: customer.phone_1,
                    phone_2: customer.phone_2,
                    country: customer.country,
                    state: customer.state,
                    city: customer.city,
                    neighborhood: customer.neighborhood,
                    zipcode: customer.zipcode,
                    street: customer.street,
                    street_number: customer.street_number,
                    sexo: customer.sexo,
                    birthdate: customer.birthdate,
                    deathdate: customer.deathdate,
                    marital_status: customer.marital_status,
                    profession: customer.profession,
                    meu_inss_pass: customer.meu_inss_pass,
                    rg_numero: customer.rg_numero,
                    rg_data_emissao: customer.rg_data_emissao,
                    father_name: customer.father_name,
                    mother_name: customer.mother_name,
                    syncStatus: 'Sincronizado'
                };

                if (chat) {
                    // Update existing
                    await chat.update(updatePayload);
                } else {
                    // Create new local entry if it doesn't exist
                    await Chat.create({
                        ...updatePayload,
                        contactNumber: `TI_${customer.id}` // Placeholder identifier
                    });
                }
            }

            return { count: allCustomers.length };
        } catch (error) {
            console.error('❌ Error syncing TI customers:', error.message);
            throw new Error('Failed to sync customers from Tramitacao Inteligente');
        }
    }

    async getDossier(chatId) {
        const chat = await Chat.findByPk(chatId);
        if (!chat || !chat.tramitacaoCustomerId) {
            throw new Error('Chat not found or not linked to TI');
        }

        const headers = await this.getHeaders();
        const baseUrl = await this.getBaseUrl();

        try {
            console.log(`📡 Fetching Full Dossier for TI ID: ${chat.tramitacaoCustomerId}`);
            // The TI API usually provides basic info at /clientes/{id} 
            // and more detailed process info might require /processos or similar depending on their API.
            // Based on previous knowledge, /clientes/{id} returns the customer with embedded dossiers/processes.
            const response = await axios.get(`${baseUrl}/clientes/${chat.tramitacaoCustomerId}`, { headers });

            // Return only what the AI needs to avoid token bloat
            const customer = response.data.customer || response.data;
            return {
                name: customer.name,
                cpf_cnpj: customer.cpf_cnpj,
                processes: customer.processes || [],
                movements: customer.last_movements || []
            };
        } catch (error) {
        }
    }

    async upsertNote(chatId, content, userId = null) {
        // Search for an existing "Carol IA" note to update, or create a new one
        const existingNotes = await this.getCustomerNotes(chatId);
        const triageNote = existingNotes.notes?.find(n => n.content.includes('Nome:') && n.content.includes('Área Jurídica:'));

        if (triageNote) {
            console.log(`📝 Updating existing Triage Note ${triageNote.id} in TI`);
            return this.updateNote(triageNote.id, content, userId);
        } else {
            console.log(`📝 Creating new Triage Note in TI`);
            return this.createNote(chatId, content, userId);
        }
    }
}

module.exports = new TramitacaoInteligenteService();
