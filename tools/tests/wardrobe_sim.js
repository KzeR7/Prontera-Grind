const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const W=require('../../assets/wardrobe.js');const root=path.resolve(__dirname,'../../assets/wardrobe/v5');
(async()=>{
 const old={sex:'f',hair:17};assert.equal(W.normalize(undefined),null);assert.equal(old.hair,17);assert.equal(W.normalize({version:99}),null);
 const a=W.normalize({version:1,sex:'invalid',heads:{m:999,f:42},colors:{m:0,f:99},halo:'yes',glasses:true,wings:false,untrusted:'x'});assert.deepEqual(a,{version:1,sex:'m',heads:{m:2,f:42},colors:{m:0,f:0},halo:false,glasses:true,wings:false,headwear:'none',facewear:'glasses',mouthwear:'none',backwear:'none',outfit:'none'});assert(!JSON.stringify(a).includes('untrusted'));
 let fetches=0,live=0,maxLive=0,fail=false,block=null;
 const store=new W.Store({fetcher:async url=>{fetches++;if(block)await block;if(fail)throw Error('offline');const p=path.join(root,path.basename(url));return new Response(fs.readFileSync(p))},decode:async b=>{const v=new DataView(b.buffer,b.byteOffset,b.byteLength);live++;maxLive=Math.max(maxLive,live);return{width:v.getUint32(16),height:v.getUint32(20),close(){live--}}}});
 const first=await store.select('hero',W.defaults('m'));assert(first);assert.equal(fetches,5);let before=fetches;
 const toggled={...W.defaults('m'),halo:false,glasses:true,wings:true,facewear:'glasses',backwear:'wings'};const second=await store.select('hero',toggled);assert.equal(fetches-before,4,'only the two selected pieces load');before=fetches;await store.select('hero',toggled);assert.equal(fetches,before,'resident selections use no network');assert.equal(second.selection.halo,false);
 // Colors share attachment files; download only the new pixels.
 const recolored={...W.defaults('m'),colors:{m:8,f:0}};before=fetches;await store.select('preview',recolored);assert.equal(fetches-before,1,'cached attachments are reused across palettes');
 const view=second.base.metadata.actions.attack0;assert.equal(W.frameIndex(view,999999,0),0);assert.equal(W.frameIndex(view,0,1),view.frames.length-1);assert.equal(W.frameIndex(view,0,.999),view.frames.length-1);
 const draws=[];const ctx={clearRect(){},drawImage(...args){draws.push(args)}};W.draw(ctx,second,'attack',0,0,.4);assert(draws.length>0);const all=draws.length;draws.length=0;W.draw(ctx,{...second,pieces:[]},'attack',0,0,.4);assert(draws.length<all);
 const pieceRecord=store.catalog.assets['piece-wings-m'],broken=JSON.parse(fs.readFileSync(path.join(root,pieceRecord.meta)));broken.poses[0][0]=broken.layers.length;assert.throws(()=>W.validateMeta(broken,pieceRecord),/Invalid layer reference/);
 const record=store.catalog.assets['base-4008-m'];const malformed=JSON.parse(fs.readFileSync(path.join(root,record.meta)));malformed.poses[0][0][2]=1e9;assert.throws(()=>W.validateMeta(malformed,{width:malformed.width,height:malformed.height}),/bounds/);
 for(const cls of Object.keys(W.CLASSES))for(const sex of ['m','f'])for(const head of W.HAIRS[sex])for(let color=0;color<9;color++){const a=W.defaults(sex);a.heads[sex]=head;a.colors[sex]=color;const ready=await store.select('preview',a,cls);assert.equal(ready.key,W.CLASSES[cls]+'|'+W.selectionKey(a));assert(store.pixelBytes<=store.budget);assert(store.metadataBytes<=store.metadataBudget);assert.equal(store.clients.get('hero').ready.key,second.key)}
 // Every piece loads across all classes/genders without downloading unrelated pieces.
 const legacy=W.normalize({version:1,halo:true,glasses:true,wings:true,outfit:'vanguard'});assert.equal(legacy.headwear,'halo');assert.equal(legacy.facewear,'glasses');assert.equal(legacy.backwear,'wings');assert.equal(legacy.outfit,'none');
 assert.equal(Object.keys(W.OUTFITS).length,0);assert.equal(Object.keys(W.ACCESSORIES.backwear.items).length,18);assert.equal(Object.keys(W.ACCESSORIES.headwear.items).length,14);assert.equal(Object.keys(W.ACCESSORIES.facewear.items).length,13);assert.equal(Object.keys(W.ACCESSORIES.mouthwear.items).length,11);
 for(const sex of ['m','f'])for(const cls of Object.keys(W.CLASSES))for(const [field,slot] of Object.entries(W.ACCESSORIES))for(const value of Object.keys(slot.items)){
  const a={...W.defaults(sex),[field]:value},selected=await store.select('preview',a,cls);assert.equal(selected.pieces.length,value==='none'?0:1);assert(store.pixelBytes<=store.budget);
  for(const stance of ['idle','walk','attack'])for(let d=0;d<8;d++){draws.length=0;W.draw(ctx,selected,stance,d);assert(draws.length>=2)}
 }
 const complete={...W.defaults('m'),headwear:'foxEars',facewear:'heartPatch',mouthwear:'poringLetter',backwear:'leticiaWings'};await store.select('preview',complete,'Novice');before=fetches;await store.select('preview',complete,'Novice');assert.equal(fetches,before);
 const empty=await store.select('preview',W.defaults('m'),'Novice');assert.equal(empty.pieces.length,0,'None removes every piece');
 // The AFK balloon's eight-frame idle is longer than the three-frame body.
 const balloon=await store.select('preview',{...W.defaults('m'),headwear:'afkBalloon'},'Novice');
 assert.equal(balloon.pieces[0].metadata.actions.idle0.frames.length,8);
 draws.length=0;W.draw(ctx,balloon,'idle',0,400);
 const bp=balloon.pieces[0].metadata.actions.idle0.frames[4][0];
 assert.deepEqual(draws.at(-1).slice(1),[...bp.slice(0,6),bp[2],bp[3]],'balloon retains its fourth native idle frame');
 const thunder=await store.select('preview',{...W.defaults('m'),backwear:'blackThunder'},'Novice');
 assert.equal(thunder.pieces[0].metadata.actions.idle0.frames.length,90);
 assert.notEqual(W.animationKey(thunder,'attack',0,0,.5,0),W.animationKey(thunder,'attack',0,0,.5,100),'effect advances while the attack pose stays fixed');
 draws.length=0;W.draw(ctx,thunder,'attack',0,0,.5,100);
 const tp=thunder.pieces[0].metadata.actions.attack0.frames[6][0];
 assert.deepEqual(draws.at(-1).slice(1),[...tp.slice(0,6),tp[2],tp[3]],'60 FPS effect uses its own clock, not attack progress');
 let release;block=new Promise(r=>release=r);const a1=W.defaults('f');a1.heads.f=2;const a2=W.defaults('m');a2.heads.m=5;const p1=store.select('preview',a1),p2=store.select('preview',a2);release();block=null;assert.equal(await p1,null);assert.equal((await p2).key,'4008|'+W.selectionKey(a2));
 fail=true;const missing=W.defaults('f');missing.heads.f=4;await assert.rejects(store.select('preview',missing),/offline/);assert.equal(store.clients.get('preview').ready.key,'4008|'+W.selectionKey(a2));fail=false;assert.equal((await store.select('preview',missing)).key,'4008|'+W.selectionKey(missing));
 const small=new W.Store({budget:1,fetcher:store.fetcher,decode:store.decode});await assert.rejects(small.select('hero',W.defaults('m')),/memory/);small.dispose();
 const oversized=new W.Store({fetcher:async()=>new Response(new Uint8Array(20)),decode:store.decode});await assert.rejects(oversized.bytes('x',5),/Oversized/);
 const corrupt=new W.Store({fetcher:async()=>new Response(new Uint8Array(3)),decode:store.decode});await assert.rejects(corrupt.bytes('x',3,'0'.repeat(64)),/checksum/);
 // Switching class reuses resident hair/costume pixels and loads only the new body.
 const look=W.defaults('m');await store.select('preview',look);const shared=store.clients.get('preview').ready;before=fetches;
 for(const cls of Object.keys(W.CLASSES)){
  const previous=fetches,ready=await store.select('preview',look,cls);
  assert.equal(ready.cls,cls);assert.equal(ready.hair.image,shared.hair.image);assert.equal(ready.pieces.length,0);
  assert(fetches-previous<=2,'class switch downloads only body image/attachments');
  for(const stance of ['idle','walk','attack'])for(let d=0;d<8;d++){draws.length=0;W.draw(ctx,ready,stance,d,12345,stance==='attack'?1:null);assert(draws.length>=2)}
 }
 await assert.rejects(store.select('preview',look,'Unknown class'),/Class is unavailable/);
 // Superseded class requests cannot land after a later class.
 const firstClass=store.select('preview',look,'Swordman'),lastClass=store.select('preview',look,'Sniper');
 assert.equal(await firstClass,null);assert.equal((await lastClass).cls,'Sniper');
 // Keep a fully dressed hero, a different-gender fitting and a job portrait resident.
 const largest=sex=>{const a=W.defaults(sex);for(const [field,slot] of Object.entries(W.ACCESSORIES)){a[field]=Object.keys(slot.items).filter(k=>k!=='none').sort((a,b)=>{const x=store.catalog.assets['piece-'+a+'-'+sex],y=store.catalog.assets['piece-'+b+'-'+sex];return y.width*y.height-x.width*x.height})[0]}return a};
 await store.select('hero',largest('m'),'Lord Knight');
 await store.select('preview',largest('f'),'High Wizard');
 await store.select('portrait',largest('m'),'Assassin Cross');
 assert.equal(store.clients.get('hero').ready.pieces.length,4);assert.equal(store.clients.get('preview').ready.pieces.length,4);assert.equal(store.clients.get('portrait').ready.pieces.length,4);assert(store.pixelBytes<=store.budget);
 store.dispose();assert.equal(store.metadataBytes,0);assert.equal(store.metadataCache.size,0);assert.equal(live,0);console.log('PASS: 6,840 hair/color appearances and all 52 pieces across 19 classes/both genders; native metadata, save normalization, bounded loader, coalescing, retry, component toggles, swing clamp, cleanup. Peak atlas count:',maxLive);
})().catch(e=>{console.error(e);process.exitCode=1});
