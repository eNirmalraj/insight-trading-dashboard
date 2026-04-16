import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as vm from 'vm';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const engineCode = fs.readFileSync(
    path.resolve(DIR, '../../lib/kuri/kuri-engine-full.js'),
    'utf-8'
);
const wrappedCode = `(function(module, exports) {\n${engineCode}\nreturn module.exports;\n})`;
const factory = vm.runInThisContext(wrappedCode, { filename: 'kuri-engine-full.js' });
const fakeModule: any = { exports: {} };
const moduleExports = factory(fakeModule, fakeModule.exports);
const Kuri = moduleExports || fakeModule.exports;
const KuriEngine = Kuri.KuriEngine || Kuri.default?.KuriEngine;
const ohlcv = {
    open: [100, 101],
    high: [110, 111],
    low: [90, 91],
    close: [105, 106],
    volume: [1000, 1000],
    time: [1700000000000, 1700086400000],
};

let pass = 0,
    fail = 0;
function assert(ok: boolean, msg: string) {
    if (ok) {
        console.log(`  ✅ ${msg}`);
        pass++;
    } else {
        console.error(`  ❌ ${msg}`);
        fail++;
    }
}

console.log('\n=== Named Args for line.new ===');
const r1 = new KuriEngine().run(
    `---\nversion: kuri 1.0\ntype: indicator\nname: T\npane: overlay\n---\nif barstate.isfirst\n    line.new(x1=time, y1=12345, x2=time+86400000, y2=67890, xloc=xloc.bar_time, color=color.red, width=2)\n`,
    ohlcv
);
const ln = r1.drawings?.lines?.[0];
assert(ln?.x1 === 1700000000000, `x1=${ln?.x1}`);
assert(ln?.y1 === 12345, `y1=${ln?.y1}`);
assert(ln?.y2 === 67890, `y2=${ln?.y2}`);

console.log('\n=== Named Args for label.new ===');
const r2 = new KuriEngine().run(
    `---\nversion: kuri 1.0\ntype: indicator\nname: T\npane: overlay\n---\nif barstate.isfirst\n    label.new(x=time, y=55555, text="Hello Named", xloc=xloc.bar_time, textcolor=color.white, color=color.blue, size=size.normal)\n`,
    ohlcv
);
const lb = r2.drawings?.labels?.[0];
assert(lb?.x === 1700000000000, `x=${lb?.x}`);
assert(lb?.y === 55555, `y=${lb?.y}`);
assert(lb?.text === 'Hello Named', `text="${lb?.text}"`);

console.log('\n=== plot() as alias for mark() ===');
const r3 = new KuriEngine().run(
    `---\nversion: kuri 1.0\ntype: indicator\nname: T\npane: overlay\n---\nplot(close, title="Test Plot", color=color.green)\n`,
    ohlcv
);
assert(r3.success === true, `plot() success=${r3.success}`);
assert(r3.plots?.length >= 1, `plots count=${r3.plots?.length}`);
assert(r3.plots?.[0]?.title === 'Test Plot', `title="${r3.plots?.[0]?.title}"`);

console.log('\n=== plotshape() as alias for mark.shape() ===');
const r4 = new KuriEngine().run(
    `---\nversion: kuri 1.0\ntype: indicator\nname: T\npane: overlay\n---\nplotshape(close > open, title="Bull", style=shape.triangleup, location=location.belowbar, size=size.tiny, text="B", color=color.green)\n`,
    ohlcv
);
assert(r4.success === true, `plotshape() success=${r4.success}`);
assert(r4.plots?.[0]?.kind === 'plotshape', `kind="${r4.plots?.[0]?.kind}"`);

console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===\n`);
if (fail > 0) process.exit(1);
