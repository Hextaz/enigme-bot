const test = require('node:test');
const assert = require('node:assert/strict');
const { Joueur, Plateau, sequelize } = require('../src/db/models');
const { applyLanding } = require('../src/gamemodes/mario_party/landing');
async function setup(pieces = 10, tour = 1) {
  await sequelize.sync({ force: true });
  const plateau = await Plateau.create({ id: 1, tour, enigme_status: 'finished' });
  const joueur = await Joueur.create({ discord_id: 'one', position: 16, pieces });
  await Joueur.create({ discord_id: 'two', pieces: 30 });
  return { joueur, plateau };
}
function land(joueur, plateau, type, random = () => 0) {
  return sequelize.transaction(transaction => applyLanding({ joueur, plateau, caseArrivee: { id: 16, type, x: 0, y: 0, name: type, next: [] },
    actor: { id: 'one', username: 'One' }, trap: null, chooseStar: async () => 3, random }, transaction));
}
test('red spaces floor the balance at zero and late blue spaces double the reward', async () => {
  let { joueur, plateau } = await setup(2);
  await land(joueur, plateau, 'Rouge');
  assert.equal((await joueur.reload()).pieces, 0);
  ({ joueur, plateau } = await setup(2, 26));
  await land(joueur, plateau, 'Bleue');
  assert.equal((await joueur.reload()).pieces, 8);
});
test('landing returns economic facts independently of Discord formatting', async () => {
  const { joueur, plateau } = await setup(2, 26);
  const events = await land(joueur, plateau, 'Bleue');
  assert.deepEqual(events, [{ kind: 'blue_coins', actorName: 'One', amount: 6, playerCoins: 8 }]);
});
test('Bowser redistribution includes a hidden block reward earned on the same landing', async () => {
  const { joueur, plateau } = await setup();
  plateau.blocs_caches = { pieces_20: 16 };
  await plateau.save();
  await land(joueur, plateau, 'Bowser', () => 0.5);
  assert.equal((await joueur.reload()).pieces, 30);
  assert.equal((await Joueur.findByPk('two')).pieces, 30);
});
test('landing rolls back all targets and hidden blocks if the final player save fails', async () => {
  const { joueur, plateau } = await setup();
  plateau.blocs_caches = { pieces_20: 16 };
  await plateau.save();
  Joueur.addHook('beforeUpdate', 'fail-second', player => {
    if (player.discord_id === 'two') throw new Error('Injected landing failure');
  });
  try { await assert.rejects(land(joueur, plateau, 'Bowser', () => 0.5), /Injected/); }
  finally { Joueur.removeHook('beforeUpdate', 'fail-second'); }
  assert.equal((await joueur.reload()).pieces, 10);
  assert.equal((await Joueur.findByPk('two')).pieces, 30);
  assert.deepEqual((await plateau.reload()).blocs_caches, { pieces_20: 16 });
});
test.after(() => sequelize.close());
