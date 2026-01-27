const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Message = sequelize.define('Message', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    body: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    isFromMe: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    audioUrl: {
        type: DataTypes.STRING,
        allowNull: true
    },
    transcription: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: false
    }
});

module.exports = Message;
