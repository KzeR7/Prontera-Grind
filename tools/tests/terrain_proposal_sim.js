#!/usr/bin/env node
/* Guards the proposal viewer against drift.
 *
 *   node tools/tests/terrain_proposal_sim.js
 *
 * The proposal is one document (docs/proposals/map-terrain-upgrade-2026-10-25.md) and
 * tools/maps/terrain_v2_proposal.html only renders it, so the two cannot disagree about
 * content - but they CAN disagree about wiring: a renamed board, a moved document, or a
 * renderer that stops handling a construct the proposal uses. This checks all three.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const root = path.resolve(__dirname, '../..');
const VIEWER = 'tools/maps/terrain_v2_proposal.html';
const DOC = 'docs/proposals/map-terrain-upgrade-2026-10-25.md';
let checks = 0;
const ok = (cond, msg) => { assert(cond, msg); checks++; };

const viewer = fs.readFileSync(path.join(root, VIEWER), 'utf8');
const md = fs.readFileSync(path.join(root, DOC), 'utf8');

// 1. the renderer is self-contained and loadable, and pulls the same document the page links
const script = /<script id="renderer">([\s\S]*?)<\/script>/.exec(viewer);
ok(script, 'viewer must carry its markdown renderer inline');
const mod = { exports: {} };
new Function('module', script[1])(mod);
const { render } = mod.exports;
ok(typeof render === 'function', 'renderer must export render()');
ok(viewer.includes("'/docs/proposals/map-terrain-upgrade-2026-10-25.md'"),
   'viewer must fetch the proposal document, not a copy of it');

// 2. every construct the document actually uses survives rendering
const html = render(md);
const count = re => (html.match(re) || []).length;
ok(count(/<h1>/g) === 1, 'exactly one h1');
ok(count(/<h2>/g) >= 8, 'all top-level sections render as h2');
ok(count(/<table>/g) === count(/^\|/gm) ? true : count(/<table>/g) >= 8, 'tables render');
ok(count(/<pre>/g) >= 3, 'fenced commands render as code blocks');
ok(!/<p>[^<]*\|/.test(html), 'no table row leaked into a paragraph');
ok(!/<p>#{1,6}\s/.test(html), 'no heading leaked into a paragraph');
ok(!html.includes('`'), 'no unrendered code span (including `|x| > 32` inside a table cell)');
ok(!/<p>\s*([-*+]\s|\d+\.\s)/.test(html), 'no list item leaked into a paragraph');
ok(!html.includes('undefined'), 'no undefined leaked into the output');

// 3. every local asset the document or viewer points at exists on disk
const refs = new Set();
for (const src of [md, viewer]) {
  for (const m of src.matchAll(/\((\/?[A-Za-z0-9_./-]+\.(?:png|json|md|html|js|py))\)/g)) refs.add(m[1]);
  for (const m of src.matchAll(/src="(\/[^"]+)"/g)) refs.add(m[1]);
  for (const m of src.matchAll(/href="(\/[^"]+)"/g)) refs.add(m[1]);
}
// Absolute refs are server paths from the repo root; bare ones are relative to the
// document, which is how the proposal writes its boards (`terrain-v2/board-topdown.png`).
const local = [...refs].filter(r => !r.startsWith('/game'));
for (const ref of local) {
  const clean = ref.split('?')[0];
  const candidates = clean.startsWith('/')
    ? [path.join(root, clean.slice(1))]
    : [path.join(root, 'docs/proposals', clean), path.join(root, clean)];
  ok(candidates.some(c => fs.existsSync(c)), 'referenced asset must exist: ' + ref);
}
ok(local.length >= 6, 'expected the document to reference the boards and audit files');

// 4. the document still carries the colour finding this viewer exists to present
for (const needle of ['byte-identical', 'pairwise', 'minimum 28.5', 'stochastic']) {
  ok(md.includes(needle) || md.toLowerCase().includes(needle.toLowerCase()),
     'proposal must keep its measured colour evidence: ' + needle);
}

// 5. the two review pages link to each other, so neither is a dead end
ok(viewer.includes('/tools/maps/terrain_v2_preview.html'), 'proposal must link to the live viewer');
const preview = fs.readFileSync(path.join(root, 'tools/maps/terrain_v2_preview.html'), 'utf8');
ok(preview.includes('/tools/maps/terrain_v2_proposal.html'), 'live viewer must link back to the proposal');

console.log(`terrain proposal viewer: ${checks} checks passed ` +
            `(${html.length} bytes rendered, ${local.length} referenced assets present)`);
