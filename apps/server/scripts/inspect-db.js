// Database state inspection script
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspectDatabase() {
    try {
        // Check if v4.1 tables exist
        const v41Tables = [
            'workspaces', 'users', 'accounts', 'memberships',
            'entity_types', 'field_definitions', 'records', 'record_search_index',
            'relation_types', 'record_relations', 'record_external_keys',
            'dictionary_sets', 'dictionary_entries', 'dictionary_aliases',
            'pipelines', 'pipeline_stages', 'contacts', 'cases', 'case_contact_links',
            'channels', 'identities', 'conversations', 'messages', 'message_delivery',
            'ingestion_sources', 'parser_definitions', 'parser_versions',
            'ingestion_jobs', 'raw_documents', 'extracted_entities',
            'form_definitions', 'view_definitions'
        ];

        const results = await prisma.$queryRaw`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE '_prisma_%'
      ORDER BY tablename;
    `;

        const existingTables = results.map(r => r.tablename);

        console.log('\n=== DATABASE STATE INSPECTION ===\n');
        console.log(`Total tables in database: ${existingTables.length}`);
        console.log(`\nAll existing tables:`);
        existingTables.forEach(t => console.log(`  - ${t}`));

        console.log(`\n=== v4.1 TABLE STATUS ===\n`);

        const v41Found = [];
        const v41Missing = [];

        v41Tables.forEach(table => {
            if (existingTables.includes(table)) {
                v41Found.push(table);
            } else {
                v41Missing.push(table);
            }
        });

        console.log(`✅ v4.1 tables that EXIST (${v41Found.length}/${v41Tables.length}):`);
        v41Found.forEach(t => console.log(`  - ${t}`));

        console.log(`\n❌ v4.1 tables that are MISSING (${v41Missing.length}/${v41Tables.length}):`);
        v41Missing.forEach(t => console.log(`  - ${t}`));

        // Check for legacy tables
        const legacyTables = ['Company', 'User', 'BotConfig', 'Lead', 'B2bRequest'];
        const legacyFound = legacyTables.filter(t => existingTables.includes(t));

        console.log(`\n=== LEGACY TABLE STATUS ===\n`);
        console.log(`✅ Legacy tables found (${legacyFound.length}):`);
        legacyFound.forEach(t => console.log(`  - ${t}`));

    } catch (error) {
        console.error('Error inspecting database:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

inspectDatabase();
