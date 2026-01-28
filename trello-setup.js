const { Setting } = require('./src/models');
require('dotenv').config();

async function setupTrello() {
    const settings = [
        { key: 'trelloKey', value: 'SUA_CHAVE_AQUI' },
        { key: 'trelloToken', value: 'SEU_TOKEN_AQUI' },
        { key: 'trelloBoardId', value: '6915fb9030e8fc05258bd575' },
        { key: 'trelloListId', value: '6915fb9030e8fc05258bd56e' }
    ];

    console.log('🚀 Setting up Trello credentials...');

    for (const s of settings) {
        await Setting.upsert(s);
        console.log(`✅ ${s.key} saved.`);
    }

    process.exit(0);
}

setupTrello().catch(err => {
    console.error('❌ Setup failed:', err);
    process.exit(1);
});
