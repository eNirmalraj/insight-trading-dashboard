// @insight/computation — Signal Module Barrel Export
export {
    evaluateSignalAtPrice,
    evaluateSignalAtCandle,
    checkEntryTrigger,
    calculatePnlPercent,
} from './evaluator';

export type { SignalInput, SignalStatusResult } from './evaluator';
