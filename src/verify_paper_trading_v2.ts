
// Verification Script for Paper Trading Execution Layer (V2)
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env and .env.local
const envPath = path.resolve(process.cwd(), '.env');
const envLocalPath = path.resolve(process.cwd(), '.env.local');

dotenv.config({ path: envPath });
dotenv.config({ path: envLocalPath });

// Manual Fallback if dotenv fails (which seems to happen in some contexts)
if (!process.env.VITE_SUPABASE_URL && fs.existsSync(envLocalPath)) {
    console.log("Manual parsing of .env.local...");
    const envConfig = fs.readFileSync(envLocalPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim(); // Rejoin value in case it had =
            if (key && value) {
                process.env[key] = value;
            }
        }
    });
}

console.log("Script v2 started...");
console.log("CWD:", process.cwd());
console.log("Supabase URL:", process.env.VITE_SUPABASE_URL ? "Defined" : "Undefined");

// Import types (static imports are fine for types)
import { SignalStatus, TradeDirection, EntryType, Timeframe } from './types';

async function verifyPaperTrading() {
    console.log("Starting Paper Trading Verification v2...");

    // Dynamic Import to ensure Env is ready BEFORE imports run
    const { supabase } = await import('./services/supabaseClient');
    const { createPaperTrade, closePaperTrade } = await import('./services/paperTradingService');

    if (!supabase) {
        console.error("❌ Supabase client is NULL. Check environment variables.");
        return;
    }

    try {

        // 1. Setup Test Strategy (Using existing one to avoid FK issues)
        const strategyId = '11111111-1111-1111-1111-111111111111';
        const userId = '9d26ad9c-949e-4aec-8a24-91c6fc122afd';
        console.log("Using Hardcoded Strategy:", strategyId);

        // 2. Fetch an existing ACTIVE signal (or Create one if needed, but fetching is safer for FKs)
        const { data: signals, error: signalError } = await supabase
            .from('signals')
            .select('*')
            .eq('status', 'Active') // Fetch an active one
            .limit(1);

        if (signalError || !signals || signals.length === 0) {
            console.error("Failed to fetch any active signal. Please ensure DB has at least one active signal.");
            return;
        }

        const dbSignal = signals[0];
        console.log("Using Signal:", dbSignal.id, dbSignal.symbol);

        // 3. Map DB Signal to Application Signal Type
        // IMPORTANT: The DB returns strings (e.g. 'BUY'), but our App uses Enums.
        // We must cast them correctly.

        const signalForService = {
            id: dbSignal.id,
            pair: dbSignal.symbol, // Map symbol -> pair
            strategy: 'Test Strategy',
            strategyId: dbSignal.strategy_id,
            direction: dbSignal.direction as TradeDirection, // Cast string to Enum
            entry: dbSignal.entry_price,
            entryType: dbSignal.entry_type as EntryType,
            stopLoss: dbSignal.stop_loss,
            takeProfit: dbSignal.take_profit,
            status: parseSignalStatus(dbSignal.status),
            timestamp: dbSignal.created_at,
            timeframe: dbSignal.timeframe as Timeframe,
            // Optional fields
            lotSize: 0.1,
            leverage: 10
        };

        // 4. Trigger Paper Trade Creation
        console.log("Calling createPaperTrade...");
        await createPaperTrade(signalForService as any, userId);
        // Note: 'as any' used here because Signal type in types.ts might be slightly different 
        // from what we constructed if imports are mixed, but mainly to satisfy strict checks during this script.
        // In real app, mapper functions handle this.

        // Wait for async processing
        await new Promise(r => setTimeout(r, 2000));

        // 5. Verify Trade in DB
        const { data: trade } = await supabase
            .from('paper_trades')
            .select('*')
            .eq('signal_id', dbSignal.id)
            .single();

        if (trade) {
            console.log("✅ Trade Created Successfully:", trade.id);
            console.log("   Status:", trade.status);
            console.log("   Entry:", trade.entry_price);
        } else {
            console.error("❌ Trade Creation FAILED - Trade not found in DB.");
        }

    } catch (e) {
        console.error("Verification Error:", e);
    }
}

// Helper to parse Status string to Enum
function parseSignalStatus(status: string): SignalStatus {
    switch (status) {
        case 'Active': return SignalStatus.ACTIVE;
        case 'Closed': return SignalStatus.CLOSED;
        case 'Pending': return SignalStatus.PENDING;
        default: return SignalStatus.PENDING;
    }
}

verifyPaperTrading();
