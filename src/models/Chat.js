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
    },
    hasLawyer: {
        type: DataTypes.BOOLEAN,
        allowNull: true
    },
    lawyerResponse: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    area: {
        type: DataTypes.STRING, // 'previdenciario', 'trabalhista', 'outro'
        allowNull: true
    },
    triageStatus: {
        type: DataTypes.STRING, // 'em_andamento', 'finalizada', 'encerrada_etica'
        defaultValue: 'em_andamento'
    },
    // Dados Expandidos do Portal TI
    phone_1: { type: DataTypes.STRING, allowNull: true },
    phone_2: { type: DataTypes.STRING, allowNull: true },
    country: { type: DataTypes.STRING, allowNull: true },
    state: { type: DataTypes.STRING, allowNull: true },
    city: { type: DataTypes.STRING, allowNull: true },
    neighborhood: { type: DataTypes.STRING, allowNull: true },
    zipcode: { type: DataTypes.STRING, allowNull: true },
    street: { type: DataTypes.STRING, allowNull: true },
    street_number: { type: DataTypes.STRING, allowNull: true },
    sexo: { type: DataTypes.STRING, allowNull: true }, // M, F
    birthdate: { type: DataTypes.DATEONLY, allowNull: true },
    deathdate: { type: DataTypes.DATEONLY, allowNull: true },
    marital_status: { type: DataTypes.STRING, allowNull: true },
    profession: { type: DataTypes.STRING, allowNull: true },
    meu_inss_pass: { type: DataTypes.STRING, allowNull: true },
    rg_numero: { type: DataTypes.STRING, allowNull: true },
    rg_data_emissao: { type: DataTypes.DATEONLY, allowNull: true },
    father_name: { type: DataTypes.STRING, allowNull: true },
    mother_name: { type: DataTypes.STRING, allowNull: true }
});

module.exports = Chat;
