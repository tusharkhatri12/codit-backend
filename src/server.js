import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import dotenv from 'dotenv';
import connectDB from './config/db.js';

// Load env vars
dotenv.config();

// Connect to Database
connectDB();

const app = express();
const origin = process.env.FRONTEND_URL || 'http://localhost:5173';

// Middleware
app.use(cors({
    origin: origin,
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Required for Twilio x-www-form-urlencoded Webhooks
app.use(helmet());
app.use(morgan('dev'));

// Init HTTP Server & Socket.io
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: origin,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Broadcast IO instance to all routes via app context
app.set('io', io);

io.on('connection', (socket) => {
    console.log(`📡 Dashboard Connected via WebSocket: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`🔌 Dashboard Disconnected: ${socket.id}`);
    });
});

import authRoutes from './routes/auth.js';
import shopsRoutes from './routes/shops.js';
import ordersRoutes from './routes/orders.js';
import analyticsRoutes from './routes/analytics.js';
import webhooksRoutes from './routes/webhooks.js';
import riskRoutes from './routes/risk.js';
import userRoutes from './routes/user.js';
import testWhatsappRoutes from './routes/whatsappRoutes.js';
import { initQueues } from './queues/whatsappQueue.js';
import { startExpirationJob } from './jobs/expirationJob.js';
import { startReminderJob } from './jobs/reminderJob.js';

// Init Queues
initQueues();

// Init Background Cron Workers
startExpirationJob();
startReminderJob();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/shops', shopsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/user', userRoutes);

// Exposed testing endpoint exclusively for explicit validation scripts internally (No JWT restrictions)
app.use('/test', testWhatsappRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Codit API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, error: err.message || 'Server Error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT} with WebSockets enabled`);
});
