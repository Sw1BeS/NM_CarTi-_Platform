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
import telegramRoutes from './modules/telegram/telegram.routes.js';
import systemRoutes from './modules/system/system.routes.js';
import { botManager } from './modules/bots/bot.service.js';
import { seedAdmin } from './modules/users/user.service.js';
import { startContentWorker, stopContentWorker, getWorkerStatus } from './workers/content.worker.js';
import { mtprotoWorker } from './modules/integrations/mtproto/mtproto.worker.js';
import { workspaceContext } from './middleware/workspaceContext.js';
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

// v4.1 Workspace Context Middleware (extracts workspace from headers/domain/token)
app.use(workspaceContext);

// Routes
app.use('/api/system', systemRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/entities', entityRoutes); // Generic fallback for other entities
app.use('/api/inventory', inventoryRoutes); // Dedicate Inventory
app.use('/api/requests', requestsRoutes);
app.use('/api/companies', companyRoutes); // Stage C: Multi-tenancy
app.use('/api/templates', templateRoutes); // Stage C: Marketplace
app.use('/api/integrations', integrationRoutes); // Stage C: Integrations
app.use('/api/superadmin', superadminRoutes); // Stage C: System admin
app.use('/api', apiRoutes);
app.use('/api', botRoutes); // Mount at /api root for /bots, /scenarios etc.
app.use('/api/qa', qaRoutes);
app.use('/api/telegram', telegramRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
    bots: botManager.getStatus(),
    worker: getWorkerStatus()
  });
});

// Serve Frontend (Vite Build)
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// apps/server/dist/index.js -> apps/web/dist
const clientBuildPath = path.join(__dirname, '../../web/dist');

app.use(express.static(clientBuildPath));

// SPA Catch-all (must be after API routes)
app.get('*', (req, res) => {
  // Pass through if asking for API that doesn't exist (optional, or let 404 handled by client)
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Start Server
const startServer = async () => {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    // Seed default admin if not exists
    await seedAdmin();

    // Start Multi-Bot Engine
    botManager.startAll();

    // Start Content Worker for scheduled posts
    startContentWorker();

    // Start MTProto Live Sync
    mtprotoWorker.startLiveSync();

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
