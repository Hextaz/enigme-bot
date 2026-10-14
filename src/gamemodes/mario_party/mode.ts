import { marioVariant } from './variant';
import path from 'node:path';
import { ModeDefinition } from '../mode-interface';
import { ITEMS } from './items';
import { BOARD_CASES as NIGHT_SKY } from './maps/night_sky/board';

const MAPS: Record<string, typeof NIGHT_SKY> = { night_sky: NIGHT_SKY };

const mode: ModeDefinition = {
  name: 'Mario Party',
  emoji: '🎲',
  description: 'Le mode de jeu classique style Mario Party avec dés, boutiques, étoiles mobiles et événements !',
  maxTours: 30,
  hasStars: true,
  hasShop: true,
  hasBoo: true,
  isLinear: false,
  // Lazy: the Discord layer depends on the registry, which loads this file.
  getInteractions: () => require('./discord').interactions,
  getItems: () => ITEMS,
  getEndgame: () => require('./endgame').endgame,
  getBoardCases(mapId) {
    const cases = MAPS[mapId];
    if (!cases) throw new Error(`Map Mario Party inconnue : ${mapId}`);
    return cases;
  },
  getBoardImagePath: mapId => path.join(__dirname, 'maps', mapId, 'plateau.png'),
  getVariantConfig: marioVariant,
  getInitialPlayerData: () => ({}),
};
export = mode;
