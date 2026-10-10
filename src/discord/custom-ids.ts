import { GameRuleError, at } from '../domain/types';

/** Keep existing message ids readable across deploys; decode untrusted values exactly once. */
function codec<T>(pattern: RegExp, decode: (parts: string[]) => T, encode: (value: T) => string) {
  return {
    decode(id: string): T {
      const match = pattern.exec(id);
      if (!match) throw new GameRuleError('ACTION', 'Action invalide ou périmée.');
      return decode(match.slice(1));
    },
    encode(value: T): string {
      const id = encode(value);
      if (id.length > 100 || !pattern.test(id)) throw new TypeError('customId invalide');
      return id;
    },
  };
}
export function selectedValue(values: readonly string[]): string {
  if (values.length !== 1 || !values[0]) throw new GameRuleError('SELECTION', 'La sélection est invalide.');
  return values[0];
}
export function numericChoice(value: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new GameRuleError('ACTION', 'Action invalide.');
  return Number(value);
}
const first = (p: string[]) => at(p, 0);
const numeric = (prefix: string) => codec(new RegExp(`^${prefix}(\\d+)$`), p => numericChoice(first(p)), (n: number) => `${prefix}${n}`);
export const ids = {
  use: codec(/^use_(\w+)_(\d+)$/, p => ({ key: first(p), index: numericChoice(at(p, 1)) }), (v: { key: string; index: number }) => `use_${v.key}_${v.index}`),
  buy: codec(/^buy_([\w-]+)(?:#\d+)?$/, first, (item: string) => `buy_${item}`),
  replaceBuy: codec(/^replace_buy_([\w-]+)$/, first, (item: string) => `replace_buy_${item}`),
  direction: numeric('choix_direction_'), pipe: numeric('de_pipe_choix_'), islandDirection: numeric('ile_direction_'),
  bet: numeric('pari_'), betModal: numeric('modal_pari_'),
  islandChallenge: codec(/^ile_tenter_(portail|cascade|liane|dragon)$/, p => {
    const kind = first(p);
    if (kind !== 'portail' && kind !== 'cascade' && kind !== 'liane' && kind !== 'dragon') throw new GameRuleError('ACTION', 'Action invalide.');
    return kind;
  }, (kind: 'portail' | 'cascade' | 'liane' | 'dragon') => `ile_tenter_${kind}`),
  judge: codec<{ action: 'good' | 'bad' | 'spam'; userId: string }>(/^reponse_(good|bad|spam)_([^_]+)(?:_.*)?$/, p => { const action = first(p); if (action !== 'good' && action !== 'bad' && action !== 'spam') throw new GameRuleError('ACTION', 'Action invalide.'); return { action, userId: at(p, 1) }; }, (v: { action: 'good' | 'bad' | 'spam'; userId: string }) => `reponse_${v.action}_${v.userId}`),
  adminMap: codec(/^admin_start_map::([\w-]+)::([\w-]+)$/, p => ({ modeId: first(p), variantId: at(p, 1) }), (v: { modeId: string; variantId: string }) => `admin_start_map::${v.modeId}::${v.variantId}`),
  adminConfirm: codec(/^admin_start_confirm::([\w-]+)::([\w-]+)::([\w-]+)$/, p => ({ modeId: first(p), variantId: at(p, 1), mapId: at(p, 2) }), (v: { modeId: string; variantId: string; mapId: string }) => `admin_start_confirm::${v.modeId}::${v.variantId}::${v.mapId}`),
};
