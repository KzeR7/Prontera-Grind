#!/usr/bin/env node
// Re-stamp the Three.js SHA-384 in the built index.html from the bytes actually written to dist/.
//
// Why: the engine tag is the only SRI-protected script in the game. Git for Windows (core.autocrlf)
// checks the file out with CRLF, while the committed index.html carries the LF hash. That changes
// six bytes, blocks the engine with "Failed to find a valid digest", and leaves sign-in paused.
// Tools such as optimize_delivery.js may also rewrite a delivery copy. Computing the digest after
// every build transformation keeps the browser's integrity check tied to the shipped bytes, not to
// the developer's Git settings.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const out = process.argv[2];
if (!out) {
  console.error('usage: node tools/stamp_engine_sri.js <dist>');
  process.exit(2);
}
const assetPath = path.join(out, 'assets/endgame/three-r128.min.js');
const htmlPath = path.join(out, 'index.html');
const asset = fs.readFileSync(assetPath);
const digest = crypto.createHash('sha384').update(asset).digest('base64');

let html = fs.readFileSync(htmlPath, 'utf8');
const tag = /(<script\b[^>]*\bsrc="assets\/endgame\/three-r128\.min\.js"[^>]*\bintegrity=")sha384-[^"]+(")/;
if (!tag.test(html)) {
  console.error('BUILD BROKEN: engine script tag with integrity not found in index.html');
  process.exit(1);
}
html = html.replace(tag, `$1sha384-${digest}$2`);
fs.writeFileSync(htmlPath, html);
console.log(`engine SRI matches dist bytes (${asset.length} bytes, sha384-${digest.slice(0, 12)}...)`);
