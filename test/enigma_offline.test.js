const test = require('node:test');
const assert = require('node:assert/strict');
const { Joueur, Plateau, sequelize } = require('../src/db/models');
const { triggerEnigmaEnd } = require('../src/game/enigma');
test('closing an enigma commits player eligibility even when Discord is unavailable', async () => {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 1, enigme_status: 'active' });
  await Joueur.bulkCreate([{ discord_id: 'active', a_le_droit_de_jouer: false }, { discord_id: 'ghost', est_fantome: true, a_le_droit_de_jouer: false }]);
  await triggerEnigmaEnd({ channels: { fetch: async () => null } });
  assert.equal((await Joueur.findByPk('active')).a_le_droit_de_jouer, true);
  assert.equal((await Joueur.findByPk('ghost')).a_le_droit_de_jouer, false);
  assert.equal((await Plateau.findByPk(1)).enigme_status, 'finished');
  await sequelize.close();
});
