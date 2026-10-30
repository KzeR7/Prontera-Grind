// Low-volume diagnostics only. These values originate in a browser-authored
// save; they cannot prove cheating, validate a leaderboard, ban anyone or
// affect a grant. No per-hit collection or 30%-average rule is implemented.
import * as db from './db.js';

export const DAMAGE_BUCKET_MS = 6 * 60 * 60 * 1000;
export const DAMAGE_SLOTS = 28;
// Copied from the old board's sanity cap, not coupled to future board changes.
export const ECHO_REVIEW_DPS = 100_000_000;
// This bounds storage/display, not a gameplay limit. A clipped number is
// displayed as >= the cap. The new Echo leaderboard does not use this limit;
// exceeding 100M is only a review flag, not proof that a score is impossible.
export const DAMAGE_REPORTED_CAP = 1_000_000_000_000;
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
  ? Math.min(value,DAMAGE_REPORTED_CAP) : null;
const integer = (value,max) => Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;

export function damageObservation(save) {
  const trial = save?.trial && typeof save.trial === 'object' && !Array.isArray(save.trial) ? save.trial : {};
  const board = trial.echoBoard && typeof trial.echoBoard === 'object' && !Array.isArray(trial.echoBoard) ? trial.echoBoard : {};
  const raw = [trial.best,board.dayDps,board.weekDps].filter(v=>typeof v==='number' && v>=0);
  const high = raw.some(v=>v>ECHO_REVIEW_DPS); // Infinity parsed from 1e999 is also flagged.
  const echo = raw.length ? Math.min(Math.max(...raw),DAMAGE_REPORTED_CAP) : null;
  return {map:integer(save?.mp,1000),stage:integer(save?.lvl,1000),
    totalDamage:number(save?.dmg),echoBest:echo,high,
    invalidTotal:typeof save?.dmg==='number' && (!Number.isFinite(save.dmg) || save.dmg<0)};
}

// Called only after an accepted cloud save; failures must never undo or reject
// a save which already committed. Identities are supplied by the session, not
// from the save. Repeated saves in one bucket do not create repeated sample or
// flag writes. GM users are not excluded; their testing can legitimately flag.
export async function recordDamageObservation(D,userId,save,at) {
  const observation=damageObservation(save),bucket=Math.floor(at/DAMAGE_BUCKET_MS),slot=bucket%DAMAGE_SLOTS;
  const sample=db.damageSampleStatement(D,{userId,slot,bucket,at,...observation});
  const alerts=[];
  if(observation.high) alerts.push(db.damageAlertStatement(D,{userId,at,kind:'echo-over-100m',value:observation.echoBest,bucketMs:DAMAGE_BUCKET_MS}));
  if(observation.invalidTotal) alerts.push(db.damageAlertStatement(D,{userId,at,kind:'invalid-total-damage',value:0,bucketMs:DAMAGE_BUCKET_MS}));
  if(alerts.length) await D.batch([sample,...alerts]);
  else await sample.run();
}
