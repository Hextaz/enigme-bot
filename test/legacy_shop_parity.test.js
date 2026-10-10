const test = require('node:test');
const assert = require('node:assert/strict');
const legacyShop = require('./fixtures/legacy-shop');
const { ITEMS: LEGACY_ITEMS } = require('./fixtures/legacy-items');
const { Joueur, sequelize } = require('../src/db/models');
const { prepareShop } = require('../src/gamemodes/mario_party/shop');

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

// Distinct ranks: p0 leads, p3 is last. The lower half starts at index 2.
const PLAYERS = [
  { discord_id: 'p0', etoiles: 3, pieces: 10 }, { discord_id: 'p1', etoiles: 2, pieces: 40 },
  { discord_id: 'p2', etoiles: 2, pieces: 5 }, { discord_id: 'p3', etoiles: 0, pieces: 30 },
];

function legacyGenerate(activeId, random, isSundayToday) {
  const rows = PLAYERS.map(p => ({ ...p, boutique_du_jour: [] }));
  const Joueur = {
    findAll: async () => [...rows].sort((a, b) => b.etoiles - a.etoiles || b.pieces - a.pieces),
    findByPk: async id => ({ ...rows.find(r => r.discord_id === id), save: async () => {} }),
  };
  return legacyShop({ Joueur, ITEMS: LEGACY_ITEMS, random, isSundayToday }).generateShop(activeId);
}

test('daily shop offers match the frozen legacy draw for every rank and weekday', async () => {
  await sequelize.sync({ force: true });
  for (const player of PLAYERS) await Joueur.create(player);
  for (const isSunday of [false, true]) for (const { discord_id } of PLAYERS) {
    for (let seed = 1; seed <= 400; seed++) {
      const joueur = await Joueur.findByPk(discord_id);
      joueur.boutique_du_jour = [];
      const current = await sequelize.transaction(t => prepareShop(joueur, t, seeded(seed), isSunday));
      const old = await legacyGenerate(discord_id, seeded(seed), isSunday);
      assert.deepEqual(current.map(i => i.id), old.map(i => i.id), `${discord_id} seed ${seed} sunday=${isSunday}`);
    }
  }
});

test('a shop already drawn today is offered again unchanged', async () => {
  await sequelize.sync({ force: true });
  const joueur = await Joueur.create({ discord_id: 'p0', boutique_du_jour: ['miroir', 'cle'] });
  const offer = await sequelize.transaction(t => prepareShop(joueur, t, () => 0, false));
  assert.deepEqual(offer.map(i => i.id), ['miroir', 'cle']);
});

test.after(() => sequelize.close());
