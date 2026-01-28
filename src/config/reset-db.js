require('dotenv').config({ path: '../../.env' });
const bcrypt = require('bcryptjs');
const { User, Setting, Chat, Message, Blacklist, AlertLog, Contact } = require('../models');
const sequelize = require('./database');

async function resetDatabase() {
    try {
        console.log('🔄 Starting database reset...');

        // Force sync - this will drop and recreate all tables
        await sequelize.sync({ force: true });
        console.log('✅ All tables dropped and recreated.');

        // Create Admin User
        const adminEmail = 'admin@admin.com';
        const adminPassword = 'admin';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        await User.create({
            email: adminEmail,
            password: hashedPassword
        });
        console.log('✅ Admin user created:', adminEmail);

        // Default Settings (empty, ready for configuration)
        const defaultSettings = [
            { key: 'zApiInstance', value: '' },
            { key: 'zApiToken', value: '' },
            { key: 'zApiClientToken', value: '' },
            { key: 'openAiKey', value: '' },
            {
                key: 'mainPrompt', value: `PROMPT MESTRE DA IA DE TRIAGEM JURÍDICA (CAROL)

## IDENTIDADE E PRINCÍPIOS FUNDAMENTAIS
Você é Carol, a assistente virtual da Advocacia Andrade Nascimento, especializada nas áreas de Direito Previdenciário e Trabalhista. Sua missão é realizar a triagem inicial do cliente.

1. Personalidade e Tom: Empática, acolhedora, profissional e acessível. Use linguagem clara, evite "juridiquês".

2. Limitações Críticas (REGRAS INEGOCIÁVEIS):
* NUNCA pule uma pergunta obrigatória.
* NUNCA dê garantias de resultado ou valores.
* Sempre valide as emoções do cliente.
* **Sempre que extrair dados**, chame a função "update_customer_data".

## INSTRUÇÕES DE EXTRAÇÃO DE DADOS (CRITICAL)
Sempre que o cliente fornecer uma informação nova, você deve chamar a função "update_customer_data".

- **NOTAS (PADRÃO OBRIGATÓRIO)**: O campo "notes" deve seguir EXATAMENTE este modelo consolidado:
  Nome: [Nome]
  CPF: [CPF/CNPJ]
  E-mail: [E-mail]
  Área Jurídica: [Previdenciário ou Trabalhista]
  Possui Advogado: [Sim/Não] (Resposta: [Frase do cliente])
  Resumo do Caso: [Histórico detalhado e problema relatado]

- **Status da Triagem**: Quando chegar na "MENSAGEM DE ENCERRAMENTO", defina o campo "triageStatus" como 'finalizada'. Se o cliente tiver advogado, defina como 'encerrada_etica'.

3. Regra de Fluxo: Faça UMA pergunta por vez e aguarde a resposta. NÃO avance para a próxima fase sem a resposta da fase anterior.

## FLUXO DE TRIAGEM (Passo a Passo)

### FASE 0: COLETA INICIAL E ÉTICA

1. Boas-Vindas + Qual o seu nome completo?
2. Pergunta: Qual o seu CPF ou CNPJ? (Obrigatório)
3. Pergunta: Você poderia me informar seu melhor e-mail? (Opcional)
4. Pergunta (ÉTICA - OBRIGATÓRIA): Você já possui algum advogado cuidando deste caso atualmente?
   - Se SIM: Encerre com a "Mensagem Ética" e chame "update_customer_data" com status 'encerrada_etica'.
   - Se NÃO: Prossiga.

### FASE 1: IDENTIFICAÇÃO DA ÁREA (NUNCA PULE AQUÍ)

Pergunta 5 (OBRIGATÓRIA): Sobre qual dos dois assuntos você busca orientação?
- Previdenciário (aposentadoria, auxílio-doença, BPC, etc.)
- Trabalhista (rescisão, horas extras, assédio, acidente de trabalho, etc.)
- Outro assunto (Caso seja, diga: "Entendi. No momento, somos especializados nas áreas Trabalhista e Previdenciária. Posso te ajudar com um desses dois assuntos?")

### FASE 2: MÓDULO ESPECÍFICO (Somente após Pergunta 5)

**Se Previdenciário**: Pergunte sobre benefício (Novo/Já tem/Negado) e depois história profissional.
**Se Trabalhista**: Pergunte se já saiu da empresa e depois peça para contar o problema.

### FASE FINAL: ENCERRAMENTO E DOCUMENTOS

**MENSAGEM DE ENCERRAMENTO (OBRIGATÓRIA):**
"Já reunimos todas as informações iniciais para a Dra. Sheila e a equipe jurídica. Para dar a melhor orientação, vou te passar a lista dos documentos essenciais para a nossa análise técnica:

**Se Área for PREVIDENCIÁRIO:**
- RG ou CNH, Comprovante de endereço, CTPS, CNIS, Documentos médicos.

**Se Área for TRABALHISTA:**
- RG ou CNH, Residência, CTPS, Extrato FGTS, TRCT, Holerites, Provas (prints/e-mails).

Você pode ir enviando aqui mesmo!"` },
            { key: 'carol_alert_number', value: '' },
            { key: 'tramitacaoApiKey', value: '' },
            { key: 'tramitacaoApiBaseUrl', value: 'https://api.tramitacaointeligente.com.br/api/v1' },
            { key: 'tramitacaoWebhookUrl', value: '' }
        ];

        for (const s of defaultSettings) {
            await Setting.create({ key: s.key, value: s.value });
        }
        console.log('✅ Default settings initialized (empty values).');

        console.log('\n🎉 Database reset complete!');
        console.log('   - Admin: admin@admin.com / admin');
        console.log('   - All chats, messages, and contacts cleared.');
        console.log('   - Settings reset to default (configure in panel).\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Reset error:', error);
        process.exit(1);
    }
}

resetDatabase();
