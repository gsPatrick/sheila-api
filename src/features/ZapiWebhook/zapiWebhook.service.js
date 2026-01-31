const chatService = require('../Chat/chat.service');
const blacklistService = require('../Blacklist/blacklist.service');
const openaiService = require('../OpenAI/openai.service');
const zapiService = require('./zapi.service');
const { Message } = require('../../models');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const settingsService = require('../Settings/settings.service');

class ZapiWebhookService {
    async process(payload, io) {
        const { phone, fromMe, text, audio, type, senderName, instanceId, messageId, isGroup, participant } = payload;
        const msgId = messageId || payload.id; // Z-API variation

        // Ignore status updates
        if (type === 'MessageStatusCallback' || (type && type !== 'ReceivedCallback')) {
            return;
        }

        // 1b. Ignore GROUPS and Broadcast lists
        if (isGroup === true || (phone && (phone.endsWith('@g.us') || phone.includes('-'))) || participant) {
            console.log(`👥 Group/Broadcast message ignored from ${phone}`);
            return;
        }

        console.log(`📩 Webhook Received [ID: ${msgId}] from ${phone} (fromMe: ${fromMe})`);

        // 2. Extração de Dados
        const contactNumber = phone;
        const body = text?.message || '';
        const isAudio = type === 'ReceivedCallback' && audio;
        const isMsgFromMe = fromMe === true || fromMe === 'true'; // Handle string bool

        // 2c. Ignore empty messages (non-audio)
        if (!body && !isAudio && !isMsgFromMe) {
            console.log(`ℹ️ Empty message from ${contactNumber} ignored.`);
            return;
        }

        // 2b. Check if this is a Bot message (just sent by us)
        const isBot = zapiService.checkAndClearBotMessage(msgId);

        if (isMsgFromMe && isBot) {
            console.log(`🤖 Bot message echo detected (ID: ${msgId}). Skipping deactivation.`);
            return;
        }

        // --- MANUEL AI TOGGLE COMMANDS ---
        if (isMsgFromMe) {
            const cleanBody = body.trim();
            if (cleanBody === '#') {
                console.log(`🔴 Manual Command: Deactivating AI for ${contactNumber}`);
                const chat = await chatService.findOrCreateChat(contactNumber, senderName, false);
                await chatService.updateAiStatus(chat.id, false);
                if (io) io.emit('chat_updated', { ...chat.get(), isAiActive: false });
                return; // Stop processing
            } if (cleanBody === '.') {
                console.log(`🟢 Manual Command: Activating AI for ${contactNumber}`);
                const chat = await chatService.findOrCreateChat(contactNumber, senderName, false);
                await chatService.updateAiStatus(chat.id, true);
                if (io) io.emit('chat_updated', { ...chat.get(), isAiActive: true });
                return; // Stop processing
            }
        }



        // 3. Verificação da Blacklist
        const isBlacklisted = await blacklistService.isBlacklisted(contactNumber);
        if (isBlacklisted) {
            console.log(`Contact ${contactNumber} is blacklisted. Ignoring.`);
            return;
        }

        // 4. Gerenciamento de Chat
        const allowedSuffixes = ['7183141335', '71983141335', '11968070834', '968070834'];
        const isWhitelisted = allowedSuffixes.some(suffix => contactNumber.endsWith(suffix));

        // Se não for White-list, cria com IA desativada para não confundir no painel
        const chat = await chatService.findOrCreateChat(contactNumber, senderName, isWhitelisted);
        console.log(`📂 Chat found/created. ID: ${chat.id} | AI Active: ${chat.isAiActive}`);

        // --- 4b. AI Reactivation via Character ---
        const reactivationChar = await settingsService.getByKey('aiReactivationChar');
        if (!isMsgFromMe && body.trim() === reactivationChar && reactivationChar) {
            console.log(`🟢 Reactivating AI for Chat ${chat.id} via character: ${reactivationChar}`);
            chat.isAiActive = true;
            await chat.save();

            if (io) {
                io.emit('chat_updated', chat.get({ plain: true }));
            }

            // Send a subtle confirmation to the user
            await zapiService.sendMessage(contactNumber, "✨ *Assistente Carol reativada!* Como posso ajudar você agora?");
            return;
        }

        // 5. Processamento de Mensagem
        let newMessage;
        if (isAudio) {
            const audioUrl = audio.audioUrl;
            const fileName = `audio_${Date.now()}.ogg`;
            const uploadDir = path.join(__dirname, '../../../uploads/audio');
            const filePath = path.join(uploadDir, fileName);

            // Ensure directory exists
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            try {
                await this.downloadFile(audioUrl, filePath);
            } catch (error) {
                console.error('❌ Failed to download audio file:', error.message);
                return; // Prevent crash
            }

            newMessage = await Message.create({
                ChatId: chat.id,
                body: '[Áudio]',
                isFromMe: isMsgFromMe,
                audioUrl: fileName,
                timestamp: new Date()
            });

            // Await transcription so AI context is ready
            try {
                const updatedMsg = await openaiService.transcribeAudio(newMessage.id, filePath);
                if (io) {
                    io.emit('message_updated', updatedMsg);
                }
            } catch (err) {
                console.error('Whisper error:', err);
            }

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

        // 📋 Trello Integration: Add comment if card exists
        if (!isMsgFromMe && body) {
            const trelloService = require('../Trello/trello.service');
            trelloService.findTrelloCard(contactNumber).then(card => {
                if (card) {
                    trelloService.addComment(card.id, body);
                }
            }).catch(e => console.error('❌ Trello comment match error:', e.message));
        }

        // 7. Desativação Automática da IA
        if (isMsgFromMe) {
            console.log(`🔴 Turning OFF AI for Chat ${chat.id} due to manual message.`);
            await chatService.updateAiStatus(chat.id, false);
            if (io) {
                io.emit('chat_updated', { ...chat.get(), isAiActive: false });
            }
            return;
        }

        // 8. Acionamento da IA
        if (chat.isAiActive && !isMsgFromMe) {

            // --- HARDCODED FIRST INTERACTION CHECK ---
            const botMsgCount = await Message.count({
                where: {
                    ChatId: chat.id,
                    isFromMe: true
                }
            });

            if (botMsgCount === 0) {
                console.log(`🆕 New chat detected. Preparing Hardcoded Phase 0 Script...`);

                const welcomeScript = `Olá! Você entrou em contato com o escritório da Dra Sheila Araújo.

Somos especialistas em Direito Previdenciário e Trabalhista e  acidente de trabalho.

Antes de começarmos, qual é o seu nome completo?`;

                // DELAY ANTI-SPAM (3s - 6s)
                const delay = Math.floor(Math.random() * 3000) + 3000;
                console.log(`⏳ Waiting ${delay}ms before sending welcome message...`);
                await new Promise(resolve => setTimeout(resolve, delay));

                // 1. Send via Z-API
                try {
                    await zapiService.sendMessage(contactNumber, welcomeScript);
                } catch (error) {
                    console.error('❌ Failed to send initial welcome message:', error.message);
                }    // We might want to stop here or continue. 
                // If we can't send the message, saving it to DB implies we sent it, which might confuse the AI later.
                // But blocking the crash is the priority.


                // 2. Save to DB so AI sees it later
                const welcomeMsg = await Message.create({
                    ChatId: chat.id,
                    body: welcomeScript,
                    isFromMe: true,
                    timestamp: new Date()
                });

                // 3. Emit to Frontend
                if (io) {
                    io.emit('new_message', { message: welcomeMsg, chat });
                }

                console.log(`✅ Hardcoded Welcome Message sent.`);
                return; // STOP here. Don't call OpenAI.
            }

            console.log('🤖 AI Active. Generating Response for ongoing conversation...');
            // Generate AI response
            openaiService.generateResponse(chat.id, io).catch(err => console.error('❌ GPT error:', err));
        } else {
            console.log(`⏭️ Skipping AI. Active: ${chat.isAiActive}, FromMe: ${isMsgFromMe}`);
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
