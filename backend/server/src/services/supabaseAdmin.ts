import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// Initialize Supabase Admin Client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error("CRITICAL: Supabase URL or Service Key is missing in .env");
    process.exit(1);
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
