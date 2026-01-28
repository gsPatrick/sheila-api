const { Blacklist } = require('./src/models');
const { Op } = require('sequelize');

async function unblock() {
    const number = '968070834'; // Search term
    try {
        const results = await Blacklist.findAll({
            where: {
                phoneNumber: {
                    [Op.like]: `%${number}%`
                }
            }
        });

        if (results.length === 0) {
            console.log('Número não encontrado na lista de bloqueio.');
        } else {
            for (const item of results) {
                console.log(`Removendo: ${item.phoneNumber} (${item.contactName || 'Sem nome'})`);
                await item.destroy();
            }
            console.log('✅ Número(s) removido(s) com sucesso.');
        }
    } catch (error) {
        console.error('Erro ao acessar o banco:', error.message);
    } finally {
        process.exit();
    }
}

unblock();
