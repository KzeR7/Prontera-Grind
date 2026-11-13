// _lib/validate.js — the rules that protect the database from the client.
//
// Everything here is deliberately strict and mirrors the game's own rules: the same username shape
// the login card already enforces, the same stat/level caps index.html uses, and a whitelist for the
// leaderboard fields (a save can be edited by its owner, so `pub` is never free-form).

import { HttpError } from './http.js';

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

export function checkSaveBlob(blob) {
  if (typeof blob !== 'string' || !blob) throw new HttpError(400, 'Missing save.');
  if (blob.length > 512 * 1024) throw new HttpError(413, 'That save is too large.');
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

export function storedSaveAccountId(blob) {
  if (typeof blob !== 'string' || !blob) return 0;
  try { return saveAccountId(JSON.parse(blob)); } catch { return 0; }
}

// Does this stored save belong to `userId`?
//   true  - it is this account's own save (by id, or by name when it carries no id)
//   false - it is somebody else's, and must not be read or written
export function saveBelongsTo(blob, { id, userId, username }) {
  const mine = Number(userId ?? id);
  const stamped = storedSaveAccountId(blob);
  if (stamped) return stamped === mine;      // the durable identity decides
  return !savedElsewhere(blob, username);    // legacy save: the name is all there is
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
export function storedRestoreAt(blob) {
  if (typeof blob !== 'string' || !blob) return 0;
  try { return restoreAt(JSON.parse(blob)); } catch { return 0; }
}

// The blob this account should store: re-stamped with its current name and id when either is stale.
// Returns `blob` unchanged when it is already correct, so the common path rewrites nothing.
// `id` is what currentUser() returns; `userId` is accepted for callers that already have it named.
export function withSaveIdentity(blob, { id, userId, username }) {
  const mine = Number(userId ?? id);
  if (!Number.isInteger(mine) || mine <= 0) return blob;   // nothing durable to stamp with
  let save;
  try { save = JSON.parse(blob); } catch { return blob; }
  if (!save || typeof save !== 'object' || Array.isArray(save)) return blob;
  if (saveAccountId(save) === mine && sameAccount(saveOwnerStamp(save), username)) return blob;
  // Everything else gets the durable identity. A legacy save (no id) whose name still matches is
  // stamped on its very next write - that is the point: from then on a rename cannot strand it.
  return JSON.stringify(Object.assign({}, save, { owner: username, accountId: mine }));
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
