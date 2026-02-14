/**
 * Frontend VM Runner for Parity Testing
 * 
 * Executes Kuri scripts in the Frontend VM and captures output for comparison.
 */

import { Kuri } from '../../../kuri.ts';
import { FrontendVM } from '../../../frontendVM.ts';

export interface FrontendVMResult {
    variables: Record<string, any>;
    context: any;
    plots: any[];
    signals?: any[];
}

export async function runFrontendVM(script: string, candles: any[]): Promise<FrontendVMResult> {
    // 1. Compile Kuri script to IR
    const irJson = Kuri.compileToIR(script);
    const ir = JSON.parse(irJson);

    // 2. Prepare context from candle data
    const context = {
        open: candles.map(c => c.open),
        high: candles.map(c => c.high),
        low: candles.map(c => c.low),
        close: candles.map(c => c.close),
        volume: candles.map(c => c.volume)
    };

    // 3. Execute in Frontend VM
    const vm = new FrontendVM(context);
    const result = vm.run(ir);

    return {
        variables: result.variables || {},
        context: result.context,
        plots: result.plots || [],
        signals: (result as any).signals || [] // Frontend VM might emit signals for testing
    };
}
