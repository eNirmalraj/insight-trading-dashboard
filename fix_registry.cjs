const fs = require('fs');
const path = 'src/core/registry/IndicatorRegistry.ts';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove Kuri names Indexing
content = content.replace(
    /if \(indicator\.names\.kuri\) \{[\s\S]*?this\.nameIndex\.set\(indicator\.names\.kuri, id\);[\s\S]*?\}/g,
    ''
);

// 2. Rename toKuriFormat to toScriptFormat
content = content.replace(/toKuriFormat/g, 'toScriptFormat');
content = content.replace(/Kuri-compatible/g, 'Script-compatible');

fs.writeFileSync(path, content);
console.log('Successfully updated IndicatorRegistry.ts');
