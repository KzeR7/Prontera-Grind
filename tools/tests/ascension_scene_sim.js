// Main-scene lifecycle, including stale asynchronous scenery downloads.
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),THREE=require('three');
const source=fs.readFileSync(require('path').join(__dirname,'../../index.html'),'utf8');
const start=source.indexOf('let ascensionWorld=null,'),end=source.indexOf('function buildDeco(m)',start);
const pending=[],scene=new THREE.Scene(),ground={visible:true},hemi={intensity:.8},sun={intensity:.9};
const context={ASTRAL_FOCUS:[-8,-40,-74,-140,-208],astralOriginStage:0,astralJourney:null,THREE,scene,ground,hemi,sun,KIT:{ground:{visible:true}},townObjs:[{visible:true}],road:{visible:true},Z0:-28,Z1:12,S:{mp:10,lvl:4},TRIAL:{on:false},JOB_RITE:{on:false},log(){},PGAscension:{build:()=>new Promise(resolve=>pending.push(resolve))}};context.window=context;vm.createContext(context);
vm.runInContext(source.slice(start,end)+'\nglobalThis.api={clearAscension,buildAscension,get world(){return ascensionWorld}};',context);
function world(focus=-140){let disposed=0;const w={scene:new THREE.Scene(),view:{focus},dispose(){disposed++;this.scene.clear()},get disposed(){return disposed}};w.scene.add(new THREE.Group());return w;}
(async()=>{
 const stale=world(),live=world();context.api.buildAscension(10,4);context.api.clearAscension();context.api.buildAscension(10,4);
 pending.shift()(stale);await Promise.resolve();assert.equal(stale.disposed,1);assert.equal(scene.children.length,0);
 pending.shift()(live);await Promise.resolve();assert.equal(context.api.world,live);assert.equal(ground.visible,false);assert.equal(scene.children[0].position.z,132);assert.equal(hemi.intensity,0);
 context.api.clearAscension();assert.equal(live.disposed,1);assert.equal(scene.children.length,0);assert.equal(ground.visible,true);assert.equal(hemi.intensity,.8);
 context.api.buildAscension(10,4);context.TRIAL.on=true;const trialStale=world();pending.shift()(trialStale);await Promise.resolve();assert.equal(trialStale.disposed,1);assert.equal(scene.children.length,0);
 context.TRIAL.on=false;context.api.buildAscension(10,4);context.JOB_RITE.on=true;const riteStale=world();pending.shift()(riteStale);await Promise.resolve();assert.equal(riteStale.disposed,1);assert.equal(scene.children.length,0);
 console.log('PASS: main-scene attach, bridge placement, original lighting, disposal, stale downloads and trial isolation.');
})().catch(error=>{console.error(error);process.exitCode=1});
// The actual lazy loader serves the live five-stage Astral module and maps Thor
// onto the preserved original four scenes, without accepting retired stages.
(async()=>{
 const kindFactory=require('../maps/endgame-scenes.js')(THREE),astral=require('../../assets/astral-scenery.js')(THREE),journey=require('../maps/journey-materials.js');
 const context={PGEndgameScenes:kindFactory,PGAstralScenery:astral,PGJourneyMaterials:journey,fetch:async()=>({ok:false}),document:{createElement:()=>({getContext:()=>null})}};context.window=context;vm.createContext(context);
 vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../../assets/ascension.js'),'utf8'),context);
 for(const m of [10,11])for(let stage=1;stage<=5;stage++){const w=await context.PGAscension.build(m,stage);assert.equal(w.group,stage<=2?0:stage-2);assert.ok(w.scenery.children.length);w.dispose();}
 await assert.rejects(context.PGAscension.build(11,6),/Invalid/);await assert.rejects(context.PGAscension.build(9,1),/Invalid/);
 console.log('PASS: actual lazy loader, both five-stage groups, preserved Thor boss and rejected retired stages.');
})().catch(error=>{console.error(error);process.exitCode=1});
// Minimap uses the real active floor rather than the hidden original terrain.
{
 const start=source.indexOf('function eclipseDrawMinimap(){'),end=source.indexOf('// Atlas thumbnails',start),operations=[];
 const g={fillRect(){},beginPath(){},moveTo(x,y){operations.push([x,y])},lineTo(x,y){operations.push([x,y])},closePath(){},arc(){},fill(){},stroke(){},drawImage(){throw Error('Original map texture leaked into Ascension minimap')}};
 const world=require('../../assets/astral-scenery.js')(THREE).build(3);
 const ctx={S:{mp:10},Z0:-28,Z1:12,ascensionWorld:world,mobs:[],pl:{x:0,z:-8},document:{body:{classList:{contains:()=>false}}},$:()=>({width:448,height:192,getContext:()=>g})};vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'\neclipseDrawMinimap();',ctx);
 assert.equal(operations.length,world.route.outline.length);const expected=(world.route.outline[0][1]-world.view.focus)*7+96;
 assert.equal(operations[0][1],expected);world.dispose();
 ctx.S.mp=11;ctx.ascensionWorld=require('../maps/endgame-scenes.js')(THREE).build('thor',4);operations.length=0;vm.runInContext('eclipseDrawMinimap()',ctx);assert.ok(operations.length>20);ctx.ascensionWorld.dispose();
 ctx.ascensionWorld=null;vm.runInContext('eclipseDrawMinimap()',ctx);
 console.log('PASS: active Astral/Thor minimap floor projection and loading state, without original terrain leakage.');
}
