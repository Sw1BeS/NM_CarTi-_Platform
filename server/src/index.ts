import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// @ts-ignore
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/authRoutes.js';
import apiRoutes from './routes/apiRoutes.js';
import entityRoutes from './routes/entityRoutes.js';
import { BotManager } from './services/botService.js';
import { seedAdmin } from './services/userService.js';
import process from 'process';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Allow CORS for dev (localhost:5173) and prod
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json() as any);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api', apiRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date(), uptime: process.uptime() });
});

// Start Server
const startServer = async () => {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
    
    // Seed default admin if not exists
    await seedAdmin();

    // Start Multi-Bot Engine
    const botManager = new BotManager();
    botManager.startAll();

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
    
    // Graceful Shutdown
    const shutdown = async () => {
        console.log('🛑 SIGTERM received: closing HTTP server & Bots');
        botManager.stopAll();
        server.close(() => {
            console.log('HTTP server closed');
            prisma.$disconnect();
            process.exit(0);
        });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
};

startServer();
