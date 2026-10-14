const test = require('node:test');
const assert = require('node:assert/strict');
const { getLockedUser, forceUnlock, withGameLock, withScheduledLock, GameBusyError } = require('../src/game/transaction');

test.afterEach(() => forceUnlock());
test('a second interactive action, even from the same user, is refused while one runs', async () => {
  let release;
  const first = withGameLock('one', () => new Promise(resolve => { release = resolve; }));
  await assert.rejects(withGameLock('one', async () => 'second'), GameBusyError);
  await assert.rejects(withGameLock('two', async () => 'other'), GameBusyError);
  assert.equal(getLockedUser(), 'one');
  release();
  await first;
  assert.equal(await withGameLock('two', async () => 'free'), 'free');
});
test('nested calls inside the same operation reuse the lock', async () => {
  const value = await withGameLock('one', () => withGameLock('one', async () => getLockedUser()));
  assert.equal(value, 'one');
  assert.equal(getLockedUser(), null);
});

test('a failed action releases its lock and scheduled work waits for the active action', async () => {
  const order = [];
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const action = withGameLock('one', async () => { order.push('start'); await hold; order.push('end'); });
  const scheduled = withScheduledLock('cron', async () => { order.push('cron'); });
  assert.deepEqual(order, ['start']);
  release();
  await Promise.all([action, scheduled]);
  assert.deepEqual(order, ['start', 'end', 'cron']);
  await assert.rejects(withGameLock('one', async () => { throw new Error('fail'); }), /fail/);
  assert.equal(getLockedUser(), null);
});
test('a timer scheduled within an action cannot inherit its ownership', async () => {
  let scheduled;
  const order = [];
  await withGameLock('one', async () => {
    scheduled = withScheduledLock('timer', async () => { order.push('timer'); });
    await Promise.resolve();
    assert.deepEqual(order, []);
    order.push('done');
  });
  await scheduled;
  assert.deepEqual(order, ['done', 'timer']);
});
test('a long operation remains locked after the diagnostic timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish;
  const held = new Promise(resolve => { finish = resolve; });
  const task = withGameLock('one', () => held);
  t.mock.timers.tick(51000);
  await assert.rejects(withGameLock('two', async () => {}), GameBusyError);
  finish();
  await task;
  assert.equal(getLockedUser(), null);
});
