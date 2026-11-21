// PR #269: the 14 added emotions point at the action that really holds them.
//
// The PR mapped 45 ids to actions 86-130. The pinned emotion.act/spr has 93 actions (0-92), so 38 of
// those numbers were past the end of the file, and the 7 that landed inside it were the wrong
// animations. This test pins the corrected mapping against two outside sources so a future edit
// cannot quietly reintroduce a number that renders the wrong picture:
//
//   action index -> roBrowserLegacy src/DB/Emotions.js (same emotion.spr this repo pins)
//   command      -> iRO Wiki /wiki/Emotes
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs');
const R = require(path.join(__dirname, '..', '..', 'assets', 'social-rules.js'));
const map = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'social', 'emotion-map.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'social', 'emotions-lock.json'), 'utf8'));

// ET_* enum order, rAthena src/map/clif.hpp. Position == action index in emotion.spr.
const ET = ('SURPRISE QUESTION DELIGHT THROB SWEAT AHA FRET ANGER MONEY THINK SCISSOR ROCK WRAP FLAG ' +
  'BIGTHROB THANKS KEK SORRY SMILE PROFUSELY_SWEAT SCRATCH BEST STARE_ABOUT HUK O X HELP GO CRY KIK CHUP ' +
  'CHUPCHUP HNG OK CHAT_PROHIBIT INDONESIA_FLAG STARE HUNGRY COOL MERONG SHY GOODBOY SPTIME SEXY COMEON ' +
  'SLEEPY CONGRATULATION HPTIME PH_FLAG MY_FLAG SI_FLAG BR_FLAG SPARK CONFUSE OHNO HUM BLABLA OTL DICE1 ' +
  'DICE2 DICE3 DICE4 DICE5 DICE6 INDIA_FLAG LUV FLAG8 FLAG9 MOBILE MAIL ANTENNA0 ANTENNA1 ANTENNA2 ' +
  'ANTENNA3 HUM2 ABS OOPS SPIT ENE PANIC WHISP YUT1 YUT2 YUT3 YUT4 YUT5 YUT6 YUT7').split(' ');
const SPRITE_ACTIONS = 93;

// id -> [action, the ET_ name that action really holds, the command the emote answers to]
const ADDED = {
  omg:   [23, 'HUK',        'omg'],
  oh:    [24, 'O',          'oh'],
  x:     [25, 'X',          'x'],
  hlp:   [26, 'HELP',       'hlp'],
  go:    [27, 'GO',         'go'],
  bzz:   [36, 'STARE',      'bzz'],
  awsm:  [38, 'COOL',       'awsm'],
  pat:   [41, 'GOODBOY',    'pat'],
  slur:  [43, 'SEXY',       'slur'],
  grat:  [46, 'CONGRATULATION', 'grat'],
  fsh:   [52, 'SPARK',      'fsh'],
  spin:  [53, 'CONFUSE',    'spin'],
  dice:  [58, 'DICE1',      'dice'],
  oops:  [76, 'OOPS',       'oops'],
};

// What the PR actually shipped, so the regression is recorded rather than remembered.
const PR_CLAIMED = { omg: 86, oh: 87, x: 88, hlp: 89, go: 90, bzz: 95, awsm: 96, pat: 97, slur: 99,
  grat: 101, fsh: 103, spin: 104, dice: 108, oops: 112 };

for (const [id, [action, et, cmd]] of Object.entries(ADDED)) {
  assert.equal(map[id], action, id + ' maps to action ' + action);
  assert.ok(action < SPRITE_ACTIONS, id + ' action ' + action + ' exists in the ' + SPRITE_ACTIONS + '-action sprite');
  assert.equal(ET[action], et, id + ' at action ' + action + ' really is ET_' + et);
  assert.equal(R.EMOTE_NAMES[id], cmd, '/' + cmd + ' is ' + id);
  assert.equal(R.EMOTE_BY_CMD[cmd], id, '/' + cmd + ' resolves to ' + id);
  assert.equal(lock.outputs[id].action, action, 'lock entry for ' + id + ' agrees with the map');
  // every PR number was wrong, and none of them matched reality
  assert.notEqual(PR_CLAIMED[id], action, 'PR #269 guessed wrong for ' + id + ', and that is now pinned');
}
assert.equal(Object.keys(ADDED).length, 14, '14 emotions were added');

// The 13 the PR also proposed are RO II emotes, not RO 1 emotions: they have no action at all, so
// registering them would ship an id that can never render. None may creep back in.
const NOT_RO1 = ['clap', 'bye', 'happy', 'amazed', 'best', 'best2', 'chaos', 'absurd', 'joy', 'kiskis',
  'funny', 'martialarts', 'salute'];
for (const id of NOT_RO1) {
  assert.ok(!R.EMOTIONS.includes(id), id + ' is not registered');
  assert.ok(!(id in map), id + ' has no action');
  assert.ok(!(id in lock.outputs), id + ' has no lock entry');
}

// Map and lock must describe exactly the registered ids, never a superset of stale guesses.
assert.deepEqual(Object.keys(map).sort(), [...R.EMOTIONS].sort(), 'the map lists exactly the registered ids');
assert.deepEqual(Object.keys(lock.outputs).sort(), [...R.EMOTIONS].sort(), 'the lock lists exactly the registered ids');

// No emotion may answer to a command another emotion already owns. The PR shipped three duplicates.
const cmds = Object.values(R.EMOTE_NAMES);
assert.equal(new Set(cmds).size, cmds.length, 'every command is unique');
assert.equal(Object.keys(R.EMOTE_BY_CMD).length, R.EMOTIONS.length, 'the command index is complete');

console.log('emotion map sim: all checks passed (' + Object.keys(ADDED).length + ' added, ' +
  NOT_RO1.length + ' RO II ids correctly excluded)');
