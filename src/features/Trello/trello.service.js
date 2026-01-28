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

    async createTrelloCard(chatId) {
        const chat = await Chat.findByPk(chatId);
        if (!chat) return null;

        const creds = await this.getCredentials();
        const listId = await settingsService.getByKey('trelloListId');
        if (!creds || !listId) {
            console.warn('⚠️ Trello listId or credentials missing');
            return null;
        }

        const { key, token, boardId } = creds;
        const title = `${chat.contactName?.toUpperCase() || 'CLIENTE NOVO'} - ${chat.contactNumber}`;

        const description = `
### DADOS DA TRIAGEM
- **Nome:** ${chat.contactName || 'Não Informado'}
- **WhatsApp:** ${chat.contactNumber}
- **CPF:** ${chat.cpf || 'Não Informado'}
- **E-mail:** ${chat.email || 'Não Informado'}
- **Área:** ${chat.area || 'Não Definida'}
- **Link TI:** https://tramitacaointeligente.com.br/clientes/${chat.tramitacaoCustomerId || ''}

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
        } catch (error) {
            console.error('❌ Trello creation error:', error.response?.data || error.message);
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
