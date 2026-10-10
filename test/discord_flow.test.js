const test = require('node:test');
const assert = require('node:assert/strict');
const { Collection, MessageFlags } = require('discord.js');
const { Joueur, Plateau, sequelize } = require('../src/db/models');
const { createDispatcher } = require('../src/discord/router');
const { handleInteraction } = require('../src/discord/interaction');
const { clearAllPendingTimers } = require('../src/discord/pending-timers');
const jouer = require('../src/commands/jouer');

const sent = [];
// Users cannot be fetched: the board falls back to initials, without network access.
const client = {
  channels: { fetch: async () => ({ send: async payload => { sent.push(payload); } }) },
  users: { fetch: async () => { throw new Error('offline'); }, cache: new Map() },
};
const commands = new Collection([['jouer', jouer]]);
const dispatch = createDispatcher(commands);

function component(customId, values) {
  const calls = [];
  return {
    calls, customId, values, client, deferred: true, replied: false,
    user: { id: 'p1', username: 'P1' },
    isChatInputCommand: () => false, isModalSubmit: () => false,
    isButton: () => !values, isStringSelectMenu: () => !!values,
    editReply: async payload => { calls.push(['edit', payload]); },
    followUp: async payload => { calls.push(['follow', payload]); },
  };
}
function components(payload) {
  return payload.components?.flatMap(c => { const json = c.toJSON ? c.toJSON() : c; return json.type === 17 ? json.components : [json]; }) ?? [];
}
const content = payload => payload.content ?? components(payload).filter(c => c.type === 10).map(c => c.content).join('\n');
const contents = calls => calls.map(([, payload]) => content(payload));

test('a full star stop through the real router: prompt, public board update, purchase and resumed walk', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-07T12:00:00Z') }); // a Wednesday
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 3, enigme_status: 'finished', position_etoile: 10 });
  await Joueur.create({ discord_id: 'p1', a_le_droit_de_jouer: true, position: 8, pieces: 30 });
  const original = Math.random;
  Math.random = () => 0.25; // die = 3
  try {
    const roll = component('lancer_de');
    await dispatch(roll);
    const prompt = roll.calls.at(-1)[1];
    assert.ok(roll.calls.every(([kind]) => kind === 'edit'), 'gameplay must reuse one private message');
    assert.match(content(prompt), /l'Étoile/);
    assert.equal(prompt.flags, MessageFlags.IsComponentsV2);
    assert.equal(components(prompt).find(c => c.type === 1).components[0].custom_id, 'acheter_etoile');
    assert.match(sent.at(-1).content, /s'arrête en chemin sur la case \*\*10 \(Étoile\)\*\*/);
    assert.ok(sent.at(-1).files.length, 'the public message carries the board image');

    const buy = component('acheter_etoile');
    await dispatch(buy);
    assert.match(contents(buy.calls).join('\n'), /Tu as acheté une Étoile/);
    const p1 = await Joueur.findByPk('p1');
    // 30 - 20 for the star, then the Malchance case 11 takes 10 (random 0.25).
    assert.deepEqual([p1.etoiles, p1.pieces, p1.position, p1.action_en_attente], [1, 0, 11, null]);
    await assert.rejects(dispatch(component('acheter_etoile')), error => error.code === 'STALE');
  } finally {
    Math.random = original;
    clearAllPendingTimers();
  }
});

test('/jouer shows a pending choice again, so a restart or a lost message never blocks the player', async () => {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 3, enigme_status: 'finished' });
  await Joueur.create({ discord_id: 'p1', position: 52, action_en_attente: { type: 'boo', case: 52, token: 't' } });
  let reply;
  await jouer.execute({ user: { id: 'p1' }, client, editReply: async payload => { reply = payload; } });
  assert.match(content(reply), /Un choix t'attend/);
  const ids = components(reply).filter(c => c.type === 1).flatMap(row => row.components.map(c => c.custom_id));
  assert.ok(ids.includes('boo_pieces') && ids.includes('boo_annuler'));
  assert.ok(!ids.includes('lancer_de'));
});

test('the boundary turns a game rule refusal into a private message without logging an error', async () => {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 3, enigme_status: 'finished' });
  await Joueur.create({ discord_id: 'p1', a_le_droit_de_jouer: false });
  const calls = [];
  const interaction = {
    user: { id: 'p1' }, customId: 'lancer_de', deferred: false, replied: false, client,
    message: { interactionMetadata: { user: { id: 'p1' } } },
    isRepliable: () => true, isMessageComponent: () => true, isChatInputCommand: () => false, isButton: () => true,
    isStringSelectMenu: () => false, isModalSubmit: () => false,
    deferUpdate: async function () { this.deferred = true; },
    followUp: async payload => { calls.push(payload); },
  };
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try { await handleInteraction(interaction, dispatch); }
  finally { console.error = originalError; }
  assert.equal(calls[0].content, "Tu n'as pas le droit de jouer.");
  assert.equal(calls[0].flags, MessageFlags.Ephemeral);
  assert.deepEqual(errors, []);
});

test('an unknown component id is refused instead of being silently ignored', async () => {
  await sequelize.sync({ force: true });
  await Plateau.create({ id: 1, tour: 3, enigme_status: 'finished' });
  await assert.rejects(dispatch(component('replace_chance_champignon', ['0'])), error => error.code === 'UNKNOWN');
});

test.after(() => sequelize.close());
