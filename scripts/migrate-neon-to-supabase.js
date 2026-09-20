import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { tableStatements, indexStatements, UPDATE_TIMESTAMP_FUNCTION, triggerDefinitions } from '../src/utils/database/schema.js';
import { pgConfig } from '../src/config/database/postgres.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NEON_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_DATABASE_URL || process.argv[2];

if (!NEON_URL) {
    console.error('❌ Error: POSTGRES_URL / DATABASE_URL not found in .env (Neon URL missing)');
    process.exit(1);
}

if (!SUPABASE_URL) {
    console.error('❌ Error: Please provide Supabase Connection URL as argument or in .env (SUPABASE_DATABASE_URL)');
    process.exit(1);
}

function sanitizeValue(val) {
    if (val === null || val === undefined) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'object') {
        return JSON.stringify(val);
    }
    return val;
}

async function runMigration() {
    console.log('🔄 Connecting to Neon (Source DB)...');
    const neonPool = new pg.Pool({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } });

    console.log('🔄 Connecting to Supabase (Destination DB)...');
    const supabaseClient = new pg.Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
    await supabaseClient.connect();

    try {
        // 1. Test connection to Neon
        await neonPool.query('SELECT 1');
        console.log('✅ Connected to Neon successfully.');
        console.log('✅ Connected to Supabase successfully.');

        // 2. Initialize schema on Supabase
        console.log('\n📦 Creating schema and tables in Supabase...');
        await supabaseClient.query(UPDATE_TIMESTAMP_FUNCTION);

        for (const stmt of tableStatements) {
            await supabaseClient.query(stmt);
        }

        for (const stmt of indexStatements) {
            await supabaseClient.query(stmt);
        }

        for (const stmt of triggerDefinitions) {
            await supabaseClient.query(stmt);
        }
        console.log('✅ Supabase tables and schema created successfully.');

        // 3. Migrate data table by table
        const tables = Object.values(pgConfig.tables);
        console.log('\n🚚 Migrating data from Neon to Supabase...');

        // Disable foreign key constraints temporarily for bulk transfer
        await supabaseClient.query("SET session_replication_role = 'replica';");

        let totalRowsMigrated = 0;

        for (const table of tables) {
            try {
                // Check if table exists in Neon
                const check = await neonPool.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' AND table_name = $1
                    );
                `, [table]);

                if (!check.rows[0].exists) {
                    continue;
                }

                // Fetch data from Neon
                const res = await neonPool.query(`SELECT * FROM "${table}"`);
                const rows = res.rows;

                if (rows.length === 0) {
                    console.log(`  • Table "${table}": 0 rows (Empty, skipped)`);
                    continue;
                }

                console.log(`  • Table "${table}": Transferring ${rows.length} rows...`);

                const columns = Object.keys(rows[0]);
                const colNames = columns.map(c => `"${c}"`).join(', ');

                for (const row of rows) {
                    const values = columns.map(c => sanitizeValue(row[c]));
                    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

                    await supabaseClient.query(`
                        INSERT INTO "${table}" (${colNames}) 
                        VALUES (${placeholders})
                        ON CONFLICT DO NOTHING
                    `, values);
                }

                totalRowsMigrated += rows.length;
                console.log(`    ✅ "${table}" migrated (${rows.length} rows)`);
            } catch (tableErr) {
                console.warn(`    ⚠️ Warning on table "${table}":`, tableErr.message);
            }
        }

        // Also check if kv_store exists
        try {
            const kvCheck = await neonPool.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = 'kv_store'
                );
            `);
            if (kvCheck.rows[0]?.exists) {
                const kvRes = await neonPool.query('SELECT * FROM "kv_store"');
                if (kvRes.rows.length > 0) {
                    console.log(`  • Table "kv_store": Transferring ${kvRes.rows.length} keys...`);
                    for (const row of kvRes.rows) {
                        await supabaseClient.query(`
                            INSERT INTO "kv_store" ("key", "value", "expires_at", "created_at", "updated_at")
                            VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT ("key") DO NOTHING
                        `, [row.key, sanitizeValue(row.value), row.expires_at, row.created_at, row.updated_at]);
                    }
                    totalRowsMigrated += kvRes.rows.length;
                    console.log(`    ✅ "kv_store" migrated (${kvRes.rows.length} keys)`);
                }
            }
        } catch (kvErr) {
            console.warn('kv_store check skipped:', kvErr.message);
        }

        // Re-enable foreign key constraints
        await supabaseClient.query("SET session_replication_role = 'origin';");

        console.log(`\n🎉 MIGRATION COMPLETED SUCCESSFULLY! Total ${totalRowsMigrated} rows transferred to Supabase.`);
        console.log('\n👉 Next step: Updating POSTGRES_URL in .env to Supabase...');

    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await neonPool.end().catch(() => null);
        await supabaseClient.end().catch(() => null);
    }
}

runMigration();
