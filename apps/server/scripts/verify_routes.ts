
import { Router } from 'express';
import apiRoutes from '../src/routes/apiRoutes.js';
import entityRoutes from '../src/routes/entityRoutes.js';
import publicRoutes from '../src/routes/publicRoutes.js';
import qaRoutes from '../src/routes/qaRoutes.js';
import legacyAdminRoutes from '../src/routes/legacyAdmin.routes.js';
import legacyMessagingRoutes from '../src/routes/legacyMessaging.routes.js';
import legacyAnalyticsRoutes from '../src/routes/legacyAnalytics.routes.js';
import legacyTelegramProxyRoutes from '../src/routes/legacyTelegramProxy.routes.js';
import legacyScenariosRoutes from '../src/routes/legacyScenarios.routes.js';
import legacyCampaignsRoutes from '../src/routes/legacyCampaigns.routes.js';
import legacyDraftsRoutes from '../src/routes/legacyDrafts.routes.js';
import legacyLeadsRoutes from '../src/routes/legacyLeads.routes.js';
import legacyBotsRoutes from '../src/routes/legacyBots.routes.js';
import legacyContentRoutes from '../src/routes/legacyContent.routes.js';

function getRoutesOfRouter(router: Router, basePath: string = ''): string[] {
    const layerPaths: string[] = [];

    if (!router || !router.stack) return [];

    router.stack.forEach((layer: any) => {
        if (layer.route) {
            const path = layer.route.path;
            const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
            layerPaths.push(`${methods.padEnd(6)} ${basePath}${path}`);
        } else if (layer.name === 'router' && layer.handle.stack) {
            // Sub-router
        }
    });

    return layerPaths;
}

async function verify() {
    console.log("🔍 Verifying Route Definitions...");

    const modules = [
        { name: 'Entity Routes', router: entityRoutes, prefix: '/api/entities' },
        { name: 'Public Routes', router: publicRoutes, prefix: '/api/public' },
        { name: 'QA Routes', router: qaRoutes, prefix: '/api/qa' },
        { name: 'Legacy Admin Routes', router: legacyAdminRoutes, prefix: '/api' },
        { name: 'Legacy Messaging Routes', router: legacyMessagingRoutes, prefix: '/api' },
        { name: 'Legacy Analytics Routes', router: legacyAnalyticsRoutes, prefix: '/api' },
        { name: 'Legacy Telegram Proxy Routes', router: legacyTelegramProxyRoutes, prefix: '/api' },
        { name: 'Legacy Scenarios Routes', router: legacyScenariosRoutes, prefix: '/api' },
        { name: 'Legacy Campaigns Routes', router: legacyCampaignsRoutes, prefix: '/api' },
        { name: 'Legacy Drafts Routes', router: legacyDraftsRoutes, prefix: '/api' },
        { name: 'Legacy Leads Routes', router: legacyLeadsRoutes, prefix: '/api' },
        { name: 'Legacy Bots Routes', router: legacyBotsRoutes, prefix: '/api' },
        { name: 'Legacy Content Routes', router: legacyContentRoutes, prefix: '/api' },
        { name: 'Main API Routes', router: apiRoutes, prefix: '/api' },
    ];

    let totalRoutes = 0;
    let criticalFailures = 0;

    for (const mod of modules) {
        try {
            if (mod.router) {
                const routes = getRoutesOfRouter(mod.router, mod.prefix);
                console.log(`\n✅ ${mod.name} Loaded:`);
                routes.forEach(r => console.log(`   ${r}`));
                totalRoutes += routes.length;
                if (routes.length === 0) console.log("   (Router loaded but no direct routes visible - likely sub-routers)");
            } else {
                console.error(`❌ ${mod.name} failed to export a router.`);
                criticalFailures++;
            }
        } catch (e) {
            console.error(`❌ ${mod.name} CRITICAL FAILURE:`, e);
            criticalFailures++;
        }
    }

    console.log(`\n🏁 Total Visible Root Routes: ${totalRoutes}`);
    if (criticalFailures > 0) {
        process.exit(1);
    }
}

verify().catch(console.error);
