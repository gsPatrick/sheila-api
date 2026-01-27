require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const sequelize = require('./src/config/database');
const routes = require('./src/routes');
const zapiWebhookRoutes = require('./src/features/ZapiWebhook/zapiWebhook.routes');
const tramitacaoController = require('./src/features/TramitacaoInteligente/tramitacaoInteligente.controller');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});

// Set io in app to be accessible in controllers
app.set('io', io);

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Public Webhook Routes (NOT /api)
app.use('/webhook', zapiWebhookRoutes);
app.post('/webhook/tramitacao-inteligente', tramitacaoController.handleWebhook);

// API Routes
app.use('/api', routes(io));

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
    });
});

// Socket.IO Connection
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Database sync and server start
const PORT = process.env.PORT || 3000;

sequelize.sync({ force: false }).then(() => {
    console.log('Database connected and synced');
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Unable to connect to the database:', err);
});
