// packages/kuri-engine/src/errors/index.ts
export type { KuriError, KuriDiagnostic, ErrorSeverity, ErrorCategory } from './kuriError';
export { createKuriError } from './kuriError';
export type { ErrorDefinition } from './errorRegistry';
export { ERROR_REGISTRY, getErrorInfo } from './errorRegistry';
