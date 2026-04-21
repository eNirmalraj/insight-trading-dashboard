import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_KEY || '';

if (!url || !key) {
    console.error('Missing ENV');
    process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
    console.log('Testing with Service Key...');
    console.log('URL:', url);
    
    // Test 1: Simple Select
    console.log('\n--- Test 1: Select 1 from profiles ---');
    try {
        const { data, error, status } = await supabase
            .from('profiles')
            .select('*')
            .limit(1);
        
        if (error) {
            console.error('Select Error:', error.message, 'Status:', status);
        } else {
            console.log('Select Successful! Row count:', data?.length);
            console.log('Data sample:', data?.[0] ? 'Found row' : 'No rows');
        }
    } catch (e: any) {
        console.error('Select Catch:', e.message);
    }

    // Test 2: Raw Health Check (if possible)
    console.log('\n--- Test 2: Connection details ---');
    try {
        const start = Date.now();
        const res = await fetch(`${url}/rest/v1/`, {
            headers: { apikey: key }
        });
        const end = Date.now();
        console.log('Fetch Status:', res.status);
        console.log('Response Time:', end - start, 'ms');
    } catch (e: any) {
        console.error('Fetch Catch:', e.message);
    }
}

run();
