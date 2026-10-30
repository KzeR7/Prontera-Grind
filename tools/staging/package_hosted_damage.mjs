// Create one owner-downloadable script. Never contacts Cloudflare or deploys.
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// This historic package overlays a paused-board build onto an old archive and
// only installs migration 0008. Current save.js now depends on later competition
// modules/migrations. Never manufacture a broken or unintended mixed deployment.
if(fs.readFileSync(path.join(root,'functions/api/save.js'),'utf8').includes("../_lib/unverified-echo.js"))
  throw Error('The historic damage-only package is retired for this ranking draft; use a newly reviewed isolated staging plan.');
const files=['index.html','gm.html','functions/_lib/db.js','functions/_lib/damage-monitor.js',
  'functions/api/save.js','functions/api/gm/damage.js','migrations/0008_damage_monitoring.sql'];
if(process.argv.length!==3)throw Error('Usage: node tools/staging/package_hosted_damage.mjs <output.mjs>');
const data=Object.fromEntries(files.map(p=>[p,fs.readFileSync(path.join(root,p),'utf8')]));
const packed=gzipSync(Buffer.from(JSON.stringify(data))),hash=createHash('sha256').update(packed).digest('hex');
let src=fs.readFileSync(path.join(root,'tools/staging/hosted_damage_stage.mjs'),'utf8');
for(const [marker,value] of [['__DAMAGE_PACKAGE_PAYLOAD__',packed.toString('base64')],['__DAMAGE_PACKAGE_SHA256__',hash]]){
  if(src.split(marker).length!==2)throw Error('Unexpected package template');src=src.replace(marker,value);
}
const output=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,src);
console.log(`Prepared ${output} (${packed.length} bytes compressed). No migration or deployment performed.`);
