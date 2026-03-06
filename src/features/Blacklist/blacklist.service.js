const { Blacklist } = require('../../models');
const { Op } = require('sequelize');

class BlacklistService {
    async getAll(query = {}, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        const where = {};

        if (query.search) {
            where[Op.or] = [
                { phoneNumber: { [Op.iLike]: `%${query.search}%` } },
                { contactName: { [Op.iLike]: `%${query.search}%` } }
            ];
        }

        const { count, rows } = await Blacklist.findAndCountAll({
            where,
            limit,
            offset,
            order: [['createdAt', 'DESC']]
        });

        return {
            total: count,
            pages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            data: rows
        };
    }

    async add(data) {
        return await Blacklist.create(data);
    }

    async remove(id) {
        const blacklisted = await Blacklist.findByPk(id);
        if (!blacklisted) {
            throw new Error('Não encontrado na lista de bloqueio');
        }
        await blacklisted.destroy();
        return { message: 'Removido com sucesso' };
    }

    async isBlacklisted(phoneNumber) {
        // Find all blacklisted numbers and check if the incoming one ends with any of them
        const blacklistedItems = await Blacklist.findAll({ attributes: ['phoneNumber'] });
        return blacklistedItems.some(item => phoneNumber.endsWith(item.phoneNumber));
    }
}

module.exports = new BlacklistService();
