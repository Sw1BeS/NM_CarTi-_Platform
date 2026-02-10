
import { parseStartPayload } from './apps/server/src/utils/deeplink.utils.js';
import { resolvePublicSlug } from './apps/server/src/services/publicSlug.service.js';
import { prisma } from './apps/server/src/services/prisma.js';

async function verify() {
    console.log('--- Verifying B2B Flow Components ---\n');

    // 1. Deep Link Parsing
    console.log('1. Testing Deep Link Parsing (request_{id})');
    const payload = 'request_REQ-12345';
    const parsed = parseStartPayload(payload);
    console.log(`Input: ${payload}`);
    console.log(`Parsed:`, parsed);

    if (parsed?.type === 'request' && parsed.id === 'REQ-12345') {
        console.log('✅ Deep link parsed correctly.\n');
    } else {
        console.error('❌ Deep link parsing failed.\n');
    }

    // 2. Slug Resolution
    console.log('2. Testing Public Slug Resolution (cartie)');
    try {
        const slug = 'cartie';
        const resolution = await resolvePublicSlug(slug);
        console.log(`Input: ${slug}`);
        console.log(`Resolution:`, resolution);

        if (resolution.companyId) {
            console.log('✅ Slug resolved to Company ID:', resolution.companyId);
        } else {
            console.log('❌ Slug failed to resolve (Company ID null).');
        }
    } catch (e) {
        console.error('❌ Slug resolution threw error:', e);
    }

    console.log('\n--- Verification Complete ---');
}

verify().catch(console.error).finally(async () => {
    await prisma.$disconnect();
});
