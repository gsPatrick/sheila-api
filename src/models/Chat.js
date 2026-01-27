const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Chat = sequelize.define('Chat', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    contactNumber: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    contactName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isAiActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    tramitacaoCustomerId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    tramitacaoCustomerUuid: {
        type: DataTypes.UUID,
        allowNull: true
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true
    },
    cpf: {
        type: DataTypes.STRING,
        allowNull: true
    },
    lastSyncAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    syncStatus: {
        type: DataTypes.STRING,
        defaultValue: 'Pendente' // Pendente, Sincronizado, Erro
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
});

module.exports = Chat;
