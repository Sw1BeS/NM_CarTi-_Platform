import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { ulid } from 'ulid';

const prisma = new PrismaClient();

const BRANDS = ['BMW', 'Audi', 'Mercedes-Benz', 'Toyota', 'Volkswagen', 'Lexus', 'Porsche', 'Land Rover'];
const MODELS: Record<string, string[]> = {
    'BMW': ['X5', 'X3', '3 series', '5 series', 'X7', 'M4'],
    'Audi': ['Q7', 'Q8', 'A6', 'A4', 'e-tron', 'Q5'],
    'Mercedes-Benz': ['GLE', 'GLS', 'E-Class', 'C-Class', 'G-Class', 'S-Class'],
    'Toyota': ['Camry', 'RAV4', 'Highlander', 'Land Cruiser', 'Corolla'],
    'Volkswagen': ['Touareg', 'Tiguan', 'Golf', 'Passat', 'Arteon'],
    'Lexus': ['RX', 'NX', 'ES', 'LX'],
    'Porsche': ['Cayenne', 'Macan', 'Panamera', '911'],
    'Land Rover': ['Range Rover', 'Defender', 'Discovery']
};
const CITIES = ['Kyiv', 'Lviv', 'Odesa', 'Dnipro', 'Kharkiv'];
const COLORS = ['Black', 'White', 'Grey', 'Silver', 'Blue', 'Red'];
const NAMES = ['Alex', 'Dmitry', 'Olga', 'Elena', 'Max', 'Igor', 'Anna', 'Sergey', 'Marina', 'Pavel'];

function random(arr: any[]) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
    console.log('🚀 Starting PRODUCTION SEED...');

    // Ensure Company Exists
    let company = await prisma.workspace.findUnique({ where: { slug: 'cartie' } });
    if (!company) {
        console.log('❌ Cartie company not found, running basic seed first...');
        // We assume basic seed ran. If not, we fail.
        return;
    }
    const companyId = company.id;

    // 1. Create Partners
    console.log('👷 Creating Partners...');
    const partners = [];
    for (let i = 1; i <= 5; i++) {
        const email = `partner${i}@example.com`;
        const userId = ulid();
        const user = await prisma.globalUser.upsert({
            where: { email },
            update: {
                name: `Partner Auto ${i}`,
                password_hash: 'partner123',
            },
            create: {
                email,
                name: `Partner Auto ${i}`,
                password_hash: 'partner123',
                id: userId
            }
        });

        // Check/Create Membership
        const existingMember = await prisma.membership.findFirst({
            where: { user_id: user.id, workspace_id: companyId }
        });

        if (!existingMember) {
            await prisma.membership.create({
                data: {
                    id: ulid(),
                    user_id: user.id,
                    workspace_id: companyId,
                    role_id: 'DEALER',
                    permissions: {}
                }
            });
        }

        partners.push(user);
    }

    // 2. Create Inventory
    console.log('🚗 Creating Inventory (50 cars)...');
    for (let i = 0; i < 50; i++) {
        const brand = random(BRANDS);
        const model = random(MODELS[brand]);
        const year = randomInt(2015, 2024);
        const price = randomInt(15, 120) * 1000;

        await prisma.carListing.create({
            data: {
                id: ulid(),
                companyId,
                title: `${brand} ${model}`,
                year,
                price: price,
                currency: 'USD',
                status: 'AVAILABLE',
                location: random(CITIES),
                // vin: crypto.randomBytes(8).toString('hex').toUpperCase(), // VIN not in schema for CarListing?
                mileage: randomInt(10, 150) * 1000,
                description: `Great ${brand} ${model} ${year}, ${random(COLORS)} color. Perfect condition.`,
                source: 'MANUAL',
            }
        });
    }

    // 3. Create Leads (Telegram source)
    console.log('👥 Creating Leads (30)...');
    const leads = [];
    for (let i = 0; i < 30; i++) {
        const brand = random(BRANDS);
        const model = random(MODELS[brand]);
        const name = random(NAMES);

        const lead = await prisma.lead.create({
            data: {
                companyId,
                clientName: name,
                phone: '+38099' + randomInt(1000000, 9999999),
                status: random(['NEW', 'CONTACTED', 'IN_PROGRESS']),
                source: 'Telegram',
                request: `${brand} ${model}`,
                leadCode: `L-${randomInt(10000, 99999)}`,
                userTgId: `TG_${randomInt(1000, 9999)}`
            }
        });
        leads.push(lead);
    }

    // 4. Create Requests & Offers
    console.log('📋 Creating Requests & Offers...');
    // Create 10 requests from first 10 leads
    for (let i = 0; i < 10; i++) {
        const lead = leads[i];
        const req = await prisma.b2bRequest.create({
            data: {
                companyId,
                title: lead.request || 'Car Request',
                status: 'COLLECTING_VARIANTS',
                publicId: lead.leadCode,
                budgetMax: randomInt(20, 80) * 1000,
                city: random(CITIES),
                description: `Looking for ${lead.request}, urgently.`,
                chatId: lead.userTgId
            }
        });

        // Add 2-5 offers per request
        const offerCount = randomInt(2, 5);
        for (let j = 0; j < offerCount; j++) {
            const partner = random(partners);
            await prisma.requestVariant.create({
                data: {
                    requestId: req.id,
                    price: (req.budgetMax || 20000) - randomInt(-2000, 2000),
                    title: 'We have this in stock. Checking availability.',
                    status: 'SUBMITTED',
                    source: 'TELEGRAM_BOT',

                }
            });
        }
    }

    console.log('✅ PRODUCTION SEED COMPLETE.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
