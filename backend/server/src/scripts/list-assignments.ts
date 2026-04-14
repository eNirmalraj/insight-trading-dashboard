// Read-only: list every strategy assignment across every watchlist.
import dotenv from 'dotenv';
dotenv.config();
import { supabaseAdmin } from '../services/supabaseAdmin';

(async () => {
    console.log('═══════════════════════════════════════════════');
    console.log('  Current Strategy Assignments');
    console.log('═══════════════════════════════════════════════\n');

    // Fetch all assignments joined with the script (for name) and the watchlist (for name).
    const { data, error } = await supabaseAdmin
        .from('watchlist_strategies')
        .select(`
            id,
            params,
            timeframe,
            risk_settings,
            last_error,
            last_error_at,
            watchlist:watchlist_id ( id, name, user_id ),
            strategy:strategy_id ( id, name, is_builtin )
        `);

    if (error) {
        console.error('❌ Failed to load assignments:', error.message);
        return;
    }

    const rows = (data || []) as any[];

    if (rows.length === 0) {
        console.log('  (none — no watchlists have any strategies assigned yet)');
        console.log('\nTo add one:');
        console.log('  1. Go to the Signals page');
        console.log('  2. Pick a watchlist in the filter dropdown');
        console.log('  3. Click "Assign Strategies"');
        console.log('  4. Click "+ Add" next to a strategy, fill params, Save');
        return;
    }

    console.log(`Total assignments: ${rows.length}\n`);

    // Group by watchlist for readability
    const byWatchlist = new Map<string, any[]>();
    for (const row of rows) {
        const wlKey = row.watchlist?.id || '(no watchlist)';
        const list = byWatchlist.get(wlKey) || [];
        list.push(row);
        byWatchlist.set(wlKey, list);
    }

    for (const [wlId, list] of byWatchlist) {
        const wl = list[0].watchlist;
        console.log(`── Watchlist: ${wl?.name || '(unknown)'} (${wlId})`);
        console.log(`   User: ${wl?.user_id || '(none)'}`);
        console.log(`   Assignments: ${list.length}`);
        for (const a of list) {
            const strat = a.strategy;
            const badge = strat?.is_builtin ? ' [BUILT-IN]' : '';
            const paramsStr = Object.keys(a.params || {}).length > 0
                ? ` params=${JSON.stringify(a.params)}`
                : ' (defaults)';
            console.log(`     • ${strat?.name || '(unknown)'}${badge}  tf=${a.timeframe}${paramsStr}`);
            if (a.last_error) {
                console.log(`       ⚠ ERROR: ${a.last_error}`);
            }
        }
        console.log('');
    }

    // Also show watchlists that have ZERO assignments (candidates for the Signal Engine to ignore)
    const { data: allWl } = await supabaseAdmin
        .from('watchlists')
        .select('id, name, user_id');
    const assignedIds = new Set(rows.map((r) => r.watchlist?.id).filter(Boolean));
    const unassigned = (allWl || []).filter((wl) => !assignedIds.has(wl.id));

    if (unassigned.length > 0) {
        console.log('── Watchlists with NO strategy assignments ──');
        for (const wl of unassigned) {
            console.log(`   • ${wl.name}   (id=${wl.id})`);
        }
        console.log('');
    }

    console.log('✅ Done');
})();
