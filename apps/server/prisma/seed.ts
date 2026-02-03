import { PrismaClient } from '@prisma/client';
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

const SCENARIO_TEMPLATE_PACK = [
  {
    id: 'tpl_buy_request',
    name: 'Buy Request (UA/RU/EN)',
    category: 'B2B',
    description: 'Collects buy request details and creates a B2B request.',
    isPremium: false,
    structure: {
      triggerCommand: 'buy',
      keywords: ['buy', 'купити', 'купить'],
      entryNodeId: 'start',
      nodes: [
        { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'greet' },
        { id: 'greet', type: 'MESSAGE', content: { text: '👋 Hi! Let’s find a car for you.', text_uk: '👋 Вітаємо! Допоможемо підібрати авто.', text_ru: '👋 Здравствуйте! Поможем подобрать авто.' }, nextNodeId: 'ask_brand' },
        { id: 'ask_brand', type: 'QUESTION_TEXT', content: { text: 'Which brand?', text_uk: 'Яка марка вас цікавить?', text_ru: 'Какая марка интересует?', variableName: 'brand' }, nextNodeId: 'ask_model' },
        { id: 'ask_model', type: 'QUESTION_TEXT', content: { text: 'Model?', text_uk: 'Яка модель?', text_ru: 'Какая модель?', variableName: 'model' }, nextNodeId: 'ask_budget' },
        { id: 'ask_budget', type: 'QUESTION_TEXT', content: { text: 'Budget (USD)?', text_uk: 'Бюджет (USD)?', text_ru: 'Бюджет (USD)?', variableName: 'budget' }, nextNodeId: 'ask_year' },
        { id: 'ask_year', type: 'QUESTION_TEXT', content: { text: 'Year (e.g., 2019+)?', text_uk: 'Рік (наприклад 2019+)?', text_ru: 'Год (например 2019+)?', variableName: 'year' }, nextNodeId: 'ask_city' },
        { id: 'ask_city', type: 'QUESTION_TEXT', content: { text: 'City?', text_uk: 'Місто?', text_ru: 'Город?', variableName: 'city' }, nextNodeId: 'ask_contact' },
        { id: 'ask_contact', type: 'REQUEST_CONTACT', content: { text: 'Please share your contact so we can reach you.', text_uk: 'Поділіться контактом для звʼязку.', text_ru: 'Поделитесь контактом для связи.' }, nextNodeId: 'create_lead' },
        { id: 'create_lead', type: 'ACTION', content: { actionType: 'CREATE_LEAD', leadType: 'BUY' }, nextNodeId: 'create_request' },
        { id: 'create_request', type: 'ACTION', content: { actionType: 'CREATE_REQUEST', requestType: 'BUY' }, nextNodeId: 'confirm' },
        { id: 'confirm', type: 'MESSAGE', content: { text: '✅ Request created. We will contact you shortly.', text_uk: '✅ Запит створено. Звʼяжемося найближчим часом.', text_ru: '✅ Запрос создан. Свяжемся в ближайшее время.' } }
      ]
    }
  },
  {
    id: 'tpl_sell_tradein',
    name: 'Sell / Trade-in (UA/RU/EN)',
    category: 'B2B',
    description: 'Collects sell/trade-in details and creates a B2B request.',
    isPremium: false,
    structure: {
      triggerCommand: 'sell',
      keywords: ['sell', 'продати', 'продать', 'trade-in'],
      entryNodeId: 'start',
      nodes: [
        { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'greet' },
        { id: 'greet', type: 'MESSAGE', content: { text: '👋 Let’s evaluate your car.', text_uk: '👋 Оцінимо ваше авто.', text_ru: '👋 Оценим ваш автомобиль.' }, nextNodeId: 'ask_brand' },
        { id: 'ask_brand', type: 'QUESTION_TEXT', content: { text: 'Brand?', text_uk: 'Марка?', text_ru: 'Марка?', variableName: 'brand' }, nextNodeId: 'ask_model' },
        { id: 'ask_model', type: 'QUESTION_TEXT', content: { text: 'Model?', text_uk: 'Модель?', text_ru: 'Модель?', variableName: 'model' }, nextNodeId: 'ask_year' },
        { id: 'ask_year', type: 'QUESTION_TEXT', content: { text: 'Year?', text_uk: 'Рік?', text_ru: 'Год?', variableName: 'year' }, nextNodeId: 'ask_mileage' },
        { id: 'ask_mileage', type: 'QUESTION_TEXT', content: { text: 'Mileage (km)?', text_uk: 'Пробіг (км)?', text_ru: 'Пробег (км)?', variableName: 'mileage' }, nextNodeId: 'ask_vin' },
        { id: 'ask_vin', type: 'QUESTION_TEXT', content: { text: 'VIN (optional)?', text_uk: 'VIN (необовʼязково)?', text_ru: 'VIN (необязательно)?', variableName: 'vin' }, nextNodeId: 'ask_price' },
        { id: 'ask_price', type: 'QUESTION_TEXT', content: { text: 'Expected price (USD)?', text_uk: 'Очікувана ціна (USD)?', text_ru: 'Ожидаемая цена (USD)?', variableName: 'budget' }, nextNodeId: 'ask_city' },
        { id: 'ask_city', type: 'QUESTION_TEXT', content: { text: 'City?', text_uk: 'Місто?', text_ru: 'Город?', variableName: 'city' }, nextNodeId: 'ask_contact' },
        { id: 'ask_contact', type: 'REQUEST_CONTACT', content: { text: 'Please share your contact.', text_uk: 'Поділіться контактом.', text_ru: 'Поделитесь контактом.' }, nextNodeId: 'create_lead' },
        { id: 'create_lead', type: 'ACTION', content: { actionType: 'CREATE_LEAD', leadType: 'SELL' }, nextNodeId: 'create_request' },
        { id: 'create_request', type: 'ACTION', content: { actionType: 'CREATE_REQUEST', requestType: 'SELL' }, nextNodeId: 'confirm' },
        { id: 'confirm', type: 'MESSAGE', content: { text: '✅ Thanks! We will contact you with an offer.', text_uk: '✅ Дякуємо! Звʼяжемося з пропозицією.', text_ru: '✅ Спасибо! Свяжемся с предложением.' } }
      ]
    }
  },
  {
    id: 'tpl_status_support',
    name: 'Support / Status (UA/RU/EN)',
    category: 'SUPPORT',
    description: 'Checks request status or creates a support lead.',
    isPremium: false,
    structure: {
      triggerCommand: 'status',
      keywords: ['status', 'support', 'статус', 'підтримка', 'поддержка'],
      entryNodeId: 'start',
      nodes: [
        { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'ask_lookup' },
        { id: 'ask_lookup', type: 'QUESTION_TEXT', content: { text: 'Enter request ID or phone number.', text_uk: 'Введіть ID заявки або телефон.', text_ru: 'Введите ID заявки или телефон.', variableName: 'lookup' }, nextNodeId: 'lookup_action' },
        { id: 'lookup_action', type: 'ACTION', content: { actionType: 'LOOKUP_REQUEST', lookupVar: 'lookup' }, nextNodeId: 'check_found' },
        { id: 'check_found', type: 'CONDITION', content: { conditionVariable: 'lookup_found', conditionOperator: 'HAS_VALUE', trueNodeId: 'show_status', falseNodeId: 'not_found' } },
        { id: 'show_status', type: 'MESSAGE', content: { text: '✅ Status for #{requestPublicId}: {request_status}. Manager: {request_manager}', text_uk: '✅ Статус заявки #{requestPublicId}: {request_status}. Менеджер: {request_manager}', text_ru: '✅ Статус заявки #{requestPublicId}: {request_status}. Менеджер: {request_manager}' } },
        { id: 'not_found', type: 'MESSAGE', content: { text: 'We could not find a request. Creating support request...', text_uk: 'Не знайшли заявку. Створюємо запит у підтримку...', text_ru: 'Не нашли заявку. Создаем запрос в поддержку...' }, nextNodeId: 'support_lead' },
        { id: 'support_lead', type: 'ACTION', content: { actionType: 'CREATE_LEAD', leadType: 'SUPPORT' }, nextNodeId: 'notify_admin' },
        { id: 'notify_admin', type: 'ACTION', content: { actionType: 'NOTIFY_ADMIN', text: '🔔 Support request from {lookup}' } }
      ]
    }
  },
  {
    id: 'tpl_lang_select',
    name: 'Language Selector',
    category: 'SUPPORT',
    description: 'Sets the preferred language for the session.',
    isPremium: false,
    structure: {
      triggerCommand: 'lang',
      keywords: ['lang', 'language', 'мова', 'язык'],
      entryNodeId: 'start',
      nodes: [
        { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'choose_lang' },
        { id: 'choose_lang', type: 'QUESTION_CHOICE', content: { text: 'Choose language', text_uk: 'Оберіть мову', text_ru: 'Выберите язык', variableName: 'language', choices: [
          { label: 'English', label_uk: 'English', label_ru: 'English', value: 'EN', nextNodeId: 'set_lang' },
          { label: 'Ukrainian', label_uk: 'Українська', label_ru: 'Украинский', value: 'UK', nextNodeId: 'set_lang' },
          { label: 'Russian', label_uk: 'Російська', label_ru: 'Русский', value: 'RU', nextNodeId: 'set_lang' }
        ] } },
        { id: 'set_lang', type: 'ACTION', content: { actionType: 'SET_LANG' }, nextNodeId: 'confirm' },
        { id: 'confirm', type: 'MESSAGE', content: { text: 'Language updated ✅', text_uk: 'Мову змінено ✅', text_ru: 'Язык обновлен ✅' } }
      ]
    }
  }
];

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
