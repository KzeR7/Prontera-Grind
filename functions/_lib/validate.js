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

// What the server stores for the leaderboard/GM list, taken from the save the client just sent.
// Never trust a free-form object from the client.
export function publicFields(save) {
  const num = v => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
  return {
    lv: Math.min(CAPS.level, num(save.lv)),
    cls: typeof save.cls === 'string' ? save.cls.slice(0, 32) : null,
    zeny: Math.min(CAPS.maxZeny, num(save.zeny)),
    kills: num(save.kills),
    playtime: num(save.playtime ?? save.play),   // optional field; harmless if absent
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
