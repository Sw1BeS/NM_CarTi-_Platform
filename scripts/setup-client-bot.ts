import { PrismaClient } from '@prisma/client';
import { applyTemplatePreset } from '../src/services/templatePreset.service.js';

const prisma = new PrismaClient();

async function setupClientBot() {
  try {
    console.log('🔄 Setting up Cartie_Client_Bot...');

    // Check if company exists
    const company = await prisma.workspace.findUnique({
      where: { slug: 'cartie' }
    });

    if (!company) {
      throw new Error('Cartie company not found. Please run seed first.');
    }

    console.log(`✅ Found company: ${company.name} (${company.id})`);

    // Check if bot already exists
    const existingBot = await prisma.botConfig.findFirst({
      where: {
        companyId: company.id,
        name: 'Cartie Client Bot'
      }
    });

    let botId: string;

    if (existingBot) {
      console.log(`ℹ️ Bot already exists: ${existingBot.id}`);
      botId = existingBot.id;
    } else {
      // Create new bot
      const newBot = await prisma.botConfig.create({
        data: {
          id: `bot_${Date.now()}`,
          name: 'Cartie Client Bot',
          template: 'CLIENT_LEAD',
          token: process.env.TELEGRAM_BOT_TOKEN || 'placeholder_token',
          companyId: company.id,
          isEnabled: true,
          deliveryMode: 'WEBHOOK',
          config: {}
        }
      });
      console.log(`✅ Created new bot: ${newBot.id}`);
      botId = newBot.id;
    }

    // Apply template preset
    console.log('🎨 Applying CLIENT_LEAD template preset...');
    const presetResult = await applyTemplatePreset({
      template: 'CLIENT_LEAD',
      companyId: company.id,
      botId,
      config: existingBot?.config as any || {},
      defaultShowcaseSlug: 'cartie',
      fallbackName: 'cartie_client',
      applyPreset: true,
      forcePreset: true
    });

    console.log('✅ Template preset applied');
    console.log('📋 Menu buttons:', presetResult.config.menuConfig?.buttons);
    console.log('🧭 Navigation items:', presetResult.config.miniAppConfig?.navItems);

    // Update bot with preset configuration
    await prisma.botConfig.update({
      where: { id: botId },
      data: {
        config: presetResult.config as any
      }
    });

    console.log('✅ Bot configuration updated successfully');

    // Verify the update
    const updatedBot = await prisma.botConfig.findUnique({
      where: { id: botId }
    });

    console.log('🔍 Verification:');
    console.log('  - Bot ID:', updatedBot?.id);
    console.log('  - Bot Name:', updatedBot?.name);
    console.log('  - Template:', updatedBot?.template);
    console.log('  - Menu Buttons:', updatedBot?.config?.menuConfig?.buttons?.length || 0);
    console.log('  - MiniApp Enabled:', updatedBot?.config?.miniAppConfig?.isEnabled);
    console.log('  - MiniApp URL:', updatedBot?.config?.miniAppConfig?.url);

  } catch (error) {
    console.error('❌ Error setting up client bot:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the setup
setupClientBot()
  .then(() => {
    console.log('🎉 Client bot setup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  });
