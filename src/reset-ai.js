const { Chat } = require('./models');

async function reset() {
    try {
        console.log('Reativando IA para todos os chats...');
        const result = await Chat.update({ isAiActive: true }, { where: {} });
        console.log(`Sucesso! ${result[0]} chats atualizados.`);
        process.exit(0);
    } catch (error) {
        console.error('Erro ao resetar:', error);
        process.exit(1);
    }
}

reset();
