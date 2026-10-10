const test = require('node:test');
const assert = require('node:assert/strict');
const legacy = require('./fixtures/legacy-rules');
const { Joueur, Plateau, sequelize } = require('../src/db/models');
const { endgame } = require('../src/gamemodes/mario_party/endgame');

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('the two bonus star categories are drawn exactly like the legacy shuffle', async () => {
  await sequelize.sync({ force: true });
  const plateau = await Plateau.create({ id: 1, tour: 30, enigme_status: 'finished' });
  await Joueur.create({ discord_id: 'p0' });
  for (let seed = 1; seed <= 500; seed++) {
    const players = await Joueur.findAll();
    const summary = await sequelize.transaction(t => endgame.close(players, plateau, t, seeded(seed)));
    assert.deepEqual(summary.bonus.map(b => b.name), legacy.bonusPick(seeded(seed)), `seed ${seed}`);
  }
});

test.after(() => sequelize.close());
