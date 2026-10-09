// GET  /api/save -> save plus a server-issued offline claim, if a return is due.
// PUT  /api/save { version, blob, owner, offlineClaimId? } -> versioned cloud save (owner must be the signed-in account).
//
// SAVE-OWNER STAMP (v88.6): the save itself names its account (`blob.owner`), and the server checks it
// both ways. A PUT whose save is stamped for another account is refused (409 saveMismatch) and so is
// one that would overwrite a stored save stamped for another account; a GET never hands out such a
// save. A PUT whose save has no stamp is refused as out of date (400), like a request with no owner.
// Saves written before v88.6 carry no stamp and keep working; they are stamped on their next write.
//
// The browser still runs the game simulation, but cloud offline time and kill budgets are derived
// from D1 server clocks/rates, never the device clock or a client-supplied offlineKph. A claim is
// persistent until a versioned save carrying its ID is accepted, so a retry cannot mint it twice.
//
// WRITE ECONOMY (v82): rows written is the free plan's tightest limit (100,000/day) and every sync
// is one. An accepted PUT therefore writes the save row EXACTLY once — its own UPDATE carries
// last_seen — and only the paths that write no save (GET, 409, 428, a raced update) pay for a
// separate baseline touch. The old code touched last_seen on every request and then wrote the save
// again on top, i.e. 2 rows written per sync; tools/tests/api_sim.js now pins this at 1.

import { currentUser } from '../_lib/auth.js';
import { json, guard, readJson, fail } from '../_lib/http.js';
import { checkSaveBlob, publicFields, saveOwnerStamp, sameAccount, savedElsewhere, SAVE_MISMATCH } from '../_lib/validate.js';
import * as db from '../_lib/db.js';

const HISTORY_EVERY = 10;
const OFFLINE_CAP_MS = 4 * 60 * 60 * 1000;
// v73: three minutes, not one. A backgrounded (throttled) tab syncs about once a minute, so a
// 60s floor minted claims for a minute the client had already ground at full speed. The client
// uses the same window (OFFLINE_POPUP_MIN_MS in index.html).
const OFFLINE_MIN_MS = 3 * 60 * 1000;
const OFFLINE_RATE_CAP = 30000;
const OFFLINE_REWARD_MULT = .5;
const RATE_SMOOTHING_MS = 5 * 60 * 1000;
// The answer for a save that belongs to another account (v88.6). It names the account the request is
// signed in as, never the other one.
const saveMismatch = user => json({ err: SAVE_MISMATCH, saveMismatch: true, owner: user.username }, 409);

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
const publicClaim = row => row ? ({
  id: Number(row.id), awayMs: Number(row.away_ms), creditedMs: Number(row.credited_ms),
  rateKph: Number(row.rate_kph), kills: Number(row.kills), remainder: Number(row.remainder),
}) : null;

function issueOfflineClaim(row, now, savedRemainder = 0) {
  const lastSeen = Number(row.last_seen) || now;
  const awayMs = Math.max(0, now - lastSeen);
  if (awayMs < OFFLINE_MIN_MS) return null;
  const creditedMs = Math.min(awayMs, OFFLINE_CAP_MS);
  const rateKph = clamp(row.rate_kph, 0, OFFLINE_RATE_CAP);
  const remainder = clamp(savedRemainder, 0, .999999);
  const budget = rateKph * creditedMs / 3600000 * OFFLINE_REWARD_MULT + remainder;
  const kills = Math.max(0, Math.floor(budget));
  return { awayMs, creditedMs, rateKph, kills, remainder: budget - kills };
}

async function pendingOrIssueOfflineClaim(D, userId, row, now) {
  let pending = await db.pendingOfflineClaim(D, userId);
  if (!pending) {
    const remainder = await db.lastOfflineRemainder(D, userId);
    const plan = issueOfflineClaim(row, now, remainder);
    if (plan) {
      await db.insertOfflineClaim(D, userId, plan, now);
      pending = await db.pendingOfflineClaim(D, userId);
    }
  }
  // NOTE: this deliberately does NOT move the away baseline. Any authenticated save exchange is a
  // server-observed return, so the baseline must move - but the caller moves it, because WHERE it
  // moves costs a D1 row write:
  //   * an accepted PUT already writes last_seen as part of its own UPDATE (touchSeen here would be
  //     a second write on the same row, i.e. double the rows written by every single sync);
  //   * a GET, a 409 or a 428 has no such UPDATE, so those paths touch explicitly below.
  return pending;
}

// The early-exit door for PUT: hand back the conflict/claim answer and move the away baseline, so a
// retry is not later counted as time spent away.
const earlyReturn = (D, userId, at) => async (payload, status) => {
  await db.touchSeen(D, userId, at);
  return json(payload, status);
};

// Measure actual server-accepted kill-count increases between syncs. Subtract a pending offline
// claim's approved kills so away progress is never mislearned as online farming speed.
function updatedRate(row, pub, now, appliedClaim) {
  const previous = clamp(row.rate_kph, 0, OFFLINE_RATE_CAP);
  const elapsed = Math.max(0, now - (Number(row.last_seen) || now));
  if (elapsed < 1000) return previous;
  const totalDelta = Math.max(0, Number(pub.kills || 0) - Number(row.kills_total || 0));
  const delta = Math.max(0, totalDelta - (appliedClaim ? Number(appliedClaim.kills || 0) : 0));
  const sample = clamp(delta * 3600000 / elapsed, 0, OFFLINE_RATE_CAP);
  const alpha = clamp(1 - Math.exp(-elapsed / RATE_SMOOTHING_MS), .05, .5);
  return Math.round((previous * (1 - alpha) + sample * alpha) * 100) / 100;
}

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  const D = env.DB, now = Date.now();
  let row = await db.saveByUser(D, user.id), offlineClaim = null;

  if (row) {
    // v88.6: a stored save that names another account is never handed out - not even to its own
    // account's session. Checked before any claim is issued or any baseline moves.
    if (savedElsewhere(row.blob, user.username)) return saveMismatch(user);
    // Return a pending claim unchanged after a lost response/reload. Otherwise snapshot server time,
    // persisted server rate and remainder once. The authenticated GET advances the baseline itself
    // (it writes no save row, so it must).
    const pendingClaim = await pendingOrIssueOfflineClaim(D, user.id, row, now);
    await db.touchSeen(D, user.id, now);
    offlineClaim = publicClaim(pendingClaim);
    row = await db.saveByUser(D, user.id);
  }

  const grants = await db.pendingGrants(D, user.id);
  const pending = grants.results.map(g => ({ id: g.id, kind: g.kind, payload: JSON.parse(g.payload || '{}'), note: g.note }));
  // `owner` says whose save this is, so a tab playing another account never applies it (see PUT).
  if (!row) return json({ version: 0, blob: null, savedAt: null, offlineClaim: null, pending, owner: user.username });
  return json({ version: row.version, blob: row.blob, savedAt: row.saved_at,
    updatedAt: row.updated_at, serverNow: now, offlineClaim, pending, owner: user.username });
});

export const onRequestPut = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  const D = env.DB;
  const body = await readJson(request, 600_000);
  // Whose save is this? The session cookie is shared by every tab of the site: a tab still playing
  // account A keeps pushing its save after account B has signed in elsewhere, and without this check
  // the write would land on B (the GM's character appeared on a player's account this way). The tab
  // names the account it is playing, and the server refuses to write it anywhere else.
  const playing = String(body.owner || '').trim().toLowerCase();
  if (!playing) return fail('This page is out of date. Reload it before saving again.', 400);
  if (playing !== String(user.username).toLowerCase()) {
    return json({ err: 'This tab is playing a different account. Nothing was saved.', accountMismatch: true,
      owner: user.username }, 409);
  }
  const save = checkSaveBlob(body.blob);
  // v88.6: the save itself must name its account, and that account must be the one signed in. A save
  // with no stamp comes from a page that predates the stamp: it is told to reload, as for a bad owner.
  const stamp = saveOwnerStamp(save);
  if (!stamp) return fail('This page is out of date. Reload it before saving again.', 400);
  if (!sameAccount(stamp, user.username)) return saveMismatch(user);
  const pub = publicFields(save);
  const savedAt = Date.now(); // ignore client time for cloud-save ordering and audit timestamps
  const clientVersion = Math.floor(Number(body.version) || 0);

  const row = await db.saveByUser(D, user.id);
  if (!row) {
    await db.insertSave(D, user.id, body.blob, savedAt, pub);
    await db.pushHistory(D, user.id, 1, body.blob, savedAt);
    return json({ version: 1, bytes: body.blob.length });
  }
  // v88.6: the copy already stored must not belong to someone else either. It is never written over.
  if (savedElsewhere(row.blob, user.username)) return saveMismatch(user);

  const pending = await pendingOrIssueOfflineClaim(D, user.id, row, savedAt);
  const early = earlyReturn(D, user.id, savedAt);
  if (clientVersion !== row.version) {
    return early({ conflict: true, version: row.version, blob: row.blob, savedAt: row.saved_at,
      updatedAt: row.updated_at, offlineClaim: publicClaim(pending) }, 409);
  }

  const requestedClaimId = body.offlineClaimId == null ? null : Number(body.offlineClaimId);
  if (pending && (requestedClaimId !== Number(pending.id) || Number(save.offlineClaimId) !== Number(pending.id))) {
    return early({ offlineClaimRequired: true, err: 'A server-timed offline claim must be applied before this cloud save can sync.',
      version: row.version, offlineClaim: publicClaim(pending) }, 428);
  }
  if (requestedClaimId != null && Number(save.offlineClaimId) !== requestedClaimId)
    return early({ err: 'Offline claim ID does not match the save.' }, 400);

  let appliedClaim = null;
  if (requestedClaimId != null) {
    const known = await db.offlineClaimById(D, user.id, requestedClaimId);
    if (!known) return early({ err: 'Unknown offline claim.' }, 400);
    if (!known.claimed_at) {
      if (!pending || Number(pending.id) !== requestedClaimId) return early({ err: 'Offline claim is not pending.' }, 409);
      appliedClaim = known;
    }
  }

  const next = row.version + 1;
  const rateKph = updatedRate(row, pub, savedAt, appliedClaim);
  const update = db.updateSaveStatement(D, user.id, next, body.blob, savedAt, pub, rateKph, row.version);

  if (appliedClaim) {
    // D1 batch runs both writes atomically. A version race cannot consume a claim without saving
    // the claim ID in the exact blob, and the pending-only index prevents duplicate issue.
    const ack = db.markOfflineClaimStatement(D, user.id, requestedClaimId, savedAt, next, body.blob);
    const results = await D.batch([update, ack]);
    const changed = Number(results?.[0]?.meta?.changes ?? results?.[0]?.meta?.rows_written ?? 0);
    const acknowledged = Number(results?.[1]?.meta?.changes ?? results?.[1]?.meta?.rows_written ?? 0);
    if (!changed || !acknowledged) {
      const latest = await db.saveByUser(D, user.id);
      return early({ conflict: true, version: latest?.version ?? row.version, blob: latest?.blob ?? row.blob,
        savedAt: latest?.saved_at ?? row.saved_at, updatedAt: latest?.updated_at ?? row.updated_at,
        offlineClaim: publicClaim(await db.pendingOfflineClaim(D, user.id)) }, 409);
    }
  } else {
    const result = await update.run();
    if (!Number(result?.meta?.changes)) {
      const latest = await db.saveByUser(D, user.id);
      return early({ conflict: true, version: latest?.version ?? row.version, blob: latest?.blob ?? row.blob,
        savedAt: latest?.saved_at ?? row.saved_at, updatedAt: latest?.updated_at ?? row.updated_at,
        offlineClaim: publicClaim(await db.pendingOfflineClaim(D, user.id)) }, 409);
    }
  }

  if (next % HISTORY_EVERY === 0) {
    await db.pushHistory(D, user.id, next, body.blob, savedAt);
    await db.trimHistory(D, user.id, 5);
  }
  return json({ version: next, bytes: body.blob.length, offlineClaimId: appliedClaim ? requestedClaimId : null });
});
