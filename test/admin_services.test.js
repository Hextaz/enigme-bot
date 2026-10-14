const test = require('node:test');
const assert = require('node:assert/strict');
const { Joueur, Plateau, TourSnapshot, sequelize } = require('../src/db/models');
const admin = require('../src/services/admin');
const turn = require('../src/gamemodes/mario_party/turn');

const code = expected => error => error.code === expected;

test('starting a season resets every player and every per-season board field, including the island data', async () => {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 22, enigme_status: 'season_ended', enigme_reponse: 'old', enigme_gagnants: [{ discord_id: 'x' }],
    game_mode: 'ile_defis', game_map: 'board_game_island', mode_data: { portails_ouverts: [20], gagnants_dragon: ['x'], paris_ouverts: true } });
  await Joueur.create({ discord_id: 'x', etoiles: 4 });
  await TourSnapshot.create({ discord_id: 'x', tour: 22 });
  const { star } = await admin.startSeason('mario_party', 'standard', 'night_sky', () => 0);
  const plateau = await Plateau.findByPk(1);
  assert.deepEqual(plateau.mode_data, {});
  assert.deepEqual([plateau.tour, plateau.enigme_status, plateau.enigme_reponse, plateau.game_mode], [0, 'finished', null, 'mario_party']);
  assert.deepEqual(plateau.enigme_gagnants, []);
  assert.equal(plateau.position_etoile, star);
  const hidden = Object.values(plateau.blocs_caches);
  assert.equal(new Set([star, ...hidden]).size, 5, 'star and hidden blocks never share a case');
  assert.equal(await Joueur.count(), 0);
  assert.equal(await TourSnapshot.count(), 0);
});

test('a season start that fails half-way changes nothing', async () => {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 12, enigme_status: 'finished' });
  await Joueur.create({ discord_id: 'keep', etoiles: 3 });
  Plateau.addHook('beforeUpdate', 'fail-start', () => { throw new Error('Injected start failure'); });
  try { await assert.rejects(admin.startSeason('mario_party', 'standard', 'night_sky'), /Injected/); }
  finally { Plateau.removeHook('beforeUpdate', 'fail-start'); }
  assert.equal((await Joueur.findByPk('keep')).etoiles, 3);
  assert.equal((await Plateau.findByPk(1)).tour, 12);
  await assert.rejects(admin.startSeason('mario_party', 'standard', 'unknown_map'), code('PARAMS'));
});

test('teleporting validates the case against the active map and cancels a pending choice', async () => {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 2, enigme_status: 'finished' });
  await Joueur.create({ discord_id: 'p', position: 3, cases_restantes: 2, action_en_attente: { type: 'boo', case: 3, token: 't' } });
  await assert.rejects(admin.setPosition('p', 60), code('CASE'), 'Night Sky has 58 cases');
  await admin.setPosition('p', 58);
  const p = await Joueur.findByPk('p');
  assert.deepEqual([p.position, p.cases_restantes, p.action_en_attente], [58, 0, null]);
  await assert.rejects(admin.setTour(31), code('TOUR'));
  await assert.rejects(admin.adjustResource('ghost-user', 'pieces', -3), code('PLAYER_MISSING'));
  assert.equal(await admin.adjustResource('p', 'pieces', -3), 0, 'never below zero');
});

test('undoing a turn restores the player, the board and the other players from the pre-roll snapshot', async () => {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 4, enigme_status: 'finished', position_etoile: 30 });
  await Joueur.create({ discord_id: 'p', position: 15, a_le_droit_de_jouer: true, pieces: 10 });
  await Joueur.create({ discord_id: 'q', position: 5, pieces: 30 });
  await turn.startTurn({ id: 'p', username: 'p' }, { random: () => 0.05, now: new Date('2026-10-07T12:00:00Z') });
  assert.notEqual((await Joueur.findByPk('p')).position, 15);
  await admin.undoTurn('p');
  const p = await Joueur.findByPk('p');
  assert.deepEqual([p.position, p.pieces, p.a_le_droit_de_jouer, p.action_en_attente], [15, 10, true, null]);
  assert.equal(await TourSnapshot.count(), 0);
  await assert.rejects(admin.undoTurn('p'), code('NO_SNAPSHOT'));
});

test('items given by the MJ must exist in the active catalog and respect the inventory limit', async () => {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 2, enigme_status: 'finished' });
  await assert.rejects(admin.giveItem('p', 'Objet inventé'), code('ITEM'));
  for (let n = 0; n < 3; n++) await admin.giveItem('p', '🍄 Champignon');
  await assert.rejects(admin.giveItem('p', '🍄 Champignon'), code('FULL'));
  await admin.removeItem('p', '🍄 Champignon');
  assert.equal((await Joueur.findByPk('p')).inventaire.length, 2);
});

test.after(() => sequelize.close());
