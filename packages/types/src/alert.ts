/**
 * @insight/types — Alert Types
 * TradingView-style alert system types for price, indicator, drawing, and script alerts.
 */

/** Alert condition comparison types */
export type AlertConditionType =
    | 'Crossing'
    | 'Crossing Up'
    | 'Crossing Down'
    | 'Greater Than'
    | 'Less Than'
    | 'Entering Channel'
    | 'Exiting Channel';

/** Alert type classification */
export type AlertType = 'price' | 'indicator' | 'drawing' | 'script';

/** Alert status lifecycle */
export enum AlertStatus {
    TRIGGERED = 'Triggered',
    LIVE = 'Live',
    ACTIVE = 'active',
    EXPIRED = 'expired',
    DISABLED = 'disabled',
}

/** Alert trigger frequency */
export type AlertFrequency =
    | 'once'
    | 'once_per_bar'
    | 'once_per_bar_close'
    | 'once_per_minute'
    | 'every_tick';

/** Full alert definition */
export interface AlertDef {
    id: string;
    userId: string;
    type: AlertType;
    status: AlertStatus;
    symbol: string;
    timeframe?: string;

    // Price alert fields
    priceCondition?: AlertConditionType;
    priceValue?: number;
    priceValueUpper?: number;

    // Indicator alert fields
    indicatorType?: string;
    indicatorParams?: Record<string, any>;
    indicatorCondition?: string;
    indicatorThreshold?: number;

    // Drawing alert fields
    drawingId?: string;
    drawingData?: Record<string, any>;
    drawingCondition?: 'crosses' | 'crosses_up' | 'crosses_down';

    // Script alert fields (alertcondition())
    scriptId?: string;
    alertIndex?: number;

    // Delivery settings
    frequency: AlertFrequency;
    notifyPush: boolean;
    notifyEmail: boolean;
    notifyWebhook: boolean;
    webhookUrl?: string;
    notifySound: boolean;

    // Display
    title: string;
    message?: string;

    // Lifecycle
    expiresAt?: string;
    lastTriggeredAt?: string;
    triggerCount: number;
    createdAt: string;
    updatedAt: string;
}

/** Alert trigger record (immutable log) */
export interface AlertTrigger {
    id: string;
    alertId: string;
    triggeredAt: string;
    triggerPrice?: number;
    triggerValue?: number;
    message?: string;
}

/** Basic Alert (for frontend display) */
export interface Alert {
    id: string;
    message: string;
    timestamp: string;
    status: AlertStatus;
}

/** Script alertcondition() output */
export interface AlertConditionOutput {
    triggered: boolean;
    title: string;
    message: string;
    barIndex: number;
}

/** Legacy PriceAlert (for chart UI compatibility) */
export interface PriceAlert {
    id: string;
    symbol: string;
    drawingId?: string;
    indicatorId?: string;
    alertConditionId?: string;
    conditionParameters?: Record<string, any>;
    condition: AlertConditionType;
    value?: number;
    fibLevel?: number;
    message: string;
    triggered: boolean;
    createdAt: number;
    notifyApp: boolean;
    playSound: boolean;
    triggerFrequency: 'Only Once' | 'Once Per Bar' | 'Once Per Bar Close' | 'Once Per Minute';
    lastTriggeredAt?: number;
}
