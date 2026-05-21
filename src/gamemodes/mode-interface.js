/**
 * @file mode-interface.js
 * @description Documente le contrat d'interface que chaque mode de jeu dans `src/gamemodes/[mode_name]/mode.js` doit implémenter.
 * 
 * Les identifiants (IDs) des modes, variantes et maps sont déterminés par les noms de leurs dossiers respectifs.
 * Par exemple :
 * - Dossier du mode : `src/gamemodes/mario_party/` -> ID = 'mario_party'
 * - Dossier de la map : `src/gamemodes/mario_party/maps/night_sky/` -> ID = 'night_sky'
 * - Fichier/Dossier de variante : `src/gamemodes/mario_party/variants/standard.js` -> ID = 'standard'
 */

module.exports = {
  // === MÉTADONNÉES DE BASE ===
  name: "Nom du Mode",       // Nom affiché dans Discord (ex: "Mario Party")
  emoji: "🎲",                // Emoji pour les menus de sélection
  description: "Description", // Description courte affichée sous le nom

  // === DÉTAILS DE VUE / CONFIGURATION ===
  maxTours: 30,               // Nombre de tours par défaut pour ce mode
  hasStars: true,             // Indique si le mode utilise des étoiles
  hasShop: true,              // Indique si le mode contient une boutique
  hasBoo: true,               // Indique si le mode contient l'événement Boo
  isLinear: false,            // true pour parcours linéaire (Wii Party), false pour boucle (Mario Party)

  /**
   * Retourne les gestionnaires d'événements (events) pour ce mode de jeu.
   * @returns {Object} Un objet contenant tous les event handlers nécessaires à index.js
   */
  getEventHandlers() {
    // Doit retourner les handlers d'événements du mode
    throw new Error("getEventHandlers() non implémenté");
  },

  /**
   * Retourne la liste des items valides pour ce mode et cette variante.
   * @param {string} variantId L'identifiant de la variante (ex: 'standard')
   * @returns {Object} L'objet ITEMS décrivant tous les objets du jeu
   */
  getItems(variantId) {
    throw new Error("getItems() non implémenté");
  },

  /**
   * Retourne la configuration de la boutique pour une variante donnée.
   * @param {string} variantId L'identifiant de la variante
   * @returns {Object} Configuration de la boutique (probabilités, prix, tiers, etc.)
   */
  getShopConfig(variantId) {
    throw new Error("getShopConfig() non implémenté");
  },

  /**
   * Retourne le gestionnaire de fin de saison (fin de partie).
   * Contient la fonction `endSeason` qui gère les étoiles bonus, le podium, etc.
   * @returns {Function} La fonction endSeason(interactionOrClient)
   */
  getEndgameHandler() {
    throw new Error("getEndgameHandler() non implémenté");
  },

  /**
   * Récupère la définition des cases du plateau pour une map donnée.
   * @param {string} mapId L'identifiant de la map (ex: 'night_sky')
   * @returns {Array} Tableau de cases (BOARD_CASES) avec coordonnées, types et connexions
   */
  getBoardCases(mapId) {
    throw new Error("getBoardCases() non implémenté");
  },

  /**
   * Récupère le chemin absolu vers l'image de fond du plateau pour une map donnée.
   * @param {string} mapId L'identifiant de la map (ex: 'night_sky')
   * @returns {string} Le chemin absolu de l'image (plateau.png)
   */
  getBoardImagePath(mapId) {
    throw new Error("getBoardImagePath() non implémenté");
  },

  /**
   * Initialise les données spécifiques à ce mode pour un joueur.
   * Utile pour configurer `mode_data` lors de la création ou réinitialisation d'une partie.
   * @param {string} variantId La variante sélectionnée
   * @returns {Object} L'objet initial pour `Joueur.mode_data`
   */
  getInitialPlayerData(variantId) {
    return {};
  }
};
