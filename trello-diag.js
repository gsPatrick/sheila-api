const axios = require('axios');
const key = 'SUA_CHAVE_AQUI';
const token = 'SEU_TOKEN_AQUI';

async function diag() {
    try {
        console.log('🔍 Testing credentials...');
        const res = await axios.get(`https://api.trello.com/1/members/me/boards`, {
            params: { key, token, fields: 'name' }
        });
        console.log('✅ Success! Boards found:');
        res.data.forEach(b => console.log(`- ${b.name} (ID: ${b.id})`));

        if (res.data.length > 0) {
            const firstBoardId = res.data[0].id;
            console.log(`\n🔍 Fetching lists for board: ${res.data[0].name}...`);
            const listsRes = await axios.get(`https://api.trello.com/1/boards/${firstBoardId}/lists`, {
                params: { key, token, fields: 'name' }
            });
            listsRes.data.forEach(l => console.log(`  - ${l.name} (ID: ${l.id})`));
        }
    } catch (e) {
        console.error('❌ Failed:', e.response?.status, e.response?.data || e.message);
    }
}

diag();
