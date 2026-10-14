import path from 'node:path';
import { ModeDefinition } from '../mode-interface';
import { BOARD_CASES as ISLAND } from './maps/board_game_island/board';

const MAPS: Record<string, typeof ISLAND> = { board_game_island: ISLAND };
const VARIANTS: Record<string, object> = { standard: require('./variants/standard') };

const mode: ModeDefinition = {
  name: "L'île aux défis",
  emoji: '🏝️',
  description: 'Faites la course sur un parcours linéaire de 73 cases parsemé de pièges, cascade, portails et rochers ! Qui terrassera le Dragon le premier ?',
  maxTours: 30,
  hasStars: false,
  hasShop: false,
  hasBoo: false,
  isLinear: true,
  // Lazy: the Discord layer depends on the registry, which loads this file.
  getInteractions: () => require('./discord').interactions,
  // No items nor coins in this race mode.
  getItems: () => ({}),
  getEndgame: () => require('./endgame').endgame,
  getBoardCases(mapId) {
    const cases = MAPS[mapId];
    if (!cases) throw new Error(`Map de l'île inconnue : ${mapId}`);
    return cases;
  },
  getBoardImagePath: mapId => path.join(__dirname, 'maps', mapId, 'plateau.png'),
  getVariantConfig(variantId) {
    const variant = VARIANTS[variantId];
    if (!variant) throw new Error(`Variante de l'île inconnue : ${variantId}`);
    return variant;
  },
  getInitialPlayerData: () => ({ bonus_de: 'none' }),
};
export = mode;
