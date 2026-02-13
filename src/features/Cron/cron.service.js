const cron = require('node-cron');
const { Chat, Message } = require('../../models');
const { Op } = require('sequelize');

class CronService {
    init() {
        console.log('⏰ Initializing Cron Jobs...');

        // Schedule for 00:00 (Midnight) every day
        // Format: Minute Hour Day Month DayOfWeek
        cron.schedule('0 0 * * *', async () => {
            console.log('🕛 Running Daily Reset Job (Midnight)...');
            await this.resetDailyChats();
        }, {
            scheduled: true,
            timezone: "America/Sao_Paulo"
        });

        console.log('✅ Cron Jobs scheduled.');
    }

    async resetDailyChats() {
        try {
            console.log('🔄 Resetting chat states for a new day...');

            // 1. Reset AI Status and Welcome Flag for ALL chats
            // This ensures everyone gets a fresh "Bom dia" flow next time
            const result = await Chat.update({
                isAiActive: true,
                isWelcomeSent: false,
                triageStatus: 'em_andamento'
                // We do NOT delete messages here to preserve history for analytics/safety.
                // The "limpar histórico" usually means "reset context" for the bot.
            }, {
                where: {
                    // Update ALL or filter? Usually all for a daily reset system.
                    // We can safeguard to only update those modified > 24h ago if needed, 
                    // but "diariamente" implies everyone.
                    id: { [Op.ne]: null }
                }
            });

            console.log(`✅ Daily Reset Complete. Updated ${result} chats.`);

        } catch (error) {
            console.error('❌ Error in Daily Reset Job:', error);
        }
    }
}

module.exports = new CronService();
