const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMode, validateBoard } = require('../src/gamemodes/mode-interface');
const registry = require('../src/gamemodes/registry');
const { BoundedCache } = require('../src/utils/remote-image');
test('all registered modes have complete contracts and valid board graphs', () => {
  for (const mode of registry.getAllModes()) {
    validateMode(mode);
    for (const map of Object.values(mode.maps)) validateBoard(mode.getBoardCases(map.id));
    const interactions = mode.getInteractions();
    for (const method of ['handle', 'renderPending', 'rearmTimers']) assert.equal(typeof interactions[method], 'function');
    for (const method of ['close', 'announce']) assert.equal(typeof mode.getEndgame()[method], 'function');
  }
});
test('incomplete modes and dangling edges fail at startup', () => {
  assert.throws(() => validateMode({ name: 'broken' }), /Méthode/);
  assert.throws(() => validateBoard([{ id: 1, x: 0, y: 0, type: 'start', next: [2] }]), /Case invalide/);
  assert.throws(() => registry.getActiveMode({ game_mode: 'removed' }), /Mode inconnu/);
});
test('avatar cache expires and evicts the least recently used entry', () => {
  let now = 0;
  const cache = new BoundedCache(2, 10, () => now);
  cache.set('a', 1); cache.set('b', 2); cache.get('a'); cache.set('c', 3);
  assert.equal(cache.get('b'), undefined);
  now = 11;
  assert.equal(cache.get('a'), undefined);
});
