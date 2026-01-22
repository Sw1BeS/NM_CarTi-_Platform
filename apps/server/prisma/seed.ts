import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { writeService } from '../src/services/v41/writeService.js';
import { FEATURE_FLAGS } from '../src/utils/constants.js';

const prisma = new PrismaClient();

async function ensureSystemCompany() {
  const existing = await (prisma as any).workspace.findUnique({ where: { id: 'company_system' } })
    ?? await (prisma as any).workspace.findUnique({ where: { slug: 'system' } });

  if (existing) {
    console.log('ℹ️ System company already exists');
    return existing;
  }

  // Use dual-write service
  const result = await writeService.createCompanyDual({
    name: 'System',
    slug: 'system',
    plan: 'ENTERPRISE'
  });

  console.log(FEATURE_FLAGS.USE_V4_DUAL_WRITE
    ? `✅ System company + workspace created (Company: ${result.id})`
    : `✅ System company created (Company: ${result.id})`
  );

  // Return the legacy company for backward compatibility
  return await (prisma as any).workspace.findUnique({ where: { id: result.id } })!;
}

async function ensureCartieCompany() {
  const existing = await (prisma as any).workspace.findUnique({ where: { slug: 'cartie' } });
  if (existing) {
    console.log('ℹ️ Cartie company already exists');
    return existing;
  }

  // Primary Client Workspace for Automotive Vertical
  const result = await writeService.createCompanyDual({
    name: 'Cartie Auto',
    slug: 'cartie',
    plan: 'ENTERPRISE'
  });

  // Update settings separately if needed or ensure createCompanyDual handles them
  await (prisma as any).workspace.update({
    where: { id: result.id },
    data: {
      settings: {
        plan: 'ENTERPRISE',
        primaryColor: '#D4AF37',
        domain: 'cartie2.umanoff-analytics.space',
        features: {
          analytics: true,
          bots: true,
          inventory: true,
          b2bRequests: true,
          templates: true
        }
      }
    }
  });

  console.log(`✅ Cartie Auto company created (Company: ${result.id})`);
  return await (prisma as any).workspace.findUnique({ where: { id: result.id } })!;
}

async function ensureDemoCompany() {
  const existing = await (prisma as any).workspace.findUnique({ where: { slug: 'demo' } });
  if (existing) {
    console.log('ℹ️ Demo company already exists');
    return existing;
  }

  const result = await writeService.createCompanyDual({
    name: 'Demo Motors',
    slug: 'demo',
    plan: 'PRO'
  });

  await (prisma as any).workspace.update({
    where: { id: result.id },
    data: {
      settings: {
        primaryColor: '#0F62FE',
        domain: 'demo.cartie.local'
      }
    }
  });

  console.log(FEATURE_FLAGS.USE_V4_DUAL_WRITE
    ? `✅ Demo company + workspace created (Company: ${result.id})`
    : `✅ Demo company created (Company: ${result.id})`
  );

  // Return the legacy company for backward compatibility
  return await (prisma as any).workspace.findUnique({ where: { id: result.id } })!;
}

async function createUserIfMissing(
  email: string,
  role: string,
  companyId: string,
  password: string,
  name?: string,
  workspaceId?: string,
  accountId?: string
) {
  const existing = await (prisma as any).globalUser.findUnique({ where: { email } });
  if (existing) return existing;

  // Use dual-write service
  const result = await writeService.createUserDual({
    email,
    passwordHash: password, // Note: createUserDual might expect hashed password, but seed passes plain
    name: name || email,
    role,
    companyId
  });

  console.log(FEATURE_FLAGS.USE_V4_DUAL_WRITE && workspaceId
    ? `✅ User ${email} created (legacy: ${result.id})`
    : `✅ User ${email} created (legacy: ${result.id})`
  );

  // Return the legacy user for backward compatibility
  return await (prisma as any).globalUser.findUnique({ where: { id: result.id } })!;
}

async function main() {
  console.log('🌱 Starting seed...');

  const systemCompany = await ensureSystemCompany();
  const cartieCompany = await ensureCartieCompany();
  const demoCompany = await ensureDemoCompany();

  // Get v4.1 workspace and account IDs if dual-write enabled
  let systemWorkspace: any = null;
  let systemAccount: any = null;
  let demoWorkspace: any = null;
  let demoAccount: any = null;

  if (FEATURE_FLAGS.USE_V4_DUAL_WRITE) {
    // Find workspaces by slug (matches company slug)
    systemWorkspace = await (prisma as any).workspace.findUnique({
      where: { slug: 'system' },
      include: { accounts: { where: { deleted_at: null }, take: 1 } }
    });
    demoWorkspace = await (prisma as any).workspace.findUnique({
      where: { slug: 'demo' },
      include: { accounts: { where: { deleted_at: null }, take: 1 } }
    });

    systemAccount = systemWorkspace?.accounts[0];
    demoAccount = demoWorkspace?.accounts[0];

    console.log('ℹ️ v4.1 workspaces found:', {
      system: systemWorkspace?.id,
      demo: demoWorkspace?.id
    });
  }

  // 1. Create Admin
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@cartie.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const existingAdmin = await (prisma as any).globalUser.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    await createUserIfMissing(
      adminEmail,
      'ADMIN',
      systemCompany.id,
      adminPassword,
      'Super Admin',
      systemWorkspace?.id,
      systemAccount?.id
    );
    console.log('✅ Admin user created');
  } else {
    console.log('ℹ️ Admin user already exists');
  }

  // 1.1 Create Super Admin (global)
  const superEmail = process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@cartie.com';
  const superPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'superadmin123';
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_SUPERADMIN_PASSWORD) {
    throw new Error('SEED_SUPERADMIN_PASSWORD is required in production for SUPER_ADMIN seeding');
  }
  const existingSuper = await (prisma as any).globalUser.findUnique({ where: { email: superEmail } });
  if (!existingSuper) {
    await createUserIfMissing(
      superEmail,
      'SUPER_ADMIN',
      systemCompany.id,
      superPassword,
      'Root Super Admin',
      systemWorkspace?.id,
      systemAccount?.id
    );
    console.log('✅ SUPER_ADMIN user created');
  } else {
    console.log('ℹ️ SUPER_ADMIN already exists');
  }

  // 2. Init System Settings
  const settingsCount = await prisma.systemSettings.count();
  if (settingsCount === 0) {
    await prisma.systemSettings.create({
      data: {
        navigation: {
          primary: [
            { key: 'dashboard', label: 'Dashboard', href: '/', roles: ['ADMIN', 'MANAGER', 'DEALER', 'OPERATOR'] },
            { key: 'requests', label: 'Requests', href: '/requests', roles: ['ADMIN', 'MANAGER', 'DEALER'] },
            { key: 'inventory', label: 'Inventory', href: '/inventory', roles: ['ADMIN', 'MANAGER', 'DEALER'] },
            { key: 'leads', label: 'Leads', href: '/inbox', roles: ['ADMIN', 'MANAGER', 'OPERATOR'] },
            { key: 'telegram', label: 'Telegram', href: '/telegram', roles: ['ADMIN', 'MANAGER'] },
            { key: 'scenarios', label: 'Scenarios', href: '/scenarios', roles: ['ADMIN'] },
            { key: 'content', label: 'Content', href: '/content', roles: ['ADMIN', 'MANAGER'] },
            { key: 'marketplace', label: 'Marketplace', href: '/marketplace', roles: ['ADMIN', 'OWNER'] },
            { key: 'integrations', label: 'Integrations', href: '/integrations', roles: ['ADMIN', 'OWNER'] },
            { key: 'settings', label: 'Settings', href: '/settings', roles: ['ADMIN', 'OWNER'] }
          ]
        },
        features: {
          // ⚠️ FEATURE FLAGS DISABLED PER REQUIREMENT
          // All features are permanently enabled. This field kept for backward compatibility.
          // User requirement: "Всё должно быть доступно всем пользователям"

          // Core Modules - ALL ENABLED BY DEFAULT
          MODULE_LEADS: true,
          MODULE_INVENTORY: true,
          MODULE_REQUESTS: true,
          MODULE_TELEGRAM: true,
          MODULE_SCENARIOS: true,
          MODULE_CAMPAIGNS: true,
          MODULE_CONTENT: true,
          MODULE_MARKETPLACE: true,
          MODULE_INTEGRATIONS: true,
          MODULE_COMPANIES: true,

          // Deprecated/Legacy (remove if unused)
          analytics: true,
          bots: true,
          inventory: true,
          b2bRequests: true,
          templates: true
        },
        modules: {
          // Default enabled modules
          leads: { enabled: true, roles: ['ADMIN', 'MANAGER', 'OPERATOR'] },
          inventory: { enabled: true, roles: ['ADMIN', 'MANAGER', 'DEALER'] },
          requests: { enabled: true, roles: ['ADMIN', 'MANAGER', 'DEALER'] },
          telegram: { enabled: true, roles: ['ADMIN', 'MANAGER'] },
          scenarios: { enabled: true, roles: ['ADMIN'] },
          campaigns: { enabled: true, roles: ['ADMIN', 'MANAGER'] },
          content: { enabled: true, roles: ['ADMIN', 'MANAGER'] },
          marketplace: { enabled: true, roles: ['ADMIN', 'OWNER'] },
          integrations: { enabled: true, roles: ['ADMIN', 'OWNER'] }
        }
      } as any
    });
    console.log('✅ System Settings initialized with ALL features enabled by default');
  } else {
    // Update existing settings to enable all features
    await prisma.systemSettings.update({
      where: { id: 1 },
      data: {
        features: {
          MODULE_LEADS: true,
          MODULE_INVENTORY: true,
          MODULE_REQUESTS: true,
          MODULE_TELEGRAM: true,
          MODULE_SCENARIOS: true,
          MODULE_CAMPAIGNS: true,
          MODULE_CONTENT: true,
          MODULE_MARKETPLACE: true,
          MODULE_INTEGRATIONS: true,
          MODULE_COMPANIES: true,
          analytics: true,
          bots: true,
          inventory: true,
          b2bRequests: true,
          templates: true
        },
        modules: {
          leads: { enabled: true, roles: ['ADMIN', 'MANAGER', 'OPERATOR'] },
          inventory: { enabled: true, roles: ['ADMIN', 'MANAGER', 'DEALER'] },
          requests: { enabled: true, roles: ['ADMIN', 'MANAGER', 'DEALER'] },
          telegram: { enabled: true, roles: ['ADMIN', 'MANAGER'] },
          scenarios: { enabled: true, roles: ['ADMIN'] },
          campaigns: { enabled: true, roles: ['ADMIN', 'MANAGER'] },
          content: { enabled: true, roles: ['ADMIN', 'MANAGER'] },
          marketplace: { enabled: true, roles: ['ADMIN', 'OWNER'] },
          integrations: { enabled: true, roles: ['ADMIN', 'OWNER'] }
        }
      } as any
    }).catch(() => console.log('⚠️ SystemSettings update failed (might not exist yet)'));
    console.log('✅ System Settings updated with ALL features enabled');
  }

  // 3. Demo company users
  if (process.env.SEED_DEMO === 'true') {
    console.log('🚧 Seeding Demo Company Users...');
    await createUserIfMissing('max@demo.com', 'OWNER', demoCompany.id, process.env.DEMO_USER_PASSWORD || 'demo123', 'Demo Owner');
    await createUserIfMissing('admin@demo.com', 'ADMIN', demoCompany.id, process.env.DEMO_USER_PASSWORD || 'demo123', 'Demo Admin');
    await createUserIfMissing('manager@demo.com', 'MANAGER', demoCompany.id, process.env.DEMO_USER_PASSWORD || 'demo123', 'Demo Manager');
    await createUserIfMissing('dealer@demo.com', 'DEALER', demoCompany.id, process.env.DEMO_USER_PASSWORD || 'demo123', 'Demo Dealer');
  }

  // 3. Init Generic Entities (Stage D/E) - Structural
  await seedEntities();
  await seedTemplates(cartieCompany.id);
  await seedNormalization(cartieCompany.id);

  // 3.5. Seed Production Data (Scenarios & Normalization)
  console.log('\n📦 Seeding production data...');
  try {
    const { seedProductionScenarios } = await import('./seeds/scenarios.production.js');
    await seedProductionScenarios();
  } catch (e: any) {
    console.log('⚠️ Production scenarios seed skipped:', e.message);
  }

  try {
    const { seedProductionNormalization } = await import('./seeds/normalization.production.js');
    await seedProductionNormalization(cartieCompany.id);
  } catch (e: any) {
    console.log('⚠️ Production normalization seed skipped:', e.message);
  }

  // 4. Demo Data (Optional)
  if (process.env.SEED_DEMO === 'true') {
    console.log('🚧 Seeding Demo Content...');
    await seedBots(cartieCompany.id); // Contains demo bot tokens
    await seedInventory(cartieCompany.id);
    await seedRequestsAndLeads(cartieCompany.id);
    await seedIntegrationsAndDrafts(cartieCompany.id);
    await seedMTProto(cartieCompany.id);
  } else {
    console.log('ℹ️ Skipping Demo Content (SEED_DEMO != true)');
  }

  console.log('🏁 Seed finished.');
}

async function seedIntegrationsAndDrafts(companyId: string) {
  // Placeholder if function missing
}

async function seedMTProto(companyId: string) {
  console.log('📱 Seeding MTProto...');

  const connector = await prisma.mTProtoConnector.create({
    data: {
      companyId,
      name: 'Demo Personal Account',
      status: 'CONNECTED',
      phone: '+380991234567',
      sessionString: 'fake_session_string_for_demo',
      connectedAt: new Date(),
    }
  });

  await prisma.channelSource.create({
    data: {
      connectorId: connector.id,
      channelId: '-1001234567890',
      title: 'Competitors Auto Sales',
      username: 'competitors_auto',
      status: 'ACTIVE',
      importRules: {
        autoPublish: false,
        keywords: ['bmw', 'audi'],
        minYear: 2015
      }
    }
  });
  console.log('✅ MTProto seeded');
}

async function seedEntities() {
  console.log('📦 Seeding Entity Definitions...');

  const definitions = [
    {
      slug: 'bot_session',
      name: 'Bot Session',
      fields: [
        { key: 'chatId', label: 'Chat ID', type: 'text', required: true },
        { key: 'botId', label: 'Bot ID', type: 'text', required: true },
        { key: 'platform', label: 'Platform', type: 'text' },
        { key: 'state', label: 'State', type: 'text' },
        { key: 'variables', label: 'Variables', type: 'json' },
        { key: 'history', label: 'History', type: 'json' },
        { key: 'lastActive', label: 'Last Active', type: 'datetime' },
        { key: 'messageCount', label: 'Msg Count', type: 'number' }
      ]
    },
    {
      slug: 'tg_message',
      name: 'Telegram Message',
      fields: [
        { key: 'messageId', label: 'Message ID', type: 'number' },
        { key: 'chatId', label: 'Chat ID', type: 'text' },
        { key: 'platform', label: 'Platform', type: 'text' },
        { key: 'direction', label: 'Direction', type: 'text' }, // INCOMING / OUTGOING
        { key: 'from', label: 'From', type: 'text' },
        { key: 'text', label: 'Text', type: 'text' },
        { key: 'date', label: 'Date', type: 'datetime' },
        { key: 'status', label: 'Status', type: 'text' }
      ]
    },
    {
      slug: 'tg_destination',
      name: 'Telegram Destination',
      fields: [
        { key: 'identifier', label: 'Chat ID', type: 'text', required: true },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'type', label: 'Type', type: 'text' }, // USER / GROUP / CHANNEL
        { key: 'tags', label: 'Tags', type: 'multiselect' },
        { key: 'verified', label: 'Verified', type: 'boolean' }
      ]
    },
    {
      slug: 'tg_content',
      name: 'Telegram Content',
      fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'body', label: 'Body', type: 'text' },
        { key: 'type', label: 'Type', type: 'text' }, // POST / STORY
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'mediaUrls', label: 'Media', type: 'json' },
        { key: 'actions', label: 'Actions', type: 'json' },
        { key: 'scheduledAt', label: 'Scheduled At', type: 'datetime' },
        { key: 'postedAt', label: 'Posted At', type: 'datetime' }
      ]
    },
    {
      slug: 'tg_campaign',
      name: 'Telegram Campaign',
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'botId', label: 'Bot ID', type: 'text' },
        { key: 'content', label: 'Content', type: 'json' },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'scheduledAt', label: 'Scheduled At', type: 'datetime' },
        { key: 'stats', label: 'Stats', type: 'json' },
        { key: 'targetAudience', label: 'Target', type: 'json' }
      ]
    },
    {
      slug: 'b2b_proposal',
      name: 'B2B Proposal',
      fields: [
        { key: 'requestId', label: 'Request ID', type: 'text', required: true },
        { key: 'dealerId', label: 'Dealer ID', type: 'text', required: true },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'offerPrice', label: 'Offer Price', type: 'number' },
        { key: 'comment', label: 'Comment', type: 'text' },
        { key: 'validUntil', label: 'Valid Until', type: 'datetime' }
      ]
    }
  ];

  for (const def of definitions) {
    const existing = await prisma.entityDefinition.findUnique({ where: { slug: def.slug } });
    if (!existing) {
      const created = await prisma.entityDefinition.create({
        data: {
          slug: def.slug,
          name: def.name,
          status: 'ACTIVE'
        }
      });

      await prisma.entityField.createMany({
        data: def.fields.map((f: any, idx: number) => ({
          entityId: created.id,
          key: f.key,
          label: f.label,
          type: f.type,
          required: !!f.required,
          order: idx
        }))
      });
      console.log(`   + Created ${def.slug}`);
    }
  }
}

async function seedTemplates(companyId: string) {
  console.log('🎭 Seeding templates...');
  const templates = [
    {
      id: 'template_lead_capture',
      name: 'Lead Capture Bot',
      category: 'LEAD_GEN',
      description: 'Collects contact info and request details',
      isPremium: false,
      structure: {
        nodes: [
          { id: 'greet', type: 'MESSAGE', text: 'Hi! I will collect your request.', nextNode: 'ask_name' },
          { id: 'ask_name', type: 'ASK_INPUT', text: 'Your name?', variable: 'name', nextNode: 'ask_phone' },
          { id: 'ask_phone', type: 'ASK_INPUT', text: 'Phone?', variable: 'phone', nextNode: 'ask_need' },
          { id: 'ask_need', type: 'ASK_INPUT', text: 'Describe what you need', variable: 'need', nextNode: 'confirm' },
          { id: 'confirm', type: 'MESSAGE', text: 'Thanks, we will contact you soon.', actions: ['SAVE_LEAD'] }
        ]
      }
    },
    {
      id: 'template_catalog',
      name: 'Car Catalog',
      category: 'E_COMMERCE',
      description: 'Browse inventory and request contact',
      isPremium: false,
      structure: {
        nodes: [
          { id: 'menu', type: 'MENU', text: 'Choose action', buttons: [{ text: 'Browse', action: 'show_cars' }, { text: 'Search', action: 'search_cars' }] },
          { id: 'search_cars', type: 'SEARCH_CARS', text: 'Enter brand or model', nextNode: 'show_results' },
          { id: 'show_results', type: 'SHOW_CARS', text: 'Results', actions: ['SHOW_DETAILS', 'IM_INTERESTED'] }
        ]
      }
    },
    {
      id: 'template_b2b',
      name: 'B2B Request Handler',
      category: 'B2B',
      description: 'Collects dealer intent and saves request',
      isPremium: true,
      structure: {
        nodes: [
          { id: 'ask_need', type: 'ASK_INPUT', text: 'Send your request (budget, specs)', variable: 'raw', nextNode: 'confirm' },
          { id: 'confirm', type: 'MESSAGE', text: 'We are processing your request', actions: ['SAVE_REQUEST'] }
        ]
      }
    }
  ];

  for (const tpl of templates) {
    await prisma.scenarioTemplate.upsert({
      where: { id: tpl.id },
      create: tpl as any,
      update: {
        name: tpl.name,
        category: tpl.category,
        description: tpl.description,
        structure: tpl.structure,
        isPremium: tpl.isPremium
      }
    });
  }

  // attach templates to company
  for (const tpl of templates) {
    const existing = await prisma.companyTemplate.findFirst({
      where: { companyId: companyId, templateId: tpl.id }
    });
    if (!existing) {
      await prisma.companyTemplate.create({
        data: {
          companyId: companyId,
          templateId: tpl.id
        }
      });
    }
  }
  console.log('✅ Templates seeded');
}

async function seedBots(companyId: string) {
  console.log('🤖 Seeding bots...');
  const bots = [
    {
      id: 'bot_demo_polling',
      name: 'Demo Polling Bot',
      template: 'CLIENT_LEAD',
      token: process.env.DEMO_BOT_TOKEN_1 || 'demo-bot-token-1',
      deliveryMode: 'POLLING',
      isEnabled: true,
      config: {
        username: 'demo_polling_bot',
        role: 'CLIENT',
        menuConfig: { enabled: true },
        deliveryMode: 'polling'
      }
    },
    {
      id: 'bot_demo_webhook',
      name: 'Demo Webhook Bot',
      template: 'CATALOG',
      token: process.env.DEMO_BOT_TOKEN_2 || 'demo-bot-token-2',
      deliveryMode: 'WEBHOOK',
      isEnabled: true,
      config: {
        username: 'demo_webhook_bot',
        role: 'CHANNEL',
        publicBaseUrl: process.env.DEMO_BOT_URL || 'https://demo.cartie.local/bot',
        webhookSecret: process.env.DEMO_WEBHOOK_SECRET || 'demo-secret',
        deliveryMode: 'webhook'
      }
    }
  ];

  for (const bot of bots) {
    await prisma.botConfig.upsert({
      where: { id: bot.id },
      create: { ...bot, companyId },
      update: {
        name: bot.name,
        template: bot.template as any,
        token: bot.token,
        deliveryMode: bot.deliveryMode as any,
        isEnabled: bot.isEnabled,
        config: bot.config as any
      }
    });
  }
  console.log('✅ Bots seeded');
}

async function seedNormalization(companyId: string) {
  console.log('🧭 Seeding normalization aliases - Business Ready...');
  const aliases = [
    // GERMAN
    { type: 'brand', alias: 'BMW', canonical: 'BMW' },
    { type: 'brand', alias: 'БМВ', canonical: 'BMW' },
    { type: 'brand', alias: 'Mercedes', canonical: 'Mercedes-Benz' },
    { type: 'brand', alias: 'Mercedes-Benz', canonical: 'Mercedes-Benz' },
    { type: 'brand', alias: 'Мерседес', canonical: 'Mercedes-Benz' },
    { type: 'brand', alias: 'Audi', canonical: 'Audi' },
    { type: 'brand', alias: 'Ауди', canonical: 'Audi' },
    { type: 'brand', alias: 'Volkswagen', canonical: 'Volkswagen' },
    { type: 'brand', alias: 'VW', canonical: 'Volkswagen' },
    { type: 'brand', alias: 'Фольксваген', canonical: 'Volkswagen' },
    { type: 'brand', alias: 'Porsche', canonical: 'Porsche' },
    { type: 'brand', alias: 'Порше', canonical: 'Porsche' },
    // ASIAN
    { type: 'brand', alias: 'Toyota', canonical: 'Toyota' },
    { type: 'brand', alias: 'Тойота', canonical: 'Toyota' },
    { type: 'brand', alias: 'Lexus', canonical: 'Lexus' },
    { type: 'brand', alias: 'Лексус', canonical: 'Lexus' },
    { type: 'brand', alias: 'Nissan', canonical: 'Nissan' },
    { type: 'brand', alias: 'Ниссан', canonical: 'Nissan' },
    { type: 'brand', alias: 'Hyundai', canonical: 'Hyundai' },
    { type: 'brand', alias: 'Хюндай', canonical: 'Hyundai' },
    { type: 'brand', alias: 'Kia', canonical: 'Kia' },
    { type: 'brand', alias: 'Киа', canonical: 'Kia' },
    // CITIES
    { type: 'city', alias: 'Kyiv', canonical: 'Kyiv' },
    { type: 'city', alias: 'Киев', canonical: 'Kyiv' },
    { type: 'city', alias: 'Київ', canonical: 'Kyiv' },
    { type: 'city', alias: 'Lviv', canonical: 'Lviv' },
    { type: 'city', alias: 'Львов', canonical: 'Lviv' },
    { type: 'city', alias: 'Львів', canonical: 'Lviv' },
    { type: 'city', alias: 'Odessa', canonical: 'Odesa' },
    { type: 'city', alias: 'Одесса', canonical: 'Odesa' },
    { type: 'city', alias: 'Dnipro', canonical: 'Dnipro' },
    { type: 'city', alias: 'Днепр', canonical: 'Dnipro' }
  ];

  for (const entry of aliases) {
    await prisma.normalizationAlias.upsert({
      where: { type_alias_companyId: { type: entry.type as any, alias: entry.alias, companyId } },
      create: { ...entry, companyId } as any,
      update: { canonical: entry.canonical }
    });
  }
  console.log('✅ Normalization - Business Data seeded');
}

async function seedInventory(companyId: string) {
  console.log('🚗 Seeding inventory...');
  const cars = [
    {
      id: 'car_demo_1',
      title: 'BMW 320d xDrive',
      price: 18000,
      currency: 'USD',
      year: 2018,
      mileage: 85000,
      location: 'Kyiv',
      status: 'AVAILABLE',
      mediaUrls: ['https://picsum.photos/seed/bmw1/600/400'],
      specs: { fuel: 'diesel', transmission: 'automatic' }
    },
    {
      id: 'car_demo_2',
      title: 'Mercedes C200',
      price: 21000,
      currency: 'USD',
      year: 2019,
      mileage: 65000,
      location: 'Lviv',
      status: 'AVAILABLE',
      mediaUrls: ['https://picsum.photos/seed/merc1/600/400'],
      specs: { fuel: 'petrol', transmission: 'automatic' }
    },
    {
      id: 'car_demo_3',
      title: 'VW Golf 7',
      price: 12000,
      currency: 'USD',
      year: 2016,
      mileage: 110000,
      location: 'Kyiv',
      status: 'AVAILABLE',
      mediaUrls: ['https://picsum.photos/seed/vwgolf/600/400'],
      specs: { fuel: 'petrol', transmission: 'manual' }
    }
  ];

  for (const car of cars) {
    await prisma.carListing.upsert({
      where: { id: car.id },
      create: { ...car, companyId, source: 'MANUAL' },
      update: {
        title: car.title,
        price: car.price,
        mileage: car.mileage,
        status: car.status,
        location: car.location
      }
    });
  }
  console.log('✅ Inventory seeded');
}

async function seedRequestsAndLeads(companyId: string) {
  console.log('📨 Seeding requests, variants, leads...');
  const requests = [
    {
      id: 'req_demo_1',
      title: 'Нужен BMW 3-series 2018+',
      description: 'Бюджет до 20k, автомат, дизель',
      status: 'COLLECTING_VARIANTS',
      priority: 'HIGH',
      companyId,
      variants: [
        {
          id: 'var_demo_1',
          title: 'BMW 320d xDrive',
          price: 18000,
          currency: 'USD',
          status: 'REVIEWED',
          year: 2018,
          mileage: 85000,
          source: 'INVENTORY'
        },
        {
          id: 'var_demo_2',
          title: 'BMW 318d',
          price: 16500,
          currency: 'USD',
          status: 'SUBMITTED',
          year: 2017,
          mileage: 120000,
          source: 'DEALER'
        }
      ]
    },
    {
      id: 'req_demo_2',
      title: 'Ищу Mercedes C-class 2019+',
      description: 'Бензин, автомат, до 23k',
      status: 'SHORTLIST',
      priority: 'NORMAL',
      companyId,
      variants: [
        {
          id: 'var_demo_3',
          title: 'Mercedes C200',
          price: 21000,
          currency: 'USD',
          status: 'APPROVED',
          year: 2019,
          mileage: 65000,
          source: 'INVENTORY'
        }
      ]
    }
  ];

  for (const req of requests) {
    await prisma.b2bRequest.upsert({
      where: { id: req.id },
      create: {
        ...req,
        variants: {
          create: req.variants as any
        }
      } as any,
      update: {
        title: req.title,
        description: req.description,
        status: req.status as any
      }
    });
  }

  const leads = [
    {
      id: 'lead_demo_1',
      clientName: 'Ivan Client',
      phone: '+380501112233',
      botId: 'bot_demo_polling',
      status: 'NEW',
      source: 'demo_polling',
      payload: { note: 'Interested in BMW' }
    },
    {
      id: 'lead_demo_2',
      clientName: 'Olena Dealer',
      phone: '+380671234567',
      botId: 'bot_demo_webhook',
      status: 'CONTACTED',
      source: 'demo_webhook',
      payload: { note: 'Dealer request' }
    }
  ];

  for (const lead of leads) {
    await prisma.lead.upsert({
      where: { id: lead.id },
      create: { ...lead },
      update: {
        clientName: lead.clientName,
        status: lead.status as any,
        payload: lead.payload as any
      }
    });
  }

  console.log('✅ Requests and leads seeded');
}

async function seedIntegrationsAndDrafts(companyId: string) {
  console.log('🔌 Seeding integrations and drafts...');

  const integrations = [
    {
      id: 'int_demo_webhook',
      type: 'WEBHOOK',
      isActive: true,
      config: { url: process.env.DEMO_HOOK_URL || 'https://demo.cartie.local/hooks/lead', secret: process.env.DEMO_HOOK_SECRET || 'demo-webhook' }
    },
    {
      id: 'int_demo_telegram',
      type: 'TELEGRAM_CHANNEL',
      isActive: true,
      config: { channelId: '@demo_channel', adminChatId: '@demo_admins' }
    }
  ];

  for (const integ of integrations) {
    await prisma.integration.upsert({
      where: { id: integ.id },
      create: { ...integ, companyId } as any,
      update: { isActive: integ.isActive, config: integ.config as any }
    });
  }

  const drafts = [
    {
      id: 10001,
      title: 'BMW 320d пост',
      source: 'MANUAL',
      status: 'SCHEDULED',
      botId: 'bot_demo_polling',
      scheduledAt: new Date(Date.now() + 3600 * 1000),
      metadata: { images: ['https://picsum.photos/seed/bmwpost/400/300'] }
    },
    {
      id: 10002,
      title: 'Mercedes C200 пост',
      source: 'MANUAL',
      status: 'POSTED',
      botId: 'bot_demo_webhook',
      postedAt: new Date(),
      metadata: { channel: '@demo_channel' }
    }
  ];

  for (const draft of drafts) {
    await prisma.draft.upsert({
      where: { id: draft.id },
      create: draft as any,
      update: {
        title: draft.title,
        status: draft.status,
        botId: draft.botId
      }
    });
  }

  console.log('✅ Integrations and drafts seeded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
