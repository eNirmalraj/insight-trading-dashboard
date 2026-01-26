
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const checkColumn = async () => {
    console.log("🔍 Checking for 'is_pinned' column in 'signals' table...");

    // Try to select the column
    const { data, error } = await supabase
        .from('signals')
        .select('id, is_pinned')
        .limit(1);

    if (error) {
        console.error("❌ Error querying is_pinned:", error.message);
        console.log("⚠️ This likely means the column DOES NOT exist.");
    } else {
        console.log("✅ Query successful. 'is_pinned' column exists.");
        if (data && data.length > 0) {
            console.log("Sample data:", data[0]);
        }
    }
};

checkColumn();
