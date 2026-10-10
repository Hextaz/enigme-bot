import { at } from '../../domain/types';
import { BoardCase, GameRuleError, Random, randomInt } from '../../domain/types';

export type MarioStop = 'etoile' | 'boutique' | 'boo' | 'intersection';

export const KEY_ITEM_NAME = '🔑 Clé';
export const BOO_STAR_PRICE = 50;

export function findCase(cases: BoardCase[], id: number): BoardCase {
  const found = cases.find(c => c.id === id);
  if (!found) throw new GameRuleError('BOARD', `Case ${id} absente du plateau.`);
  return found;
}

export interface WalkInput {
  cases: BoardCase[]; position: number; remaining: number; star: number;
  /** Stop already handled on the current case: its choice must not be offered again. */
  resume: MarioStop | null;
  direction: number | null;
  shopOpen: boolean;
}
export interface WalkResult { position: number; remaining: number; stop: MarioStop | null }

/** Move step by step until the dice are spent or a case requires a decision. */
export function walk(input: WalkInput): WalkResult {
  let { position, remaining } = input;
  let resume = input.resume;
  while (remaining > 0) {
    const current = findCase(input.cases, position);
    let next = at(current.next, 0);
    if (current.next.length > 1) {
      if (resume !== 'intersection') return { position, remaining, stop: 'intersection' };
      next = input.direction ?? at(current.next, 0);
      if (!current.next.includes(next)) throw new GameRuleError('DIRECTION', `La direction ${next} ne part pas de la case ${position}.`);
    }
    resume = null;
    position = next;
    remaining -= 1;
    const reached = findCase(input.cases, position);
    if (reached.id === input.star) return { position, remaining, stop: 'etoile' };
    if (reached.type === 'Boutique' && input.shopOpen) return { position, remaining, stop: 'boutique' };
    if (reached.type === 'Boo') return { position, remaining, stop: 'boo' };
  }
  return { position, remaining, stop: null };
}

export interface DiceState { type_de: string; de_pipe_valeur: number; de_limite: boolean; bonus_prochain_lancer: number }

/** Roll for the turn. Every one-shot modifier (dice item, limit, mushroom) is consumed. */
export function rollDice(state: DiceState, random: Random): { value: number; state: DiceState } {
  let value: number;
  if (state.type_de === 'double') value = randomInt(random, 2, 20);
  else if (state.type_de === 'triple') value = randomInt(random, 3, 30);
  else if (state.type_de === 'pipe') value = state.de_pipe_valeur;
  else value = randomInt(random, 1, 10);
  if (state.de_limite) value = Math.min(value, 3);
  value += Math.max(0, state.bonus_prochain_lancer);
  return { value, state: { type_de: 'normal', de_pipe_valeur: state.de_pipe_valeur, de_limite: false, bonus_prochain_lancer: 0 } };
}


export function starCandidates(cases: BoardCase[], currentStar: number, occupied: number[]): number[] {
  const allowed = cases.filter(c => c.starEligible === true && c.id !== currentStar).map(c => c.id);
  const free = allowed.filter(id => !occupied.includes(id));
  return free.length ? free : allowed;
}
export function teleportCandidates(cases: BoardCase[]): number[] {
  return cases.filter(c => c.teleportEligible === true).map(c => c.id);
}
export function caseBefore(cases: BoardCase[], target: number): number {
  return cases.find(c => c.next.includes(target))?.id ?? 1;
}
