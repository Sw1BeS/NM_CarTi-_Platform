import { PrismaClient } from '@prisma/client';
import { SCENARIO_TEMPLATE_PACK } from '../src/seeds/scenarioPack.js';
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

async function seedShowcase(companyId: string) {
  console.log('🌱 Seeding Showcase...');
  const systemSlug = 'system';
  const existing = await prisma.showcase.findUnique({ where: { slug: systemSlug } });

  if (!existing) {
    await prisma.showcase.create({
      data: {
        workspaceId: companyId,
        name: 'System Default',
        slug: systemSlug,
        isPublic: true,
        rules: { mode: 'FILTER', filters: { status: ['AVAILABLE'] } },
      }
    });
    console.log(`✅ Created default Showcase: ${systemSlug}`);
  } else {
    console.log(`ℹ️ Showcase '${systemSlug}' already exists.`);
  }
}

async function main() {
  console.log('🌱 Starting seed...');

  const systemCompany = await ensureSystemCompany();
  const cartieCompany = await ensureCartieCompany();

  // Get v4.1 workspace and account IDs if dual-write enabled
  let systemWorkspace: any = null;
  let systemAccount: any = null;
  // demo workspace removed

  if (FEATURE_FLAGS.USE_V4_DUAL_WRITE) {
    // Find workspaces by slug (matches company slug)
    systemWorkspace = await (prisma as any).workspace.findUnique({
      where: { slug: 'system' },
      include: { accounts: { where: { deleted_at: null }, take: 1 } }
    });
    systemAccount = systemWorkspace?.accounts[0];
    console.log('ℹ️ v4.1 workspaces found:', {
      system: systemWorkspace?.id
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

  // 3. Demo company users removed (no demo data in any environment)

  // 3. Init Generic Entities (Stage D/E) - Structural
  await seedEntities();
  await seedDictionaries();
  await seedTemplates(cartieCompany.id);
  await seedBotScenarios(cartieCompany.id);
  await seedNormalization(cartieCompany.id);

  // 3.1 Seed Showcase (Release Block A)
  await seedShowcase(systemCompany.id);

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

  // 4. Demo Content removed (no demo data in any environment)

  console.log('🏁 Seed finished.');
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
    },
    {
      slug: 'partner_company',
      name: 'Partner Company',
      fields: [
        { key: 'name', label: 'Company Name', type: 'text', required: true },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'tags', label: 'Tags', type: 'multiselect' },
        { key: 'city', label: 'City', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'phone', label: 'Phone', type: 'text' },
        { key: 'website', label: 'Website', type: 'text' },
        { key: 'terms', label: 'Terms', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'text' }
      ]
    },
    {
      slug: 'partner_contact',
      name: 'Partner Contact',
      fields: [
        { key: 'companyId', label: 'Company ID', type: 'text', required: true },
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'role', label: 'Role', type: 'text' },
        { key: 'phone', label: 'Phone', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'telegram', label: 'Telegram', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'text' }
      ]
    },
    {
      slug: 'partner_deal',
      name: 'Partner Deal',
      fields: [
        { key: 'companyId', label: 'Company ID', type: 'text', required: true },
        { key: 'requestId', label: 'Request ID', type: 'text' },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'value', label: 'Value', type: 'number' },
        { key: 'currency', label: 'Currency', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'text' },
        { key: 'closedAt', label: 'Closed At', type: 'datetime' }
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

async function seedDictionaries() {
  console.log('📚 Seeding dictionaries...');
  const def = await prisma.entityDefinition.findUnique({ where: { slug: 'sys_dictionary' } });
  if (!def) return;
  const existing = await prisma.entityRecord.findFirst({ where: { entityId: def.id } });
  if (existing) return;

  await prisma.entityRecord.create({
    data: {
      entityId: def.id,
      data: {
        id: 'main_dict',
        brands: ['BMW', 'Mercedes-Benz', 'Audi', 'Toyota', 'Lexus', 'Volkswagen', 'Hyundai', 'Kia', 'Ford', 'Tesla'],
        cities: ['Kyiv', 'Lviv', 'Odesa', 'Dnipro', 'Kharkiv', 'Warsaw', 'Berlin', 'New York', 'Los Angeles', 'Chicago']
      }
    }
  });
  console.log('✅ Dictionaries seeded');
}


async function seedTemplates(companyId: string) {
  console.log('🎭 Seeding templates...');
  const templates = SCENARIO_TEMPLATE_PACK;

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

async function seedBotScenarios(companyId: string) {
  console.log('🤖 Seeding bot scenarios...');
  const scenarioIdMap: Record<string, string> = {
    tpl_buy_request: 'scn_buy',
    tpl_sell_tradein: 'scn_sell',
    tpl_status_support: 'scn_support',
    tpl_lang_select: 'scn_lang'
  };
  for (const tpl of SCENARIO_TEMPLATE_PACK) {
    const structure: any = tpl.structure || {};
    const nodes = Array.isArray(structure.nodes) ? structure.nodes : [];
    const entryNodeId = structure.entryNodeId || nodes[0]?.id || 'start';
    const triggerCommand = structure.triggerCommand || tpl.name?.toLowerCase()?.replace(/\s+/g, '_');
    const keywords = Array.isArray(structure.keywords) ? structure.keywords : [];
    const scenarioId = scenarioIdMap[tpl.id] || tpl.id.replace('tpl_', 'scn_');

    await prisma.scenario.upsert({
      where: { id: scenarioId },
      create: {
        id: scenarioId,
        name: tpl.name,
        triggerCommand,
        keywords,
        isActive: true,
        status: 'PUBLISHED',
        entryNodeId,
        nodes,
        companyId
      },
      update: {
        name: tpl.name,
        triggerCommand,
        keywords,
        isActive: true,
        status: 'PUBLISHED',
        entryNodeId,
        nodes,
        companyId
      }
    });
  }
  console.log('✅ Scenarios seeded');
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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
