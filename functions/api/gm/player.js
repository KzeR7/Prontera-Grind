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
//   systems         { system, resource, ... }   - queued Fishing / DigiPet resource with save receipt
//   announce        { body, kind }               - to everyone, or to this player alone
//   restore         { version }                 - put a save_history blob back as the live save
//
// NOT here on purpose: reading a password (impossible — only hashes are stored) and editing a save
// blob by hand. Hand-editing is what grants and restore are for; free text into somebody's save is
// how a GM breaks a player's game.

import { currentUser, isGm, hashPassword } from '../../_lib/auth.js';
import { json, guard, readJson, fail } from '../../_lib/http.js';
import { checkGrant, checkAnnouncement, GRANT_KINDS, checkSaveBlob, publicFields, savedElsewhere } from '../../_lib/validate.js';
import { inspectSave, giftPayload, equipmentPayload, systemsPayload } from '../../_lib/gm-tools.js';
import { GM_CATALOG } from '../../_lib/gm-catalog.js';
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
      character: inspectSave(save.blob),
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
  const action = String(body.action || '');
  const id = (action === 'announce' && body.toAll && !body.id) ? user.id : Math.floor(Number(body.id));
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
      await db.setPasswordAndRevoke(D, id, await hashPassword(pw));  // atomic with session revocation
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
    case 'gift':
    case 'equipment': {
      const payload=action==='gift'?giftPayload(body):equipmentPayload(body,(await db.saveByUser(D,id))?.blob);
      const kind=action==='gift'?'gift':'equipment';
      await D.batch([
        D.prepare('INSERT INTO grants(user_id,kind,payload,note,created_by,created_at) VALUES(?,?,?,?,?,?)').bind(id,kind,JSON.stringify(payload),String(body.note||'').slice(0,200),user.username,Date.now()),
        D.prepare('INSERT INTO events(at,actor,user_id,kind,detail) VALUES(?,?,?,?,?)').bind(Date.now(),user.username,id,'gm-'+kind,JSON.stringify(payload).slice(0,1500)),
      ]);
      return json({ok:true,note:'Queued — applies on their next login or sync. Check Backups for delivery status.'});
    }
    case 'systems': {
      const payload=systemsPayload(body);
      await D.batch([
        D.prepare('INSERT INTO grants(user_id,kind,payload,note,created_by,created_at) VALUES(?,?,?,?,?,?)').bind(id,'systems',JSON.stringify(payload),String(body.note||'').slice(0,200),user.username,Date.now()),
        D.prepare('INSERT INTO events(at,actor,user_id,kind,detail) VALUES(?,?,?,?,?)').bind(Date.now(),user.username,id,'gm-systems',JSON.stringify(payload).slice(0,1500)),
      ]);
      return json({ok:true,note:'Queued — applies on their next login or sync. If the resource is full, it remains pending.'});
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
      const rawGift = body.gift && typeof body.gift === 'object' ? body.gift : null;
      const giftKind = rawGift ? String(rawGift.kind || 'none') : 'none';
      if (giftKind !== 'none' && giftKind !== 'gift' && giftKind !== 'zeny') {
        return fail('Announcement gift must be gift, zeny, or none.', 400);
      }
      let basePayload = null;
      let giftLabel = '';
      if (giftKind === 'zeny') {
        basePayload = checkGrant('zeny', { amount: rawGift.amount });
        giftLabel = `${Number(basePayload.amount).toLocaleString()} Zeny`;
      } else if (giftKind === 'gift') {
        const cid = String(rawGift.catalogId || '').trim().replace(/^resource:/, '');
        basePayload = giftPayload({ catalogId: cid, amount: rawGift.amount });
        const entry = GM_CATALOG.entries.find(item => item.id === cid);
        giftLabel = `${basePayload.amount} × ${entry ? entry.label : (basePayload.resource || basePayload.item?.name || 'Gift')}`;
      }
      const msgId = await db.insertMessageWithId(D, text, kind, target2, user.username);
      let recipients = target2 ? 1 : 0;
      if (basePayload && msgId) {
        const payload = { ...basePayload, messageId: msgId, giftLabel };
        const note = `Announcement: ${text.slice(0, 140)}`;
        if (target2 !== null) {
          await db.insertGrant(D, id, giftKind, payload, note, user.username);
        } else {
          recipients = await db.insertMassGrants(D, `ann:${msgId}`, user.username, giftKind, payload, note);
        }
      }
      const who = target2 ? 'to ' + (target.username || target.u || id) + ': ' : 'to all: ';
      const giftSuffix = giftLabel ? ` (+ ${giftLabel})` : '';
      await audit('gm-announce', (who + text.slice(0, 120) + giftSuffix).slice(0, 500));
      return json({
        ok: true,
        messageId: msgId,
        giftLabel: giftLabel || null,
        recipients,
        note: giftLabel
          ? (target2 ? `Announcement & gift (${giftLabel}) sent.` : `Announcement & gift (${giftLabel}) queued for ${recipients} account(s).`)
          : 'Announcement sent.',
      });
    }
    case 'unlock': {
      // haven-v396: lift the restore fence on purpose. A restore locks the account against any copy
      // that predates it, so a player whose devices all still hold pre-restore saves needs a way out
      // once the GM is satisfied. This is the only action that clears the stamp; nothing on the
      // client can, which is what makes "roll back and wait" unable to re-open the account.
      const live = await db.saveByUser(D, id);
      if (!live) return fail('That account has no live save.', 400);
      let save;
      try { save = JSON.parse(live.blob); } catch { return fail('The live save is not readable.', 500); }
      if (!save || typeof save !== 'object' || Array.isArray(save)) return fail('The live save is not readable.', 500);
      const had = save.gmRestore || null;
      delete save.gmRestore;
      const blob = JSON.stringify(save);
      const pub = publicFields(save);
      await db.pushHistory(D, id, live.version, live.blob, live.saved_at);
      await db.updateSave(D, id, live.version + 1, blob, live.saved_at, pub, live.rate_kph);
      await audit('gm-restore-unlock', had ? `fence from ${new Date(Number(had.at)).toISOString()} cleared` : 'no fence was set');
      return json({ ok: true, version: live.version + 1, cleared: !!had });
    }
    case 'restore': {
      const version = Math.floor(Number(body.version));
      const blob = await db.historyBlob(D, id, version);
      if (!blob) return fail('That backup is not kept any more.', 404);
      // v88.6 (save-owner stamp): a backup that names another account is never put back on this one.
      // (A restore OVER a live save that names another account is allowed - that is how a bad copy is
      // repaired - and the live copy is kept in the history, as always.)
      if (savedElsewhere(blob.blob, target.username)) {
        return fail('That backup belongs to a different account, so it was not restored.', 409);
      }
      const live = await db.saveByUser(D, id);
      if (!live) return fail('That account has no live save to replace.', 400);
      // Keep the save we are about to overwrite, so even a mistaken restore is reversible.
      await db.pushHistory(D, id, live.version, live.blob, live.saved_at);
      // The leaderboard columns are re-derived from the restored blob, never copied from the live row.
      const restored = checkSaveBlob(blob.blob);
      // v394: a restore must not be silently rebased away by a tab that is still open. It moves the
      // live version on by exactly one, which is precisely the shape cloudPush's v330 "this is our own
      // upload whose answer was lost" rule treats as a rebase - and a pre-restore save beats the restored
      // one on Zeny, kills and level by definition (that is why it is being rolled back). So the tab
      // took the account's version NUMBER, kept its own bigger save and pushed it on top: the restore
      // ran, the audit recorded it, and the save was gone seconds later. The owner hit that four times
      // in one sitting (5725 became 5726 with no GM action in between). The blob now says it came from
      // a restore, and the client adopts instead of rebasing whenever the account carries a restore
      // this device has not seen. The stamp is additive, so every older client still reads the save.
      const stamped = JSON.stringify(Object.assign({}, restored, {
        gmRestore: { at: Date.now(), from: version },
      }));
      const pub = publicFields(restored);
      await db.updateSave(D, id, live.version + 1, stamped, blob.saved_at, pub, live.rate_kph);
      // haven-v401: a restore now ends every live session on the account.
      //
      // This is the part three client-side patches kept missing. The owner's log shows the shape that
      // beat them: `login` at 11:22:20, `gm-restore` at 11:22:44 - the tab was already open and
      // signed in when the rollback landed, so it held a copy from before it and went on serving it.
      // Resetting the browser's cookies was the only thing that fixed it, because that is what forced
      // the next load to ask the server instead of trusting the copy in front of it.
      //
      // A restore is a statement that every copy in the world is now wrong. Rather than ask each
      // browser to notice, revoke the sessions: every tab is signed out at the same instant, the
      // session gate stops it uploading, and the next sign-in runs cloudJoin against the restored
      // save - the path that is actually covered by tests.
      await db.deleteUserSessions(D, id);
      await audit('gm-restore', `version ${version} restored as ${live.version + 1}; sessions revoked`);
      return json({ ok: true, version: live.version + 1, sessionsRevoked: true });
    }
    default:
      return fail('Unknown action.', 400);
  }
});
