
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const check = async () => {
    const { data: signals, error } = await supabase
        .from('signals')
        .select('status, strategy, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching signals:", error);
        return;
    }

    const { data: counts, error: countError } = await supabase
        .from('signals')
        .select('status');

    if (countError) {
        console.error("Error counting statuses:", countError);
        return;
    }

    const statusMap: Record<string, number> = {};
    counts.forEach((s: any) => {
        statusMap[s.status] = (statusMap[s.status] || 0) + 1;
    });

    console.log("Status Distribution:");
    console.log(JSON.stringify(statusMap, null, 2));

    console.log("\nLatest 10 Signals:");
    signals.forEach((s: any) => {
        console.log(`${s.created_at} | ${s.status} | ${s.strategy}`);
    });
};

check();
