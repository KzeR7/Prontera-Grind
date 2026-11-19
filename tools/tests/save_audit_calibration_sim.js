// save_audit_calibration_sim.js — tests for calibrated save-audit rules, lump payouts, class changes, and evidence.
import assert from 'node:assert/strict';
import { auditStaticSave, auditSaveRates, auditAcceptedSave, RULE_VERSION, ruleCategory } from '../../functions/_lib/save-audit.js';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

const test = (name, fn) => {
  try {
    fn();
    console.log('  ok  ', name);
  } catch (e) {
    console.error('  FAIL', name, '->', e?.stack || e);
    process.exitCode = 1;
  }
};

console.log('save_audit_calibration_sim: false-positive reduction & evidence calibration');

test('short-window lump rewards (shards, scrolls, zeny, early levels) produce no flags', () => {
  const prev = { kills: 1000, lv: 50, zeny: 1_000_000, raw: { shards: 100, refineScrolls: 10, mythicScrolls: 2, ori: 50, elu: 50 } };
  const next = { kills: 1500, lv: 55, zeny: 25_000_000, raw: { shards: 450, refineScrolls: 35, mythicScrolls: 12, ori: 200, elu: 200 } };
  const flags = auditSaveRates({ prev, next, elapsedMs: 120_000 });
  assert.deepStrictEqual(flags, []);
});

test('class change / restored class progression does not trigger level-rate', () => {
  const prev = { kills: 5000, lv: 15, zeny: 100_000, raw: { job: 'novice' } };
  const next = { kills: 5100, lv: 120, zeny: 100_000, raw: { job: 'assassin' } };
  const flags = auditSaveRates({ prev, next, elapsedMs: 120_000 });
  assert.strictEqual(flags.some(f => f.kind === 'level-rate'), false);
});

test('tampered structural & sustained rate fixtures still flag with structured evidence', () => {
  const badSave = { lv: 50, st: { str: 120 }, pts: 0, zeny: 1000, kills: 10 };
  const staticFlags = auditStaticSave(badSave);
  assert.ok(staticFlags.some(f => f.kind === 'stat-over-cap'));
  assert.strictEqual(ruleCategory('stat-over-cap'), 'structural');

  const prev = { kills: 1000, lv: 120, zeny: 0, raw: {} };
  const next = { kills: 50000, lv: 120, zeny: 0, raw: {} };
  const rateFlags = auditSaveRates({ prev, next, elapsedMs: 300_000 });
  const kr = rateFlags.find(f => f.kind === 'kill-rate');
  assert.ok(kr, 'sustained impossible kill-rate must still flag');
  assert.strictEqual(kr.category, 'heuristic');
  assert.strictEqual(kr.ruleVersion, RULE_VERSION);
  assert.strictEqual(kr.units, 'kills/hr');
  assert.strictEqual(kr.evidence.rawDelta, 49000);
});

test('30 accepted saves each adding 4,999 kills over 120s flag kill-rate via rolling window', async () => {
  const db = new DatabaseSync(':memory:');
  for (const f of fs.readdirSync('migrations').sort()) {
    if (f.endsWith('.sql')) {
      try { db.exec(fs.readFileSync('migrations/' + f, 'utf8')); } catch {}
    }
  }
  const D = {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        bind(...args) {
          return {
            run: async () => stmt.run(...args),
            first: async () => stmt.get(...args) || null,
            all: async () => ({ results: stmt.all(...args) }),
          };
        },
        run: async () => stmt.run(),
        first: async () => stmt.get() || null,
        all: async () => ({ results: stmt.all() }),
      };
    },
  };
  db.exec('PRAGMA foreign_keys = OFF;');
  let savedAt = 1_700_000_000_000;
  let kills = 1000;
  let flagged = false;
  for (let i = 0; i < 30; i++) {
    const prev = { saved_at: savedAt, kills_total: kills, level: 120, zeny: 0, blob: '{}' };
    savedAt += 120_000;
    kills += 4999;
    const res = await auditAcceptedSave(D, {
      userId: 42, username: 'Botter', gm: 0,
      prev, prevSave: {}, save: { lv: 120, kills, zeny: 0 },
      pub: { kills, lv: 120, zeny: 0 }, savedAt,
    });
    if (res.flagged) flagged = true;
  }
  assert.strictEqual(flagged, true, '30 saves of +4,999 kills over 120s must flag kill-rate');
});
