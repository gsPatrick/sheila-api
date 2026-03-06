const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Blacklist = sequelize.define('Blacklist', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    phoneNumber: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    reason: {
        type: DataTypes.STRING,
        allowNull: true
    },
    contactName: {
        type: DataTypes.STRING,
        allowNull: true
    }
});

module.exports = Blacklist;
