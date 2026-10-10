import fs from 'node:fs';
import path from 'node:path';
import { ModeDefinition, validateMode, validateBoard } from './mode-interface';
interface MapInfo { id: string; name: string; path: string; boardFile: string; imageFile: string }
interface VariantInfo { id: string; name: string; file: string }
interface RegisteredMode extends ModeDefinition { id: string; maps: Record<string, MapInfo>; variants: Record<string, VariantInfo> }
const modes = new Map<string, RegisteredMode>();
const titleCase = (id: string) => id.split(/[_\s.-]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
for (const directory of fs.readdirSync(__dirname, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const modePath = path.join(__dirname, directory.name);
  const configPath = path.join(modePath, 'mode.js');
  if (!fs.existsSync(configPath)) continue;
  const definition: unknown = require(configPath);
  validateMode(definition);
  const maps: Record<string, MapInfo> = {};
  for (const folder of fs.readdirSync(path.join(modePath, 'maps'), { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const mapPath = path.join(modePath, 'maps', folder.name);
    validateBoard(definition.getBoardCases(folder.name));
    const imageFile = definition.getBoardImagePath(folder.name);
    if (!fs.existsSync(imageFile)) throw new Error(`Image de plateau absente : ${imageFile}`);
    maps[folder.name] = { id: folder.name, name: titleCase(folder.name), path: mapPath, boardFile: path.join(mapPath, 'board.js'), imageFile };
  }
  const variants: Record<string, VariantInfo> = {};
  for (const file of fs.readdirSync(path.join(modePath, 'variants'))) {
    if (!file.endsWith('.js')) continue;
    const id = path.basename(file, '.js');
    definition.getVariantConfig(id);
    variants[id] = { id, name: titleCase(id), file: path.join(modePath, 'variants', file) };
  }
  if (!Object.keys(maps).length || !Object.keys(variants).length) throw new Error(`Mode incomplet : ${directory.name}`);
  modes.set(directory.name, { ...definition, id: directory.name, maps, variants });
}
console.log(`[REGISTRY] ${modes.size} mode(s) de jeu détecté(s) : ${[...modes.keys()].join(', ')}`);
export function getAllModes() { return [...modes.values()]; }
export function getMode(modeId: string) { return modes.get(modeId) ?? null; }
export function getMapsForMode(modeId: string) { const mode = getMode(modeId); return mode ? Object.values(mode.maps) : []; }
export function getVariantsForMode(modeId: string) { const mode = getMode(modeId); return mode ? Object.values(mode.variants) : []; }
export function getActiveMode(plateau: { game_mode: string } | null) {
  const id = plateau?.game_mode ?? 'mario_party';
  const mode = getMode(id);
  if (!mode) throw new Error(`Mode inconnu en base : ${id}`);
  return mode;
}
export function getActiveBoardCases(plateau: { game_mode: string; game_map: string } | null) {
  const mode = getActiveMode(plateau);
  const map = plateau?.game_map ?? 'night_sky';
  if (!mode.maps[map]) throw new Error(`Map inconnue : ${map}`);
  return mode.getBoardCases(map);
}
export function getActiveInteractions(plateau: { game_mode: string } | null) { return getActiveMode(plateau).getInteractions(); }
