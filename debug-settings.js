const { Setting } = require('./src/models');
const fs = require('fs');

async function checkSettings() {
    try {
        const settings = await Setting.findAll();
        console.log('--- Database Settings ---');
        settings.forEach(s => {
            console.log(`${s.key}: ${s.value ? s.value.substring(0, 5) + '...' : 'EMPTY'}`);
        });
        console.log('-------------------------');
        process.exit(0);
    } catch (error) {
        console.error('Error checking settings:', error);
        process.exit(1);
    }
}

checkSettings();
