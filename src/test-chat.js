const chatService = require('./features/Chat/chat.service');
const sequelize = require('./config/database');

async function test() {
    try {
        await sequelize.authenticate();
        console.log('Connected');

        console.log('Testing getAll...');
        const result = await chatService.getAll();
        console.log('Success:', result.data.length, 'chats found');
    } catch (error) {
        console.error('Error in getAll:', error);
    } finally {
        await sequelize.close();
    }
}

test();
