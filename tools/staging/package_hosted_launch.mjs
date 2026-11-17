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
// The hand-written part of the overlay: the assets and entry points this project ships that the
// archived base predates. Everything that can be derived is derived (see launch_overlay.mjs and the
// groups right after this array) so a new file cannot be forgotten the way the old list was.
const files=['index.html','gm.html','tools/build_site.sh','_routes.json',
 // Client-side runtime loaded by index.html.
 'assets/shop-catalog.js','assets/shop.css','assets/shop.js','assets/friends.css','assets/friends.js',
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
 'assets/vendor/GLTFLoader.r128.js','assets/Fountainfile/Prontera_Grand_Aetherwell.glb',
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
 'assets/wardrobe-ui.js',
 // v415: the Eclipse/mobile UI bundle and its scripts are modified in the base too.
 'assets/ui/eclipse.css','assets/ui/mobile.css','assets/ui/mobile.js',
 // Provenance metadata, not runtime: only tools/tests read these. They ride along so the staged
 // tree is an exact copy of a real build rather than a build minus two files.
 'assets/equipment-icons/manifest.json','assets/equipment-icons/mythic-manifest.json'];
// v415: every Functions module and migration in the tree. The payload is integrity-checked and the
// staging site builds its own Functions bundle from it, so shipping the whole (small, audited) set
// is both simpler and safer than a hand list that can miss a newly imported _lib module.
for(const p of gitFiles('functions/'))files.push(p);
for(const p of gitFiles('migrations/'))files.push(p);
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
// A repeated path would pack twice and make the payload's own file count meaningless.
if(new Set(files).size!==files.length)throw Error('Duplicate package entry: '+files.find((p,i)=>files.indexOf(p)!==i));
if(process.argv.length!==3)throw Error('Usage: node tools/staging/package_hosted_launch.mjs <output.mjs>');
// Refuse to generate a mixed-version deployment if the runtime or assets have
// changed beyond this explicit overlay. The archive comes from the fixed base.
// v275: tools/build_site.sh also decides the published cache headers (_headers). A staging package
// built with an older copy of it would ship the stale-entry-point bug the v275 change fixes, so the
// file stays on this list: a local change to it fails closed here instead of shipping quietly.
const relevant=p=>['index.html','gm.html','_routes.json','tools/build_site.sh'].includes(p)||
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
for(const p of baseline.keys())if(relevant(p)&&!fs.existsSync(path.join(root,p)))throw Error('Missing archive runtime file: '+p);

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
