const test = require('node:test');
const assert = require('node:assert/strict');
const legacy = require('./fixtures/legacy-island');
const { walk, findCase } = require('../src/gamemodes/ile_defis/turn');
const { BOARD_CASES } = require('../src/gamemodes/ile_defis/maps/board_game_island/board');

const getCase = id => BOARD_CASES.find(c => c.id === id);
const LEGACY_RESUME = { intersection: ['choix_direction'], portail: ['portail'], liane: ['liane'], cascade: ['cascade'] };
const GATES = BOARD_CASES.filter(c => c.type === 'Portail').map(c => c.id);

/**
 * States the game can produce. A resumed obstacle has just been cleared, so its gate is open or the
 * cascade disabled. Excluded on purpose: standing on the Dragon (ILE-02) and a gate reached from a
 * crossroads (ILE-03), two legacy dead ends fixed by the rewrite.
 */
function* states() {
  const gateSets = [[], ...GATES.map(g => [g]), GATES];
  for (const here of BOARD_CASES) {
    if (here.type === 'Dragon') continue;
    for (const portails_ouverts of gateSets) for (const cascade_desactivee of [false, true]) {
      const data = { portails_ouverts, cascade_desactivee, gagnants_dragon: [] };
      yield { here, data, resume: null, direction: null };
      if (here.type === 'Intersection') for (const direction of here.next) yield { here, data, resume: 'intersection', direction };
      if (here.type !== 'Intersection' && GATES.includes(here.next[0]) && portails_ouverts.includes(here.next[0])) yield { here, data, resume: 'portail', direction: null };
      if (here.type === 'Liane') yield { here, data, resume: 'liane', direction: null };
      if (here.type === 'Cascade' && cascade_desactivee) yield { here, data, resume: 'cascade', direction: null };
    }
  }
}

test('island movement stops and resumes exactly like the frozen legacy loop', () => {
  let compared = 0;
  for (const s of states()) for (let remaining = 1; remaining <= 20; remaining++) {
    const current = walk({ position: s.here.id, remaining, resume: s.resume, direction: s.direction, data: s.data });
    const joueur = { position: s.here.id, cases_restantes: remaining, temp_choix_direction: s.direction };
    const old = legacy.walk({ joueur, plateau: { mode_data: JSON.parse(JSON.stringify(s.data)) }, getCase, alreadyHandledOnStart: s.resume ? [...LEGACY_RESUME[s.resume]] : [] });
    const expected = { position: old.position, remaining: old.remaining, stop: old.interruption ? old.interruption.type : null,
      ...(old.interruption && old.interruption.targetGateId ? { target: old.interruption.targetGateId } : {}) };
    assert.deepEqual(current, expected, JSON.stringify({ from: s.here.id, resume: s.resume, direction: s.direction, data: s.data, remaining }));
    compared++;
  }
  assert.ok(compared > 10000);
});

test('ILE-03: after a crossroads, a cleared gate keeps the chosen direction (legacy asked the crossroads again)', () => {
  const crossroads = BOARD_CASES.find(c => c.type === 'Intersection' && GATES.includes(c.next[1]));
  const data = { portails_ouverts: [crossroads.next[1]], cascade_desactivee: false, gagnants_dragon: [] };
  const current = walk({ position: crossroads.id, remaining: 3, resume: 'portail', direction: crossroads.next[1], data });
  assert.equal(current.remaining, 0);
  assert.ok(current.position > crossroads.next[1]);
  const old = legacy.walk({ joueur: { position: crossroads.id, cases_restantes: 3, temp_choix_direction: crossroads.next[1] },
    plateau: { mode_data: data }, getCase, alreadyHandledOnStart: ['portail'] });
  assert.equal(old.interruption.type, 'intersection');
  assert.equal(findCase(crossroads.id).type, 'Intersection');
});
