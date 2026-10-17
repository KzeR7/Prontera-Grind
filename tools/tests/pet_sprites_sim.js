// Production loader over the shipped native pack; no GPU required.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Store,validateMeta,frameIndex,draw}=require('../../assets/pets.js');
const root=path.resolve(__dirname,'../../assets/pets/v1'),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json')));
const calls=[];let closes=0;
const fetcher=async url=>{calls.push(url);const file=path.basename(url);return new Response(fs.readFileSync(path.join(root,file)))};
const decode=async bytes=>{const b=Buffer.from(bytes);return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){closes++}}};
const store=new Store({fetcher,decode});
(async()=>{
 await Promise.all([store.init(),store.init()]);assert.equal(calls.length,1,'catalog init coalesces');assert.equal(Object.keys(catalog.species).length,20);
 for(const [key,r]of Object.entries(catalog.assets)){
  store.pin([key]);const count=calls.length;const [asset,same]=await Promise.all([store.request(key),store.request(key)]);assert.equal(asset,same);assert.equal(calls.length-count,2,'only selected metadata and atlas download');
  assert.ok(store.pixelBytes<=store.budget);assert.ok(store.cache.size<=9);
  const contexts=[];const ctx={clearRect(){},drawImage(...a){contexts.push(a)}};
  for(const [action,view]of Object.entries(asset.metadata.actions)){const d=+action.slice(-1),stance=action.slice(0,-1);assert.equal(draw(ctx,asset,stance,d,0),0);assert.equal(frameIndex(view,view.delay),1%view.frames.length);assert.equal(frameIndex(view,99999,1),view.frames.length-1)}
  assert.ok(contexts.length);assert.equal(asset.figureHeight,r.figureHeight);
 }
 const pins=['1002-walk','1101-attack','1115-attack-3','1096-idle'];store.pin(pins);await Promise.all(pins.map(k=>store.request(k)));assert.ok(pins.every(k=>store.ready(k)));assert.ok(store.pixelBytes<=16*1024*1024);
 const first=store.ready(pins[0]);await store.request(pins[0]);assert.equal(store.ready(pins[0]),first);store.dispose();assert.equal(store.pixelBytes,0);assert.ok(closes>0);await assert.rejects(store.request(pins[0]),/disposed/);
 const meta=JSON.parse(fs.readFileSync(path.join(root,catalog.assets['1002-idle'].meta)));meta.poses[0][4]=-1;assert.throws(()=>validateMeta(meta,catalog.assets['1002-idle']),/bounds/);
 let mode='bad',attempts=0;const corrupt=new Store({decode,fetcher:async url=>{attempts++;if(mode==='bad'&&url.endsWith('.png'))return new Response(new Uint8Array([1,2,3]));return fetcher(url)}});
 await assert.rejects(corrupt.request('1002-idle'),/checksum/);const before=attempts;await assert.rejects(corrupt.request('1002-idle'),/checksum/);assert.equal(attempts,before,'failed downloads stay cached');mode='good';await corrupt.retry('1002-idle');corrupt.dispose();
 let catAttempts=0;const broken=new Store({decode,fetcher:async()=>{catAttempts++;return new Response('{}')}});await assert.rejects(broken.init(),/catalog/);await assert.rejects(broken.init(),/catalog/);assert.equal(catAttempts,1,'catalog errors do not download every render frame');broken.fetcher=fetcher;await broken.retry('1002-idle');broken.dispose();
 const oversized=new Store({decode,fetcher:async()=>new Response('x',{headers:{'content-length':'999999999'}})});await assert.rejects(oversized.init(),/Oversized/);oversized.dispose();
 const streamed=new Store({decode,fetcher:async()=>new Response(new Uint8Array(129*1024))});await assert.rejects(streamed.init(),/Oversized/);streamed.dispose();
 const tiny=new Store({decode,fetcher,budget:1});await assert.rejects(tiny.request('1002-idle'),/memory limit/);tiny.dispose();
 // Await the actual decoder entry, not an arbitrary count of event-loop spins:
 // asynchronous checksum work can take longer under a concurrent full-suite run.
 let release,decodeStarted,timer;const started=new Promise(resolve=>{decodeStarted=resolve});
 const waiting=new Store({fetcher,decode:bytes=>new Promise(resolve=>{release=()=>decode(bytes).then(resolve);decodeStarted()})});const pending=waiting.request('1002-idle');
 try{await Promise.race([started,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('pet decoder did not start within 5s')),5000)})])}finally{clearTimeout(timer)}
 assert.ok(release);waiting.dispose();release();await assert.rejects(pending,/decoded pet/);assert.equal(waiting.pixelBytes,0);assert.equal(waiting.failed.size,0);
 console.log('PASS: all 20 pets / 81 native state assets, timing/directions, selected downloads, four pinned views, bounds/checksums, size/memory limits, cached failures/retry and disposal');
})().catch(e=>{console.error(e);process.exitCode=1});
