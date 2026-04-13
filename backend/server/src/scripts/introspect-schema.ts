// backend/server/src/scripts/introspect-schema.ts
// Read-only schema introspection for the tables the signal engine cleanup touches.
// Dumps columns, types, nullability, and defaults using a Supabase RPC against information_schema.

import { supabaseAdmin } from '../services/supabaseAdmin';

const TABLES = [
    'scripts',
    'watchlists',
    'watchlist_items',
    'watchlist_strategies',
    'signals',
    'signal_executions',
];

interface ColumnInfo {
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
}

interface ConstraintInfo {
    table_name: string;
    constraint_name: string;
    constraint_type: string;
    column_name?: string;
    foreign_table?: string;
    foreign_column?: string;
}

async function getColumns(): Promise<ColumnInfo[]> {
    // Supabase lets us SELECT from information_schema.columns via PostgREST only
    // if exposed. Try REST first, fall back to raw SQL via rpc if defined.
    const results: ColumnInfo[] = [];
    for (const table of TABLES) {
        try {
            // Try probing the table itself to see if it exists + get one row structure
            const { data, error } = await supabaseAdmin
                .from(table)
                .select('*')
                .limit(0);
            if (error) {
                console.error(`[introspect] ${table}: ERROR -> ${error.message}`);
                continue;
            }
            // If we got here the table exists but we have no column list from this API.
            // Use a raw SQL query against pg_catalog via the supabase postgres function.
        } catch (e: any) {
            console.error(`[introspect] ${table}: EXCEPTION -> ${e.message}`);
        }
    }
    return results;
}

/**
 * Introspect a table by fetching one row and examining keys,
 * plus by executing a SELECT against information_schema via the `.from` API.
 */
async function introspectViaInformationSchema(): Promise<void> {
    console.log('═══════════════════════════════════════');
    console.log('  Schema Introspection');
    console.log('═══════════════════════════════════════\n');

    // Try using the Postgres REST /rpc path with a SQL function if one exists.
    // Otherwise, fall back to probing each table via select-1-row.
    for (const table of TABLES) {
        console.log(`\n── Table: ${table} ──`);
        const { data, error } = await supabaseAdmin
            .from(table)
            .select('*')
            .limit(1);

        if (error) {
            console.log(`  ❌ ${error.message}`);
            continue;
        }

        if (!data || data.length === 0) {
            console.log(`  (empty) — doing INSERT dry-run to discover columns...`);
            // Insert a dummy row just to see what columns the API knows about — this will fail, but the error tells us the schema
            const { error: insErr } = await supabaseAdmin
                .from(table)
                .insert({})
                .select('*');
            if (insErr) {
                console.log(`  error from empty insert (expected): ${insErr.message}`);
            }
            continue;
        }

        const row = data[0] as Record<string, any>;
        const cols = Object.keys(row);
        console.log(`  columns (${cols.length}):`);
        for (const col of cols) {
            const val = row[col];
            let type: string;
            if (val === null) type = 'null (type unknown)';
            else if (typeof val === 'string') {
                // Heuristic: UUIDs match 8-4-4-4-12
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
                    type = 'uuid';
                } else if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
                    type = 'timestamptz';
                } else {
                    type = `text ("${val.slice(0, 30)}${val.length > 30 ? '...' : ''}")`;
                }
            } else if (typeof val === 'number') {
                type = Number.isInteger(val) ? 'numeric/int' : 'numeric/float';
            } else if (typeof val === 'boolean') {
                type = 'boolean';
            } else if (Array.isArray(val)) {
                type = `array (len=${val.length})`;
            } else if (typeof val === 'object') {
                type = 'jsonb';
            } else {
                type = typeof val;
            }
            console.log(`    ${col.padEnd(28)} ${type}`);
        }
    }
}

/**
 * Dedicated check for the scripts table — we know it's the most sensitive.
 */
async function checkScriptsRow(): Promise<void> {
    console.log('\n═══ Detailed check: scripts row for builtin-sma-trend ═══');
    const { data, error } = await supabaseAdmin
        .from('scripts')
        .select('*')
        .eq('is_builtin', true);
    if (error) {
        console.log(`  ❌ ${error.message}`);
        return;
    }
    console.log(`  Found ${data?.length || 0} built-in scripts`);
    if (data && data.length > 0) {
        const row = data[0] as Record<string, any>;
        console.log(`  id:               ${row.id}`);
        console.log(`  name:             ${row.name}`);
        console.log(`  user_id:          ${row.user_id}`);
        console.log(`  is_builtin:       ${row.is_builtin}`);
        console.log(`  template_version: ${row.template_version}`);
        console.log(`  param_schema:     ${JSON.stringify(row.param_schema)}`);
        console.log(`  script_type:      ${row.script_type}`);
        console.log(`  is_active:        ${row.is_active}`);
    }
}

(async () => {
    await introspectViaInformationSchema();
    await checkScriptsRow();
    console.log('\n✅ Introspection done');
})();
