# Kuri v2 Language Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Kuri Script from a Pine Script look-alike into its own distinct language with YAML header blocks, `param.*` inputs, `kuri.*` TA functions, `draw.*` rendering, and `kuri.smartalert()` AI alerts — while maintaining backward compatibility during migration.

**Architecture:** Phase 1 adds new syntax support to the engine (parser + interpreter) alongside the old syntax, so both work simultaneously. Phase 2 rewrites all 22 built-in .kuri indicators to the new syntax. Phase 3 updates the Monaco editor for syntax highlighting and autocomplete. Phase 4 adds `kuri.smartalert()`. Phase 5 removes old Pine-style syntax support.

**Tech Stack:** Vanilla JavaScript (engine), TypeScript (bridge + UI), Monaco Editor (syntax), React (settings panel)

---

## Kuri v2 Language Spec

### Old Syntax (Pine-style) → New Syntax (Kuri v2)

```
OLD:                                    NEW:
//@version=1                            ---
indicator("RSI", overlay=false)         kuri: 1.0
                                        type: indicator
                                        name: RSI
                                        short: RSI
                                        pane: separate
                                        ---

input.int(14, title="Length")           param.int(14, title="Length")
input.source(close, title="Src")        param.source(close, title="Src")
input.float(2.0, title="StdDev")        param.float(2.0, title="StdDev")
input.color(#ff0000, title="Color")     param.color(#ff0000, title="Color")
input.bool(true, title="Show")          param.bool(true, title="Show")
input.string("SMA", options=[...])      param.string("SMA", options=[...])

ta.sma(close, 14)                      kuri.sma(close, 14)
ta.ema(close, 14)                      kuri.ema(close, 14)
ta.rsi(close, 14)                      kuri.rsi(close, 14)
ta.macd(close, 12, 26, 9)              kuri.macd(close, 12, 26, 9)
ta.bb(close, 20, 2)                    kuri.bb(close, 20, 2)
ta.crossover(a, b)                     kuri.crossover(a, b)

plot(val, title="V", color=#ff)         draw.line(val, title="V", color=#ff)
plot(val, style=plot.style_columns)     draw.bar(val, style=columns)
plotshape(cond, style=shape.triangleup) draw.shape(cond, style=triangleup)
plotarrow(val)                          draw.arrow(val)
hline(70, color=#ff)                    draw.level(70, color=#ff)
fill(p1, p2, color=#ff)                draw.fill(p1, p2, color=#ff)
bgcolor(color)                          draw.bgcolor(color)

alertcondition(cond, "Title", "Msg")    kuri.alert(cond, "Title", "Msg")
                                        kuri.smartalert(cond, "Title")  ← NEW

strategy.entry("L", strategy.long)      strategy.entry("L", strategy.long)  ← unchanged
strategy.close("L")                     strategy.close("L")  ← unchanged
```

### YAML Header Format
```yaml
---
kuri: 1.0
type: indicator | strategy
name: "Full Name"
short: "Abbrev"
pane: overlay | separate
initial_capital: 10000        # strategy only
---
```

---

## Phase 1: Engine — Add New Syntax Support (Backward Compatible)

### Task 1: Add YAML header parsing to the Lexer

**Files:**
- Modify: `src/lib/kuri/kuri-engine-full.js` (Lexer section, lines ~10-530)

The lexer needs to detect `---` at the start of a script and extract the YAML header block as a special token, passing the parsed metadata to the parser.

- [ ] **Step 1: Add YAML header detection to Lexer.tokenize()**

At the very start of `tokenize()`, before the main loop, check if the source starts with `---`. If so, extract everything between `---` and the next `---`, parse key-value pairs, and emit an `INDICATOR_META` token with the metadata.

In `kuri-engine-full.js`, find the `tokenize()` method and add at the beginning:

```javascript
// At start of tokenize(), before the main while loop:
// YAML Header Detection
if (this.source.trimStart().startsWith('---')) {
    const trimmed = this.source.trimStart();
    const headerEnd = trimmed.indexOf('---', 3);
    if (headerEnd > 0) {
        const headerStr = trimmed.slice(3, headerEnd).trim();
        const meta = {};
        for (const line of headerStr.split('\n')) {
            const colon = line.indexOf(':');
            if (colon > 0) {
                const key = line.slice(0, colon).trim();
                let val = line.slice(colon + 1).trim();
                // Strip quotes
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
                    val = val.slice(1, -1);
                // Parse booleans and numbers
                if (val === 'true') val = true;
                else if (val === 'false') val = false;
                else if (!isNaN(Number(val)) && val !== '') val = Number(val);
                meta[key] = val;
            }
        }
        // Skip past the header in the source
        const skipLen = this.source.indexOf('---', this.source.indexOf('---') + 3) + 3;
        this.pos = skipLen;
        this.line = this.source.slice(0, skipLen).split('\n').length;
        this.col = 1;
        // Emit synthetic indicator token
        this._yamlMeta = meta;
    }
}
```

- [ ] **Step 2: Convert YAML meta to IndicatorDeclaration in Parser**

In the Parser's `parse()` method, after parsing the body, check if the lexer has `_yamlMeta`. If so, prepend a synthetic IndicatorDeclaration node:

```javascript
// In Parser.parse(), after building the body array:
if (this.lexer._yamlMeta) {
    const m = this.lexer._yamlMeta;
    const kind = m.type === 'strategy' ? 'strategy' : 'indicator';
    const args = [];
    if (m.name) args.push({ type: N.NamedArgument, name: 'title', value: { type: N.StringLiteral, value: m.name } });
    if (m.short) args.push({ type: N.NamedArgument, name: 'shorttitle', value: { type: N.StringLiteral, value: m.short } });
    const isOverlay = m.pane === 'overlay' || m.pane === true;
    args.push({ type: N.NamedArgument, name: 'overlay', value: { type: N.BooleanLiteral, value: isOverlay } });
    if (m.initial_capital) args.push({ type: N.NamedArgument, name: 'initial_capital', value: { type: N.NumberLiteral, value: m.initial_capital } });
    body.unshift({ type: N.IndicatorDeclaration, kind, arguments: args, line: 0 });
}
```

- [ ] **Step 3: Test YAML header parsing**

```bash
cat > test_yaml.cjs << 'EOF'
require('./src/lib/kuri/kuri-engine-full.js');
const K = globalThis.Kuri;
const engine = new K.KuriEngine();
const close = Array.from({length:50},(_, i)=>100+i);
const ohlcv = { open: close, high: close, low: close, close, volume: Array(50).fill(1000), time: Array.from({length:50},(_, i)=>i*60) };

// Test YAML header
const script = `---
kuri: 1.0
type: indicator
name: Test SMA
short: SMA
pane: overlay
---

v = ta.sma(close, 5)
plot(v, title="SMA")`;

const r = engine.run(script, ohlcv);
console.log('success:', r.success);
console.log('title:', r.indicator?.title);
console.log('overlay:', r.indicator?.overlay);
console.log('plots:', r.plots[0]?.data.filter(v=>!isNaN(v)).length > 0 ? 'PASS' : 'FAIL');
EOF
node test_yaml.cjs && rm test_yaml.cjs
```

Expected: success=true, title="Test SMA", overlay=true, plots=PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/kuri/kuri-engine-full.js
git commit -m "feat(kuri-v2): add YAML header block parsing

Scripts can now use --- YAML header --- instead of indicator()/strategy().
Old syntax still works — both are supported during migration."
```

---

### Task 2: Add `param.*` as alias for `input.*`

**Files:**
- Modify: `src/lib/kuri/kuri-engine-full.js` (keyword list + function registries + handleInputCall)

- [ ] **Step 1: Add `param` to keywords**

Find the `KEYWORDS` set (around line 71) and add `'param'`:

```javascript
// In KEYWORDS set, add:
'param',
```

- [ ] **Step 2: Register param.* functions as aliases**

Find the `utilityFunctions` registry (around line 2524) and add param aliases:

```javascript
'param': (a) => a[0],
'param.int': (a) => a[0],
'param.float': (a) => a[0],
'param.bool': (a) => a[0],
'param.string': (a) => a[0],
'param.color': (a) => a[0],
'param.timeframe': (a) => a[0],
'param.source': (a) => a[0],
'param.session': (a) => a[0],
'param.symbol': (a) => a[0],
'param.text_area': (a) => a[0],
```

- [ ] **Step 3: Handle param.* in handleInputCall and evalMethodCall**

In `evalMethodCall()` (around line 3677), add:
```javascript
if (objName === 'param') {
    return this.handleInputCall('input.' + method, args, env, bar);
}
```

In `evalCall()` (around line 3620), add:
```javascript
if (fn === 'param' || fn.startsWith('param.')) {
    return this.handleInputCall(fn.replace('param', 'input'), args, env, bar);
}
```

In the parser's `parseStatement()` (around line 714), add a case for `'param'` that works like `'input'`:
```javascript
case 'param': {
    // Same as 'input' handling
    this.advance();
    this.expect(T.LPAREN);
    const a = this.parseArgList();
    this.expect(T.RPAREN);
    return { type: N.InputDeclaration, arguments: a, line: t.line };
}
```

- [ ] **Step 4: Handle param.* in precomputeTA source resolution**

Find the `input.source` resolution in `precomputeTA()` (around line 3100) and add `param.source`:
```javascript
if (fn === 'input.source' || fn === 'input' || fn === 'param.source' || fn === 'param') {
```

- [ ] **Step 5: Test param.* inputs**

```bash
cat > test_param.cjs << 'EOF'
require('./src/lib/kuri/kuri-engine-full.js');
const K = globalThis.Kuri;
const engine = new K.KuriEngine();
const close = Array.from({length:50},(_, i)=>100+i);
const ohlcv = { open: close, high: close, low: close, close, volume: Array(50).fill(1000), time: Array.from({length:50},(_, i)=>i*60) };

const script = `---
kuri: 1.0
type: indicator
name: Test Params
pane: overlay
---

src = param.source(close, title="Source")
len = param.int(14, title="Length", min=1)
v = ta.sma(src, len)
plot(v, title="SMA")`;

const r = engine.run(script, ohlcv);
console.log('success:', r.success);
console.log('inputDefs:', r.inputDefs.map(d => d.title + '(' + d.type + ')'));
console.log('plots:', r.plots[0]?.data.filter(v=>!isNaN(v)).length > 0 ? 'PASS' : 'FAIL');

// Test with override
const r2 = engine.run(script, ohlcv, { length: 5 });
console.log('override:', r2.plots[0]?.data.filter(v=>!isNaN(v)).length > 0 ? 'PASS' : 'FAIL');
EOF
node test_param.cjs && rm test_param.cjs
```

Expected: inputDefs show Source(source) and Length(int), plots PASS, override PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/kuri/kuri-engine-full.js
git commit -m "feat(kuri-v2): add param.* as alias for input.*

param.int(), param.source(), param.float() etc. now work alongside
input.int(), input.source(). Both syntaxes supported during migration."
```

---

### Task 3: Add `kuri.*` as alias for `ta.*`

**Files:**
- Modify: `src/lib/kuri/kuri-engine-full.js` (evalMethodCall + callTA + precomputeTA)

- [ ] **Step 1: Route kuri.* method calls to TA functions**

In `evalMethodCall()` (around line 3682), the `ta.*` dispatch looks like:
```javascript
if (objName === 'ta' && taFunctions[fullFn]) {
    return this.callTA(fullFn, args, node, env, bar);
}
if (objName === 'ta' && allFunctions[fullFn]) {
    // allFunctions path...
}
```

Add kuri.* routing right after the ta.* blocks:
```javascript
// kuri.* → ta.* alias (Kuri v2 syntax)
if (objName === 'kuri') {
    const taFn = 'ta.' + method;
    if (taFunctions[taFn]) {
        return this.callTA(taFn, args, node, env, bar);
    }
    if (allFunctions[taFn]) {
        // Same allFunctions dispatch as ta.* but with kuri.* key
        const cacheKey = `__ta_${taFn}_L${node.line || 0}`;
        if (!this._taCache[cacheKey]) {
            // ... (copy the allFunctions resolution logic, replacing fullFn with taFn)
        }
        return this._taCache[cacheKey]?.[bar] ?? NaN;
    }
    // kuri.alert() and kuri.smartalert() — handled separately
    if (method === 'alert') {
        return this.execAlert({ type: N.AlertStatement, kind: 'alertcondition', arguments: node.arguments, line: node.line }, env, bar);
    }
    if (method === 'smartalert') {
        return this.execSmartAlert(node, args, env, bar);
    }
}
```

- [ ] **Step 2: Handle kuri.* in precomputeTA resolveSeries**

In `precomputeTA()`'s `resolveSeries()` (around line 2902), find the `ta.*` check:
```javascript
if (fn.startsWith('ta.') && (taFunctions[fn] || allFunctions[fn])) {
```
Add kuri.* support:
```javascript
let resolvedFn = fn;
if (fn.startsWith('kuri.')) resolvedFn = 'ta.' + fn.slice(5);
if (resolvedFn.startsWith('ta.') && (taFunctions[resolvedFn] || allFunctions[resolvedFn])) {
    // ... use resolvedFn instead of fn
}
```

- [ ] **Step 3: Test kuri.* TA functions**

```bash
cat > test_kuri_ns.cjs << 'EOF'
require('./src/lib/kuri/kuri-engine-full.js');
const K = globalThis.Kuri;
const engine = new K.KuriEngine();
const close = Array.from({length:50},(_, i)=>100+Math.sin(i/5)*10);
const ohlcv = { open: close, high: close.map(v=>v+2), low: close.map(v=>v-2), close, volume: Array(50).fill(1000), time: Array.from({length:50},(_, i)=>i*60) };

const tests = [
    ['kuri.sma', '---\nkuri: 1.0\ntype: indicator\nname: T\npane: overlay\n---\nv = kuri.sma(close, 5)\nplot(v, title="V")'],
    ['kuri.ema', '---\nkuri: 1.0\ntype: indicator\nname: T\npane: overlay\n---\nv = kuri.ema(close, 14)\nplot(v, title="V")'],
    ['kuri.rsi', '---\nkuri: 1.0\ntype: indicator\nname: T\npane: separate\n---\nv = kuri.rsi(close, 14)\nplot(v, title="V")'],
    ['kuri.hma', '---\nkuri: 1.0\ntype: indicator\nname: T\npane: overlay\n---\nv = kuri.hma(close, 9)\nplot(v, title="V")'],
    ['kuri.bb', '---\nkuri: 1.0\ntype: indicator\nname: T\npane: overlay\n---\n[m,u,l] = kuri.bb(close, 20, 2)\nplot(m, title="M")\nplot(u, title="U")\nplot(l, title="L")'],
];

let pass = 0, fail = 0;
for (const [name, script] of tests) {
    const r = engine.run(script, ohlcv);
    const ok = r.success && r.plots[0]?.data.filter(v=>!isNaN(v)).length > 0;
    console.log(ok ? 'PASS' : 'FAIL', name, r.errors.length > 0 ? r.errors[0].message : '');
    ok ? pass++ : fail++;
}
console.log(`${pass}/${pass+fail} passed`);
EOF
node test_kuri_ns.cjs && rm test_kuri_ns.cjs
```

Expected: 5/5 passed

- [ ] **Step 4: Commit**

```bash
git add src/lib/kuri/kuri-engine-full.js
git commit -m "feat(kuri-v2): add kuri.* as alias for ta.*

kuri.sma(), kuri.ema(), kuri.rsi() etc. now work alongside ta.*.
Also routes kuri.alert() to alertcondition and stubs kuri.smartalert()."
```

---

### Task 4: Add `draw.*` as alias for plot/hline/fill/bgcolor

**Files:**
- Modify: `src/lib/kuri/kuri-engine-full.js` (keywords + parser + execNode)

- [ ] **Step 1: Add `draw` to keywords**

In the KEYWORDS set, add `'draw'`.

- [ ] **Step 2: Add draw.* parsing in the Parser**

In `parseStatement()`, add a case for `'draw'`:
```javascript
case 'draw': {
    const drawToken = this.advance(); // consume 'draw'
    this.expect(T.DOT);
    const method = this.advance(); // line, bar, level, fill, bgcolor, shape, arrow
    this.expect(T.LPAREN);
    const a = this.parseArgList();
    this.expect(T.RPAREN);
    
    // Map draw.* to existing AST node types
    const methodName = method.value;
    if (methodName === 'line') {
        return { type: N.PlotStatement, kind: 'plot', arguments: a, line: drawToken.line };
    } else if (methodName === 'bar') {
        // Inject style=columns as named argument
        a.push({ type: N.NamedArgument, name: 'style', value: { type: N.StringLiteral, value: 'columns' }, line: drawToken.line });
        return { type: N.PlotStatement, kind: 'plot', arguments: a, line: drawToken.line };
    } else if (methodName === 'shape') {
        return { type: N.PlotStatement, kind: 'plotshape', arguments: a, line: drawToken.line };
    } else if (methodName === 'arrow') {
        return { type: N.PlotStatement, kind: 'plotarrow', arguments: a, line: drawToken.line };
    } else if (methodName === 'level') {
        return { type: N.HlineStatement, arguments: a, line: drawToken.line };
    } else if (methodName === 'fill') {
        return { type: N.FillStatement, arguments: a, line: drawToken.line };
    } else if (methodName === 'bgcolor') {
        return { type: N.BgColorStatement, arguments: a, line: drawToken.line };
    }
    throw new Error(`Parse Error L${drawToken.line}: Unknown draw method: draw.${methodName}`);
}
```

- [ ] **Step 3: Test draw.* rendering**

```bash
cat > test_draw.cjs << 'EOF'
require('./src/lib/kuri/kuri-engine-full.js');
const K = globalThis.Kuri;
const engine = new K.KuriEngine();
const close = Array.from({length:50},(_, i)=>100+Math.sin(i/5)*10);
const ohlcv = { open: close, high: close.map(v=>v+2), low: close.map(v=>v-2), close, volume: Array(50).fill(1000), time: Array.from({length:50},(_, i)=>i*60) };

const script = `---
kuri: 1.0
type: indicator
name: Draw Test
pane: separate
---

fast = kuri.ema(close, 12)
slow = kuri.ema(close, 26)
macd = fast - slow
signal = kuri.ema(macd, 9)
hist = macd - signal

draw.level(0, title="Zero", color=#787B86)
draw.bar(hist, title="Histogram")
draw.line(macd, title="MACD", color=#2962FF)
draw.line(signal, title="Signal", color=#ff6d00)`;

const r = engine.run(script, ohlcv);
console.log('success:', r.success);
console.log('plots:', r.plots.length);
console.log('hlines:', r.hlines.length);
r.plots.forEach((p, i) => console.log(`  plot ${i}: "${p.title}" style=${p.style} data=${p.data.filter(v=>!isNaN(v)).length}`));
console.log('errors:', r.errors.map(e => e.message));
EOF
node test_draw.cjs && rm test_draw.cjs
```

Expected: 3 plots (Histogram with style=columns, MACD, Signal), 1 hline

- [ ] **Step 4: Commit**

```bash
git add src/lib/kuri/kuri-engine-full.js
git commit -m "feat(kuri-v2): add draw.* as alias for plot/hline/fill/bgcolor

draw.line() → plot(), draw.bar() → plot(style=columns),
draw.level() → hline(), draw.fill() → fill(),
draw.shape() → plotshape(), draw.arrow() → plotarrow(),
draw.bgcolor() → bgcolor(). Old syntax still works."
```

---

### Task 5: Add kuri.smartalert() stub

**Files:**
- Modify: `src/lib/kuri/kuri-engine-full.js`

- [ ] **Step 1: Add smartalert to the engine**

In the `kuri.*` dispatch (added in Task 3), the `kuri.smartalert()` case already exists. Implement the stub:

```javascript
// Add to KuriInterpreter class:
execSmartAlert(node, args, env, bar) {
    // SmartAlert stores the condition + metadata for AI processing
    // For now, behaves like a regular alert but with a 'smart' flag
    const condition = args.positional[0];
    const title = args.named?.title || args.positional[1] || 'Smart Alert';
    const message = args.named?.message || args.positional[2] || '';
    
    if (bar === this.barCount - 1) {
        // Only register on last bar
        if (!this.alerts) this.alerts = [];
        const existingAlert = this.alerts.find(a => a.title === title && a.smart);
        if (!existingAlert) {
            this.alerts.push({
                title,
                message,
                condition: new Array(this.barCount).fill(false),
                smart: true, // Distinguishes from regular alerts
            });
        }
        const alert = this.alerts.find(a => a.title === title && a.smart);
        if (alert && condition) {
            alert.condition[bar] = true;
        }
    } else if (bar < this.barCount - 1) {
        const alert = this.alerts?.find(a => a.title === title && a.smart);
        if (alert && condition) {
            alert.condition[bar] = true;
        }
    }
}
```

- [ ] **Step 2: Test kuri.smartalert()**

```bash
cat > test_smartalert.cjs << 'EOF'
require('./src/lib/kuri/kuri-engine-full.js');
const K = globalThis.Kuri;
const engine = new K.KuriEngine();
const close = Array.from({length:50},(_, i)=>100+Math.sin(i/5)*10);
const ohlcv = { open: close, high: close.map(v=>v+2), low: close.map(v=>v-2), close, volume: Array(50).fill(1000), time: Array.from({length:50},(_, i)=>i*60) };

const script = `---
kuri: 1.0
type: indicator
name: Smart Alert Test
pane: separate
---

val = kuri.rsi(close, 14)
kuri.alert(val > 70, "Overbought")
kuri.smartalert(val < 30, "AI Oversold Detection")
draw.line(val, title="RSI")
draw.level(70, color=#ff0000)
draw.level(30, color=#00ff00)`;

const r = engine.run(script, ohlcv);
console.log('success:', r.success);
console.log('alerts:', r.alerts?.length);
r.alerts?.forEach(a => console.log(`  ${a.smart ? 'SMART' : 'BASIC'}: "${a.title}" triggers=${a.condition.filter(Boolean).length}`));
EOF
node test_smartalert.cjs && rm test_smartalert.cjs
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/kuri/kuri-engine-full.js
git commit -m "feat(kuri-v2): add kuri.smartalert() for AI-powered alerts

kuri.smartalert(condition, title) creates alerts flagged as 'smart'
for future AI pattern detection processing. Currently behaves like
kuri.alert() but with a smart:true flag in the output."
```

---

## Phase 2: Rewrite All 22 Indicators to Kuri v2 Syntax

### Task 6: Rewrite all .kuri indicator files

**Files:**
- Modify: All 22 files in `src/indicators/*.kuri`

Each indicator gets the same transformation:
1. Replace `//@version=1` + `indicator(...)` with YAML header
2. Replace `input.*` with `param.*`
3. Replace `ta.*` with `kuri.*`
4. Replace `plot()`/`hline()`/`fill()`/`bgcolor()` with `draw.*`
5. Replace `alertcondition()` with `kuri.alert()`

- [ ] **Step 1: Rewrite all 22 indicators**

Apply the syntax transformation to every file. Example for SMA:

**src/indicators/sma.kuri** (before):
```
//@version=1
indicator(title="Simple Moving Average", shorttitle="SMA", overlay=true)

length = input.int(9, title="Length", minval=2)
src = input.source(close, title="Source")
smaVal = ta.sma(src, length)
plot(smaVal, title="SMA", color=color.blue, linewidth=2)
```

**src/indicators/sma.kuri** (after):
```
---
kuri: 1.0
type: indicator
name: Simple Moving Average
short: SMA
pane: overlay
---

length = param.int(9, title="Length", min=2)
src = param.source(close, title="Source")
smaVal = kuri.sma(src, length)
draw.line(smaVal, title="SMA", color=#2962FF, linewidth=2)
```

Repeat for all 22 indicators: sma, ema, wma, hma, bb, macd, rsi, stochastic, supertrend, ichimoku, volume, atr, adx, cci, obv, vwap, vwma, mfi, donchian, keltner, adr, ma-ribbon.

- [ ] **Step 2: Run full indicator test suite**

```bash
cat > test_all_v2.cjs << 'EOF'
const fs = require('fs');
require('./src/lib/kuri/kuri-engine-full.js');
const K = globalThis.Kuri;
const engine = new K.KuriEngine();
const close = Array.from({length:250},(_, i)=>100+Math.sin(i/15)*30);
const ohlcv = { open: close.map(v=>v-1), high: close.map(v=>v+3), low: close.map(v=>v-3), close, volume: Array(250).fill(5000), time: Array.from({length:250},(_, i)=>i*60) };

const kuriFiles = fs.readdirSync('./src/indicators').filter(f => f.endsWith('.kuri'));
let pass = 0, fail = 0;
for (const file of kuriFiles) {
    const script = fs.readFileSync(`./src/indicators/${file}`, 'utf-8');
    const name = file.replace('.kuri', '');
    try {
        const r = engine.run(script, ohlcv);
        const hasData = r.plots.some(p => p.data.some(v => !isNaN(v)));
        const ok = r.success && hasData;
        console.log(ok ? 'PASS' : 'FAIL', name, r.errors.length > 0 ? r.errors[0].message : '');
        ok ? pass++ : fail++;
    } catch(e) { console.log('FAIL', name, e.message); fail++; }
}
console.log(`\n${pass}/${pass+fail} passed`);
EOF
node test_all_v2.cjs && rm test_all_v2.cjs
```

Expected: 22/22 passed

- [ ] **Step 3: Commit**

```bash
git add src/indicators/
git commit -m "feat(kuri-v2): rewrite all 22 indicators to Kuri v2 syntax

Migrated from Pine-style to Kuri v2:
- YAML header blocks instead of indicator()/strategy()
- param.* instead of input.*
- kuri.* instead of ta.*
- draw.* instead of plot()/hline()/fill()/bgcolor()
- kuri.alert() instead of alertcondition()"
```

---

## Phase 3: Update Monaco Editor

### Task 7: Update Monaco syntax highlighting and autocomplete

**Files:**
- Modify: `src/lib/kuri/kuri-monaco.ts`

- [ ] **Step 1: Update keyword tokenization**

In `registerKuriLanguage()`, find the monarch tokenizer `keywords` array and add:
```javascript
keywords: [
    // ... existing keywords ...
    'param', 'draw', 'kuri',
],
```

Add a new tokenizer rule for the YAML header block:
```javascript
// At the start of the root tokenizer rules:
[/^---$/, { token: 'meta.header', next: '@yamlHeader' }],

// New state for YAML header:
yamlHeader: [
    [/^---$/, { token: 'meta.header', next: '@popall' }],
    [/^\w+:/, 'meta.key'],
    [/.*$/, 'meta.value'],
],
```

- [ ] **Step 2: Update autocomplete completions**

In the completion provider, add entries for:
- `param.int`, `param.float`, `param.bool`, `param.source`, `param.color`, `param.string`, `param.timeframe`
- `kuri.sma`, `kuri.ema`, `kuri.rsi`, `kuri.hma`, `kuri.bb`, `kuri.macd`, `kuri.atr`, `kuri.alert`, `kuri.smartalert`, etc.
- `draw.line`, `draw.bar`, `draw.level`, `draw.fill`, `draw.bgcolor`, `draw.shape`, `draw.arrow`
- YAML header snippet: `---\nkuri: 1.0\ntype: indicator\nname: \npane: overlay\n---`

- [ ] **Step 3: Update hover documentation**

Update the hover provider to show docs for `param.*`, `kuri.*`, and `draw.*` functions alongside the existing `input.*`, `ta.*`, and `plot()` docs.

- [ ] **Step 4: Test frontend build**

```bash
npx vite build
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/kuri/kuri-monaco.ts
git commit -m "feat(kuri-v2): update Monaco editor for Kuri v2 syntax

Syntax highlighting for YAML headers, param.*, kuri.*, draw.*.
Autocomplete and hover docs for all Kuri v2 functions."
```

---

## Phase 4: Update Bridge and Settings Panel

### Task 8: Update KuriBridge for param.* inputDef type names

**Files:**
- Modify: `src/lib/kuri/kuri-bridge.ts`
- Modify: `src/components/market-chart/IndicatorSettingsPanel.tsx`

The engine's `handleInputCall` already converts `param.*` to `input.*` internally, so `inputDefs` will have the same types. No bridge changes needed for data flow.

- [ ] **Step 1: Update AI chat service language description**

Modify `src/services/aiChatService.ts` to describe Kuri v2 syntax instead of referencing "similar to Pine Script":

```typescript
// Replace the system prompt section that mentions Pine Script:
"The Strategy Studio uses Kuri Script, the Insight platform's own scripting language for trading strategies and indicators.

Kuri scripts use a YAML header block for metadata, param.* for inputs, kuri.* for technical analysis, and draw.* for rendering:

\`\`\`
---
kuri: 1.0
type: strategy
name: My Strategy
pane: overlay
---

len = param.int(14, title=\"Length\")
rsi_val = kuri.rsi(close, len)
draw.line(rsi_val, title=\"RSI\")
kuri.smartalert(rsi_val > 70, \"Overbought\")
\`\`\`"
```

- [ ] **Step 2: Update engine header comment**

In `kuri-engine-full.js`, change the header from "Pine Script v6 Compatible" to:
```javascript
/**
 * KURI SCRIPT ENGINE v2.0 — Insight Trading Platform
 * Full-featured scripting language for indicators and strategies
 */
```

- [ ] **Step 3: Frontend build**

```bash
npx vite build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/kuri/kuri-bridge.ts src/services/aiChatService.ts src/lib/kuri/kuri-engine-full.js
git commit -m "feat(kuri-v2): update branding and AI docs for Kuri v2

Removed all 'Pine Script' references. AI assistant now describes
Kuri v2 syntax. Engine header updated to 'Insight Trading Platform'."
```

---

## Phase 5: Final Verification

### Task 9: Full system verification

- [ ] **Step 1: Run all 22 indicators**

```bash
# Same test as Task 6 Step 2
```

- [ ] **Step 2: Frontend build**

```bash
npx vite build
```

- [ ] **Step 3: Backend build**

```bash
cd backend/server && npm run build
```

- [ ] **Step 4: Verify old syntax still works (backward compat)**

```bash
cat > test_compat.cjs << 'EOF'
require('./src/lib/kuri/kuri-engine-full.js');
const K = globalThis.Kuri;
const engine = new K.KuriEngine();
const close = Array.from({length:50},(_, i)=>100+i);
const ohlcv = { open: close, high: close, low: close, close, volume: Array(50).fill(1000), time: Array.from({length:50},(_, i)=>i*60) };

// Old Pine-style syntax should still work
const oldScript = `//@version=1
indicator("Old SMA", shorttitle="SMA", overlay=true)
length = input.int(9, title="Length", minval=2)
v = ta.sma(close, length)
plot(v, title="SMA")
hline(100, color=#787B86)
alertcondition(v > 105, "Cross Up", "SMA crossed above 105")`;

const r = engine.run(oldScript, ohlcv);
console.log('Old syntax:', r.success && r.plots[0]?.data.filter(v=>!isNaN(v)).length > 0 ? 'PASS' : 'FAIL');

// New Kuri v2 syntax
const newScript = `---
kuri: 1.0
type: indicator
name: New SMA
short: SMA
pane: overlay
---

length = param.int(9, title="Length", min=2)
v = kuri.sma(close, length)
draw.line(v, title="SMA")
draw.level(100, color=#787B86)
kuri.alert(v > 105, "Cross Up", "SMA crossed above 105")`;

const r2 = engine.run(newScript, ohlcv);
console.log('New syntax:', r2.success && r2.plots[0]?.data.filter(v=>!isNaN(v)).length > 0 ? 'PASS' : 'FAIL');
EOF
node test_compat.cjs && rm test_compat.cjs
```

Expected: Both PASS

- [ ] **Step 5: Final commit**

```bash
git commit --allow-empty -m "chore: Kuri v2 language redesign complete

Kuri Script is now its own distinct language:
- YAML header blocks (---kuri: 1.0---) instead of indicator()/strategy()
- param.* instead of input.* for user parameters
- kuri.* instead of ta.* for technical analysis functions
- draw.* instead of plot()/hline()/fill() for chart rendering
- kuri.alert() instead of alertcondition()
- kuri.smartalert() for AI-powered alerts (new, exclusive to Kuri)
- Old Pine-style syntax remains supported for backward compatibility"
```
