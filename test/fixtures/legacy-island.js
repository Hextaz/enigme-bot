// Frozen excerpts from main a7405cac0fc53dc1ff7764be51d4fda92eccca9c,
// src/gamemodes/ile_defis/events.js. Copied verbatim; only dependencies are injected.
// Do not update this oracle to match a new implementation.

// Lines 246-313: step-by-step movement of processMovement.
exports.walk = function ({ joueur, plateau, getCase, alreadyHandledOnStart }) {
    let pData = plateau.mode_data || {};
    pData.portails_ouverts = pData.portails_ouverts || [];
    pData.cascade_desactivee = pData.cascade_desactivee || false;

    let interruption = null;

    while (joueur.cases_restantes > 0) {
        const currentCase = getCase(joueur.position);

        // 1. Gérer les intersections
        if (currentCase.type === 'Intersection' && !alreadyHandledOnStart.includes('choix_direction')) {
            interruption = { type: 'intersection', case: currentCase };
            break;
        }

        let nextCaseId = currentCase.next[0];
        if (currentCase.type === 'Intersection' && alreadyHandledOnStart.includes('choix_direction')) {
            nextCaseId = joueur.temp_choix_direction;
            const idx = alreadyHandledOnStart.indexOf('choix_direction');
            if (idx > -1) alreadyHandledOnStart.splice(idx, 1);
        }

        // 2. Gérer le Portail bloquant devant
        const nextCaseObj = getCase(nextCaseId);
        if (nextCaseObj && nextCaseObj.type === 'Portail' && !pData.portails_ouverts.includes(nextCaseId) && !alreadyHandledOnStart.includes('portail')) {
            interruption = { type: 'portail', case: currentCase, targetGateId: nextCaseId };
            break;
        }

        // Si le portail est franchi ou déjà ouvert
        if (nextCaseObj && nextCaseObj.type === 'Portail') {
            const idx = alreadyHandledOnStart.indexOf('portail');
            if (idx > -1) alreadyHandledOnStart.splice(idx, 1);
        }

        // Déplacer le joueur sur la case suivante
        joueur.position = nextCaseId;
        joueur.cases_restantes -= 1;

        const c = getCase(joueur.position);

        // 3. Gérer l'arrêt sur une Liane
        if (c.type === 'Liane' && !alreadyHandledOnStart.includes('liane')) {
            interruption = { type: 'liane', case: c };
            break;
        } else if (c.type === 'Liane') {
            const idx = alreadyHandledOnStart.indexOf('liane');
            if (idx > -1) alreadyHandledOnStart.splice(idx, 1);
        }

        // 4. Gérer l'arrêt sur la Cascade
        if (c.type === 'Cascade' && !pData.cascade_desactivee && !alreadyHandledOnStart.includes('cascade')) {
            interruption = { type: 'cascade', case: c };
            break;
        } else if (c.type === 'Cascade') {
            const idx = alreadyHandledOnStart.indexOf('cascade');
            if (idx > -1) alreadyHandledOnStart.splice(idx, 1);
        }

        // 5. Gérer l'arrêt net sur le Dragon de fin (Case 73)
        if (c.type === 'Dragon' && !alreadyHandledOnStart.includes('dragon')) {
            joueur.cases_restantes = 0; // Surplus ignoré
            interruption = { type: 'dragon', case: c };
            break;
        }

        alreadyHandledOnStart = [];
    }
  return { interruption, position: joueur.position, remaining: joueur.cases_restantes };
};
