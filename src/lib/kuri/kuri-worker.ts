// Web Worker for Kuri engine execution (v3 — cached engine instance)
// @ts-ignore — kuri-engine-full.js is a UMD module
import * as KuriModule from './kuri-engine-full.js';

const _mod: any = KuriModule;
const Kuri: any =
    (_mod.default?.KuriEngine ? _mod.default : null) ||
    (_mod.KuriEngine ? _mod : null) ||
    (typeof globalThis !== 'undefined' && (globalThis as any).Kuri?.KuriEngine
        ? (globalThis as any).Kuri
        : null) ||
    _mod.default ||
    _mod;

// Reuse a single engine instance across messages (avoids re-init overhead)
let engine: any = null;
function getEngine() {
    if (!engine) engine = new Kuri.KuriEngine();
    return engine;
}

self.onmessage = (e: MessageEvent) => {
    const { id, script, ohlcv, inputOverrides } = e.data;
    try {
        const result = getEngine().run(script, ohlcv, inputOverrides);
        self.postMessage({ id, result, error: null });
    } catch (error: any) {
        self.postMessage({ id, result: null, error: error.message });
    }
};
