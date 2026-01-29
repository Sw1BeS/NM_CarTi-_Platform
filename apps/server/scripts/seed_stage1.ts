
import { PrismaClient } from '@prisma/client';
// @ts-ignore
import { writeService } from '../src/services/v41/writeService.js';

const prisma = new PrismaClient();

const BRANDS = ['BMW', 'Mercedes-Benz', 'Audi', 'Toyota', 'Volkswagen', 'Lexus', 'Porsche', 'Land Rover'];
const MODELS: Record<string, string[]> = {
    'BMW': ['320d', '520d', 'X5', 'X3', 'M3', '740d'],
    'Mercedes-Benz': ['C200', 'E220', 'S500', 'G63', 'GLE', 'GLS'],
    'Audi': ['A4', 'A6', 'Q7', 'Q8', 'RS6'],
    'Toyota': ['Camry', 'RAV4', 'Land Cruiser 300', 'Prado'],
    'Volkswagen': ['Golf', 'Passat', 'Touareg', 'Tiguan'],
    'Lexus': ['RX350', 'ES300h', 'LX600'],
    'Porsche': ['Cayenne', 'Macan', '911', 'Panamera'],
    'Land Rover': ['Range Rover', 'Defender', 'Discovery']
};
const CITIES = ['Kyiv', 'Lviv', 'Odesa', 'Dnipro', 'Kharkiv'];
const NAMES = ['Oleksandr', 'Dmytro', 'Andrii', 'Iryna', 'Olena', 'Maksym', 'Yulia', 'Nataliia'];
const PHONES = ['+38050', '+38067', '+38063', '+38099'];

const getRandomElement = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

async function main() {
    console.log('🚀 Starting Stage 1 Seed...');

    // 1. Ensure System & Cartie Company (Reuse existing via find)
    let company = await prisma.workspace.findUnique({ where: { slug: 'cartie' } });
    if (!company) {
        console.log('⚠️ Cartie company not found. Please run "npm run seed" first.');
        process.exit(1);
    }
    const companyId = company.id;

    // 2. Seed Partners
    console.log('🤝 Seeding Partners...');
    const partners = ['AutoDeal UA', 'Premium Cars Lviv', 'Kyiv Drive', 'Odesa Imports', 'Dnipro Motors'];
    for (const pName of partners) {
        const existing = await prisma.partnerCompany.findFirst({ where: { name: pName, companyId } });
        if (!existing) {
            await prisma.partnerCompany.create({
                data: {
                    name: pName,
                    city: getRandomElement(CITIES),
                    contact: getRandomElement(NAMES),
                    companyId,
                    users: {
                        create: {
                            name: `${getRandomElement(NAMES)} Manager`,
                            phone: `${getRandomElement(PHONES)}${getRandomInt(1000000, 9999999)}`,
                            telegramId: `${getRandomInt(100000000, 999999999)}`,
                            companyId
                        }
                    }
                }
            });
        }
    }

    // 3. Seed Inventory (50+)
    console.log('🚗 Seeding Inventory...');
    for (let i = 0; i < 60; i++) {
        const brand = getRandomElement(BRANDS);
        const model = getRandomElement(MODELS[brand]);
        const year = getRandomInt(2015, 2024);
        const price = getRandomInt(15, 120) * 1000;
        const id = `car_stage1_${i}`;

        await prisma.carListing.upsert({
            where: { id },
            create: {
                id,
                source: Math.random() > 0.3 ? 'MTPROTO' : 'MANUAL',
                title: `${brand} ${model} ${year}`,
                price,
                currency: 'USD',
                year,
                mileage: getRandomInt(10, 150) * 1000,
                location: getRandomElement(CITIES),
                status: 'AVAILABLE',
                mediaUrls: [`https://picsum.photos/seed/${brand}${model}${i}/600/400`],
                companyId,
                specs: {
                    fuel: getRandomElement(['Diesel', 'Petrol', 'Hybrid']),
                    transmission: 'Automatic'
                }
            },
            update: {
                price,
                status: 'AVAILABLE'
            }
        });
    }

    // 4. Seed Leads (30+)
    console.log('👥 Seeding Leads...');
    const bots = await prisma.botConfig.findMany({ where: { companyId } });
    const botId = bots[0]?.id;

    for (let i = 0; i < 35; i++) {
        const name = getRandomElement(NAMES);
        const brand = getRandomElement(BRANDS);
        const model = getRandomElement(MODELS[brand]);
        const id = `lead_stage1_${i}`;

        await prisma.lead.upsert({
            where: { id },
            create: {
                id,
                clientName: name,
                phone: `${getRandomElement(PHONES)}${getRandomInt(1000000, 9999999)}`,
                status: getRandomElement(['NEW', 'CONTACTED', 'IN_PROGRESS', 'DONE']),
                source: 'TELEGRAM',
                request: `Interested in ${brand} ${model}`,
                botId,
                companyId,
                userTgId: `${getRandomInt(100000000, 999999999)}`
            },
            update: {
                status: getRandomElement(['NEW', 'CONTACTED', 'IN_PROGRESS', 'DONE'])
            }
        });
    }

    // 5. Seed Requests (15+) & Offers (30+)
    console.log('📨 Seeding Requests & Offers...');
    for (let i = 0; i < 15; i++) {
        const brand = getRandomElement(BRANDS);
        const model = getRandomElement(MODELS[brand]);
        const year = getRandomInt(2018, 2024);
        const budget = getRandomInt(20, 80) * 1000;
        const id = `req_stage1_${i}`;

        const req = await prisma.b2bRequest.upsert({
            where: { id },
            create: {
                id,
                title: `Buy ${brand} ${model} ${year}+`,
                description: `Client wants ${brand} ${model}, budget around ${budget}$`,
                budgetMax: budget,
                yearMin: year,
                city: getRandomElement(CITIES),
                status: getRandomElement(['PUBLISHED', 'COLLECTING_VARIANTS', 'SHORTLIST']),
                companyId,
                type: 'BUY'
            },
            update: {
                title: `Buy ${brand} ${model} ${year}+`
            }
        });

        // Add 1-4 variants per request
        // Since we don't track variants with deterministic IDs easily, we will skip adding them if request existed (simple idempotency)
        // Or we could delete existing variants and recreate.
        const existingVariants = await prisma.requestVariant.count({ where: { requestId: req.id } });

        if (existingVariants === 0) {
            const variantCount = getRandomInt(1, 4);
            for (let j = 0; j < variantCount; j++) {
                const vYear = year + getRandomInt(-1, 2);
                const vPrice = budget + getRandomInt(-2000, 2000);

                await prisma.requestVariant.create({
                    data: {
                        requestId: req.id,
                        title: `${brand} ${model} ${vYear}`,
                        price: vPrice,
                        currency: 'USD',
                        year: vYear,
                        mileage: getRandomInt(20, 100) * 1000,
                        location: getRandomElement(CITIES),
                        status: 'SUBMITTED',
                        source: 'PARTNER'
                    }
                });
            }
        }
    }

    // 6. Seed MTProto Channels (Mock)
    console.log('📱 Seeding MTProto Channels...');
    // Check if connector exists
    const connector = await prisma.mTProtoConnector.findFirst({ where: { companyId } });
    if (connector) {
        const channels = [
            { id: '-100111222333', title: 'AutoMarket UA' },
            { id: '-100444555666', title: 'Cars Kyiv Selling' }
        ];

        for (const ch of channels) {
            // Check existence
            const count = await prisma.channelSource.count({
                where: { connectorId: connector.id, channelId: ch.id }
            });
            if (count === 0) {
                await prisma.channelSource.create({
                    data: {
                        connectorId: connector.id,
                        channelId: ch.id,
                        title: ch.title,
                        status: 'ACTIVE',
                        importRules: { autoPublish: false }
                    }
                });
            }
        }
    }

    console.log('✅ Stage 1 Seed Complete!');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
