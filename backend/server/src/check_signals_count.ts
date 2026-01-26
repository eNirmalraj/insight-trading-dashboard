
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
    const { count, error } = await supabase
        .from('signals')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error("Error counting signals:", error);
    } else {
        console.log(`Total Signals in DB: ${count}`);
    }
};

check();
