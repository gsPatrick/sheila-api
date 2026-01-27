const express = require('express');
const router = express.Router();

const authRoutes = require('../features/Auth/auth.routes');
const chatRoutes = require('../features/Chat/chat.routes');
const settingsRoutes = require('../features/Settings/settings.routes');
const blacklistRoutes = require('../features/Blacklist/blacklist.routes');
const tramitacaoRoutes = require('../features/TramitacaoInteligente/tramitacaoInteligente.routes');

const healthCheckRoutes = require('../features/HealthCheck/healthCheck.routes');

module.exports = (io) => {
    router.use('/auth', authRoutes);
    router.use('/chats', chatRoutes(io));
    router.use('/settings', settingsRoutes);
    router.use('/blacklist', blacklistRoutes);
    router.use('/ti', tramitacaoRoutes);
    router.use('/health-check', healthCheckRoutes);

    return router;
};
