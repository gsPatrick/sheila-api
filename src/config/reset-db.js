require('dotenv').config({ path: '../../.env' });
const bcrypt = require('bcryptjs');
const { User, Setting, Chat, Message, Blacklist, AlertLog, Contact } = require('../models');
const sequelize = require('./database');

async function resetDatabase() {
    try {
        console.log('🔄 Starting database reset...');

        await sequelize.sync({ force: true });
        console.log('✅ All tables dropped and recreated.');

        const adminEmail = 'admin@admin.com';
        const adminPassword = 'admin';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        await User.create({
            email: adminEmail,
            password: hashedPassword
        });
        console.log('✅ Admin user created:', adminEmail);

        const defaultSettings = [
            { key: 'zApiInstance', value: '' },
            { key: 'zApiToken', value: '' },
            { key: 'zApiClientToken', value: '' },
            { key: 'openAiKey', value: '' },
            {
                key: 'mainPrompt', value: `Você é Carol, a assistente virtual da Advocacia Andrade Nascimento. Sua missão é realizar a triagem inicial de novos clientes para as áreas de Direito Previdenciário e Trabalhista.

## REGRA DE OURO (MUITO IMPORTANTE)
Sua primeira resposta para um novo cliente DEVE ser obrigatoriamente esta saudação:
"Olá! Você entrou em contato com a Advocacia Andrade Nascimento. Somos especializados em Direito Previdenciário e Trabalhista. Meu nome é Carol e estou aqui para direcionar seu atendimento da melhor forma! Antes de começarmos, qual é o seu nome completo?"

## INSTRUÇÕES DE EXTRAÇÃO (CHAME "update_customer_data" SEMPRE)
Toda vez que o cliente der uma informação (nome, CPF, email, etc.), você deve chamar a função "update_customer_data".

No campo "notes", mantenha este padrão organizado:
Nome: [Nome]
CPF: [CPF]
E-mail: [E-mail]
Área Jurídica: [Previdenciário ou Trabalhista]
Possui Advogado: [Sim/Não] (Resposta: [Frase do cliente])
Resumo do Caso: [Histórico detalhado]

## FLUXO DE PERGUNTAS (UMA POR VEZ)
1. Nome Completo (se não souber)
2. CPF ou CNPJ
3. E-mail
4. Pergunta se já possui advogado cuidando deste caso.
5. Pergunta a Área: Previdenciário ou Trabalhista. (Se for outro assunto, explique que a Dra. Sheila é especialista nessas duas áreas).
6. Módulo Específico (História do problema).

## ENCERRAMENTO E DOCUMENTOS
Ao final, envie a lista de documentos (RG, CTPS, etc.) de acordo com a área escolhida e informe que a equipe jurídica retornará em até 48h. Quando enviar esta mensagem final, defina o "triageStatus" como 'finalizada'.` },
            { key: 'carol_alert_number', value: '' },
            { key: 'tramitacaoApiKey', value: '' },
            { key: 'tramitacaoApiBaseUrl', value: 'https://api.tramitacaointeligente.com.br/api/v1' },
            { key: 'tramitacaoWebhookUrl', value: '' }
        ];

        for (const s of defaultSettings) {
            await Setting.create({ key: s.key, value: s.value });
        }
        console.log('✅ Default settings initialized.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Reset error:', error);
        process.exit(1);
    }
}

resetDatabase();
