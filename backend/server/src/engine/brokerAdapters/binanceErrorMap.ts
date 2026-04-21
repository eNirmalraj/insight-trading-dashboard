// backend/server/src/engine/brokerAdapters/binanceErrorMap.ts
// Map Binance error codes/messages to OmsError kinds.

import { OmsError } from '../../services/omsErrors';

export function mapBinanceError(err: any): OmsError {
    const code = err?.code ?? err?.response?.data?.code;
    const rawMsg = err?.message || err?.response?.data?.msg || String(err);

    switch (code) {
        case -2019:
        case '-2019':
            return OmsError.risk('Insufficient margin');
        case -2010:
        case '-2010':
            return OmsError.risk('Insufficient balance');
        case -4131:
        case '-4131':
            return OmsError.validation('Leverage exceeds maximum');
        case -1121:
        case '-1121':
            return OmsError.validation('Invalid symbol');
        case -4003:
        case '-4003':
            return OmsError.sizing('Quantity less than zero');
        case -1100:
        case '-1100':
            return OmsError.validation('Illegal characters in parameter');
        case -1013:
        case '-1013':
            return OmsError.sizing('Quantity does not meet minimum');
        case -2021:
        case '-2021':
            return OmsError.broker('Order would trigger immediately');
        default:
            return OmsError.broker(`Binance error: ${rawMsg}`, /*retryable*/ true);
    }
}
