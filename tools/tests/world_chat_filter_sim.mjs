// world_chat_filter_sim.mjs — tests for server-enforced World chat word filter.
import assert from 'node:assert/strict';
import { isWorldChatAllowed, REJECT_MESSAGE } from '../../workers/social/chat-filter.mjs';
import { SocialRoom } from '../../workers/social/room.mjs';

const test = (name, fn) => {
  try {
    fn();
    console.log('  ok  ', name);
  } catch (e) {
    console.error('  FAIL', name, '->', e?.stack || e);
    process.exitCode = 1;
  }
};

console.log('world_chat_filter_sim: server-enforced World chat filter');

test('blocks direct profanity, case variations, leetspeak, zero-width, diacritics, and spaced-out', () => {
  assert.strictEqual(isWorldChatAllowed('fuck'), false);
  assert.strictEqual(isWorldChatAllowed('FUCK'), false);
  assert.strictEqual(isWorldChatAllowed('f\u200Bu\u200Cc\uFEFFk'), false);
  assert.strictEqual(isWorldChatAllowed('fück'), false);
  assert.strictEqual(isWorldChatAllowed('sh1t'), false);
  assert.strictEqual(isWorldChatAllowed('b!tch'), false);
  assert.strictEqual(isWorldChatAllowed('fuuuuuck'), false);
  assert.strictEqual(isWorldChatAllowed('f u c k'), false);
  assert.strictEqual(isWorldChatAllowed('kill yourself'), false);
});

test('allows ordinary language and game names', () => {
  assert.strictEqual(isWorldChatAllowed('Switching to Assassin class!'), true);
  assert.strictEqual(isWorldChatAllowed('Classic Prontera grind'), true);
  assert.strictEqual(isWorldChatAllowed('Pass me the compass'), true);
  assert.strictEqual(isWorldChatAllowed('Fighting a Cockatrice'), true);
  assert.strictEqual(isWorldChatAllowed('Hello everyone in Prontera!'), true);
});

test('SocialRoom rejects World profanity for both players and GMs, enforces cooldown, and filters history', () => {
  let now = 10_000;
  const sent = [];
  const worldPersisted = [];
  const room = new SocialRoom({
    now: () => now,
    onWorldMessage: (ev) => worldPersisted.push(ev),
    history: [
      { type: 'message', id: 1, at: 1000, from: 1, name: 'Old', gm: false, channel: 'world', body: 'hello world', room: 0 },
      { type: 'message', id: 2, at: 2000, from: 2, name: 'Bad', gm: false, channel: 'world', body: 'fuck this', room: 0 },
    ],
  });

  // History replay must filter out the blocked message without bulk-deleting storage.
  assert.strictEqual(room.history.length, 1);
  assert.strictEqual(room.history[0].body, 'hello world');

  const cPlayer = room.connect({ id: 10, name: 'PlayerOne', gm: false, expires: now + 60_000 }, (s) => sent.push(JSON.parse(s)), () => {});
  const cGm = room.connect({ id: 11, name: 'GameMaster', gm: true, expires: now + 60_000 }, (s) => sent.push(JSON.parse(s)), () => {});
  sent.length = 0;

  // Player sends profanity to World
  room.receive(cPlayer, JSON.stringify({ type: 'chat', channel: 'world', body: 'you are a fucking idiot' }));
  assert.strictEqual(worldPersisted.length, 0);
  assert.ok(sent.some(m => m.type === 'error' && m.message === REJECT_MESSAGE));

  // Cooldown bypass check: immediate clean message within 3s must hit cooldown
  sent.length = 0;
  now += 500;
  room.receive(cPlayer, JSON.stringify({ type: 'chat', channel: 'world', body: 'hello!' }));
  assert.strictEqual(worldPersisted.length, 0);
  assert.ok(sent.some(m => m.type === 'error' && /3 seconds/.test(m.message)));

  // GM is exempt from the World chat word filter
  sent.length = 0;
  now += 5000;
  room.receive(cGm, JSON.stringify({ type: 'chat', channel: 'world', body: 'sh1t happens' }));
  assert.strictEqual(worldPersisted.length, 1);
  assert.strictEqual(worldPersisted[0].body, 'sh1t happens');

  // Clean Assassin class message succeeds
  sent.length = 0;
  now += 5000;
  room.receive(cPlayer, JSON.stringify({ type: 'chat', channel: 'world', body: 'LF party for Assassin class' }));
  assert.strictEqual(worldPersisted.length, 2);
  assert.strictEqual(worldPersisted[1].body, 'LF party for Assassin class');
});
