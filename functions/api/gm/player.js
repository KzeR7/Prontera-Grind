// GET  /api/gm/player?id=42          -> { account, save: {version, bytes, savedAt, pub, history} , grants, events }
// POST /api/gm/player { id, action, ... }
//
// One endpoint for every GM action, so the audit trail can never be forgotten: the action is logged
// in the same request, inside the same try/catch, whatever it was. Actions:
//
//   note            { text }                    - leave a note in the audit log
//   set-password    { password }                - OWNER ONLY; the GM never sees the old one
//   set-gm          { level }                   - OWNER ONLY; 0 user, 1 gm, 2 owner
//   ban / unban                                 - suspend and restore an account
//   logout          {}                          - kill every session (a "force sign-out")
//   grant           { kind, payload, note }      - zeny | item | level | message  (see gm-panel-plan §4)
//   announce        { body, kind }               - to everyone, or to this player alone
//   restore         { version }                 - put a save_history blob back as the live save
//
// NOT here on purpose: reading a password (impossible — only hashes are stored) and editing a save
// blob by hand. Hand-editing is what grants and restore are for; free text into somebody's save is
// how a GM breaks a player's game.

import { currentUser, isGm, hashPassword } from '../../_lib/auth.js';
import { json, guard, readJson, fail } from '../../_lib/http.js';
import { checkGrant, checkAnnouncement, GRANT_KINDS, checkSaveBlob, publicFields } from '../../_lib/validate.js';
import * as db from '../../_lib/db.js';

async function loadAccount(D, id) {
  const row = await db.userById(D, id);
  if (!row) return null;
  const [save, bytes, history, grants] = [
    await db.saveByUser(D, id), await db.blobBytes(D, id), await db.historyFor(D, id), await db.grantsFor(D, id),
  ];
  return {
    account: {
      id: row.id, u: row.username, gm: row.gm, banned: !!row.banned,
      created: row.created_at, lastLogin: row.last_login_at, recoverySet: !!row.recovery_hash,
    },
    save: save ? {
      version: save.version, bytes: bytes?.n ?? 0, savedAt: save.saved_at, updatedAt: save.updated_at,
      lastSeen: save.last_seen, rateKph: save.rate_kph, kills: save.kills_total,
      pub: { lv: save.level, cls: save.cls, zeny: save.zeny, playtime: save.playtime },
      history: history.results.map(h => ({ version: h.version, savedAt: h.saved_at })),
    } : null,
    grants: grants.results.map(g => ({ id: g.id, kind: g.kind, claimed: !!g.claimed_at, at: g.created_at, note: g.note })),
  };
}

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  if (!isGm(user)) return fail('Not a GM.', 403);
  // Cloudflare always hands over an absolute URL; the base keeps a bare path working in tests too.
  const id = Number(new URL(request.url, 'https://pg.local').searchParams.get('id'));
  if (!Number.isInteger(id)) return fail('Which player? (id)', 400);
  const data = await loadAccount(env.DB, id);
  if (!data) return fail('No such account.', 404);
  const events = await db.recentEvents(env.DB, 100);
  return json({ ...data, events: events.results.filter(e => e.user_id === id).slice(0, 25) });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  if (!isGm(user)) return fail('Not a GM.', 403);
  const D = env.DB;
  const body = await readJson(request, 8192);
  const id = Math.floor(Number(body.id));
  const action = String(body.action || '');
  if (!Number.isInteger(id)) return fail('Which player? (id)', 400);
  const target = await db.userById(D, id);
  if (!target) return fail('No such account.', 404);

  const isOwner = user.gm >= 2;
  const audit = (kind, detail) => db.logEvent(D, user.username, id, kind, detail);

  switch (action) {
    case 'note': {
      const text = String(body.text || '').slice(0, 300);
      if (!text) return fail('Note is empty.', 400);
      await audit('gm-note', text);
      return json({ ok: true });
    }
    case 'set-password': {
      if (!isOwner) return fail('Only the owner can change a password.', 403);
      const pw = String(body.password || '');
      if (pw.length < 10) return fail('Use at least 10 characters.', 400);
      await db.setPassword(D, id, await hashPassword(pw));
      await db.deleteUserSessions(D, id);          // a new password invalidates old sessions
      await audit('gm-set-password', 'password changed; sessions revoked');
      return json({ ok: true, note: 'Password set. All their devices must log in again.' });
    }
    case 'set-gm': {
      if (!isOwner) return fail('Only the owner can change GM level.', 403);
      const level = Math.max(0, Math.min(2, Math.floor(Number(body.level) || 0)));
      if (target.id === user.id && level < 2) return fail('You cannot demote yourself.', 400);
      await db.setGm(D, id, level);
      await audit('gm-set-level', `level ${target.gm} -> ${level}`);
      return json({ ok: true });
    }
    case 'ban':
    case 'unban': {
      if (target.gm >= 2) return fail('The owner cannot be suspended.', 400);
      const banned = action === 'ban';
      await db.setBanned(D, id, banned);
      if (banned) await db.deleteUserSessions(D, id);
      await audit(banned ? 'gm-ban' : 'gm-unban', null);
      return json({ ok: true });
    }
    case 'logout': {
      await db.deleteUserSessions(D, id);
      await audit('gm-logout', 'all sessions revoked');
      return json({ ok: true });
    }
    case 'grant': {
      const kind = String(body.kind || '');
      if (!GRANT_KINDS.includes(kind) || kind === 'recovery' || kind === 'note') return fail('Unknown grant kind.', 400);
      const payload = checkGrant(kind, body.payload);
      await db.insertGrant(D, id, kind, payload, body.note ? String(body.note).slice(0, 200) : null, user.username);
      await audit('gm-grant', `${kind} ${JSON.stringify(payload).slice(0, 120)}`);
      return json({ ok: true, note: 'Queued — it applies the next time they log in or sync.' });
    }
    case 'announce': {
      const { text, kind } = checkAnnouncement(body.body, body.kind);
      const target2 = body.toAll ? null : id;
      await db.insertMessage(D, text, kind, target2, user.username);
      await audit('gm-announce', (target2 ? 'to ' + target.u + ': ' : 'to all: ') + text.slice(0, 120));
      return json({ ok: true });
    }
    case 'restore': {
      const version = Math.floor(Number(body.version));
      const blob = await db.historyBlob(D, id, version);
      if (!blob) return fail('That backup is not kept any more.', 404);
      const live = await db.saveByUser(D, id);
      if (!live) return fail('That account has no live save to replace.', 400);
      // Keep the save we are about to overwrite, so even a mistaken restore is reversible.
      await db.pushHistory(D, id, live.version, live.blob, live.saved_at);
      // The leaderboard columns are re-derived from the restored blob, never copied from the live row.
      const pub = publicFields(checkSaveBlob(blob.blob));
      await db.updateSave(D, id, live.version + 1, blob.blob, blob.saved_at, pub, live.rate_kph);
      await audit('gm-restore', `version ${version} restored as ${live.version + 1}`);
      return json({ ok: true, version: live.version + 1 });
    }
    default:
      return fail('Unknown action.', 400);
  }
});
