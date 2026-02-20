type TenantUserLike = {
  role?: unknown;
  companyId?: unknown;
  workspaceId?: unknown;
};

const asTenantId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export interface TenantContext {
  isSuperadmin: boolean;
  tenantId: string | null;
  companyId: string | null;
  workspaceId: string | null;
}

export const resolveTenantContext = (user: TenantUserLike): TenantContext => {
  const isSuperadmin = String(user?.role || '') === 'SUPER_ADMIN';
  const tokenCompanyId = asTenantId(user?.companyId);
  const tokenWorkspaceId = asTenantId(user?.workspaceId);
  const tenantId = tokenWorkspaceId || tokenCompanyId;

  return {
    isSuperadmin,
    tenantId,
    companyId: tenantId,
    workspaceId: tenantId
  };
};

export const resolveTenantScope = (user: TenantUserLike, requestedCompanyId?: unknown): TenantContext => {
  const base = resolveTenantContext(user);
  const requestedTenantId = asTenantId(requestedCompanyId);
  const scopedTenantId = base.isSuperadmin ? (requestedTenantId || base.tenantId) : base.tenantId;

  return {
    ...base,
    tenantId: scopedTenantId,
    companyId: scopedTenantId,
    workspaceId: scopedTenantId
  };
};

export const isTenantResourceAllowed = (ctx: TenantContext, resourceCompanyId?: unknown): boolean => {
  if (ctx.isSuperadmin) return true;
  const resourceTenantId = asTenantId(resourceCompanyId);
  if (!ctx.tenantId || !resourceTenantId) return false;
  return resourceTenantId === ctx.tenantId;
};
