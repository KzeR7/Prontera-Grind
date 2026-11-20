// Fixtures for the browser acceptance run: real accounts, real cloud saves, real session cookies.
//
// Nothing here is a mock of the raid. An account is a row in `users` with a real PBKDF2 hash; a
// session is a real row in `sessions` keyed by the SHA-256 of the cookie the browser is given. The
// save is packed by the same `save-codec.js` the game uses, so the raid reads a profile from it
// exactly as it does in production.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomBytes } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');

async function loadLib(name) {
  return import(pathToFileURL(path.join(ROOT, 'functions', '_lib', name)).href);
}

// The same reference build the engine suite measures against (`tools/tests/player_raid_engine_sim.mjs`
// saveFor), so the browser run is comparable to the numbers in the validation doc rather than a
// hand-made build that happens to land on the dps floor. Read from that file so the two cannot drift:
// duplicating the numbers here would be a second source of truth for "reference gear".
function referenceSave({ accountId, cls = 'Lord Knight', magic = false }) {
  const source = fs.readFileSync(path.join(ROOT, 'tools', 'tests', 'player_raid_engine_sim.mjs'), 'utf8');
  const body = source.slice(source.indexOf('function saveFor('), source.indexOf('const profile = (cls, magic)'));
  // eslint-disable-next-line no-new-func
  const saveFor = new Function('cls', 'magic', body + '\nreturn saveFor(cls, magic);');
  const save = saveFor(cls, magic);
  save.accountId = accountId;
  return save;
}

async function createAccount(db, { name, cls = 'Lord Knight', magic = false, level = 175 }) {
  const { packSave } = await loadLib('save-codec.js');
  const { raidProfileFromSave } = await loadLib('raid-profile.js');
  const { tokenHash } = await loadLib('auth.js');
  const { withSaveIdentity } = await loadLib('validate.js');

  const now = Date.now();
  const id = db.sql.prepare('INSERT INTO users(username,pass_hash,created_at) VALUES(?,?,?)')
    .run(name, 'pbkdf2$20000$AAAA$AAAA', now).lastInsertRowid;

  const save = referenceSave({ accountId: Number(id), cls, magic });
  // A stored save carries its owner: `saveBelongsTo` refuses a blob stamped with another account,
  // and the raid reads the profile through exactly that path. Stamping the packed blob is what
  // functions/api/save.js does on every PUT, so this is the same shape a real account has.
  const packed = JSON.parse(withSaveIdentity(JSON.stringify(packSave(save)), { id: Number(id), username: name }));
  db.sql.prepare(`INSERT INTO saves(user_id,version,blob,saved_at,updated_at,last_seen,rate_kph,kills_total,level,cls)
    VALUES(?,1,?,?,?,?,0,0,?,?)`)
    .run(id, JSON.stringify(packed), now, now, now, Number(save.lv || level), cls);

  // The cookie is one opaque token of at least 40 characters; the stored session hash is
  // `tokenHash(token)` over the whole string (see readCookie/currentUser in functions/_lib/auth.js).
  const token = randomBytes(32).toString('hex');
  const hash = await tokenHash(token);
  db.sql.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)')
    .run(hash, id, now, now + 30 * 86400000);

  return {
    id: Number(id), name, token, cls, magic, level,
    profile: raidProfileFromSave(packed),
    cookie: { name: 'pg_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' },
  };
}

// A tiny 1x1 PNG, so the "phone viewport" check can prove a canvas actually painted something
// instead of asserting a colour nobody chose.
function readHeaders() {
  const file = path.join(ROOT, 'dist', '_headers');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

module.exports = { createAccount, referenceSave, readHeaders, ROOT, loadLib };
