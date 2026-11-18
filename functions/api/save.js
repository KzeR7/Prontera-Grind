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
import { lockedCosmetics } from '../_lib/shop.js';
import { json, guard, readJson, fail, unauth, HttpError } from '../_lib/http.js';
import { checkSaveBlob, publicFields, saveOwnerStamp, sameAccount, savedElsewhere, saveBelongsTo, withSaveIdentity, storedSaveOwner, SAVE_MISMATCH, restoreAllowsWrite, storedRestoreAt, RESTORE_FENCED, parseSave, clientSaveFormat, blobForClient, SAVE_FORMAT_COMPACT } from '../_lib/validate.js';
import { unpackSave } from '../_lib/save-codec.js';
import * as db from '../_lib/db.js';
import { recordDamageObservation } from '../_lib/damage-monitor.js';
import { auditAcceptedSave } from '../_lib/save-audit.js';
import { recordUnverifiedEcho, settleUnverifiedEcho } from '../_lib/unverified-echo.js';

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
// `Number(null) === 0` is not validation. Snapshot/state fields must be present before a numeric
// zero is accepted, otherwise a partial corrupt row can impersonate a real zero-rate entitlement.
const finite = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const safeInt = v => v !== null && v !== undefined && v !== '' && Number.isSafeInteger(Number(v)) ? Math.floor(Number(v)) : null;
// v424: pricing state and issued bounds are distinct immutable data.  A valid snapshot freezes
// payout; `ineligible` freezes a zero payout; `legacy` is the sole compatibility path for rows that
// predate the state column.  Never infer either state from nullable snapshot values on a new row.
const SNAPSHOT_VALUE_COLUMNS=['income_xp','income_zeny','income_job','income_kph','source_map','source_stage',
  'income_version','reward_version','sampled_at'];
const snapshotHasValue = row => SNAPSHOT_VALUE_COLUMNS.some(k=>row?.[k]!==null&&row?.[k]!==undefined);
// Ineligible rows legitimately carry bounds without prices. Historical legacy rows must have
// neither: even an interval-only fragment is a partial frozen snapshot, not mutable pricing.
const frozenSnapshotHasValue = row => snapshotHasValue(row)
  || ['interval_start_at','interval_end_at'].some(k=>row?.[k]!==null&&row?.[k]!==undefined);
const publicInterval = row => {
  const intervalStartAt=safeInt(row?.interval_start_at),intervalEndAt=safeInt(row?.interval_end_at);
  return intervalStartAt!==null&&intervalStartAt>=0&&intervalEndAt!==null&&intervalEndAt>=intervalStartAt
    ? {intervalStartAt,intervalEndAt} : null;
};
const publicPricing = row => {
  const sourceMap=safeInt(row?.source_map),sourceStage=safeInt(row?.source_stage),incomeVersion=safeInt(row?.income_version),
    rewardVersion=safeInt(row?.reward_version),sampledAt=safeInt(row?.sampled_at),interval=publicInterval(row);
  if(!finite(row?.income_xp)||!finite(row?.income_zeny)||!finite(row?.income_job)||!finite(row?.income_kph)
    || [sourceMap,sourceStage,incomeVersion,rewardVersion,sampledAt].some(v=>v===null)||!interval
    || sourceMap<0||sourceStage<1||incomeVersion<1||rewardVersion<0||sampledAt<0) return null;
  return { xp:Number(row.income_xp), zeny:Number(row.income_zeny), job:Number(row.income_job), kph:Number(row.income_kph),
    sourceMap,sourceStage,incomeVersion,rewardVersion,sampledAt,...interval };
};
const pricingStateOf = row => {
  const state=row?.pricing_state;
  if(state==='priced') return publicPricing(row)?'priced':'corrupt';
  // Ineligible rows deliberately have NULL pricing values but do carry their own issued interval.
  if(state==='ineligible') return snapshotHasValue(row)?'corrupt':'ineligible';
  if(state==='legacy') return frozenSnapshotHasValue(row)?'corrupt':'legacy';
  // A no-state row is old schema/history. A complete 0019 snapshot is already immutable and can
  // safely be honoured; only an all-null row remains the documented local-sample recovery shape.
  // A partial snapshot is neither: treating it as legacy would let corrupt frozen data fall back to
  // a later mutable local sample, which is exactly the payout ambiguity this state contract closes.
  if(state===null||state===undefined) return publicPricing(row)?'priced':frozenSnapshotHasValue(row)?'corrupt':'legacy';
  return 'corrupt';
};
const publicClaim = row => {
  if(!row)return null;
  const pricingState=pricingStateOf(row), interval=publicInterval(row);
  return {
    id: Number(row.id), awayMs: Number(row.away_ms), creditedMs: Number(row.credited_ms),
    rateKph: Number(row.rate_kph), kills: Number(row.kills), remainder: Number(row.remainder),
    cls: row.cls ?? null, runGen: row.run_gen == null ? null : Number(row.run_gen), pricingState,
    // Bounds are public claim metadata rather than part of pricing: an ineligible claim must still
    // be acknowledged against the interval the server actually issued, never `response-now - away`.
    intervalStartAt:interval?.intervalStartAt ?? null, intervalEndAt:interval?.intervalEndAt ?? null,
    pricing: pricingState==='priced'||pricingState==='legacy' ? publicPricing(row) : null,
  };
};
// The owner context frozen at issuance comes from the STORED save's top-level view - the parse the
// request already paid for (GET: saveView, PUT: storedStamp), never a fresh parse of the blob.
const runGenOf = v => Number.isSafeInteger(Number(v)) && Number(v) >= 1 ? Math.floor(Number(v)) : null;
// Match load()'s generation-one adoption for saves that predate both run fields. Freeze the
// already-stored same-class sample on first return; never turn a modern untrained run into legacy.
const legacyRewardSave = view => !!view && view.runGen == null && view.runSeq == null;
const claimOwnerOf = view => ({
  cls: view && typeof view.cls === 'string' ? view.cls.slice(0, 32) : null,
  runGen: view ? legacyRewardSave(view) ? 1 : runGenOf(view.runGen) : null,
});
// A pricing snapshot is accepted only from a sample that proves it belongs to the stored account,
// class and numbered progression run. This does not make browser-authored rates authoritative; it
// makes one already-issued browser-priced entitlement immutable across delay/retry/sample changes.
const claimPricingOf = (view, owner, userId, intervalStartAt, intervalEndAt) => {
  const income=view?.offlineIncome, source=String(income?.key || '').split(':'),legacy=legacyRewardSave(view);
  const sourceMap=safeInt(source[1]),sourceStage=safeInt(source[2]),incomeVersion=safeInt(income?.version),
    rewardVersion=safeInt(income?.rewardVersion) ?? (legacy&&sourceMap!==null&&sourceMap<10&&income?.rewardVersion==null?0:null),
    sampledAt=safeInt(income?.at),aid=legacy&&income?.aid==null?safeInt(userId):safeInt(income?.aid),
    gen=legacy&&income?.gen==null?owner.runGen:safeInt(income?.gen),
    start=safeInt(intervalStartAt),end=safeInt(intervalEndAt);
  if(!income||source.length!==3||typeof owner?.cls!=='string'||!Number.isSafeInteger(owner?.runGen)
    || source[0]!==owner.cls||aid!==Number(userId)||gen!==owner.runGen
    || sourceMap===null||sourceMap<0||sourceMap>99||sourceStage===null||sourceStage<1||sourceStage>15
    || incomeVersion!==1||rewardVersion===null||rewardVersion<0||sampledAt===null||sampledAt<0
    || start===null||start<0||end===null||end<start
    || !['xp','zeny','job','kph'].every(k=>finite(income[k])&&Number(income[k])>=0)
    || Number(income.kph)>OFFLINE_RATE_CAP) return null;
  return { xp:Number(income.xp),zeny:Number(income.zeny),job:Number(income.job),kph:Number(income.kph),
    sourceMap,sourceStage,incomeVersion,rewardVersion,sampledAt,intervalStartAt:start,intervalEndAt:end };
};
const claimContextOf = (view, userId, row, now) => {
  const owner=claimOwnerOf(view), start=safeInt(row?.last_seen) ?? safeInt(now), end=safeInt(now);
  const interval=start!==null&&start>=0&&end!==null&&end>=start?{intervalStartAt:start,intervalEndAt:end}:null;
  return { owner, interval, pricing:interval?claimPricingOf(view,owner,userId,start,end):null };
};

// Is the away window long enough for a claim to exist at all? <3 minutes never mints one, and the
// test lives here so the read that only a real claim needs can be skipped without duplicating it.
const awayQualifies = (row, now) => now - (Number(row.last_seen) || now) >= OFFLINE_MIN_MS;

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

async function pendingOrIssueOfflineClaim(D, userId, row, now, claimContext = null) {
  let pending = await db.pendingOfflineClaim(D, userId);
  // v416 (CPU): the remainder of the last claim is only needed by a claim that is actually being
  // issued, and one is only issued once the away window is longer than OFFLINE_MIN_MS. Reading it
  // unconditionally cost every sync a D1 statement whose answer an actively-playing client (away for
  // seconds) never used - on top of the pending-claim read immediately above.
  if (!pending && awayQualifies(row, now)) {
    // A compatibility SELECT can read legacy rows, but it cannot make a new pricing:null row
    // unambiguous. Verify migration 0020 only on this rare issuance path before writing one.
    if (!await db.offlineClaimPricingStateReady(D)) {
      // Returning an empty claim would let GET/touchSeen or an accepted PUT advance last_seen,
      // permanently discarding this qualifying absence before the migration can price it.
      throw new HttpError(503, 'Offline reward storage is being upgraded. Please retry shortly.',
        { offlineClaimsUnavailable: true, migrationRequired: '0020_offline_claim_pricing_state.sql' });
    }
    const remainder = await db.lastOfflineRemainder(D, userId);
    const plan = issueOfflineClaim(row, now, remainder);
    if (plan) {
      await db.insertOfflineClaim(D, userId, plan, now, claimContext);
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
  return json(Object.assign({}, payload, { serverNow: at }), status);
};

// Measure actual server-accepted kill-count increases between syncs. Subtract a pending offline
// claim's approved kills so away progress is never mislearned as online farming speed.
// v422: the smoothed rate belongs to the character it was measured on. Across a class or
// progression-run boundary the old speed must not carry over - a maxed class's kill rate would
// otherwise price the fresh Novice's next away claim - so the measurement re-bases to 0 and climbs
// again as the new owner is observed. The client-side measured minute keeps its own ownership rule;
// this is the server-side half of the same fix.
function updatedRate(row, pub, now, appliedClaim, ownerChanged = false) {
  if (ownerChanged) return 0;
  const previous = clamp(row.rate_kph, 0, OFFLINE_RATE_CAP);
  const elapsed = Math.max(0, now - (Number(row.last_seen) || now));
  if (elapsed < 1000) return previous;
  const totalDelta = Math.max(0, Number(pub.kills || 0) - Number(row.kills_total || 0));
  const delta = Math.max(0, totalDelta - (appliedClaim ? Number(appliedClaim.kills || 0) : 0));
  const sample = clamp(delta * 3600000 / elapsed, 0, OFFLINE_RATE_CAP);
  const alpha = clamp(1 - Math.exp(-elapsed / RATE_SMOOTHING_MS), .05, .5);
  return Math.round((previous * (1 - alpha) + sample * alpha) * 100) / 100;
}

// True when this sync would write exactly the denormalised values the row already holds.
// `saved_at`/`updated_at`/`last_seen`/`version` are deliberately NOT part of the comparison: they are
// the sync itself, and skipping them would stop the save being an acknowledgement.
function saveColumnsUnchanged(row, pub, rateKph) {
  const same = (stored, incoming) => {
    if (stored == null && incoming == null) return true;
    if (stored == null || incoming == null) return false;
    return Number(stored) === Number(incoming);
  };
  return same(row.kills_total, pub.kills ?? 0)
    && same(row.level, pub.lv ?? null)
    && (row.cls ?? null) === (pub.cls ?? null)
    && same(row.zeny, pub.zeny ?? null)
    && same(row.playtime, pub.playtime ?? null)
    && same(row.rate_kph, rateKph);
}

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return await unauth(request);
  const D = env.DB, now = Date.now();
  // v414: what this page can DECODE. A compact row is never handed to a page without the codec -
  // the old loader drops every tuple row (and every fish) and its next upload would save that loss.
  const format = clientSaveFormat(request);
  let row = await db.saveByUser(D, user.id), offlineClaim = null;
  // The parity rule the client and the server share (docs: "the save this page is handed is the save
  // this page can read"). `saveView` is the parsed stored save this request already needed - for the
  // ownership check below, and for the offline-claim plan - and it is what the version read and the
  // expansion path use, so a GET parses the stored blob ONCE whatever the client's format header says.
  let saveView = null;

  if (row) {
    saveView = parseSave(row.blob);
    // v88.6 / v280: a stored save that belongs to another account is never handed out - not even to
    // its own account's session. The account id decides where the blob carries one, so a RENAME no
    // longer looks like somebody else's save; a blob with no id falls back to the name, as before.
    // Checked before any claim is issued or any baseline moves.
    if (!saveBelongsTo(row.blob, user)) return saveMismatch(user);
    // Return a pending claim unchanged after a lost response/reload. Otherwise snapshot server time,
    // persisted server rate and remainder once. The authenticated GET advances the baseline itself
    // (it writes no save row, so it must).
    //
    // v416 (CPU): this used to re-read the row after `touchSeen` so the answer carried the new
    // `last_seen`/`updated_at`. `updated_at` is written as `updated_at = updated_at` - the touch does
    // not change it - and `last_seen` is not in the GET response at all, so that second read fetched
    // a whole save-sized blob (up to the 300 KB ceiling) to learn nothing. The response fields come
    // from the row already in hand; `last_seen` is folded into the claim in the same way the split
    // read's result would have shown it.
    const claim = await pendingOrIssueOfflineClaim(D, user.id, row, now, claimContextOf(saveView, user.id, row, now));
    await db.touchSeen(D, user.id, now);
    offlineClaim = publicClaim(claim);
    // No field this response carries was changed by the touch, so the row in hand is still the
    // authoritative one: version, saved_at, updated_at and blob are untouched by `touchSeen`.
  }

  const grants = await db.pendingGrants(D, user.id);
  const pending = grants.results.map(g => ({ id: g.id, kind: g.kind, payload: JSON.parse(g.payload || '{}'), note: g.note }));
  // `owner` says whose save this is, so a tab playing another account never applies it (see PUT).
  if (!row) return json({ version: 0, blob: null, savedAt: null, offlineClaim: null, pending, owner: user.username });
  return json({ version: row.version, blob: blobForClient(row.blob, format, saveView), savedAt: row.saved_at,
    updatedAt: row.updated_at, serverNow: now, offlineClaim, pending, owner: user.username });
});

export const onRequestPut = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return await unauth(request);
  const D = env.DB;
  // v414: conflict/restore-fenced replies carry the LIVE blob too, and a page that cannot decode it
  // would adopt it and lose items. Every blob that leaves here goes through blobForClient.
  const format = clientSaveFormat(request);
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
  // v414 CPU: the page now stores items/cards/fish positionally, which is ~44% fewer bytes and the
  // cheaper parse the whole change is for. But every rule below - the account stamp, the cosmetic
  // ownership check, the gear audit, the damage observation - was written against the ORDINARY object
  // shape. So the blob is unpacked once, here, into exactly that shape. Skipping this would leave the
  // audit looking at arrays instead of items and quietly stop checking gear: a silent loss of
  // protection, which is worse than any CPU saving. `body.blob` (the compact text) is what is stored.
  const storedForm = checkSaveBlob(body.blob);
  const save = unpackSave(storedForm);
  // v88.6: the save itself must name its account, and that account must be the one signed in. A save
  // with no stamp comes from a page that predates the stamp: it is told to reload, as for a bad owner.
  const stamp = saveOwnerStamp(save);
  if (!stamp) return fail('This page is out of date. Reload it before saving again.', 400);
  if (!sameAccount(stamp, user.username)) return saveMismatch(user);
  // haven-v215: Cash Shop cosmetics are owned per account, server-side. A save wearing a paid item the
  // account does not own is refused before anything is written; the client takes those slots off and
  // pushes again (cloudPush's cosmeticLocked branch), so a hand-edited save cannot wear what it never
  // bought and a revoked unlock heals itself on the next sync.
  const locked = await lockedCosmetics(D, user.id, save);
  if (locked.length) {
    return json({ err: 'This look uses Cash Shop items this account does not own.', cosmeticLocked: true, locked }, 409);
  }
  // v280: store the account's durable identity (users.id) alongside the name it was written under.
  // The name is mutable and a rename used to strand the save; the id never changes. Stamping here
  // means every save this build writes is rename-proof from now on, whoever renames it and however.
  // v410 CPU: `save` was already parsed by checkSaveBlob above, so hand that object in. The old code
  // re-parsed the blob here and then parsed the result again, i.e. two full parses of up to 512 KB
  // per sync for no new information. `stored` is `body.blob` unchanged when the stamp is already
  // correct (the ordinary path), which is where the second parse used to happen.
  const stored = withSaveIdentity(body.blob, user, save);
  // `stored` differs from `body.blob` only by the added `owner`/`accountId` stamp, so the client's
  // own parse (`save`) is the object the rest of this handler audits - re-parsing `stored` would
  // read the same 512 KB again to learn nothing new.
  const storedSave = save;
  const pub = publicFields(storedSave);
  const savedAt = Date.now(); // ignore client time for cloud-save ordering and audit timestamps
  // Diagnostics are best-effort after successful saves only. They must never
  // make an already-committed save appear to fail, even if migration is absent.
  const observeDamage = async () => {
    try { await recordDamageObservation(D,user.id,save,savedAt); }
    catch { console.warn('Damage monitoring unavailable; cloud save remains accepted.'); }
  };
  // The owner cannot watch the game 24/7, so the server does: every accepted save is audited
  // against the game's own static invariants (stat caps, pts entitlement, refine ceilings) and
  // against the rate of progress since the previous accepted save (kills/levels/zeny/materials
  // per hour, with offline claims and GM grants credited back). Flags are REVIEW-ONLY — they
  // never reject a save — and land in `save_alerts` for the GM console's "Suspicious saves"
  // card plus a first-time targeted message to the owner accounts (migrations/0015).
  // Best-effort like the two hooks above: a monitoring failure never fails an accepted save.
  const auditSave = async () => {
    try {
      const { flagged, fresh } = await auditAcceptedSave(D, {
        userId: user.id, username: user.username, gm: user.gm,
        // v414: `prevSave` is deliberately null. The audit reads ONE top-level field from the stored
        // save (`offlineIncome`), and only when the incoming save produced no static violations; its
        // own safeParse(row.blob) then parses exactly once, in the rare window where it is needed.
        // Handing it a pre-parsed object would pay a full 512 KB parse on EVERY sync to save that
        // parse in a path that usually never runs.
        prev: row, prevSave: null, save: storedSave, pub, savedAt,
        // The top-level view the ownership/restore checks already read, so the audit does not parse
        // the same stored blob a third time to look at one field.
        stamp: storedStamp,
        claimKills: appliedClaim ? Number(appliedClaim.kills) || 0 : 0,
        // The claim row itself: the audit credits what the payout bought (levels, Zeny, loot),
        // not just the kills, or a welcome-back lands in the next window as impossible progress.
        claim: appliedClaim ? { kills: Number(appliedClaim.kills) || 0,
          creditedMs: Number(appliedClaim.credited_ms) || 0 } : null,
      });
      if (flagged) console.log(`Save audit flagged ${user.username}: ${(fresh || []).map(v => v.kind).join(', ')}`);
    } catch (err) {
      console.warn('Save audit unavailable; cloud save remains accepted.', err);
    }
  };
  // Leaderboard work happens after the committed save; a monitoring/score
  // outage must not cause an accepted save to be reported as rejected.
  const updateLeaderboard = async () => {
    try { await recordUnverifiedEcho(D,user.id,save,savedAt); }
    catch { console.warn('Unverified leaderboard update unavailable; cloud save remains accepted.'); return false; }
    // Settlement is retried independently on later saves and board reads.
    //
    // v416: this was prototyped behind a DURABLE checkpoint (a completed pass newer than the start of
    // the current day and week skipped the query; an owner-only endpoint forced one; GET /api/board
    // stayed unconditional) and then thrown away on the measurement: the gate's own read
    // (`echo_settlement_checked_at` by primary key, 0.007 ms) costs the same ONE statement as the
    // query it replaces (`competition_periods` where ended, 0.014 ms), so it bought ~7 us of CPU per
    // sync - noise beside the 0.66 ms request - and ADDED two statements on every sync where a period
    // really was due. A migration, two tables and an endpoint are not worth that. Settlement here is
    // unchanged: one indexed read, and a batch only when something has ended.
    try { await settleUnverifiedEcho(D, savedAt); }
    catch { console.warn('Echo prizes temporarily unavailable; settlement will be retried.'); }
    return true;
  };
  const clientVersion = Math.floor(Number(body.version) || 0);
  // Declared up here because the audit hook (below) closes over it and runs on both write paths;
  // it is only ASSIGNED once the claim section below is reached.
  let appliedClaim = null;

  const row = await db.saveByUser(D, user.id);
  // v414 CPU: the three things this handler needs from the STORED blob - who owns it, whether it
  // carries a restore stamp, and its `offlineIncome` for the audit - read TOP-LEVEL fields only. None
  // touches inv/cards/fishing, so they share ONE parse of the row, and every helper below is handed
  // the string so the memo in parseStamp is what makes that sharing work.
  //
  // This is deliberately not "parse the whole stored save up front": doing that on the first-save
  // path, and for an account whose row is unreadable, would pay for a parse nobody asked for. Only
  // the top-level read below is eager, and it is the one the ownership check needs anyway.
  const storedBlob = row ? row.blob : null;
  const storedStamp = storedBlob ? parseSave(storedBlob) : null;
  if (!row) {
    await db.insertSave(D, user.id, stored, savedAt, pub);
    await db.pushHistory(D, user.id, 1, stored, savedAt);
    await observeDamage();
    await auditSave(); // first save for this account: static impossibilities only (no previous row)
    const leaderboardSynced = await updateLeaderboard();
    return json({ version: 1, bytes: stored.length, leaderboardPending: !leaderboardSynced });
  }
  // v88.6 / v280: the copy already stored must not belong to someone else either. It is never
  // written over. A blob carrying this account's own id is its own, whatever name it was stamped
  // with - that is what makes a rename survivable.
  if (!saveBelongsTo(storedBlob, user)) return saveMismatch(user);

  const pending = await pendingOrIssueOfflineClaim(D, user.id, row, savedAt, claimContextOf(storedStamp, user.id, row, savedAt));

  // haven-v396: the GM restore fence. A restore is a decision about the account, so it is enforced
  // here, on the write, rather than being asked of each browser (v394 did the 409 branch, v395 the
  // login push - both are code the stale tab does not have to run). While the row carries a restore
  // stamp, a save that does not carry it is a copy from before the restore, whatever version number
  // it presents, and it is refused instead of written. A client that adopted the restore carries the
  // stamp forward, so ordinary play after the rollback still saves normally.
  const early = earlyReturn(D, user.id, savedAt);
  // haven-v396: the GM restore fence (see functions/_lib/validate.js). Enforced on the WRITE, not
  // asked of the browser: v394 guarded cloudPush's 409 branch and v395 the login push, and both were
  // undone in the field by a tab that was simply open across the rollback. While the row carries a
  // restore stamp, a save without that stamp is a pre-restore copy whatever version it presents.
  const fenceAt = storedRestoreAt(storedBlob);
  if (!restoreAllowsWrite(row.blob, save, fenceAt)) {
    return early({ err: RESTORE_FENCED, restoreFenced: true, restoreAt: fenceAt,
      conflict: true, version: row.version, blob: blobForClient(row.blob, format, storedStamp), savedAt: row.saved_at,
      updatedAt: row.updated_at, offlineClaim: publicClaim(pending) }, 409);
  }
  if (clientVersion !== row.version) {
    return early({ conflict: true, version: row.version, blob: blobForClient(row.blob, format, storedStamp), savedAt: row.saved_at,
      updatedAt: row.updated_at, offlineClaim: publicClaim(pending) }, 409);
  }

  const requestedClaimId = body.offlineClaimId == null ? null : Number(body.offlineClaimId);
  if (pending && (requestedClaimId !== Number(pending.id) || Number(save.offlineClaimId) !== Number(pending.id))) {
    return early({ offlineClaimRequired: true, err: 'A server-timed offline claim must be applied before this cloud save can sync.',
      version: row.version, offlineClaim: publicClaim(pending) }, 428);
  }
  if (requestedClaimId != null && Number(save.offlineClaimId) !== requestedClaimId)
    return early({ err: 'Offline claim ID does not match the save.' }, 400);

  if (requestedClaimId != null) {
    const known = await db.offlineClaimById(D, user.id, requestedClaimId);
    if (!known) return early({ err: 'Unknown offline claim.' }, 400);
    if (!known.claimed_at) {
      if (!pending || Number(pending.id) !== requestedClaimId) return early({ err: 'Offline claim is not pending.' }, 409);
      appliedClaim = known;
    }
  }

  const next = row.version + 1;
  // v416 (CPU): a sync that changed none of the denormalised columns must not rewrite them on the
  // leaderboard's behalf. `saves.level/cls/zeny/kills_total/playtime` are recomputed from the blob on
  // every accepted save, and a background tab syncing every minute usually changed none of them -
  // the row was rewritten with identical values and the columns' triggers fired for nothing. The
  // numbers still come from the server's own `publicFields`, never from the client object, and the
  // comparison is against the row just read under `version`, so a conflict still fails the guard
  // instead of silently skipping a write. `rate_kph` is included because it is a stored measurement,
  // not a player-visible ranking: if it moved, the row is written.
  // v422: the smoothed rate re-bases across a class/run boundary (see updatedRate). The stored
  // save's run travels in `storedStamp` - the top-level parse this handler already made - so the
  // comparison costs no extra parse. A save from before runs were numbered (no runGen on either
  // side) never trips the boundary: only two numbered, DIFFERENT runs do.
  const storedRunGen = storedStamp ? runGenOf(storedStamp.runGen) : null;
  const incomingRunGen = runGenOf(save.runGen);
  const ownerChanged = (pub.cls ?? null) !== (row.cls ?? null)
    || (storedRunGen !== null && incomingRunGen !== null && storedRunGen !== incomingRunGen);
  const rateKph = updatedRate(row, pub, savedAt, appliedClaim, ownerChanged);
  const update = saveColumnsUnchanged(row, pub, rateKph)
    ? db.updateSaveVersionStatement(D, user.id, next, stored, savedAt, row.version)
    : db.updateSaveStatement(D, user.id, next, stored, savedAt, pub, rateKph, row.version);

  if (appliedClaim) {
    // D1 batch runs both writes atomically. A version race cannot consume a claim without saving
    // the claim ID in the exact blob, and the pending-only index prevents duplicate issue.
    const ack = db.markOfflineClaimStatement(D, user.id, requestedClaimId, savedAt, next, stored);
    const results = await D.batch([update, ack]);
    const changed = Number(results?.[0]?.meta?.changes ?? results?.[0]?.meta?.rows_written ?? 0);
    const acknowledged = Number(results?.[1]?.meta?.changes ?? results?.[1]?.meta?.rows_written ?? 0);
    if (!changed || !acknowledged) {
      const latest = await db.saveByUser(D, user.id);
      return early({ conflict: true, version: latest?.version ?? row.version, blob: blobForClient(latest?.blob ?? row.blob, format, latest ? parseSave(latest.blob) : storedStamp),
        savedAt: latest?.saved_at ?? row.saved_at, updatedAt: latest?.updated_at ?? row.updated_at,
        offlineClaim: publicClaim(await db.pendingOfflineClaim(D, user.id)) }, 409);
    }
  } else {
    const result = await update.run();
    if (!Number(result?.meta?.changes)) {
      const latest = await db.saveByUser(D, user.id);
      return early({ conflict: true, version: latest?.version ?? row.version, blob: blobForClient(latest?.blob ?? row.blob, format, latest ? parseSave(latest.blob) : storedStamp),
        savedAt: latest?.saved_at ?? row.saved_at, updatedAt: latest?.updated_at ?? row.updated_at,
        offlineClaim: publicClaim(await db.pendingOfflineClaim(D, user.id)) }, 409);
    }
  }

  // This board is explicitly unverified: a browser-authored save is not proof of a score.
  await observeDamage();
  await auditSave(); // static invariants + rate since `row`, credits for claims and grants
  const leaderboardSynced = await updateLeaderboard();
  if (next % HISTORY_EVERY === 0) {
    await db.pushHistory(D, user.id, next, stored, savedAt);
    await db.trimHistory(D, user.id, 5);
  }
  return json({ version: next, bytes: stored.length, offlineClaimId: appliedClaim ? requestedClaimId : null, leaderboardPending: !leaderboardSynced });
});
