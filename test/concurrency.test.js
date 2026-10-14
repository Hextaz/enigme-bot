const test = require('node:test');
const assert = require('node:assert/strict');
const { mapConcurrent } = require('../src/utils/concurrency');
test('avatar preparation overlaps at most four loads and retains player order', async () => {
  let active = 0, maximum = 0;
  const players = Array.from({ length: 13 }, (_, i) => i);
  const result = await mapConcurrent(players, 4, async id => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return id * 2;
  });
  assert.equal(maximum, 4);
  assert.deepEqual(result, players.map(id => id * 2));
  assert.deepEqual(await mapConcurrent([], 4, async () => assert.fail()), []);
  await assert.rejects(mapConcurrent(players, 0, async () => {}), RangeError);
});
