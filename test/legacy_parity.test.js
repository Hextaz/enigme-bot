const test = require('node:test');
const assert = require('node:assert/strict');
const legacy = require('./fixtures/legacy-rules');
const { rollDice, starCandidates, teleportCandidates } = require('../src/gamemodes/mario_party/rules');
const { BOARD_CASES } = require('../src/gamemodes/mario_party/maps/night_sky/board');

test('all historical die buckets and modifiers keep their distribution and consumption', () => {
  for (const type_de of ['normal', 'double', 'triple', 'pipe']) {
    for (const de_limite of [false, true]) for (const bonus_prochain_lancer of [0, 3]) {
      for (let sample = 0; sample <= 1000; sample++) {
        const random = () => sample / 1001;
        const state = { type_de, de_limite, bonus_prochain_lancer, de_pipe_valeur: 7 };
        assert.deepEqual(rollDice(state, random), legacy.dice({ ...state }, random));
      }
    }
  }
});

test('star and pipe destinations preserve the historical Night Sky exclusions and fallback', async () => {
  const pipe = BOARD_CASES.filter(c => c.id <= 45 && c.id !== 1 && c.type !== 'Boutique' && c.type !== 'Boo').map(c => c.id);
  assert.deepEqual(teleportCandidates(BOARD_CASES), pipe);
  for (const occupied of [[], [2, 5, 12], BOARD_CASES.map(c => c.id)]) {
    for (const star of [1, 10, 44, 55]) {
      const candidates = starCandidates(BOARD_CASES, star, occupied);
      for (let index = 0; index < candidates.length; index++) {
        const random = () => (index + 0.5) / candidates.length;
        const old = legacy.star(BOARD_CASES, occupied.map(position => ({ position })), random);
        assert.equal(candidates[index], await old(star));
      }
    }
  }
});
