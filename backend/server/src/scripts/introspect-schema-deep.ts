// Deeper introspection for empty tables — use the PostgREST OPTIONS call
// or attempt inserts with minimum fields to coax out column info from errors.

import dotenv from 'dotenv';
dotenv.config();
import { supabaseAdmin } from '../services/supabaseAdmin';

// For empty tables, the only way to learn columns via the JS client is to insert
// progressively richer payloads and observe what errors come back, OR call the
// REST API directly with OPTIONS to get the OpenAPI spec.
// Supabase exposes an OpenAPI spec at ${SUPABASE_URL}/rest/v1/ — let's fetch it.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function fetchOpenApiDefinition(table: string): Promise<any> {
    const url = `${SUPABASE_URL}/rest/v1/`;
    const res = await fetch(url, {
        method: 'GET',
        headers: {
            apikey: SERVICE_KEY!,
            Authorization: `Bearer ${SERVICE_KEY}`,
            Accept: 'application/openapi+json',
        },
    });
    if (!res.ok) {
        console.error(`OpenAPI fetch failed: ${res.status}`);
        return null;
    }
    const spec = await res.json();
    return spec.definitions?.[table] || null;
}

const TABLES = ['watchlist_strategies', 'signals', 'signal_executions'];

(async () => {
    for (const table of TABLES) {
        console.log(`\n── ${table} ──`);
        const def = await fetchOpenApiDefinition(table);
        if (!def) {
            console.log('  (not in OpenAPI spec)');
            continue;
        }
        const props = def.properties || {};
        const required = new Set((def.required as string[]) || []);
        console.log(`  columns (${Object.keys(props).length}):`);
        for (const [name, info] of Object.entries(props)) {
            const i = info as any;
            const type = i.format || i.type || '?';
            const nullable = required.has(name) ? 'NOT NULL' : 'nullable';
            const def = i.default !== undefined ? `  default=${JSON.stringify(i.default)}` : '';
            console.log(`    ${name.padEnd(28)} ${type.padEnd(18)} ${nullable}${def}`);
        }
    }
    console.log('\n✅ Deep introspection done');
})();
