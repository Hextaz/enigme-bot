const fs = require('fs');
const path = require('path');

// Cache contenant tous les modes chargés
const _modes = new Map();

/**
 * Normalise un nom de dossier/fichier en nom lisible humainement.
 * Exemple: "night_sky" -> "Night Sky"
 */
function titleCase(str) {
  return str
    .split(/[_\s.-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Scanne le répertoire src/gamemodes pour charger tous les modes.
 */
function initRegistry() {
  const gamemodesDir = __dirname;
  
  try {
    const files = fs.readdirSync(gamemodesDir);
    
    for (const file of files) {
      const modePath = path.join(gamemodesDir, file);
      
      // On cherche les dossiers
      if (!fs.statSync(modePath).isDirectory()) continue;
      
      const configPath = path.join(modePath, 'mode.js');
      if (!fs.existsSync(configPath)) continue;
      
      // Charger le module de configuration du mode
      const modeModule = require(configPath);
      const modeId = file; // L'ID du mode est le nom du dossier
      
      // Charger les maps associées
      const maps = {};
      const mapsDir = path.join(modePath, 'maps');
      if (fs.existsSync(mapsDir) && fs.statSync(mapsDir).isDirectory()) {
        const mapFolders = fs.readdirSync(mapsDir);
        for (const mapFolder of mapFolders) {
          const mapPath = path.join(mapsDir, mapFolder);
          if (!fs.statSync(mapPath).isDirectory()) continue;
          
          const boardPath = path.join(mapPath, 'board.js');
          if (fs.existsSync(boardPath)) {
            // Détection du nom humain de la map
            let mapName = titleCase(mapFolder);
            try {
              const mapBoard = require(boardPath);
              if (mapBoard.name) {
                mapName = mapBoard.name;
              }
            } catch (e) {
              // Ignorer les erreurs d'import à ce stade
            }
            
            maps[mapFolder] = {
              id: mapFolder,
              name: mapName,
              path: mapPath,
              boardFile: boardPath,
              imageFile: path.join(mapPath, 'plateau.png')
            };
          }
        }
      }
      
      // Charger les variantes associées
      const variants = {};
      const variantsDir = path.join(modePath, 'variants');
      if (fs.existsSync(variantsDir) && fs.statSync(variantsDir).isDirectory()) {
        const variantFiles = fs.readdirSync(variantsDir);
        for (const varFile of variantFiles) {
          const varPath = path.join(variantsDir, varFile);
          
          let varId = varFile;
          let varName = '';
          
          if (fs.statSync(varPath).isDirectory()) {
            const varConfigPath = path.join(varPath, 'config.js');
            if (fs.existsSync(varConfigPath)) {
              varId = varFile;
              try {
                const varConfig = require(varConfigPath);
                varName = varConfig.name || titleCase(varId);
              } catch (e) {}
            } else {
              continue;
            }
          } else if (varFile.endsWith('.js')) {
            varId = varFile.slice(0, -3); // Retirer .js
            try {
              const varConfig = require(varPath);
              varName = varConfig.name || titleCase(varId);
            } catch (e) {}
          } else {
            continue;
          }
          
          variants[varId] = {
            id: varId,
            name: varName || titleCase(varId),
            file: varPath
          };
        }
      }
      
      // Assembler l'objet du mode
      const modeData = {
        id: modeId,
        name: modeModule.name || titleCase(modeId),
        emoji: modeModule.emoji || '🎮',
        description: modeModule.description || 'Aucune description disponible.',
        maxTours: modeModule.maxTours || 30,
        hasStars: modeModule.hasStars !== false,
        hasShop: modeModule.hasShop !== false,
        hasBoo: modeModule.hasBoo !== false,
        isLinear: modeModule.isLinear === true,
        
        // Méthodes requises par le contrat
        getEventHandlers: modeModule.getEventHandlers,
        getItems: modeModule.getItems,
        getShopConfig: modeModule.getShopConfig,
        getEndgameHandler: modeModule.getEndgameHandler,
        getBoardCases: modeModule.getBoardCases,
        getBoardImagePath: modeModule.getBoardImagePath,
        getVariantConfig: modeModule.getVariantConfig,
        getInitialPlayerData: modeModule.getInitialPlayerData || (() => ({})),
        
        // Listes découvertes
        maps,
        variants
      };
      
      _modes.set(modeId, modeData);
    }
    
    console.log(`[REGISTRY] ${_modes.size} mode(s) de jeu détecté(s) :`, Array.from(_modes.keys()).join(', '));
  } catch (err) {
    console.error("[REGISTRY] Erreur lors de l'initialisation du registre :", err);
  }
}

// Initialiser le registre directement au chargement du module
initRegistry();

module.exports = {
  /**
   * Retourne tous les modes de jeu détectés.
   * @returns {Array} Liste des objets de modes
   */
  getAllModes() {
    return Array.from(_modes.values());
  },
  
  /**
   * Récupère un mode spécifique par son identifiant.
   * @param {string} modeId L'ID du mode (nom du dossier)
   * @returns {Object|null} Le mode ou null
   */
  getMode(modeId) {
    return _modes.get(modeId) || null;
  },
  
  /**
   * Récupère les maps d'un mode spécifique.
   * @param {string} modeId L'ID du mode
   * @returns {Array} Liste des maps du mode
   */
  getMapsForMode(modeId) {
    const mode = this.getMode(modeId);
    return mode ? Object.values(mode.maps) : [];
  },
  
  /**
   * Récupère les variantes d'un mode spécifique.
   * @param {string} modeId L'ID du mode
   * @returns {Array} Liste des variantes du mode
   */
  getVariantsForMode(modeId) {
    const mode = this.getMode(modeId);
    return mode ? Object.values(mode.variants) : [];
  },
  
  /**
   * Retourne le mode actif d'une partie en cours.
   * @param {Object} plateau Le modèle de plateau (DB)
   * @returns {Object} Le mode actif
   */
  getActiveMode(plateau) {
    const modeId = plateau?.game_mode || 'mario_party';
    let mode = this.getMode(modeId);
    if (!mode) {
      console.warn(`[REGISTRY] Mode de jeu inconnu "${modeId}". Fallback sur "mario_party".`);
      mode = this.getMode('mario_party');
    }
    if (!mode) {
      throw new Error(`[REGISTRY] Aucun mode de jeu disponible, y compris "mario_party".`);
    }
    return mode;
  },
  
  /**
   * Récupère les cases du plateau pour la partie active.
   * @param {Object} plateau Le modèle de plateau (DB)
   * @returns {Array} Tableau de cases
   */
  getActiveBoardCases(plateau) {
    const mode = this.getActiveMode(plateau);
    const mapId = plateau?.game_map || 'night_sky';
    return mode.getBoardCases(mapId);
  },
  
  /**
   * Récupère les handlers d'événements pour la partie active.
   * @param {Object} plateau Le modèle de plateau (DB)
   * @returns {Object} Event handlers
   */
  getActiveEventHandlers(plateau) {
    const mode = this.getActiveMode(plateau);
    return mode.getEventHandlers();
  }
};
