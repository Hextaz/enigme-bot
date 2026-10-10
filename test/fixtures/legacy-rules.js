// Frozen excerpts from main a7405cac0fc53dc1ff7764be51d4fda92eccca9c,
// src/gamemodes/mario_party/events.js. Only dependencies are injected.
// Do not update this oracle to match a new implementation.
exports.dice = function (joueur, random) {
  const Math = { floor: globalThis.Math.floor, min: globalThis.Math.min, random };
        let de = 0;
        if (joueur.type_de === 'double') {
            de = Math.floor(Math.random() * 19) + 2; // 2 à 20
            joueur.type_de = 'normal';
        } else if (joueur.type_de === 'triple') {
            de = Math.floor(Math.random() * 28) + 3; // 3 à 30
            joueur.type_de = 'normal';
        } else if (joueur.type_de === 'pipe') {
            de = joueur.de_pipe_valeur;
            joueur.type_de = 'normal';
        } else {
            de = Math.floor(Math.random() * 10) + 1; // 1 à 10
        }

        if (joueur.de_limite) {
            de = Math.min(de, 3);
            joueur.de_limite = false;
        }

        if (joueur.bonus_prochain_lancer > 0) {
            de += joueur.bonus_prochain_lancer;
            joueur.bonus_prochain_lancer = 0;
        }

  return { value: de, state: joueur };
};
exports.star = function (BOARD_CASES, players, random) {
  const Math = { floor: globalThis.Math.floor, random };
  const Joueur = { findAll: async () => players };
  const require = () => ({ BOARD_CASES });
async function getRandomStarPosition(currentStarPosition) {
    const tousLesJoueurs = await Joueur.findAll();
    const positionsOccupees = tousLesJoueurs.map(j => j.position);
    
    const { BOARD_CASES } = require('../../game/board');
    let casesValides = BOARD_CASES.filter(ca => 
        ca.id <= 45 && 
        ca.type !== 'Boutique' && 
        ca.type !== 'Boo' && 
        ca.id !== 1 &&
        ca.id !== currentStarPosition &&
        !positionsOccupees.includes(ca.id)
    ).map(ca => ca.id);

    if (casesValides.length === 0) {
        casesValides = BOARD_CASES.filter(ca => 
            ca.id <= 45 && 
            ca.type !== 'Boutique' && 
            ca.type !== 'Boo' && 
            ca.id !== 1 &&
            ca.id !== currentStarPosition
        ).map(ca => ca.id);
    }
    
    return casesValides[Math.floor(Math.random() * casesValides.length)];
}

  return getRandomStarPosition;
};
