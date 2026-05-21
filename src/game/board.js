const { Plateau } = require('../db/models');
const registry = require('../gamemodes/registry');

// Chargé dynamiquement, fallback sur mario_party/maps/night_sky
let _cachedCases = null;
let _cachedMode = null;
let _cachedMap = null;

async function loadBoardCases() {
  const plateau = await Plateau.findByPk(1);
  const modeId = plateau?.game_mode || 'mario_party';
  const mapId = plateau?.game_map || 'night_sky';
  
  if (_cachedMode !== modeId || _cachedMap !== mapId) {
    const mode = registry.getMode(modeId);
    if (mode) {
      _cachedCases = mode.getBoardCases(mapId);
      _cachedMode = modeId;
      _cachedMap = mapId;
    }
  }
  return _cachedCases || require('../gamemodes/mario_party/maps/night_sky/board').BOARD_CASES;
}

// Synchrone pour la rétrocompatibilité (utilise le cache ou charge le fallback)
function getCase(id) {
  if (!_cachedCases) {
    const fallbackBoard = require('../gamemodes/mario_party/maps/night_sky/board');
    return fallbackBoard.getCase(id);
  }
  return _cachedCases.find(c => c.id === id);
}

// Permet d'invalider le cache pour forcer un rechargement lors d'un changement de map
function _invalidateCache() {
  _cachedCases = null;
  _cachedMode = null;
  _cachedMap = null;
}

// Export synchrone du BOARD_CASES pour rétrocompatibilité
// Initialisé au premier chargement (mario_party/maps/night_sky)
const BOARD_CASES = require('../gamemodes/mario_party/maps/night_sky/board').BOARD_CASES;

module.exports = { BOARD_CASES, getCase, loadBoardCases, _invalidateCache };
