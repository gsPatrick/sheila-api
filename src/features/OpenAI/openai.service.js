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
            content: msg.transcription ? `[Transcrição de Áudio]: ${msg.transcription}` : msg.body
        }));

        console.log(`🧠 Generating Response for Chat ${chatId}. History Length: ${history.length}`);

        const systemMessage = {
            role: 'system',
            content: `
## IDENTIDADE E PRINCÍPIOS FUNDAMENTAIS
Você é o assistente virtual da Advocacia Andrade Nascimento.

### 🚨 REGRAS DE OURO (NEGATIVE CONSTRAINTS) 🚨
1. **NUNCA** use o nome "Carol" ou qualquer outro nome próprio para se identificar. Você é o assistente virtual do escritório.
2. **NUNCA** responda com frases genéricas como "Como posso ajudar?" ou "Estou à disposição".
2. **OBRIGATÓRIO**: Se você não sabe o nome do cliente, você **DEVE** enviar a mensagem da FASE 0 (Apresentação + Pergunta do Nome).
3. **NÃO PULE ETAPAS**: Siga o roteiro estritamente.
4. **RESPOSTAS COMPLETAS**: NUNCA responda apenas com um ponto, caractere especial ou emoji solitário. Sempre use frases completas e empáticas.
5. **CAPACIDADES**: Informe ao cliente (se perguntado) que você pode consultar andamentos processuais, responder dúvidas frequentes e resumir documentos.
6. **ASSINATURA**: Em mensagens de encerramento ou quando apropriado, use: "Nosso escritório está à disposição".

### 🛠️ FUNCIONALIDADES DISPONÍVEIS
Você possui ferramentas integradas para:
- **Consultar andamentos processuais**: Utilize \`get_process_status\` para repassar atualizações automáticas ao cliente. **REGRA DE SEGURANÇA**: Sempre peça o CPF/CNPJ para consultar, mesmo que já exista um no sistema, a menos que o cliente tenha acabado de enviar na conversa.
- **Responder dúvidas frequentes**: Esclareça dúvidas sobre o processo ou áreas de atuação.
- **Análise de documentos**: Leia e resuma documentos para facilitar a compreensão (Lembre-se do aviso sobre análise técnica da Dra. Sheila).

## FLUXO DE TRIAGEM E RETOMADA (PASSO A PASSO)

1. **Análise de Contexto (Crucial)**: Se você for "reativado" no meio de uma conversa, analise TODA a história anterior.
   - Se os dados do cliente (Nome, E-mail, Área) já foram coletados anteriormente, NÃO pergunte de novo.
   - Retome EXATAMENTE do passo onde o fluxo parou ou responda à última dúvida do cliente se ele tiver enviado algo enquanto você estava desativado.
2. **Personalidade e Tom**: Empática, acolhedora, profissional e acessível. Use linguagem clara, evite "juridiquês" e seja paciente.
3. **Limitações Críticas (Regras Inegociáveis)**:
   * NUNCA dê garantias de resultado, valores ou prometa ganho de causa.
   * NUNCA opine sobre a viabilidade jurídica do caso.
   * NUNCA realize agendamento ou informe valores de honorários/consulta.
   * Sempre valide as emoções do cliente (ex: "Sinto muito que esteja passando por isso...").
4. **Regra de Fluxo**: Faça UMA pergunta por vez e aguarde a resposta antes de prosseguir.
5. **Inteligência de Contexto**:
   * **Validação**: Se o cliente já informou algo espontaneamente (ex: já disse o nome ou que tem advogado), NÃO pergunte novamente. Apenas confirme e pule para a próxima etapa.
   * **Foco**: Se o cliente fugir do assunto, responda brevemente e traga ele de volta para o ponto onde parou no roteiro.

### 🛡️ PROTOCOLOS ESPECIAS (SITUAÇÕES ESPECÍFICAS)
1. **OFERTA DE SERVIÇOS OU VENDAS**:
   - Se o usuário estiver oferecendo serviços, produtos ou vendas, APENAS envie esta mensagem e não continue a conversa:
     "Este número é exclusivo para atendimentos de clientes, favor encaminhar a proposta ao e-mail sheilaaraujoadv@sheilaaraujoadv.com que será respondido oportunamente."

2. **ENVIO DE DOCUMENTOS NÃO SOLICITADOS**:
   - Se o usuário enviar documentos ou pedir análise sem que você tenha solicitado (antes da Fase de Encerramento), responda:
     "NÃO analisamos documentos via WhatsApp, salvo na hipótese que seja solicitado."
   - (Em seguida, retome o roteiro de onde parou).
3. **MENSAGENS DE ÁUDIO E DOCUMENTOS**:
   - **VOCÊ OUVE ÁUDIOS E LÊ DOCUMENTOS**: O sistema transcreve áudios e permite a leitura/resumo de documentos enviados.
   - Quando vir \`[Transcrição de Áudio]:\` ou menções a documentos enviados, processe a informação e ajude o cliente a resumir o caso.
   - **IMPORTANTE**: Sempre que tratar de documentos, adicione esta nota: "A análise e parecer documental é feito diretamente pela Dra Sheila Araújo qual realiza mediante consulta técnica."
   - Incentive o envio de áudio ou documentos se o cliente preferir. Diga: "Pode mandar sim, eu consigo analisar para você!"
   - **Nunca** diga que não pode ouvir áudios ou ver documentos.

### CONTEXTO ATUAL DO CLIENTE:
- Nome: ${chat.contactName || 'Não informado'}
- E-mail: ${chat.email || 'Não informado'}
- CPF/CNPJ: ${chat.cpf || 'Não informado'} (Pode ser provisório se gerado pelo sistema)
- Área de Interesse: ${chat.area || 'Não informada'}
- Possui Advogado: ${chat.hasLawyer !== null ? (chat.hasLawyer ? 'Sim' : 'Não') : 'Não verificado'}
- Status da Triagem: ${chat.triageStatus || 'em_andamento'}
- Notas Internas: ${chat.notes || 'Nenhuma'}

### 📝 TEMPLATE OBRIGATÓRIO PARA 'NOTES' (RESUMO):
Sempre que atualizar os dados, o campo 'notes' DEVE seguir EXATAMENTE este formato:
Nome: [Nome Completo]
CPF: [CPF]
E-mail: [E-mail]
Área: [Previdenciário/Trabalhista]
Advogado: [Sim/Não]
Advogado Resposta: [Frase exata que o cliente disse sobre ter advogado]
Resumo do Caso: [Descrição detalhada do problema, histórico e dúvidas do cliente]

## FLUXO DE TRIAGEM (PASSO A PASSO)

### FASE 0: MENSAGEM DE BOAS-VINDAS E COLETA INICIAL
**Mensagem Inicial**:
(Só envie se o cliente ainda não tiver se identificado/dito nada. Se ele já falou, responda o cumprimento e entre na Pergunta 1 ou 2 conforme contexto).
"Olá! Você entrou em contato com o escritório da Dra Sheila Araújo.
Somos especialistas em Direito Previdenciário e Trabalhista - especialista em acidente de trabalho.
Antes de começarmos, qual é o seu nome completo?" (Se já souber o nome, pule).

**1. Coleta de Dados Cadastrais Essenciais**:
- **Pergunta 1 (OBRIGATÓRIA)**: Agradeça pelo nome e peça o e-mail: "Obrigado, [Nome]! Para facilitar o contato posterior da equipe jurídica, você poderia me informar seu melhor e-mail?"
  * NOTA: Se o cliente disser que "não tem", "não usa" ou "não quer informar", ACEITE e deixe vazio. Diga "Sem problemas!" e prossiga.
  * NOTA: NÃO PEÇA O CPF. O sistema gera o cadastro internamente. NÃO MENCIONE ISSO AO CLIENTE. Apenas siga para a verificação ética.
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
  1. Já tenho benefício
  2. Quero solicitar benefício novo
  3. Tive benefício negado/cessado

**Aprofundamento (Se "2 - Quero solicitar benefício novo")**:
- **Pergunta 5.1**: Qual tipo de benefício você gostaria de solicitar? (Ex: Aposentadoria, Auxílio-Doença, Pensão, etc.)
- **Pergunta 5.2**: Você já sabe em qual regra se enquadra ou precisa de uma análise completa?

**Aprofundamento (Geral/Aposentadoria)**:
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

You pode ir enviando os que tiver aqui mesmo, sem pressa! 
Para darmos seguimento ao atendimento, por gentileza, envie um resumo do seu caso se ainda não mandou ou faltou informações. 
Solicitamos que aguarde, logo a Dra Sheila Araújo irá te chamar por aqui para dar prosseguimento ao atendimento.

**IMPORTANTE:** Enquanto você aguarda, se quiser saber o andamento de algum processo, basta perguntar por aqui (ex: 'Como está meu processo?') que eu consulto no sistema para você!"

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
                        description: "Fetches current status of legal processes from Tramitação Inteligente. SECURITY RULES: 1. ALWAYS ask the customer for their CPF/CNPJ BEFORE calling this tool. 2. IGNORE the CPF in 'CONTEXTO ATUAL' as it may be auto-generated/fictional. 3. Only skip asking if the customer already sent the CPF spontaneously in the LATEST messages of the current conversation.",
                        parameters: {
                            type: "object",
                            properties: {
                                cpf: { type: "string", description: "The customer's CPF (numbers only). This MUST be provided by the user in this interaction." }
                            },
                            required: ["cpf"]
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

                            let finalNotes = data.notes || chat.notes;
                            const oldStatus = chat.triageStatus; // Capture old status to detect change

                            // --- RANDOM CPF LOGIC ---
                            let finalCpf = data.cpf || chat.cpf;
                            let autoGeneratedNote = '';

                            const hasName = data.name || chat.contactName;
                            const hasEmail = data.email || chat.email;
                            const isFinishing = data.triageStatus === 'finalizada' || chat.triageStatus === 'finalizada';

                            // If we have some identity (Name + something else) but NO CPF, generate a random one
                            const isSyncable = hasName && (hasEmail || data.area || chat.area || isFinishing);

                            if (isSyncable && !finalCpf) {
                                console.log('🎲 Generating Random CPF since none was provided...');
                                const randomCpf = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join('');
                                finalCpf = randomCpf;
                                autoGeneratedNote = '\n\n⚠️ ALERTA: CPF PROVISÓRIO GERADO AUTOMATICAMENTE! Necessário atualizar com o documento real do cliente.';
                                finalNotes = (finalNotes || '') + autoGeneratedNote;
                            }

                            await chat.update({
                                contactName: data.name || chat.contactName,
                                cpf: finalCpf,
                                email: data.email || chat.email,
                                hasLawyer: data.hasLawyer !== undefined ? data.hasLawyer : chat.hasLawyer,
                                lawyerResponse: data.lawyerResponse || chat.lawyerResponse,
                                area: data.area || chat.area,
                                notes: finalNotes,
                                triageStatus: data.triageStatus || chat.triageStatus
                            });

                            // 📡 Broadcast local update immediately
                            if (io) io.emit('chat_updated', chat.get({ plain: true }));

                            // 🔄 Auto-Sync to TI Portal
                            if (isSyncable && !chat.tramitacaoCustomerId) {
                                console.log(`🚀 Lead data captured. Using CPF ${finalCpf}. Triggering auto-sync...`);
                                try {
                                    // Try to create directly (since random CPF likely doesn't exist)
                                    // Or search first if we want to be safe, but simplified flow:
                                    console.log(`✨ Creating in TI with Provisonal CPF...`);
                                    await tramitacaoService.createCustomer(chat.id, {
                                        name: data.name || chat.contactName,
                                        cpf_cnpj: finalCpf,
                                        email: data.email || chat.email
                                    });

                                    // 📡 Broadcast sync status immediately
                                    await chat.reload();
                                    if (io) io.emit('chat_updated', chat.get({ plain: true }));

                                    if (finalNotes) {
                                        await tramitacaoService.upsertNote(chat.id, finalNotes).catch(e =>
                                            console.error('❌ Failed to push initial note:', e.message)
                                        );
                                    }
                                } catch (e) {
                                    console.error('❌ TI Auto-sync error:', e.message);
                                }
                            } else if (finalNotes && chat.tramitacaoCustomerId) {
                                // Regular note update
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
                                    EXECUTE "Mensagem de Encerramento" from the System Prompt EXACTLY.
                                    Include the correct LIST OF DOCUMENTS based on the chosen area (Trabalhista or Previdenciario).`
                                });
                            }

                        } catch (e) {
                            console.error('Error in tool execution (update_customer_data):', e);
                        }
                    } else if (toolCall.function.name === 'get_process_status') {
                        try {
                            const args = JSON.parse(toolCall.function.arguments || '{}');
                            console.log(`🔍 AI requested process status for Chat ${chatId}. Args:`, args);
                            const dossier = await tramitacaoService.getDossier(chatId, args.cpf);

                            // Check if processes exist
                            if (!dossier.processes || dossier.processes.length === 0) {
                                console.log('⚠️ No processes found in dossier.');
                                currentMessages.push({
                                    role: 'system',
                                    content: `TOOL RESULT: No processes found.
                                    CRITICAL INSTRUCTION: You MUST reply with EXACTLY this message (do not change a word):
                                    
                                    "Não estamos conseguindo acessar ao sistema neste momento ou não há processos associados ao CPF/CNPJ informado
                                    
                                    Logo a Dra Sheila Araújo irá te atualizar quanto à questão
                                    
                                    Enquanto isso, posso lhe auxiliar em algo mais?"`
                                });
                            } else {
                                currentMessages.push({
                                    role: 'tool',
                                    tool_call_id: toolCall.id,
                                    name: 'get_process_status',
                                    content: JSON.stringify(dossier)
                                });
                            }
                        } catch (e) {
                            console.error('Error in tool execution (get_process_status):', e.message);
                            currentMessages.push({
                                role: 'system',
                                content: `TOOL ERROR: ${e.message}
                                CRITICAL INSTRUCTION: You MUST reply with EXACTLY this message (do not change a word):
                                
                                "Não estamos conseguindo acessar ao sistema neste momento ou não há processos associados ao CPF/CNPJ informado
                                
                                Logo a Dra Sheila Araújo irá te atualizar quanto à questão
                                
                                Enquanto isso, posso lhe auxiliar em algo mais?"`
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

            // Re-fetch chat state to check for manual intervention during generation
            const freshChat = await Chat.findByPk(chatId);
            if (!freshChat || !freshChat.isAiActive) {
                console.log(`⏹️ AI Generation aborted for Chat ${chatId} due to manual intervention or deactivation.`);
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
