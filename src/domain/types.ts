export type Json = string | number | boolean | null | Json[] | JsonObject;
export interface JsonObject { [key: string]: Json }
export type EnigmaStatus = 'season_ended' | 'programmee' | 'active' | 'finished';
export interface BoardCase { id: number; x: number; y: number; type: string; name: string; next: number[]; zone?: string; starEligible?: boolean; teleportEligible?: boolean; requiresKey?: boolean; waterLanding?: number }
export interface Item { id: string; name: string; price: number; description: string; sundayOnly?: boolean; isPack?: boolean; contents?: string[]; passive?: boolean }
export type ItemCatalog = Record<string, Item>;
export class GameRuleError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'GameRuleError'; }
}

/** A choice the player must make before the movement resumes. Persisted so stale buttons and restarts are safe. */
export type MarioStop = 'etoile' | 'boutique' | 'boo' | 'intersection';
export type IleStop = 'intersection' | 'portail' | 'liane' | 'cascade' | 'dragon';
interface PendingBase { case: number; token: string }
export type MarioPending = { [Kind in MarioStop]: PendingBase & { type: Kind } }[MarioStop];
export type IlePending = { [Kind in Exclude<IleStop, 'portail'>]: PendingBase & { type: Kind } }[Exclude<IleStop, 'portail'>] | PendingBase & { type: 'portail'; target?: number };
export type PendingAction = MarioPending | IlePending;

/** Random source in [0, 1). Injected so every branch of a rule can be tested deterministically. */
export type Random = () => number;
export function randomInt(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}
export function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new RangeError(`Index ${index} absent (taille ${values.length})`);
  return value;
}
export function pick<T>(random: Random, values: readonly T[]): T {
  if (!values.length) throw new Error('Tirage dans une liste vide');
  return at(values, Math.floor(random() * values.length));
}
export function newToken(random: Random = Math.random): string {
  return `${Date.now().toString(36)}${Math.floor(random() * 1e9).toString(36)}`;
}

export interface Trap extends JsonObject { position: number; type: 'pieces' | 'etoile'; poseur: string }
export function isTrap(value: Json): value is Trap {
  return !!value && typeof value === 'object' && !Array.isArray(value) && typeof value.position === 'number'
    && (value.type === 'pieces' || value.type === 'etoile') && typeof value.poseur === 'string';
}
