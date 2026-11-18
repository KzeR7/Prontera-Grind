// _lib/validate.js — the rules that protect the database from the client.
//
// Everything here is deliberately strict and mirrors the game's own rules: the same username shape
// the login card already enforces, the same stat/level caps index.html uses, and a whitelist for the
// leaderboard fields (a save can be edited by its owner, so `pub` is never free-form).

import { HttpError } from './http.js';
import { isPacked, unpackSave } from './save-codec.js';

export const USERNAME_RE = /^[A-Za-z0-9_.-]{2,16}$/;
export const RESERVED = ['gm', 'admin', 'administrator', 'system', 'server', 'root', 'mod', 'staff',
  'null', 'undefined', 'everyone', 'all', 'prontera'];

export function checkUsername(name) {
  const u = String(name || '').trim();
  if (!USERNAME_RE.test(u)) throw new HttpError(400, 'Username: 2-16 letters, numbers, _ . -');
  if (RESERVED.includes(u.toLowerCase())) throw new HttpError(400, 'That name is reserved.');
  return u;
}

// Email addresses are identifiers, not proof of ownership. Fold case consistently and
// reject controls/whitespace; do not apply provider-specific alias or dot rewriting.
export function checkEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email) ||
      email.includes('..') || email.split('@')[0].length > 64) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
  return email;
}

export function checkPassword(pass, min) {
  const p = String(pass || '');
  if (p.length < min) throw new HttpError(400, `Password must be at least ${min} characters.`);
  if (p.length > 200) throw new HttpError(400, 'Password is too long.');
  return p;
}

// The game's caps, repeated here on purpose: the server must not accept a save the game itself
// would call impossible. Keep in step with index.html (MAXST/BASECAP/ELITELV and the level ceiling).
export const CAPS = { level: 150, maxStat: 120, maxZeny: 1e15 };

// v413: the ceiling that actually matters. The free plan gives an invocation 10 ms of CPU, and a
// 512 KB blob costs ~6 ms of that in JSON parsing ALONE (measured against this handler), before any
// validation or audit runs. So the old 512 KB limit did not protect the request - it let a save
// through that was guaranteed to be killed part-way, which is how one 415 KB account produced
// hundreds of `exceededResources` errors a day. The 300 KB ceiling is a size guard, NOT proof that
// every reachable account fits or that accepted saves fit the hosted CPU budget. The old ~288 KB
// estimate missed socketed cards/refinement/locks and production fish; see docs/CLOUD-DATA.md.
// This blob-length check runs before parsing the blob (the request envelope was already parsed).
export const SAVE_BYTES_MAX = 300 * 1024;

// v414: the SAVE FORMAT a page can decode, sent as `X-Save-Format` on every cloud request.
// A page build that has no codec advertises nothing (or an older number) and CANNOT read a compact
// row: its loader drops tuple entries, so a compact save handed to it loses items and every fish, and
// its next upload writes that loss back. So a stored compact blob is only handed out to a page that
// says it can decode it; anything else is told to reload and is served the ORDINARY form.
// These are BUILD NUMBERS, the same scale the page sends in `X-Save-Format` - not a small enum. They
// were an enum (1, 2) at first, which made every page look capable: a client sending 110 compares as
// 110 >= 2, so a v2-only page was handed v3 rows. Keep them on the header's scale.
export const SAVE_FORMAT_PLAIN = 0;       // no codec at all (every build before v414)
export const SAVE_FORMAT_COMPACT = 110;   // v414: decodes codec `__v` 1-2
export const SAVE_FORMAT_V3 = 111;        // decodes codec `__v` 3 (catalog references, delta timestamps)
export const SAVE_FORMAT_V4 = 112;        // decodes codec `__v` 4 (item refinement/lock state and enums)
export function clientSaveFormat(request) {
  const raw = Number(request?.headers?.get?.('X-Save-Format'));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : SAVE_FORMAT_PLAIN;
}
// Does this page understand the blob we are holding? A plain blob is readable by everyone, so the
// answer is only ever "no" for a compact blob and a client too old for that blob's codec version.
//
// THE VERSION IS READ FROM THE BLOB, NOT ASSUMED. A page that advertised "compact" before codec v3
// existed understands __v 1-2 and nothing later; handing it a __v 3 row gave it cards with no normal
// fields and a fish whose `at` was a [seconds, millis] pair instead of a timestamp. Advertising a
// capability is not a promise about formats invented after that build.
//
// v416 (CPU): this used to `JSON.parse` the WHOLE stored blob - up to 300 KB - merely to read four
// top-level scalars. `blobForClient` calls it on every GET and on every conflict reply, so a near-cap
// player paid a full parse (measured 2.3 ms locally, 2.4 ms with the memo cold) per request for that
// one number, and a 300 KB GET parsed the blob TWICE. The version is now read from the text.
//
// Why the text search is not a guess, and why it cannot lie in the permissive direction:
//   * `packSave` writes the marker as its LAST top-level key (`Object.assign({}, save, {__v: N})`, and
//     nothing is added after it), so the LAST `"__v":` in the text is always the top-level one even
//     when an extras bucket carries an unrelated `__v` of its own;
//   * the reader walks brace/string nesting to find that key at DEPTH 1 only, so a `"__v":` inside a
//     nested object, a string value or an escape sequence cannot be mistaken for it;
//   * anything unexpected (truncated text, an unreadable number, a future value) answers null, and a
//     caller only ever treats null as "not compact", which is the CONSERVATIVE answer - a compact row
//     read that way is handed over as-is rather than expanded, and the unpacks below still decode it.
// `tools/tests/save_codec_canread_sim.mjs` checks this against JSON.parse over every stored shape,
// including adversarial ones, and fails if the two ever disagree.
const PACKED_MARKER = '"__v":';
// The pre-v416 reader, kept as the reference answer: it is what every deployed build answered, so any
// shape the fast reader is not SURE about has to fall back to it rather than guess.
const packedVersionByParse = blob => {
  try { const o = JSON.parse(blob); return isPacked(o) ? Number(o.__v) || 1 : null; } catch { return null; }
};
export function packedVersion(blob) {
  if (typeof blob !== 'string' || !blob) return null;
  const at = blob.lastIndexOf(PACKED_MARKER);
  if (at < 0) {
    // No marker anywhere means no compact save... unless a nested object spells its key differently
    // (e.g. whitespace around the colon). That is not a shape packSave writes, so it is answered the
    // slow, exact way instead of being assumed away.
    return blob.indexOf('"__v"') < 0 ? null : packedVersionByParse(blob);
  }
  // Depth AT that offset: +1 for every '{'/'[' before it that is not inside a string, -1 for every
  // closing one. A top-level key of the save object therefore sits at depth 1, its neighbours at 0.
  // One forward pass of four charCode comparisons per byte and no allocation: measured at ~1.1 ms on a
  // 296 KB blob against 2.3 ms for the parse it replaces. (Counting the four bracket bytes with four
  // `indexOf` scans was tried and measured at 2.7 ms - four passes over the string lose to one loop -
  // so it stays a single loop.)
  let depth = 0, inString = false, escaped = false;
  for (let i = 0; i < at; i++) {
    const c = blob.charCodeAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (c === 92) escaped = true;          // backslash
      else if (c === 34) inString = false;        // closing quote
      continue;
    }
    if (c === 34) inString = true;
    else if (c === 123 || c === 91) depth++;      // '{' or '['
    else if (c === 125 || c === 93) depth--;      // '}' or ']'
  }
  // Anything that is not a clean "this key sits at the top level" answer is decided by the reference
  // reader. That is the memo-safe trade: the fast path covers every blob packSave writes (and every
  // plausible hand-written one), and the slow path covers the rest EXACTLY as before. Worst case is
  // therefore the old cost, never a different answer.
  if (inString || depth !== 1) return packedVersionByParse(blob);
  let end = at + PACKED_MARKER.length;
  while (end < blob.length && isSpace(blob.charCodeAt(end))) end++;
  if (blob.charCodeAt(end) === 34) return packedVersionByParse(blob);   // a quoted value: ask the reference
  let n = 0, digits = 0;
  while (end < blob.length) {
    const c = blob.charCodeAt(end);
    if (c < 48 || c > 57) break;
    n = n * 10 + (c - 48); digits++; end++;
    if (digits > 9) return packedVersionByParse(blob);
  }
  if (!digits) return packedVersionByParse(blob);                      // a negative or non-numeric value
  let after = end;
  while (after < blob.length && isSpace(blob.charCodeAt(after))) after++;
  const next = blob.charCodeAt(after);
  // The value must END the member. `4.5`, `4e3`, `4abc` continue, so those are the reference's call.
  if (next !== 44 && next !== 125) return packedVersionByParse(blob);
  return n || 1;
}
const isSpace = c => c === 32 || c === 9 || c === 10 || c === 13;
export const clientCanRead = (blob, format) => {
  const v = packedVersion(blob);
  if (v === null) return true;                         // not a compact blob: everyone can read it
  if (format < SAVE_FORMAT_COMPACT) return false;      // no codec at all
  if (v <= 2) return true;                             // the original compact codec
  if (v === 3) return format >= SAVE_FORMAT_V3;
  if (v === 4) return format >= SAVE_FORMAT_V4;         // never give v4 item enums to a v3-only page
  return false;                                       // do not claim support for a future codec
};

// The body a save endpoint should return for `blob` to a client of `format`. Never throws: an
// unreadable blob is the caller's problem, not a reason to fail the request.
export function blobForClient(blob, format) {
  if (!blob || clientCanRead(blob, format)) return blob;
  try { return JSON.stringify(unpackSave(JSON.parse(blob))); } catch { return blob; }
}

export function checkSaveBlob(blob) {
  if (typeof blob !== 'string' || !blob) throw new HttpError(400, 'Missing save.');
  // `saveTooLarge` lets the client distinguish "this save can never be accepted" from a transient
  // failure. Without it the page treats a 413 like a dropped connection and retries for ever, which
  // is a worse experience than the CPU kill it replaced.
  if (blob.length > SAVE_BYTES_MAX) {
    throw new HttpError(413, 'That save is too large to sync.', { saveTooLarge: true });
  }
  let save;
  try { save = JSON.parse(blob); } catch { throw new HttpError(400, 'Save is not valid JSON.'); }
  if (!save || typeof save !== 'object' || Array.isArray(save)) throw new HttpError(400, 'Save must be an object.');
  // `load()` in the game ignores a save without a level; refusing it here stops a broken blob from
  // becoming somebody's only copy.
  if (!Number.isFinite(Number(save.lv))) throw new HttpError(400, 'Save has no character level.');
  return save;
}

// ------------------------------------------------------------ save owner ----
// The save-owner stamp (v88.6). The page writes the name of the account into the save itself, as
// `owner`, so every stored save says whose it is. The server compares that stamp with the account the
// request is signed in as: a save stamped for anyone else is never stored over, handed out or restored.
// A save with no stamp was written before v88.6 and is accepted as it always was.
export const SAVE_MISMATCH = 'This save belongs to a different account, so nothing was saved or loaded.';

// The stamp inside a parsed save: '' when there is none.
export function saveOwnerStamp(save) {
  return save && typeof save === 'object' && typeof save.owner === 'string' ? save.owner.trim() : '';
}

// Account names are case-insensitive everywhere else (users.username is COLLATE NOCASE), so the stamp is too.
export function sameAccount(a, b) {
  return !!a && String(a).trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

// The stamp inside a stored save (a JSON string). '' when it has none or is not readable JSON.
export function storedSaveOwner(blob) {
  if (typeof blob !== 'string' || !blob) return '';
  try { return saveOwnerStamp(JSON.parse(blob)); } catch { return ''; }
}

// True when a stored save names some account other than `name`.
export function savedElsewhere(blob, name) {
  const stamp = storedSaveOwner(blob);
  return !!stamp && !sameAccount(stamp, name);
}

// ---- v280: the save's identity is the account, not its name -------------------------------
//
// The `owner` stamp holds the account NAME, which is mutable: renaming an account left its own
// save stamped with the old name, so `savedElsewhere()` fired on the account's OWN row and every
// GET and PUT answered 409 for ever. The row is already keyed by `users.id`, so the durable
// identity is available and does not change when somebody is renamed.
//
// A save may now carry `accountId`. When it does, that is the identity and the name is ignored.
// A save without it (every save written before v280) falls back to the name comparison, so nothing
// old has to be rewritten before it works - but a RENAME is precisely the case the name cannot
// answer, and that is what the id is for.
//
// Why the extra guard: identity must never be inferred from a mismatch alone. `savedElsewhere`
// returning true for a blob with no id is either "this account was renamed" or "somebody put
// another player's save in this row", and those must stay different. So a mismatched blob is only
// re-stamped when the account id it carries is the row's own id; anything else is still refused.
export function saveAccountId(save) {
  const id = save && typeof save === 'object' ? Number(save.accountId) : NaN;
  return Number.isInteger(id) && id > 0 ? id : 0;
}

// v410 CPU: every helper below accepts EITHER the JSON string or an already-parsed save object.
// The save blob is up to 512 KB and parsing it is the single most expensive thing a sync does, so
// a caller that has already parsed it (save.js parses once in checkSaveBlob) must not make these
// parse it again. Passing an object is always equivalent to passing its string form: the string
// path is kept for callers that only ever had a stored blob, and `null`/`''`/garbage still read as
// "no save", exactly as before.
// v414 CPU: the SAME stored blob is handed to several of these helpers on one sync (owner? restore
// stamp? previous offline income?). Without a memo each call parsed up to 512 KB again - measured as
// 5 parses of the stored blob per accepted save, which is worse than the 3 v410 had reduced it to.
// One entry is enough: the callers all work on the row they just read, and the next request gets a
// different string. It is keyed on the string itself, so a different blob can never read stale data.
let stampCacheText = null, stampCacheSave = null;
const parseStamp = v => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v !== 'string' || !v) return null;
  if (v === stampCacheText) return stampCacheSave;
  let save = null;
  try { const s = JSON.parse(v); save = s && typeof s === 'object' && !Array.isArray(s) ? s : null; }
  catch { save = null; }
  stampCacheText = v; stampCacheSave = save;
  return save;
};

// Explicit name for the same rule, for callers that want to parse a stored blob ONCE and hand the
// object to several helpers. Returns null for "no save" (null/''/garbage), never throws.
export const parseSave = parseStamp;


export function storedSaveAccountId(blob) {
  return saveAccountId(parseStamp(blob));
}

// Does this stored save belong to `userId`?
//   true  - it is this account's own save (by id, or by name when it carries no id)
//   false - it is somebody else's, and must not be read or written
// `stored` may be the blob string or an already-parsed save (see parseStamp).
export function saveBelongsTo(stored, { id, userId, username }) {
  const mine = Number(userId ?? id);
  const save = parseStamp(stored);
  if (!save) return !savedElsewhere(stored, username);  // unreadable: the legacy name path decides
  const stamped = saveAccountId(save);
  if (stamped) return stamped === mine;                 // the durable identity decides
  const name = saveOwnerStamp(save);
  return !name || sameAccount(name, username);          // legacy save: the name is all there is
}

// ------------------------------------------------------- GM restore fence ----
// haven-v396. A GM restore is a decision about the ACCOUNT, not about one browser, so it has to be
// enforced where every device meets: the PUT that stores the save.
//
// v394 and v395 both put the check in the client (cloudPush's 409 branch, then cloudJoin's login
// push). Both worked in simulation and both were still undone in the field, because the client is
// the one thing a stale device fully controls. A tab that is merely *open* keeps uploading: it has
// its own copy, its own `gmRestore`-free blob, and once it wins a version race the stamp is gone
// from the row and every later login is free again. The owner rolled back, force-signed-out every
// session, restored a backup, and logged in three times - and watched the old save come back,
// because the fence was never on the server side of the wire.
//
// What is stored, and why it is checked here:
//   * `gmRestore` on the LIVE row is the fence. While it is present, a client blob that does not
//     carry it is a copy from before the restore, whatever version number it presents, so it is
//     refused rather than written.
//   * A client that HAS adopted the restore carries the stamp forward (cloudAdopt -> save() -> PUT,
//     and the stamp is additive, so it survives a round trip through the game's load()).
//   * The fence lifts only when the GM restores again (a newer `at`), or when an operator clears it
//     with action:'unlock'. It never lifts by itself, so "rollback then wait" cannot re-open it.
const restoreAt = save => {
  const g = save && typeof save === 'object' ? save.gmRestore : null;
  const at = g && typeof g === 'object' ? Number(g.at) : NaN;
  return Number.isFinite(at) && at > 0 ? at : 0;
};

export const RESTORE_FENCED = 'A GM restored this account, so a copy from before the restore was not saved. Reload the game to play the restored save.';

// Is this incoming save allowed to overwrite a row that carries `fenceAt`?
//   no fence on the row            -> yes (the ordinary path)
//   the client carries the stamp   -> yes (it has seen the restore; this is play on top of it)
//   anything else                  -> no  (a pre-restore copy, whichever version it claims)
export function restoreAllowsWrite(storedBlob, incomingSave, fenceAt) {
  if (!fenceAt) return true;
  const seen = restoreAt(incomingSave);
  return seen >= fenceAt;
}

// The stamp on a stored blob, so a PUT can compare against what is actually in the row.
// Accepts the blob string or an already-parsed save (v410: see parseStamp).
export function storedRestoreAt(blob) {
  const save = parseStamp(blob);
  return save ? restoreAt(save) : 0;
}

// The blob this account should store: re-stamped with its current name and id when either is stale.
// Returns `blob` unchanged when it is already correct, so the common path rewrites nothing.
// `id` is what currentUser() returns; `userId` is accepted for callers that already have it named.
//
// v410: `parsed` lets a caller that has already parsed the blob hand the object in, so the common
// path (nothing stale) costs no JSON work at all and the re-stamp path costs one stringify. The
// return shape is unchanged: a string, ready for D1.
export function withSaveIdentity(blob, { id, userId, username }, parsed = null) {
  const mine = Number(userId ?? id);
  if (!Number.isInteger(mine) || mine <= 0) return blob;   // nothing durable to stamp with
  const save = parsed || parseStamp(blob);
  if (!save) return blob;
  if (saveAccountId(save) === mine && sameAccount(saveOwnerStamp(save), username)) return blob;
  // Everything else gets the durable identity. A legacy save (no id) whose name still matches is
  // stamped on its very next write - that is the point: from then on a rename cannot strand it.
  //
  // v414: `parsed` is the UNPACKED save (save.js needs the ordinary shape for its audit). Stamping
  // that object and serialising it would store the plain form, silently throwing away the compact
  // encoding the client just paid to send - and a save that fit in 300 KB compact could come back
  // over the limit. So the stamp is applied to the text the client sent, which carries the compact
  // shape, and only falls back to `parsed` when the text cannot be parsed.
  const src = parseStamp(blob);
  return JSON.stringify(Object.assign({}, src || save, { owner: username, accountId: mine }));
}

// What the server stores for the leaderboard/GM list, taken from the save the client just sent.
// Never trust a free-form object from the client.
export function publicFields(save) {
  const num = v => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
  return {
    lv: Math.min(CAPS.level, num(save.lv)),
    cls: typeof save.cls === 'string' ? save.cls.slice(0, 32) : null,
    zeny: Math.min(CAPS.maxZeny, num(save.zeny)),
    kills: Math.min(Number.MAX_SAFE_INTEGER, num(save.kills)),
    playtime: num(save.playtime ?? save.play),   // optional field; harmless if absent
    // Endless Echo board scores (haven-v248): the all-time personal best plus the client's own
    // best for its stamped day/week, so an old best is never re-attributed to a new period.
    ...echoFields(save),
  };
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
function echoFields(save) {
  const trial = save && typeof save.trial === 'object' && save.trial ? save.trial : {};
  const board = trial.echoBoard && typeof trial.echoBoard === 'object' ? trial.echoBoard : {};
  // Legacy projection only; the new unverified board reads accepted save fields
  // directly and does not cap scores at this former sanity threshold.
  const dps = v => Math.min(100_000_000, Math.max(0, Number(v) || 0));
  const key = v => (typeof v === 'string' && DAY_KEY_RE.test(v) ? v : null);
  return {
    echoBest: dps(trial.best),
    echoDayDps: dps(board.dayDps), echoDayKey: key(board.day),
    echoWeekDps: dps(board.weekDps), echoWeekKey: key(board.week),
  };
}

// Grants are built by the GM console, but they still get validated before they reach a save.
export const GRANT_KINDS = ['zeny', 'item', 'level', 'message', 'recovery', 'note'];

export function checkGrant(kind, payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  switch (kind) {
    case 'zeny': {
      const amount = Math.floor(Number(p.amount));
      if (!Number.isFinite(amount) || amount === 0) throw new HttpError(400, 'Zeny amount must be a non-zero number.');
      if (Math.abs(amount) > 1e12) throw new HttpError(400, 'That Zeny amount is too large.');
      return { amount };
    }
    case 'level': {
      const amount = Math.floor(Number(p.amount));
      if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 150) throw new HttpError(400, 'Level grant must be -150..150.');
      return { amount };
    }
    case 'item':
      // An item is whatever the game's item schema is; we cap the size and require a name so a
      // mis-typed grant cannot fill a bag with blanks.
      if (!p.item || typeof p.item !== 'object' || typeof p.item.name !== 'string' || !p.item.name.trim()) {
        throw new HttpError(400, 'Item grant needs an item object with a name.');
      }
      if (JSON.stringify(p.item).length > 4000) throw new HttpError(400, 'That item is too large.');
      return { item: p.item };
    case 'message':
      if (typeof p.text !== 'string' || !p.text.trim()) throw new HttpError(400, 'Message needs text.');
      return { text: p.text.slice(0, 500) };
    default:
      throw new HttpError(400, 'Unknown grant kind.');
  }
}

export function checkAnnouncement(body, kind) {
  const text = String(body || '').trim();
  if (!text) throw new HttpError(400, 'Announcement text is empty.');
  if (text.length > 500) throw new HttpError(400, 'Keep announcements under 500 characters.');
  const k = ['notice', 'welcome', 'event'].includes(kind) ? kind : 'notice';
  return { text, kind: k };
}
