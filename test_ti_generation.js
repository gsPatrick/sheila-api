const tiAutomationService = require('./src/features/TramitacaoInteligente/tiAutomation.service');
const { Chat } = require('./src/models');
require('dotenv').config();

async function testFullGeneration() {
    try {
        const chat = await Chat.findByPk('0b52595f-53c7-4475-a29f-8acb6e8bce87');

        if (!chat) {
            console.error('❌ Test client not found in DB.');
            process.exit();
        }

        console.log(`🚀 Starting full generation for ${chat.contactName}...`);
        const result = await tiAutomationService.generateFullPackage(chat);

        console.log('✅ SUCCESS!');
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('❌ Generation failed.');
        console.error(e.message);
    } finally {
        process.exit();
    }
}

testFullGeneration();
