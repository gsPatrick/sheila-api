const { Chat, Message } = require('./src/models');
const sequelize = require('./src/config/database');

async function resetSystem() {
    console.log('🔄 Starting Full System Reset and AI Activation...');

    // We use a transaction to ensure atomic reset
    const transaction = await sequelize.transaction();

    try {
        // 1. Activate AI for all and reset triage status/notes
        const [updatedCount] = await Chat.update(
            {
                isAiActive: true,
                triageStatus: 'em_andamento',
                notes: null,
                area: null,
                hasLawyer: null,
                lawyerResponse: null,
                email: null,
                cpf: null,
                syncStatus: 'Pendente',
                tramitacaoCustomerId: null,
                tramitacaoCustomerUuid: null
            },
            {
                where: {},
                transaction
            }
        );

        console.log(`✅ Activated AI and reset triage for ${updatedCount} chats.`);

        // Optional: Delete previous messages if a TRUE reset is desired.
        // For now, we'll keep history to avoid data loss, 
        // but the 'triageStatus' reset will make Carol start from Phase 0.

        await transaction.commit();
        console.log('✨ System successfully reset across all users.');
        process.exit(0);
    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error('❌ Error during system reset:', error);
        process.exit(1);
    }
}

resetSystem();
