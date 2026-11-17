#!/usr/bin/env node
// What is actually inside a save blob, in bytes.
//
//   node tools/save_breakdown.mjs save.json
//   node tools/save_breakdown.mjs --db tools/.devdb/preview.sqlite
//   node tools/save_breakdown.mjs --db preview.sqlite --user Demonz
//
// The CPU limit is paid per byte of JSON that has to be parsed on every sync, so the useful question
// is never "is this save big" but "which fields are big". This prints the top-level keys, biggest
// first, with the share of the blob each one owns. It reads a live D1 preview database the same way
// the game does and never writes to it.
//
// Diagnostic only: it reports, it prunes nothing. Deciding what to delete is the owner's call, and
// anything a player can see (items, cards, progress) should not be deleted at all - the honest
// answer to a big save is a ceiling on the list that grows, not a repair that eats history.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };

const bytes = s => Buffer.byteLength(s, 'utf8');

function breakdown(blob, label) {
  let save;
  try { save = JSON.parse(blob); }
  catch { console.error(`${label}: not valid JSON`); return null; }

  const total = bytes(blob);
  const rows = Object.keys(save).map(key => {
    const encoded = JSON.stringify(save[key]) ?? 'null';
    const n = Array.isArray(save[key]) ? save[key].length : null;
    return { key, bytes: bytes(encoded), count: n };
  }).sort((a, b) => b.bytes - a.bytes);

  console.log(`\n${label}`);
  console.log(`  ${total.toLocaleString()} bytes total, ${rows.length} top-level keys`);
  console.log('');
  console.log('  key'.padEnd(30) + 'bytes'.padStart(10) + '  share   entries');
  console.log('  ' + '-'.repeat(62));
  for (const row of rows) {
    const share = total ? (row.bytes / total * 100) : 0;
    if (row.bytes < 200 && rows.indexOf(row) > 11) continue;   // tail is noise
    console.log(
      '  ' + row.key.slice(0, 28).padEnd(28) +
      String(row.bytes.toLocaleString()).padStart(10) +
      (share.toFixed(1) + '%').padStart(8) +
      (row.count == null ? '' : String(row.count).padStart(8))
    );
  }
  const shown = rows.filter(r => r.bytes >= 200 || rows.indexOf(r) <= 11).reduce((n, r) => n + r.bytes, 0);
  if (shown < rows.length) console.log(`  … ${rows.length - 11} smaller keys`);

  // The lists that grow without a ceiling are the interesting ones: a save is only expensive because
  // something is accumulating in it.
  console.log('');
  for (const key of ['cards', 'inv', 'gmReceipts', 'mail', 'save_history']) {
    const list = save[key];
    if (!Array.isArray(list) || !list.length) continue;
    const per = bytes(JSON.stringify(list)) / list.length;
    console.log(`  ${key.padEnd(14)} ${String(list.length).padStart(7)} entries × ${per.toFixed(0)} B each`);
  }
  return { total, rows };
}

const jsonPath = flag('--file') || argv.find(a => a && !a.startsWith('--') && a !== flag('--db') && a !== flag('--user'));
const dbPath = flag('--db');
const user = flag('--user');

if (dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.error(`No database at ${dbPath}. The preview DB lives at tools/.devdb/preview.sqlite.`);
    process.exit(1);
  }
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const sql = user
    ? 'SELECT u.username AS u, s.blob AS blob FROM saves s JOIN users u ON u.id = s.user_id WHERE u.username = ? ORDER BY length(s.blob) DESC'
    : 'SELECT u.username AS u, s.blob AS blob FROM saves s JOIN users u ON u.id = s.user_id ORDER BY length(s.blob) DESC LIMIT 15';
  const rows = db.prepare(sql).all(...(user ? [user] : []));
  db.close();
  if (!rows.length) {
    console.error(user ? `No save found for "${user}".` : 'No saves in that database.');
    process.exit(1);
  }
  let biggest = 0;
  for (const row of rows) { const r = breakdown(row.blob, `#${row.u}`); if (r) biggest = Math.max(biggest, r.total); }
  console.log(`\nLargest: ${biggest.toLocaleString()} bytes. The per-request CPU budget is paid on a fraction of`);
  console.log('this on every sync, against 10 ms on the free plan.');
} else if (jsonPath) {
  if (!fs.existsSync(jsonPath)) { console.error(`No file at ${jsonPath}.`); process.exit(1); }
  breakdown(fs.readFileSync(jsonPath, 'utf8'), path.basename(jsonPath));
} else {
  console.log('Usage:');
  console.log('  node tools/save_breakdown.mjs --db tools/.devdb/preview.sqlite [--user Demonz]');
  console.log('  node tools/save_breakdown.mjs save.json');
  process.exit(argv.length ? 1 : 0);
}
