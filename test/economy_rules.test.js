const test = require('node:test');
const assert = require('node:assert/strict');
const { Joueur, Plateau, sequelize } = require('../src/db/models');
const turn = require('../src/gamemodes/mario_party/turn');

const actor = { id: 'buyer', username: 'buyer' };
const atShop = { position: 23, action_en_attente: { type: 'boutique', case: 23, token: 't' } };
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);
async function setup(player, board = {}) {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 3, enigme_status: 'finished', position_etoile: 30, ...board });
  await Joueur.create({ discord_id: 'buyer', ...player });
}

test('ECO-01: an item costing more than the balance is refused without writing', async () => {
  await setup({ ...atShop, pieces: 4, boutique_du_jour: ['champignon'] });
  await rejects(turn.buyFromShop(actor, 'champignon'), 'FUNDS');
  const player = await Joueur.findByPk('buyer');
  assert.equal(player.pieces, 4);
  assert.deepEqual(player.inventaire, []);
  assert.deepEqual(player.boutique_du_jour, ['champignon']);
});

test('INV-01: a full inventory asks for a replacement, then accepts the purchase replacing an item', async () => {
  await setup({ ...atShop, pieces: 20, boutique_du_jour: ['champignon'], inventaire: ['A', 'B', 'C'] });
  const full = await turn.buyFromShop(actor, 'champignon');
  assert.equal(full.purchase.kind, 'needs_replacement');
  assert.deepEqual((await Joueur.findByPk('buyer')).inventaire, ['A', 'B', 'C']);
  const { purchase } = await turn.buyFromShop(actor, 'champignon', 1);
  assert.equal(purchase.droppedItem, 'B');
  const player = await Joueur.findByPk('buyer');
  assert.equal(player.pieces, 15);
  // As in the legacy flow, the purchase takes the dropped item's slot.
  assert.deepEqual(player.inventaire, ['A', '🍄 Champignon', 'C']);
  assert.deepEqual(player.boutique_du_jour, []);
});

test('INV-01: a pack needing more free slots than available is refused', async () => {
  await setup({ ...atShop, pieces: 40, boutique_du_jour: ['pack_promo_1'], inventaire: ['A', 'B'] });
  await rejects(turn.buyFromShop(actor, 'pack_promo_1'), 'FULL');
  assert.equal((await Joueur.findByPk('buyer')).pieces, 40);
});

test('ECO-02: a star purchase is refused below 20 coins, without a pending star, or after the season', async () => {
  await setup({ pieces: 19, position: 2, action_en_attente: { type: 'etoile', case: 2, token: 't' } }, { position_etoile: 2 });
  await rejects(turn.resolveStar(actor, true), 'FUNDS');
  await Joueur.update({ pieces: 50, action_en_attente: null }, { where: { discord_id: 'buyer' } });
  await rejects(turn.resolveStar(actor, true), 'STALE');
  await Plateau.update({ enigme_status: 'season_ended' }, { where: { id: 1 } });
  await rejects(turn.resolveStar(actor, true), 'CLOSED');
  assert.equal((await Joueur.findByPk('buyer')).etoiles, 0);
  assert.equal((await Plateau.findByPk(1)).position_etoile, 2);
});

test.after(() => sequelize.close());
