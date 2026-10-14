const test = require('node:test');
const assert = require('node:assert/strict');
const { handleInteraction } = require('../src/discord/interaction');
const { getLockedUser } = require('../src/game/transaction');
function command() {
  const calls = [];
  return { calls, user: { id: 'one' }, commandName: 'deviner', deferred: false, replied: false,
    isRepliable: () => true, isMessageComponent: () => false, isChatInputCommand: () => true, isButton: () => false,
    deferReply: async function () { calls.push('ack'); this.deferred = true; },
    reply: async function () { calls.push('reply'); this.replied = true; },
    editReply: async function () { calls.push('edit'); this.replied = true; },
    followUp: async () => { calls.push('follow'); },
  };
}
test('acknowledgment precedes dispatch and handlers receive the original interaction', async () => {
  const i = command();
  await handleInteraction(i, async adapted => {
    assert.deepEqual(i.calls, ['ack']);
    assert.equal(getLockedUser(), 'one');
    assert.equal(adapted, i);
    await adapted.editReply({ content: 'ok' });
  });
  assert.deepEqual(i.calls, ['ack', 'edit']);
  assert.equal(getLockedUser(), null);
});
test('expired acknowledgments never run the business handler', async () => {
  const i = command();
  i.deferReply = async () => { throw Object.assign(new Error('expired'), { code: 10062 }); };
  await handleInteraction(i, async () => assert.fail('must not mutate'));
  assert.equal(getLockedUser(), null);
});
test('a player cannot use another player’s component', async () => {
  const i = command(); i.isMessageComponent = () => true;
  i.message = { interactionMetadata: { user: { id: 'someone-else' } } };
  i.customId = 'buy_champignon#0';
  await handleInteraction(i, async () => assert.fail('unauthorized dispatch'));
  assert.deepEqual(i.calls, ['reply']);
});
test('MJ response controls are rejected for non-MJ users', async () => {
  const i = command(); i.customId = 'reponse_good_one_answer';
  await handleInteraction(i, async () => assert.fail('unauthorized dispatch'));
  assert.deepEqual(i.calls, ['reply']);
});
