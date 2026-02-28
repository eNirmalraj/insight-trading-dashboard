
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from backend/server/.env if possible, or try root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use Service Role Key to bypass RLS

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const checkSignals = async () => {
    console.log("Checking recent signals in DB...");
    const { data, error } = await supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching signals:", error);
        return;
    }

    if (!data || data.length === 0) {
        console.log("No signals found.");
        return;
    }

    console.log(`Found ${data.length} recent signals:`);
    data.forEach(s => {
        console.log(`[${s.created_at}] ${s.symbol} (${s.direction}) - ${s.status}`);
    });
};

checkSignals();
