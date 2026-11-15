// Signature skill effects (haven-v411): Asura Strike's kanji, Crazy Weed, bottles, plants, spheres,
// coins, shuriken and revolver fire. Runs assets/signature-fx.js against a stub renderer.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),index=fs.readFileSync(path.join(root,'index.html'),'utf8');
let passed=0;const ok=name=>{passed++;console.log('  ok   '+name)};
const painted=[];
const ctx2d=()=>new Proxy({},{get:(t,k)=>k in t?t[k]:(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):()=>{},set:(t,k,v)=>{t[k]=v;return true}});
const document={createElement:tag=>{assert.equal(tag,'canvas');const c={width:0,height:0,getContext:()=>ctx2d()};painted.push(c);return c}};
class Vec{constructor(){this.x=this.y=this.z=0}set(x,y,z){this.x=x;this.y=y;this.z=z===undefined?this.z:z}}
const THREE={LinearFilter:1,AdditiveBlending:2,NormalBlending:1,
 CanvasTexture:class{constructor(image){this.image=image}},
 SpriteMaterial:class{constructor(o){Object.assign(this,o);this.opacity=1;this.rotation=0;this.disposed=false}dispose(){this.disposed=true}},
 Sprite:class{constructor(m){this.material=m;this.position=new Vec();this.scale=new Vec();this.center=new Vec();this.visible=true}}};
const scene={items:new Set(),add(o){this.items.add(o)},remove(o){this.items.delete(o)}};
const box={document,console};vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(root,'assets/signature-fx.js'),'utf8'),box);
const F=box.PGSignatureFx,call=(id,extra={})=>F.play(id,{THREE,scene,from:{x:0,z:0},to:{x:4,z:1},floor:0,unit:2.16,life:0,...extra});
const drain=()=>{for(let i=0;i<400&&F.count;i++)F.tick(.05)};
console.log('signature skill effects');

const a=index.indexOf('const SKILLSX=['),b=index.indexOf('\n];',a),rows=index.slice(a,b).split('\n').slice(1).map(l=>JSON.parse(l.trim().replace(/,$/,''))),by=Object.fromEntries(rows.map(r=>[r.id,r]));
for(const id of F.ids())assert.ok(by[id],'effect is mapped to a skill that does not exist: '+id);
for(const id of ['ch_asura','su_gate','ge_weed','bi_demo','al_acid','al_flora','bi_plant','nj_huuma','gs_desp','gs_rapid','mo_sphere'])assert.ok(F.has(id),id+' has no signature effect');
ok(F.ids().length+' skills carry a signature effect, each one a real skill');

for(const id of F.ids()){assert.equal(call(id),true,id);assert.ok(F.count>0,id+' drew nothing');
  for(let i=0;i<400&&F.count;i++){F.tick(.05);for(const s of scene.items)for(const v of [s.position.x,s.position.y,s.position.z,s.scale.x,s.scale.y,s.material.opacity,s.material.rotation])assert.ok(Number.isFinite(v),id+' produced a non-finite value')}
  assert.equal(F.count,0,id+' never finished');assert.equal(scene.items.size,0,id+' left sprites in the scene')}
ok('every effect plays to the end with finite numbers and removes its sprites');

call('ch_asura');assert.equal(F.count,5+6+2,'five spheres, six kanji, a flash and a ring');drain();
assert.ok([...'阿修羅覇凰拳'].length===6&&fs.readFileSync(path.join(root,'assets/signature-fx.js'),'utf8').includes("text:'阿修羅覇凰拳'"));
ok('Asura Strike gathers five spheres and throws its six kanji');

call('al_flora',{life:6});let t=0;while(F.count){F.tick(.1);t+=.1;assert.ok(t<7)}assert.ok(t>5.8,'the Flora should stand for its whole 6 seconds, stood '+t.toFixed(1));
ok('a summoned plant stands for the life of its field');

for(let i=0;i<40;i++)call('ge_weed');assert.ok(F.count<=90,'particle cap');assert.ok(scene.items.size<=90);F.clear();assert.equal(F.count,0);assert.equal(scene.items.size,0);
ok('a burst of casts stays under the sprite cap, and clear() empties the scene');

assert.equal(F.play('pierce',{THREE,scene,from:{x:0,z:0}}),false);assert.equal(F.play('ch_asura',null),false);assert.equal(F.count,0);
call('mo_sphere',{to:null});drain();
ok('other skills are ignored; a self-cast with no target is fine');

assert.match(index,/<script src="assets\/signature-fx\.js\?v=\d+"><\/script>/);
assert.match(index,/PGSignatureFx\.play\(id,\{THREE,scene,/);assert.match(index,/function tickSkillFx\(dt\)\{if\(typeof PGSignatureFx!=='undefined'\)PGSignatureFx\.tick\(dt\);/);
assert.match(index,/target\.sk\.field&&target\.age>1e-6\)\)PGSignatureFx\.play/,'a field must not restart its signature every tick');
assert.match(fs.readFileSync(path.join(root,'tools/build_site.sh'),'utf8'),/require assets\/signature-fx\.js/);
ok('the game loads it, plays it once per cast and ticks it every frame');

// The mechanics the effects stand for.
assert.deepEqual(by.ch_asura.spend,{key:'sphere',per:.3});assert.equal(by.ch_asura.from,'Monk');
for(const id of ['mo_triple','mo_chain','ch_palm','ch_crush','ch_glacier','su_tiger'])assert.equal(by[id].castGain.key,'sphere',id);
for(const id of ['al_flora','bi_plant','al_bomb','ge_fire'])assert.ok(by[id].field&&by[id].field.duration>=4,id+' should persist');
for(const id of ['gs_rapid','gs_triple','rb_fire'])assert.equal(by[id].castGain.key,'coin',id);
for(const id of ['gs_track','rb_slug'])assert.equal(by[id].spend.key,'coin',id);
ok('spheres feed Asura Strike, plants and fire persist, coins feed the heavy shots');
console.log(passed+' passed, 0 failed');
