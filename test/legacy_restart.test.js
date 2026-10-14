const test = require('node:test');
const assert = require('node:assert/strict');
const { Joueur, Plateau, sequelize } = require('../src/db/models');
const mario = require('../src/gamemodes/mario_party/turn');
const ile = require('../src/gamemodes/ile_defis/turn');

// Before migration 003, a pending choice only lived in memory: a restart left the player
// on the case that asked for it, with steps left and nothing persisted.
async function setup(board, ...players) {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 5, enigme_status: 'finished', position_etoile: 30, ...board });
  for (const player of players) await Joueur.create({ cases_restantes: 3, ...player });
}
const pendingOf = async id => (await Joueur.findByPk(id)).action_en_attente;

test('RESTART-01: Mario players stopped by the legacy version get their choice back', async () => {
  await setup({}, { discord_id: 'star', position: 30 }, { discord_id: 'shop', position: 23 }, { discord_id: 'boo', position: 52 },
    { discord_id: 'walking', position: 2, cases_restantes: 0 }, { discord_id: 'crossroads', position: 6 });
  assert.deepEqual((await mario.recoverLegacyPending()).sort(), ['boo', 'shop', 'star']);
  assert.equal((await pendingOf('star')).type, 'etoile');
  assert.equal((await pendingOf('shop')).type, 'boutique');
  assert.ok((await Joueur.findByPk('shop')).boutique_du_jour.length > 0, 'the shop offer is drawn');
  assert.deepEqual([(await pendingOf('boo')).type, (await pendingOf('boo')).case], ['boo', 52]);
  assert.equal(await pendingOf('walking'), null);
  assert.equal(await pendingOf('crossroads'), null, 'a crossroads is asked again by "Continuer"');
  assert.deepEqual(await mario.recoverLegacyPending(), [], 'idempotent');
});

test('RESTART-01: a closed shop on the last turn is not offered again', async () => {
  await setup({ tour: 30 }, { discord_id: 'shop', position: 23 });
  assert.deepEqual(await mario.recoverLegacyPending(), []);
  assert.equal(await pendingOf('shop'), null);
});

test('RESTART-02: island players stopped by the legacy version get their obstacle back', async () => {
  await setup({ game_mode: 'ile_defis', game_map: 'board_game_island', position_etoile: 0, mode_data: { portails_ouverts: [], cascade_desactivee: false, gagnants_dragon: [] } },
    { discord_id: 'cross', position: 14 }, { discord_id: 'vine', position: 12 }, { discord_id: 'cascade', position: 38 },
    { discord_id: 'gate', position: 19 }, { discord_id: 'lost', position: 2 });
  assert.deepEqual((await ile.recoverLegacyPending()).sort(), ['cascade', 'cross', 'gate', 'lost', 'vine']);
  assert.equal((await pendingOf('cross')).type, 'intersection');
  assert.equal((await pendingOf('vine')).type, 'liane');
  assert.equal((await pendingOf('cascade')).type, 'cascade');
  assert.deepEqual([(await pendingOf('gate')).type, (await pendingOf('gate')).target], ['portail', 20]);
  const lost = await Joueur.findByPk('lost');
  assert.deepEqual([lost.action_en_attente, lost.cases_restantes], [null, 0], 'no obstacle: the move ends instead of blocking the player');
});

test.after(() => sequelize.close());
