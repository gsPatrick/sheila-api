const { Chat, Message, Setting } = require('./src/models');
const trelloService = require('./src/features/Trello/trello.service');
require('dotenv').config();

async function syncExistingToTrello() {
    console.log('🔍 Fetching chats to sync to Trello...');

    const chats = await Chat.findAll({
        where: {
            triageStatus: ['finalizada', 'encerrada_etica']
        }
    });

    console.log(`📋 Found ${chats.length} finalized chats. Starting sync...`);

    for (const chat of chats) {
        try {
            console.log(`⏳ Syncing ${chat.contactName} (${chat.contactNumber})...`);

            // Check if card already exists
            const existingCard = await trelloService.findTrelloCard(chat.contactNumber);

            if (existingCard) {
                console.log(`ℹ️ Card already exists for ${chat.contactName}. Adding latest messages as comments...`);

                const messages = await Message.findAll({
                    where: { ChatId: chat.id },
                    limit: 5,
                    order: [['timestamp', 'DESC']]
                });

                for (const msg of messages.reverse()) {
                    if (!msg.isFromMe) {
                        await trelloService.addComment(existingCard.id, msg.body);
                    }
                }
            } else {
                console.log(`✨ Creating new card for ${chat.contactName}...`);
                await trelloService.createTrelloCard(chat.id);
            }
        } catch (error) {
            console.error(`❌ Error syncing chat ${chat.id}:`, error.message);
        }
    }

    console.log('✅ Sync completed.');
    process.exit(0);
}

syncExistingToTrello().catch(err => {
    console.error('❌ Sync failed:', err);
    process.exit(1);
});
