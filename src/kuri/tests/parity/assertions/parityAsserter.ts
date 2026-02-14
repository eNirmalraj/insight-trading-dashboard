/**
 * Parity Assertion Module
 * 
 * Verifies exact equality between Frontend VM and Backend VM execution results.
 * NO tolerance - values must match exactly.
 */

export interface ParityResult {
    passed: boolean;
    errors: string[];
}

export class ParityAsserter {
    /**
     * Assert indicator values match exactly across VMs
     */
    static assertIndicatorParity(
        frontendVars: any,
        backendVars: any,
        indicatorNames: string[]
    ): ParityResult {
        const errors: string[] = [];

        for (const name of indicatorNames) {
            const frontendSeries = frontendVars[name];
            const backendSeries = backendVars[name];

            // Check existence
            if (!frontendSeries && !backendSeries) continue;

            if (!frontendSeries) {
                errors.push(`❌ Indicator '${name}' missing in Frontend VM`);
                continue;
            }

            if (!backendSeries) {
                errors.push(`❌ Indicator '${name}' missing in Backend VM`);
                continue;
            }

            // Check if both are arrays
            const isFrontendArray = Array.isArray(frontendSeries);
            const isBackendArray = Array.isArray(backendSeries);

            if (isFrontendArray !== isBackendArray) {
                errors.push(
                    `❌ Indicator '${name}' type mismatch: ` +
                    `Frontend=${isFrontendArray ? 'array' : 'scalar'}, ` +
                    `Backend=${isBackendArray ? 'array' : 'scalar'}`
                );
                continue;
            }

            // If both are scalars
            if (!isFrontendArray && !isBackendArray) {
                if (frontendSeries !== backendSeries) {
                    errors.push(
                        `❌ Indicator '${name}' scalar mismatch: ` +
                        `Frontend=${frontendSeries}, Backend=${backendSeries}`
                    );
                }
                continue;
            }

            // Both are arrays - check length
            if (frontendSeries.length !== backendSeries.length) {
                errors.push(
                    `❌ Indicator '${name}' length mismatch: ` +
                    `Frontend=${frontendSeries.length}, Backend=${backendSeries.length}`
                );
                continue;
            }

            // Check values per bar (NO tolerance)
            for (let i = 0; i < frontendSeries.length; i++) {
                const fVal = frontendSeries[i];
                const bVal = backendSeries[i];

                // Both null/undefined is OK
                if ((fVal === null || fVal === undefined) &&
                    (bVal === null || bVal === undefined)) {
                    continue;
                }

                // Exact equality check
                if (fVal !== bVal) {
                    errors.push(
                        `❌ Indicator '${name}' mismatch at bar ${i}: ` +
                        `Frontend=${fVal}, Backend=${bVal}`
                    );
                    // Only report first 5 mismatches per indicator
                    if (errors.filter(e => e.includes(name)).length >= 5) {
                        errors.push(`   ... (additional mismatches for '${name}' suppressed)`);
                        break;
                    }
                }
            }
        }

        return {
            passed: errors.length === 0,
            errors
        };
    }

    /**
     * Assert strategy signals match exactly across VMs
     */
    static assertSignalParity(
        frontendSignals: any[],
        backendSignals: any[]
    ): ParityResult {
        const errors: string[] = [];

        // Check count
        if (frontendSignals.length !== backendSignals.length) {
            errors.push(
                `❌ Signal count mismatch: ` +
                `Frontend=${frontendSignals.length}, Backend=${backendSignals.length}`
            );
        }

        // Check each signal
        const minLength = Math.min(frontendSignals.length, backendSignals.length);
        for (let i = 0; i < minLength; i++) {
            const fSig = frontendSignals[i];
            const bSig = backendSignals[i];

            // Check type
            if (fSig.type !== bSig.type) {
                errors.push(
                    `❌ Signal ${i} type mismatch: ` +
                    `Frontend='${fSig.type}', Backend='${bSig.type}'`
                );
            }

            // Check id
            if (fSig.id !== bSig.id) {
                errors.push(
                    `❌ Signal ${i} id mismatch: ` +
                    `Frontend='${fSig.id}', Backend='${bSig.id}'`
                );
            }

            // Check timestamp (bar index)
            if (fSig.timestamp !== bSig.timestamp) {
                errors.push(
                    `❌ Signal ${i} timestamp mismatch: ` +
                    `Frontend=${fSig.timestamp}, Backend=${bSig.timestamp}`
                );
            }

            // Check direction (for ENTRY signals)
            if (fSig.direction && bSig.direction && fSig.direction !== bSig.direction) {
                errors.push(
                    `❌ Signal ${i} direction mismatch: ` +
                    `Frontend='${fSig.direction}', Backend='${bSig.direction}'`
                );
            }
        }

        return {
            passed: errors.length === 0,
            errors
        };
    }

    /**
     * Format parity result for console output
     */
    static formatResult(testName: string, result: ParityResult): string {
        if (result.passed) {
            return `  ✅ ${testName}: PASS`;
        }

        const lines = [`  ❌ ${testName}: FAIL`];
        result.errors.forEach(err => lines.push(`     ${err}`));
        return lines.join('\n');
    }
}
