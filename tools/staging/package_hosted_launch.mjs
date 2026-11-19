// Package a fixed-target, owner-run isolated staging rehearsal. No deployment.
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetRefs, overlayFiles } from './launch_overlay.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// Tracked files under a prefix, in git's own order so the payload is reproducible.
const gitFiles=prefix=>execFileSync('git',['ls-files','-z','--',prefix],{cwd:root,maxBuffer:20*1024*1024})
 .toString().split('\0').filter(Boolean);
// Migrations are produced as new additive files. Include a not-yet-indexed candidate too, so the
// staging-package integrity guard tests the exact review tree rather than rejecting the migration
// until after a commit. Everything still has to be inside the package below.
const workFiles=prefix=>execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--',prefix],{cwd:root,maxBuffer:20*1024*1024})
 .toString().split('\0').filter(Boolean);
// The hand-written part of the overlay: the assets and entry points this project ships that the
// archived base predates. Everything that can be derived is derived (see launch_overlay.mjs and the
// groups right after this array) so a new file cannot be forgotten the way the old list was.
const files=['index.html','gm.html','tools/build_site.sh','tools/optimize_delivery.js','tools/vendor/acorn/acorn.js','tools/vendor/acorn/LICENSE','tools/maps/build_game_exploration.js','_routes.json',
 // Client-side runtime loaded by index.html.
 'assets/adventure-guide.css','assets/shop-catalog.js','assets/shop.css','assets/shop.js','assets/friends.css','assets/friends.js',
 'assets/combat-audio.js','assets/bgm.js','assets/bgm-tracks.js','assets/social.css','assets/social.js',
 'assets/social-rules.js','assets/social-poker.js','assets/social-scene.js','assets/social-fishing.js',
 'assets/social-fishing.css','assets/social-gym-redesign.js','assets/social-pond-design.js',
 'assets/social-battle.css','assets/social-digimon.js','assets/digimon-battle.js',
 'assets/digimon-sanctuary.js','assets/digimon/roster.js','assets/digimon/base-stats.js',
 'assets/digimon/digidex-portraits.webp','assets/digimon/digidex-portraits.json','assets/digimon/index.json',
 'assets/digimon/v3/catalog.json','assets/digimon/v1/catalog.json','assets/digimon/v1/agumon.png',
 'assets/digimon/v1/gabumon.png','assets/digimon/v1/patamon.png','assets/digimon/v1/palmon.png',
 // Sanctuary set dressing.
 'assets/digimon/sanctuary/arena-stone.webp','assets/digimon/sanctuary/timber-roof.webp',
 'assets/digimon/sanctuary/walkway-wood.webp','assets/digimon/sanctuary/gym-sand.webp',
 'assets/digimon/sanctuary/gym-plaster.webp','assets/digimon/sanctuary/cc0/woodland-tree.webp',
 'assets/digimon/sanctuary/cc0/medieval_wood.webp','assets/digimon/sanctuary/cc0/rough_pine_door.webp',
 'assets/digimon/sanctuary/cc0/roof_09.webp',
 // v360: the Aetherwell centerpiece and the vendored r128 loader that renders it.
 'assets/endgame/THREE-LICENSE.txt','assets/vendor/GLTFLoader.r128.js','assets/Fountainfile/Prontera_Grand_Aetherwell.glb',
 'assets/Fountainfile/Prontera_Grand_Aetherwell_Preview.png',
 // v283: Illustrated Rune-Midgard World Atlas.
 'assets/world-map/world-map-cleaned.webp','assets/world-map/birds-flock-a.webp',
 'assets/world-map/birds-flock-b.webp','assets/world-map/cloud-direct.webp',
 'assets/world-map/cloud-mask-16x9.webp','assets/world-map/cutout/prontera.png',
 'assets/world-map/cutout/geffen.png','assets/world-map/cutout/payon.png','assets/world-map/cutout/morroc.png',
 'assets/world-map/cutout/comodo.png','assets/world-map/cutout/niflheim.png','assets/world-map/cutout/amatsu.png',
 'assets/world-map/cutout/louyang.png','assets/atlas/fountain-plaza.jpg',
 // v415: runtime files that exist in the archived base but that this branch modified. The hand list
 // never caught up with them, so staging would have received the BASE copy of each while the rest of
 // the candidate was v415 - the mixed-version deployment this guard exists to prevent.
 'assets/wardrobe-ui.js','assets/wardrobe.js','assets/skill-afterglow.js','assets/adventure-guide.js',
 // v415: the Eclipse/mobile UI bundle and its scripts are modified in the base too.
 'assets/ui/eclipse.css','assets/ui/mobile.css','assets/ui/mobile.js',
 // Provenance metadata, not runtime: only tools/tests read these. They ride along so the staged
 // tree is an exact copy of a real build rather than a build minus two files.
 'assets/equipment-icons/manifest.json','assets/equipment-icons/mythic-manifest.json'];
// v415: every Functions module and migration in the tree. The payload is integrity-checked and the
// staging site builds its own Functions bundle from it, so shipping the whole (small, audited) set
// is both simpler and safer than a hand list that can miss a newly imported _lib module.
for(const p of gitFiles('functions/'))files.push(p);
for(const p of workFiles('migrations/'))files.push(p);
// Native Class Tree icons use generated URLs, so static HTML tags cannot discover them.
// Keep the original PNGs in the integrity-checked source archive; build_site trims duplicates.
for(const p of gitFiles('assets/ro_icons/'))files.push(p);
// The catalog is part of the integrity-checked payload. Require exactly the two
// per-form files it names; no 561-entry duplicate manifest can drift out of sync.
const digimonCatalog=JSON.parse(fs.readFileSync(path.join(root,'assets/digimon/v3/catalog.json'),'utf8'));
if(digimonCatalog.version!==3||Object.keys(digimonCatalog.species||{}).length!==280)throw Error('Complete Digimon v3 catalog required');
for(const record of Object.values(digimonCatalog.species))for(const key of ['image','meta'])files.push('assets/digimon/v3/'+record[key]);
// The tree the archive is built from.
const base='7511a03c0787ec9b8d94cfc6658570ac402dc297';
// v415: the art packs this branch added after that base. Derived in launch_overlay.mjs from the
// generator manifests and the released entry points rather than hand-listed here, because the hand
// list drifted: new script tags were undeclared, and none of the per-file packs the new code fetches
// by URL were ever packaged. That made this script abort on its own guard (and the staged
// tools/build_site.sh exit 1 on the missing sprite-pack index) instead of rehearsing.
const html=()=>fs.readFileSync(path.join(root,'index.html'),'utf8');
// Any static asset tag the entry points added since the base, so a new one cannot be forgotten.
const basePaths=()=>new Set(execFileSync('git',['ls-tree','-r','--name-only',base],{cwd:root,maxBuffer:20*1024*1024}).toString().split('\n').filter(Boolean));
files.push(...assetRefs(html()).filter(p=>!basePaths().has(p)&&!files.includes(p)));
files.push(...overlayFiles(html()));
// Expanded FX modules and image resources are loaded by the approved cast renderer.
for(const p of workFiles('assets/expanded-fx/'))if(!files.includes(p))files.push(p);
// haven-v434: PR #257 gave the seven expanded weapon families new Mythic icons, so 14 earlier Mythic
// icons (spear 1433, gun 13163, ...) are no longer requested by RO_ITEM_ICON_CANDIDATES. They stay in the
// tree on purpose: mythic-manifest.json still records their provenance and the parked RO-look sets
// (Updates/ascension-ro-looks) reuse some of them. Ship every icon the manifest records, so a staged
// tree matches a real build and an unreferenced but provenance-tracked icon is not reported as an
// unpackaged runtime change.
{const mythic=JSON.parse(fs.readFileSync(path.join(root,'assets/equipment-icons/mythic-manifest.json'),'utf8'));
 if(!Array.isArray(mythic.assets)||!mythic.assets.length)throw Error('mythic-manifest.json lists no icons');
 for(const a of mythic.assets){const rel='assets/equipment-icons/'+a.file;
  if(typeof a.file!=='string'||!/^\d+\.png$/.test(a.file))throw Error('Unexpected Mythic icon entry: '+JSON.stringify(a));
  if(!fs.existsSync(path.join(root,rel)))throw Error('Missing Mythic icon named by its manifest: '+rel);
  if(!files.includes(rel))files.push(rel)}}
// A repeated path would pack twice and make the payload's own file count meaningless.
if(new Set(files).size!==files.length)throw Error('Duplicate package entry: '+files.find((p,i)=>files.indexOf(p)!==i));
if(process.argv.length!==3)throw Error('Usage: node tools/staging/package_hosted_launch.mjs <output.mjs>');
// Refuse to generate a mixed-version deployment if the runtime or assets have
// changed beyond this explicit overlay. The archive comes from the fixed base.
// v275: tools/build_site.sh also decides the published cache headers (_headers). A staging package
// built with an older copy of it would ship the stale-entry-point bug the v275 change fixes, so the
// file stays on this list: a local change to it fails closed here instead of shipping quietly.
const relevant=p=>['index.html','gm.html','_routes.json','tools/build_site.sh','tools/optimize_delivery.js'].includes(p)||
 p.startsWith('functions/')||p.startsWith('migrations/')||p.startsWith('assets/');
const baseEntries=execFileSync('git',['ls-tree','-rz','--full-tree',base],{cwd:root,maxBuffer:20*1024*1024}).toString().split('\0').filter(Boolean);
const baseline=new Map(baseEntries.map(entry=>{const m=entry.match(/^\d+ blob ([0-9a-f]+)\t([\s\S]+)$/);if(!m)throw Error('Unexpected archive tree');return [m[2],m[1]]}));
const all=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,maxBuffer:20*1024*1024}).toString().split('\0').filter(Boolean);
for(const p of new Set(all)){
 if(!relevant(p)||!fs.existsSync(path.join(root,p))||!fs.statSync(path.join(root,p)).isFile())continue;
 const b=fs.readFileSync(path.join(root,p));
 const hash=createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');
 if(hash!==baseline.get(p)&&!files.includes(p)){
  // Windows checkouts can have CRLF while the committed blob has LF. Ask Git
  // to apply its configured clean/eol filters, but ONLY for mismatched files;
  // a genuinely changed or newly added runtime file still fails closed.
  const cleaned=execFileSync('git',['hash-object','--path='+p,'--',p],{cwd:root,encoding:'utf8'}).trim();
  if(cleaned!==baseline.get(p))throw Error('Unpackaged runtime change: '+p);
 }
}
// haven-v416: a file the base had and this tree deliberately DROPPED is not a missing file. v411
// removed functions/api/version.js (the whole 1.33 MB index.html was decoded to answer one string),
// and this archive base predates that, so the head of the tree no longer has it. Ask Git instead of
// the working tree: a tracked deletion is intentional, an absent-but-tracked file is not.
const stillTracked=new Set(all);
for(const p of baseline.keys())if(relevant(p)&&!fs.existsSync(path.join(root,p))&&stillTracked.has(p))throw Error('Missing archive runtime file: '+p);

// v360: the Aetherwell GLB is binary like the atlases - utf8 would silently corrupt it.
// v415: jpg joined the list. assets/atlas/fountain-plaza.jpg was being decoded as utf8 and
// re-encoded, which mangled every non-ASCII byte (the staged copy was 252 KB where the source is
// 140 KB) - the hub rendered a broken texture. Anything not text has to be base64.
const isBin=p=>/\.(?:png|webp|glb|jpe?g)$/i.test(p);
const data=Object.fromEntries(files.map(p=>{
 const raw=fs.readFileSync(path.join(root,p));
 if(isBin(p))return [p,'base64:'+raw.toString('base64')];
 const text=raw.toString('utf8');
 // Rather than trust the extension list to stay complete, prove the text path was lossless. A
 // mis-classified binary decodes to replacement characters and re-encodes to different bytes, so
 // this turns a silently corrupt asset into a packaging failure that names the file.
 if(Buffer.from(text,'utf8').compare(raw)!==0)throw Error('Binary file not marked binary (add its extension to isBin): '+p);
 return [p,text];
}));
const packed=gzipSync(Buffer.from(JSON.stringify(data))),hash=createHash('sha256').update(packed).digest('hex');
let src=fs.readFileSync(path.join(root,'tools/staging/hosted_launch_stage.mjs'),'utf8');
const markers=[['__LAUNCH_PACKAGE_PAYLOAD__',packed.toString('base64')],['__LAUNCH_PACKAGE_SHA256__',hash]];
for(const [marker,value] of markers){
 if(src.split(marker).length!==2)throw Error('Unexpected package template');src=src.replace(marker,value);
}
const output=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,src);
console.log(`Prepared ${output} (${packed.length} bytes compressed). No migration or deployment performed.`);
