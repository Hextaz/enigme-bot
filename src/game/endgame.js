const { Plateau, Joueur } = require('../db/models');
const registry = require('../gamemodes/registry');

async function endSeason(client) {
    const plateau = await Plateau.findByPk(1);
    if (!plateau) {
        return { success: false, alreadyEnded: true, playerCount: 0 };
    }
    if (plateau.enigme_status === 'season_ended') {
        return { success: true, alreadyEnded: true, playerCount: 0 };
    }

    const playerCount = await Joueur.count();
    const mode = registry.getActiveMode(plateau);
    const endSeasonFn = mode.getEndgameHandler();
    let handlerResult = null;
    if (typeof endSeasonFn === 'function') {
        handlerResult = await endSeasonFn(client);
    }

    // Sécurité centralisée : garantir que le plateau est marqué season_ended et joueurs bloqués
    const refreshed = await Plateau.findByPk(1);
    if (refreshed && refreshed.enigme_status !== 'season_ended') {
        refreshed.enigme_resolue = true;
        refreshed.enigme_status = 'season_ended';
        await refreshed.save();
    }

    await Joueur.update({ a_le_droit_de_jouer: false }, { where: {} });
    return { success: true, alreadyEnded: false, playerCount, handlerResult };
}

module.exports = { endSeason };
