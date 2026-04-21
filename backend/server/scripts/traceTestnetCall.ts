// Runs testConnection against the user's stored testnet row and prints
// the exact URL ccxt picks, the response, and any error.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { testConnection } from '../src/services/exchangeConnector';
import ccxt from 'ccxt';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
    // Find the testnet row
    const { data: rows } = await supabase
        .from('user_exchange_keys')
        .select('id, nickname, environment, api_key, api_secret')
        .eq('exchange', 'binance')
        .eq('environment', 'testnet');

    if (!rows?.length) {
        console.log('No testnet row found.');
        return;
    }
    const row = rows[0];
    console.log(`Row: ${row.nickname} (${row.id.slice(0, 8)})`);
    console.log('Key prefix:', row.api_key.slice(0, 6), '...');

    // Direct probe using ccxt to show what URL it hits
    const ex = new (ccxt as any).binanceusdm({
        apiKey: row.api_key,
        secret: row.api_secret,
        enableRateLimit: true,
    });
    try {
        ex.setSandboxMode(true);
        console.log('\n== after setSandboxMode(true) ==');
        console.log('fapiPrivate URL:', ex.urls.api?.fapiPrivate);

        console.log('\n== calling fetchBalance ==');
        const bal = await ex.fetchBalance();
        const free = Object.entries(bal?.free || {}).filter(([, v]) => Number(v) > 0);
        console.log('SUCCESS — non-zero free balances:', free.slice(0, 5));
    } catch (e: any) {
        console.log('ERROR:', e.constructor.name);
        console.log('MESSAGE:', e.message?.slice(0, 400));
    }

    // Now run our actual testConnection wrapper (what the UI calls)
    console.log('\n== running testConnection wrapper ==');
    const result = await testConnection(row.id);
    console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
