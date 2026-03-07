const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SyncedCustomer = sequelize.define('SyncedCustomer', {
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
    cpf: {
        type: DataTypes.STRING,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true
    },
    tramitacaoCustomerId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    syncedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'SyncedCustomers',
    timestamps: false
});

module.exports = SyncedCustomer;
