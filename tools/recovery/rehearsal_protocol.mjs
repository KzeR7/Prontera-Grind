// EXPERIMENTAL, SYNTHETIC-ONLY recovery protocol. Never connect this to Cloudflare.
// A mock adapter models ordering and failure stops; it cannot stop actual player
// writes or prove that D1 Time Travel/restore is safe. There is no live driver.
import assert from 'node:assert/strict';

export async function rehearseRecovery(adapter, chosen) {
  assert(adapter?.kind === 'synthetic-local-only', 'Only a synthetic local adapter is allowed.');
  assert(typeof chosen === 'string' && /^synthetic-[a-z0-9-]+$/.test(chosen), 'Invalid synthetic restore point.');
  let frozen = false, restored = false;
  try {
    await adapter.freeze();
    frozen = true;
    assert.equal(await adapter.isFrozen(), true, 'Pause not confirmed');
    // A frozen gate must reject new writes AND wait for already admitted work.
    // No lease expiry or forced clearing is modelled: uncertainty stops recovery.
    assert.equal(await adapter.drained(), true, 'Existing writes not drained');
    const checkpoint = await adapter.emergencyBackup();
    assert.equal(await adapter.verifyEmergencyBackup(checkpoint), true, 'Emergency backup unverified');
    assert.equal(await adapter.verifyRestorePoint(chosen), true, 'Selected point unverified');
    assert.equal(await adapter.ownerConfirmation(chosen), true, 'Owner did not confirm');
    await adapter.restore(chosen);
    restored = true;
    assert.equal(await adapter.verifyRestored(chosen), true, 'Post-restore verification failed');
    await adapter.resume();
    return {status:'synthetic restore verified', checkpoint};
  } catch (e) {
    // Never automatically resume on any failure after freezing, or retry a
    // potentially partial restore. The operator must inspect the situation.
    const stage = restored ? 'post-restore' : frozen ? 'before or during restore' : 'with pause unconfirmed';
    throw new Error(`Synthetic rehearsal stopped ${stage}; no automatic retry or resume. ${e.message}`);
  }
}
