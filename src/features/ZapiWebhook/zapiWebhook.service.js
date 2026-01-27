const chatService = require('../Chat/chat.service');
const blacklistService = require('../Blacklist/blacklist.service');
const openaiService = require('../OpenAI/openai.service');
const zapiService = require('./zapi.service');
const { Message } = require('../../models');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ZapiWebhookService {
    async process(payload, io) {
        const { phone, fromMe, text, audio, type, senderName, instanceId } = payload;

        // Ignore status updates (READ, RECEIVED, etc) and other non-message types
        if (type === 'MessageStatusCallback' || (type && type !== 'ReceivedCallback')) {
            return;
        }

        // 2. Extração de Dados
        const contactNumber = phone;
        const body = text?.message || '';
        const isAudio = type === 'ReceivedCallback' && audio;
        const isMsgFromMe = fromMe === true; // Force boolean

        // WHITE-LIST PARA TESTES (Restrito ao número do usuário)
        // Aceita formatos com ou sem o 9º dígito
        const allowedSuffix = '7183141335';
        const allowedSuffix9 = '71983141335';

        if (!isMsgFromMe && !contactNumber.endsWith(allowedSuffix) && !contactNumber.endsWith(allowedSuffix9)) {
            console.log(`Contact ${contactNumber} not in whitelist. Ignoring.`);
            return;
        }

        // 3. Verificação da Blacklist
        const isBlacklisted = await blacklistService.isBlacklisted(contactNumber);
        if (isBlacklisted) {
            console.log(`Contact ${contactNumber} is blacklisted. Ignoring.`);
            return;
        }

        // 4. Gerenciamento de Chat
        const chat = await chatService.findOrCreateChat(contactNumber, senderName);

        // 5. Processamento de Mensagem
        let newMessage;
        if (isAudio) {
            const audioUrl = audio.audioUrl;
            const fileName = `audio_${Date.now()}.ogg`;
            const filePath = path.join(__dirname, '../../../uploads/audio', fileName);

            await this.downloadFile(audioUrl, filePath);

            newMessage = await Message.create({
                ChatId: chat.id,
                body: '[Áudio]',
                isFromMe: isMsgFromMe,
                audioUrl: fileName,
                timestamp: new Date()
            });

            // Trigger Whisper transcription in background
            openaiService.transcribeAudio(newMessage.id, filePath).then(updatedMsg => {
                if (io) {
                    io.emit('message_updated', updatedMsg);
                }
            }).catch(err => console.error('Whisper error:', err));

        } else {
            newMessage = await Message.create({
                ChatId: chat.id,
                body: body,
                isFromMe: isMsgFromMe,
                timestamp: new Date()
            });
        }

        // 6. Notificação Real-Time
        if (io) {
            io.emit('new_message', { message: newMessage, chat });
        }

        // 7. Desativação Automática da IA
        if (isMsgFromMe) {
            // If sent from the synced phone, disable AI for this chat (to the recipient)
            await chatService.updateAiStatus(chat.id, false);
            if (io) {
                io.emit('chat_updated', chat);
            }
            return;
        }

        // 8. Acionamento da IA
        if (chat.isAiActive && !isMsgFromMe) {
            // Generate AI response
            openaiService.generateResponse(chat.id, io).catch(err => console.error('GPT error:', err));
        }
    }

    async downloadFile(url, dest) {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
        });

        return new Promise((resolve, reject) => {
            response.data.pipe(fs.createWriteStream(dest))
                .on('finish', () => resolve())
                .on('error', (e) => reject(e));
        });
    }
}

module.exports = new ZapiWebhookService();
