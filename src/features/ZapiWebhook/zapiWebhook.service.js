const chatService = require('../Chat/chat.service');
const blacklistService = require('../Blacklist/blacklist.service');
const openaiService = require('../OpenAI/openai.service');
const zapiService = require('./zapi.service');
const { Message } = require('../../models');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const settingsService = require('../Settings/settings.service');

const pendingResponders = new Map();
// Memory lock for welcome flow to prevent race conditions
const processingWelcome = new Set();

class ZapiWebhookService {
    async process(payload, io) {

        const { phone, fromMe, text, audio, type, senderName, instanceId, messageId, isGroup, participant, ids, chatLid } = payload;
        const msgId = messageId || payload.id || (ids && ids[0]); // Z-API variation

        // Ignore status updates
        if (type === 'MessageStatusCallback' || (type && type !== 'ReceivedCallback')) {
            console.log(`ℹ️ [WEBHOOK] Ignoring message type: ${type} for ID: ${msgId}`);
            return;
        }

        // 1b. Ignore GROUPS, Broadcast lists and NEWSLETTERS
        const isNewsletter = phone && phone.endsWith('@newsletter');
        if (isGroup === true || (phone && (phone.endsWith('@g.us') || phone.includes('-'))) || participant || isNewsletter) {
            console.log(`👥 Group/Broadcast/Newsletter message ignored from ${phone}`);
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
                console.log(`🔴 Manual Command: Deactivating AI for ${contactNumber} (LID: ${chatLid})`);
                // Use null for name to respect user rule: "name always asked, never from Z-API"
                const chat = await chatService.findOrCreateChat(contactNumber, null, false, chatLid);

                // CLEAR PENDING AI DEBOUNCE
                if (pendingResponders.has(chat.id)) {
                    console.log(`⏱️ Clearing pending AI response for Chat ${chat.id} due to #`);
                    clearTimeout(pendingResponders.get(chat.id));
                    pendingResponders.delete(chat.id);
                }

                await chatService.updateAiStatus(chat.id, false);
                if (io) io.emit('chat_updated', { ...chat.get(), isAiActive: false });
                return; // Stop processing
            } if (cleanBody === '.') {
                console.log(`🟢 Manual Command: Activating AI for ${contactNumber} (LID: ${chatLid})`);
                const chat = await chatService.findOrCreateChat(contactNumber, null, false, chatLid);
                await chatService.updateAiStatus(chat.id, true);
                if (io) io.emit('chat_updated', { ...chat.get(), isAiActive: true });

                // Trigger AI to analyze and resume proactively
                console.log(`🚀 Proactive Resumption: Triggering AI for Chat ${chat.id}`);
                openaiService.generateResponse(chat.id, io).catch(err => console.error('❌ Proactive GPT error:', err));

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
        // Detect message source (basic UTM imitation)
        let source = 'Orgânico';
        const lowerBody = body.toLowerCase();
        if (lowerBody.includes('vi no facebook') || lowerBody.includes('vindo do facebook')) source = 'Facebook';
        else if (lowerBody.includes('instagram')) source = 'Instagram';
        else if (lowerBody.includes('google')) source = 'Google';

        // O chatbot agora está liberado para todos os usuários por padrão
        // REGRA : contactName = null. NUNCA salvar o nome vindo do Z-API. 
        // A Carol DEVE perguntar o nome em 100% dos casos para popular o BD corretamente.
        const chat = await chatService.findOrCreateChat(contactNumber, null, true, chatLid, source);
        console.log(`📂 Chat find/created. ID: ${chat.id} | AI Active: ${chat.isAiActive} | LID: ${chat.chatLid}`);

        // --- 4b. AI Reactivation via Character ---
        if (body.trim() === '.') {
            console.log(`🟢 Reactivating AI for Chat ${chat.id} via character: .`);
            chat.isAiActive = true;
            await chat.save();

            if (io) {
                io.emit('chat_updated', chat.get({ plain: true }));
            }

            // Trigger AI to analyze and resume proactively
            console.log(`🚀 Proactive Resumption (Customer): Triggering AI for Chat ${chat.id}`);
            openaiService.generateResponse(chat.id, io).catch(err => console.error('❌ Proactive GPT error:', err));

            return;
        }

        if (body.trim() === '#') {
            console.log(`🔴 Deactivating AI for Chat ${chat.id} via character: #`);

            // CLEAR PENDING AI DEBOUNCE
            if (pendingResponders.has(chat.id)) {
                console.log(`⏱️ Clearing pending AI response for Chat ${chat.id} due to #`);
                clearTimeout(pendingResponders.get(chat.id));
                pendingResponders.delete(chat.id);
            }

            chat.isAiActive = false;
            await chat.save();

            if (io) {
                io.emit('chat_updated', { ...chat.get(), isAiActive: false });
            }
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

        // 7. Desativação Automática da IA (Manual intervention from admin)
        // Exclude control characters . and # from auto-deactivation
        if (isMsgFromMe && body.trim() !== '.' && body.trim() !== '#') {
            console.log(`🔴 Turning OFF AI for Chat ${chat.id} due to manual message.`);

            // CLEAR PENDING AI DEBOUNCE
            if (pendingResponders.has(chat.id)) {
                console.log(`⏱️ Clearing pending AI response for Chat ${chat.id} due to manual override`);
                clearTimeout(pendingResponders.get(chat.id));
                pendingResponders.delete(chat.id);
            }

            await chatService.updateAiStatus(chat.id, false);
            if (io) {
                io.emit('chat_updated', { ...chat.get(), isAiActive: false });
            }
            return;
        }

        // 8. Acionamento da IA
        if (chat.isAiActive && !isMsgFromMe) {

            // --- HARDCODED FIRST INTERACTION CHECK ---
            // Fix: Check isWelcomeSent flag AND use count as backup
            if (!chat.isWelcomeSent && !processingWelcome.has(chat.id)) {
                processingWelcome.add(chat.id);
                try {
                    const botMsgCount = await Message.count({
                        where: {
                            ChatId: chat.id,
                            isFromMe: true
                        }
                    });

                    // Trigger Hardcoded Phase 0 ONLY if it's a truly new chat (no bot messages sent yet)
                    if (botMsgCount === 0) {
                        console.log(`🆕 Triage Triggered for NEW Chat ${chat.id}.`);

                        // 🛑 IMMEDIATE LOCK: Set flag to true to prevent race conditions during delay
                        await chat.update({ isWelcomeSent: true });

                        const welcomeScript = `Olá! Você entrou em contato com o escritório da Dra. Sheila Araújo.

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
                        }

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
                        processingWelcome.delete(chat.id);
                        return; // STOP here. Don't call OpenAI.
                    } else {
                        // Heal: If botMsgCount > 0 but isWelcomeSent is false, set it to true to avoid future checks
                        console.log(`🔧 Healing Chat ${chat.id}: Found messages but flag was false. Setting isWelcomeSent=true.`);
                        await chat.update({ isWelcomeSent: true });
                        processingWelcome.delete(chat.id);
                    }
                } catch (err) {
                    console.error('❌ Welcome flow error:', err);
                    processingWelcome.delete(chat.id);
                }
            }

            console.log(`🤖 AI Active for Chat ${chat.id}. Queueing response (debounce)...`);

            // Clear existing timeout if any
            if (pendingResponders.has(chat.id)) {
                console.log(`⏱️ Extending wait for Chat ${chat.id}...`);
                clearTimeout(pendingResponders.get(chat.id));
            }

            // Set new timeout (12 seconds of silence)
            const timeoutId = setTimeout(async () => {
                try {
                    console.log(`🚀 Debounce finished. Triggering AI for Chat ${chat.id}`);
                    pendingResponders.delete(chat.id);
                    await openaiService.generateResponse(chat.id, io);
                } catch (err) {
                    console.error('❌ Debounce GPT error:', err);
                }
            }, 12000);

            pendingResponders.set(chat.id, timeoutId);
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
