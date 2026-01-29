const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const settingsService = require('../Settings/settings.service');
const { Message, Chat } = require('../../models');
const zapiService = require('../ZapiWebhook/zapi.service');
const tramitacaoService = require('../TramitacaoInteligente/tramitacaoInteligente.service');

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
            content: msg.transcription || msg.body // Use transcription if available
        }));

        console.log(`🧠 Generating Response for Chat ${chatId}. History Length: ${history.length}`);

        const systemMessage = {
            role: 'system',
            content: (mainPrompt || 'Você é Carol, a assistente virtual da Advocacia Andrade Nascimento. Sua missão é realizar a triagem inicial de novos clientes para as áreas de Direito Previdenciário e Trabalhista. Inicie sempre com a saudação de boas-vindas.') +
                `
    
### CONTEXTO ATUAL DO CLIENTE (O QUE JÁ SABEMOS):
- Nome: ${chat.contactName || 'Não informado'}
- CPF/CNPJ: ${chat.cpf || 'Não informado'}
- Status da Triagem: ${chat.triageStatus || 'em_andamento'}
### CONTAGEM DE NOTAS (TEMPLATE OBRIGATÓRIO):
Sempre que preencher o campo 'notes', você deve usar EXATAMENTE este formato:
Nome: [Nome Completo]
CPF: [CPF ou CNPJ]
E-mail: [Melhor E-mail]
Área Jurídica: [Previdenciário, Trabalhista ou Outro]
Possui Advogado: [Sim/Não] (Resposta: [Frase do cliente])
Resumo do Caso: [Bloco de texto único descrevendo o histórico e problema do cliente]

IMPORTANTE: Forneça sempre o bloco COMPLETO e ATUALIZADO em cada chamada. Não use separadores como '---' nem repita blocos antigos.

### ROTEIRO DE TRIAGEM (SIGA ESTA ORDEM):
1. **Entender o Caso**: Descubra o problema principal e defina a Área Jurídica.
2. **Verificar Advogado**: Pergunte se já tem advogado. Se SIM, encerre (status: encerrada_etica).
3. **Coletar Dados**: Peça Nome Completo, CPF e E-mail (um por vez para não assustar).
4. **Solicitar Documentos**: Peça para o cliente enviar uma FOTO do RG/CNH e Comprovante de Residência.
5. **FINALIZAR**: Assim que pedir os documentos e tiver os dados básicos, mude o status para 'finalizada'. Não precisa esperar a pessoa mandar a foto para finalizar.

### REGRAS JURÍDICAS BÁSICAS (LEMBRE-SE):
- **Pensão por Morte**: O que importa é a qualidade de segurado do **FALECIDO**, não de quem pede. Não pergunte se a viúva contribuiu, pergunte sobre o marido falecido.
- **Áudios**: Você RECEBE a transcrição dos áudios que o cliente envia. Trate como texto normal. NÃO diga que não pode ouvir.

### PROTOCOLO DE SEGURANÇA (ANTI-GOLPE):
Caso o cliente mencione que "alguém entrou em contato", "outro número chamou", "golpe", "fraude" ou envie um print/número suspeito se passando pela Dra. Sheila ou escritório:
1. AJA IMEDIATAMENTE com seriedade e alerta.
2. INFORME CLARAMENTE: "Os únicos contatos oficiais do escritório são (11) 96961-7333 e (11) 5514-0839."
3. ORIENTE o cliente a bloquear o número suspeito e não passar informações.
4. CONFIRME que o escritório não solicita pagamentos antecipados por PIX em contas de terceiros.
    
### FASE PÓS-TRIAGEM (AGUARDANDO ATENDIMENTO):
Se o status da triagem for 'finalizada' ou 'encerrada_etica', mas o cliente continuar perguntando:
1. NÃO DESLIGUE NEM ENCERRE A CONVERSA.
2. Continue tirando dúvidas sobre o andamento, prazos ou perguntas gerais.
3. Se perguntarem sobre o processo, USE A FERRAMENTA 'get_process_status' para buscar no TI.
4. Explique que um atendente humano logo entrará em contato para os próximos passos formais.`
        };

        try {
            const tools = [
                {
                    type: "function",
                    function: {
                        name: "update_customer_data",
                        description: "CRITICAL: You MUST call this function whenever you gather new information. Update the 'notes' with a comprehensive summary.",
                        parameters: {
                            type: "object",
                            properties: {
                                name: { type: "string", description: "Customer's full name" },
                                cpf: { type: "string", description: "Customer's CPF or CNPJ (numbers only)" },
                                email: { type: "string", description: "Customer's email address" },
                                hasLawyer: { type: "boolean", description: "Whether the customer already has a lawyer for this case. true if yes, false if no." },
                                lawyerResponse: { type: "string", description: "The exact phrase the user said about having or not having a lawyer" },
                                area: { type: "string", enum: ["previdenciario", "trabalhista", "outro"], description: "The area of law the customer needs help with" },
                                notes: { type: "string", description: "Comprehensive summary of everything learned about the customer so far. Include: employment history, health issues, benefits status, case details, and all relevant context from the conversation." },
                                triageStatus: { type: "string", enum: ["em_andamento", "finalizada", "encerrada_etica"], description: "Set to 'finalizada' AFTER collecting Name, CPF, Email AND asking for documents. Set to 'encerrada_etica' if already has lawyer." }
                            },
                            required: ["notes"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_process_status",
                        description: "Fetches the current status and latest updates of the customer's legal processes from Tramitação Inteligente. Use this only when the customer asks about their process or case progress.",
                        parameters: {
                            type: "object",
                            properties: {},
                            required: []
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
                    tool_choice: "auto",
                },
                {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                }
            );

            const sentSystemMsg = systemMessage.content.substring(0, 100);
            console.log(`📡 OpenAI Request Sent. System Prompt Start: "${sentSystemMsg}..."`);
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

                            const finalNotes = data.notes || chat.notes;
                            const oldStatus = chat.triageStatus; // Capture old status to detect change

                            await chat.update({
                                contactName: data.name || chat.contactName,
                                cpf: data.cpf || chat.cpf,
                                email: data.email || chat.email,
                                hasLawyer: data.hasLawyer !== undefined ? data.hasLawyer : chat.hasLawyer,
                                lawyerResponse: data.lawyerResponse || chat.lawyerResponse,
                                area: data.area || chat.area,
                                notes: finalNotes,
                                triageStatus: data.triageStatus || chat.triageStatus
                            });

                            // 🔄 Auto-Sync to TI Portal: Trigger as soon as core data is captured
                            const hasCoreData = (data.name || chat.contactName) && (data.cpf || chat.cpf) && (data.email || chat.email);
                            if (hasCoreData && !chat.tramitacaoCustomerId) {
                                console.log(`🚀 Core data captured for ${data.name || chat.contactName}. Triggering auto-sync to TI...`);
                                try {
                                    const result = await tramitacaoService.searchCustomers(data.cpf || chat.cpf);
                                    const cleanInputCpf = (data.cpf || chat.cpf).replace(/\D/g, '');
                                    const existing = result.customers?.find(c => c.cpf_cnpj?.replace(/\D/g, '') === cleanInputCpf);

                                    if (existing) {
                                        console.log(`🔗 Existing customer found in TI (ID: ${existing.id}). Linking...`);
                                        await chat.update({
                                            tramitacaoCustomerId: existing.id,
                                            tramitacaoCustomerUuid: existing.uuid,
                                            syncStatus: 'Sincronizado'
                                        });
                                    } else {
                                        console.log(`✨ No existing customer found. Creating in TI...`);
                                        await tramitacaoService.createCustomer(chat.id, {
                                            name: data.name || chat.contactName,
                                            cpf_cnpj: data.cpf || chat.cpf,
                                            email: data.email || chat.email
                                        });
                                    }

                                    if (finalNotes) {
                                        await tramitacaoService.upsertNote(chat.id, finalNotes).catch(e =>
                                            console.error('❌ Failed to push initial note:', e.message)
                                        );
                                    }
                                } catch (e) {
                                    console.error('❌ TI Auto-sync error:', e.message);
                                }
                            } else if (finalNotes && chat.tramitacaoCustomerId) {
                                // Regular note update if already synced
                                await tramitacaoService.upsertNote(chat.id, finalNotes).catch(e =>
                                    console.error('❌ Failed to auto-sync note to TI:', e.message)
                                );
                            }

                            // 📋 Trello Integration: Create card on finalization
                            if (data.triageStatus === 'finalizada' || data.triageStatus === 'encerrada_etica') {
                                console.log('📋 Turn is final. Triggering Trello card creation...');
                                const trelloService = require('../Trello/trello.service');
                                // Refetch chat to ensure we have the latest IDs and fields
                                await chat.reload();
                                await trelloService.createTrelloCard(chat.id).catch(e =>
                                    console.error('❌ Failed to create Trello card:', e.message)
                                );
                            }

                            if (io) io.emit('chat_updated', chat.get({ plain: true }));

                            // Push tool result to messages with details
                            currentMessages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                name: 'update_customer_data',
                                content: `Updated fields: ${Object.keys(data).join(', ')}. Data saved successfully.`
                            });

                            // Inject SYSTEM instruction if status just changed to FINALIZED
                            if (oldStatus !== 'finalizada' && data.triageStatus === 'finalizada') {
                                console.log('🎯 Status changed to FINALIZED. Injecting specific response instruction.');
                                currentMessages.push({
                                    role: 'system',
                                    content: `STATUS CHANGED TO FINALIZED. 
                                    Send IMMEDIATE EXACT message to user:
                                    "Prontinho! Seu cadastro inicial foi finalizado com sucesso e já encaminhei tudo para a Drª Sheila.
                                    
                                    A partir de agora, continuo por aqui para tirar suas dúvidas enquanto você aguarda o atendimento humano. Se quiser saber sobre algum processo, basta perguntar 'consultar processo' que eu verifico para você!"`
                                });
                            }

                        } catch (e) {
                            console.error('Error in tool execution (update_customer_data):', e);
                        }
                    } else if (toolCall.function.name === 'get_process_status') {
                        try {
                            console.log(`🔍 AI requested process status for Chat ${chatId}`);
                            const dossier = await tramitacaoService.getDossier(chatId);

                            currentMessages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                name: 'get_process_status',
                                content: JSON.stringify(dossier)
                            });
                        } catch (e) {
                            console.error('Error in tool execution (get_process_status):', e.message);
                            currentMessages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                name: 'get_process_status',
                                content: `Error: ${e.message}. Inform the customer that their case is not yet linked or there was a connection issue with the portal.`
                            });
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
