import dotenv from 'dotenv';
import { prisma } from '../services/prisma.js';
import { startContentWorker, stopContentWorker } from './content.worker.js';
import { logger } from '../utils/logger.js';

dotenv.config();

const shutdown = async () => {
  stopContentWorker();
  await prisma.$disconnect();
  process.exit(0);
};

const run = async () => {
  await prisma.$connect();
  startContentWorker();
};

run().catch((error) => {
  logger.error('[ContentWorkerRunner] Failed to start:', error);
  process.exit(1);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
