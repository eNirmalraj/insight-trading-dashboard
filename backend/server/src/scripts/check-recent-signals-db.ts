import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from correct path
dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRecentSignals() {
    console.log('Checking recent signals...');
    const { data, error } = await supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching signals:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No signals found in the database.');
        return;
    }

    console.log(`Found ${data.length} recent signals.`);
    data.forEach((s) => {
        console.log(
            `[${new Date(s.created_at).toLocaleString()}] ${s.symbol} ${s.strategy} - ${s.status}`
        );
    });
}

checkRecentSignals();
