const { Plateau } = require('../db/models');
const registry = require('../gamemodes/registry');

async function endSeason(client) {
    const plateau = await Plateau.findByPk(1);
    const mode = registry.getActiveMode(plateau);
    const endSeasonFn = mode.getEndgameHandler();
    return endSeasonFn(client);
}

module.exports = { endSeason };
