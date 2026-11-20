// Player-character Rift Raid API.
//
// D1 owns the daily entry reservation, the settlement ledger and a recovery checkpoint. The existing
// Social Durable Object owns live HP/lanes/cooldowns/action receipts. There is no raid alarm, tick
// loop or per-second message: every request below is caused by a player opening the lobby, taking an
// action, reconnecting or settling a result.
import { currentUser } from '../_lib/auth.js';
import { json, guard, readJson, fail, unauth } from '../_lib/http.js';
import { saveBelongsTo } from '../_lib/validate.js';
import * as db from '../_lib/db.js';
import {
  RAID_RULES, RAID_CARDS, RAID_CARD_KEYS, raidDayKey, raidPartySize, raidTotalHp, raidPhaseHp,
  raidRuleSummary, raidCardRank, raidCardByKey, rollRaidCard,
  rollRaidClear, rollPityChest, rollFracturedChest, raidMeaningful,
} from '../_lib/raid-rules.js';
import {
  decodeRaidSave, raidProfileFromSave, raidProfileFingerprint, sanitizeRaidProfile, applyRaidCard,
} from '../_lib/raid-profile.js';
import { RAID_ACTION_ID_RE } from '../_lib/raid-engine.js';

const now = () => Date.now();
const int = (n, lo = 0, hi = Number.MAX_SAFE_INTEGER) => Math.max(lo, Math.min(hi, Math.floor(Number(n) || 0)));
const safeJson = value => {
  try { const x = JSON.parse(String(value || '{}')); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; }
};
const actionIdString = v => typeof v === 'string' && RAID_ACTION_ID_RE.test(v);
const runIdString = v => typeof v === 'string' && /^[A-Za-z0-9:_-]{8,120}$/.test(v);

function enabled(env) {
  return RAID_RULES.enabled || env?.RAID_ENABLED === 'true' || env?.RAID_ENABLED === true;
}
function disabledResponse() {
  return json({ ok: false, enabled: false, disabled: true, err: 'Rift Raid is not enabled on this server yet.' }, 403);
}
async function installed(env) {
  try { return await db.raidTablesInstalled(env.DB); } catch { return false; }
}
async function cardsFor(env, userId) {
  try {
    const rows = await db.raidCardsForUser(env.DB, userId);
    return Array.isArray(rows) ? rows : (rows?.results || []);
  } catch { return []; }
}

// The Pages Function reaches the Social room only through its private binding. The DO additionally
// checks the synthetic `social` host, so a public Worker URL cannot forge this identity header.
async function socialRequest(env, path, user, method = 'GET', body = null) {
  if (!env.SOCIAL || typeof env.SOCIAL.idFromName !== 'function') {
    return { ok: false, status: 503, data: { err: 'The raid room is unavailable in this preview.' } };
  }
  try {
    const stub = env.SOCIAL.get(env.SOCIAL.idFromName('world'));
    const headers = { 'X-Social-Identity': JSON.stringify({ id: user.id, username: user.username, gm: user.gm === true }) };
    let request;
    if (body !== null) {
      headers['Content-Type'] = 'application/json';
      request = new Request('https://social' + path, { method, headers, body: JSON.stringify(body) });
    } else {
      request = new Request('https://social' + path, { method, headers });
    }
    const response = await stub.fetch(request);
    const data = await response.json().catch(() => ({ err: 'Invalid raid room response.' }));
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.error('Raid Social request failed', error);
    return { ok: false, status: 503, data: { err: 'The raid room could not be reached.' } };
  }
}

async function memberSaveProfile(user, env) {
  const saved = await db.saveByUser(env.DB, user.id);
  if (!saved || !saved.blob || !saveBelongsTo(saved.blob, { id: user.id, userId: user.id, username: user.username })) {
    return { ok: false, reason: 'no-save' };
  }
  const state = decodeRaidSave(saved.blob);
  if (!state) return { ok: false, reason: 'bad-save' };
  const profile = raidProfileFromSave(state);
  if (!profile) return { ok: false, reason: 'bad-save' };
  const fingerprint = await raidProfileFingerprint(state);
  return { ok: true, saved, state, profile, fingerprint };
}

function publicCards(rows) {
  const byKey = new Map((Array.isArray(rows) ? rows : []).map(r => [r.card_key, r]));
  return RAID_CARDS.map(card => {
    const row = byKey.get(card.key) || {};
    const copies = int(row.copies);
    return {
      key: card.key,
      name: card.name,
      desc: card.desc,
      copies,
      rank: raidCardRank(copies),
      equipped: int(row.equipped) === 1,
    };
  });
}

function publicAccount(account, userId, entriesUsed, chests, activeRun, cards) {
  const a = account || {};
  const cardRows = publicCards(cards);
  return {
    userId: Number(userId),
    riftShards: int(a.rift_shards),
    qualifyingClears: int(a.qualifying_clears),
    soloClears: int(a.solo_clears),
    trioClears: int(a.trio_clears),
    supportClears: int(a.support_clears),
    entriesUsed,
    entriesLeft: Math.max(0, RAID_RULES.dailyEntries - entriesUsed),
    chestsToday: {
      total: int(chests?.total),
      pity: int(chests?.pity),
      fractured: int(chests?.fractured),
    },
    cards: cardRows,
    equippedCard: (cardRows.find(c => c.equipped) || {}).key || '',
    activeRun: activeRun || null,
  };
}

async function accountState(env, user) {
  const day = raidDayKey(now());
  const [account, entries, chests, cards] = await Promise.all([
    db.raidAccount(env.DB, user.id),
    db.raidDailyEntries(env.DB, user.id, day),
    db.raidDailyChests(env.DB, user.id, day),
    cardsFor(env, user.id),
  ]);
  const entriesUsed = int(entries?.n);
  return { day, account, entriesUsed, chests, cards: Array.isArray(cards) ? cards : (cards?.results || []) };
}

function eligibilityOf(entriesUsed, activeRun, saveProfile) {
  if (!saveProfile.ok) return { eligible: false, reason: saveProfile.reason === 'no-save' ? 'Sync a cloud save before joining.' : 'The cloud save could not be read.' };
  if (entriesUsed >= RAID_RULES.dailyEntries) return { eligible: false, reason: 'No daily entries left.' };
  if (activeRun) return { eligible: false, reason: 'Already in an active raid.' };
  return { eligible: true, reason: '' };
}

async function partyView(env, user) {
  const response = await socialRequest(env, '/raid/party', user);
  if (!response.ok) return { ok: false, status: response.status, err: response.data?.err || 'The raid lobby is unavailable.' };
  const party = response.data?.party || null;
  if (!party) return { ok: true, party: null };
  const day = raidDayKey(now());
  const members = [];
  for (const raw of Array.isArray(party.members) ? party.members : []) {
    const id = Number(raw.id);
    const [entries, active, saved, cardRows] = await Promise.all([
      db.raidDailyEntries(env.DB, id, day),
      db.raidActiveForUser(env.DB, id),
      db.saveByUser(env.DB, id),
      cardsFor(env, id),
    ]);
    let profile = { ok: false, reason: 'no-save' };
    let fingerprint = '';
    if (saved?.blob && saveBelongsTo(saved.blob, { id, userId: id, username: raw.name })) {
      const state = decodeRaidSave(saved.blob);
      if (state) {
        const p = raidProfileFromSave(state);
        if (p) {
          profile = { ok: true, profile: applyRaidCard(p, Array.isArray(cardRows) ? cardRows : (cardRows?.results || [])) };
          fingerprint = await raidProfileFingerprint(state);
        }
      }
    }
    const entriesUsed = int(entries?.n);
    const stale = !!raw.readyFingerprint && !!fingerprint && raw.readyFingerprint !== fingerprint;
    const elig = eligibilityOf(entriesUsed, active, profile);
    members.push({
      id,
      name: raw.name,
      ready: raw.ready === true && elig.eligible && !stale,
      readyStored: raw.ready === true,
      fingerprintStale: stale,
      eligible: elig.eligible,
      reason: stale ? 'Combat loadout changed - ready again.' : elig.reason,
      entriesUsed,
      entriesLeft: Math.max(0, RAID_RULES.dailyEntries - entriesUsed),
      hasSave: profile.ok,
      activeRun: !!active,
      cls: profile.ok ? profile.profile.cls : null,
      magic: profile.ok ? profile.profile.magic : null,
      maxHp: profile.ok ? profile.profile.maxHp : null,
      dps: profile.ok ? profile.profile.dps : null,
      cardKey: profile.ok ? (profile.profile.cardKey || '') : '',
      cardRank: profile.ok ? int(profile.profile.cardRank) : 0,
      look: raw.look || null,
    });
  }
  const self = members.find(m => m.id === user.id) || null;
  const allReady = members.length >= 2 && members.length <= 3 && members.every(m => m.ready);
  const allEligible = members.length >= 2 && members.length <= 3 && members.every(m => m.eligible);
  return {
    ok: true,
    party: {
      id: String(party.id),
      leader: Number(party.leader),
      open: party.open === true,
      members,
      isLeader: Number(party.leader) === user.id,
      allReady,
      allEligible,
      canStart: Number(party.leader) === user.id && party.open === true && allReady && allEligible,
      self,
    },
  };
}

async function loadActiveRun(env, user) {
  const row = await db.raidActiveForUser(env.DB, user.id);
  if (!row) return { ok: true, run: null, error: '' };
  const snapshot = await socialRequest(env, '/raid/snapshot', user, 'POST', { runId: row.id });
  if (snapshot.ok) return { ok: true, run: snapshot.data?.run || null, error: '' };
  if (snapshot.status === 404) {
    const recovered = await recoverRun(env, user, row);
    if (recovered.ok) return { ok: true, run: recovered.run, error: '' };
    return { ok: false, run: null, error: recovered.err || 'The active raid could not be recovered.' };
  }
  return { ok: false, run: null, error: snapshot.data?.err || 'The active raid state is temporarily unavailable.' };
}

function installPayload(run, members, checkpoint = null) {
  if (checkpoint && typeof checkpoint === 'object' && checkpoint.id === run.id) return checkpoint;
  return {
    id: run.id,
    leaderId: Number(run.leader_id),
    partyId: null,
    partySize: Number(run.party_size),
    totalHp: Number(run.total_hp),
    phaseHps: raidPhaseHp(Number(run.total_hp)),
    phaseNames: RAID_RULES.phaseNames,
    startedAt: Number(run.started_at),
    deadlineAt: Number(run.deadline_at),
    bossArmor: RAID_RULES.bossArmor,
    seed: Number(run.seed) || 1,
    members: (members.results || []).map(x => ({
      id: Number(x.user_id),
      name: String(x.display_name || 'Adventurer').slice(0, 32),
      profile: sanitizeRaidProfile(safeJson(x.profile_json)),
    })),
  };
}

async function recoverRun(env, user, run) {
  const roster = await db.raidRunMembers(env.DB, run.id);
  if (!roster.results?.some(x => Number(x.user_id) === user.id)) {
    return { ok: false, status: 403, err: 'You were not part of this raid.' };
  }
  const checkpoint = safeJson(run.checkpoint_json);
  const payload = installPayload(run, roster, checkpoint);
  const restored = await socialRequest(env, '/raid/restore', user, 'POST', payload);
  if (!restored.ok) return { ok: false, status: restored.status, err: restored.data?.err || 'The raid room could not restore this run.' };
  const snapshot = await socialRequest(env, '/raid/snapshot', user, 'POST', { runId: run.id });
  if (!snapshot.ok) return { ok: false, status: snapshot.status, err: snapshot.data?.err || 'The restored raid could not be read.' };
  return { ok: true, run: snapshot.data?.run || restored.data?.run || null, recoveredFrom: checkpoint?.id ? 'checkpoint' : 'install' };
}

async function writeCheckpoint(env, runId, checkpoint) {
  if (!checkpoint || checkpoint.id !== runId) return false;
  const at = int(checkpoint.updatedAt, now());
  try {
    await db.raidRunCheckpointStatement(env.DB, { runId, checkpointAt: at, checkpoint }).run();
    return true;
  } catch (error) {
    console.error('Raid checkpoint write failed', error);
    return false;
  }
}

async function startRaid(env, user, body) {
  if (!(await installed(env))) return { ok: false, status: 503, data: { err: 'Rift Raid D1 migration is not installed.', installed: false } };
  const mode = body.mode === 'party' ? 'party' : 'solo';
  const existing = await db.raidActiveForUser(env.DB, user.id);
  if (existing) {
    const recovered = await recoverRun(env, user, existing);
    if (recovered.ok) return { ok: true, status: 200, data: { ok: true, resumed: true, runId: existing.id, run: recovered.run } };
    return { ok: false, status: 409, data: { err: 'You already have an active raid that could not be resumed yet.', runId: existing.id } };
  }

  let roster = [{ id: user.id, name: user.username }];
  let party = null;
  if (mode === 'party') {
    const view = await partyView(env, user);
    if (!view.ok) return { ok: false, status: view.status || 503, data: { err: view.err } };
    party = view.party;
    if (!party) return { ok: false, status: 409, data: { err: 'Create or join a Rift Raid party in the Social Hub first.' } };
    if (!party.isLeader) return { ok: false, status: 409, data: { err: 'Only the party leader can start the group raid.' } };
    if (!party.open) return { ok: false, status: 409, data: { err: 'This party is already running or closed.' } };
    if (party.members.length < 2 || party.members.length > 3) {
      return { ok: false, status: 409, data: { err: 'A group raid needs two or three characters.' } };
    }
    if (!party.allEligible) {
      return { ok: false, status: 409, data: { err: 'Not every party member is eligible. Each needs a cloud save and a remaining entry.' } };
    }
    if (!party.allReady) {
      // The Social room owns the ready flags. A stale loadout or ineligible member must not start.
      await socialRequest(env, '/raid/readiness-reset', user, 'POST', {});
      return { ok: false, status: 409, data: { err: 'Every party member must ready up, and readiness resets when a roster or loadout changes.' } };
    }
    roster = party.members.map(m => ({ id: m.id, name: m.name }));
  }

  const profiles = [];
  for (const member of roster) {
    const loaded = await memberSaveProfile(member, env);
    if (!loaded.ok) {
      return { ok: false, status: 409, data: { err: `${member.name} needs an up-to-date cloud save before the raid can start.` } };
    }
    const entries = await db.raidDailyEntries(env.DB, member.id, raidDayKey(now()));
    if (int(entries?.n) >= RAID_RULES.dailyEntries) {
      return { ok: false, status: 429, data: { err: `${member.name} has used both raid entries for today.` } };
    }
    const active = await db.raidActiveForUser(env.DB, member.id);
    if (active) return { ok: false, status: 409, data: { err: `${member.name} already has an active raid.` } };
    const cardRows = await cardsFor(env, member.id);
    profiles.push(applyRaidCard(loaded.profile, Array.isArray(cardRows) ? cardRows : (cardRows?.results || [])));
  }

  const at = now();
  const partySize = raidPartySize(roster.length);
  if (!partySize) return { ok: false, status: 400, data: { err: 'Invalid raid party size.' } };
  const totalHp = raidTotalHp(partySize);
  const phaseHps = raidPhaseHp(totalHp);
  const seconds = partySize === 1 ? RAID_RULES.clearTargetSeconds.solo : RAID_RULES.clearTargetSeconds.group;
  const runId = 'raid:' + crypto.randomUUID();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  const startedAt = at;
  const deadlineAt = at + seconds * 1000;
  const payload = {
    id: runId,
    leaderId: user.id,
    partyId: party?.id || null,
    partySize,
    totalHp,
    phaseHps,
    phaseNames: RAID_RULES.phaseNames,
    startedAt,
    deadlineAt,
    bossArmor: RAID_RULES.bossArmor,
    seed,
    members: roster.map((m, i) => ({ id: m.id, name: m.name, profile: profiles[i] })),
  };

  const statements = [db.raidRunInsertStatement(env.DB, {
    id: runId, leaderId: user.id, partySize, totalHp, seed, startedAt, deadlineAt,
    checkpoint: payload,
  })];
  for (let i = 0; i < roster.length; i++) {
    statements.push(db.raidRunMemberInsertStatement(env.DB, {
      runId, userId: roster[i].id, name: roster[i].name, profile: profiles[i],
    }));
  }
  for (const member of roster) {
    statements.push(db.raidEntryInsertStatement(env.DB, {
      userId: member.id, dayKey: raidDayKey(at), runId, enteredAt: at,
    }));
  }
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes('raid_daily_entry_limit')) return { ok: false, status: 429, data: { err: 'A party member has used both raid entries for today. Nothing was reserved.' } };
    if (message.includes('raid_active_run')) return { ok: false, status: 409, data: { err: 'A party member already has an active raid. Nothing was reserved.' } };
    console.error('Raid start transaction failed', error);
    return { ok: false, status: 503, data: { err: 'The raid could not reserve every entry. Nothing was charged.' } };
  }

  const install = await socialRequest(env, '/raid/install', user, 'POST', payload);
  if (!install.ok) {
    if (install.status >= 400 && install.status < 500) {
      try { await env.DB.batch([...db.raidRunDeleteStatements(env.DB, runId)]); } catch (error) { console.error('Raid reservation rollback failed', error); }
      return { ok: false, status: install.status, data: { err: install.data?.err || 'The raid room rejected the roster. Your entries were restored.' } };
    }
    // The DO may have accepted an install whose response was lost. Keep the reservation and recover
    // the exact run on the next state/action request instead of refunding into a ghost run.
    return { ok: false, status: 503, data: {
      err: 'The run was reserved, but the raid room did not confirm. Retry Rift Raid; your entries will not be charged twice.',
      runId, reserved: true,
    } };
  }
  const returnedRun = install.data?.run || null;
  if (install.data?.checkpoint) {
    await writeCheckpoint(env, runId, install.data.checkpoint);
  } else if (returnedRun) {
    const rosterRows = await db.raidRunMembers(env.DB, runId);
    const full = installPayload(rowFromPayload(payload), rosterRows, null);
    await writeCheckpoint(env, runId, full);
  }
  return { ok: true, status: 200, data: {
    ok: true, runId, run: returnedRun, partySize, totalHp, phaseHps, deadlineAt,
    entriesLeft: Math.max(0, RAID_RULES.dailyEntries - int((await db.raidDailyEntries(env.DB, user.id, raidDayKey(at)))?.n)),
  } };
}

// A small adapter so the initial checkpoint has the D1 row's field names without re-reading it.
function rowFromPayload(payload) {
  return {
    id: payload.id, leader_id: payload.leaderId, party_size: payload.partySize,
    total_hp: payload.totalHp, started_at: payload.startedAt, deadline_at: payload.deadlineAt,
    seed: payload.seed,
  };
}

async function actionRun(env, user, body) {
  const runId = body.runId;
  const combatAction = String(body.combatAction || '');
  const actionId = body.actionId;
  if (!runIdString(runId) || !['strike', 'dodge', 'ward', 'heal', 'revive', 'move'].includes(combatAction) || !actionIdString(actionId)) {
    return { ok: false, status: 400, data: { err: 'Invalid raid action.' } };
  }
  const run = await db.raidRun(env.DB, runId);
  const member = run && await db.raidRunMember(env.DB, runId, user.id);
  if (!run || !member) return { ok: false, status: 403, data: { err: 'You are not in that raid.' } };
  if (run.state !== 'active') {
    const settled = await settleRun(env, user, runId);
    return settled.ok ? { ok: true, status: 200, data: settled.data } : settled;
  }
  const request = { runId, action: combatAction, actionId };
  if (body.zone !== undefined) request.zone = String(body.zone);
  if (body.targetId !== undefined) request.targetId = int(body.targetId, 0);
  let result = await socialRequest(env, '/raid/action', user, 'POST', request);
  if (!result.ok && result.status === 404) {
    const recovered = await recoverRun(env, user, run);
    if (recovered.ok) result = await socialRequest(env, '/raid/action', user, 'POST', request);
  }
  if (!result.ok) return { ok: false, status: result.status, data: result.data };
  // A lane step can happen several times a second; the D1 checkpoint is a recovery aid, not the
  // movement log. The DO still persists the authoritative position on every accepted action.
  if (result.data?.checkpoint && combatAction !== 'move') await writeCheckpoint(env, runId, result.data.checkpoint);
  const live = result.data?.run;
  if (live && ['cleared', 'failed'].includes(live.state)) {
    const settled = await settleRun(env, user, runId);
    if (settled.ok) return { ok: true, status: 200, data: { ...result.data, settlement: settled.data } };
  }
  return { ok: true, status: 200, data: result.data };
}

function validateTerminalSnapshot(run, snapshot, roster) {
  if (!snapshot || snapshot.id !== run.id || Number(snapshot.partySize) !== Number(run.party_size) || Number(snapshot.totalHp) !== Number(run.total_hp)) {
    return 'Raid state did not match its D1 record.';
  }
  if (Number(snapshot.startedAt) !== Number(run.started_at) || Number(snapshot.deadlineAt) !== Number(run.deadline_at)) {
    return 'The raid clock changed unexpectedly.';
  }
  if (!['cleared', 'failed'].includes(snapshot.state)) return 'The raid is still active.';
  const rosterIds = (roster.results || []).map(x => Number(x.user_id)).sort((a, b) => a - b);
  const snapIds = (snapshot.members || []).map(x => Number(x.id)).sort((a, b) => a - b);
  if (rosterIds.length !== Number(run.party_size) || snapIds.length !== rosterIds.length || rosterIds.some((id, i) => id !== snapIds[i])) {
    return 'Raid roster mismatch.';
  }
  const finishedAt = Number(snapshot.finishedAt);
  if (!Number.isFinite(finishedAt) || finishedAt < Number(run.started_at) || finishedAt > Number(run.deadline_at)) {
    return 'This result did not finish inside the raid time limit.';
  }
  if (snapshot.state === 'cleared' && Number(snapshot.hpRemaining) !== 0) return 'Invalid cleared-run state.';
  return '';
}

async function ackRun(env, user, runId, settledAt) {
  const ack = await socialRequest(env, '/raid/ack', user, 'POST', { runId, settledAt });
  return ack.ok;
}

async function settleRun(env, user, runId) {
  const run = await db.raidRun(env.DB, runId);
  if (!run) return { ok: false, status: 404, data: { err: 'Raid run not found.' } };
  const member = await db.raidRunMember(env.DB, runId, user.id);
  if (!member) return { ok: false, status: 403, data: { err: 'You were not part of this raid.' } };

  const previous = await db.raidSettlement(env.DB, runId);
  if (previous) {
    const [rows, cardRows] = await Promise.all([
      db.raidRewardsForUser(env.DB, runId, user.id),
      db.raidCardDropsForUser(env.DB, runId, user.id),
    ]);
    const acknowledged = await ackRun(env, user, runId, Number(previous.settled_at));
    return { ok: true, status: 200, data: {
      ok: true, outcome: previous.outcome, settledAt: Number(previous.settled_at),
      rewards: rows.results.map(r => ({ kind: r.kind, ...safeJson(r.payload) })),
      cards: (Array.isArray(cardRows) ? cardRows : (cardRows?.results || [])).map(r => ({ kind: r.kind, cardKey: r.card_key })),
      acknowledged,
    } };
  }

  const snapshotResponse = await socialRequest(env, '/raid/snapshot', user, 'POST', { runId });
  if (!snapshotResponse.ok) {
    // A failed read is NOT an empty/failed encounter. Keep the reservation and the terminal result;
    // the caller retries settlement.
    return { ok: false, status: 503, data: { err: snapshotResponse.data?.err || 'The raid room could not confirm this result. Retry settlement.' } };
  }
  const snapshot = snapshotResponse.data?.run;
  const roster = await db.raidRunMembers(env.DB, runId);
  const invalid = validateTerminalSnapshot(run, snapshot, roster);
  if (invalid) return { ok: false, status: 409, data: { err: invalid, run: snapshot } };
  if (snapshot.state === 'active') return { ok: false, status: 409, data: { ok: false, active: true, run: snapshot } };

  const settledAt = now();
  const isClear = snapshot.state === 'cleared';
  const outcome = isClear ? 'clear' : 'failed';
  const snapshotById = new Map((snapshot.members || []).map(x => [Number(x.id), x]));
  const statements = [];
  const myRewards = [];
  const myCards = [];
  const statementsNeeded = [];
  for (const row of roster.results || []) {
    const id = Number(row.user_id);
    const live = snapshotById.get(id) || {};
    const profile = safeJson(row.profile_json);
    const meaningful = raidMeaningful({
      damage: live.damage, support: live.support, maxHp: profile.maxHp,
      totalHp: run.total_hp, actions: live.actions,
    });
    statementsNeeded.push(db.raidAccountEnsureStatement(env.DB, id, settledAt));
    statements.push(db.raidRunContributionStatement(env.DB, {
      runId, userId: id, damage: live.damage, support: live.support, actions: live.actions,
      dodges: live.dodges, downs: live.downs, meaningful,
    }));
    const base = { partySize: Number(run.party_size), support: int(live.support), damage: int(live.damage), actions: int(live.actions), snapshot: 1 };
    if (isClear) {
      const clear = rollRaidClear({ partySize: Number(run.party_size), rng: Math.random });
      const fractured = rollFracturedChest({ partySize: Number(run.party_size), rng: Math.random });
      statements.push(db.raidRewardLedgerInsertStatement(env.DB, {
        runId, userId: id, kind: 'clear', payload: { ...clear.rewards, ...base }, createdAt: settledAt,
      }));
      statements.push(db.raidChestInsertStatement(env.DB, {
        runId, userId: id, dayKey: raidDayKey(settledAt), kind: 'fractured',
        payload: { ...fractured, ...base }, createdAt: settledAt,
      }));
      for (const kind of ['clear', 'fractured']) {
        const card = rollRaidCard({ kind, rng: Math.random });
        statements.push(db.raidCardDropInsertStatement(env.DB, {
          runId, userId: id, kind, cardKey: card.key, createdAt: settledAt,
        }));
        if (id === user.id) myCards.push({ kind, cardKey: card.key, name: card.name });
      }
      if (id === user.id) myRewards.push({ kind: 'clear', ...clear.rewards, ...base }, { kind: 'fractured', ...fractured, ...base });
    } else {
      const pity = rollPityChest({ partySize: Number(run.party_size), rng: Math.random });
      statements.push(db.raidChestInsertStatement(env.DB, {
        runId, userId: id, dayKey: raidDayKey(settledAt), kind: 'pity',
        payload: { ...pity, ...base }, createdAt: settledAt,
      }));
      const card = rollRaidCard({ kind: 'pity', rng: Math.random });
      statements.push(db.raidCardDropInsertStatement(env.DB, {
        runId, userId: id, kind: 'pity', cardKey: card.key, createdAt: settledAt,
      }));
      if (id === user.id) {
        myRewards.push({ kind: 'pity', ...pity, ...base });
        myCards.push({ kind: 'pity', cardKey: card.key, name: card.name });
      }
    }
  }
  const result = {
    state: snapshot.state,
    hpRemaining: snapshot.hpRemaining,
    finishedAt: snapshot.finishedAt,
    settledAt,
  };
  statements.unshift(
    db.raidSettlementInsertStatement(env.DB, { runId, outcome, settledAt, result }),
    db.raidRunSettleStatement(env.DB, { runId, outcome: isClear ? 'cleared' : 'failed', settledAt, result }),
  );
  statements.unshift(...statementsNeeded);
  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error('Raid settlement transaction failed', error);
    return { ok: false, status: 503, data: { err: 'The raid result could not be recorded. Retry settlement; no reward is paid twice.' } };
  }
  // Read back the ledger instead of echoing a freshly rolled local amount: a simultaneous
  // settlement may have won the UNIQUE insert with a different (but valid) roll. The client must
  // display exactly what D1 paid, not a second roll that was ignored.
  let paid = myRewards;
  let paidCards = myCards;
  try {
    const [rows, cardRows] = await Promise.all([
      db.raidRewardsForUser(env.DB, runId, user.id),
      db.raidCardDropsForUser(env.DB, runId, user.id),
    ]);
    if (rows?.results?.length) paid = rows.results.map(r => ({ kind: r.kind, ...safeJson(r.payload) }));
    const cardList = Array.isArray(cardRows) ? cardRows : (cardRows?.results || []);
    if (cardList.length) paidCards = cardList.map(r => ({ kind: r.kind, cardKey: r.card_key }));
  } catch (error) {
    console.error('Raid reward readback failed', error);
  }
  const acknowledged = await ackRun(env, user, runId, settledAt);
  return { ok: true, status: 200, data: {
    ok: true, outcome, settledAt, rewards: paid, cards: paidCards, acknowledged,
    outcomeState: snapshot.state, finishedAt: snapshot.finishedAt,
  } };
}

async function getState(env, user, url) {
  if (!(await installed(env))) return json({ ok: false, installed: false, err: 'Rift Raid D1 migration is not installed.' }, 503);
  const { day, account, entriesUsed, chests, cards } = await accountState(env, user);
  const [active, selfSave] = await Promise.all([loadActiveRun(env, user), memberSaveProfile(user, env)]);
  // If a member was offline when the run ended, expose the recent settled run so the client can
  // call settle and render the exact D1-paid rewards. The active path wins when both exist.
  const recent = !active.run ? await db.raidRecentSettledForUser(env.DB, user.id, now() - 15 * 60 * 1000) : null;
  const runId = url?.searchParams?.get('runId');
  let requestedRun = null;
  if (runId) {
    if (!runIdString(runId)) return fail('Invalid raid run id.', 400);
    const member = await db.raidRunMember(env.DB, runId, user.id);
    if (!member) return fail('You were not part of this raid.', 403);
    const snapshot = await socialRequest(env, '/raid/snapshot', user, 'POST', { runId });
    if (!snapshot.ok) return json({ ok: false, err: snapshot.data?.err || 'Raid state is unavailable.' }, snapshot.status || 503);
    requestedRun = snapshot.data?.run || null;
  }
  let party = null;
  if (url?.searchParams?.get('party') === '1') {
    const view = await partyView(env, user);
    if (view.ok) party = view.party;
    else party = { error: view.err };
  }
  return json({
    ok: true,
    enabled: true,
    rules: raidRuleSummary(),
    day,
    account: publicAccount(account, user.id, entriesUsed, chests, active.run, cards),
    activeRun: active.run,
    activeRunError: active.error || '',
    lastRun: recent ? { id: recent.id, state: recent.state, settledAt: Number(recent.settled_at) || 0 } : null,
    requestedRun,
    party,
    eligibility: eligibilityOf(entriesUsed, active.run, selfSave),
    hasSave: selfSave.ok,
  });
}

async function readyAction(env, user, body) {
  if (!(await installed(env))) return { ok: false, status: 503, data: { err: 'Rift Raid D1 migration is not installed.' } };
  const ready = body.ready === true;
  let fingerprint = '';
  if (ready) {
    const loaded = await memberSaveProfile(user, env);
    if (!loaded.ok) return { ok: false, status: 409, data: { err: 'Sync your cloud save before readying.' } };
    fingerprint = loaded.fingerprint;
    const day = raidDayKey(now());
    const entries = await db.raidDailyEntries(env.DB, user.id, day);
    if (int(entries?.n) >= RAID_RULES.dailyEntries) return { ok: false, status: 429, data: { err: 'You have no raid entries left today.' } };
    const active = await db.raidActiveForUser(env.DB, user.id);
    if (active) return { ok: false, status: 409, data: { err: 'Finish your active raid before readying again.' } };
  }
  const result = await socialRequest(env, '/raid/ready', user, 'POST', { ready, fingerprint });
  if (!result.ok) return { ok: false, status: result.status, data: result.data };
  const view = await partyView(env, user);
  return { ok: true, status: 200, data: { ok: true, party: view.ok ? view.party : null } };
}

async function cardAction(env, user, body) {
  if (!(await installed(env))) return { ok: false, status: 503, data: { err: 'Rift Raid D1 migration is not installed.', installed: false } };
  const key = typeof body.cardKey === 'string' ? body.cardKey : '';
  if (key && !RAID_CARD_KEYS.includes(key)) return { ok: false, status: 400, data: { err: 'Unknown raid card.' } };
  if (key) {
    const row = await db.raidCardForUser(env.DB, user.id, key);
    if (!row || int(row.copies) < 1) return { ok: false, status: 409, data: { err: 'You do not own that raid card yet.' } };
  }
  await env.DB.batch(db.raidSetEquippedCardStatements(env.DB, user.id, key, now()));
  const { account, entriesUsed, chests, cards } = await accountState(env, user);
  return { ok: true, status: 200, data: {
    ok: true,
    account: publicAccount(account, user.id, entriesUsed, chests, null, cards),
  } };
}

export const onRequestGet = guard(async ({ request, env }) => {
  if (!enabled(env)) return disabledResponse();
  const user = await currentUser(request, env.DB);
  if (!user) return await unauth(request);
  return await getState(env, user, new URL(request.url));
});

export const onRequestPost = guard(async ({ request, env }) => {
  if (!enabled(env)) return disabledResponse();
  const user = await currentUser(request, env.DB);
  if (!user) return await unauth(request);
  if (user.banned) return fail('This account is suspended.', 403);
  const body = await readJson(request, 4096);
  const action = String(body.action || '');
  if (action === 'start') {
    const r = await startRaid(env, user, body);
    return json(r.data, r.status);
  }
  if (action === 'ready') {
    const r = await readyAction(env, user, body);
    return json(r.data, r.status);
  }
  if (action === 'party') {
    if (!(await installed(env))) return fail('Rift Raid D1 migration is not installed.', 503, { installed: false });
    const partyAction = String(body.partyAction || 'join');
    let path = '/raid/party/join';
    let payload = {};
    if (partyAction === 'leave') path = '/raid/party/leave';
    else if (partyAction === 'open') { path = '/raid/party/open'; payload = { open: body.open !== false }; }
    else if (partyAction !== 'join') return fail('Unknown party action.', 400);
    const result = await socialRequest(env, path, user, 'POST', payload);
    if (!result.ok) return json(result.data, result.status);
    const view = await partyView(env, user);
    return json({ ok: true, party: view.ok ? view.party : null });
  }
  if (action === 'act') {
    if (!(await installed(env))) return fail('Rift Raid D1 migration is not installed.', 503, { installed: false });
    const r = await actionRun(env, user, body);
    return json(r.data, r.status);
  }
  if (action === 'settle') {
    if (!runIdString(body.runId)) return fail('Invalid raid run id.', 400);
    if (!(await installed(env))) return fail('Rift Raid D1 migration is not installed.', 503, { installed: false });
    const r = await settleRun(env, user, body.runId);
    return json(r.data, r.status);
  }
  if (action === 'sync') {
    if (!runIdString(body.runId)) return fail('Invalid raid run id.', 400);
    const member = await db.raidRunMember(env.DB, body.runId, user.id);
    if (!member) return fail('You were not part of this raid.', 403);
    const snapshot = await socialRequest(env, '/raid/snapshot', user, 'POST', { runId: body.runId });
    if (!snapshot.ok) return json({ ok: false, err: snapshot.data?.err || 'Raid state is unavailable.' }, snapshot.status || 503);
    return json({ ok: true, run: snapshot.data?.run || null });
  }
  if (action === 'card') {
    const r = await cardAction(env, user, body);
    return json(r.data, r.status);
  }
  if (action === 'state') return await getState(env, user, new URL(request.url));
  return fail('Unknown raid action.', 400);
});

export const _raidTest = {
  startRaid, actionRun, settleRun, getState, partyView, recoverRun, memberSaveProfile, cardAction,
  validateTerminalSnapshot, installPayload, writeCheckpoint, enabled,
};
