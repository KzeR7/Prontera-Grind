#!/usr/bin/env node
// Preflight for the Pages deploy. Run this BEFORE `wrangler pages deploy dist`.
//
//   node tools/preflight_deploy.mjs
//
// WHY THIS EXISTS
// ---------------
// v363 and v364 were both shipped by accident as the PREVIOUS build. The failure is always the same
// three steps, and none of them looks like an error in the terminal:
//
//   1. the merge happened on GitHub, but the local clone was never pulled, so `index.html` on disk
//      still carries the old `const BUILD`;
//   2. `tools/build_site.sh` happily rebuilds that old tree into `dist/`;
//   3. `wrangler pages deploy` uploads it and prints "Uploaded 349 files" (v363) or, once the same
//      bytes have been seen before, "Uploaded 0 files (3819 already uploaded)" (v364) - both read
//      like success, and both publish a build that is not the one that was just merged.
//
// The tell is `Uploaded 0 files`: identical bytes mean the tree did not change, which after a merge
// is impossible unless the merge is missing. This tool checks the things a human cannot see at a
// glance - is `main` in this clone, is `dist/` newer than the sources, does `dist/version.txt` match
// the page, and does the page actually contain the build a human expects to deploy.
//
// It never mutates anything and never talks to the network. Exit code 0 = safe to deploy.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];
const ok = [];

const read = (rel) => {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; }
};
const git = (args) => {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
};

// ---------------------------------------------------------------- 1. the clone is current ----
// The single most expensive mistake in this repo's history: deploying a working copy that predates
// the merge. A late commit is not a warning, it is the whole bug.
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const head = git(['rev-parse', '--short', 'HEAD']);
git(['fetch', 'origin', 'main', '--quiet']);   // read-only; failure is handled below
const remoteMain = git(['rev-parse', '--short', 'origin/main']);
if (!remoteMain) {
  notes.push('could not read origin/main (offline, or no such remote) - SKIPPING the main check');
} else if (git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']) === null) {
  // `merge-base --is-ancestor` returns null when the exit status is non-zero, i.e. NOT an ancestor.
  const ahead = git(['rev-list', '--count', `HEAD..origin/main`]);
  problems.push(
    `origin/main (${remoteMain}) is NOT in this checkout. You are about to deploy a tree that does ` +
    `not contain the latest merge${ahead ? ` - ${ahead} commit(s) behind` : ''}.\n` +
    `        Fix: git pull --ff-only origin main   (or: git merge origin/main)`
  );
} else {
  ok.push(`main ${remoteMain} is contained in HEAD ${head}${branch ? ` (${branch})` : ''}`);
}

// --------------------------------------------------- 2. the page, the build, and dist agree ----
const page = read('index.html');
if (!page) {
  problems.push('index.html is missing from the repository root');
} else {
  const build = (page.match(/const BUILD='([^']+)'/) || [])[1];
  if (!build) {
    problems.push("index.html has no `const BUILD='...'` - the build tag cannot work");
  } else {
    ok.push(`source BUILD = ${build}`);
    const versionTxt = read('dist/version.txt');
    if (versionTxt === null) {
      problems.push('dist/version.txt is missing - run `bash tools/build_site.sh` first');
    } else if (versionTxt.trim() !== build.trim()) {
      problems.push(
        `dist/ is STALE: version.txt says "${versionTxt.trim()}" but index.html says "${build}".\n` +
        `        Fix: bash tools/build_site.sh`
      );
    } else {
      ok.push('dist/version.txt matches the source BUILD');
    }

    // A human told to "check the login card" needs the string to be the build they were told about.
    // --expect lets a release step pin the exact build, so an accidental rebuild of an old tree is
    // caught before it is published rather than after a player reports it.
    const expectAt = process.argv.indexOf('--expect');
    const expected = expectAt > -1 ? process.argv[expectAt + 1] : null;
    if (expected && !build.includes(expected)) {
      problems.push(`this tree builds "${build}", which does not contain "${expected}" - refusing`);
    } else if (expected) {
      ok.push(`source BUILD contains the expected "${expected}"`);
    }
  }
}

// ------------------------------------------ 3. the published page carries the build-tag write ----
// v363's login card was blank for a whole release. The build script now fails on it, but the check
// is repeated here so a hand-made dist/ cannot slip through either.
const distPage = read('dist/index.html');
if (distPage === null) {
  problems.push('dist/index.html is missing - run `bash tools/build_site.sh` first');
} else {
  if (!distPage.includes('id="buildTag"')) problems.push('dist/index.html has no #buildTag element');
  // Line-scoped on purpose: `[^<]*` would span newlines in JS and match a comment from an earlier
  // line, which is a false positive. The bug was one physical line.
  if (/^[^\n<]*\/\/[^\n<]*buildTag[^\n<]*textContent/m.test(distPage)) {
    problems.push('dist/index.html has the buildTag write inside a // comment (the v363 bug)');
  } else if (!distPage.includes("'build '+BUILD")) {
    problems.push("dist/index.html never writes 'build '+BUILD into #buildTag");
  } else {
    ok.push('dist/index.html writes the build tag');
  }
}

// ------------------------------------------------ 4. dist/ was built after its sources changed ----
// `Uploaded 0 files (3819 already uploaded)` is the fingerprint of a rebuild that changed nothing,
// which after a code change means the build did not pick the change up (wrong directory, a stale
// `dist/` that was not regenerated, or a shell still in another checkout). Compare the newest
// source mtime with dist/version.txt's.
try {
  const distStamp = fs.statSync(path.join(ROOT, 'dist', 'version.txt')).mtimeMs;
  const sources = ['index.html', 'assets/social.js', 'assets/social-scene.js', 'assets/social-rules.js'];
  const newer = sources.filter((rel) => {
    try { return fs.statSync(path.join(ROOT, rel)).mtimeMs > distStamp + 1000; } catch { return false; }
  });
  if (newer.length) {
    problems.push(
      `dist/ is older than ${newer.join(', ')} - the build has not picked these up.\n` +
      `        Fix: bash tools/build_site.sh`
    );
  } else {
    ok.push('dist/ is newer than every tracked runtime source');
  }
} catch {
  notes.push('could not stat dist/version.txt - skipping the mtime check');
}

// ------------------------------------------------------------------------------- the report ----
const out = [];
out.push('');
out.push('  Deploy preflight');
out.push('  ' + '-'.repeat(64));
for (const line of ok) out.push(`  ok    ${line}`);
for (const line of notes) out.push(`  note  ${line}`);
for (const line of problems) out.push(`  STOP  ${line}`);
out.push('');
if (problems.length) {
  out.push(`  ${problems.length} problem(s). NOT safe to deploy.`);
  out.push('  Nothing was changed. Fix the above, then run this again.');
  out.push('');
  console.log(out.join('\n'));
  process.exit(1);
}
out.push('  Safe to deploy.');
out.push('');
out.push('  Next:');
out.push('    npx wrangler pages deploy dist --project-name horizonhaven --branch main');
out.push('');
out.push('  Then, IN THE DEPLOY OUTPUT:');
out.push('    * a healthy deploy uploads a number in the hundreds');
out.push('    * "Uploaded 0 files" means the bytes did not change - the build is stale, do not');
out.push('      trust it; rerun the build and check that version.txt changed');
out.push('    * the new deployment id must differ from the one you were just on');
out.push('');
console.log(out.join('\n'));
