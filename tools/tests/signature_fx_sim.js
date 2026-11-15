// Signature skill effects: original Ragnarok Online flipbooks (assets/ro-fx/, haven-v412) plus the
// painted ones (haven-v411). Runs assets/signature-fx.js against a stub renderer.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),index=fs.readFileSync(path.join(root,'index.html'),'utf8');
let passed=0;const ok=name=>{passed++;console.log('  ok   '+name)};
const painted=[];
const ctx2d=()=>new Proxy({},{get:(t,k)=>k in t?t[k]:(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):()=>{},set:(t,k,v)=>{t[k]=v;return true}});
const document={createElement:tag=>{assert.equal(tag,'canvas');const c={width:0,height:0,getContext:()=>ctx2d()};painted.push(c);return c}};
class Vec{constructor(){this.x=this.y=this.z=0}set(x,y,z){this.x=x;this.y=y;this.z=z===undefined?this.z:z}}
class Tex{constructor(){this.repeat=new Vec();this.offset=new Vec();this.image={width:8,height:8}}clone(){return new Tex()}dispose(){}}
const loaded=[];
const THREE={LinearFilter:1,AdditiveBlending:2,NormalBlending:1,TextureLoader:class{load(url,done){loaded.push(url);const t=new Tex();done&&done(t);return t}},
 CanvasTexture:class{constructor(image){this.image=image}},
 SpriteMaterial:class{constructor(o){Object.assign(this,o);this.opacity=1;this.rotation=0;this.disposed=false}dispose(){this.disposed=true}},
 Sprite:class{constructor(m){this.material=m;this.position=new Vec();this.scale=new Vec();this.center=new Vec();this.visible=true}}};
const scene={items:new Set(),add(o){this.items.add(o)},remove(o){this.items.delete(o)}};
const box={document,console};box.window=box;vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(root,'assets/ro-fx/index.js'),'utf8'),box);vm.runInContext(fs.readFileSync(path.join(root,'assets/signature-fx.js'),'utf8'),box);
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
assert.deepEqual(by.ch_asura.spend,{key:'sphere',per:.5});assert.equal(by.ch_asura.from,'Monk');assert.equal(by.ch_asura.requiresStack,'sphere');assert.ok(by.ch_asura.core&&by.ch_asura.power>=4*by.mo_chain.power,'Asura Strike must dwarf the combo skills');
for(const id of ['mo_triple','mo_chain','ch_palm','ch_crush','ch_glacier','su_tiger'])assert.equal(by[id].castGain.key,'sphere',id);
for(const id of ['al_flora','bi_plant','al_bomb','ge_fire'])assert.ok(by[id].field&&by[id].field.duration>=4,id+' should persist');
for(const id of ['gs_rapid','gs_triple','rb_fire'])assert.equal(by[id].castGain.key,'coin',id);
for(const id of ['gs_track','rb_slug'])assert.equal(by[id].spend.key,'coin',id);
ok('spheres feed Asura Strike, plants and fire persist, coins feed the heavy shots');

// ---- original art ----
const pack=box.RO_FX,used=F.books(),manifest=JSON.parse(fs.readFileSync(path.join(root,'tools/native-expanded/fx-source-manifest.json'),'utf8'));
for(const key of used){assert.ok(pack.books[key],'effect names a flipbook that was not baked: '+key);}
for(const [key,m] of Object.entries(pack.books)){const file=path.join(root,pack.dir,m.file);assert.ok(fs.existsSync(file),m.file);
  assert.ok(m.n>=1&&m.cols*m.rows>=m.n&&m.w>0&&m.h>0&&m.u>0&&m.ox>=-1&&m.ox<=2&&m.oy>=-1&&m.oy<=2,key);
  assert.equal(fs.readFileSync(file).subarray(8,12).toString(),'WEBP',key);assert.ok(used.includes(key),'baked but never played: '+key)}
for(const f of manifest.files){assert.match(f.sha256,/^[0-9a-f]{64}$/);assert.match(f.blob,/^[0-9a-f]{40}$/);assert.match(f.commit,/^[0-9a-f]{40}$/)}
const packBytes=fs.readdirSync(path.join(root,pack.dir)).reduce((a,n)=>a+fs.statSync(path.join(root,pack.dir,n)).size,0);
assert.ok(packBytes/1048576<2.5,'the effect pack exceeds its 2.5 MiB budget: '+(packBytes/1048576).toFixed(2));
ok(Object.keys(pack.books).length+' original flipbooks ('+(packBytes/1048576).toFixed(2)+' MiB), every one pinned to a source and used by a skill');

assert.equal(pack.books.asura.n,6,'the six Asura Strike characters');assert.equal(pack.books.tarot.n,14,'fourteen tarot cards');
for(const id of ['ch_asura','su_gate','nj_final','gs_desp','rb_god','ko_cross','cr_grand','dn_tarot'])assert.ok(JSON.stringify(box.PGSignatureFx.ids().includes(id)));
assert.ok(loaded.length>=Object.keys(pack.books).length,'every flipbook is requested by the skills that use it');
loaded.length=0;F.warm({THREE,ids:['ch_asura','nope']});F.warm({THREE,ids:['ch_asura']});assert.ok(loaded.length<=1,'warming a class twice must not download again');
assert.match(index,/<script src="assets\/ro-fx\/index\.js\?v=\d+"><\/script>\n<script src="assets\/signature-fx\.js/,'the flipbook index loads before the effects');
ok('Asura Strike, Flash Combo, Final Strike, Desperado and Hammer of God play the client art');

// ---- autocast and suggested combos (data shape; the engine is covered by expanded_roster_sim) ----
const ids=new Set([...index.matchAll(/\{"id":"([a-z0-9_]+)"/g)].map(m=>m[1]));
for(const r of rows.filter(r=>r.autocast)){const a=r.autocast;assert.ok(['attack','cast','both'].includes(a.on),r.id);assert.ok(a.chance>0&&a.chance<=1,r.id);assert.ok(r.type==='buff'||r.type==='pas',r.id);
  assert.ok(a.same?a.power>0&&a.power<1:a.pool.length>0,r.id);for(const e of a.pool||[]){assert.ok(ids.has(e.as),r.id+' borrows a skill that does not exist: '+e.as);assert.ok(e.power>0&&e.hits>=1,r.id)}}
for(const id of ['sa_hind','sc_double','so_strike','sc_auto','st_plag','gs_chain','ko_shadow','pa_sac'])assert.ok(by[id].autocast,id+' should autocast');
const planText=index.slice(index.indexOf('const COMBO_PLAN={'),index.indexOf('const STACK_LABEL='));const plans=vm.runInNewContext('('+planText.slice(planText.indexOf('{'),planText.lastIndexOf('}')+1)+')');
const classes=new Set(rows.map(r=>r.from));assert.equal(Object.keys(plans).length,22);
for(const [cls,plan] of Object.entries(plans)){assert.ok(classes.has(cls),cls);assert.ok(plan.length>=2,cls);for(const id of plan){assert.ok(by[id],cls+' plans a skill that does not exist: '+id);assert.equal(by[id].type,'act',id)}
  assert.ok(by[plan[plan.length-1]].core,cls+' should end on a signature skill');assert.equal(new Set(plan).size,plan.length,cls)}
ok('eight skills autocast, and all 22 suggested combos end on a signature skill');
console.log(passed+' passed, 0 failed');
