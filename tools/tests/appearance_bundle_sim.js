#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'Updates/lord-knight-bundles');
const {parse,pngMeta,frameAt,ActiveLook,hash}=require(path.join(dir,'pack.js'));
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
const [first,second]=manifest.looks;
const bytes=r=>fs.readFileSync(path.join(dir,r.file));
const buffer=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
function changeHeader(data,fn){
 const length=data.readUInt32BE(6),header=JSON.parse(data.subarray(10,10+length));fn(header);
 const json=Buffer.from(JSON.stringify(header)),prefix=Buffer.alloc(10);prefix.write('PGAP1\n');prefix.writeUInt32BE(json.length,6);
 return Buffer.concat([prefix,json,data.subarray(10+length)]);
}
async function rejectsHeader(fn,pattern){
 const data=changeHeader(bytes(first),fn),record={...first,bytes:data.length,sha256:await hash(data)};
 await assert.rejects(parse(buffer(data),record,manifest.catalogSha256),pattern);
}
const fakeDecode=async png=>{const m=pngMeta(png);return {cv:{width:320*m.frames,height:280},w:320,h:280,n:m.frames};};
(async()=>{
 const native=await parse(buffer(bytes(first)),first,manifest.catalogSha256);
 assert.equal(native.entries.size,9);
 await rejectsHeader(h=>h.entries[0].offset=1,/payload range/);
 await rejectsHeader(h=>h.entries[0].length=-1,/payload range/);
 await rejectsHeader(h=>h.entries[0].frames=100000,/timing metadata/);
 await rejectsHeader(h=>h.entries[0].durations[0]=0,/timing metadata/);
 await rejectsHeader(h=>h.entries[0].durations[0]+=1,/timing mismatch/);
 await rejectsHeader(h=>h.entries[1]={...h.entries[0]},/duplicate view/);
 await rejectsHeader(h=>h.entries.pop(),/Nine native views/);
 await rejectsHeader(h=>h.appearance.palette=99,/identity mismatch/);
 await rejectsHeader(h=>h.entries[0].action=40,/action identity/);
 await rejectsHeader(h=>h.catalogSha256='old',/catalog/);
 await rejectsHeader(h=>h.entries[0].sha256='0'.repeat(64),/Animation checksum/);
 const corrupt=bytes(first);corrupt[corrupt.length-1]^=1;
 await assert.rejects(parse(buffer(corrupt),first,manifest.catalogSha256),/Bundle checksum/);
 await assert.rejects(parse(buffer(bytes(first).subarray(0,30)),first,manifest.catalogSha256),/size mismatch/);
 const png=native.entries.get('attack-SE').png.slice();new DataView(png.buffer).setUint32(16,0xffffffff);
 assert.throws(()=>pngMeta(png),/geometry/);
 console.log('PASS: native bundle identity, hashes, all nine views, malformed metadata and allocation bounds');

 assert.equal(frameAt([100,200,300],99),0);assert.equal(frameAt([100,200,300],100),1);
 assert.equal(frameAt([100,200,300],300),2);assert.equal(frameAt([100,200,300],600),0);
 assert.equal(frameAt([100,200,300],600,false),2);assert.equal(frameAt([100,200,300],99999,false),2);
 assert.equal(frameAt([100,200,300],150,false,300),2);assert.equal(frameAt([100,200,300],300,false,300),2);
 console.log('PASS: irregular native delays, looping idle/walk and one full attack per requested swing');
 let calls=0,fail=false;
 const fetcher=async file=>{calls++;if(fail)throw Error('offline');return new Response(fs.readFileSync(path.join(dir,file)));};
 const loader=new ActiveLook({catalogSha256:manifest.catalogSha256,decode:fakeDecode,fetcher});
 const initial=await loader.select(first,'idle','SE');
 const walk=await loader.select(first,'walk','NE');
 assert.equal(calls,1);assert.equal(initial.strip.cv.width,0);assert.equal(initial.strip.cv.height,0);
 assert.equal(loader.stats().residentLooks,1);assert.equal(loader.stats().decodedViews,1);
 assert.equal(loader.stats().decodedBytes,walk.entry.frames*320*280*4);
 fail=true;await assert.rejects(loader.select(second,'attack','S'),/offline/);
 assert.equal(loader.current,walk);assert.ok(walk.strip.cv.width>0);fail=false;
 loader.budget=1;await assert.rejects(loader.select(first,'attack','S'),/memory budget/);loader.budget=32*1024*1024;
 assert.equal(loader.current,walk);
 // A slow decode finishing after a newer request must be freed, never shown.
 let release,entered,stale;
 const begun=new Promise(resolve=>entered=resolve);
 loader.decode=async png=>{stale=await fakeDecode(png);entered();await new Promise(resolve=>release=resolve);return stale;};
 const oldRequest=loader.select(second,'attack','S');await begun;
 loader.decode=fakeDecode;
 const latest=loader.select(first,'idle','S');release();
 assert.equal(await oldRequest,null);await latest;
 assert.equal(stale.cv.width,0);assert.equal(loader.current.record.id,first.id);assert.equal(loader.current.entry.direction,'S');
 // Rapid queued requests coalesce before allocating or fetching.
 calls=0;const requests=[loader.select(second,'walk','S'),loader.select(second,'walk','NE'),loader.select(first,'attack','NE')];
 const result=await Promise.all(requests);assert.equal(result[0],null);assert.equal(result[1],null);assert.equal(calls,0);
 assert.equal(loader.current.entry.direction,'NE');
 const retained=loader.current;loader.dispose();assert.equal(retained.strip.cv.width,0);assert.equal(loader.stats().residentLooks,0);
 const oversized=new ActiveLook({catalogSha256:manifest.catalogSha256,decode:fakeDecode,fetcher:async()=>new Response(Buffer.alloc(first.bytes+1))});
 await assert.rejects(oversized.select(first,'idle','S'),/exceeds declared size/);
 console.log('PASS: one retained appearance/view, in-bundle reuse, failure fallback, budget, stale-load cleanup, queue coalescing and oversized responses');
})().catch(error=>{console.error(error);process.exitCode=1;});
