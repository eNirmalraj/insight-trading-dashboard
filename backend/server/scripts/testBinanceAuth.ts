// Verifies whether our testnet path actually authenticates the API key.
// Uses a deliberately invalid key — if fetchBalance succeeds, auth is not being checked.

import ccxt from 'ccxt';

async function probe(label: string, apiKey: string, secret: string) {
    const ex = new (ccxt as any).binanceusdm({ apiKey, secret, enableRateLimit: true });
    ex.setSandboxMode(true);
    try {
        const bal = await ex.fetchBalance();
        console.log(`[${label}] ✓ fetchBalance OK — free keys:`, Object.keys(bal?.free || {}).slice(0, 5));
    } catch (e: any) {
        console.log(`[${label}] ✗ fetchBalance FAILED — ${e.constructor.name}: ${e.message?.slice(0, 200)}`);
    }
}

(async () => {
    await probe('INVALID_KEY', 'obviously-not-a-real-key', 'obviously-not-a-real-secret');
    await probe('EMPTY_KEY', '', '');
    await probe('RANDOM_64CHAR', 'a'.repeat(64), 'b'.repeat(64));
})();
