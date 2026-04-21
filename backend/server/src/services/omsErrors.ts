// backend/server/src/services/omsErrors.ts
// Typed errors thrown by oms.submit().

export type OmsErrorKind =
    | 'validation'
    | 'sizing'
    | 'risk'
    | 'credential'
    | 'broker'
    | 'db';

export class OmsError extends Error {
    public readonly kind: OmsErrorKind;
    public readonly retryable: boolean;

    constructor(kind: OmsErrorKind, message: string, retryable = false) {
        super(message);
        this.name = 'OmsError';
        this.kind = kind;
        this.retryable = retryable;
    }

    static validation(msg: string) { return new OmsError('validation', msg, false); }
    static sizing(msg: string) { return new OmsError('sizing', msg, false); }
    static risk(msg: string) { return new OmsError('risk', msg, false); }
    static credential(msg: string) { return new OmsError('credential', msg, false); }
    static broker(msg: string, retryable = false) { return new OmsError('broker', msg, retryable); }
    static db(msg: string, retryable = true) { return new OmsError('db', msg, retryable); }
}
