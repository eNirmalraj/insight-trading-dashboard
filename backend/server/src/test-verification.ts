import { TradeExecutor } from './services/tradeExecutor';
import dotenv from 'dotenv';
dotenv.config();

async function testBackend() {
    console.log('🧪 Starting Backend Verification Test...');

    // Mock Params
    const tradeParams = {
        exchangeId: 'binance',
        apiKey: 'mock-api-key',
        apiSecret: 'mock-api-secret',
        symbol: 'BTC/USDT',
        side: 'buy' as const,
        amount: 0.001
    };

    try {
        console.log('1. Testing Trade Executor (Paper Mode)...');
        // Ensure PAPER_TRADING is true for test
        process.env.PAPER_TRADING = 'true';

        const result = await TradeExecutor.executeTrade(tradeParams);

        if (result && result.id.startsWith('mock-')) {
            console.log('✅ Trade Executor Passed: Mock Order Created', result);
        } else {
            console.error('❌ Trade Executor Failed: Unexpected result', result);
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Test Failed:', error);
        process.exit(1);
    }
}

testBackend();
