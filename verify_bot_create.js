import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    try {
        console.log("Simulating Bot Creation...");

        // Find a valid workspace ID
        const workspace = await prisma.workspace.findFirst();
        if (!workspace) {
            console.error("❌ No workspace found to link bot to.");
            process.exit(1);
        }
        const companyId = workspace.id;
        console.log("Using Workspace ID:", companyId);

        // Mock Data reflecting apiRoutes.ts variables
        const botName = "Test Simulation Bot";
        const botUsername = "test_sim_bot";
        const finalSlug = "test_sim_bot";
        const finalMiniAppConfig = { url: "https://example.com" };
        const finalMenuConfig = { buttons: [] };

        // Payload matching apiRoutes.ts logic EXACTLY
        const payload = {
            data: {
                name: botName,
                companyId: companyId,
                token: "123456:FAKE_TOKEN_FOR_SIMULATION_" + Date.now(),
                channelId: null,
                adminChatId: null,
                isEnabled: true,
                template: 'CLIENT_LEAD', // Required ENUM
                config: {
                    botUsername,
                    autoDiscovered: true,
                    defaultShowcaseSlug: finalSlug,
                    miniAppConfig: finalMiniAppConfig,
                    menuConfig: finalMenuConfig
                }
            }
        };

        console.log("Payload:", JSON.stringify(payload, null, 2));

        const created = await prisma.botConfig.create(payload);
        console.log("✅ Success! Created Bot ID:", created.id);

        // Cleanup
        await prisma.botConfig.delete({ where: { id: created.id } });
        console.log("✅ Cleanup Successful");

    } catch (e) {
        console.error("❌ Simulation Failed:", e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

run();
