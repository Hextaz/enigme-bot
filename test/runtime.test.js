const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Events } = require('discord.js');
const { client } = require('../src/index');
const { sequelize } = require('../src/db/models');
test('compiled entry registers actual Discord events without connecting when imported', () => {
  assert.ok(client.listenerCount(Events.ShardDisconnect) > 0);
  assert.ok(client.listenerCount(Events.ShardResume) > 0);
  assert.ok(client.commands.has('jouer'));
  assert.equal(client.isReady(), false);
  assert.ok(fs.existsSync(path.join(__dirname, '../src/gamemodes/mario_party/maps/night_sky/plateau.png')));
});
test.after(async () => { await client.destroy(); await sequelize.close(); });
