const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const W=require('../../assets/wardrobe.js');
const box={PGWardrobe:W,TextDecoder};vm.createContext(box);vm.runInContext(fs.readFileSync('assets/fourth-jobs.js','utf8'),box);
global.crypto=webcrypto;
const base='assets/fourth-jobs/v1/',catalog=JSON.parse(fs.readFileSync(base+'catalog.json'));
let fail=false,closed=0;
const store=new box.PGFourthJobs.Store({fetcher:async url=>{if(fail&&url.endsWith('.png'))throw Error('offline');return new Response(fs.readFileSync(url))},decode:async bytes=>({width:Buffer.from(bytes).readUInt32BE(16),height:Buffer.from(bytes).readUInt32BE(20),close(){closed++}})});
(async()=>{
 for(const cls of Object.keys(box.PGFourthJobs.CLASSES))for(const sex of ['m','f']){
  const a=W.defaults(sex);a.heads.m=5;a.backwear='wings';const before=JSON.stringify(a),look=await store.select('hero',a,cls),rec=catalog.looks[box.PGFourthJobs.CLASSES[cls]+'-'+sex];
  assert.equal(look.cls,cls);assert.equal(look.fixedNative,true);assert.equal(JSON.stringify(a),before,'preserve saved cosmetics');
  for(const stance of ['idle','walk','attack'])for(let dir=0;dir<8;dir++){
   const expected=rec.actions[stance+dir],actual=look.base.metadata.actions[stance+dir];assert.equal(actual.delay,expected.delay);assert.equal(actual.action,expected.action);
   for(let i=0;i<expected.frames.length;i++){
    let drawn;W.draw({clearRect(){},drawImage(...args){drawn=args}},look,stance,dir,expected.delay*(i+.1));
    const f=expected.frames[i];assert.deepEqual(drawn.slice(1),[...f,f[2],f[3]],'exact original pixels/placement');
   }
  }
  assert.ok(store.pixelBytes<=16*1024*1024);
 }
 assert.ok(closed>0,'old decoded atlases evicted');
 const first=store.select('portrait',W.defaults('m'),'Rune Knight'),second=store.select('portrait',W.defaults('f'),'Warlock');assert.equal(await first,null);assert.equal((await second).cls,'Warlock');
 store.dispose();fail=true;await assert.rejects(store.select('hero',W.defaults('m'),'Rune Knight'),/offline/);fail=false;assert.equal((await store.select('hero',W.defaults('m'),'Rune Knight')).cls,'Rune Knight');
 const bad=new box.PGFourthJobs.Store({fetcher:async url=>{const bytes=fs.readFileSync(url);if(url.endsWith('.png'))bytes[40]^=1;return new Response(bytes)},decode:()=>{throw Error('must verify before decode')}});await assert.rejects(bad.select('hero',W.defaults('m'),'Rune Knight'),/checksum/);bad.dispose();store.dispose();
 console.log('PASS: 12 native looks, 288 routes, all frames/placement/clocks, cosmetics preserved, memory eviction, stale requests, failure/retry and checksum protection.');
})().catch(e=>{console.error(e);process.exitCode=1});
