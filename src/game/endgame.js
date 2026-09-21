const { Plateau, Joueur } = require('../db/models');
const registry = require('../gamemodes/registry');

async function endSeason(client) {
    const plateau = await Plateau.findByPk(1);
    if (!plateau || plateau.enigme_status === 'season_ended') return;

    const mode = registry.getActiveMode(plateau);
    const endSeasonFn = mode.getEndgameHandler();
    if (typeof endSeasonFn === 'function') {
        await endSeasonFn(client);
    }

    // Sécurité centralisée : garantir que le plateau est marqué season_ended et joueurs bloqués
    const refreshed = await Plateau.findByPk(1);
    if (refreshed && refreshed.enigme_status !== 'season_ended') {
        refreshed.enigme_resolue = true;
        refreshed.enigme_status = 'season_ended';
        await refreshed.save();
    }

    await Joueur.update({ a_le_droit_de_jouer: false }, { where: {} });
}

module.exports = { endSeason };
