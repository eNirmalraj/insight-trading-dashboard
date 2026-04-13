import { loadStrategyMetas, syncToDatabase, builtinStrategyUuid } from '../engine/strategyLoader';
import { supabaseAdmin } from '../services/supabaseAdmin';

(async () => {
    console.log('=== Strategy Loader Verification ===\n');
    const metas = loadStrategyMetas();
    console.log(`Loaded ${metas.length} strategies:`);
    for (const m of metas) {
        console.log(`  - ${m.id} (v:${m.templateVersion})`);
        console.log(`      name: ${m.name}`);
        console.log(`      category: ${m.category}`);
        console.log(`      params: ${m.paramSchema.map(p => `${p.id}:${p.type}=${p.default}`).join(', ')}`);
    }
    if (metas.length === 0) { console.error('FAIL: No strategies loaded'); process.exit(1); }
    const sma = metas.find(m => m.id === 'builtin-sma-trend');
    if (!sma) { console.error('FAIL: SMA Trend not found'); process.exit(1); }
    if (sma.paramSchema.length !== 2) {
        console.error(`FAIL: Expected 2 params in SMA Trend, got ${sma.paramSchema.length}`);
        process.exit(1);
    }
    console.log('\nOK: Loader checks passed. Syncing to database...\n');
    await syncToDatabase();

    // Confirm DB row
    const { data, error } = await supabaseAdmin
        .from('scripts')
        .select('id, name, is_builtin, template_version, param_schema')
        .eq('id', builtinStrategyUuid('builtin-sma-trend'))
        .single();
    if (error) { console.error('FAIL: DB query error:', error.message); process.exit(1); }
    console.log('\nDB row for builtin-sma-trend:');
    console.log(`  id: ${data.id}`);
    console.log(`  name: ${data.name}`);
    console.log(`  is_builtin: ${data.is_builtin}`);
    console.log(`  template_version: ${data.template_version}`);
    console.log(`  param_schema length: ${Array.isArray(data.param_schema) ? data.param_schema.length : 'not-array'}`);
    if (data.is_builtin !== true) { console.error('FAIL: is_builtin not true'); process.exit(1); }
    if (!data.template_version) { console.error('FAIL: template_version missing'); process.exit(1); }
    if (!Array.isArray(data.param_schema) || data.param_schema.length !== 2) {
        console.error('FAIL: param_schema not array of length 2');
        process.exit(1);
    }
    console.log('\nOK: Done');
    process.exit(0);
})();
