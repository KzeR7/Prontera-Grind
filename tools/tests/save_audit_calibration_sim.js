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

test('30 accepted saves adding 90M Zeny or 599 shards over 120s flag via rolling window', async () => {
  const db = new DatabaseSync(':memory:');
  for (const f of fs.readdirSync('migrations').sort()) {
    if (f.endsWith('.sql')) {
      try { db.exec(fs.readFileSync('migrations/' + f, 'utf8')); } catch {}
    }
  }
  db.exec('PRAGMA foreign_keys = OFF;');
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
  let savedAt = 1_700_000_000_000;
  let zeny = 0, shards = 0, flagged = false;
  for (let i = 0; i < 30; i++) {
    const prev = { saved_at: savedAt, kills_total: 0, level: 120, zeny, blob: JSON.stringify({ shards }) };
    savedAt += 120_000;
    zeny += 90_000_000;
    shards += 599;
    const res = await auditAcceptedSave(D, {
      userId: 43, username: 'Farmer', gm: 0,
      prev, prevSave: { shards: shards - 599 }, save: { lv: 120, kills: 0, zeny, shards },
      pub: { kills: 0, lv: 120, zeny }, savedAt,
    });
    if (res.flagged) flagged = true;
  }
  assert.strictEqual(flagged, true, '30 saves of +90M Zeny / +599 shards must flag');
});

test('legitimate +1,000 ore.ori purchase over 120s does not flag in auditAcceptedSave', async () => {
  const db = new DatabaseSync(':memory:');
  for (const f of fs.readdirSync('migrations').sort()) {
    if (f.endsWith('.sql')) {
      try { db.exec(fs.readFileSync('migrations/' + f, 'utf8')); } catch {}
    }
  }
  db.exec('PRAGMA foreign_keys = OFF;');
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
  const t0 = 1_700_000_000_000;
  const res = await auditAcceptedSave(D, {
    userId: 45, username: 'OreBuyer', gm: 0,
    prev: { saved_at: t0, kills_total: 0, level: 120, zeny: 0, blob: '{}' },
    prevSave: { ore: { ori: 0 } }, save: { lv: 120, kills: 0, zeny: 0, ore: { ori: 1000 } },
    pub: { kills: 0, lv: 120, zeny: 0 }, savedAt: t0 + 120_000,
  });
  assert.strictEqual(res.flagged, false, '+1,000 ore.ori within lump allowance must not flag');
});

test('cleared 10,000-kill alert stays cleared on zero-gain save, reopens on new 6,000-kill incident', async () => {
  const db = new DatabaseSync(':memory:');
  for (const f of fs.readdirSync('migrations').sort()) {
    if (f.endsWith('.sql')) {
      try { db.exec(fs.readFileSync('migrations/' + f, 'utf8')); } catch {}
    }
  }
  db.exec('PRAGMA foreign_keys = OFF;');
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
  const t0 = 1_700_000_000_000;
  await auditAcceptedSave(D, {
    userId: 44, username: 'Reopener', gm: 0,
    prev: { saved_at: t0, kills_total: 0, level: 120, zeny: 0, blob: '{}' },
    prevSave: {}, save: { lv: 120, kills: 10_000, zeny: 0 },
    pub: { kills: 10_000, lv: 120, zeny: 0 }, savedAt: t0 + 120_000,
  });
  db.prepare('UPDATE save_alerts SET cleared_at = ?, cleared_by = ? WHERE user_id = 44').run(t0 + 180_000, 'GM');
  // Zero-gain save 2 minutes later must NOT reopen the cleared alert.
  await auditAcceptedSave(D, {
    userId: 44, username: 'Reopener', gm: 0,
    prev: { saved_at: t0 + 120_000, kills_total: 10_000, level: 120, zeny: 0, blob: '{}' },
    prevSave: {}, save: { lv: 120, kills: 10_000, zeny: 0 },
    pub: { kills: 10_000, lv: 120, zeny: 0 }, savedAt: t0 + 240_000,
  });
  const stillCleared = db.prepare('SELECT cleared_at FROM save_alerts WHERE user_id = 44 AND kind = ?').get('kill-rate');
  assert.ok(stillCleared.cleared_at, 'zero-gain save must not reopen cleared alert');
  // New 6,000-kill incident later MUST reopen it.
  await auditAcceptedSave(D, {
    userId: 44, username: 'Reopener', gm: 0,
    prev: { saved_at: t0 + 240_000, kills_total: 10_000, level: 120, zeny: 0, blob: '{}' },
    prevSave: {}, save: { lv: 120, kills: 16_000, zeny: 0 },
    pub: { kills: 16_000, lv: 120, zeny: 0 }, savedAt: t0 + 360_000,
  });
  const row = db.prepare('SELECT cleared_at FROM save_alerts WHERE user_id = 44 AND kind = ?').get('kill-rate');
  assert.strictEqual(row.cleared_at, null, 'new incident after cleared_at must reopen alert');
});
