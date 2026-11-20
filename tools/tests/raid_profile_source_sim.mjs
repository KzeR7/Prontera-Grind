// The raid profile table is a projection of the field game's class table, not a second balance
// source. This reads CD/CD4/CDX/CD4X out of index.html (the same extraction pattern as
// migration_sim) and checks every row, then proves the snapshot is finite for every class and that
// readiness fingerprints ignore bag-only changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  RAID_CLASS_PROFILES, raidProfileFromSave, raidProfileFingerprintSource,
  raidProfileFingerprint, sanitizeRaidProfile, applyRaidCard,
} from '../../functions/_lib/raid-profile.js';
import { RAID_RULES } from '../../functions/_lib/raid-rules.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const slice = (name, next) => {
  const start = html.indexOf('const ' + name + '=[');
  const end = html.indexOf(next, start);
  assert.ok(start > 0 && end > start, 'could not extract ' + name);
  return html.slice(start, end);
};
const source = [
  slice('CD', 'const FOURTH_JOBS_LIVE'),
  slice('CD4', 'const EXPANDED_JOBS_LIVE'),
  slice('CDX', 'const CD4X'),
  slice('CD4X', 'const EXPANDED_CLASSES'),
].join('\n');
const field = vm.runInNewContext(source + '\n;({CD,CD4,CDX,CD4X})', {});
const rows = [...field.CD, ...field.CD4, ...field.CDX, ...field.CD4X];

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.stack || e)); fail++; }
};

console.log('raid profile source sim: class projection, bounded snapshots, readiness fingerprints\n');

t('every field class is present in the raid table exactly once', () => {
  const names = rows.map(r => r[0]);
  assert.equal(new Set(names).size, names.length, 'class names are unique');
  assert.deepEqual(Object.keys(RAID_CLASS_PROFILES).sort(), [...names].sort());
});

t('main stat, ATK and HP multipliers still match index.html', () => {
  for (const row of rows) {
    const [name, , , atk, hp, , , , main] = row;
    const p = RAID_CLASS_PROFILES[name];
    assert.ok(p, name);
    assert.equal(p.main, main, name + ' main');
    assert.equal(p.atk, atk, name + ' ATK');
    assert.equal(p.hp, hp, name + ' HP');
  }
});

t('every class builds a finite, bounded profile from a minimal save', () => {
  for (const row of rows) {
    const p = raidProfileFromSave({ cls: row[0], lv: 150, st: { str: 1, agi: 1, dex: 1, int: 1, vit: 1, luk: 1 }, eq: {} });
    assert.ok(p, row[0]);
    assert.equal(p.cls, row[0]);
    assert.ok(Number.isFinite(p.maxHp) && p.maxHp >= 1000 && p.maxHp <= 1e9, row[0] + ' maxHp');
    assert.ok(Number.isFinite(p.dps) && p.dps >= RAID_RULES.dpsMin && p.dps <= RAID_RULES.dpsMax, row[0] + ' dps');
    assert.ok(Number.isFinite(p.power) && p.power >= 0, row[0] + ' power');
    assert.equal(p.armorPen, 0, 'no weapon means no star penetration');
  }
});

t('weapon stars add all-content ATK and capped boss defence penetration', () => {
  const base = {
    cls: 'Lord Knight', lv: 150, st: { str: 120, agi: 120, dex: 120, luk: 90, int: 1, vit: 120 },
    eq: { weapon: { id: 'k', slot: 'weapon', wt: 'katar', val: 120000, r: 15, stars: 0, aff: [] } },
  };
  const zero = raidProfileFromSave(base);
  const twenty = raidProfileFromSave({ ...base, eq: { weapon: { ...base.eq.weapon, stars: 20 } } });
  assert.equal(zero.armorPen, 0);
  assert.equal(twenty.armorPen, RAID_RULES.bossArmor, '20 stars penetrate the full boss armour cap');
  assert.equal(twenty.weaponStars, 20);
  assert.ok(twenty.dps > zero.dps, 'stars raise the saved raid DPS');
  assert.notEqual(raidProfileFingerprintSource(base), raidProfileFingerprintSource({ ...base, eq: { weapon: { ...base.eq.weapon, stars: 20 } } }));
});

t('one equipped raid card applies at the next run start and respects its rank', () => {
  const base = {
    cls: 'Lord Knight', lv: 150, st: { str: 120, agi: 120, dex: 120, luk: 90, int: 1, vit: 120 },
    eq: { weapon: { id: 'k', slot: 'weapon', wt: 'katar', val: 120000, r: 15, stars: 0, aff: [] } },
  };
  const p = raidProfileFromSave(base);
  const a = applyRaidCard(p, [{ card_key: 'sovereign-fang', copies: 1, equipped: 1 }]);
  const b = applyRaidCard(p, [{ card_key: 'sovereign-fang', copies: 15, equipped: 1 }]);
  const none = applyRaidCard(p, [{ card_key: 'sovereign-fang', copies: 0, equipped: 1 }]);
  assert.ok(a.dps > p.dps && b.dps > a.dps, 'rank raises the DPS bonus');
  assert.ok(a.armorPen > 0 && b.armorPen <= RAID_RULES.bossArmor);
  assert.equal(none.dps, p.dps, 'an unowned card does nothing');
  const hp = applyRaidCard(p, [{ card_key: 'astral-bulwark', copies: 3, equipped: 1 }]);
  assert.ok(hp.maxHp > p.maxHp, 'bulwark raises max HP');
});

t('a physical and a magic endgame build are priced on their own attack stat', () => {
  const phys = raidProfileFromSave({
    cls: 'Lord Knight', lv: 150, st: { str: 120, agi: 120, dex: 120, luk: 90, int: 1, vit: 120 },
    eq: { weapon: { id: 'k', slot: 'weapon', wt: 'katar', val: 120000, r: 15, aff: [{ k: 'atk', v: 400 }] } },
  });
  const magic = raidProfileFromSave({
    cls: 'Warlock', lv: 150, st: { str: 1, agi: 90, dex: 120, luk: 1, int: 120, vit: 120 },
    eq: { weapon: { id: 's', slot: 'weapon', wt: 'staff', val: 120000, r: 15, aff: [{ k: 'matk', v: 400 }] } },
  });
  assert.equal(phys.magic, false);
  assert.equal(magic.magic, true);
  assert.ok(magic.power > 100000, 'magic gear is not priced as a physical auto-attacker');
  assert.notEqual(Math.round(phys.power), Math.round(magic.power));
});

t('readiness ignores bag-only changes but catches an equipped change', () => {
  const base = {
    cls: 'Lord Knight', lv: 150, sex: 'm', st: { str: 120, agi: 120, dex: 120, luk: 90, int: 1, vit: 120 },
    eq: { weapon: { id: 'k', slot: 'weapon', wt: 'katar', val: 120000, r: 15, aff: [] } },
    inv: [{ id: 'bag', slot: 'weapon', wt: 'katar', val: 1 }],
  };
  const bag = { ...base, inv: [...base.inv, { id: 'new', slot: 'weapon', wt: 'katar', val: 999 }] };
  const equipped = { ...base, eq: { ...base.eq, weapon: { ...base.eq.weapon, r: 14 } } };
  assert.equal(raidProfileFingerprintSource(base), raidProfileFingerprintSource(bag));
  assert.notEqual(raidProfileFingerprintSource(base), raidProfileFingerprintSource(equipped));
});

t('the fingerprint is a stable equality token and sanitizing never yields null/NaN', async () => {
  const save = { cls: 'Warlock', lv: 150, sex: 'f', st: { int: 120, dex: 100 }, eq: {} };
  const a = await raidProfileFingerprint(save);
  const b = await raidProfileFingerprint(save);
  assert.match(a, /^[0-9a-f]{16,64}$/);
  assert.equal(a, b);
  const p = sanitizeRaidProfile({ cls: 'Warlock', dps: 'NaN', maxHp: null, lv: -5, sex: 'x' });
  assert.ok(Number.isFinite(p.dps) && p.dps >= RAID_RULES.dpsMin && p.dps <= RAID_RULES.dpsMax);
  assert.ok(Number.isFinite(p.maxHp) && p.maxHp >= 1000);
  assert.equal(p.lv, 1);
  assert.equal(p.sex, 'm');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
