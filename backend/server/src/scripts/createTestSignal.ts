
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from parent (server root)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const createTestSignal = async () => {
    console.log('🧪 Creating TEST Signal...');

    // Create a fake SMA signal
    const testSignal = {
        symbol: 'TEST/USDT',
        strategy: 'SMA Trend Strategy',
        strategy_id: '11111111-1111-1111-1111-111111111111',
        direction: 'BUY',
        entry_price: 50000,
        stop_loss: 49000,
        take_profit: 52000,
        timeframe: '1m',
        status: 'Active',
        entry_type: 'Market'
    };

    const { data, error } = await supabase
        .from('signals')
        .insert(testSignal)
        .select()
        .single();

    if (error) {
        console.error('❌ Failed to insert test signal:', error);
    } else {
        console.log('✅ Test signal inserted successfully!');
        console.log('ID:', data.id);
        console.log('Strategy:', data.strategy);
    }
};

createTestSignal();
