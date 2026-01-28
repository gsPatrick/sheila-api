const axios = require('axios');
const settingsService = require('../Settings/settings.service');
const { Chat } = require('../../models');

class TrelloService {
    async getCredentials() {
        const key = await settingsService.getByKey('trelloKey');
        const token = await settingsService.getByKey('trelloToken');
        const boardId = await settingsService.getByKey('trelloBoardId');

        if (!key || !token) {
            console.warn('⚠️ Trello credentials not fully configured');
            return null;
        }

        return { key, token, boardId };
    }

    async findTrelloCard(phone) {
        const creds = await this.getCredentials();
        if (!creds) return null;

        const { key, token, boardId } = creds;
        const cleanPhone = phone.replace(/\D/g, '');

        // Search variations: Full, without 55, last 9 digits
        const searchTerms = [
            cleanPhone,
            cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone,
            cleanPhone.slice(-9)
        ];

        try {
            for (const term of searchTerms) {
                const response = await axios.get(`https://api.trello.com/1/search`, {
                    params: {
                        key,
                        token,
                        query: term,
                        modelTypes: 'cards',
                        idBoards: boardId,
                        partial: true
                    }
                });

                const cards = response.data.cards || [];
                // More rigorous filtering for false positives
                const exactMatch = cards.find(card => {
                    const cardName = card.name.replace(/\D/g, '');
                    return cardName.includes(term);
                });

                if (exactMatch) return exactMatch;
            }
        } catch (error) {
            console.error('❌ Trello search error:', error.message);
        }

        return null;
    }

    async syncTrelloCard(chatId) {
        const chat = await Chat.findByPk(chatId);
        if (!chat) return null;

        const creds = await this.getCredentials();
        const listId = await settingsService.getByKey('trelloListId');
        if (!creds || !listId) {
            console.warn('⚠️ Trello listId or credentials missing');
            return null;
        }

        const { key, token, boardId } = creds;

        // Find existing card first
        let card = await this.findTrelloCard(chat.contactNumber);

        const title = `${chat.contactName?.toUpperCase() || 'CLIENTE NOVO'} - ${chat.contactNumber}`;

        // Helper to slugify name for the URL
        const slugify = (text) => {
            return text
                .toString()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^\w\s-]/g, '')
                .replace(/[\s_-]+/g, '-')
                .replace(/^-+|-+$/g, '');
        };

        const tiSlug = chat.contactName ? `${chat.tramitacaoCustomerId}-${slugify(chat.contactName)}` : chat.tramitacaoCustomerId;

        const description = `
### DADOS DA TRIAGEM
- **Nome:** ${chat.contactName || 'Não Informado'}
- **WhatsApp:** ${chat.contactNumber}
- **CPF:** ${chat.cpf || 'Não Informado'}
- **E-mail:** ${chat.email || 'Não Informado'}
- **Área:** ${chat.area || 'Não Definida'}
- **Possui Advogado?** ${chat.hasLawyer ? 'Sim' : 'Não'}
- **Resposta sobre Advogado:** ${chat.lawyerResponse || 'N/A'}
- **Link TI:** https://planilha.tramitacaointeligente.com.br/clientes/${tiSlug || ''}

### INFORMAÇÕES DO USUÁRIO (Sincronizado TI)
- **Data de Nascimento:** ${chat.birthdate || 'Não Informado'}
- **Sexo:** ${chat.sexo || 'Não Informado'}
- **Estado Civil:** ${chat.marital_status || 'Não Informado'}
- **Profissão:** ${chat.profession || 'Não Informado'}
- **RG:** ${chat.rg_numero || 'Não Informado'}
- **Senha Meu INSS:** ${chat.meu_inss_pass || 'Não Informado'}
- **Mãe:** ${chat.mother_name || 'Não Informado'}
- **Pai:** ${chat.father_name || 'Não Informado'}
- **Endereço:** ${chat.street || ''}, ${chat.street_number || ''} - ${chat.neighborhood || ''}, ${chat.city || ''}/${chat.state || ''} (CEP: ${chat.zipcode || ''})

### RESUMO DO CASO
${chat.notes || 'Nenhuma nota disponível.'}

---
*Gerado automaticamente pelo Sistema Carol IA*
        `;

        try {
            // Match Labels
            const labels = await this.getBoardLabels(boardId, key, token);
            const matchingLabel = labels.find(l =>
                l.name.toLowerCase().includes(chat.area?.toLowerCase() || 'none')
            );

            if (card) {
                // UPDATE existing card
                await axios.put(`https://api.trello.com/1/cards/${card.id}`, null, {
                    params: {
                        key,
                        token,
                        name: title,
                        desc: description,
                        idLabels: matchingLabel ? matchingLabel.id : undefined
                    }
                });
                console.log(`✅ Trello Card updated: ${card.shortUrl}`);
                return card;
            } else {
                // CREATE new card
                const response = await axios.post(`https://api.trello.com/1/cards`, null, {
                    params: {
                        key,
                        token,
                        idList: listId,
                        name: title,
                        desc: description,
                        pos: 'top',
                        idLabels: matchingLabel ? matchingLabel.id : undefined
                    }
                });
                console.log(`✅ Trello Card created: ${response.data.shortUrl}`);
                return response.data;
            }
        } catch (error) {
            console.error('❌ Trello sync error:', error.response?.data || error.message);
            return null;
        }
    }

    async addComment(cardId, text) {
        const creds = await this.getCredentials();
        if (!creds) return;

        const { key, token } = creds;

        try {
            await axios.post(`https://api.trello.com/1/cards/${cardId}/actions/comments`, null, {
                params: {
                    key,
                    token,
                    text: `💬 **Mensagem Cliente:** ${text}`
                }
            });
        } catch (error) {
            console.error('❌ Trello comment error:', error.message);
        }
    }

    async getBoardLabels(boardId, key, token) {
        try {
            const response = await axios.get(`https://api.trello.com/1/boards/${boardId}/labels`, {
                params: { key, token }
            });
            return response.data || [];
        } catch (error) {
            return [];
        }
    }
}

module.exports = new TrelloService();
