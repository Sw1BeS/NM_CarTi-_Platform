export const SUPERADMIN_COMPANY_STORAGE_KEY = 'cartie_superadmin_company';

export const getSuperadminCompanyId = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(SUPERADMIN_COMPANY_STORAGE_KEY);
};

export const setSuperadminCompanyId = (companyId: string | null) => {
    if (typeof window === 'undefined') return;
    if (companyId) {
        localStorage.setItem(SUPERADMIN_COMPANY_STORAGE_KEY, companyId);
    } else {
        localStorage.removeItem(SUPERADMIN_COMPANY_STORAGE_KEY);
    }
};

export const appendSuperadminCompanyParam = (params: URLSearchParams) => {
    const companyId = getSuperadminCompanyId();
    if (companyId && !params.has('companyId')) {
        params.append('companyId', companyId);
    }
    return params;
};

export const attachSuperadminCompany = <T extends Record<string, any>>(payload: T): T => {
    const companyId = getSuperadminCompanyId();
    if (!companyId || !payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
    const current = (payload as any).companyId;
    if (current) return payload;
    return { ...payload, companyId };
};
