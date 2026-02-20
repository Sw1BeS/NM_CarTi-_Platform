import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import showcaseRouter from '../modules/Marketing/showcase/showcase.controller.js';
import parserRouter from '../modules/Parser/parser.controller.js';
import legacyAdminRouter from './legacyAdmin.routes.js';
import legacyMessagingRouter from './legacyMessaging.routes.js';
import legacyAnalyticsRouter from './legacyAnalytics.routes.js';
import legacyTelegramProxyRouter from './legacyTelegramProxy.routes.js';
import legacyScenariosRouter from './legacyScenarios.routes.js';
import legacyCampaignsRouter from './legacyCampaigns.routes.js';
import legacyDraftsRouter from './legacyDrafts.routes.js';
import legacyLeadsRouter from './legacyLeads.routes.js';
import legacyBotsRouter from './legacyBots.routes.js';
import legacyContentRouter from './legacyContent.routes.js';

const router = Router();

router.use('/showcase', showcaseRouter);
router.use('/parser', parserRouter);

router.use(authenticateToken);
router.use('/', legacyAdminRouter);
router.use('/', legacyMessagingRouter);
router.use('/', legacyAnalyticsRouter);
router.use('/', legacyTelegramProxyRouter);
router.use('/', legacyScenariosRouter);
router.use('/', legacyCampaignsRouter);
router.use('/', legacyDraftsRouter);
router.use('/', legacyLeadsRouter);
router.use('/', legacyBotsRouter);
router.use('/', legacyContentRouter);

export default router;
