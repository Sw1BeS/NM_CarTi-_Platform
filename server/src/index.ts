import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// @ts-ignore
import { prisma } from './services/prisma.js';
import authRoutes from './modules/auth/auth.routes.js';
import apiRoutes from './routes/apiRoutes.js';
import entityRoutes from './routes/entityRoutes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import requestsRoutes from './modules/requests/requests.routes.js';
import botRoutes from './modules/bots/bot.routes.js';
import publicRoutes from './routes/publicRoutes.js';
import companyRoutes from './modules/companies/company.routes.js';
import templateRoutes from './modules/templates/template.routes.js';
import integrationRoutes from './modules/integrations/integration.routes.js';
import superadminRoutes from './modules/superadmin/superadmin.routes.js';
import qaRoutes from './routes/qaRoutes.js';
import { BotManager } from './modules/bots/bot.service.js';
import { seedAdmin } from './modules/users/user.service.js';
import { startContentWorker, stopContentWorker } from './workers/content.worker.js';
import process from 'process';

dotenv.config();

if (process.env.NODE_ENV === 'production') {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production');
  }
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required in production');
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

const corsOriginEnv = process.env.CORS_ORIGIN;
const corsOrigins = corsOriginEnv
  ? corsOriginEnv.split(',').map(origin => origin.trim()).filter(Boolean)
  : [];

if (process.env.NODE_ENV === 'production' && corsOrigins.length === 0) {
  throw new Error('CORS_ORIGIN is required in production');
}

app.use(cors({
  origin: corsOrigins.length ? corsOrigins : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json() as any);

// Routes
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/entities', entityRoutes); // Generic fallback for other entities
app.use('/api/inventory', inventoryRoutes); // Dedicate Inventory
app.use('/api/requests', requestsRoutes);
app.use('/api/companies', companyRoutes); // Stage C: Multi-tenancy
app.use('/api/templates', templateRoutes); // Stage C: Marketplace
app.use('/api/integrations', integrationRoutes); // Stage C: Integrations
app.use('/api/superadmin', superadminRoutes); // Stage C: System admin
app.use('/api', botRoutes); // Mount at /api root for /bots, /scenarios etc.
app.use('/api', apiRoutes);
app.use('/api/qa', qaRoutes);

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

    // Start Content Worker for scheduled posts
    startContentWorker();

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });

    // Graceful Shutdown
    const shutdown = async () => {
      console.log('🛑 SIGTERM received: closing HTTP server & Bots');
      botManager.stopAll();
      stopContentWorker();
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
