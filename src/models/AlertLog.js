const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AlertLog = sequelize.define('AlertLog', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    processNumber: {
        type: DataTypes.STRING,
        allowNull: true
    },
    body: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    link: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    ChatId: {
        type: DataTypes.UUID,
        allowNull: true
    },
    rawPayload: {
        type: DataTypes.JSONB,
        allowNull: true
    }
});

module.exports = AlertLog;
