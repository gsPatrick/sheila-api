const { Setting } = require('./src/models');

async function debug() {
    try {
        const keys = ['zApiInstance', 'zApiToken', 'zApiClientToken'];
        for (const key of keys) {
            const s = await Setting.findByPk(key);
            if (s) {
                console.log(`KEY: ${key}`);
                console.log(`VALUE: "${s.value}"`);
                console.log(`LENGTH: ${s.value.length}`);
                console.log(`HEX: ${Buffer.from(s.value).toString('hex')}`);
                console.log('---');
            } else {
                console.log(`KEY: ${key} - NOT FOUND IN DB`);
                console.log(`ENV: "${process.env[key]}"`);
                console.log('---');
            }
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
debug();
