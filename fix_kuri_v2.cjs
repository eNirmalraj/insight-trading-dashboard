const fs = require('fs');
const path = 'src/core/registry/indicators.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

Object.values(data.indicators).forEach((ind) => {
    // 1. Rename names.kuri to names.function
    if (ind.names.kuri) {
        ind.names.function = ind.names.kuri;
        delete ind.names.kuri;
    }

    // 2. Remove implementation.kuri
    if (ind.implementation && ind.implementation.kuri) {
        delete ind.implementation.kuri;
    }

    // 3. Rename kuriExample to example
    if (ind.kuriExample) {
        ind.example = ind.kuriExample;
        delete ind.kuriExample;
    }
});

fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log('Successfully updated indicators.json');
