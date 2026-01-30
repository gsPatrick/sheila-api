require('dotenv').config();
const tramitacaoService = require('./src/features/TramitacaoInteligente/tramitacaoInteligente.service');

// Helper to generate a random 11-digit string (simulating CPF)
function generateRandomCPF() {
    let cpf = '';
    for (let i = 0; i < 11; i++) {
        cpf += Math.floor(Math.random() * 10);
    }
    return cpf;
}

async function testTICreation() {
    console.log('🧪 Starting Tramitação Inteligente Creation Test...');

    const existingCPF = '86931844580';
    const randomCPF = generateRandomCPF();

    // 1. Test Existing CPF
    console.log(`\n[TEST 1] Creating user with EXISTING CPF: ${existingCPF}`);
    try {
        // Checking if user exists first logic is usually in the service, 
        // but here we are calling createCustomer directly to see API response.
        // We need a dummy chatId for the service call (it uses it for logging/error handling usually)
        const dummyChatId = 'TEST-CHAT-001';

        await tramitacaoService.createCustomer(dummyChatId, {
            name: 'Teste Existente',
            cpf_cnpj: existingCPF,
            email: 'teste@existente.com'
        });
        console.log('✅ TEST 1 Result: Success (Unexpected if strict unique constraint)');
    } catch (error) {
        console.log(`❌ TEST 1 Result: Failed (Expected if unique). Error: ${error.message}`);
        if (error.response) {
            console.log('   API Response:', error.response.data);
        }
    }

    // 2. Test Random CPF
    console.log(`\n[TEST 2] Creating user with RANDOM CPF: ${randomCPF}`);
    try {
        const dummyChatId = 'TEST-CHAT-002';

        await tramitacaoService.createCustomer(dummyChatId, {
            name: 'Teste Aleatorio',
            cpf_cnpj: randomCPF,
            email: 'teste@aleatorio.com'
        });
        console.log('✅ TEST 2 Result: Success (Placeholder CPF works)');
    } catch (error) {
        console.log(`❌ TEST 2 Result: Failed. Error: ${error.message}`);
        if (error.response) {
            console.log('   API Response:', error.response.data);
        }
    }
}

testTICreation();
