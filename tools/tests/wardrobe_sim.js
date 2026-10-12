const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const W=require('../../assets/wardrobe.js');const root=path.resolve(__dirname,'../../assets/wardrobe/v1');
(async()=>{
 const old={sex:'f',hair:17};assert.equal(W.normalize(undefined),null);assert.equal(old.hair,17);assert.equal(W.normalize({version:99}),null);
 const a=W.normalize({version:1,sex:'invalid',heads:{m:999,f:42},colors:{m:0,f:99},halo:'yes',glasses:true,wings:false,untrusted:'x'});assert.deepEqual(a,{version:1,sex:'m',heads:{m:2,f:42},colors:{m:0,f:0},halo:false,glasses:true,wings:false});assert(!JSON.stringify(a).includes('untrusted'));
 let fetches=0,live=0,maxLive=0,fail=false,block=null;
 const store=new W.Store({fetcher:async url=>{fetches++;if(block)await block;if(fail)throw Error('offline');const p=path.join(root,path.basename(url));return new Response(fs.readFileSync(p))},decode:async b=>{const v=new DataView(b.buffer,b.byteOffset,b.byteLength);live++;maxLive=Math.max(maxLive,live);return{width:v.getUint32(16),height:v.getUint32(20),close(){live--}}}});
 const first=await store.select('hero',W.defaults('m'));assert(first);assert.equal(fetches,5);let before=fetches;
 const toggled={...W.defaults('m'),halo:false};const second=await store.select('hero',toggled);assert.equal(fetches,before);assert.equal(second.selection.halo,false);
 const view=second.base.metadata.actions.attack0;assert.equal(W.frameIndex(view,999999,0),0);assert.equal(W.frameIndex(view,0,1),view.frames.length-1);assert.equal(W.frameIndex(view,0,.999),view.frames.length-1);
 const draws=[];const ctx={clearRect(){},drawImage(...args){draws.push(args)}};W.draw(ctx,second,'attack',0,0,.4);assert(draws.length>0);const all=draws.length;draws.length=0;W.draw(ctx,{...second,selection:{...second.selection,glasses:false,wings:false}},'attack',0,0,.4);assert(draws.length<all);
 const malformed=JSON.parse(JSON.stringify(second.base.metadata));malformed.actions.idle0.frames[0][0][2]=1e9;assert.throws(()=>W.validateMeta(malformed,{width:malformed.width,height:malformed.height}),/bounds/);
 for(const sex of ['m','f'])for(const head of W.HAIRS[sex])for(let color=0;color<9;color++){const a=W.defaults(sex);a.heads[sex]=head;a.colors[sex]=color;const ready=await store.select('preview',a);assert.equal(ready.key,W.key(a));assert(store.pixelBytes<=store.budget);assert.equal(store.clients.get('hero').ready.key,first.key)}
 let release;block=new Promise(r=>release=r);const a1=W.defaults('f');a1.heads.f=2;const a2=W.defaults('m');a2.heads.m=5;const p1=store.select('preview',a1),p2=store.select('preview',a2);release();block=null;assert.equal(await p1,null);assert.equal((await p2).key,W.key(a2));
 fail=true;const missing=W.defaults('f');missing.heads.f=4;await assert.rejects(store.select('preview',missing),/offline/);assert.equal(store.clients.get('preview').ready.key,W.key(a2));fail=false;assert.equal((await store.select('preview',missing)).key,W.key(missing));
 const small=new W.Store({budget:1,fetcher:store.fetcher,decode:store.decode});await assert.rejects(small.select('hero',W.defaults('m')),/memory/);small.dispose();
 const oversized=new W.Store({fetcher:async()=>new Response(new Uint8Array(20)),decode:store.decode});await assert.rejects(oversized.bytes('x',5),/Oversized/);
 const corrupt=new W.Store({fetcher:async()=>new Response(new Uint8Array(3)),decode:store.decode});await assert.rejects(corrupt.bytes('x',3,'0'.repeat(64)),/checksum/);
 store.dispose();assert.equal(live,0);console.log('PASS: 360 appearances; native metadata, save normalization, bounded loader, coalescing, retry, component toggles, swing clamp, cleanup. Peak atlas count:',maxLive);
})().catch(e=>{console.error(e);process.exitCode=1});
