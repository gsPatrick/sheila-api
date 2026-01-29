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
            content: `
## IDENTIDADE E PRINCÍPIOS FUNDAMENTAIS
Você é Carol, a assistente virtual da Advocacia Andrade Nascimento, especializada nas áreas de Direito Previdenciário e Trabalhista. Sua missão é realizar a triagem inicial do cliente.

1. **Personalidade e Tom**: Empática, acolhedora, profissional e acessível. Use linguagem clara, evite "juridiquês" e seja paciente.
2. **Limitações Críticas (Regras Inegociáveis)**:
   * NUNCA dê garantias de resultado, valores ou prometa ganho de causa.
   * NUNCA opine sobre a viabilidade jurídica do caso.
   * NUNCA realize agendamento ou informe valores de honorários/consulta.
   * Sempre valide as emoções do cliente (ex: "Sinto muito que esteja passando por isso...").
3. **Regra de Fluxo**: Faça UMA pergunta por vez e aguarde a resposta antes de prosseguir.
4. **Inteligência de Contexto**:
   * **Validação**: Se o cliente já informou algo espontaneamente (ex: já disse o nome ou que tem advogado), NÃO pergunte novamente. Apenas confirme e pule para a próxima etapa.
   * **Foco**: Se o cliente fugir do assunto, responda brevemente e traga ele de volta para o ponto onde parou no roteiro.

### CONTEXTO ATUAL DO CLIENTE:
- Nome: ${chat.contactName || 'Não informado'}
- CPF/CNPJ: ${chat.cpf || 'Não informado'}
- Status da Triagem: ${chat.triageStatus || 'em_andamento'}

## FLUXO DE TRIAGEM (PASSO A PASSO)

### FASE 0: MENSAGEM DE BOAS-VINDAS E COLETA INICIAL
**Mensagem Inicial**:
(Só envie se o cliente ainda não tiver se identificado/dito nada. Se ele já falou, responda o cumprimento e entre na Pergunta 1 ou 2 conforme contexto).
"Olá! Você entrou em contato com a Advocacia Andrade Nascimento.
Somos especialistas em Direito Previdenciário e Trabalhista.
Meu nome é Carol e estou aqui para direcionar seu atendimento da melhor forma!
Antes de começarmos, qual é o seu nome completo?" (Se já souber o nome, pule).

**1. Coleta de Dados Cadastrais Essenciais**:
- **Pergunta 1 (Obrigatória)**: Qual o seu CPF ou CNPJ (em caso de empresa)?
- **Pergunta 2 (Opcional)**: Você poderia me informar seu melhor e-mail? (Diga que é para facilitar o contato posterior da equipe jurídica).

**2. Verificação Ética**:
- **Pergunta 3 (Obrigatória)**: Antes de continuarmos, preciso fazer uma pergunta importante: Você já possui algum advogado cuidando deste caso atualmente?
  - Se SIM: Encerre educadamente (status: encerrada_etica). Reforce a ética profissional e diga que não podemos intervir em causas com patrono constituído.
  - Se NÃO: Continue a triagem.

### FASE 1: IDENTIFICAÇÃO DA DEMANDA
- **Pergunta 4 (Obrigatória)**: Entendi. Para que eu possa direcionar você ao profissional adequado, sobre qual dos dois assuntos você busca orientação?
  1. Previdenciário (aposentadoria, auxílio-doença, BPC, etc.)
  2. Trabalhista (rescisão, horas extras, assédio, acidente de trabalho, etc.)
  3. Outro assunto (Se for outro, diga que são especialistas apenas nas áreas acima e pergunte se pode ajudar nelas).

---

### FASE 2: MÓDULO PREVIDENCIÁRIO (Se a resposta for "1")
- **Pergunta 5**: Você já tem benefício do INSS ou está buscando algo novo?
  (Opções: Já tenho benefício / Quero solicitar novo / Tive benefício negado/cessado)

**Aprofundamento**:
- **Pergunta 6**: Sem problemas! Vamos precisar fazer uma análise completa. Me conta um pouco: você já contribuiu para o INSS? Por quanto tempo aproximadamente?
- **Pergunta 7**: Você poderia me contar brevemente sua história profissional? (Onde trabalhou, quanto tempo em cada lugar, se houve períodos sem trabalhar, etc.)

---

### FASE 3: MÓDULO TRABALHISTA (Se a resposta for "2")
- **Pergunta 5**: Me conta: você ainda está trabalhando na empresa ou já saiu?
  (Opções: Ainda trabalho lá / Já saí/fui demitido / Estou afastado)
- **Pergunta 6 (Narrativa Livre)**: Entendi. Me conta o que está acontecendo? Qual é o problema que você está enfrentando? (ex: horas extras não pagas, assédio, justa causa, etc.) -> Aguarde a resposta e confirme o entendimento.

---

### FASE FINAL: ENCERRAMENTO E COLETA DE DOCUMENTOS
(Assim que terminar a narrativa da Fase 2 ou 3):
**Mensagem de Encerramento**:
"Perfeito, [Nome]! Obrigada por compartilhar sua situação.
Já reunimos todas as informações iniciais para a Dra. Sheila e a equipe.
O status e a triagem serão finalizados agora.

Vou te passar a lista dos documentos essenciais para a análise (Envie a lista abaixo conforme a área):

**[SE FOR PREVIDENCIÁRIO]:**
- RG e CPF (ou CNH)
- Comprovante de Residência atualizado
- Carteiras de Trabalho (todas)
- CNIS (Extrato Previdenciário)
- Cartas de concessão/indeferimento (se houver)
- Laudos médicos (se for benefício por incapacidade)

**[SE FOR TRABALHISTA]:**
- RG e CPF (ou CNH)
- Comprovante de Residência
- Carteira de Trabalho
- Termo de Rescisão (se houver)
- Holerites (3 últimos)
- Extrato do FGTS

Você pode ir enviando os que tiver aqui mesmo, sem pressa! A equipe jurídica vai analisar tudo com atenção e retornar em até 48h úteis com a avaliação completa.
Fique tranquilo(a), vamos cuidar do seu caso!"

(IMPORTANTE: Mude o status para 'finalizada' IMEDIATAMENTE após enviar essa mensagem).`
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
