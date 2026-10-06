// GET  /api/save -> save plus a server-issued offline claim, if a return is due.
// PUT  /api/save { version, blob, offlineClaimId? } -> versioned cloud save.
//
// The browser still runs the game simulation, but cloud offline time and kill budgets are derived
// from D1 server clocks/rates, never the device clock or a client-supplied offlineKph. A claim is
// persistent until a versioned save carrying its ID is accepted, so a retry cannot mint it twice.

import { currentUser } from '../_lib/auth.js';
import { json, guard, readJson, fail } from '../_lib/http.js';
import { checkSaveBlob, publicFields } from '../_lib/validate.js';
import * as db from '../_lib/db.js';

const HISTORY_EVERY = 10;
const OFFLINE_CAP_MS = 4 * 60 * 60 * 1000;
const OFFLINE_MIN_MS = 60 * 1000;
const OFFLINE_RATE_CAP = 30000;
const OFFLINE_REWARD_MULT = .5;
const RATE_SMOOTHING_MS = 5 * 60 * 1000;

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
  // Any authenticated save exchange is a server-observed return. Move the baseline even if this
  // response must first deliver a 428 claim or a 409 conflict, so retry time is not counted twice.
  await db.touchSeen(D, userId, now);
  return pending;
}

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
    // Return a pending claim unchanged after a lost response/reload. Otherwise snapshot server time,
    // persisted server rate and remainder once. The authenticated GET also advances the baseline.
    const pendingClaim = await pendingOrIssueOfflineClaim(D, user.id, row, now);
    offlineClaim = publicClaim(pendingClaim);
    row = await db.saveByUser(D, user.id);
  }

  const grants = await db.pendingGrants(D, user.id);
  const pending = grants.results.map(g => ({ id: g.id, kind: g.kind, payload: JSON.parse(g.payload || '{}'), note: g.note }));
  if (!row) return json({ version: 0, blob: null, savedAt: null, offlineClaim: null, pending });
  return json({ version: row.version, blob: row.blob, savedAt: row.saved_at,
    updatedAt: row.updated_at, serverNow: now, offlineClaim, pending });
});

export const onRequestPut = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return fail('Not logged in.', 401);
  const D = env.DB;
  const body = await readJson(request, 600_000);
  const save = checkSaveBlob(body.blob);
  const pub = publicFields(save);
  const savedAt = Date.now(); // ignore client time for cloud-save ordering and audit timestamps
  const clientVersion = Math.floor(Number(body.version) || 0);

  const row = await db.saveByUser(D, user.id);
  if (!row) {
    await db.insertSave(D, user.id, body.blob, savedAt, pub);
    await db.pushHistory(D, user.id, 1, body.blob, savedAt);
    return json({ version: 1, bytes: body.blob.length });
  }

  const pending = await pendingOrIssueOfflineClaim(D, user.id, row, savedAt);
  if (clientVersion !== row.version) {
    return json({ conflict: true, version: row.version, blob: row.blob, savedAt: row.saved_at,
      updatedAt: row.updated_at, offlineClaim: publicClaim(pending) }, 409);
  }

  const requestedClaimId = body.offlineClaimId == null ? null : Number(body.offlineClaimId);
  if (pending && (requestedClaimId !== Number(pending.id) || Number(save.offlineClaimId) !== Number(pending.id))) {
    return json({ offlineClaimRequired: true, err: 'A server-timed offline claim must be applied before this cloud save can sync.',
      version: row.version, offlineClaim: publicClaim(pending) }, 428);
  }
  if (requestedClaimId != null && Number(save.offlineClaimId) !== requestedClaimId)
    return fail('Offline claim ID does not match the save.', 400);

  let appliedClaim = null;
  if (requestedClaimId != null) {
    const known = await db.offlineClaimById(D, user.id, requestedClaimId);
    if (!known) return fail('Unknown offline claim.', 400);
    if (!known.claimed_at) {
      if (!pending || Number(pending.id) !== requestedClaimId) return fail('Offline claim is not pending.', 409);
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
      return json({ conflict: true, version: latest?.version ?? row.version, blob: latest?.blob ?? row.blob,
        savedAt: latest?.saved_at ?? row.saved_at, updatedAt: latest?.updated_at ?? row.updated_at,
        offlineClaim: publicClaim(await db.pendingOfflineClaim(D, user.id)) }, 409);
    }
  } else {
    const result = await update.run();
    if (!Number(result?.meta?.changes)) {
      const latest = await db.saveByUser(D, user.id);
      return json({ conflict: true, version: latest?.version ?? row.version, blob: latest?.blob ?? row.blob,
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
