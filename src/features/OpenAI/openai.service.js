const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const settingsService = require('../Settings/settings.service');
const { Message, Chat } = require('../../models');
const zapiService = require('../ZapiWebhook/zapi.service');

class OpenaiService {
    async transcribeAudio(messageId, audioPath) {
        const apiKey = await settingsService.getByKey('openAiKey');
        if (!apiKey) throw new Error('OpenAI API key not configured');

        const formData = new FormData();
        formData.append('file', fs.createReadStream(audioPath));
        formData.append('model', 'whisper-1');

        try {
            const response = await axios.post(
                'https://api.openai.com/v1/audio/transcriptions',
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        'Authorization': `Bearer ${apiKey}`
                    }
                }
            );

            const transcription = response.data.text;
            const message = await Message.findByPk(messageId);
            if (message) {
                message.transcription = transcription;
                await message.save();

                // Emit socket event if possible
                // We'll handle this in the controller or by passing io
            }
            return message;
        } catch (error) {
            console.error('Error in Whisper transcription:', error.response?.data || error.message);
            throw error;
        }
    }

    async generateResponse(chatId, io) {
        const apiKey = await settingsService.getByKey('openAiKey');
        const mainPrompt = await settingsService.getByKey('mainPrompt');
        if (!apiKey) throw new Error('OpenAI API key not configured');

        const chat = await Chat.findByPk(chatId);
        if (!chat) throw new Error('Chat not found');

        const messages = await Message.findAll({
            where: { ChatId: chatId },
            limit: 15,
            order: [['timestamp', 'DESC']]
        });

        const history = messages.reverse().map(msg => ({
            role: msg.isFromMe ? 'assistant' : 'user',
            content: msg.body
        }));

        console.log(`🧠 Generating Response for Chat ${chatId}. History Length: ${history.length}`);

        const systemMessage = {
            role: 'system',
            content: mainPrompt || 'Você é um assistente prestativo.'
        };

        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4',
                    messages: [systemMessage, ...history]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log(`🤖 OpenAI Response Received. Tokens: ${response.data.usage?.total_tokens}`);

            const aiText = response.data.choices[0].message.content;

            // Send via Z-API
            console.log(`📤 Sending to Z-API (${chat.contactNumber}): ${aiText.substring(0, 30)}...`);
            await zapiService.sendMessage(chat.contactNumber, aiText);

            // Save as message
            const aiMessage = await Message.create({
                ChatId: chatId,
                body: aiText,
                isFromMe: true,
                timestamp: new Date()
            });

            if (io) {
                io.emit('new_message', { message: aiMessage, chat });
            }

            return aiMessage;
        } catch (error) {
            console.error('Error generating AI response:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new OpenaiService();
