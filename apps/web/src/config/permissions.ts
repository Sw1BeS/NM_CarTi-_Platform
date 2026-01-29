import { NavigationItem, UserRole } from '../types';

export type AppRoutePath = string;

type RoleMatrix = Record<UserRole, AppRoutePath[]>;

// Default landing per role to redirect when a route is not allowed
export const LANDING_BY_ROLE: Record<UserRole, string> = {
  SUPER_ADMIN: '/superadmin/companies',
  ADMIN: '/',
  OWNER: '/',
  MANAGER: '/',
  OPERATOR: '/inbox',
  DEALER: '/requests',
  VIEWER: '/',
  USER: '/',
};

// Central route access policy (Stage 1 hardcoded)
export const ROUTE_ACCESS: { path: AppRoutePath; roles: UserRole[] }[] = [
  { path: '/', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATOR', 'DEALER', 'VIEWER', 'USER'] },
  { path: '/inbox', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATOR', 'DEALER'] },
  { path: '/requests', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATOR', 'DEALER', 'VIEWER', 'USER'] },
  { path: '/leads', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATOR'] },
  { path: '/inventory', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATOR', 'DEALER', 'VIEWER', 'USER'] },
  { path: '/telegram', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'] },
  { path: '/calendar', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'] },
  { path: '/content', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'] },
  { path: '/scenarios', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'] },
  { path: '/integrations', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'] },
  { path: '/partners', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'] },
  { path: '/company', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'] },
  { path: '/companies', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER'] },
  { path: '/entities', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER'] },
  { path: '/settings', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'] },
  { path: '/search', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'] },
  { path: '/qa', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { path: '/health', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { path: '/superadmin', roles: ['SUPER_ADMIN'] },
  { path: '/help', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATOR', 'DEALER', 'VIEWER', 'USER'] },
];

// Default navigation with role visibility aligned to ROUTE_ACCESS
export const NAV_ITEMS: NavigationItem[] = [
  { id: 'nav_dash', labelKey: 'nav.dashboard', path: '/', iconName: 'LayoutDashboard', roles: ROUTE_ACCESS.find(r => r.path === '/')!.roles, order: 0, visible: true },
  { id: 'nav_inbox', labelKey: 'nav.inbox', path: '/inbox', iconName: 'MessageCircle', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATOR', 'DEALER'], order: 1, visible: true },
  { id: 'nav_req', labelKey: 'nav.requests', path: '/requests', iconName: 'FileText', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATOR', 'DEALER', 'VIEWER', 'USER'], order: 2, visible: true },
  { id: 'nav_inv', labelKey: 'nav.inventory', path: '/inventory', iconName: 'Car', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATOR', 'DEALER', 'VIEWER', 'USER'], order: 3, visible: true },
  { id: 'nav_tele', labelKey: 'nav.telegram', path: '/telegram', iconName: 'Send', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'], order: 4, visible: true },
  { id: 'nav_cal', labelKey: 'nav.calendar', path: '/calendar', iconName: 'Calendar', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'], order: 5, visible: true },
  { id: 'nav_cont', labelKey: 'nav.content', path: '/content', iconName: 'Library', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'], order: 6, visible: true },
  { id: 'nav_scen', labelKey: 'nav.scenarios', path: '/scenarios', iconName: 'Database', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'], order: 7, visible: true },
  { id: 'nav_integrations', labelKey: 'nav.integrations', path: '/integrations', iconName: 'Plug', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'], order: 8, visible: true },
  { id: 'nav_partners', labelKey: 'nav.partners', path: '/partners', iconName: 'Users', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'], order: 9, visible: true },
  { id: 'nav_company', labelKey: 'nav.company', path: '/company', iconName: 'Briefcase', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'], order: 10, visible: true },
  { id: 'nav_help', labelKey: 'nav.help', path: '/help', iconName: 'Info', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATOR', 'DEALER', 'VIEWER', 'USER'], order: 90, visible: true },
  { id: 'nav_sets', labelKey: 'nav.settings', path: '/settings', iconName: 'Settings', roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'], order: 99, visible: true }
];

export const roleNav = (role: UserRole): NavigationItem[] => {
  return NAV_ITEMS.filter(item => (item.visible ?? true) && (!item.roles || item.roles.includes(role)))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
};

const prefixMatch = (path: string, target: string) => path === target || target.startsWith(`${path}/`);

export const canAccessRoute = (role: UserRole, pathname: string): boolean => {
  // SUPER_ADMIN override
  if (role === 'SUPER_ADMIN') return true;
  const match = ROUTE_ACCESS.find(r => prefixMatch(r.path, pathname));
  if (!match) return true; // default allow for unknown routes
  return match.roles.includes(role);
};

export const firstAllowedRoute = (role: UserRole): string => {
  const allowed = NAV_ITEMS.filter(n => (!n.roles || n.roles.includes(role)) && n.visible !== false);
  if (allowed.length) return allowed.sort((a, b) => (a.order ?? 999) - (b.order ?? 999))[0].path || '/';
  return LANDING_BY_ROLE[role] || '/';
};
