
import { supabaseAdmin } from '../services/supabaseAdmin';

async function forensicAnalysis() {
    console.log('🔍 Starting Forensic DB Analysis...');

    // 1. Check Latest Signals
    console.log('\n--- 1. Latest 10 Signals ---');
    const { data: latest, error: err1 } = await supabaseAdmin
        .from('signals')
        .select('id, symbol, strategy, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    if (err1) console.error('Error fetching latest signals:', err1);
    else console.log(JSON.stringify(latest, null, 2));

    // 2. Check Active Signals Blocking
    console.log('\n--- 2. Active Signals Count (Potential Blockers) ---');
    // Note: Supabase JS doesn't support GROUP BY and COUNT easily without rpc or client-side post-processing if strict types are on.
    // We will fetch all active signals and aggregate in JS for this forensic script.

    const { data: active, error: err2 } = await supabaseAdmin
        .from('signals')
        .select('symbol, strategy')
        .eq('status', 'Active');

    if (err2) {
        console.error('Error fetching active signals:', err2);
    } else {
        const counts: Record<string, number> = {};
        active?.forEach(s => {
            const key = `${s.symbol} (${s.strategy})`;
            counts[key] = (counts[key] || 0) + 1;
        });

        console.log(`Found ${active?.length || 0} active signals.`);
        if (Object.keys(counts).length > 0) {
            console.table(counts);
        } else {
            console.log('✅ No stuck Active signals found.');
        }
    }

    console.log('\n✅ Analysis Complete.');
}

forensicAnalysis();
