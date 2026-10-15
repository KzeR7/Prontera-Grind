// Real travel/detail modules and the unchanged native wardrobe metadata/loader.
// Image decoding/drawing here is structural; actual pixels are checked by Chromium separately.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const THREE=require('../maps/vendor/three-r128.min.js'),J=require('../maps/journey-state.js');
const Details=require('../maps/journey-details.js')(THREE),Wardrobe=require('../../assets/wardrobe.js'),Hero=require('../maps/journey-hero.js')(THREE,Wardrobe);
const root=path.resolve(__dirname,'../..');
for(const n of [0,11,-1,1.5,NaN])assert.throws(()=>new J.Travel(n),RangeError);
for(const dt of [-1,NaN,Infinity])assert.throws(()=>new J.Travel().update(dt),RangeError);
const N=require('../maps/journey-navigation.js');
assert.deepEqual(N.parse('?map=thor&stage=10'),{destination:'thor',stage:10,overview:false});
assert.deepEqual(N.parse('?map=astral&stage=7&view=overview'),{destination:'astral',stage:7,overview:true});
for(const bad of ['-1','11','1.5','Infinity','<script>','0','07x'])assert.equal(N.parse('?stage='+encodeURIComponent(bad)).stage,1);
assert.equal(N.search('astral',7,true),'?map=astral&stage=7&view=overview');assert.equal(N.search('thor',10,true),'?map=thor&stage=10');assert.throws(()=>N.search('other',1),RangeError);
assert.equal(N.shortcut({key:'ArrowRight'}),'next');assert.equal(N.shortcut({key:' ',repeat:true}),null);assert.equal(N.shortcut({key:'End',ctrlKey:true}),null);assert.equal(N.shortcut({key:'ArrowRight',target:{closest:()=>true}}),null);
const t=new J.Travel(1,{quick:false});t.request(10);const seen=[];let previous=t.z;
for(let i=0;i<400;i++){const before=t.stage;t.update(.1);assert.ok(previous-t.z<=.6500001);assert.ok(t.z<=previous);if(t.stage!==before)seen.push(t.stage);previous=t.z;}
assert.deepEqual(seen,[2,3,4,5,6,7,8,9,10]);assert.equal(t.z,-208);assert.equal(t.moving,false);
t.request(1);for(let i=0;i<400;i++)t.update(.1);assert.equal(t.z,-8);assert.equal(t.direction,0);
t.request(4);t.update(.1);const beforePause=t.z;t.paused=true;t.update(5);assert.equal(t.z,beforePause);t.paused=false;t.request(1);for(let i=0;i<5;i++)t.update(.1);assert.equal(t.z,-8,'Mid-span reversal returns precisely, not to a later waypoint');
t.request(10);t.update(120);assert.equal(t.z,-8.65,'Background frame cap does not teleport');
// Redirect repeatedly while between stages; exact target must always be reached.
let seed=123;for(let i=0;i<80;i++){seed=seed*16807%2147483647;const target=1+seed%10;t.request(target);for(let k=0;k<(i%3?600:7);k++)t.update(.1);if(i%3)assert.equal(t.z,J.stageZ(target));}
// Quick trips preserve continuity but cap simulation duration, not frame timing.
for(let from=1;from<=10;from++)for(let to=1;to<=10;to++){
 const q=new J.Travel(from);q.request(to);let elapsed=0,old=q.z;
 if(from!==to)assert.equal(q.encounterStage,null,'Source encounter clears immediately');
 while(q.moving){q.update(.01);elapsed+=.01;assert.ok(Math.abs(q.z-old)<=q.speed*.010001);old=q.z;if(q.moving)assert.equal(q.encounterStage,null,'No intermediate encounter activation');assert.ok(elapsed<3.52);}
 assert.equal(q.z,J.stageZ(to));assert.equal(q.encounterStage,to);assert.ok(elapsed<=3.51);
}
const stalledQuick=new J.Travel();stalledQuick.request(10);stalledQuick.update(100);assert.ok(stalledQuick.z>-40&&stalledQuick.z<-8,'A long visible stall cannot skip the full route');
const quick=new J.Travel();quick.request(7);assert.equal(quick.snapshot().remainingSeconds,3.5);quick.update(.1);quick.paused=true;const z=quick.z;quick.update(.1);assert.equal(quick.z,z);assert.equal(quick.encounterStage,null,'Paused transit is not an encounter');quick.setQuick(false);assert.equal(quick.speed,6.5);quick.setQuick(true);assert.ok(quick.speed>6.5);assert.equal(quick.paused,true);assert.throws(()=>quick.setQuick('yes'),TypeError);
for(const kind of ['astral','thor'])for(let stage=1;stage<=10;stage++){
 const slots=J.encounter(kind,stage);assert.deepEqual(slots,J.encounter(kind,stage));assert.equal(new Set(slots.map(s=>s.key)).size,slots.length);
 const z=kind==='astral'?J.stageZ(stage):-8;
 for(const slot of slots){assert.ok(J.ROSTERS[kind].includes(slot.nativeId));assert.ok(Math.abs(slot.x)<=13&&Math.abs(slot.z-z)<=20);}
 assert.equal(slots.filter(s=>s.role==='MVP').length,stage===10?1:0);
}
assert.throws(()=>J.encounter('other',1),RangeError);
const catalog=JSON.parse(fs.readFileSync(path.join(root,'tools/maps/mob-catalog.json')));assert.equal(catalog.monsters.length,12);
assert.deepEqual(catalog.monsters.map(m=>m.id).sort((a,b)=>a-b),[...J.ROSTERS.astral,...J.ROSTERS.thor].sort((a,b)=>a-b));
for(const mob of catalog.monsters){assert.equal(mob.status,'missing-native-source');assert.equal(mob.atlas,null);}
const w=Details.build('astral'),again=Details.build('astral');assert.deepEqual(w.stats(),again.stats());assert.ok(w.stats().pieces>=450&&w.stats().triangles<15000);
const bounds=new THREE.Box3(),matrix=new THREE.Matrix4(),transform=new THREE.Matrix4(),safe=new THREE.Box3(new THREE.Vector3(-13,.08,-228),new THREE.Vector3(13,100,24));
w.root.updateMatrixWorld(true);const resources=new Set();
w.root.traverse(o=>{if(!o.isMesh)return;resources.add(o.geometry);resources.add(o.material);o.geometry.computeBoundingBox();for(let i=0;i<(o.isInstancedMesh?o.count:1);i++){
 if(o.isInstancedMesh){o.getMatrixAt(i,matrix);transform.multiplyMatrices(o.matrixWorld,matrix);}else transform.copy(o.matrixWorld);
 bounds.copy(o.geometry.boundingBox).applyMatrix4(transform);assert.ok(!bounds.intersectsBox(safe),'Small details must not block the full player path');
 if(o.userData.category==='detail-floor')assert.ok(bounds.max.y<.08);
}});
const banners=w.root.children.filter(o=>!o.isInstancedMesh),base=banners.map(o=>[...o.geometry.attributes.position.array]);w.update(12,true);assert.notDeepEqual(banners.map(o=>[...o.geometry.attributes.position.array]),base);w.update(15,false);assert.deepEqual(banners.map(o=>[...o.geometry.attributes.position.array]),base);
let released=0;resources.forEach(r=>r.addEventListener('dispose',()=>released++));w.dispose();assert.equal(released,resources.size);w.dispose();assert.equal(released,resources.size);again.dispose();
const thor=Details.build('thor');assert.equal(thor.root.children.length,0,'Approved Thor maps receive no scenery overlay');thor.dispose();
(async()=>{
 let imageCloses=0,draws=0;const store=new Wardrobe.Store({base:'',fetcher:async file=>{const bytes=fs.readFileSync(path.join(root,'assets/wardrobe/v5',file));return new Response(bytes,{status:200,headers:{'content-length':String(bytes.length)}});},decode:async bytes=>{const b=Buffer.from(bytes);return{width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){imageCloses++;}};}});
 const ctx={clearRect(){},drawImage(){draws++;}},canvas={width:0,height:0,getContext:()=>ctx};const actor=Hero.create({createCanvas:()=>canvas,store});
 assert.equal(await actor.ready,true);assert.equal(actor.status,'ready');assert.equal(canvas.width,320);assert.equal(canvas.height,280);const sprite=actor.root.children[0];assert.equal(sprite.center.x,.5);assert.equal(sprite.center.y,1-200/280);
 assert.equal(actor.update(0,false,4,true),true);const firstDraws=draws;assert.ok(firstDraws>0);assert.equal(actor.update(600,false,4,true),false);assert.equal(draws,firstDraws,'Reduced-motion idle freezes a real native frame');
 assert.equal(actor.update(0,true,4,true),true);assert.equal(actor.update(300,true,4,true),true);assert.match(actor.diagnostics().painted,/walk4/);assert.equal(actor.update(300,true,0,true),true);assert.match(actor.diagnostics().painted,/walk0/);
 const look=store.clients.get('journey').ready,cat=store.catalog;actor.dispose();assert.equal(imageCloses,2);assert.equal(actor.root.children.length,0);actor.dispose();assert.equal(imageCloses,2);
 let attempts=0,disposes=0;const retryStore={catalog:cat,pixelBytes:0,select:async()=>{if(!attempts++)throw Error('Missing native file');return look;},dispose(){disposes++;}};
 const retry=Hero.create({store:retryStore,createCanvas:()=>canvas});assert.equal(await retry.ready,false);assert.equal(retry.status,'failed');assert.equal(retry.root.children.length,0,'No replacement hero on native failure');assert.equal(await retry.retry(),true);retry.dispose();
 let resolve;const lateStore={catalog:cat,select:()=>new Promise(r=>{resolve=r;}),dispose(){disposes++;}};const late=Hero.create({store:lateStore,createCanvas:()=>canvas});late.dispose();resolve(look);assert.equal(await late.ready,false);assert.equal(late.root.children.length,0,'Late download cannot recreate disposed native actor');
 console.log('Journey: continuous/reversible/paused/redirected travel, all 20 encounter layouts, 12 honest source-pending mobs, detail geometry/safety/disposal, native hash-checked hero loading/actions/anchors, idle motion, retry and late-disposal pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
