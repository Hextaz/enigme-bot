const fs = require('fs');

const raw = `Case 1 | Case départ | 163-843
Case 2 | Case bleue | 248-816
Case 3 | Case chance | 334-831
Case 4 | Case départ | 418-846
Case 5 | Case rouge | 499-824
Case 6 | Case chance | 585-813
Case 7 | Case coup du sort | 756-813
Case 8 | Case bleue | 840-792
Case 9 | Case rouge | 923-801
Case 10 | Case bleue | 1010-801
Case 11 | Case malchance | 1094-816
Case 12 | Case bleue | 1158-753
Case 13 | Case bleue | 1232-707
Case 14 | Case rouge | 1311-675
Case 15 | Case bleue | 1345-595
Case 16 | Case bowser | 1372-513
Case 17 | Case verte | 1417-429
Case 18 | Case bleue | 1401-339
Case 19 | Case rouge | 1365-257
Case 20 | Case rouge  | 1365-173
Case 21 | Case coup du sort | 1283-129
Case 22 | Case bleue | 1196-110
Case 23 | Case boutique | 1116-140
Case 24 | Case bleue | 1049-198
Case 25 | Case chance | 1059-282
Case 26 | Case malchance | 1000-351
Case 27 | Case rouge | 910-372
Case 28 | Case bleue | 840-312
Case 29 | Case chance | 756-288
Case 30 | Case rouge | 668-271
Case 31 | Case coup du sort | 578-282
Case 32 | Case bleue | 490-257
Case 33 | Case bleue | 406-282
Case 34 | Case rouge | 317-313
Case 35 | Case rouge | 236-339
Case 36 | Case bleue | 185-415
Case 37 | Case boutique | 147-493
Case 38 | Case malchance | 118-577
Case 39 | Case bleue | 101-668
Case 40 | Case bowser | 128-752
Case 41 | Case boutique | 673-707
Case 42 | Case rouge | 719-632
Case 43 | Case bleue | 795-585
Case 44 | Case bowser | 878-550
Case 45 | Case chance | 878-460
Case 46 | Case bleue | 1478-676
Case 47 | Case chance | 1478-766
Case 48 | Case chance | 1560-804
Case 49 | Case boutique | 1650-816
Case 50 | Case bleue | 1713-749
Case 51 | Case chance | 1706-659
Case 52 | Case boo | 1650-577
Case 53 | Case bleue | 1574-520
Case 54 | Case chance | 1500-470
Case 55 | Case chance | 523-403
Case 56 | Case boo | 563-483
Case 57 | Case bleue | 643-526
Case 58 | Case chance | 728-528`;

const lines = raw.split('\n');
const newMap = {};

lines.forEach(l => {
    const parts = l.split('|').map(s=>s.trim());
    if (parts.length === 3) {
        const idStr = parts[0].toLowerCase().replace('case', '').trim();
        const id = parseInt(idStr, 10);
        let typeStr = parts[1].toLowerCase().replace('case', '').trim();
        typeStr = typeStr.charAt(0).toUpperCase() + typeStr.slice(1);
        
        // Custom name adjustments to match existing types if needed
        if (typeStr === 'Départ') typeStr = 'Départ';
        if (typeStr === 'Coup du sort') typeStr = 'Coup du Sort';
        
        const coords = parts[2].split('-');
        const x = parseInt(coords[0], 10);
        const y = parseInt(coords[1], 10);
        
        newMap[id] = { type: typeStr, x, y };
    }
});

let code = fs.readFileSync('src/game/board.js', 'utf8');

// Match the existing board_cases array
// We need to preserve the `next` property! So we only replace type, name, x, and y
// We can use a regex to parse the object literals or just eval and rebuild

const regex = /\{ id: (\d+), x: \d+, y: \d+, type: '[^']+', name: '[^']+', next: \[([\d, ]+)\] \}/g;
const newCases = [];

let match;
while ((match = regex.exec(code)) !== null) {
    const id = parseInt(match[1], 10);
    const nextArr = match[2];
    
    const overrides = newMap[id];
    let type = overrides ? overrides.type : 'Inconnu';
    let x = overrides ? overrides.x : 0;
    let y = overrides ? overrides.y : 0;
    
    // We can map type -> type
    // If it's type 'Départ', we can name it 'Verte' or 'Départ'. The code previously used 'Verte' for some.
    // Let's use the explicit names
    newCases.push(`    { id: ${id}, x: ${x}, y: ${y}, type: '${type}', name: '${type}', next: [${nextArr}] }`);
}

const replacement = 'const BOARD_CASES = [\n' + newCases.join(',\n') + '\n];';

code = code.replace(/const BOARD_CASES = \[[\s\S]*?\];/, replacement);

fs.writeFileSync('src/game/board.js', code, 'utf8');
console.log('Fixed src/game/board.js');
