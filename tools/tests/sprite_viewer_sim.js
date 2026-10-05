#!/usr/bin/env node
'use strict';

// Static validation for the standalone class-sprite movement/review page.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const repo = path.resolve(__dirname, '../..');
const htmlPath = path.join(repo, 'Updates/Sprite/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const spriteRoot = path.dirname(htmlPath);
const matchJson = id => {
  const match = html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)<\\/script>`));
  assert(match, `Missing ${id} JSON block`);
  return JSON.parse(match[1]);
};
const treeConfig = matchJson('sprite-config');
const manifest = matchJson('sprite-manifest');
const routes = matchJson('pose-map');
const expectedTrees = {
  Novice: ['novice'],
  Thief: ['thief', 'assassin', 'assassincross'],
  Merchant: ['merchant', 'blacksmith', 'whitesmith'],
  Mage: ['mage', 'wizard', 'highwizard'],
  Archer: ['archer', 'hunter', 'sniper'],
  Acolyte: ['aco', 'priest', 'highpriest'],
  Swordman: ['swordman', 'knight', 'lordknight']
};

assert.deepStrictEqual(treeConfig.map(tree => tree.name), Object.keys(expectedTrees), 'class tree selector order should match the seven folders');
for (const [tree, jobs] of Object.entries(expectedTrees)) {
  const config = treeConfig.find(item => item.name === tree);
  assert.deepStrictEqual(config.classes.map(job => job.id), jobs, `selector jobs should match ${tree}`);
}
assert.strictEqual(manifest.length, 154, 'all uploaded sprite PNGs should be represented');
assert.deepStrictEqual([...new Set(manifest.map(row => row.tree))], Object.keys(expectedTrees));
assert.strictEqual(new Set(manifest.map(row => row.path)).size, manifest.length, 'source paths should be unique');

const classes = new Map();
const poseKeys = new Set();
for (const row of manifest) {
  assert(expectedTrees[row.tree], `Unexpected class tree: ${row.tree}`);
  assert(expectedTrees[row.tree].includes(row.job), `Unexpected class ${row.job} in ${row.tree}`);
  assert(['male', 'female'].includes(row.gender), `Unexpected gender: ${row.gender}`);
  assert(['walk', 'attack'].includes(row.action), `Unexpected action: ${row.action}`);
  assert(['N', 'NE', 'S', 'SE'].includes(row.direction), `Unexpected source direction: ${row.direction}`);
  assert.strictEqual(row.path, `${row.tree}/${row.fileName}`, `Bad relative source path for ${row.fileName}`);
  const sourcePath = path.join(spriteRoot, row.path);
  assert(fs.existsSync(sourcePath), `Referenced source file does not exist: ${row.path}`);
  const png = fs.readFileSync(sourcePath);
  assert.strictEqual(png.toString('hex', 0, 8), '89504e470d0a1a0a', `Not a PNG: ${row.path}`);
  assert.strictEqual(png.readUInt32BE(16), 200, `Unexpected width: ${row.path}`);
  assert.strictEqual(png.readUInt32BE(20), 200, `Unexpected height: ${row.path}`);

  classes.set(`${row.tree}|${row.job}`, true);
  const key = `${row.tree}|${row.job}|${row.gender}|${row.action}|${row.direction}`;
  assert(!poseKeys.has(key), `Duplicate pose declaration: ${key}`);
  poseKeys.add(key);
}
assert.strictEqual(classes.size, 19, 'the seven folders should cover all 19 class jobs');
for (const [tree, jobs] of Object.entries(expectedTrees)) {
  for (const job of jobs) {
    for (const gender of ['male', 'female']) {
      assert(manifest.some(row => row.tree === tree && row.job === job && row.gender === gender),
        `Missing all source art for ${tree}/${job}/${gender}`);
    }
  }
}

assert.deepStrictEqual(Object.keys(routes), ['NW', 'NE', 'SW', 'S', 'SE', 'attackSE', 'attackSW']);
assert.strictEqual(routes.NW.sourceDirection, 'NE');
assert.strictEqual(routes.NW.mirror, true);
assert.strictEqual(routes.SW.sourceDirection, 'SE');
assert.strictEqual(routes.SW.mirror, true);
assert.strictEqual(routes.attackSW.sourceDirection, 'SE');
assert.strictEqual(routes.attackSW.mirror, true);
assert.strictEqual(routes.NE.sourceDirection, 'NE');
assert.strictEqual(routes.S.sourceDirection, 'S');
assert.strictEqual(routes.SE.sourceDirection, 'SE');
assert.strictEqual(routes.attackSE.sourceDirection, 'SE');

// All requested base angles are now present for every class/gender. The older N files are
// still included as source art, but High Priest now uses the new NE sprites rather than fallback.
const has = (tree, job, gender, action, direction) => poseKeys.has([tree, job, gender, action, direction].join('|'));
for (const [tree, jobs] of Object.entries(expectedTrees)) {
  for (const job of jobs) {
    for (const gender of ['male', 'female']) {
      for (const [action, direction] of [['walk', 'NE'], ['walk', 'S'], ['walk', 'SE'], ['attack', 'SE']]) {
        assert(has(tree, job, gender, action, direction), `Missing requested pose: ${tree}/${job}/${gender} ${action} ${direction}`);
      }
    }
  }
}
assert(has('Acolyte', 'highpriest', 'male', 'walk', 'N'));
assert(has('Acolyte', 'highpriest', 'female', 'walk', 'N'));
for (const file of [
  'Archer/archer female walking NE.png',
  'Archer/archer female walking S.png',
  'Archer/archer male walking SE.png',
  'Archer/sniper male attack SE.png',
  'Acolyte/highpriest male walking NE.png',
  'Acolyte/highpriest female walking NE.png'
]) assert(manifest.some(row => row.path === file), `Newly added art missing from page manifest: ${file}`);

assert(!/<script\s+src=/i.test(html), 'viewer should not depend on external scripts');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
assert(scripts.length >= 4, 'tree config, manifest, route map and viewer logic should be embedded');
new vm.Script(scripts[scripts.length - 1][1], { filename: htmlPath });
const refresh = spawnSync('python3', [path.join(repo, 'tools/make_sprite_viewer.py'), '--check'], { encoding: 'utf8' });
assert.strictEqual(refresh.status, 0, `canonical viewer is stale: ${refresh.stderr || refresh.stdout}`);

console.log(`Sprite viewer: ${manifest.length} PNGs, 7 trees, ${classes.size} class jobs; canonical backup, requested poses, mirrors and inline JavaScript verified.`);
