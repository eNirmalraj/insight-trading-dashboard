
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

const clearSignals = async () => {
    console.log('🗑️ Clearing all signals from database...');

    // Check if table exists/has data
    const { count, error: countErr } = await supabase
        .from('signals')
        .select('*', { count: 'exact', head: true });

    if (countErr) {
        console.error('Error checking signals:', countErr);
        return;
    }

    console.log(`Found ${count} signals to delete.`);

    if (count === 0) {
        console.log('Database is already empty.');
        return;
    }

    // Delete all
    const { error } = await supabase
        .from('signals')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete where ID is not nil (effectively all)

    if (error) {
        console.error('Error deleting signals:', error);
    } else {
        console.log('✅ Successfully deleted all signals.');
    }
};

clearSignals();
