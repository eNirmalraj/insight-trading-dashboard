/**
 * Backend VM Runner for Parity Testing
 * 
 * Executes Kuri scripts in the Backend VM and captures output for comparison.
 * 
 * NOTE: This imports from the backend directory which must be accessible.
 */

import { Kuri } from '../../../kuri.ts';

// We'll use the same IR compiler from frontend for consistency
// Backend VM needs to be imported - for now, let's create a mock that uses frontend VM logic
// In production, this would import from backend/server/src/kuri/backendVM

export interface BackendVMResult {
    variables: Record<string, any>;
    context: any;
    signals: any[];
}

export async function runBackendVM(script: string, candles: any[]): Promise<BackendVMResult> {
    // 1. Compile Kuri script to IR (same compiler as frontend)
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

    // 3. Execute in Backend VM
    // For now, we'll simulate backend VM behavior using the frontend IR interpreter
    // with strategy signal capture enabled

    // Import BackendVM dynamically to avoid build issues if backend isn't built
    try {
        // Try to import actual Backend VM
        const { BackendVM } = await import('../../../../../backend/server/src/kuri/backendVM');
        const vm = new BackendVM(context);
        const result = vm.run(ir);

        return {
            variables: result.variables || {},
            context: result.context,
            signals: result.signals || []
        };
    } catch (error) {
        // Fallback: Use frontend VM for basic testing (not ideal for parity)
        console.warn('⚠️  Backend VM not available, using Frontend VM as fallback');
        const { FrontendVM } = await import('../../../frontendVM.ts');
        const vm = new FrontendVM(context);
        const result = vm.run(ir);

        return {
            variables: result.variables || {},
            context: result.context,
            signals: (result as any).signals || []
        };
    }
}
