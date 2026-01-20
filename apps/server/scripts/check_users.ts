
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        // @ts-ignore
        const users = await prisma.globalUser.findMany();
        console.log('Users found:', users.length);
        users.forEach((u: any) => {
            console.log(`- ${u.email} (Status: ${u.global_status}) - PW Hash Present: ${!!u.password_hash}`);
        });

        if (users.length === 0) {
            console.log('NO USERS FOUND. Seeding might have failed.');
        }
    } catch (err: any) {
        console.error('Error querying GlobalUsers:', err.message);
        console.log('Available models:', Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
