const test = require('node:test');
const assert = require('node:assert/strict');
const { Joueur, Plateau, sequelize } = require('../src/db/models');
const turn = require('../src/gamemodes/mario_party/turn');

const actor = { id: 'buyer', username: 'buyer' };
const atShop = { position: 23, action_en_attente: { type: 'boutique', case: 23, token: 't' } };

test('ECO-03: an old shop button cannot buy an item no longer offered', async () => {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 2, enigme_status: 'finished' });
  await Joueur.create({ discord_id: 'buyer', pieces: 20, boutique_du_jour: [], ...atShop });
  await assert.rejects(turn.buyFromShop(actor, 'champignon'), error => error.code === 'STALE_SHOP');
  const player = await Joueur.findByPk('buyer');
  assert.equal(player.pieces, 20);
  assert.deepEqual(player.inventaire, []);
});

test('INV-02: replacement rejects an inventory index outside the inventory', async () => {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 2, enigme_status: 'finished' });
  await Joueur.create({ discord_id: 'buyer', pieces: 20, boutique_du_jour: ['champignon'], inventaire: ['A', 'B', 'C'], ...atShop });
  await assert.rejects(turn.buyFromShop(actor, 'champignon', 7), error => error.code === 'SLOT');
  const player = await Joueur.findByPk('buyer');
  assert.equal(player.pieces, 20);
  assert.deepEqual(player.inventaire, ['A', 'B', 'C']);
});

test.after(() => sequelize.close());
