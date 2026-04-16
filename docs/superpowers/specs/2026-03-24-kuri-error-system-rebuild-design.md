# Kuri Error System Rebuild — Design Spec

**Date:** 2026-03-24
**Scope:** Targeted modernization of the Kuri scripting engine error system across the kuri-engine package, Strategy Studio, and Market page.
**Approach:** Fix and unify what exists rather than rewrite from scratch. The current 6-phase diagnostic pipeline, K-code system, and Monaco integration are architecturally sound — the problems are fragmentation, gaps, and underused features.

---

## 1. Unified Error Type System

### Problem

7 different error representations exist across the codebase:

| Component | Type | Has Codes | Has Position | Has Suggestion |
|-----------|------|-----------|-------------|----------------|
| `KuriRuntimeError` | Class | No | Yes | No |
| `RuntimeLimitError` | Class | No | No | No |
| `SemanticIssue` | Interface | Yes (K001-K401) | Yes | Yes |
| `IRValidationIssue` | Interface | No | Optional | No |
| `KuriDiagnostic` | Interface | Inherited | Yes (span) | Yes |
| `TypeChecker.check()` | `string[]` | No | No | No |
| BackendVM errors | Generic `Error` | No | No | No |

### Solution

Introduce one canonical error interface in `packages/kuri-engine/src/errors/kuriError.ts`:

```typescript
export type ErrorSeverity = 'error' | 'warning' | 'info';

export type ErrorCategory =
  | 'syntax'     // Lexer/Parser
  | 'type'       // Type checker
  | 'semantic'   // Semantic validator
  | 'structure'  // IR/script structure validation
  | 'runtime'    // VM execution errors
  | 'limit'      // Safety limit violations
  | 'security';  // Security violations

export interface KuriError {
  code: string;            // K-code (e.g., "K001", "K501")
  message: string;         // Human-readable description
  severity: ErrorSeverity;
  category: ErrorCategory;
  line: number;            // Required — default to 1 if unknown
  column: number;          // Required — default to 1 if unknown
  endLine: number;         // Required — for Monaco marker spans
  endColumn: number;       // Required — for Monaco marker spans
  suggestion?: string;     // Actionable fix suggestion
}

// Factory function — reads defaults from ERROR_REGISTRY, ensures required fields
export function createKuriError(code: string, overrides: Partial<KuriError> & { message: string }): KuriError

```

### Migration

- `SemanticIssue` — Already close. Add `category: 'semantic'`, rename to return `KuriError[]`.
- `IRValidationIssue` — Add `code` and `category: 'structure'` fields, return `KuriError[]`.
- `KuriDiagnostic` — Replaced entirely. The `endLine`/`endColumn` span info is now required on `KuriError` itself, so `KuriDiagnostic` is no longer needed. Export `KuriError` as the public type and add `export type KuriDiagnostic = KuriError` as a temporary alias for backwards compatibility.
- `KuriRuntimeError` class — Deprecated. Replace with `KuriError` objects for diagnostic reporting. Keep a minimal class for `throw` contexts in the VM that includes `code` and `category`.
- `RuntimeLimitError` — Extend to include a `code` field (K5xx range).
- `TypeChecker` — Refactored to return `KuriError[]` (see Section 2).

### K-Code Numbering

Keep existing codes (K001-K401) as-is. Extend for currently uncoded areas:

| Range | Category | Status |
|-------|----------|--------|
| K001-K080 | Semantic (existing) | Keep as-is |
| K100-K161 | Semantic warnings (existing) | Keep as-is |
| K301-K303 | Plot limits (existing) | Keep as-is |
| K401 | Strategy close mismatch (existing) | Keep as-is |
| K500-K599 | Runtime errors (NEW) | VM execution failures |
| K600-K699 | Safety limits (NEW) | Max operations, time, memory |
| K700-K799 | Security (NEW) | Restricted access violations |

No renumbering of existing codes to avoid breaking references.

---

## 2. TypeChecker Structured Output

### Problem

`TypeChecker.check()` returns `string[]` — plain error message strings with no position info, no error codes, no suggestions. These are treated as advisory warnings and under-integrated into the diagnostic pipeline.

### Solution

Refactor `TypeChecker` to return `KuriError[]`:

```typescript
export class TypeChecker {
  private errors: KuriError[] = [];

  public check(program: Program): KuriError[] {
    this.errors = [];
    for (const stmt of program.body) {
      this.inferType(stmt);
    }
    return this.errors;
  }

  private addError(node: ASTNode, code: string, message: string, suggestion?: string) {
    this.errors.push({
      code,
      message,
      severity: 'error',
      category: 'type',
      line: node.line ?? 1,       // Fallback for synthetic/generated nodes
      column: node.column ?? 1,
      endLine: node.line ?? 1,
      endColumn: (node.column ?? 1) + 1,
      suggestion,
    });
  }
}
```

The TypeChecker already has access to AST nodes with `.line` and `.column` — it just discards them when converting to strings. This refactor preserves existing logic and adds structured output.

### Impact

- Type errors now appear with proper Monaco squiggly underlines at the correct line
- Type errors get K-codes for the error registry
- Type errors can include suggestions ("Expected series<float>, got float — did you mean to use `close[0]`?")

---

## 3. Market Page Error Handling

### Problem

The audit found 9 critical gaps where errors disappear silently on the Market page:

1. **Stale data on failure** — When a Kuri indicator execution fails, old data stays on the chart with no warning
2. **Empty return masking crashes** — `helpers.ts` returns `{}` on failure, causing downstream `undefined` access
3. **Strategy engine silent failures** — `strategyEngine.ts` returns `[]` on crash, indistinguishable from "no signals"
4. **No user-visible error feedback** — All 3 data loading failures in `Market.tsx` log to console only
5. **700+ lines of unprotected rendering** — `CandlestickChart.tsx` lines 8250-8991 have no per-indicator error boundaries
6. **Alert engine fed invalid data** — `feedIndicatorToAlertEngine()` doesn't validate `indicator.data`
7. **Signal loop errors collected but never shown** — `signalEngine.ts` pushes to `stats.errors` array that UI never reads
8. **Empty catch blocks** — `CandlestickChart.tsx` lines 4521, 7513
9. **Generic error boundary** — "Chart failed to load" with no details

### Solution

#### 3a. Error Toast/Banner System

Add a lightweight error notification system to the Market page for indicator/strategy failures:

```typescript
// In Market.tsx or a shared context
interface ChartError {
  id: string;           // Unique per error instance
  source: string;       // "SMA Indicator" | "Momentum Strategy" | "Data Loading"
  message: string;      // Human-readable description
  severity: 'error' | 'warning';
  timestamp: number;
  dismissible: boolean;
}
```

Errors appear as a small banner above/below the chart (not a modal — don't interrupt trading view). Persist all errors/warnings until user dismisses or until the next successful execution clears them. A `toChartError(kuriError: KuriError, source: string): ChartError` adapter function in `src/components/market-chart/errorUtils.ts` maps engine errors to display errors.

#### 3b. Stale Data Cleanup

When a Kuri indicator execution fails:
1. Clear that indicator's data from the chart (don't leave old overlays)
2. Show the indicator in an "error" state in the indicator panel (red icon, error message on hover)
3. Preserve the indicator configuration so the user can retry

#### 3c. Structured Error Returns

Replace silent `[]` and `{}` returns with discriminated unions that force callers to check success/failure:

```typescript
// strategyEngine.ts
type StrategyResult =
  | { ok: true; signals: StrategyEvaluationResult[] }
  | { ok: false; error: string };

// helpers.ts
type IndicatorResult =
  | { ok: true; data: Record<string, (number | null)[]> }
  | { ok: false; error: string };
```

Callers must check `result.ok` before accessing `result.signals` or `result.data` — TypeScript enforces this at compile time, making it impossible to silently ignore failures.

#### 3d. Per-Indicator Error Boundaries

Wrap each indicator's rendering in its own try/catch within the rendering loop (lines 8250-8991). If one indicator fails to render, others continue. The failed indicator shows a red dashed line or "Error" label on the chart.

#### 3e. Fix Empty Catch Blocks

Replace all `catch {}` and `.catch(() => {})` with proper logging or user-visible feedback. No silent swallowing.

---

## 4. BottomConsole UX Improvements

### Problem

The BottomConsole has suggestions and error codes flowing through the pipeline but never displays them:
- `ConsoleLog` interface lacks a `suggestion` field
- Error codes shown as gray text but not clickable or explained
- No filtering by severity
- No grouping of duplicate errors
- 32 `addLog` call sites — most format strings manually and lose metadata

### Solution

#### 4a. Extend ConsoleLog Interface

```typescript
export interface ConsoleLog {
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success' | 'warn';
  line?: number;
  column?: number;
  code?: string;
  suggestion?: string;   // NEW — actionable fix hint
  category?: string;     // NEW — error category for grouping
}
```

#### 4b. Render Suggestions

Below each error that has a suggestion, show a light hint line:

```
[K002] Unknown function 'ta.smaa' at line 12
  Hint: Did you mean 'ta.sma'?
```

Styled as `text-blue-400 text-xs italic` to distinguish from the error message.

#### 4c. Severity Filter Tabs

Add tabs above the log list: **All** | **Errors** (red) | **Warnings** (yellow) | **Info** (blue)

Each tab shows count badge. Default to "All" but auto-switch to "Errors" when new errors appear.

#### 4d. Error Grouping

When the same K-code AND same message text appear 8+ times, collapse into a summary:

```
[K201] Undefined variable (7 occurrences)  [expand]
```

Clicking expand shows all individual instances with their line numbers. Group by code+message (not code alone) so that 3 different undefined variables are shown individually, but 10 instances of the exact same error get collapsed.

#### 4e. Refactor addLog to Object Parameter

The current `addLog` takes 5 positional params. Adding `suggestion` as a 6th positional arg is fragile across 32 call sites. Switch to an object parameter:

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

const addLog = (opts: AddLogOptions) => { ... };
```

**Before:**
```typescript
addLog(`Warning (Line ${w.line}): ${w.message}`, 'warn');
```

**After:**
```typescript
addLog({ message: w.message, type: 'warn', line: w.line, column: w.column, code: w.code, suggestion: w.suggestion });
```

All 32 call sites updated in one pass. The object pattern prevents parameter ordering bugs.

---

## 5. Error Code Registry

### Problem

Error codes are scattered as inline strings throughout the semantic validator. No central place to look up what a code means. Users see `[K001]` in the console but have no way to understand it.

### Solution

Create `packages/kuri-engine/src/errors/errorRegistry.ts`:

```typescript
export interface ErrorDefinition {
  code: string;
  title: string;         // "Undefined Variable"
  description: string;   // Longer explanation for tooltips/docs
  category: ErrorCategory;
  severity: ErrorSeverity;
}

export const ERROR_REGISTRY: Record<string, ErrorDefinition> = {
  // Semantic errors
  K001: {
    code: 'K001',
    title: 'Undefined Variable',
    description: 'A variable was used before being declared. Check for typos or add a declaration.',
    category: 'semantic',
    severity: 'error',
  },
  K002: {
    code: 'K002',
    title: 'Unknown Function',
    description: 'The function name is not recognized. Check spelling or see the Kuri function reference.',
    category: 'semantic',
    severity: 'error',
  },
  // ... all existing K-codes migrated here
  // ... new K5xx, K6xx, K7xx codes added here

  // Runtime errors (NEW)
  K501: {
    code: 'K501',
    title: 'Division by Zero',
    description: 'Attempted to divide by zero at runtime.',
    category: 'runtime',
    severity: 'error',
  },
  // ... etc.
};

export function getErrorInfo(code: string): ErrorDefinition | undefined {
  return ERROR_REGISTRY[code];
}
```

### Usage

- **BottomConsole**: Hover over error code shows `title` + `description` tooltip
- **Monaco integration**: Error code hover shows registry info
- **Future**: Error docs page auto-generated from registry

---

## Files Modified

### kuri-engine package
| File | Change |
|------|--------|
| `src/errors/kuriError.ts` | NEW — Unified `KuriError` interface and types |
| `src/errors/errorRegistry.ts` | NEW — Central error code registry |
| `src/kuriError.ts` | DEPRECATE — Replace with new error module |
| `src/semanticValidator.ts` | Return `KuriError[]` instead of `SemanticIssue[]` |
| `src/irValidator.ts` | Return `KuriError[]` instead of `IRValidationIssue[]`, add codes |
| `src/typeChecker.ts` | Return `KuriError[]` instead of `string[]` |
| `src/runtimeLimits.ts` | Add `code` field to `RuntimeLimitError` |
| `src/backendVM.ts` | Use coded errors for all throws |
| `src/kuri.ts` | Simplify `provideDiagnostics()` — all stages return same type |
| `src/index.ts` | Export new error types, deprecate old ones |

### Frontend — Strategy Studio
| File | Change |
|------|--------|
| `src/components/strategy-studio/BottomConsole.tsx` | Add suggestion display, severity filters, error grouping |
| `src/pages/StrategyStudio.tsx` | Update all 32 `addLog` calls to pass full metadata |

### Frontend — Market Page
| File | Change |
|------|--------|
| `src/pages/Market.tsx` | Add error toast/banner system, fix silent load failures |
| `src/components/market-chart/CandlestickChart.tsx` | Per-indicator error boundaries, stale data cleanup, fix empty catches |
| `src/components/market-chart/helpers.ts` | Return structured `IndicatorResult` instead of `{}` on failure |
| `src/engine/strategyEngine.ts` | Return `StrategyResult` with optional error field |
| `src/components/market-chart/errorUtils.ts` | NEW — `toChartError()` adapter function |
| `src/engine/signalEngine.ts` | Surface `stats.errors` to UI |

---

## Additional Considerations

### Error Deduplication

`provideDiagnostics()` may receive the same error from both the TypeChecker and the semantic validator (e.g., "undefined variable"). After unification, deduplicate by `(code, line, column)` tuple before returning.

### Registry as Source of Truth

The `ERROR_REGISTRY` is the single source of truth for a code's default severity and category. The `createKuriError()` factory reads these from the registry. Instance-level overrides are allowed only for severity (e.g., downgrading an error to a warning in specific contexts) and must be explicit.

### Test Updates

The following test files need updating when return types change:

- `packages/kuri-engine/src/__tests__/4_3_error_reporting.test.ts` — Update for `KuriError[]` return types
- `packages/kuri-engine/src/__tests__/typeChecker.test.ts` — Update for structured output
- New tests for K5xx/K6xx/K7xx code ranges
- New tests for `createKuriError()` factory
- Frontend tests for BottomConsole filtering/grouping (if any exist)

---

## Out of Scope

- Inline error peek panels in Monaco (too complex for this pass)
- Quick-fix auto-apply buttons (future enhancement)
- Error documentation pages (future — registry enables this later)
- Renumbering existing K-codes (not worth the churn)
- Monaco language server protocol integration
