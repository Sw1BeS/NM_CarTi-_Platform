
// @ts-ignore
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const seedAdmin = async () => {
    const count = await prisma.user.count();
    if (count === 0) {
        console.log("🌱 Seeding Admin User...");
        const hash = await bcrypt.hash("admin", 10);
        await prisma.user.create({
            data: {
                email: "admin",
                password: hash,
                name: "Super Admin",
                role: "ADMIN"
            }
        });
        console.log("✅ Admin created: admin / admin");
    }
};