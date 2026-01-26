
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

const migrate = async () => {
    console.log("🚀 Starting migration: Activating all Pending signals...");

    const { data: pending, error: countError } = await supabase
        .from('signals')
        .select('id')
        .eq('status', 'Pending');

    if (countError) {
        console.error("Error fetching pending signals:", countError);
        return;
    }

    console.log(`📊 Found ${pending?.length || 0} Pending signals to activate.`);

    if (!pending || pending.length === 0) {
        console.log("✅ No pending signals found.");
        return;
    }

    const { error: updateError } = await supabase
        .from('signals')
        .update({
            status: 'Active',
            activated_at: new Date().toISOString()
        })
        .eq('status', 'Pending');

    if (updateError) {
        console.error("❌ Error updating signals:", updateError);
    } else {
        console.log(`✅ Successfully activated ${pending.length} signals.`);
    }
};

migrate();
