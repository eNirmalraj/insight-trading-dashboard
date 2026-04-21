// Simulates the OLD code path (ccxt.binance spot + setSandboxMode) to see
// whether testnet.binance.vision accepts demo-fapi futures keys.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import ccxt from 'ccxt';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
    const { data } = await supabase
        .from('user_exchange_keys')
        .select('api_key, api_secret, nickname')
        .eq('environment', 'testnet')
        .eq('exchange', 'binance')
        .maybeSingle();

    if (!data) { console.log('No testnet row'); return; }
    console.log(`Testing key ${data.api_key.slice(0, 6)}… (${data.nickname})`);

    // OLD PATH: ccxt.binance (spot) + setSandboxMode
    const oldEx = new ccxt.binance({ apiKey: data.api_key, secret: data.api_secret });
    oldEx.setSandboxMode(true);
    console.log('\n[OLD PATH: ccxt.binance + setSandboxMode]');
    console.log('  url:', oldEx.urls.api.private);
    try {
        await oldEx.fetchBalance();
        console.log('  → ✓ SUCCESS (Binance spot testnet accepted the key)');
    } catch (e: any) {
        console.log('  → ✗ FAIL:', e.message?.slice(0, 150));
    }

    // NEW PATH: binanceusdm + demo-fapi.binance.com
    const newEx = new (ccxt as any).binanceusdm({ apiKey: data.api_key, secret: data.api_secret });
    const base = 'https://demo-fapi.binance.com';
    newEx.urls.api.fapiPrivate = `${base}/fapi/v1`;
    newEx.urls.api.fapiPrivateV2 = `${base}/fapi/v2`;
    newEx.urls.api.fapiPrivateV3 = `${base}/fapi/v3`;
    console.log('\n[NEW PATH: binanceusdm → demo-fapi.binance.com]');
    try {
        await newEx.fetchBalance();
        console.log('  → ✓ SUCCESS');
    } catch (e: any) {
        console.log('  → ✗ FAIL:', e.message?.slice(0, 150));
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
