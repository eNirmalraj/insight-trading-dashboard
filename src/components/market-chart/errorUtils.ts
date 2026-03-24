export interface ChartError {
    id: string;
    source: string;
    message: string;
    severity: 'error' | 'warning';
    timestamp: number;
    dismissible: boolean;
}

let errorCounter = 0;

export function toChartError(
    error: { message: string; code?: string; severity?: string },
    source: string
): ChartError {
    return {
        id: `chart-error-${++errorCounter}`,
        source,
        message: error.code ? `[${error.code}] ${error.message}` : error.message,
        severity: error.severity === 'warning' ? 'warning' : 'error',
        timestamp: Date.now(),
        dismissible: true,
    };
}

export function toChartErrorFromString(
    message: string,
    source: string,
    severity: 'error' | 'warning' = 'error'
): ChartError {
    return {
        id: `chart-error-${++errorCounter}`,
        source,
        message,
        severity,
        timestamp: Date.now(),
        dismissible: true,
    };
}
