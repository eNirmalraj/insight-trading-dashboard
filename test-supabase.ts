
import { createClient } from '@supabase/supabase-js';

const url = 'https://yheoylkypxktcrhkedyj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZW95bGt5cHhrdGNyaGtlZHlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NTIyMDcsImV4cCI6MjA4MjUyODIwN30.FO4XTRfxeuxHrtB9wLIIvShSMG-yudMpwVgVOXcC7RM';

const supabase = createClient(url, key);

async function check() {
    console.log("Checking Supabase Connection...");
    try {
        const { data, error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });

        if (error) {
            console.error("Supabase Error:", error.message, error.code, error.details);
            process.exit(1);
        }

        console.log("Supabase Connection Successful! Status: 200 OK");
    } catch (e) {
        console.error("Connection Failed:", e);
        process.exit(1);
    }
}

check();
