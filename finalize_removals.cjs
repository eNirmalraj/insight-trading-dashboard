const fs = require('fs');

function updateFile(path, renames) {
    if (!fs.existsSync(path)) return;
    let content = fs.readFileSync(path, 'utf8');
    for (const [from, to] of Object.entries(renames)) {
        const regex = new RegExp(from, 'g');
        content = content.replace(regex, to);
    }
    fs.writeFileSync(path, content);
    console.log(`Updated ${path}`);
}

// Update migrationUtils.ts
updateFile('src/core/migration/migrationUtils.ts', {
    validateKuriCompatibility: 'validateScriptCompatibility',
    getKuriFunctionNames: 'getFunctionNames',
    'indicator\\.names\\.kuri': 'indicator.id',
});

// Update verifyMigration.ts
updateFile('src/core/migration/verifyMigration.ts', {
    Kuri: 'Script',
    kuri: 'script',
});

console.log('Final cleanup of migration tools complete');
