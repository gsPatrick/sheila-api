const { Setting } = require('./src/models');

async function check() {
    try {
        const s = await Setting.findByPk('mainPrompt');
        if (s) {
            console.log('MAIN PROMPT IN DB:');
            console.log('-------------------');
            console.log(s.value);
            console.log('-------------------');
            console.log('LENGTH:', s.value.length);
        } else {
            console.log('mainPrompt NOT FOUND IN DB');
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
