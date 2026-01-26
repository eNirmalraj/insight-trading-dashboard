
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

const clearStrategies = async () => {
    console.log('🗑️ Clearing strategies table...');

    // 1. Clear Strategy Signal Config (Foreign Key Dependency)
    const { error: configError } = await supabase
        .from('strategy_signal_config')
        .delete()
        .neq('strategy_id', '00000000-0000-0000-0000-000000000000');

    if (configError) console.error('Error clearing config:', configError);
    else console.log('✅ Config cleared.');

    // 2. Clear Strategies
    const { error: stratError } = await supabase
        .from('strategies')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

    if (stratError) console.error('Error clearing strategies:', stratError);
    else console.log('✅ Strategies cleared.');
};

clearStrategies();
