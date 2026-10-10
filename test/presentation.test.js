const test = require('node:test');
const assert = require('node:assert/strict');
const { withGameLock, afterGameAction, getLockedUser, PresentationError } = require('../src/game/transaction');

test('slow publication releases the game lock, preserves order and the captured state', async () => {
  let unblock;
  const gate = new Promise(resolve => { unblock = resolve; });
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const sent = [];
  let state = 0;
  const first = withGameLock('a', async () => {
    state = 1;
    const snapshot = state;
    await afterGameAction(async () => {
      assert.equal(getLockedUser(), null);
      started();
      await gate;
      sent.push(snapshot);
    });
  });
  await ready;
  const second = withGameLock('b', async () => {
    state = 2;
    await afterGameAction(async () => { sent.push(2); });
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state, 2, 'the second mutation must finish while the first send is blocked');
  assert.deepEqual(sent, []);
  unblock();
  await Promise.all([first, second]);
  assert.deepEqual(sent, [1, 2]);
});

test('a failed send does not skip the private prompt or poison following publications', async () => {
  const sent = [];
  await assert.rejects(withGameLock('a', async () => {
    await afterGameAction(async () => { throw new Error('Discord unavailable'); });
    await afterGameAction(async () => { sent.push('prompt'); });
  }), error => error instanceof PresentationError && error.cause.message === 'Discord unavailable');
  await withGameLock('b', async () => afterGameAction(async () => { sent.push('next'); }));
  assert.deepEqual(sent, ['prompt', 'next']);
  assert.equal(getLockedUser(), null);
});

test('nested services collect effects but never publish inside the parent lock', async () => {
  let published = false;
  await withGameLock('outer', async () => {
    await withGameLock('inner', async () => afterGameAction(async () => { published = true; }));
    assert.equal(published, false);
  });
  assert.equal(published, true);
});

test('an aborted action discards its queued presentation', async () => {
  await assert.rejects(withGameLock('a', async () => {
    await afterGameAction(async () => assert.fail('must not announce a failed action'));
    throw new Error('rollback');
  }), /rollback/);
  assert.equal(getLockedUser(), null);
});
