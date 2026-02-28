// @insight/computation — Alert Module Barrel Export
export {
    checkPriceAlert,
    getTrendlinePrice,
    getChannelPriceRange,
    getFibonacciLevels,
    isInRectangleRange,
} from './evaluator';

export type { AlertCheckResult, PriceAlertInput } from './evaluator';
