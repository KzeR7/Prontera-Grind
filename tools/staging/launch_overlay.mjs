// The extra runtime files a staging package must carry on top of the archived base.
//
// The launching base (BASE in package_hosted_launch.mjs) is a fixed, old commit, and the packager
// refuses to ship a checkout holding a runtime file it is not carrying, so a half-applied change
// can never reach staging. The consequence is that every NEW runtime file also has to be declared.
// Before v415 that declaration was a hand-written array and it had drifted three separate ways:
//
//   * assets/expanded-jobs.js, assets/signature-fx.js and assets/ro-fx/index.js were new but
//     undeclared, so the packager aborted with "Unpackaged runtime change";
//   * assets/sprite-pack-x/index.js was in the same state and is fatal twice over, because the
//     staged copy runs tools/build_site.sh, whose `require assets/sprite-pack-x/index.js` exits 1
//     ("MISSING ... the game would load broken from this build") before anything is deployed;
//   * the per-file packs that new code fetches by URL after load (44 sprite bodies, 89 wardrobe
//     atlases and pose files, 36 effect flipbooks) were never packaged, so a deployed staging
//     client asked for files the site did not serve.
//
// So it is derived. Each pack ships the index that names it plus exactly the files that index
// names, and the manifest groups are the generators' own output rather than a second hand list
// that can rot: regenerating art updates the manifest, and the overlay follows with no edit here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const json = p => JSON.parse(read(p));

function need(dir, list, label, out) {
  if (!list.length) throw Error(`Empty ${label} file list`);
  for (const name of list) {
    const rel = dir + name;
    if (!fs.existsSync(path.join(root, rel))) throw Error(`Missing ${label} file: ${rel}`);
    out.push(rel);
  }
}

// Item icons are the one runtime pack with no index file: the client builds the URL from an id
// (`assets/equipment-icons/${id}.png`) for whatever gear is equipped. Ship the subset
// RO_ITEM_ICON_CANDIDATES can actually name, read from the released entry point so the overlay
// cannot cover a different set than the client asks for.
export function itemIcons(html = read('index.html')) {
  const marker = 'const RO_ITEM_ICON_CANDIDATES=';
  const from = html.indexOf(marker);
  if (from < 0) throw Error('RO_ITEM_ICON_CANDIDATES moved: item icon overlay cannot be derived');
  // Brace-balanced slice of just the object literal: helper functions share the region.
  const open = from < 0 ? -1 : html.indexOf('{', from + marker.length);
  let depth = 0, end = -1;
  for (let at = open; open >= 0 && at < html.length; at++) {
    if (html[at] === '{') depth++;
    else if (html[at] === '}' && --depth === 0) { end = at + 1; break; }
  }
  if (open < 0 || end < 0) throw Error('RO_ITEM_ICON_CANDIDATES is not a closed literal');
  // Only values: `slot:id` for the Mythic table and `slot:[id,...]` for the tiered ones. Reading
  // every number would pick up the surrounding code and comments.
  const ids = new Set();
  for (const [, value] of html.slice(open, end).matchAll(/:\s*(\[[^\]]*\]|\d+)/g))
    for (const id of value.match(/\d+/g) || []) ids.add(id);
  const out = [];
  for (const id of [...ids].sort()) {
    const rel = `assets/equipment-icons/${id}.png`;
    if (!fs.existsSync(path.join(root, rel))) throw Error('Missing item icon the client can request: ' + rel);
    out.push(rel);
  }
  if (!out.length) throw Error('No item icons derived');
  return out;
}

// `window.RO_FX={...}` is generated JSON behind a two-line banner; the books name their own files.
function roFxFiles() {
  const src = read('assets/ro-fx/index.js');
  const start = src.indexOf('{');
  if (start < 0) throw Error('assets/ro-fx/index.js no longer carries its book index');
  const books = JSON.parse(src.slice(start).trim().replace(/;$/, '')).books || {};
  const list = Object.values(books).map(book => {
    if (!book || typeof book.file !== 'string') throw Error('assets/ro-fx/index.js book without a file');
    return book.file;
  });
  if (!list.length) throw Error('assets/ro-fx/index.js names no flipbooks');
  return list;
}

// Every asset a packaged entry point loads by static script/image or stylesheet tag. Trailing
// `?v=` cache-busters are dropped; template-built URLs are skipped because no single file answers them.
export function assetRefs(html) {
  const refs = new Set();
  for (const [, src] of html.matchAll(/\b(?:src|href)="(assets\/[^"]*)"/g)) {
    const rel = src.split('?')[0];
    if (!rel.includes('${') && !rel.endsWith('/')) refs.add(rel);
  }
  return [...refs].sort();
}

// Everything the package must carry beyond the archived base, sorted for a stable package hash.
export function overlayFiles(html) {
  // The packager adds every static tag the entry points gained since the base, so the per-file
  // packs below are all that is left to name here.
  const out = [];
  // 44 native bodies, one per expanded-roster class and sex.
  need('assets/sprite-pack-x/', Object.keys(json('tools/native-expanded/output-manifest.json').files || {}),
    'expanded body', out);
  // 89 wardrobe atlases and pose files behind assets/expanded-jobs.js.
  need('assets/wardrobe/expanded/v1/',
    Object.keys(json('tools/native-expanded/wardrobe-output-manifest.json').files || {}),
    'expanded wardrobe', out);
  out.push('assets/wardrobe/expanded/v1/catalog.json');
  // 36 effect flipbooks.
  need('assets/ro-fx/', roFxFiles(), 'effect flipbook', out);
  // The pond fishing pack ships its own manifest, which is complete: it names the three MVP fish
  // the hand list had missed. Deriving from it keeps the pack and the package in step.
  const fish = json('assets/social/fish/MANIFEST.json');
  const fishRoot = 'assets/social/fish/';
  const fishFiles = Object.values(fish).map(rel => {
    if (typeof rel !== 'string' || !rel.startsWith(fishRoot)) throw Error('assets/social/fish/MANIFEST.json entry outside the pack: ' + rel);
    return rel.slice(fishRoot.length);
  });
  // The manifest rides with the pack it describes.
  need(fishRoot, [...fishFiles, 'MANIFEST.json'], 'pond fish', out);
  // The expanded-skill/pet and mastery-title icons are dynamic URLs, not script tags.
  // Include their checked source catalogs in the staging source tree; build_site omits
  // those catalogs from the deployed site while keeping every named lossless crop.
  for (const dir of ['assets/expanded-skill-icons/', 'assets/title-symbols/']) {
    const catalog = json(dir + 'catalog.json');
    const names = Object.keys(catalog.assets || {});
    if (catalog.version !== 1 || names.some(name => !/^[a-z0-9_]+\.webp$/.test(name)))
      throw Error('Invalid title/skill art catalog: ' + dir);
    need(dir, [...names, 'catalog.json'], 'title/skill art', out);
  }
  // Social title paths are a generated whitelist. Derive its files from exactly
  // what the client can select instead of relying on a second drifting hand list.
  const socialArt = read('assets/social-title-art.js').match(/const ART=(\{[^\n]*\});\n/);
  if (!socialArt) throw Error('Social title art registry is missing its whitelist');
  const art = JSON.parse(socialArt[1]);
  const socialFiles = [...Object.values(art.digi || {}), ...Object.values(art.fishing || {})];
  const socialRoot = 'assets/social-title-icons/';
  if (!Object.keys(art.digi || {}).length || !Object.keys(art.fishing || {}).length ||
      new Set(socialFiles).size !== socialFiles.length ||
      socialFiles.some(rel => typeof rel !== 'string' || !/^assets\/social-title-icons\/(?:digi|fishing)-[a-z0-9-]+\.webp$/.test(rel)))
    throw Error('Invalid Social title art whitelist');
  need(socialRoot, socialFiles.map(rel => rel.slice(socialRoot.length)), 'Social title art', out);
  out.push(...itemIcons(html));
  const unique = [...new Set(out)].sort();
  for (const rel of unique) if (!fs.existsSync(path.join(root, rel))) throw Error('Overlay file missing: ' + rel);
  return unique;
}
