// Package a fixed-target, owner-run isolated staging rehearsal. No deployment.
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const files=['index.html','gm.html','assets/shop-catalog.js','assets/shop.css','assets/shop.js','assets/friends.css','assets/friends.js','assets/social.css','assets/social.js','assets/social-rules.js','assets/social-poker.js','assets/social-scene.js','assets/ui/eclipse.css','assets/ui/mobile.css','assets/ui/mobile.js',
 'functions/_lib/db.js','functions/_lib/echo-board.js','functions/_lib/http.js','functions/_lib/friends.js',
 'functions/_lib/validate.js','functions/_lib/damage-monitor.js','functions/_lib/competition-baseline.js',
 'functions/_lib/competition-settlement.js','functions/_lib/unverified-echo.js',
 'functions/_lib/gate-binding.js','functions/_lib/shop.js','functions/api/save.js',
 'functions/api/board.js','functions/api/_middleware.js','functions/api/social.js','functions/api/friends.js',
 'functions/api/shop/checkout.js','functions/api/gm/damage.js',
 // v263: the write-pause control endpoint. It answers 404 without the `GATE` binding, so packaging it
 // does not enable anything; it is listed because it is a runtime file this candidate contains.
 'functions/api/gate.js','migrations/0008_damage_monitoring.sql',
 'migrations/0009_competition_settlement.sql','migrations/0010_competition_baseline.sql',
 'migrations/0011_unverified_echo_launch.sql','migrations/0012_friends.sql',
 // v275: the build script itself. It generates `_headers`, which decides how long a player's browser
 // may keep the entry point. A staging package built with the old copy would serve a stale
 // index.html and reintroduce exactly the bug the v275 change fixes, so it ships with the package.
 'tools/build_site.sh'];
if(process.argv.length!==3)throw Error('Usage: node tools/staging/package_hosted_launch.mjs <output.mjs>');
// Refuse to generate a mixed-version deployment if the runtime or assets have
// changed beyond this explicit overlay. The archive comes from the fixed base.
const base='7511a03c0787ec9b8d94cfc6658570ac402dc297';
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

const data=Object.fromEntries(files.map(p=>[p,fs.readFileSync(path.join(root,p),'utf8')]));
const packed=gzipSync(Buffer.from(JSON.stringify(data))),hash=createHash('sha256').update(packed).digest('hex');
let src=fs.readFileSync(path.join(root,'tools/staging/hosted_launch_stage.mjs'),'utf8');
for(const [marker,value] of [['__LAUNCH_PACKAGE_PAYLOAD__',packed.toString('base64')],['__LAUNCH_PACKAGE_SHA256__',hash]]){
 if(src.split(marker).length!==2)throw Error('Unexpected package template');src=src.replace(marker,value);
}
const output=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,src);
console.log(`Prepared ${output} (${packed.length} bytes compressed). No migration or deployment performed.`);
