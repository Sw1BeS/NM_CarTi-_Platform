
import { PrismaClient } from '@prisma/client';
import { parseMiniAppPayload } from '../src/modules/telegram/utils/miniappPayload.js';
// @ts-ignore
import { normalizeBrand } from '../src/modules/normalization/normalizeBrand.js';

const prisma = new PrismaClient();

async function runSmokeTests() {
    console.log("🔥 Starting QA Smoke Tests...");
    let passed = 0;
    let failed = 0;

    // 1. Database Connection
    try {
        await prisma.$connect();
        console.log("✅ [DB] Connection Successful");
        passed++;
    } catch (e: any) {
        console.error("❌ [DB] Connection Failed:", e.message);
        failed++;
    }

    // 2. Global Users & Memberships
    try {
        // @ts-ignore
        const userCount = await prisma.globalUser.count();
        if (userCount > 0) {
            console.log(`✅ [DB] Global Users found: ${userCount}`);
        } else {
            console.log("⚠️ [DB] No Global Users found (might need seeding)");
        }

        // Check memberships
        // @ts-ignore
        const membershipCount = await prisma.membership.count();
        if (membershipCount > 0) {
            console.log(`✅ [DB] Memberships found: ${membershipCount}`);
        } else {
            console.log("⚠️ [DB] No Memberships found");
        }

        passed++;
    } catch (e: any) {
        console.error("❌ [DB] User/Membership Check Failed:", e.message);
        failed++;
    }

    // 3. Mini App Payload Logic
    try {
        const payload = {
            v: 1,
            type: 'lead_submit',
            fields: {
                brand: 'BMW',
                model: 'X5',
                year: 2020,
                budget: 50000
            }
        };
        const res = parseMiniAppPayload(payload);
        if (res.ok && res.payload?.fields?.brand === 'BMW') {
            console.log("✅ [Logic] MiniApp Payload Parsed Successfully");
            passed++;
        } else {
            console.error("❌ [Logic] MiniApp Payload Parse Failed", res);
            failed++;
        }
    } catch (e: any) {
        console.error("❌ [Logic] Payload Exception:", e.message);
        failed++;
    }

    // 4. Normalization Logic
    try {
        const brand = await normalizeBrand("  mercedes-benz  ");
        // Alias map defines it as Mercedes-Benz
        if (brand === 'Mercedes-Benz' || brand === 'MERCEDES') {
            console.log(`✅ [Logic] Brand Normalization (mercedes-benz -> ${brand})`);
            passed++;
        } else {
            console.error(`❌ [Logic] Brand Normalization Failed: got '${brand}'`);
            failed++;
        }
    } catch (e: any) {
        console.error("❌ [Logic] Normalization Exception:", e.message);
        failed++;
    }

    console.log(`\n🏁 Smoke Tests Complete. Passed: ${passed}, Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
}

runSmokeTests();
