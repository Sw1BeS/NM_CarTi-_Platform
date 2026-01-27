// @ts-ignore
import { prisma } from '../../../services/prisma.js';
import { getWorkspaceById, getWorkspaceBySlug } from '../../../services/v41/readService.js';
import { writeService } from '../../../services/v41/writeService.js';
import bcrypt from 'bcryptjs';

const ensureSystemCompany = async () => {
    // Use read abstraction to find system workspace
    let workspace = await getWorkspaceById('company_system');

    if (!workspace) {
        workspace = await getWorkspaceBySlug('system');
    }

    // Legacy fallback removed as table is gone.

    if (workspace) {
        return workspace.id;
    }

    // Create system workspace
    const created = await writeService.createCompanyDual({
        name: 'System',
        slug: 'system',
        plan: 'ENTERPRISE'
    });
    // Currently createCompanyDual returns mapped object, we just need ID.
    // Ideally we should force ID 'company_system' but writeService generates ID.
    // For now, let's accept the generated ID or modify writeService if 'company_system' ID is critical.
    // Usually system ID logic is flexible.
    return created.id;

    // Note: If we really needed specific ID 'company_system', we should have passed it.
    // Assuming for now any ID works as long as slug is 'system'.
};

export const seedAdmin = async () => {
    // check GlobalUser count
    const count = await prisma.globalUser.count();
    if (count !== 0) {
        return;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
        if (!process.env.SEED_ADMIN_PASSWORD) {
            throw new Error('SEED_ADMIN_PASSWORD is required in production when seeding');
        }
        if (!process.env.SEED_SUPERADMIN_PASSWORD) {
            throw new Error('SEED_SUPERADMIN_PASSWORD is required in production when seeding');
        }
    }

    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin';
    const superEmail = process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@cartie.com';
    const superPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'superadmin';

    console.log("🌱 Seeding Admin User...");
    const hash = await bcrypt.hash(adminPassword, 10);
    const seedCompanyId = await ensureSystemCompany();

    // SUPER_ADMIN first
    const superHash = await bcrypt.hash(superPassword, 10);

    await writeService.createUserDual({
        email: superEmail,
        passwordHash: superHash,
        name: "Root Super Admin",
        role: "SUPER_ADMIN",
        companyId: seedCompanyId
    });

    console.log(`✅ SUPER_ADMIN created: ${superEmail}`);

    // ADMIN/OWNER for the workspace
    await writeService.createUserDual({
        email: adminEmail,
        passwordHash: hash,
        name: "Super Admin",
        role: "ADMIN",
        companyId: seedCompanyId
    });

    const passwordHint = isProduction ? '[set via SEED_ADMIN_PASSWORD]' : adminPassword;
    console.log(`✅ Admin created: ${adminEmail} / ${passwordHint}`);
};
