# Kuri Error System Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the fragmented Kuri error system into one canonical type, fix silent failures on the Market page, and improve the Strategy Studio error UX.

**Architecture:** Bottom-up approach — build the new error foundation in kuri-engine first (types, registry, factory), then migrate each validator/checker to use it, then update the frontend consumers (BottomConsole, StrategyStudio, Market page). Each task produces working code that compiles.

**Tech Stack:** TypeScript, React, Monaco Editor, pnpm monorepo (`@insight/kuri-engine` package)

**Spec:** `docs/superpowers/specs/2026-03-24-kuri-error-system-rebuild-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/kuri-engine/src/errors/kuriError.ts` | Unified `KuriError` interface, types, and `createKuriError()` factory |
| `packages/kuri-engine/src/errors/errorRegistry.ts` | Central K-code registry with titles, descriptions, defaults |
| `packages/kuri-engine/src/errors/index.ts` | Barrel export for errors module |
| `src/components/market-chart/errorUtils.ts` | `toChartError()` adapter, `ChartError` interface |

### Modified Files

| File | Change Summary |
|------|---------------|
| `packages/kuri-engine/src/index.ts` | Export new error types, deprecate old ones |
| `packages/kuri-engine/src/semanticValidator.ts` | Return `KuriError[]` instead of `SemanticIssue[]` |
| `packages/kuri-engine/src/irValidator.ts` | Return `KuriError[]` instead of `IRValidationIssue[]` |
| `packages/kuri-engine/src/typeChecker.ts` | Return `KuriError[]` instead of `string[]` |
| `packages/kuri-engine/src/runtimeLimits.ts` | Add `code` field to `RuntimeLimitError` |
| `packages/kuri-engine/src/kuri.ts` | Simplify `provideDiagnostics()`, add deduplication |
| `src/components/strategy-studio/BottomConsole.tsx` | Add suggestion display, severity filters, grouping |
| `src/pages/StrategyStudio.tsx` | Refactor `addLog` to object param, update 32 call sites |
| `src/components/market-chart/helpers.ts` | Return `IndicatorResult` discriminated union |
| `src/engine/strategyEngine.ts` | Return `StrategyResult` discriminated union |
| `src/components/market-chart/CandlestickChart.tsx` | Per-indicator error boundaries, fix empty catches, stale data cleanup |
| `src/pages/Market.tsx` | Add error banner system, fix silent load failures |

---

## Task 1: Create Unified Error Types and Registry

**Files:**
- Create: `packages/kuri-engine/src/errors/kuriError.ts`
- Create: `packages/kuri-engine/src/errors/errorRegistry.ts`
- Create: `packages/kuri-engine/src/errors/index.ts`

- [ ] **Step 1: Create the errors directory**

```bash
mkdir -p packages/kuri-engine/src/errors
```

- [ ] **Step 2: Create `kuriError.ts` with unified types and factory**

```typescript
// packages/kuri-engine/src/errors/kuriError.ts

export type ErrorSeverity = 'error' | 'warning' | 'info';

export type ErrorCategory =
    | 'syntax'
    | 'type'
    | 'semantic'
    | 'structure'
    | 'runtime'
    | 'limit'
    | 'security';

export interface KuriError {
    code: string;
    message: string;
    severity: ErrorSeverity;
    category: ErrorCategory;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    suggestion?: string;
}

// Backwards-compat alias — remove after all consumers migrate
export type KuriDiagnostic = KuriError;

import { ERROR_REGISTRY } from './errorRegistry';

/**
 * Factory function for creating KuriError objects.
 * Reads defaults (severity, category) from the ERROR_REGISTRY.
 * Ensures all required fields are set with safe defaults.
 *
 * No circular dependency: errorRegistry.ts only imports TYPES from this file
 * (type-only imports are erased at compile time in ESM).
 */
export function createKuriError(
    code: string,
    overrides: Partial<KuriError> & { message: string }
): KuriError {
    const def = ERROR_REGISTRY[code];

    const line = overrides.line ?? 1;
    const column = overrides.column ?? 1;

    return {
        code,
        message: overrides.message,
        severity: overrides.severity ?? def?.severity ?? 'error',
        category: overrides.category ?? def?.category ?? 'runtime',
        line,
        column,
        endLine: overrides.endLine ?? line,
        endColumn: overrides.endColumn ?? column + 1,
        suggestion: overrides.suggestion,
    };
}
```

- [ ] **Step 3: Create `errorRegistry.ts` with all existing K-codes**

Harvest every K-code from `packages/kuri-engine/src/semanticValidator.ts` (grep for `code: 'K`) and add entries for the new K5xx/K6xx/K7xx ranges.

```typescript
// packages/kuri-engine/src/errors/errorRegistry.ts

import type { ErrorCategory, ErrorSeverity } from './kuriError';

export interface ErrorDefinition {
    code: string;
    title: string;
    description: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
}

export const ERROR_REGISTRY: Record<string, ErrorDefinition> = {
    // ── Syntax Errors (K000) ──
    K000: { code: 'K000', title: 'Syntax Error', description: 'The script contains a syntax error that prevents parsing.', category: 'syntax', severity: 'error' },

    // ── Semantic Errors (existing K001-K080) ──
    K001: { code: 'K001', title: 'Undefined Variable', description: 'A variable was used before being declared. Check for typos or add a declaration.', category: 'semantic', severity: 'error' },
    K002: { code: 'K002', title: 'Unknown Function', description: 'The function name is not recognized. Check spelling or see the Kuri function reference.', category: 'semantic', severity: 'error' },
    K003: { code: 'K003', title: 'Possible Typo', description: 'A variable or function name looks similar to a known one.', category: 'semantic', severity: 'warning' },
    K004: { code: 'K004', title: 'Shadowing Builtin', description: 'A variable name shadows a built-in variable.', category: 'semantic', severity: 'warning' },
    K010: { code: 'K010', title: 'Wrong Argument Count', description: 'Function called with wrong number of arguments.', category: 'semantic', severity: 'error' },
    K011: { code: 'K011', title: 'Wrong Argument Type', description: 'Function called with wrong argument type.', category: 'semantic', severity: 'error' },
    K012: { code: 'K012', title: 'Invalid Function Call', description: 'The expression is not callable.', category: 'semantic', severity: 'error' },
    K013: { code: 'K013', title: 'Missing Return Value', description: 'Function is missing a return statement.', category: 'semantic', severity: 'warning' },
    K020: { code: 'K020', title: 'Break/Continue Outside Loop', description: 'break or continue used outside of a for/while loop.', category: 'semantic', severity: 'error' },
    K030: { code: 'K030', title: 'Type Mismatch', description: 'Incompatible types in expression.', category: 'semantic', severity: 'error' },
    K031: { code: 'K031', title: 'Invalid Operator', description: 'Operator cannot be applied to these types.', category: 'semantic', severity: 'error' },
    K032: { code: 'K032', title: 'Type Incompatibility', description: 'Types are not compatible in this context.', category: 'semantic', severity: 'error' },
    K033: { code: 'K033', title: 'Series Type Error', description: 'Expected series type but got scalar, or vice versa.', category: 'semantic', severity: 'error' },
    K040: { code: 'K040', title: 'Invalid Assignment', description: 'Cannot assign to this target.', category: 'semantic', severity: 'error' },
    K041: { code: 'K041', title: 'Readonly Variable', description: 'Cannot assign to a read-only variable.', category: 'semantic', severity: 'error' },
    K042: { code: 'K042', title: 'Division by Zero', description: 'Dividing by a literal zero.', category: 'semantic', severity: 'warning' },
    K043: { code: 'K043', title: 'Invalid Operation', description: 'This operation is not valid in this context.', category: 'semantic', severity: 'error' },
    K050: { code: 'K050', title: 'Infinite Loop Risk', description: 'Loop condition may never be false.', category: 'semantic', severity: 'warning' },
    K051: { code: 'K051', title: 'Missing Loop Condition', description: 'Loop has no termination condition.', category: 'semantic', severity: 'error' },
    K052: { code: 'K052', title: 'Invalid Iterator', description: 'Loop iterator is not valid.', category: 'semantic', severity: 'error' },
    K060: { code: 'K060', title: 'Invalid Plot', description: 'plot() used in an invalid context.', category: 'semantic', severity: 'warning' },
    K061: { code: 'K061', title: 'Missing Declaration', description: 'Script is missing indicator() or strategy() declaration.', category: 'structure', severity: 'error' },
    K062: { code: 'K062', title: 'Wrong Script Type', description: 'Function not valid for this script type.', category: 'semantic', severity: 'error' },
    K063: { code: 'K063', title: 'Missing Output', description: 'Indicator has no plot() or drawing output.', category: 'structure', severity: 'error' },
    K070: { code: 'K070', title: 'NA Comparison', description: 'Comparing with == to na always returns false. Use na() function.', category: 'semantic', severity: 'warning' },
    K071: { code: 'K071', title: 'Dead Condition', description: 'Condition will always be true or always false.', category: 'semantic', severity: 'warning' },
    K080: { code: 'K080', title: 'Input Range Invalid', description: 'Input minval is greater than maxval, or default is out of range.', category: 'semantic', severity: 'error' },

    // ── Semantic Warnings (existing K100-K161) ──
    K100: { code: 'K100', title: 'Unused Input', description: 'An input() is declared but never referenced.', category: 'semantic', severity: 'warning' },
    K101: { code: 'K101', title: 'Unused Variable', description: 'A variable is declared but never referenced.', category: 'semantic', severity: 'warning' },
    K110: { code: 'K110', title: 'Multiple Declarations', description: 'Script type declared more than once.', category: 'structure', severity: 'error' },
    K120: { code: 'K120', title: 'Modifying Readonly Builtin', description: 'Attempting to modify a read-only built-in variable.', category: 'semantic', severity: 'error' },
    K121: { code: 'K121', title: 'Shadowing Builtin', description: 'Variable name shadows a built-in.', category: 'semantic', severity: 'warning' },
    K130: { code: 'K130', title: 'Duplicate Input Title', description: 'Two inputs share the same title string.', category: 'semantic', severity: 'warning' },
    K131: { code: 'K131', title: 'Input Default Out of Range', description: 'Input default value is outside the specified min/max range.', category: 'semantic', severity: 'warning' },
    K150: { code: 'K150', title: 'Deprecated Function', description: 'This function is deprecated. Use the suggested replacement.', category: 'semantic', severity: 'warning' },
    K160: { code: 'K160', title: 'Bare Strategy Entry', description: 'strategy.entry() called without a condition — will trade every bar.', category: 'semantic', severity: 'warning' },
    K161: { code: 'K161', title: 'Return Outside Function', description: 'return used outside of a function body.', category: 'semantic', severity: 'error' },

    // ── Plot Limits (existing K301-K303) ──
    K301: { code: 'K301', title: 'Too Many Plots', description: 'Script exceeds the 64-plot limit.', category: 'structure', severity: 'error' },
    K302: { code: 'K302', title: 'Approaching Plot Limit', description: 'Script has over 50 plots — approaching the 64-plot limit.', category: 'structure', severity: 'warning' },
    K303: { code: 'K303', title: 'Conditional Plot', description: 'plot() inside conditional may produce gaps.', category: 'structure', severity: 'warning' },

    // ── Strategy Errors (existing K401) ──
    K401: { code: 'K401', title: 'Unmatched Strategy Close', description: 'strategy.close() ID does not match any strategy.entry() ID.', category: 'semantic', severity: 'warning' },

    // ── Runtime Errors (NEW K500-K599) ──
    K500: { code: 'K500', title: 'Runtime Error', description: 'An error occurred during script execution.', category: 'runtime', severity: 'error' },
    K501: { code: 'K501', title: 'Runtime Division by Zero', description: 'Attempted to divide by zero at runtime.', category: 'runtime', severity: 'error' },
    K502: { code: 'K502', title: 'Index Out of Bounds', description: 'Array or series index is out of valid range.', category: 'runtime', severity: 'error' },
    K503: { code: 'K503', title: 'Null Reference', description: 'Attempted to access a property of na/null.', category: 'runtime', severity: 'error' },
    K504: { code: 'K504', title: 'Unknown Function', description: 'Function not found in registry at runtime.', category: 'runtime', severity: 'error' },
    K505: { code: 'K505', title: 'Invalid Argument', description: 'Function received an invalid argument at runtime.', category: 'runtime', severity: 'error' },
    K506: { code: 'K506', title: 'Type Error at Runtime', description: 'Unexpected type encountered during execution.', category: 'runtime', severity: 'error' },

    // ── Safety Limits (NEW K600-K699) ──
    K600: { code: 'K600', title: 'Execution Limit Exceeded', description: 'Script exceeded maximum allowed operations.', category: 'limit', severity: 'error' },
    K601: { code: 'K601', title: 'Max Operations Per Bar', description: 'Exceeded maximum operations per bar (10,000).', category: 'limit', severity: 'error' },
    K602: { code: 'K602', title: 'Max Execution Time', description: 'Script exceeded maximum execution time (30s).', category: 'limit', severity: 'error' },
    K603: { code: 'K603', title: 'Max Recursion Depth', description: 'Exceeded maximum recursion depth (100).', category: 'limit', severity: 'error' },
    K604: { code: 'K604', title: 'Max Array Length', description: 'Array exceeded maximum length (100,000).', category: 'limit', severity: 'error' },
    K605: { code: 'K605', title: 'Max Variables', description: 'Script exceeded maximum number of variables (1,000).', category: 'limit', severity: 'error' },
    K606: { code: 'K606', title: 'Max Orders', description: 'Script exceeded maximum orders per execution (500).', category: 'limit', severity: 'error' },
    K607: { code: 'K607', title: 'Script Too Large', description: 'Script exceeds maximum allowed size.', category: 'limit', severity: 'error' },
    K608: { code: 'K608', title: 'Too Many Lines', description: 'Script exceeds maximum line count.', category: 'limit', severity: 'error' },

    // ── Security (NEW K700-K799) ──
    K700: { code: 'K700', title: 'Security Violation', description: 'Attempted to access a restricted resource.', category: 'security', severity: 'error' },
    K701: { code: 'K701', title: 'Blocked Global Access', description: 'Attempted to access a blocked global variable.', category: 'security', severity: 'error' },

    // ── Type Checker Errors (NEW K800-K899) ──
    K800: { code: 'K800', title: 'Type Error', description: 'General type checking error.', category: 'type', severity: 'error' },
    K801: { code: 'K801', title: 'Boolean Expected', description: 'Condition expression must be boolean.', category: 'type', severity: 'error' },
    K802: { code: 'K802', title: 'Wrong Argument Type', description: 'Function argument has wrong type.', category: 'type', severity: 'error' },
    K803: { code: 'K803', title: 'Too Many Arguments', description: 'Function called with too many arguments.', category: 'type', severity: 'error' },
    K804: { code: 'K804', title: 'Cannot Index Type', description: 'Cannot use index operator on this type.', category: 'type', severity: 'error' },
    K805: { code: 'K805', title: 'Invalid Operand', description: 'Operator cannot be applied to this type.', category: 'type', severity: 'error' },
};

export function getErrorInfo(code: string): ErrorDefinition | undefined {
    return ERROR_REGISTRY[code];
}
```

- [ ] **Step 4: Create barrel export `errors/index.ts`**

```typescript
// packages/kuri-engine/src/errors/index.ts
export type { KuriError, KuriDiagnostic, ErrorSeverity, ErrorCategory } from './kuriError';
export { createKuriError } from './kuriError';
export type { ErrorDefinition } from './errorRegistry';
export { ERROR_REGISTRY, getErrorInfo } from './errorRegistry';
```

- [ ] **Step 5: Build kuri-engine to verify it compiles**

```bash
cd packages/kuri-engine && pnpm build
```

Expected: Clean compile with no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/kuri-engine/src/errors/
git commit -m "feat(kuri-engine): add unified KuriError types and error registry"
```

---

## Task 2: Update Package Exports

**Files:**
- Modify: `packages/kuri-engine/src/index.ts`

- [ ] **Step 1: Add new error exports and deprecation aliases to `index.ts`**

At the top of the file (after existing exports), add:

```typescript
// New unified error system
export {
    createKuriError,
    ERROR_REGISTRY,
    getErrorInfo,
} from './errors';
export type {
    KuriError,
    KuriDiagnostic,
    ErrorSeverity,
    ErrorCategory,
    ErrorDefinition,
} from './errors';
```

Keep the existing exports for `KuriRuntimeError`, `createError`, `RuntimeLimitError` for now — they'll be migrated in later tasks. Remove the `KuriDiagnostic` interface definition from `kuri.ts` (defined at ~line 819) and the type export at line 9 — both now come from `errors/`.

- [ ] **Step 2: Build to verify**

```bash
cd packages/kuri-engine && pnpm build
```

Expected: Clean compile. The old exports still work, new ones are available.

- [ ] **Step 3: Commit**

```bash
git add packages/kuri-engine/src/index.ts
git commit -m "feat(kuri-engine): export unified error types from package"
```

---

## Task 3: Migrate RuntimeLimitError

**Files:**
- Modify: `packages/kuri-engine/src/runtimeLimits.ts`

- [ ] **Step 1: Add `code` field to `RuntimeLimitError`**

Replace the class at line 34-39:

```typescript
export class RuntimeLimitError extends Error {
    public code: string;

    constructor(message: string, code: string = 'K600') {
        super(`RuntimeError: ${message}`);
        this.name = 'RuntimeLimitError';
        this.code = code;
    }
}
```

- [ ] **Step 2: Build to verify — existing callers still work since `code` has a default**

```bash
cd packages/kuri-engine && pnpm build
```

Expected: Clean compile. Existing `throw new RuntimeLimitError('...')` calls still work.

- [ ] **Step 3: Commit**

```bash
git add packages/kuri-engine/src/runtimeLimits.ts
git commit -m "feat(kuri-engine): add error code to RuntimeLimitError"
```

---

## Task 4: Migrate IR Validator

**Files:**
- Modify: `packages/kuri-engine/src/irValidator.ts`

- [ ] **Step 1: Replace `IRValidationIssue` with `KuriError` imports**

Replace the interface at lines 23-28:

```typescript
import { createKuriError } from './errors';
import type { KuriError } from './errors';

// Keep as deprecated alias for any external consumers
export type IRValidationIssue = KuriError;
```

- [ ] **Step 2: Update `validateIR()` return type and all `issues.push()` calls**

Change the function signature from `IRValidationIssue[]` to `KuriError[]`.

Each `issues.push({ message, severity, line, column })` becomes:
```typescript
issues.push(createKuriError('K300', {
    message: '...',
    line: node.line,
    column: node.column,
    category: 'structure',
}));
```

Use K300 for general structural issues (add to registry if not present). Assign specific codes where appropriate (K301 for too many plots, etc.).

- [ ] **Step 3: Build to verify**

```bash
cd packages/kuri-engine && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add packages/kuri-engine/src/irValidator.ts
git commit -m "refactor(kuri-engine): migrate IR validator to KuriError type"
```

---

## Task 5: Migrate Semantic Validator

**Files:**
- Modify: `packages/kuri-engine/src/semanticValidator.ts`

- [ ] **Step 1: Replace `SemanticIssue` with `KuriError` imports**

Replace the interface at lines 28-35:

```typescript
import { createKuriError } from './errors';
import type { KuriError } from './errors';

// Keep as deprecated alias
export type SemanticIssue = KuriError;
```

- [ ] **Step 2: Update `validateSemantics()` return type**

Change signature from `SemanticIssue[]` to `KuriError[]`.

- [ ] **Step 3: Update all `issues.push()` calls to use `createKuriError()`**

The semantic validator already has K-codes in most push calls. Convert from:
```typescript
issues.push({ line, column, message, severity: 'error', code: 'K001', suggestion: '...' });
```
To:
```typescript
issues.push(createKuriError('K001', { message, line, column, suggestion: '...' }));
```

The factory reads severity and category from the registry automatically.

- [ ] **Step 4: Build to verify**

```bash
cd packages/kuri-engine && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add packages/kuri-engine/src/semanticValidator.ts
git commit -m "refactor(kuri-engine): migrate semantic validator to KuriError type"
```

---

## Task 6: Migrate TypeChecker to Structured Output

**Files:**
- Modify: `packages/kuri-engine/src/typeChecker.ts`

- [ ] **Step 1: Change `errors` field from `string[]` to `KuriError[]`**

At line 31, change:
```typescript
private errors: string[] = [];
```
To:
```typescript
import { createKuriError } from './errors';
import type { KuriError } from './errors';

private errors: KuriError[] = [];
```

- [ ] **Step 2: Update `check()` return type**

```typescript
public check(program: Program): KuriError[] {
```

- [ ] **Step 3: Create a private `addError` helper**

```typescript
private addError(node: ASTNode | null, code: string, message: string, suggestion?: string) {
    this.errors.push(createKuriError(code, {
        message,
        category: 'type',
        line: node?.line ?? 1,
        column: node?.column ?? 1,
        suggestion,
    }));
}
```

- [ ] **Step 4: Replace all `this.errors.push(...)` string pushes with `this.addError()` calls**

Find every instance of `this.errors.push(` and convert. Example:

Before: `this.errors.push(\`If condition must be boolean, got ${condType}\`);`
After: `this.addError(node, 'K801', \`If condition must be boolean, got ${condType}\`);`

Assign appropriate K8xx codes for type errors (K800-K899 range, already in registry).

- [ ] **Step 5: Build to verify**

```bash
cd packages/kuri-engine && pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add packages/kuri-engine/src/typeChecker.ts
git commit -m "refactor(kuri-engine): TypeChecker returns KuriError[] instead of string[]"
```

---

## Task 6b: Update Existing Tests for New Return Types

**Files:**
- Modify: `packages/kuri-engine/src/__tests__/typeChecker.test.ts`
- Modify: `packages/kuri-engine/src/__tests__/4_3_error_reporting.test.ts`

This task must happen immediately after Task 6 to keep the build green at every commit.

- [ ] **Step 1: Update typeChecker.test.ts assertions**

The tests currently assert against `string` elements. Update to assert against `KuriError` objects:

Before: `expect(errors[0]).toContain('Cannot assign string to int')`
After: `expect(errors[0].message).toContain('Cannot assign string to int')`

Apply this pattern to every `expect(errors[N]).toContain(...)` assertion in the file.

- [ ] **Step 2: Update 4_3_error_reporting.test.ts assertions**

Same pattern — update string assertions to check `.message` property:

Before: `expect(errors[0]).toContain('Error at script')`
After: `expect(errors[0].message).toContain('Error at script')`

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd packages/kuri-engine && pnpm test
```

Expected: All updated tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/kuri-engine/src/__tests__/typeChecker.test.ts packages/kuri-engine/src/__tests__/4_3_error_reporting.test.ts
git commit -m "test(kuri-engine): update test assertions for KuriError[] return types"
```

---

## Task 7: Simplify `provideDiagnostics()` in kuri.ts

**Files:**
- Modify: `packages/kuri-engine/src/kuri.ts`

- [ ] **Step 1: Remove the `KuriDiagnostic` interface definition from kuri.ts**

The interface is now exported from `errors/kuriError.ts`. Import it instead:

```typescript
import { createKuriError } from './errors';
import type { KuriError } from './errors';
// Keep alias for public export
export type { KuriDiagnostic } from './errors';
```

- [ ] **Step 2: Update `provideDiagnostics()` return type to `KuriError[]`**

Change signature at line 581:
```typescript
public static provideDiagnostics(script: string): KuriError[] {
```

- [ ] **Step 3: Simplify Phase 3 (TypeChecker) integration**

The TypeChecker now returns `KuriError[]` directly. Replace the string-to-diagnostic conversion (lines 644-665) with a direct spread:

```typescript
// Phase 3: Type checker
try {
    const checker = new TypeChecker();
    const typeErrors = checker.check(ast);
    diagnostics.push(...typeErrors);
} catch (e: any) {
    diagnostics.push(createKuriError('K500', {
        message: `Type checker error: ${e.message}`,
        severity: 'warning',
    }));
}
```

- [ ] **Step 4: Simplify Phase 4b (IR validation) and Phase 5 (Semantic validation)**

Both now return `KuriError[]`, so the mapping code simplifies to `diagnostics.push(...issues)`.

- [ ] **Step 5: Simplify Phase 1/2 (Lexer/Parser) error creation**

Replace manual diagnostic object creation with `createKuriError()`:

```typescript
// Phase 1: Lexer
} catch (e: any) {
    diagnostics.push(createKuriError('K000', {
        message: e.message,
        category: 'syntax',
        line: extractedLine,
        column: extractedColumn,
    }));
    return diagnostics;
}
```

- [ ] **Step 6: Replace Phase 6 (Script structure) with `createKuriError()` calls**

Replace the manual object construction at lines 735-780 with registry-backed errors:
```typescript
diagnostics.push(createKuriError('K061', {
    message: 'Missing script declaration. Start with indicator("Name") or strategy("Name").',
}));
```

- [ ] **Step 7: Add deduplication before return**

Before the final `return diagnostics;`, deduplicate:

```typescript
// Deduplicate by (code, line, column)
const seen = new Set<string>();
const deduped = diagnostics.filter(d => {
    const key = `${d.code}:${d.line}:${d.column}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
});
return deduped;
```

- [ ] **Step 8: Build to verify**

```bash
cd packages/kuri-engine && pnpm build
```

- [ ] **Step 9: Commit**

```bash
git add packages/kuri-engine/src/kuri.ts
git commit -m "refactor(kuri-engine): simplify provideDiagnostics with unified KuriError"
```

---

## Task 7b: Migrate BackendVM to Coded Errors

**Files:**
- Modify: `packages/kuri-engine/src/backendVM.ts`

The BackendVM currently throws generic `Error` and `RuntimeLimitError` without K-codes. This task adds codes to all throw sites so the new K5xx/K6xx codes are actually produced at runtime.

- [ ] **Step 1: Update `RuntimeLimitError` throws to include K6xx codes**

Find all `throw new RuntimeLimitError(...)` calls in backendVM.ts and add the appropriate code:

```typescript
// Before:
throw new RuntimeLimitError('Maximum loop iterations exceeded');
// After:
throw new RuntimeLimitError('Maximum loop iterations exceeded', 'K601');

// Before:
throw new RuntimeLimitError('Maximum execution time exceeded');
// After:
throw new RuntimeLimitError('Maximum execution time exceeded', 'K602');

// Before:
throw new RuntimeLimitError('Maximum recursion depth exceeded');
// After:
throw new RuntimeLimitError('Maximum recursion depth exceeded', 'K603');
```

- [ ] **Step 2: Update generic `throw new Error(...)` calls to use `KuriRuntimeError` with K5xx codes**

Find all `throw new Error(...)` in backendVM.ts and convert:

```typescript
// Before:
throw new Error(`Unknown function: ${funcName}`);
// After:
throw new KuriRuntimeError(`Unknown function: ${funcName}`, node?.line ?? 0, node?.column ?? 0, 'script', 'RUNTIME');
// (or use createKuriError for diagnostic contexts — but throw contexts need a class)
```

For throw contexts, keep using the class but ensure the error message includes the K-code prefix:

```typescript
throw new Error(`[K504] Unknown function: ${funcName}`);
```

This ensures that when `provideDiagnostics` or the frontend catches these, the K-code is extractable.

- [ ] **Step 3: Build to verify**

```bash
cd packages/kuri-engine && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add packages/kuri-engine/src/backendVM.ts
git commit -m "feat(kuri-engine): add K-codes to all backendVM error throws"
```

---

## Task 8: Refactor BottomConsole — Add Suggestion Display, Filters, Grouping

**Files:**
- Modify: `src/components/strategy-studio/BottomConsole.tsx`

- [ ] **Step 1: Extend the `ConsoleLog` interface (line 111)**

```typescript
export interface ConsoleLog {
    timestamp: string;
    message: string;
    type: 'info' | 'error' | 'success' | 'warn';
    line?: number;
    column?: number;
    code?: string;
    suggestion?: string;
    category?: string;
}
```

- [ ] **Step 2: Add severity filter state and tabs**

Inside the component, add filter state:

```typescript
const [activeFilter, setActiveFilter] = React.useState<'all' | 'error' | 'warn' | 'info'>('all');

const filteredLogs = React.useMemo(() => {
    if (activeFilter === 'all') return logs;
    return logs.filter(l => l.type === activeFilter);
}, [logs, activeFilter]);
```

Add filter tabs in the header bar (next to the error/warning count badges):

```tsx
<div className="flex gap-1 ml-2">
    {(['all', 'error', 'warn', 'info'] as const).map(filter => (
        <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-2 py-0.5 text-[10px] rounded ${
                activeFilter === filter ? 'bg-[#3c3c3c] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
        >
            {filter === 'all' ? 'All' : filter === 'error' ? 'Errors' : filter === 'warn' ? 'Warnings' : 'Info'}
        </button>
    ))}
</div>
```

- [ ] **Step 3: Add suggestion rendering**

In the log entry render, after the message, add:

```tsx
{log.suggestion && (
    <div className="ml-6 text-blue-400 text-[10px] italic mt-0.5">
        Hint: {log.suggestion}
    </div>
)}
```

- [ ] **Step 4: Add error grouping for 8+ identical errors**

Before rendering, group logs by code+message:

```typescript
const groupedLogs = React.useMemo(() => {
    const groups = new Map<string, { logs: ConsoleLog[]; key: string }>();
    const result: (ConsoleLog | { grouped: true; key: string; count: number; sample: ConsoleLog; logs: ConsoleLog[] })[] = [];

    for (const log of filteredLogs) {
        const groupKey = log.code ? `${log.code}:${log.message}` : '';
        if (groupKey && groups.has(groupKey)) {
            groups.get(groupKey)!.logs.push(log);
        } else if (groupKey) {
            const group = { logs: [log], key: groupKey };
            groups.set(groupKey, group);
        }
    }

    const expandedGroups = new Set<string>();
    // ... render grouped or individual
    return { groups, filteredLogs };
}, [filteredLogs]);
```

Add expand/collapse state for groups:
```typescript
const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());
```

Render grouped entries as:
```tsx
// If group has 8+ entries and is not expanded
<div className="flex items-center gap-2 text-gray-400 text-[11px]">
    <span className="text-gray-500 font-bold">[{group.sample.code}]</span>
    <span>{group.sample.message} ({group.count} occurrences)</span>
    <button onClick={() => toggleGroup(group.key)} className="text-blue-400 text-[10px]">
        [expand]
    </button>
</div>
```

- [ ] **Step 5: Update the render loop to use `filteredLogs` instead of `logs`**

Replace all references to `logs` in the JSX with `filteredLogs` (or the grouped output).

- [ ] **Step 6: Build frontend to verify**

```bash
pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add src/components/strategy-studio/BottomConsole.tsx
git commit -m "feat(strategy-studio): add suggestion display, severity filters, error grouping to console"
```

---

## Task 9: Refactor addLog in StrategyStudio

**Files:**
- Modify: `src/pages/StrategyStudio.tsx`

- [ ] **Step 1: Change `addLog` signature to object parameter**

Find the `addLog` function definition (~line 513) and replace:

```typescript
interface AddLogOptions {
    message: string;
    type: 'info' | 'error' | 'success' | 'warn';
    line?: number;
    column?: number;
    code?: string;
    suggestion?: string;
    category?: string;
}

const addLog = (opts: AddLogOptions) => {
    const timestamp = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
    setLogs((prev) => [...prev, {
        timestamp,
        message: opts.message,
        type: opts.type,
        line: opts.line,
        column: opts.column,
        code: opts.code,
        suggestion: opts.suggestion,
        category: opts.category,
    }]);
};
```

- [ ] **Step 2: Update all 32 addLog call sites**

Convert each call from positional to object syntax. Examples:

Line 406: `addLog(d.message, 'error', d.line, d.column, d.code)` →
```typescript
addLog({ message: d.message, type: 'error', line: d.line, column: d.column, code: d.code, suggestion: d.suggestion });
```

Line 464: `addLog('Strategy Studio initialized. Ready.', 'info')` →
```typescript
addLog({ message: 'Strategy Studio initialized. Ready.', type: 'info' });
```

Line 629: `addLog(\`Warning (Line ${w.line}): ${w.message}\`, 'warn')` →
```typescript
addLog({ message: w.message, type: 'warn', line: w.line, column: w.column, code: w.code, suggestion: w.suggestion });
```

Line 759: `addLog(\`⚠ Line ${w.line}: ${w.message}\`, 'error')` →
```typescript
addLog({ message: w.message, type: 'warn', line: w.line, column: w.column, code: w.code, suggestion: w.suggestion });
```
Note: fix the bug where warnings were logged as 'error' type.

- [ ] **Step 3: Build to verify**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/StrategyStudio.tsx
git commit -m "refactor(strategy-studio): switch addLog to object parameter, pass full diagnostic metadata"
```

---

## Task 10: Create Market Page Error Utils

**Files:**
- Create: `src/components/market-chart/errorUtils.ts`

- [ ] **Step 1: Create `errorUtils.ts` with ChartError interface and adapter**

```typescript
// src/components/market-chart/errorUtils.ts

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
        severity: (error.severity === 'warning' ? 'warning' : 'error'),
        timestamp: Date.now(),
        dismissible: true,
    };
}

export function toChartErrorFromString(message: string, source: string, severity: 'error' | 'warning' = 'error'): ChartError {
    return {
        id: `chart-error-${++errorCounter}`,
        source,
        message,
        severity,
        timestamp: Date.now(),
        dismissible: true,
    };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/market-chart/errorUtils.ts
git commit -m "feat(market): add ChartError type and adapter utils"
```

---

## Task 11: Add Error Banner to Market Page

**Files:**
- Modify: `src/pages/Market.tsx`

- [ ] **Step 1: Add chart error state to Market.tsx**

Near the top of the component, add:

```typescript
import type { ChartError } from '../components/market-chart/errorUtils';
import { toChartErrorFromString } from '../components/market-chart/errorUtils';

const [chartErrors, setChartErrors] = useState<ChartError[]>([]);

const addChartError = (error: ChartError) => {
    setChartErrors(prev => [...prev.filter(e => e.source !== error.source), error]);
};

const dismissChartError = (id: string) => {
    setChartErrors(prev => prev.filter(e => e.id !== id));
};

const clearChartErrors = (source?: string) => {
    if (source) {
        setChartErrors(prev => prev.filter(e => e.source !== source));
    } else {
        setChartErrors([]);
    }
};
```

- [ ] **Step 2: Add error banner UI**

Above or below the chart component, render:

```tsx
{chartErrors.length > 0 && (
    <div className="flex flex-col gap-1 px-3 py-2 bg-[#1a1a2e] border-b border-red-900/30">
        {chartErrors.map(err => (
            <div
                key={err.id}
                className={`flex items-center justify-between text-xs px-2 py-1 rounded ${
                    err.severity === 'error' ? 'bg-red-900/20 text-red-400' : 'bg-yellow-900/20 text-yellow-400'
                }`}
            >
                <span>
                    <span className="font-medium">{err.source}:</span> {err.message}
                </span>
                {err.dismissible && (
                    <button
                        onClick={() => dismissChartError(err.id)}
                        className="ml-2 text-gray-500 hover:text-gray-300"
                    >
                        ×
                    </button>
                )}
            </div>
        ))}
    </div>
)}
```

- [ ] **Step 3: Wire up existing silent catch blocks to `addChartError`**

Find the 3 silent data loading failures and add error banners:

```typescript
// ~line 278-303 (market state load)
} catch (error) {
    console.error('Failed to load market state', error);
    addChartError(toChartErrorFromString('Failed to load market state', 'Data Loading'));
    setSymbol('EURUSD');
    setActiveTimeframe('1H');
}

// ~line 374-383 (load indicators)
} catch (e) {
    console.error('Failed to load indicators', e);
    addChartError(toChartErrorFromString('Failed to load indicators', 'Data Loading'));
}

// ~line 478-511 (fetch chart data)
} catch (error) {
    console.error('Failed to fetch chart data:', error);
    addChartError(toChartErrorFromString('Failed to fetch chart data', 'Data Loading'));
    setChartData([]);
}
```

- [ ] **Step 4: Pass `addChartError` and `clearChartErrors` to CandlestickChart as props**

Add to the CandlestickChart component usage:
```tsx
<CandlestickChart
    // ... existing props
    onChartError={addChartError}
    onClearErrors={clearChartErrors}
/>
```

- [ ] **Step 5: Build to verify**

```bash
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/Market.tsx
git commit -m "feat(market): add error banner system and fix silent load failures"
```

---

## Task 11b: Surface Signal Engine Errors to UI

**Files:**
- Modify: `src/engine/signalEngine.ts`

The signal engine collects errors in `stats.errors` array (lines 281, 298, 308, 320) but never exposes them to any UI.

- [ ] **Step 1: Export a function or event to surface signal errors**

Add a callback-based approach so the Market page can subscribe:

```typescript
// At module level in signalEngine.ts
type ErrorCallback = (errors: string[]) => void;
let onSignalErrors: ErrorCallback | null = null;

export function setSignalErrorCallback(cb: ErrorCallback | null) {
    onSignalErrors = cb;
}
```

- [ ] **Step 2: Call the callback at the end of the scan loop**

After the signal scan completes, if there are errors, notify:

```typescript
// At the end of the scan loop, after stats are compiled
if (stats.errors.length > 0 && onSignalErrors) {
    onSignalErrors(stats.errors);
}
```

- [ ] **Step 3: Wire up in Market.tsx**

In the Market page, import and connect:

```typescript
import { setSignalErrorCallback } from '../engine/signalEngine';

useEffect(() => {
    setSignalErrorCallback((errors) => {
        errors.forEach(msg => {
            addChartError(toChartErrorFromString(msg, 'Signal Engine', 'warning'));
        });
    });
    return () => setSignalErrorCallback(null);
}, []);
```

- [ ] **Step 4: Build to verify**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/engine/signalEngine.ts src/pages/Market.tsx
git commit -m "feat(market): surface signal engine errors to UI banner"
```

---

## Task 12: Fix Structured Returns in helpers.ts and strategyEngine.ts

**Files:**
- Modify: `src/components/market-chart/helpers.ts`
- Modify: `src/engine/strategyEngine.ts`

- [ ] **Step 1: Add discriminated union types to `helpers.ts`**

Add at the top:
```typescript
export type IndicatorResult =
    | { ok: true; data: Record<string, (number | null)[]> }
    | { ok: false; error: string };
```

Update the `calculateIndicator` function's catch block (~line 337):

Before: `return {};`
After: `return { ok: false, error: \`Error calculating indicator ${type}: ${(error as Error).message}\` };`

And the success path:
Before: `return result;`
After: `return { ok: true, data: result };`

- [ ] **Step 2: Add discriminated union to `strategyEngine.ts`**

Add:
```typescript
export type StrategyResult =
    | { ok: true; signals: StrategyEvaluationResult[] }
    | { ok: false; error: string };
```

Update the main function's catch (~line 41-113):

Before: `return [];`
After: `return { ok: false, error: \`Kuri execution failed for ${strategy.name}: ${error.message}\` };`

And success: `return { ok: true, signals: evaluationResults };`

- [ ] **Step 3: Update all callers of these functions**

Search for where `calculateIndicator` and the strategy runner are called. Update them to check `result.ok` before accessing data:

```typescript
const result = calculateIndicator(type, data, params);
if (!result.ok) {
    // Handle error — add to chart errors, clear stale data
    addChartError(toChartErrorFromString(result.error, `${type} Indicator`));
    return;
}
// Use result.data safely
```

- [ ] **Step 4: Build to verify**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/market-chart/helpers.ts src/engine/strategyEngine.ts
git commit -m "feat: use discriminated unions for indicator/strategy results"
```

---

## Task 13: Fix CandlestickChart — Empty Catches, Per-Indicator Error Boundaries, Stale Data

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`

- [ ] **Step 1: Fix the empty catch at line 4535**

Replace `} catch {}` with:
```typescript
} catch (e) {
    console.warn('Failed to restore drawing toolbar position:', e);
}
```

- [ ] **Step 2: Fix the empty `.catch(() => {})` at line 7535**

Replace with meaningful error handling:
```typescript
.catch((e) => {
    console.warn('Async operation failed:', e);
});
```

- [ ] **Step 3: Add per-indicator try/catch in the rendering loop**

In the indicator rendering section (~lines 8250-8991), wrap each individual indicator's rendering in its own try/catch:

```typescript
for (const indicator of activeIndicators) {
    try {
        // ... existing rendering code for this one indicator
    } catch (e) {
        console.error('Error rendering indicator:', indicator.id, e);
        // Draw error label on chart at indicator's panel position
        if (onChartError) {
            onChartError(toChartErrorFromString(
                `Failed to render ${indicator.type}`,
                `${indicator.type} Indicator`
            ));
        }
    }
}
```

- [ ] **Step 4: Add stale data cleanup on Kuri execution failure**

In the Kuri indicator execution section (~line 886-996 and 1449-1734), when a catch fires, clear that indicator's data:

```typescript
} catch (e) {
    console.error('Failed to execute Kuri indicator script:', e);
    // Clear stale data for this indicator
    setIndicators(prev => prev.map(ind =>
        ind.id === indicator.id ? { ...ind, data: {}, error: (e as Error).message } : ind
    ));
    if (onChartError) {
        onChartError(toChartErrorFromString(
            `${indicator.type} execution failed: ${(e as Error).message}`,
            indicator.type
        ));
    }
}
```

- [ ] **Step 5: Add `onChartError` and `onClearErrors` to CandlestickChart props**

```typescript
interface CandlestickChartProps {
    // ... existing props
    onChartError?: (error: ChartError) => void;
    onClearErrors?: (source?: string) => void;
}
```

- [ ] **Step 6: Build to verify**

```bash
pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "fix(market): fix empty catches, add per-indicator error boundaries, stale data cleanup"
```

---

## Task 14: Final Integration — Build and Verify

**Files:** All modified files

- [ ] **Step 1: Rebuild kuri-engine package**

```bash
cd packages/kuri-engine && pnpm build
```

Expected: Clean compile.

- [ ] **Step 2: Build the full frontend**

```bash
pnpm build
```

Expected: Clean compile with no TypeScript errors.

- [ ] **Step 3: Run existing tests**

```bash
cd packages/kuri-engine && pnpm test
```

Review any failures — they should only be from tests that check old return types (`string[]` from TypeChecker, `SemanticIssue[]` from validator). Update those test assertions to match `KuriError[]`.

- [ ] **Step 4: Start dev server and verify Strategy Studio**

```bash
pnpm dev
```

Open Strategy Studio, type an invalid script like:
```
indicator("Test")
x = ta.smaa(close, 14)
plot(x)
```

Verify:
- Monaco shows squiggly underline at `ta.smaa`
- BottomConsole shows `[K002] Unknown function 'ta.smaa'` with suggestion `Did you mean 'ta.sma'?`
- Suggestion appears as italic blue text below the error
- Filter tabs work (Errors/Warnings/Info/All)

- [ ] **Step 5: Verify Market page**

Navigate to Market page. If any indicators fail to load:
- Error banner appears below chart header
- Failed indicator data is cleared (no stale overlay)
- Banner is dismissible

- [ ] **Step 6: Final commit**

If there are any remaining unstaged changes from the plan, stage only the specific files modified:

```bash
git add packages/kuri-engine/src/ src/components/strategy-studio/ src/pages/StrategyStudio.tsx src/pages/Market.tsx src/components/market-chart/ src/engine/strategyEngine.ts src/engine/signalEngine.ts
git commit -m "feat: complete kuri error system rebuild — unified types, market error handling, console UX"
```

Do NOT use `git add -A` — this repo has 100+ untracked files that should not be committed.
