const test = require('node:test');
const assert = require('node:assert/strict');
const { Joueur, Plateau, sequelize } = require('../src/db/models');
const turn = require('../src/gamemodes/mario_party/turn');

const actor = { id: 'thief', username: 'thief' };
const pending = (type, position) => ({ type, case: position, token: 't' });

test('Boo: failure saving the target rolls back both balances (DB-01)', async () => {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 1, enigme_status: 'finished' });
  await Joueur.bulkCreate([
    { discord_id: 'thief', pieces: 60, position: 52, action_en_attente: pending('boo', 52) },
    { discord_id: 'victim', pieces: 20, etoiles: 1 },
  ]);
  Joueur.addHook('beforeUpdate', 'fail-target', player => {
    if (player.discord_id === 'victim') throw new Error('Injected SQLite failure');
  });
  try { await assert.rejects(turn.booSteal(actor, 'victim', 'etoile'), /Injected/); }
  finally { Joueur.removeHook('beforeUpdate', 'fail-target'); }
  const thief = await Joueur.findByPk('thief');
  const victim = await Joueur.findByPk('victim');
  assert.equal(thief.pieces, 60, 'the debit must roll back');
  assert.equal(thief.etoiles, 0);
  assert.equal(victim.etoiles, 1);
  assert.equal(thief.action_en_attente.type, 'boo', 'the choice stays pending');
});

test('Star: failure saving the board rolls back the purchase (DB-02)', async () => {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 1, enigme_status: 'finished', position_etoile: 2 });
  await Joueur.create({ discord_id: 'thief', pieces: 30, position: 2, action_en_attente: pending('etoile', 2) });
  Plateau.addHook('beforeUpdate', 'fail-board', () => { throw new Error('Injected board failure'); });
  try { await assert.rejects(turn.resolveStar(actor, true), /Injected/); }
  finally { Plateau.removeHook('beforeUpdate', 'fail-board'); }
  const buyer = await Joueur.findByPk('thief');
  assert.equal(buyer.pieces, 30, 'the debit must roll back');
  assert.equal(buyer.etoiles, 0);
  assert.equal((await Plateau.findByPk(1)).position_etoile, 2);
});

test.after(() => sequelize.close());
