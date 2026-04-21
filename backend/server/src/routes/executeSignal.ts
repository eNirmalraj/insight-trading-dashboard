// backend/server/src/routes/executeSignal.ts
// User-initiated live trade from the Signals page Execute button.

import type { Request, Response, Router } from 'express';
import express from 'express';
import { supabaseAdmin } from '../services/supabaseAdmin';
import { oms } from '../services/oms';
import { OmsError } from '../services/omsErrors';
import { credentialVault } from '../services/credentialVault';
import { BrokerType, Market, TradeDirection } from '../constants/enums';
import { SizingMode } from '../services/positionSizer';

const router: Router = express.Router();

async function resolveUserId(req: Request): Promise<string | null> {
    const auth = req.header('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return null;
    const { data } = await supabaseAdmin.auth.getUser(token);
    return data?.user?.id ?? null;
}

router.post('/', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const {
        signalId,
        brokerCredentialId,          // null = paper
        sizingMode,
        sizingParams,
        leverage,
    } = req.body as {
        signalId: string;
        brokerCredentialId: string | null;
        sizingMode: SizingMode;
        sizingParams: { notional?: number; riskPct?: number; riskFixed?: number; fixedQty?: number };
        leverage: number;
    };

    if (!signalId) return res.status(400).json({ error: 'signalId required' });

    // Fetch the signal event row
    const { data: signal, error: signalErr } = await supabaseAdmin
        .from('signals')
        .select('id, symbol, market, direction, entry_price, timeframe')
        .eq('id', signalId)
        .maybeSingle();
    if (signalErr || !signal) return res.status(404).json({ error: 'signal not found' });

    // Determine broker from credential (if live).
    let broker: BrokerType = BrokerType.PAPER;
    if (brokerCredentialId) {
        const cred = await credentialVault.retrieveById(brokerCredentialId);
        if (!cred) return res.status(404).json({ error: 'credential not found' });
        broker = cred.broker as BrokerType;
    }

    // Phase 1: simple % defaults for SL/TP (1% SL, 2% TP). Phase 2 will source
    // actual values from the signal's generated risk settings.
    const entryPrice = signal.entry_price;
    const stopLoss = signal.direction === 'BUY' ? entryPrice * 0.99 : entryPrice * 1.01;
    const takeProfit = signal.direction === 'BUY' ? entryPrice * 1.02 : entryPrice * 0.98;

    try {
        const exec = await oms.submit({
            userId,
            broker,
            brokerCredentialId,
            signalId: signal.id,
            watchlistStrategyId: null,
            symbol: signal.symbol,
            market: (signal.market as Market) || Market.FUTURES,
            direction: signal.direction as TradeDirection,
            entryType: 'MARKET',
            entryPrice,
            stopLoss,
            takeProfit,
            riskSettings: { leverage: leverage || 1 },
            timeframe: signal.timeframe,
            sizingMode,
            sizingParams,
            balance: 0,
        });
        return res.json({ executionId: exec.id });
    } catch (err: any) {
        if (err instanceof OmsError) {
            return res.status(400).json({ error: err.message, kind: err.kind });
        }
        return res.status(500).json({ error: err?.message || 'execute failed' });
    }
});

export default router;
