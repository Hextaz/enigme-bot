const test = require('node:test');
const assert = require('node:assert/strict');
const legacy = require('./fixtures/legacy-rules');
const { walk } = require('../src/gamemodes/mario_party/rules');
const { BOARD_CASES } = require('../src/gamemodes/mario_party/maps/night_sky/board');

const getCase = id => BOARD_CASES.find(c => c.id === id);
const LEGACY_RESUME = { etoile: ['etoile'], boutique: ['boutique'], boo: ['boo'], intersection: ['choix_direction'] };

/** Only states the game can produce: a resumed stop is the stop of the case the player stands on. */
function* states() {
  for (const here of BOARD_CASES) for (const star of [here.id, 20, 50]) {
    const resumes = [null];
    if (here.id === star) resumes.push('etoile');
    if (here.type === 'Boutique') resumes.push('boutique');
    if (here.type === 'Boo') resumes.push('boo');
    for (const resume of resumes) yield { here, star, resume, direction: null };
    if (here.next.length > 1) for (const direction of here.next) yield { here, star, resume: 'intersection', direction };
  }
}

test('Night Sky movement stops and resumes exactly like the frozen legacy loop while the shop is open', () => {
  let compared = 0;
  for (const s of states()) for (let remaining = 1; remaining <= 30; remaining++) {
    const current = walk({ cases: BOARD_CASES, position: s.here.id, remaining, star: s.star, resume: s.resume, direction: s.direction, shopOpen: true });
    const joueur = { position: s.here.id, cases_restantes: remaining, temp_choix_direction: s.direction };
    const old = legacy.walk({ joueur, plateau: { position_etoile: s.star }, getCase, alreadyHandledOnStart: s.resume ? [...LEGACY_RESUME[s.resume]] : [] });
    const expected = { position: old.interruption ? old.interruption.case.id : old.position, remaining: old.remaining, stop: old.interruption ? old.interruption.type : null };
    assert.deepEqual(current, expected, JSON.stringify({ from: s.here.id, star: s.star, resume: s.resume, direction: s.direction, remaining }));
    compared++;
  }
  assert.ok(compared > 5000);
});
