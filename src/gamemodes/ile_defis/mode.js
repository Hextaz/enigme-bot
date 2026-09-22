const path = require('path');
const events = require('./events');

module.exports = {
  name: "L'île aux défis",
  emoji: "🏝️",
  description: "Faites la course sur un parcours linéaire de 73 cases parsemé de pièges, cascade, portails et rochers ! Qui terrassera le Dragon le premier ?",
  
  maxTours: 30,
  hasStars: false,
  hasShop: false,
  hasBoo: false,
  isLinear: true,

  getEventHandlers() {
    return events;
  },

  getItems(variantId) {
    // Aucune économie d'objets ou de pièces dans ce mode classique
    return {};
  },

  getShopConfig(variantId) {
    // Pas de boutique dans ce mode
    return {
      generateShop: () => [],
      tiers: {},
      sundayItems: []
    };
  },

  getEndgameHandler() {
    // La victoire est gérée en fin de tour quotidien ( events.js / cron.js )
    return async (client) => {
      console.log("[ILE DEFIS] Endgame handler appelé.");
      const config = require('../../config');
      let channel = null;
      if (client && client.channels) {
        if (typeof client.channels.fetch === 'function') {
          channel = await client.channels.fetch(config.boardChannelId).catch(() => null);
        }
        if (!channel && client.channels.cache && typeof client.channels.cache.get === 'function') {
          channel = client.channels.cache.get(config.boardChannelId);
        }
      }
      if (channel) {
        await channel.send("🏁 **FIN DE L'ÎLE AUX DÉFIS !** La saison a été clôturée par le Maître du Jeu. Le plateau est désormais verrouillé.");
      }
      return { mode: 'ile_defis' };
    };
  },

  getBoardCases(mapId) {
    const boardPath = path.join(__dirname, 'maps', mapId, 'board.js');
    try {
      const board = require(boardPath);
      return board.BOARD_CASES;
    } catch (e) {
      console.error(`[ile_defis] Impossible de charger les cases pour la map "${mapId}" :`, e);
      return require('./maps/board_game_island/board').BOARD_CASES;
    }
  },

  getBoardImagePath(mapId) {
    return path.join(__dirname, 'maps', mapId, 'plateau.png');
  },

  getVariantConfig(variantId) {
    return {
      name: "Standard",
      description: "La course classique de l'île aux défis."
    };
  },

  getInitialPlayerData(variantId) {
    return {
      bonus_de: "none" // "gold" | "silver" | "bronze" | "chocolat" | "none"
    };
  }
};
