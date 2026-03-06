const axios = require('axios');
const { Setting } = require('./src/models');
require('dotenv').config();

const key = process.env.TRELLO_KEY;
const token = process.env.TRELLO_TOKEN;
const boardName = 'Sheila Araujo- Advocacia Especializada';

async function createNewBoard() {
    try {
        console.log(`🚀 Creating new board: ${boardName}...`);
        const boardRes = await axios.post('https://api.trello.com/1/boards/', null, {
            params: {
                key,
                token,
                name: boardName,
                defaultLists: false // We want to create our own
            }
        });

        const boardId = boardRes.data.id;
        console.log(`✅ Board created! ID: ${boardId}`);

        console.log('📝 Creating "TRIAGEM" list...');
        const listRes = await axios.post(`https://api.trello.com/1/boards/${boardId}/lists`, null, {
            params: {
                key,
                token,
                name: 'TRIAGEM',
                pos: 'top'
            }
        });

        const listId = listRes.data.id;
        console.log(`✅ List "TRIAGEM" created! ID: ${listId}`);

        // Update database settings
        console.log('💾 Updating system settings...');
        await Setting.upsert({ key: 'trelloBoardId', value: boardId });
        await Setting.upsert({ key: 'trelloListId', value: listId });

        console.log('\n✨ All set! Trello is now configured to the new board.');
        console.log(`🔗 Board URL: ${boardRes.data.shortUrl}`);

    } catch (e) {
        console.error('❌ Error creating board:', e.response?.status, e.response?.data || e.message);
    }
}

createNewBoard();
