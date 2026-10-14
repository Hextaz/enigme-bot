const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Joueur, sequelize } = require('../src/db/models');
test('a direction choice survives reloading the player', async () => {
  await sequelize.sync({ force: true });
  const player = await Joueur.create({ discord_id: 'direction' });
  player.temp_choix_direction = 46;
  await player.save();
  assert.equal((await Joueur.findByPk('direction')).temp_choix_direction, 46);
  await sequelize.close();
});
