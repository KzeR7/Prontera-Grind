// A legacy baseline is a copy of an accepted browser save, NOT proof of earned
// items or progression. Only existing equipment has been approved for grandfathering;
// storing other fields does not make them eligible. The owner chose this with
// this known limitation. Nothing here modifies the personal save or equipment.
// No HTTP endpoint, cutover scheduler, new-account onboarding or authoritative
// equipment mutation exists. Public activation is deliberately hard-disabled.
export async function captureCompetitionBaseline() {
  throw new Error('Competition baseline capture is paused until the cutover and authoritative inventory are ready.');
}

// Private SQL construction only, exported for disposable local tests. The
// eventual trusted service must obtain userId from an authenticated session,
// establish a server-controlled cutover and protect the baseline from mutation.
// NEVER accept cutoff/user/version policy as authority from an API caller.
// This conservative primitive will NOT capture a save updated after cutoff;
// unresolved offline/late saves need a separately reviewed transition policy.
export function buildBaselineCapture(db,{userId,version,cutoffAt,capturedAt}) {
  if(!Number.isSafeInteger(userId)||userId<1 || !Number.isSafeInteger(version)||version<1 ||
     !Number.isSafeInteger(cutoffAt)||cutoffAt<0 || !Number.isSafeInteger(capturedAt)||capturedAt<cutoffAt)
    throw new TypeError('Invalid baseline parameters');
  return db.prepare(`INSERT INTO competition_baselines(user_id,save_version,save_updated_at,cutoff_at,captured_at,policy,save_blob)
    SELECT s.user_id,s.version,s.updated_at,?,?, 'grandfathered-unverified-v1',s.blob
    FROM saves s JOIN users u ON u.id=s.user_id
    WHERE s.user_id=? AND s.version=? AND s.updated_at<=? AND u.created_at<=?
      AND ?<=CAST(strftime('%s','now') AS INTEGER)*1000
      AND json_valid(s.blob)
      AND (json_type(s.blob,'$.owner') IS NULL OR
        (json_type(s.blob,'$.owner')='text' AND lower(json_extract(s.blob,'$.owner'))=lower(u.username)))
    ON CONFLICT(user_id) DO NOTHING`)
    .bind(cutoffAt,capturedAt,userId,version,cutoffAt,cutoffAt,cutoffAt);
}
