const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePending, parseIslandBoardData } = require('../src/domain/persisted');
const { ids, selectedValue } = require('../src/discord/custom-ids');

test('pending JSON validates mode, kind and payload without rewriting the stored format', () => {
  const mario = { type: 'boo', case: 52, token: 'choice' };
  assert.deepEqual(parsePending(mario, 'mario_party'), mario);
  const gate = { type: 'portail', case: 14, token: 'gate', target: 16 };
  assert.deepEqual(parsePending(gate, 'ile_defis'), gate);
  assert.throws(() => parsePending(mario, 'ile_defis'), /attente/);
  for (const invalid of [{}, { ...mario, type: 'unknown' }, { ...mario, token: 42 }, { ...gate, target: '16' }]) {
    assert.throws(() => parsePending(invalid, 'ile_defis'), /attente/);
  }
  assert.equal(parsePending(null, 'mario_party'), null);
});

test('old empty island data is valid, malformed known fields are rejected instead of silently erased', () => {
  assert.deepEqual(parseIslandBoardData({}), { portails_ouverts: [], cascade_desactivee: false, gagnants_dragon: [] });
  assert.throws(() => parseIslandBoardData({ portails_ouverts: [16, '17'] }), /portails/);
  assert.throws(() => parseIslandBoardData({ cascade_desactivee: 'false' }), /cascade/);
});

test('custom ids round-trip keys with underscores and accept legacy proposal suffixes', () => {
  const item = { key: 'DE_PIPE', index: 2 };
  assert.deepEqual(ids.use.decode(ids.use.encode(item)), item);
  assert.deepEqual(ids.judge.decode('reponse_good_123456_un_mot_avec_tirets'), { action: 'good', userId: '123456' });
  assert.throws(() => ids.use.decode('use_DE_PIPE_NaN'), /Action/);
  assert.throws(() => ids.adminConfirm.decode('admin_start_confirm::mario_party'), /Action/);
  assert.throws(() => selectedValue([]), /sélection/);
});
