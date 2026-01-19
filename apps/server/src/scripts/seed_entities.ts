
import { prisma } from '../services/prisma.js';
import dotenv from 'dotenv';

// Fix path to .env since this script is run from server/src/scripts or similar
dotenv.config();


const DEFINITIONS = [
    { slug: 'sys_company', name: 'Company', description: 'Partner Companies' },
    { slug: 'sys_user', name: 'User', description: 'System Users (Legacy/View)' }, // Optional if using real table
    { slug: 'bot_scenario', name: 'Scenario', description: 'Bot Logic Scenarios' },
    { slug: 'tg_content', name: 'Content', description: 'Telegram Content Assets' },
    { slug: 'tg_campaign', name: 'Campaign', description: 'Marketing Campaigns' },
    { slug: 'tg_message', name: 'Message', description: 'Campaign Messages' },
    { slug: 'tg_bot', name: 'Bot', description: 'Bot Instances (View)' },
    { slug: 'tg_destination', name: 'Destination', description: 'Broadcast Destinations' },
    { slug: 'car_listing', name: 'Inventory', description: 'Vehicle Inventory' },
    { slug: 'sys_notification', name: 'Notification', description: 'System Alerts' },
    { slug: 'sys_activity', name: 'Activity Log', description: 'User Actions' },
    { slug: 'sys_dictionary', name: 'Dictionary', description: 'Global Dictionaries' },
    { slug: 'sys_snapshot', name: 'Snapshot', description: 'System Backups' },
    { slug: 'b2b_proposal', name: 'Proposal', description: 'B2B Offer Proposals' }
];

async function main() {
    console.log('🌱 Seeding Entity Definitions...');

    for (const def of DEFINITIONS) {
        const exists = await prisma.entityDefinition.findUnique({ where: { slug: def.slug } });
        if (!exists) {
            await prisma.entityDefinition.create({
                data: {
                    slug: def.slug,
                    name: def.name,
                    description: def.description,
                    status: 'ACTIVE'
                }
            });
            console.log(`✅ Created definition: ${def.slug}`);
        } else {
            console.log(`Skipping existing: ${def.slug}`);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
