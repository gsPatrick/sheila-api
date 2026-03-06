const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Publication = sequelize.define('Publication', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    processo: {
        type: DataTypes.STRING,
        allowNull: true
    },
    cpfs: {
        type: DataTypes.JSON, // Using JSON to store an array of strings
        allowNull: true
    },
    customerNames: {
        type: DataTypes.JSON, // Array of names corresponding to CPFs
        allowNull: true
    },
    summary: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    prazo: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    acaoNecessaria: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    dataPublicacao: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    fetchedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

module.exports = Publication;
