const fs = require('fs');
const path = 'src/pages/StrategyStudio.tsx';
let content = fs.readFileSync(path, 'utf8');

// Use word boundary to avoid accidental partial matches
content = content.replace(/\bkuriContent\b/g, 'scriptContent');
content = content.replace(/\bsetKuriContent\b/g, 'setScriptContent');
content = content.replace(/\bkuriScript\b/g, 'scriptSource');
content = content.replace(/'strategyStudio_kuriContent'/g, "'strategyStudio_scriptContent'");
content = content.replace(/kuri-diagnostics/g, 'script-diagnostics');
content = content.replace(/kuri-type-check/g, 'script-type-check');
content = content.replace(/kuri-dark/g, 'script-dark');

fs.writeFileSync(path, content);
console.log('Successfully updated StrategyStudio.tsx');
