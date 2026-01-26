import ccxt from 'ccxt';

interface TradeParams {
    exchangeId: string; // e.g., 'binance'
    apiKey: string;
    apiSecret: string;
    symbol: string; // e.g., 'BTC/USDT'
    side: 'buy' | 'sell';
    amount: number; // Quantity in base currency
    type?: 'market' | 'limit';
    price?: number;
}

export class TradeExecutor {

    /**
     * Executes a trade on the specified exchange using CCXT.
     */
    static async executeTrade(params: TradeParams) {
        console.log(`[EXECUTOR] Preparing ${params.side.toUpperCase()} ${params.amount} ${params.symbol} on ${params.exchangeId}...`);

        try {
            // 1. Initialize Exchange
            const exchangeClass = (ccxt as any)[params.exchangeId];
            if (!exchangeClass) {
                throw new Error(`Exchange '${params.exchangeId}' not supported by CCXT.`);
            }

            const exchange = new exchangeClass({
                apiKey: params.apiKey,
                secret: params.apiSecret,
                enableRateLimit: true,
            });

            // 2. Load Markets (Required for precision/validation)
            // await exchange.loadMarkets(); 
            // In a real scenario, cache this or load selectively.

            // 3. Environment Check
            if (process.env.PAPER_TRADING === 'true') {
                console.log(`[PAPER TRADING] Order simulated: ${params.side} ${params.amount} ${params.symbol}`);
                return {
                    id: 'mock-' + Date.now(),
                    status: 'closed',
                    filled: params.amount,
                    price: params.price || 0,
                    info: { note: 'Paper Trading Mode' }
                };
            }

            // 4. Place Order (REAL)
            const orderType = params.type || 'market';
            const order = await exchange.createOrder(
                params.symbol,
                orderType,
                params.side,
                params.amount,
                params.price // undefined for market orders
            );

            console.log(`[EXECUTOR] Order Placed: ID ${order.id}`);
            return order;

        } catch (error) {
            console.error(`[EXECUTOR] Trade Failed: ${(error as Error).message}`);
            throw error;
        }
    }
}
