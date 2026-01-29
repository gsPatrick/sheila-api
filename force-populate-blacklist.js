require('dotenv').config();
const { Blacklist } = require('./src/models');
const sequelize = require('./src/config/database');
const blacklistNumbers = require('./src/config/blacklist_data');

async function run() {
    try {
        console.log('🔌 Connecting to database...');
        await sequelize.authenticate();
        console.log('✅ Connected.');

        if (!blacklistNumbers || blacklistNumbers.length === 0) {
            console.error('❌ No numbers found in blacklist_data.js');
            process.exit(1);
        }

        console.log(`📋 Found ${blacklistNumbers.length} numbers to import.`);

        const entries = blacklistNumbers.map(n => ({
            phoneNumber: n,
            reason: 'Importação Forçada Manual'
        }));

        console.log('💾 Bulk inserting...');
        await Blacklist.bulkCreate(entries, { ignoreDuplicates: true });

        const count = await Blacklist.count();
        console.log(`🎉 Success! Total Blacklist count in DB: ${count}`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

run();
