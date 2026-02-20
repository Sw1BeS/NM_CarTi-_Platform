import { prisma } from '../src/services/prisma.js';
import { DEFAULT_NAVIGATION } from '../src/modules/Core/system/defaults.js';

if (process.env.ALLOW_DEPRECATED !== '1') {
  console.error('[DEPRECATED] patch_nav_leads.ts is one-off and frozen. Set ALLOW_DEPRECATED=1 to run intentionally.');
  process.exit(1);
}

const normalizeNavigation = (nav: any) => {
  const primary = Array.isArray(nav?.primary)
    ? nav.primary
    : Array.isArray(nav?.items)
      ? nav.items
      : Array.isArray(nav)
        ? nav
        : [];

  const keyOf = (item: any) => item?.id || item?.path || item?.label || '';
  const map = new Map<string, any>();

  (primary || []).forEach((item: any, idx: number) => {
    const key = keyOf(item) || `custom_${idx}`;
    map.set(key, item);
  });

  (DEFAULT_NAVIGATION.primary || []).forEach((item: any, idx: number) => {
    const key = keyOf(item) || `default_${idx}`;
    const existing = map.get(key);
    map.set(key, { ...item, ...(existing || {}) });
  });

  const merged = Array.from(map.values()).map((item: any) => {
    const isLeads = item?.id === 'nav_leads' || item?.path === '/leads' || item?.label === 'Leads';
    if (isLeads) return { ...item, visible: true };
    return item;
  });

  return { primary: merged };
};

async function main() {
  const settings = await prisma.systemSettings.findFirst({ orderBy: { id: 'desc' } });
  if (!settings) {
    console.log('No SystemSettings row found. Nothing to patch.');
    return;
  }

  const normalized = normalizeNavigation(settings.navigation as any);
  await prisma.systemSettings.update({
    where: { id: settings.id },
    data: { navigation: normalized }
  });

  console.log('Navigation patched: /leads is visible');
}

main()
  .catch((e) => {
    console.error('Patch failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
