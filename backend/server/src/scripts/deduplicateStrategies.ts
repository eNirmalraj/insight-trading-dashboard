
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

const deduplicateStrategies = async () => {
    console.log('🧹 Deduplicating strategies...');

    const { data: strategies, error } = await supabase
        .from('strategies')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching strategies:', error);
        return;
    }

    const seenNames = new Set();
    const toDelete: string[] = [];

    // Keep the first (newest) one seen, delete others
    for (const strat of strategies) {
        if (seenNames.has(strat.name)) {
            toDelete.push(strat.id);
        } else {
            seenNames.add(strat.name);
        }
    }

    if (toDelete.length > 0) {
        console.log(`Found ${toDelete.length} duplicates to delete.`);
        const { error: delError } = await supabase
            .from('strategies')
            .delete()
            .in('id', toDelete);

        if (delError) console.error('Error deleting:', delError);
        else console.log('✅ Duplicates deleted.');
    } else {
        console.log('✅ No duplicates found.');
    }
};

deduplicateStrategies();
