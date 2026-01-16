
// @ts-ignore
import { prisma } from '../../services/prisma.js';
import bcrypt from 'bcryptjs';


export const seedAdmin = async () => {
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin';

    if (process.env.NODE_ENV === 'production' && !process.env.SEED_ADMIN_PASSWORD) {
        throw new Error('SEED_ADMIN_PASSWORD is required in production');
    }

    const count = await prisma.user.count();
    if (count === 0) {
        console.log("🌱 Seeding Admin User...");
        const hash = await bcrypt.hash(adminPassword, 10);
        const seedCompanyId = await (async () => {
            const systemById = await prisma.company.findUnique({ where: { id: 'company_system' } });
            if (systemById) return systemById.id;

            const systemBySlug = await prisma.company.findUnique({ where: { slug: 'system' } });
            if (systemBySlug) return systemBySlug.id;

            const existing = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
            if (existing) return existing.id;

            const created = await prisma.company.create({
                data: {
                    id: 'company_system',
                    name: 'System',
                    slug: 'system',
                    isActive: true
                }
            });
            return created.id;
        })();
        await prisma.user.create({
            data: {
                email: adminEmail,
                password: hash,
                name: "Super Admin",
                role: "ADMIN",
                companyId: seedCompanyId
            }
        });
        const passwordHint = process.env.NODE_ENV === 'production' ? '[set via SEED_ADMIN_PASSWORD]' : adminPassword;
        console.log(`✅ Admin created: ${adminEmail} / ${passwordHint}`);
    }
};
