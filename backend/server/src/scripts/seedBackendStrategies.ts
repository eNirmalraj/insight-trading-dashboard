
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { BUILT_IN_STRATEGIES } from '../constants/builtInStrategies';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const seedBackendStrategies = async () => {
    console.log('🌱 Seeding Backend Strategies to satisfy FK...');

    // We assume the user ID is not strictly needed for system strategies, 
    // OR we need to assign them to a system user.
    // Usually system strategies exist globally or we fetch a user?
    // Let's check table schema? 'user_id' usually required.
    // We will try to fetch the first user found or use a nil UUID if allowed.

    // Fetch a user
    const userId = '9d26ad9c-949e-4aec-8a24-91c6fc122afd';
    // If no users, we might fail on user_id FK if it exists. 
    // But 'strategies' table usually has user_id.

    for (const strat of BUILT_IN_STRATEGIES) {
        const payload = {
            id: strat.id,
            user_id: userId,
            name: strat.name,
            description: strat.description,
            type: 'STRATEGY',
            timeframe: '1H', // Default
            symbol_scope: [],
            indicators: strat.indicators,
            entry_rules: strat.entryRules,
            exit_rules: [],
            is_active: true,
            content: strat
        };

        const { error } = await supabase
            .from('strategies')
            .upsert(payload)
            .select()
            .single();

        if (error) {
            console.error(`❌ Failed to seed ${strat.name}:`, error);
        } else {
            console.log(`✅ Seeded ${strat.name}`);
        }
    }
};

seedBackendStrategies();
