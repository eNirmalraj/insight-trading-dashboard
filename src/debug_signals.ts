
import { fetchFuturesSymbols } from './services/marketDataService';
import { runAllStrategies } from './engine/strategyEngine';

async function debug() {
    console.log("--- DEBUGGING SYMBOL FETCHING ---");
    try {
        const symbols = await fetchFuturesSymbols();
        console.log(`Fetched ${symbols.length} symbols.`);
        if (symbols.length > 0) {
            console.log("First 5 symbols:", JSON.stringify(symbols.slice(0, 5), null, 2));
        } else {
            console.log("No symbols fetched! Checking fallback logic is not here, but in engine.");
        }

        const sample = symbols.find(s => s.symbol.includes('SOL'));
        if (sample) {
            console.log("SOL Sample:", sample);
        }

        // Simulate Engine Logic
        const topSymbols = symbols
            .filter(s => {
                if (s.type !== 'Crypto') return false;
                if (s.market !== 'Futures') return false;
                return s.symbol.includes('USDT') || s.symbol.includes('USD');
            })
            .slice(0, 5);

        console.log("--- ENGINE FILTERED SYMBOLS ---");
        topSymbols.forEach(s => console.log(s.symbol));

    } catch (e) {
        console.error("Error fetching symbols:", e);
    }
}

debug();
