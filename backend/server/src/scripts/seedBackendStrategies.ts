
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { BUILT_IN_STRATEGIES } from '../constants/builtInStrategies';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const seedBackendStrategies = async () => {
    console.log('🌱 Checking for Kuri legacy strategies...');

    // 1. Delete all Kuri script legacy rows
    const { error: deleteKuriError } = await supabase
        .from('strategies')
        .delete()
        .eq('type', 'KURI');

    if (deleteKuriError) {
        console.warn('Note: Could not delete KURI strategies, they might not exist:', deleteKuriError.message);
    } else {
        console.log('✅ Deleted any legacy KURI strategies');
    }

    // 2. Clear out any built-ins that used kuriScript
    const { error: deleteOldBuiltinsError } = await supabase
        .from('strategies')
        .delete()
        .in('id', BUILT_IN_STRATEGIES.map(s => s.id));

    if (deleteOldBuiltinsError) {
        console.warn('Note: Resetting old built-ins encountered an issue:', deleteOldBuiltinsError.message);
    } else {
        console.log('✅ Cleared old built-ins to pave way for Rule-based strategies');
    }

    console.log('🌱 Seeding Backend Strategies to satisfy FK...');

    // Fetch the first profile to attach the system strategies to
    const { data: profiles, error: profileErr } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);

    if (profileErr || !profiles || profiles.length === 0) {
        console.error('❌ Could not find a user profile to map the strategies. Please sign up at least once.');
        return;
    }

    const userId = profiles[0].id;

    for (const strat of BUILT_IN_STRATEGIES) {
        const payload = {
            id: strat.id,
            user_id: userId,
            name: strat.name,
            description: strat.description,
            type: 'STRATEGY',
            timeframe: '1H',
            symbol_scope: [],
            indicators: strat.indicators,
            entry_rules: strat.entryRules,
            exit_rules: strat.exitRules || [],
            is_active: true,
            content: strat
        };

        const { error } = await supabase
            .from('strategies')
            .upsert(payload, { onConflict: 'id' })
            .select()
            .single();

        if (error) {
            console.error(`❌ Failed to seed ${strat.name}:`, error);
        } else {
            console.log(`✅ Seeded ${strat.name}`);
        }
    }
    console.log('🎉 Done checking and updating Supabase successfully!');
};

seedBackendStrategies();
