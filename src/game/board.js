const BOARD_CASES = [
    { id: 1, x: 960, y: 200, type: 'Verte', name: 'DÉPART' },
    { id: 2, x: 1045, y: 200, type: 'Bleue', name: 'Bleue' },
    { id: 3, x: 1130, y: 200, type: 'Bleue', name: 'Bleue' },
    { id: 4, x: 1215, y: 200, type: 'Bleue', name: 'Bleue' },
    { id: 5, x: 1300, y: 200, type: 'Chance', name: 'Chance' },
    { id: 6, x: 1385, y: 205, type: 'Rouge', name: 'Rouge' },
    { id: 7, x: 1467, y: 222, type: 'Rouge', name: 'Rouge' },
    { id: 8, x: 1540, y: 265, type: 'Verte', name: 'Verte' },
    { id: 9, x: 1600, y: 325, type: 'Bleue', name: 'Bleue' },
    { id: 10, x: 1642, y: 398, type: 'Malchance', name: 'Malchance' },
    { id: 11, x: 1665, y: 479, type: 'Rouge', name: 'Rouge' },
    { id: 12, x: 1665, y: 561, type: 'Boo', name: 'Boo (Virage Droit)' },
    { id: 13, x: 1642, y: 642, type: 'Bleue', name: 'Bleue' },
    { id: 14, x: 1600, y: 715, type: 'Bleue', name: 'Bleue' },
    { id: 15, x: 1540, y: 775, type: 'Boutique', name: 'Boutique' },
    { id: 16, x: 1467, y: 818, type: 'Verte', name: 'Verte' },
    { id: 17, x: 1385, y: 835, type: 'Rouge', name: 'Rouge' },
    { id: 18, x: 1300, y: 840, type: 'Chance', name: 'Chance' },
    { id: 19, x: 1215, y: 840, type: 'Bleue', name: 'Bleue' },
    { id: 20, x: 1130, y: 840, type: 'Bleue', name: 'Bleue' },
    { id: 21, x: 1045, y: 840, type: 'Coup du Sort', name: 'Coup du Sort' },
    { id: 22, x: 960, y: 840, type: 'Bowser', name: 'BOWSER (Bas Centre)' },
    { id: 23, x: 875, y: 840, type: 'Rouge', name: 'Rouge' },
    { id: 24, x: 790, y: 840, type: 'Bleue', name: 'Bleue' },
    { id: 25, x: 705, y: 840, type: 'Bleue', name: 'Bleue' },
    { id: 26, x: 620, y: 840, type: 'Verte', name: 'Verte' },
    { id: 27, x: 535, y: 835, type: 'Rouge', name: 'Rouge' },
    { id: 28, x: 453, y: 818, type: 'Bleue', name: 'Bleue' },
    { id: 29, x: 380, y: 775, type: 'Bleue', name: 'Bleue' },
    { id: 30, x: 320, y: 715, type: 'Boutique', name: 'Boutique' },
    { id: 31, x: 278, y: 642, type: 'Chance', name: 'Chance' },
    { id: 32, x: 255, y: 561, type: 'Rouge', name: 'Rouge' },
    { id: 33, x: 255, y: 479, type: 'Boo', name: 'Boo (Virage Gauche)' },
    { id: 34, x: 278, y: 398, type: 'Bleue', name: 'Bleue' },
    { id: 35, x: 320, y: 325, type: 'Bleue', name: 'Bleue' },
    { id: 36, x: 380, y: 265, type: 'Malchance', name: 'Malchance' },
    { id: 37, x: 453, y: 222, type: 'Verte', name: 'Verte' },
    { id: 38, x: 535, y: 205, type: 'Malchance', name: 'Malchance' },
    { id: 39, x: 620, y: 200, type: 'Verte', name: 'Verte' },
    { id: 40, x: 705, y: 200, type: 'Coup du Sort', name: 'Coup du Sort' },
    { id: 41, x: 790, y: 200, type: 'Rouge', name: 'Rouge' },
    { id: 42, x: 875, y: 200, type: 'Boutique', name: 'Boutique' }
];

function getCase(id) {
    // Le plateau est circulaire, donc on utilise le modulo
    // Si id = 43, ça devient 1
    let normalizedId = ((id - 1) % 42) + 1;
    if (normalizedId <= 0) normalizedId += 42; // Pour gérer les reculs
    return BOARD_CASES.find(c => c.id === normalizedId);
}

function getCasesInRange(startId, endId) {
    const cases = [];
    let currentId = startId;
    while (currentId !== endId) {
        cases.push(getCase(currentId));
        currentId = ((currentId) % 42) + 1;
    }
    cases.push(getCase(endId));
    return cases;
}

module.exports = {
    BOARD_CASES,
    getCase,
    getCasesInRange
};
