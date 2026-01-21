
import express, { Router } from 'express';
import apiRoutes from '../src/routes/apiRoutes';
import entityRoutes from '../src/routes/entityRoutes';
import publicRoutes from '../src/routes/publicRoutes';
import qaRoutes from '../src/routes/qaRoutes';

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
        { name: 'Entity Routes', router: entityRoutes, prefix: '/api/v1/entities' },
        { name: 'Public Routes', router: publicRoutes, prefix: '/api/public' },
        { name: 'QA Routes', router: qaRoutes, prefix: '/api/qa' },
        { name: 'Main API Routes', router: apiRoutes, prefix: '/api' },
    ];

    let totalRoutes = 0;

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
            }
        } catch (e) {
            console.error(`❌ ${mod.name} CRITICAL FAILURE:`, e);
        }
    }

    console.log(`\n🏁 Total Visible Root Routes: ${totalRoutes}`);
}

verify().catch(console.error);
