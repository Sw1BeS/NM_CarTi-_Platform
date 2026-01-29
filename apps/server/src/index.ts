import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// @ts-ignore
import { prisma } from './services/prisma.js';
import authRoutes from './modules/Core/auth/auth.routes.js';
import apiRoutes from './routes/apiRoutes.js';
import entityRoutes from './routes/entityRoutes.js';
import inventoryRoutes from './modules/Inventory/inventory/inventory.routes.js';
import requestsRoutes from './modules/Sales/requests/requests.routes.js';
import publicRoutes from './routes/publicRoutes.js';
import companyRoutes from './modules/Core/companies/company.routes.js';
import templateRoutes from './modules/Core/templates/template.routes.js';
import integrationRoutes from './modules/Integrations/integration.routes.js';
import superadminRoutes from './modules/Core/superadmin/superadmin.routes.js';
import qaRoutes from './routes/qaRoutes.js';
import telegramRoutes from './modules/Communication/telegram/core/telegram.routes.js';
import systemRoutes from './modules/Core/system/system.routes.js';
import { whatsAppRouter } from './modules/Integrations/whatsapp/whatsapp.service.js';
import { viberRouter } from './modules/Integrations/viber/viber.service.js';
import { botManager } from './modules/Communication/bots/bot.service.js';
import { seedAdmin } from './modules/Core/users/user.service.js';
import { bootstrapVariantB } from './modules/Core/entities/bootstrapVariantB.js';
import { startContentWorker, stopContentWorker, getWorkerStatus } from './workers/content.worker.js';
import { mtprotoWorker } from './modules/Integrations/mtproto/mtproto.worker.js';
import { MTProtoLifeCycle } from './modules/Integrations/mtproto/mtproto.lifecycle.js';
import { workspaceContext } from './middleware/workspaceContext.js';
import { checkHealth } from './modules/Core/health/health.controller.js';
import { validateEnv } from './config/env.js';
import process from 'process';
import { logger } from './utils/logger.js';
import { errorResponse } from './utils/errorResponse.js';

dotenv.config();

const env = validateEnv();

const app = express();
const PORT = env.PORT;

const corsOriginEnv = env.CORS_ORIGIN;
const corsOrigins = corsOriginEnv
  ? corsOriginEnv.split(',').map(origin => origin.trim()).filter(Boolean)
  : [];

app.use(cors({
  origin: corsOrigins.length ? corsOrigins : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json() as any);

// v4.1 Workspace Context Middleware (extracts workspace from headers/domain/token)
app.use(workspaceContext);

// Routes
// 1) Public Webhooks (must be before /api which has auth)
app.use('/api/webhooks/whatsapp', whatsAppRouter);
app.use('/api/webhooks/viber', viberRouter);
app.use('/api/telegram', telegramRoutes);

// 2) Public Routes
app.use('/api/public', publicRoutes);

// 3) Auth Routes
app.use('/api/auth', authRoutes);

// 4) App Routes (auth required inside routers)
app.use('/api/system', systemRoutes);
app.use('/api/entities', entityRoutes); // Generic fallback for other entities
app.use('/api/inventory', inventoryRoutes); // Dedicate Inventory
app.use('/api/requests', requestsRoutes);
app.use('/api/companies', companyRoutes); // Stage C: Multi-tenancy
app.use('/api/templates', templateRoutes); // Stage C: Marketplace
app.use('/api/integrations', integrationRoutes); // Stage C: Integrations
app.use('/api/superadmin', superadminRoutes); // Stage C: System admin
app.use('/api/qa', qaRoutes);

// Health Check (Robust)
app.get('/health', checkHealth);
app.get('/api/health', checkHealth);

// 5) Legacy/God Router (auth inside router)
app.use('/api', apiRoutes);

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
    return errorResponse(res, 404, 'API endpoint not found');
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Start Server
const startServer = async () => {
  try {
    await prisma.$connect();
    logger.info('Database connected');

    // Seed default admin if not exists
    await seedAdmin();
    await bootstrapVariantB();

    // Start Multi-Bot Engine
    botManager.startAll();

    // Start Content Worker for scheduled posts
    startContentWorker();

    // Start MTProto Live Sync
    mtprotoWorker.startLiveSync();

    // Restore persistent MTProto sessions
    await MTProtoLifeCycle.initAll();

    const server = app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
    });

    // Graceful Shutdown
    const shutdown = async () => {
      logger.warn('SIGTERM received: closing HTTP server & Bots');
      botManager.stopAll();
      stopContentWorker();
      server.close(() => {
        logger.info('HTTP server closed');
        prisma.$disconnect();
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('Server startup failed', error);
    process.exit(1);
  }
};

export { app, startServer };

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
