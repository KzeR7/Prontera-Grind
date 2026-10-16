const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const W=require('../../assets/wardrobe.js');
const box={PGWardrobe:W,TextDecoder};vm.createContext(box);vm.runInContext(fs.readFileSync('assets/fourth-jobs.js','utf8'),box);
global.crypto=webcrypto;
const base='assets/wardrobe/fourth/v1/',catalog=JSON.parse(fs.readFileSync(base+'catalog.json'));
let fail=false,closed=0,hairLooks=0,pieces=0;
const options={fetcher:async url=>{if(fail&&url.endsWith('.png'))throw Error('offline');return new Response(fs.readFileSync(url))},decode:async bytes=>({width:Buffer.from(bytes).readUInt32BE(16),height:Buffer.from(bytes).readUInt32BE(20),close(){closed++}})};
const store=new box.PGFourthJobs.Store(options);
(async()=>{
 for(const cls of Object.keys(box.PGFourthJobs.CLASSES))for(const sex of ['m','f']){
  for(const head of W.HAIRS[sex])for(let color=0;color<9;color++){
   const a=W.defaults(sex);a.heads[sex]=head;a.colors[sex]=color;const before=JSON.stringify(a),look=await store.select('hero',a,cls);
   assert.equal(look.cls,cls);assert.equal(JSON.stringify(a),before,'preserve cosmetic input');
   assert.equal(look.ids[0],'base-'+box.PGFourthJobs.CLASSES[cls]+'-'+sex);assert.equal(look.ids[1],'hair-'+W.key(a));
   for(const stance of ['idle','walk','attack'])for(let dir=0;dir<8;dir++){
    const name=stance+dir,b=look.base.metadata.actions[name],h=look.hair.metadata.actions[name];assert.equal(b.delay,h.delay);assert.equal(b.frames.length,h.frames.length);
    const layers=[];W.draw({clearRect(){},drawImage(...args){layers.push(args)}},look,stance,dir,b.delay*.1);
    assert.ok(layers.length>=2,'native body and hair both draw');
   }
   hairLooks++;assert.ok(store.pixelBytes<=16*1024*1024);
  }
  for(const [slot,group]of Object.entries(W.ACCESSORIES))for(const key of Object.keys(group.items).filter(k=>k!=='none')){
   const a=W.defaults(sex);a[slot]=key;const look=await store.select('hero',a,cls);assert.equal(look.pieces.length,1);
   assert.equal(look.ids.at(-1),'piece-'+key+'-'+sex);
   let visible=false;for(const stance of ['idle','walk','attack'])for(let d=0;d<8;d++){
    const r=look.pieces[0].metadata.actions[stance+d];visible ||= r.frames.some(f=>f.some(p=>p[7]===key));
    W.draw({clearRect(){},drawImage(){}},look,stance,d,0,.5,1000);
   }
   assert.ok(visible,'piece has native layers: '+key);pieces++;
  }
  const full=W.defaults(sex);full.headwear='goldDragonHelm';full.facewear='demonMask';full.mouthwear='poringLetter';full.backwear='blackThunder';
  assert.equal((await store.select('preview',full,cls)).pieces.length,4);store.release('preview');
 }
 assert.equal(hairLooks,2160);assert.equal(pieces,624);assert.ok(closed>0,'old decoded atlases evicted');
 const first=store.select('portrait',W.defaults('m'),'Rune Knight'),second=store.select('portrait',W.defaults('f'),'Warlock');assert.equal(await first,null);assert.equal((await second).cls,'Warlock');
 store.dispose();fail=true;await assert.rejects(store.select('hero',W.defaults('m'),'Rune Knight'),/offline/);fail=false;assert.equal((await store.select('hero',W.defaults('m'),'Rune Knight')).cls,'Rune Knight');
 const bad=new box.PGFourthJobs.Store({...options,fetcher:async url=>{const bytes=fs.readFileSync(url);if(url.endsWith('.png'))bytes[40]^=1;return new Response(bytes)},decode:()=>{throw Error('must verify before decode')}});await assert.rejects(bad.select('hero',W.defaults('m'),'Rune Knight'),/checksum/);bad.dispose();store.dispose();
 console.log('PASS: 2,160 fourth-job hair/color looks, all 624 class/gender/piece combinations, 288 native routes, full outfits, bounded memory, stale requests, retry and checksums.');
})().catch(e=>{console.error(e);process.exitCode=1});
