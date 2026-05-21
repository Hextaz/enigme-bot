const { Plateau } = require('../db/models');
const registry = require('../gamemodes/registry');

async function generateShop(joueurId) {
    const plateau = await Plateau.findByPk(1);
    const mode = registry.getActiveMode(plateau);
    const shopConfig = mode.getShopConfig(plateau?.game_variant || 'standard');
    return shopConfig.generateShop(joueurId);
}

module.exports = { generateShop };
