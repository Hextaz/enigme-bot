const path = require('path');
const events = require('./events');
const { ITEMS } = require('./items');
const shop = require('./shop');
const endgame = require('./endgame');

module.exports = {
  name: 'Mario Party',
  emoji: '🎲',
  description: 'Le mode de jeu classique style Mario Party avec dés, boutiques, étoiles mobiles et événements !',
  
  maxTours: 30,
  hasStars: true,
  hasShop: true,
  hasBoo: true,
  isLinear: false,

  getEventHandlers() {
    return events;
  },

  getItems(variantId) {
    // Si d'autres variantes ont des objets spécifiques à l'avenir, on peut filtrer/ajouter ici.
    return ITEMS;
  },

  getShopConfig(variantId) {
    return {
      generateShop: shop.generateShop,
      tiers: shop.TIERS,
      sundayItems: shop.SUNDAY_ITEMS
    };
  },

  getEndgameHandler() {
    return endgame.endSeason;
  },

  getBoardCases(mapId) {
    const boardPath = path.join(__dirname, 'maps', mapId, 'board.js');
    try {
      const board = require(boardPath);
      return board.BOARD_CASES;
    } catch (e) {
      console.error(`[mario_party] Impossible de charger les cases pour la map "${mapId}" :`, e);
      // Fallback sur la map par défaut 'night_sky'
      return require('./maps/night_sky/board').BOARD_CASES;
    }
  },

  getBoardImagePath(mapId) {
    return path.join(__dirname, 'maps', mapId, 'plateau.png');
  },

  getVariantConfig(variantId) {
    const variantPath = path.join(__dirname, 'variants', `${variantId}.js`);
    try {
      return require(variantPath);
    } catch (e) {
      return require('./variants/standard');
    }
  },

  getInitialPlayerData(variantId) {
    return {};
  }
};
