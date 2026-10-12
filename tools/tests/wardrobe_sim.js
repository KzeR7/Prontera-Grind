const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const W=require('../../assets/wardrobe.js');const root=path.resolve(__dirname,'../../assets/wardrobe/v2');
(async()=>{
 const old={sex:'f',hair:17};assert.equal(W.normalize(undefined),null);assert.equal(old.hair,17);assert.equal(W.normalize({version:99}),null);
 const a=W.normalize({version:1,sex:'invalid',heads:{m:999,f:42},colors:{m:0,f:99},halo:'yes',glasses:true,wings:false,untrusted:'x'});assert.deepEqual(a,{version:1,sex:'m',heads:{m:2,f:42},colors:{m:0,f:0},halo:false,glasses:true,wings:false});assert(!JSON.stringify(a).includes('untrusted'));
 let fetches=0,live=0,maxLive=0,fail=false,block=null;
 const store=new W.Store({fetcher:async url=>{fetches++;if(block)await block;if(fail)throw Error('offline');const p=path.join(root,path.basename(url));return new Response(fs.readFileSync(p))},decode:async b=>{const v=new DataView(b.buffer,b.byteOffset,b.byteLength);live++;maxLive=Math.max(maxLive,live);return{width:v.getUint32(16),height:v.getUint32(20),close(){live--}}}});
 const first=await store.select('hero',W.defaults('m'));assert(first);assert.equal(fetches,7);let before=fetches;
 const toggled={...W.defaults('m'),halo:false,glasses:true,wings:true};const second=await store.select('hero',toggled);assert.equal(fetches,before);assert.equal(second.selection.halo,false);
 const view=second.base.metadata.actions.attack0;assert.equal(W.frameIndex(view,999999,0),0);assert.equal(W.frameIndex(view,0,1),view.frames.length-1);assert.equal(W.frameIndex(view,0,.999),view.frames.length-1);
 const draws=[];const ctx={clearRect(){},drawImage(...args){draws.push(args)}};W.draw(ctx,second,'attack',0,0,.4);assert(draws.length>0);const all=draws.length;draws.length=0;W.draw(ctx,{...second,selection:{...second.selection,glasses:false,wings:false}},'attack',0,0,.4);assert(draws.length<all);
 const record=store.catalog.assets['base-4008-m'];const malformed=JSON.parse(fs.readFileSync(path.join(root,record.meta)));malformed.poses[0][0][2]=1e9;assert.throws(()=>W.validateMeta(malformed,{width:malformed.width,height:malformed.height}),/bounds/);
 for(const cls of Object.keys(W.CLASSES))for(const sex of ['m','f'])for(const head of W.HAIRS[sex])for(let color=0;color<9;color++){const a=W.defaults(sex);a.heads[sex]=head;a.colors[sex]=color;const ready=await store.select('preview',a,cls);assert.equal(ready.key,W.CLASSES[cls]+'|'+W.key(a));assert(store.pixelBytes<=store.budget);assert.equal(store.clients.get('hero').ready.key,first.key)}
 let release;block=new Promise(r=>release=r);const a1=W.defaults('f');a1.heads.f=2;const a2=W.defaults('m');a2.heads.m=5;const p1=store.select('preview',a1),p2=store.select('preview',a2);release();block=null;assert.equal(await p1,null);assert.equal((await p2).key,'4008|'+W.key(a2));
 fail=true;const missing=W.defaults('f');missing.heads.f=4;await assert.rejects(store.select('preview',missing),/offline/);assert.equal(store.clients.get('preview').ready.key,'4008|'+W.key(a2));fail=false;assert.equal((await store.select('preview',missing)).key,'4008|'+W.key(missing));
 const small=new W.Store({budget:1,fetcher:store.fetcher,decode:store.decode});await assert.rejects(small.select('hero',W.defaults('m')),/memory/);small.dispose();
 const oversized=new W.Store({fetcher:async()=>new Response(new Uint8Array(20)),decode:store.decode});await assert.rejects(oversized.bytes('x',5),/Oversized/);
 const corrupt=new W.Store({fetcher:async()=>new Response(new Uint8Array(3)),decode:store.decode});await assert.rejects(corrupt.bytes('x',3,'0'.repeat(64)),/checksum/);
 // Switching class reuses resident hair/costume pixels and loads only the new body.
 const look=W.defaults('m');await store.select('preview',look);const shared=store.clients.get('preview').ready;before=fetches;
 for(const cls of Object.keys(W.CLASSES)){
  const previous=fetches,ready=await store.select('preview',look,cls);
  assert.equal(ready.cls,cls);assert.equal(ready.hair.image,shared.hair.image);assert.equal(ready.costume.image,shared.costume.image);
  assert(fetches-previous<=2,'class switch downloads only body image/attachments');
  for(const stance of ['idle','walk','attack'])for(let d=0;d<8;d++){draws.length=0;W.draw(ctx,ready,stance,d,12345,stance==='attack'?1:null);assert(draws.length>=2)}
 }
 await assert.rejects(store.select('preview',look,'Mage'),/Class is unavailable/);
 // Superseded class requests cannot land after a later class.
 const firstClass=store.select('preview',look,'Swordman'),lastClass=store.select('preview',look,'Sniper');
 assert.equal(await firstClass,null);assert.equal((await lastClass).cls,'Sniper');
 store.dispose();assert.equal(live,0);console.log('PASS: 5,400 class appearances; native metadata, save normalization, bounded loader, coalescing, retry, component toggles, swing clamp, cleanup. Peak atlas count:',maxLive);
})().catch(e=>{console.error(e);process.exitCode=1});
