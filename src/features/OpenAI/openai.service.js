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
            const tools = [
                {
                    type: "function",
                    function: {
                        name: "update_customer_data",
                        description: "Extracts and saves customer data whenever the user provides information during the triage. Call this function every time you learn something new about the customer. Include all fields you know about, not just the new ones.",
                        parameters: {
                            type: "object",
                            properties: {
                                name: { type: "string", description: "Customer's full name" },
                                cpf: { type: "string", description: "Customer's CPF/CNPJ (numbers only)" },
                                email: { type: "string", description: "Customer's email address" },
                                hasLawyer: { type: "boolean", description: "Whether the customer already has a lawyer for this case. true if yes, false if no." },
                                area: { type: "string", enum: ["previdenciario", "trabalhista", "outro"], description: "The area of law the customer needs help with" },
                                notes: { type: "string", description: "Summary of the conversation so far, including all relevant context like employment history, health issues, benefits status, etc." },
                                triageStatus: { type: "string", enum: ["em_andamento", "finalizada", "encerrada_etica"], description: "Current triage status. Set to 'encerrada_etica' if customer has a lawyer, 'finalizada' when triage is complete." }
                            },
                        }
                    }
                }
            ];

            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o-mini', // Using gpt-4o-mini for faster/better tool handling if available, else keep gpt-4
                    messages: [systemMessage, ...history],
                    tools: tools,
                    tool_choice: "auto"
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log(`🤖 OpenAI Response Received. Tokens: ${response.data.usage?.total_tokens}`);

            let responseMessage = response.data.choices[0].message;
            const currentMessages = [systemMessage, ...history, responseMessage];

            // Handle Function Calling (Standard Flow)
            if (responseMessage.tool_calls) {
                console.log(`🛠️ Processing ${responseMessage.tool_calls.length} Tool Calls...`);

                for (const toolCall of responseMessage.tool_calls) {
                    if (toolCall.function.name === 'update_customer_data') {
                        try {
                            const data = JSON.parse(toolCall.function.arguments);
                            console.log(`💾 AI extracted data:`, data);

                            await chat.update({
                                contactName: data.name || chat.contactName,
                                cpf: data.cpf || chat.cpf,
                                email: data.email || chat.email,
                                hasLawyer: data.hasLawyer !== undefined ? data.hasLawyer : chat.hasLawyer,
                                area: data.area || chat.area,
                                notes: data.notes || chat.notes,
                                triageStatus: data.triageStatus || chat.triageStatus
                            });

                            if (io) io.emit('chat_updated', chat);

                            // Push tool result to messages with details
                            currentMessages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                name: 'update_customer_data',
                                content: `Updated fields: ${Object.keys(data).join(', ')}. Data saved successfully.`
                            });
                        } catch (e) {
                            console.error('Error in tool execution:', e);
                        }
                    }
                }

                // Call OpenAI again to get the final text response based on tool results
                console.log(`🧠 Getting final text response after tool execution...`);
                const finalResponse = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: 'gpt-4o-mini',
                        messages: currentMessages
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                responseMessage = finalResponse.data.choices[0].message;
                console.log(`🤖 Final AI Text after tool: "${responseMessage.content?.substring(0, 50)}..."`);
            }

            const aiText = responseMessage.content;
            if (!aiText) {
                console.log('⚠️ AI returned empty content even after tool processing.');
                return null;
            }

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
