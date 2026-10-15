// Real delivery manifest/cache; no optional image packages required for this CPU suite.
// Exact decoded pixel equality is also checked by check_map_journey_browser.js.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const M=require('../maps/journey-materials.js');
const dir=path.resolve(__dirname,'../maps/textures'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'runtime-manifest.json')));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
M.validate(manifest);
let oldBytes=0,newBytes=0;
for(const r of Object.values(manifest.textures)){
 const master=fs.readFileSync(path.join(dir,r.source)),delivery=fs.readFileSync(path.join(dir,r.file));
 assert.equal(master.length,r.sourceBytes);assert.equal(sha(master),r.sourceSha256);
 assert.equal(delivery.length,r.bytes);assert.equal(sha(delivery),r.sha256);assert.ok(r.file.includes(r.sha256.slice(0,12)));
 assert.equal(master.readUInt32BE(16),r.width);assert.equal(master.readUInt32BE(20),r.height);
 assert.equal(delivery.toString('ascii',0,4),'RIFF');assert.equal(delivery.toString('ascii',8,12),'WEBP');
 // Skip optional metadata chunks; the actual image must use the lossless codec.
 let offset=12,lossless=false;while(offset+8<=delivery.length){const kind=delivery.toString('ascii',offset,offset+4),size=delivery.readUInt32LE(offset+4);assert.notEqual(kind,'VP8 ','Lossy encoding forbidden');if(kind==='VP8L')lossless=true;offset+=8+size+(size%2);}assert.equal(lossless,true);
 assert.ok(r.bytes<r.sourceBytes);oldBytes+=r.sourceBytes;newBytes+=r.bytes;
}
assert.ok(newBytes<3750000&&newBytes<oldBytes*.58,'Keep exact-pixel environment delivery within its reduced budget');
assert.deepEqual(fs.readdirSync(dir).filter(f=>f.endsWith('.webp')).sort(),Object.values(manifest.textures).map(r=>r.file).sort(),'No stale generated delivery images');
for(const [destination,budget] of [['astral',2300000],['thor',2820000]])assert.ok(M.PLAN[destination].reduce((n,key)=>n+manifest.textures[key].bytes,0)<budget);
for(const mutate of [m=>m.schemaVersion=9,m=>m.destinations.astral=['stone','lava','space'],m=>m.textures.stone.file='../bad.webp',m=>m.textures.stone.bytes=0,m=>m.textures.stone.width=99999]){const bad=structuredClone(manifest);mutate(bad);assert.throws(()=>M.validate(bad));}
(async()=>{
 const calls=[],resolvers=[];
 const store=M.create(manifest,url=>{calls.push(url);return new Promise(resolve=>resolvers.push(()=>resolve({src:url})));});
 const first=store.ensure('astral'),second=store.ensure('astral');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,2);assert.ok(calls.every(url=>!url.includes('molten')));assert.deepEqual(store.diagnostics().loaded,[]);
 resolvers.splice(0).forEach(resolve=>resolve());assert.deepEqual((await first).missing,[]);await second;
 await store.ensure('astral');assert.equal(calls.length,2);
 const thor=store.ensure('thor');await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,3);assert.match(calls[2],/molten-basalt/);resolvers.splice(0).forEach(resolve=>resolve());await thor;await store.ensure('astral');await store.ensure('thor');assert.equal(calls.length,3);assert.deepEqual(store.diagnostics().loaded,['lava','space','stone']);
 await assert.rejects(()=>store.ensure('unknown'),RangeError);
 const failed=M.create(manifest,async url=>{if(url.includes('astral-void'))throw Error('404');return{src:url};});assert.deepEqual((await failed.ensure('astral')).missing,['space']);await failed.ensure('astral');assert.equal(failed.diagnostics().requested.length,2,'Failures stay bounded until the explicit reload retry');
 const missing=M.create(null,()=>{throw Error('Missing manifests must not fetch heavy PNG masters');});assert.deepEqual((await missing.ensure('thor')).missing,['stone','lava']);assert.equal(missing.diagnostics().manifestValid,false);assert.deepEqual(missing.diagnostics().requested,[]);
 console.log(`Map delivery: ${oldBytes} -> ${newBytes} bytes, lossless headers/hashes/dimensions, budgets, destination-only loading, shared in-flight/cache reuse, malformed manifests and failed-image fallback pass. Native assets untouched.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
