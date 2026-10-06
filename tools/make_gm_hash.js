// make_gm_hash.js - set or check the GM password for Prontera Grind.
//
//   node tools/make_gm_hash.js "my new password"     -> prints the constants to paste into index.html
//   node tools/make_gm_hash.js --check "my password" -> says whether that password is the live one
//   node tools/make_gm_hash.js --show                -> prints the stored hash and round count
//
// The game never stores the password itself, only hashPw() run GM_ROUNDS+1 times over it, so the
// public repo does not contain the GM password. This tool borrows the game's OWN hashPw and
// GM_ROUNDS straight out of index.html, so the two can never drift apart: if either is edited in a
// way this tool cannot read, it fails loudly instead of writing a hash the game will not match.
//
// Changing the password: run the first form, then replace the `const GM_ROUNDS=...,GM_PASS_HASH='...'`
// line in index.html with what it printed, bump BUILD, and run the suites (tools/tests/gm_auth_sim.js
// checks this tool and the game still agree).

const fs = require('fs');
const path = require('path');

// PG_GAME points the tool at a different copy of the game (used by tools/tests/gm_auth_sim.js to
// rehearse the whole "generate then check" workflow on a scratch file, so the real one is never
// touched by a test).
const GAME = process.env.PG_GAME || path.join(__dirname, '..', 'index.html');

function loadGame() {
  const src = fs.readFileSync(GAME, 'utf8');
  const fnStart = src.indexOf('function hashPw(p){');
  const fnEnd = src.indexOf('\n', src.indexOf('return(h2>>>0)', fnStart));
  if (fnStart < 0 || fnEnd < 0) throw new Error('index.html: could not find hashPw() - has it been renamed or reshaped?');
  const hashPw = new Function('return ' + src.slice(fnStart, fnEnd))();
  const rounds = src.match(/const GM_ROUNDS=(\d+)/);
  if (!rounds) throw new Error("index.html: could not find 'const GM_ROUNDS=' - has the GM block moved?");
  const hash = src.match(/GM_PASS_HASH='([0-9a-f]{16})'/);
  if (!hash) throw new Error("index.html: could not find a 16-hex GM_PASS_HASH - run this tool with a password and paste what it prints");
  const gmHash = p => { let h = hashPw('pg-gm:' + p); for (let i = 0; i < +rounds[1]; i++) h = hashPw(h); return h };
  return { hashPw, gmHash, rounds: +rounds[1], stored: hash[1] };
}

function main(argv) {
  const { gmHash, rounds, stored } = loadGame();
  const args = argv.slice(2);

  if (args[0] === '--show' || args.length === 0) {
    console.log('GM password hash in index.html : ' + stored);
    console.log('hashPw passes                  : ' + (rounds + 1) + ' (GM_ROUNDS=' + rounds + ' plus the salted first pass)');
    if (!args.length) {
      console.log('\nusage:');
      console.log('  node tools/make_gm_hash.js "my new password"      # print the constants to paste in');
      console.log('  node tools/make_gm_hash.js --check "my password"  # is this the live GM password?');
    }
    return 0;
  }

  if (args[0] === '--check') {
    const pw = args.slice(1).join(' ');
    if (!pw) { console.error('--check needs the password: node tools/make_gm_hash.js --check "..."'); return 2; }
    const ok = gmHash(pw) === stored;
    console.log(ok ? 'MATCH - that is the live GM password.' : 'NO MATCH - that is not the live GM password.');
    return ok ? 0 : 1;
  }

  const pw = args.join(' ');
  if (pw.length < 12) {
    console.error('Refusing a password under 12 characters: the stored hash is only 64 bits and the file is public, so length is the whole defence.');
    return 2;
  }
  const h = gmHash(pw);
  console.log('Paste this line into index.html, replacing the existing GM_ROUNDS/GM_PASS_HASH line:\n');
  console.log("const GM_ROUNDS=" + rounds + ",GM_PASS_HASH='" + h + "';");
  console.log('\n(' + (rounds + 1) + ' hashPw passes. Keep the password itself out of the repo - and out of screenshots.)');
  return 0;
}

if (require.main === module) process.exit(main(process.argv));
module.exports = { loadGame };
