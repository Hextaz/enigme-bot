import { Transaction } from 'sequelize';
import { Joueur } from '../../db/models';
import { GameRuleError, Item, Random, pick } from '../../domain/types';
import { ITEMS, itemByKey } from './items';

export const TIERS: Record<1 | 2 | 3, string[]> = {
  1: ['CHAMPIGNON', 'PIEGE_PIECES'],
  2: ['TUYAU', 'DE_PIPE', 'DOUBLE_DE', 'CLE'],
  3: ['MIROIR', 'SIFFLET'],
};
export const SUNDAY_ITEMS = ['DE_TRIPLE', 'TUYAU_DORE', 'PIEGE_ETOILE', 'PACK_PROMO_1', 'PACK_PROMO_2'];
export const INVENTORY_LIMIT = 3;

export function itemById(id: string): Item | undefined {
  return Object.values(ITEMS).find(item => item.id === id);
}

/** Today's offer is drawn once per player and kept until the 17h reset. Saved by the caller. */
export async function prepareShop(joueur: Joueur, transaction: Transaction, random: Random, isSunday: boolean): Promise<Item[]> {
  if (joueur.boutique_du_jour.length) return joueur.boutique_du_jour.map(id => itemById(id)).filter((item): item is Item => !!item);
  const ranking = await Joueur.findAll({ order: [['etoiles', 'DESC'], ['pieces', 'DESC']], transaction });
  const lowerHalf = ranking.findIndex(j => j.discord_id === joueur.discord_id) >= Math.floor(ranking.length / 2);
  // Players in the lower half of the ranking see rare items more often.
  const [tier1, tier2] = lowerHalf ? [0.45, 0.75] : [0.60, 0.90];
  const offer: Item[] = [];
  for (let slot = 0; slot < 3; slot++) {
    let item: Item;
    let attempts = 0;
    do {
      if (isSunday) item = itemByKey(pick(random, SUNDAY_ITEMS));
      else {
        const roll = random();
        const tier = roll < tier1 ? 1 : roll < tier2 ? 2 : 3;
        item = itemByKey(pick(random, TIERS[tier]));
      }
      attempts++;
    } while (offer.some(o => o.id === item.id) && attempts < 5);
    offer.push(item);
  }
  joueur.boutique_du_jour = offer.map(item => item.id);
  return offer;
}

export type Purchase = { kind: 'bought'; item: Item; droppedItem?: string } | { kind: 'needs_replacement'; item: Item };

/** Validate and apply a purchase on the loaded player. Saved by the caller inside its transaction. */
export function applyPurchase(joueur: Joueur, itemId: string, replaceIndex?: number): Purchase {
  const item = itemById(itemId);
  if (!item || !joueur.boutique_du_jour.includes(itemId)) throw new GameRuleError('STALE_SHOP', "Cet objet n'est plus proposé dans ta boutique.");
  if (!Array.isArray(joueur.inventaire) || !joueur.inventaire.every(value => typeof value === 'string')) throw new GameRuleError('INVENTORY', 'Inventaire invalide.');
  if (joueur.pieces < item.price) throw new GameRuleError('FUNDS', "Tu n'as pas assez de pièces.");
  const additions = item.isPack ? (item.contents ?? []).map(key => itemByKey(key).name) : [item.name];
  const inventory = [...joueur.inventaire];
  let droppedItem: string | undefined;
  if (replaceIndex !== undefined) {
    if (item.isPack || !Number.isInteger(replaceIndex) || replaceIndex < 0 || replaceIndex >= inventory.length) throw new GameRuleError('SLOT', "L'objet à remplacer n'existe plus.");
    droppedItem = inventory.splice(replaceIndex, 1)[0];
  }
  if (inventory.length + additions.length > INVENTORY_LIMIT) {
    if (!item.isPack && replaceIndex === undefined) return { kind: 'needs_replacement', item };
    throw new GameRuleError('FULL', `Ton inventaire est trop plein (il te faut ${additions.length} place(s) libre(s)).`);
  }
  joueur.pieces -= item.price;
  joueur.inventaire = [...inventory, ...additions];
  joueur.boutique_du_jour = joueur.boutique_du_jour.filter(id => id !== itemId);
  return { kind: 'bought', item, droppedItem };
}
