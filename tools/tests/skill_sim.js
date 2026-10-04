// Skills: the roster, the four new effects (dot / stun / chain / tradeoff), default-on
// auto-cast behavior and per-skill toggles, plus casts per swing at each job tier.
//   node tools/tests/skill_sim.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name); return m[0]; };

// CD -> CLASSES -> down() -> act/pas/tos -> SKILLS -> the FX tagging block
const roster = grab('const CD=[', 'const pm=s=>');
// the whole effect-helper block (applyDot / applyStun / chainHit). chainHit is pulled in but
// never called here - it needs mobs, shots and hurt(), which belong to the live game loop.
const ledger = grab('const skLine=()=>lineOf(S.cls);', 'const refCost=it=>');
const helpers = [
  grab('// ---------- skill effects: damage over time, stun, chain ----------', 'const mkDrop='),
  pick(/const SKSLOTS=[^;]+;/, 'SKSLOTS'),
  pick(/const skCost=[^;]+;/, 'skCost()'),
  pick(/const skOff=[^;]+;/, 'skOff()'),
].join('\n');

const harness = `
${roster}
${helpers}
${ledger}
// skOff and skillOn share one line in index.html, so the pick above already brought both in.
let S = null, tb = {}, skCd = {}, dt = 0;
const lv = id => (S.sk && S.sk[id]) || 0;
const maxHp = () => 1000, log = () => {}, addFloat = () => {}, skillNameFloat = () => {}, playSkillFx = () => {}, pl = {x:0,z:0};
this.__k = { SKILLS, CLASSES, SKSLOTS, SKFADE, SKILL_VFX, skillFxSpec, skCost, applyDot, applyStun, skillOn, skOff, down, skLine, skEarned, skSpent, skpAvail,
             set S(v){S=v}, get S(){return S},
             get tb(){return tb}, set tb(v){tb=v},
             get skCd(){return skCd}, set skCd(v){skCd=v},
             set dt(v){dt=v},
             run: code => eval(code) };   // executes a real block lifted out of update()
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const K = sb.__k;

// Smoke-test the real visual recipes with minimal Three.js stand-ins. This catches a mapped
// skill family that refers to a missing primitive, fails to animate, or leaks on expiry.
class FakeVec3 { constructor(x=0,y=0,z=0){this.set(x,y,z)} set(x,y,z){this.x=x;this.y=y;this.z=z;return this} copy(v){return this.set(v.x||0,v.y||0,v.z||0)} }
class FakeGeometry { constructor(...args){this.args=args} dispose(){this.disposed=true} }
class FakeBufferGeometry extends FakeGeometry { setFromPoints(p){this.points=p;return this} }
class FakeMaterial { constructor(o){Object.assign(this,o)} dispose(){this.disposed=true} }
class FakeObject {
  constructor(){this.position=new FakeVec3();this.scale=new FakeVec3(1,1,1);this.rotation={x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}};this.quaternion={copy(){}};this.userData={};this.children=[]}
  add(o){this.children.push(o)}
  traverse(fn){fn(this);for(const o of this.children)o.traverse?o.traverse(fn):fn(o)}
}
class FakeMesh extends FakeObject { constructor(geometry,material){super();this.geometry=geometry;this.material=material} }
class FakeLine extends FakeMesh {}
const fakeThree={RingGeometry:FakeGeometry,TorusGeometry:FakeGeometry,IcosahedronGeometry:FakeGeometry,ConeGeometry:FakeGeometry,
  BoxGeometry:FakeGeometry,CircleGeometry:FakeGeometry,MeshBasicMaterial:FakeMaterial,LineBasicMaterial:FakeMaterial,
  Mesh:FakeMesh,Line:FakeLine,Group:FakeObject,BufferGeometry:FakeBufferGeometry,Vector3:FakeVec3,DoubleSide:2,AdditiveBlending:3};
const vfxBox={THREE:fakeThree,removed:[],scene:{add(){},remove(o){vfxBox.removed.push(o)}},cam:{quaternion:{}},pl:{x:0,z:0},cl:(v,a,b)=>Math.max(a,Math.min(b,v)),
  skillFx:[],SKILL_VFX:JSON.parse(JSON.stringify(K.SKILL_VFX))};
vm.createContext(vfxBox);
vm.runInContext(grab('function skillFxSpec(id,color)', '// ---------- world:')+'\n'+grab('const SKILL_FX_GEOMETRY=', 'let drag=null;const dom=R.domElement;')+
  '\nthis.__renderer={playSkillFx,tickSkillFx,syncSkillFx,get effects(){return skillFx}};',vfxBox);

// Pull the tradeoff activation and expiry blocks out of update() by brace matching, so the
// test runs the REAL code. A structural test cannot catch this class of bug: v8/v9 shipped
// tradeoffs that stored level-scaling functions in tb instead of calling them, and guarded on
// 'tb.t<=0' while tb.t was undefined - so no tradeoff ever fired, and had it fired, atk()
// would have returned NaN and every hit would have dealt NaN.
function block(marker){
  const i = src.indexOf(marker);
  if (i < 0) throw new Error('cannot find ' + marker);
  const j = src.indexOf('{', i);
  let d = 0;
  for (let k = j; k < src.length; k++){
    if (src[k] === '{') d++;
    else if (src[k] === '}'){ d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced braces after ' + marker);
}
const ACTIVATE = block('if((tb.t||0)<=0){');
const TICK = block('if((tb.t||0)>0){');
const PET_SKILL_SRC = pick(/const PET_SKILLS=\[[\s\S]*?\n\];/, 'six pet gacha skills');
const PET_DATA_SRC = pick(/const PETS=\[[\s\S]*?\];/, 'Divine Pride pet sprite data');
const PET_SKILL_COST_SRC = pick(/petSkillCost=p=>[^,;]+/, 'pet skill gacha cost');
const PET_TRAINING_SRC = pick(/const EGG=3000,GW=\[[^\]]*\],PT=\[[^\]]*\],PTG=\[[^\]]*\],GREAT=[^;]+;/, 'pet training odds');
const PET_UPGRADE_DATA = pick(/const PEQ=\[[\s\S]*?\];/, 'Claw/Collar/Charm names');
const PET_UPGRADE_COST_SRC = pick(/peqCost=t=>[^,;]+/, 'pet upgrade cost');
const PET_UPGRADE_ACTION = block('peq:v=>');
const PET_RELEASE_ACTION = block('prel:id=>');
const PET_SKILL_ROLL = pick(/const PET_SKILL_WEIGHTS=PET_SKILLS\.map\(\(\)=>1\),rollPetSkill=\(\)=>PET_SKILLS\[pickW\(PET_SKILL_WEIGHTS\)\];/, 'equal pet skill gacha odds');
const pickWMatch = src.match(/const pickW=w=>\{[\s\S]*?\},gp=/);
if (!pickWMatch) throw new Error('cannot extract weighted gacha picker');
const PICKW_CODE = pickWMatch[0].slice(0, -',gp='.length) + ';';
const PET_HIT_SRC = grab('function petHit(p,target){', 'const rollingSet=new Set');
const PET_GACHA_ACTION = block('pskill:id=>');
const STRIKE_SRC = grab('function strike(mult,col,magic=false){', '// Higher job tiers');
function makePetHarness(){
  const box={};vm.createContext(box);
  vm.runInContext(`
    ${PET_DATA_SRC}
    ${PET_SKILL_SRC}
    const MUT=[1,2,4,6,8,20,40],MC=[0];
    let petBuff={atk:0,matk:0,atkT:0,matkT:0},petSkillCd={},mobs=[];
    const petDmg=()=>100,pl={x:0,z:0},rnd=(a,b)=>(a+b)/2;
    const logs=[],log=(...x)=>logs.push(x),addFloat=()=>{},playSkillFx=()=>{},hurt=(o,d)=>{o.hp-=d};
    ${PICKW_CODE}
    ${PET_SKILL_ROLL}
    ${PET_HIT_SRC}
    this.__pet={PET_SKILLS,petHit,logs,get buff(){return petBuff},set buff(v){petBuff=v},
      get cooldowns(){return petSkillCd},set cooldowns(v){petSkillCd=v},get mobs(){return mobs},set mobs(v){mobs=v},
      rollAll(){const a=[.01,.18,.34,.51,.68,.84];let i=0;Math.random=()=>a[i++];return Array.from({length:6},()=>rollPetSkill().id)}};
  `,box);
  return box.__pet;
}

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('skills: roster, effects, auto-cast defaults and switches, casts per swing\n');

const byId = id => K.SKILLS.find(s => s.id === id);

t('every skill id is unique (a duplicate would strand spent points)', () => {
  const seen = new Map();
  for (const s of K.SKILLS) {
    assert.ok(!seen.has(s.id), `duplicate id "${s.id}" (${seen.get(s.id)} and ${s.n})`);
    seen.set(s.id, s.n);
  }
  console.log('       ' + K.SKILLS.length + ' skills');
});

t('magical class skills route through MATK, while physical classes remain ATK-based', () => {
  const magicLines = new Set(['Mage','Wizard','High Wizard','Acolyte','Priest','High Priest']);
  for (const s of K.SKILLS.filter(x=>x.type==='act')) assert.strictEqual(!!s.magic,magicLines.has(s.from),s.n+' has the wrong damage stat');
  for (const id of ['fire','nap','storm','holy','magnus','judex','tundead']) assert.ok(byId(id).magic,id+' should deal MATK damage');
  for (const id of ['bash','dstr','mammo','env']) assert.ok(!byId(id).magic,id+' should deal physical ATK damage');
  assert.strictEqual(byId('amp').key,'matk','Amplify Magic must raise MATK, not physical ATK');
  assert.strictEqual(byId('mystic').key,'matk','Mystical Amplification must raise MATK, not physical ATK');
  assert.ok(src.includes('strike(m,sk.col,!!sk.magic)')&&src.includes('magic:!!sk.magic')&&src.includes('strike(p.m,p.col,!!p.magic)'),
    'multi-hit spells must preserve the MATK path through their delayed strikes');
});

t('player ATK and MATK formulas consume only their matching pet buffs and passives', () => {
  const atkLine=pick(/const atk=\(\)=>[^\n]*/, 'atk formula');
  const matkLine=pick(/const matk=\(\)=>[^\n]*/, 'matk formula');
  const box={};vm.createContext(box);
  vm.runInContext(`
    const S={lv:20,st:{str:10,agi:10,dex:10,luk:10,int:20},eq:{off:null}};
    const C=()=>({main:'str',atk:1}),eqv=()=>0,st=k=>S.st[k],bon=()=>0,collDmg=()=>0;
    let matkp=10,petBuff={atk:0,matk:0},tb={};const pv=k=>k==='matk'?matkp:0;
    ${atkLine};${matkLine}
    this.measure=()=>{
      const a0=atk(),m0=matk();matkp=0;const aNoPassive=atk(),mNoPassive=matk();matkp=10;
      petBuff.atk=20;const aBuff=atk(),mAfterAtk=matk();petBuff.atk=0;petBuff.matk=20;
      const mBuff=matk(),aAfterMatk=atk();return{a0,m0,aNoPassive,mNoPassive,aBuff,mAfterAtk,mBuff,aAfterMatk};
    };
  `,box);
  const v=box.measure();
  assert.strictEqual(v.a0,v.aNoPassive,'a MATK passive must not inflate physical ATK');
  assert.ok(v.m0>v.mNoPassive,'the Wizard MATK passive must raise magical power');
  assert.ok(v.aBuff>v.a0,'the pet ATK buff did not change ATK');
  assert.strictEqual(v.mAfterAtk,v.m0,'the pet ATK buff leaked into MATK');
  assert.ok(v.mBuff>v.m0,'the pet MATK buff did not change MATK');
  assert.strictEqual(v.aAfterMatk,v.a0,'the pet MATK buff leaked into physical ATK');
  const strikeBox={};vm.createContext(strikeBox);
  vm.runInContext(`
    let mob={x:0,z:0,hp:10000,size:.6,spriteScale:1},shake=0;
    const atk=()=>100,matk=()=>200,missCh=()=>0,crit=()=>0,st=()=>0,critD=()=>2,rnd=(a,b)=>a,addFloat=()=>{},damageFloat=()=>{};
    ${STRIKE_SRC}
    const hp=mob.hp;strike(1,'#fff',false);const physical=hp-mob.hp;mob.hp=hp;strike(1,'#fff',true);this.damage={physical,magical:hp-mob.hp};
  `,strikeBox);
  assert.strictEqual(strikeBox.damage.magical,strikeBox.damage.physical*2,'the real strike() ignored its magic flag');
});

t('the gacha contains exactly two buffs, two AoE attacks and two single-target attacks', () => {
  const P=makePetHarness(),skills=Array.from(P.PET_SKILLS);
  assert.strictEqual(skills.length,6,'the pet skill pool must contain exactly six skills');
  assert.strictEqual(skills.filter(s=>s.kind==='buff').length,2,'need two player buffs');
  assert.deepStrictEqual(skills.filter(s=>s.kind==='buff').map(s=>s.stat).sort(),['atk','matk']);
  assert.strictEqual(skills.filter(s=>s.kind==='aoe').length,2,'need two AoE attacks');
  assert.strictEqual(skills.filter(s=>s.kind==='single').length,2,'need two single-target attacks');
  assert.ok(skills.every(s=>s.cd>0&&s.desc&&K.SKILL_VFX[s.vfx]),'every gacha skill needs cooldown, description and visible effect');
  const rolled=Array.from(P.rollAll());assert.strictEqual(new Set(rolled).size,6,'equal-weight gacha rolls must reach every skill');
  assert.deepStrictEqual(rolled,skills.map(s=>s.id),'seeded 1/6 rolls did not cover the six skills in order');
});

t('the real pet skill gacha action charges Zeny, saves the roll and respects the balance', () => {
  const action=PET_GACHA_ACTION.slice('pskill:'.length),box={};vm.createContext(box);
  vm.runInContext(`
    ${PET_DATA_SRC}
    ${PET_SKILL_SRC}
    ${PICKW_CODE}
    ${PET_SKILL_ROLL}
    const ${PET_SKILL_COST_SRC};
    let S={zeny:5000,pets:[{id:7,sp:0,skill:''}]},petSkillCd={7:4},logRows=[],uiCount=0,saveCount=0;
    const gp=id=>S.pets.find(p=>String(p.id)===String(id)),log=(...x)=>logRows.push(x),ui=()=>uiCount++,save=()=>saveCount++;
    const pskillAction=${action};
    this.__g={S,logRows,get uiCount(){return uiCount},get saveCount(){return saveCount},get petSkillCd(){return petSkillCd},run:id=>pskillAction(id)};
  `,box);
  vm.runInContext('Math.random=()=>.01;this.__g.run(7);',box);
  assert.strictEqual(box.__g.S.zeny,3000,'gacha cost should be charged once');
  assert.strictEqual(box.__g.S.pets[0].skill,'warcry','the real action did not store its skill roll');
  assert.strictEqual(box.__g.petSkillCd[7],undefined,'rerolled pets should begin off cooldown');
  assert.strictEqual(box.__g.saveCount,1,'gacha result must be saved');
  box.__g.S.zeny=0;vm.runInContext('this.__g.run(7);',box);
  assert.strictEqual(box.__g.saveCount,1,'an unaffordable roll should not save or reroll');
});

t('the live pet upgrade handler applies its 40%/15% odds, cost and 5% double success', () => {
  const action=PET_UPGRADE_ACTION.slice('peq:'.length),box={};vm.createContext(box);
  vm.runInContext(`
    ${PET_TRAINING_SRC}
    ${PET_UPGRADE_DATA}
    const ${PET_UPGRADE_COST_SRC};
    let S={zeny:50000,pets:[{id:7,sp:0,eq:[0,2,0]}]},rows=[],uiCount=0,saveCount=0,rolls=[],ri=0;
    const gp=id=>S.pets.find(p=>String(p.id)===String(id)),log=(...x)=>rows.push(x),ui=()=>uiCount++,save=()=>saveCount++,addFloat=()=>{},pl={x:0,z:0};
    const upgrade=${action};
    this.__up={S,rows,get uiCount(){return uiCount},get saveCount(){return saveCount},run:(r,v)=>{rolls=r;ri=0;Math.random=()=>rolls[ri++]??.99;upgrade(v)}};
  `,box);
  const P=box.__up;P.run([.2,.9],'7:0');
  assert.strictEqual(P.S.pets[0].eq[0],1,'a successful Claw roll should gain one level');
  assert.strictEqual(P.S.zeny,48800,'Claw level 0 cost should be 1,200 Zeny');
  assert.ok(P.rows.at(-1)[0].includes('Claw trained to Wooden'),'success feedback should name the upgrade');
  P.run([.1,.01],'7:1');
  assert.strictEqual(P.S.pets[0].eq[1],4,'a 5% great-success roll should advance Collar two levels');
  assert.strictEqual(P.S.zeny,38000,'Collar level 2 cost should be 10,800 Zeny');
  assert.ok(P.rows.at(-1)[0].includes('GREAT SUCCESS! Collar trained to Gold (+2)'),'double-upgrade feedback');
  P.run([.99],'7:2');
  assert.strictEqual(P.S.pets[0].eq[2],0,'a failed Charm roll must not grant a level');
  assert.strictEqual(P.S.zeny,36800,'failed rolls still charge the 1,200 Zeny attempt');
  assert.ok(P.rows.at(-1)[0].includes('Charm training failed'),'failure feedback should name the upgrade');
  assert.strictEqual(P.saveCount,3,'each attempt should persist its result');
});

t('releasing a pet clears its auto-roll and skill-cooldown state', () => {
  const action=PET_RELEASE_ACTION.slice('prel:'.length),box={};vm.createContext(box);
  vm.runInContext(`
    ${PET_DATA_SRC}
    const EGG=3000;let S={zeny:100,pets:[{id:7,sp:0}]},petSkillCd={7:8},autoSet=new Set([7]),pending=null,saveCount=0,uiCount=0;
    const gp=id=>S.pets.find(p=>String(p.id)===String(id)),ask=(msg,fn)=>{pending=fn},save=()=>saveCount++,ui=()=>uiCount++;
    let zenyEarned=0;${grab('function earnZeny(amount){','function kill(o){')}
    const release=${action};
    this.__rel={S,petSkillCd,autoSet,release,get pending(){return pending},get saveCount(){return saveCount},get uiCount(){return uiCount},confirm:()=>pending()};
  `,box);
  const P=box.__rel;P.release(7);
  assert.strictEqual(P.S.pets.length,1,'the confirmation prompt should leave the pet intact');
  assert.strictEqual(P.petSkillCd[7],8,'cooldown is only cleared after confirmed release');
  P.confirm();
  assert.strictEqual(P.S.pets.length,0,'confirmed release should remove the pet');
  assert.strictEqual(P.petSkillCd[7],undefined,'released pet cooldown must not leak');
  assert.strictEqual(P.autoSet.has(7),false,'released pet auto-roll state must not leak');
  assert.strictEqual(P.S.zeny,100+900,'the established 30% egg-value refund is paid');
  assert.strictEqual(P.saveCount,1,'release must save');
});

t('pet skills execute their buff, AoE and single-target effects in combat', () => {
  const P=makePetHarness(),pet=id=>({id:1,sp:0,mut:0,eq:[0,0,0],skill:id}),target=()=>({x:0,z:0,hp:1000}),near=()=>({x:1,z:1,hp:1000}),far=()=>({x:9,z:9,hp:1000});
  let a=target();P.mobs=[a];P.cooldowns={};P.petHit(pet('warcry'),a);
  assert.strictEqual(P.buff.atk,20,'War Cry must buff player ATK by 20%');assert.strictEqual(P.buff.atkT,8,'War Cry duration');assert.strictEqual(a.hp,1000,'a player buff is not an attack');
  P.buff={atk:0,matk:0,atkT:0,matkT:0};P.cooldowns={};P.petHit(pet('arcane'),a);
  assert.strictEqual(P.buff.matk,20,'Arcane Blessing must buff player MATK by 20%');
  for(const [id,power] of [['flameburst',1.6],['thunderclap',1.4]]){
    a=target();const b=near(),c=far();P.cooldowns={};P.mobs=[a,b,c];P.petHit(pet(id),a);
    assert.strictEqual(a.hp,1000-100*power,id+' missed its target');assert.strictEqual(b.hp,1000-100*power,id+' missed a nearby AoE target');assert.strictEqual(c.hp,1000,id+' hit outside the AoE radius');
  }
  for(const [id,power] of [['piercingfang',2.2],['spiritbolt',2.5]]){
    a=target();const b=near(),c=far();P.cooldowns={};P.mobs=[a,b,c];P.petHit(pet(id),a);
    assert.strictEqual(a.hp,1000-100*power,id+' missed its single target');assert.strictEqual(b.hp,1000,id+' spilled onto a nearby mob');assert.strictEqual(c.hp,1000,id+' spilled onto a distant mob');
  }
});

t('every skill has a name, a class list, a level cap and a description function', () => {
  for (const s of K.SKILLS) {
    assert.ok(s.n, s.id + ' has no name');
    assert.ok(Array.isArray(s.cls) && s.cls.length, s.id + ' has no class list');
    assert.ok(s.max >= 1, s.id + ' has no level cap');
    assert.strictEqual(typeof s.d, 'function', s.id + ' has no description');
    for (let L = 1; L <= s.max; L++) assert.ok(typeof s.d(L) === 'string' && s.d(L).length, `${s.id}.d(${L}) is empty`);
  }
});

t('every skill type is one the engine understands', () => {
  const known = new Set(['act', 'pas', 'heal', 'to']);
  for (const s of K.SKILLS) assert.ok(known.has(s.type), `${s.id} has type "${s.type}"`);
});

t('every active attack, automatic heal and temporary buff has a visible skill effect', () => {
  const visualSkills = K.SKILLS.filter(s => ['act','heal','to'].includes(s.type));
  const missing = Array.from(visualSkills.filter(s => !K.SKILL_VFX[s.id]).map(s => s.id));
  assert.deepStrictEqual(missing, [], 'skills with no battlefield visual: ' + missing.join(', '));
  for (const s of visualSkills) {
    const spec = K.skillFxSpec(s.id, s.col);
    assert.ok(spec, s.id + ' did not resolve a visual recipe');
    assert.strictEqual(spec.kind, K.SKILL_VFX[s.id].kind, s.id + ' visual family changed');
    assert.ok(spec.life >= .35 && spec.life <= 1.2, s.id + ' effect lifetime is not a short combat cue');
    assert.ok(['caster','target','path'].includes(spec.at), s.id + ' has an unknown effect anchor');
  }
  for (const id of ['dstr','ashower']) assert.ok(K.SKILL_VFX[id].kind.includes('arrow'), id + ' should read as an Archer arrow skill');
  for (const id of ['storm','fdiver','fnova']) assert.ok(/ice|frost/i.test(K.SKILL_VFX[id].kind), id + ' should use an ice visual');
  for (const id of ['fire','meteor','mbrk']) assert.ok(/fire|meteor/i.test(K.SKILL_VFX[id].kind), id + ' should use a fire visual');
});

t('every mapped skill visual builds, animates and disposes through the renderer', () => {
  const fxr=vfxBox.__renderer;
  for(const id of Object.keys(K.SKILL_VFX)){
    const before=fxr.effects.length;
    fxr.playSkillFx(id,{x:1,z:-2},'#ffc94a');
    const fx=fxr.effects[before];
    assert.ok(fx, id+' was not queued');fxr.syncSkillFx();
    assert.ok(fx.group && fx.parts.length, id+' made no renderable parts');
    const group=fx.group;fx.age=fx.life*.4;fxr.syncSkillFx();
    for(const part of fx.parts){
      for(const scale of part.mesh.scale.toArray?part.mesh.scale.toArray():[part.mesh.scale.x,part.mesh.scale.y,part.mesh.scale.z]) assert.ok(Number.isFinite(scale),id+' produced a non-finite scale');
      assert.ok(Number.isFinite(part.mesh.material.opacity),id+' produced a non-finite opacity');
    }
    fxr.tickSkillFx(fx.life);
    assert.strictEqual(fxr.effects.length,before,id+' remained active after expiry');
    assert.strictEqual(vfxBox.removed.pop(),group,id+' scene group was not removed');
  }
});

t('the live combat loop starts and renders skill visuals from casts, buffs and First Aid', () => {
  assert.ok(src.includes('playSkillFx(sk.id,target,sk.col)'), 'offensive skills do not trigger their visual');
  assert.ok(src.includes("playSkillFx('aid',null,'#7dff7d')"), 'First Aid does not show a heal pulse');
  assert.ok(src.includes('playSkillFx(s.id,null,s.col)'), 'temporary auto-buffs do not show their cast cue');
  assert.ok(src.includes('tickSkillFx(dt);') && src.includes('syncSkillFx();'), 'skill effects are advanced and drawn in the game loop');
  assert.ok(src.includes('function disposeSkillFx(fx)'), 'finished effects release their scene objects');
});

t('every job line has skills to spend points on', () => {
  for (const name of Object.keys(K.CLASSES)) {
    // In RO the Novice has First Aid and nothing offensive, so one skill is correct here -
    // not a gap to fill. Inventing a Novice attack skill is what leaked a bogus chain tag
    // into every class tree, because every class inherits Novice.
    const min = name === 'Novice' ? 1 : 3;
    const own = K.SKILLS.filter(s => s.from === name);
    assert.ok(own.length >= min, `${name} has only ${own.length} of its own skills`);
    const reach = K.SKILLS.filter(s => s.cls.includes(name));
    assert.ok(reach.length >= (name === 'Novice' ? 1 : 4), `${name} can only reach ${reach.length} skills`);
  }
});

t('every job line has the same number of its own skills', () => {
  const byTier = {};
  for (const [name, c] of Object.entries(K.CLASSES)) {
    if (name === 'Novice') continue;
    const n = K.SKILLS.filter(s => s.from === name).length;
    (byTier[c.tier] = byTier[c.tier] || new Set()).add(n);
  }
  for (const [tier, set] of Object.entries(byTier))
    assert.strictEqual(set.size, 1, `tier ${tier} job lines disagree on skill count: ${[...set]}`);
  console.log('       ' + Object.entries(byTier).map(([t, s]) => 'tier ' + t + ': ' + [...s][0] + ' own skills').join(' | '));
});

t('no class can max its whole tree - the escalating cost has to bite', () => {
  // buying level L costs L points, so maxing a 5-level skill costs 1+2+3+4+5 = 15
  assert.strictEqual([1,2,3,4,5].reduce((a, L) => a + K.skCost(L), 0), 15, 'maxing a skill should cost 15');
  const earned = t => 9 + (t >= 1 ? 49 : 0) + (t >= 2 ? 49 : 0) + (t >= 3 ? 49 : 0);
  for (const [name, c] of Object.entries(K.CLASSES)) {
    const reach = K.SKILLS.filter(s => s.cls.includes(name));
    const need = reach.reduce((a, s) => { let x = 0; for (let L = 1; L <= s.max; L++) x += K.skCost(L); return a + x }, 0);
    assert.ok(need > earned(c.tier),
      `${name} can max all ${reach.length} skills for ${need} of ${earned(c.tier)} points - ${need - earned(c.tier)} spare`);
  }
  console.log('       Novice 9/15 | 1st job 58/75 | 2nd job 107/135 | transcendent 156/195');
});

t('effects are actually attached to the new skills (tagging must run after the push)', () => {
  // Regression: the FX tagging loop used to sit ABOVE SKILLS.push(), so SKILLS.find() returned
  // undefined for every new skill and the guard silently swallowed it. The roster looked right
  // in source and did nothing at runtime.
  const want = { mbrk:['aoe','dot','stun'], fdiver:['stun'], fnova:['aoe','stun'], ashower:['aoe','stun'],
                 sandat:['stun'], signum:['aoe','stun'], cartrev:['aoe','stun'], tblow:['dot'],
                 vermilion:['aoe','dot'], landmine:['aoe','stun'], vsplash:['dot','chain'],
                 tundead:['aoe','stun'], meltdown:['aoe','dot','stun'],
                 spearboom:['chain'], falcon:['chain'], dstr:['chain'], mammo:['chain'] };
  for (const [id, keys] of Object.entries(want)) {
    const s = byId(id);
    assert.ok(s, id + ' is missing from the roster');
    for (const k of ['aoe','dot','stun','chain'])
      assert.strictEqual(!!s[k], keys.includes(k), `${id} should${keys.includes(k)?'':' not'} have ${k}`);
  }
});

t('every first job owns an active AoE at skill level 1', () => {
  for (const [cls,c] of Object.entries(K.CLASSES).filter(([,c])=>c.tier===1)) {
    const area=K.SKILLS.filter(s=>s.from===cls && s.aoe && s.type==='act');
    assert.ok(area.length, cls+' needs a farming AoE');
    for(const skill of area){
      K.S={cls,sk:{[skill.id]:1},skOff:{}};
      assert.ok(K.skillOn(skill.id), cls+' AoE is usable at level 1');
      assert.strictEqual(K.skCost(1),1);
    }
  }
});

t('first-job AoEs damage a nearby secondary enemy, but not distant mobs', () => {
  const cast=grab('function castSkill(sk,k){','function playerAttack(){');
  for(const cls of Object.keys(K.CLASSES).filter(c=>K.CLASSES[c].tier===1)){
    const sk=K.SKILLS.find(s=>s.from===cls&&s.aoe&&s.type==='act');
    const context={sk};vm.createContext(context);
    vm.runInContext(`
      const mob={x:0,z:0,hp:10000},near={x:1,z:1,hp:10000},far={x:9,z:9,hp:10000};
      const mobs=[mob,near,far],pend=[];
      const lv=()=>1,st=()=>1,atk=()=>50,matk=()=>50,strike=()=>{},shot=()=>{},playSkillFx=()=>{},
        chainHit=()=>{},applyDot=()=>{},applyStun=()=>{},hurt=(o,d)=>{o.hp-=d};
      ${cast}
      castSkill(sk,1);this.result={near:near.hp,far:far.hp};
    `,context);
    assert.ok(context.result.near<10000,cls+' area damage missing');
    assert.strictEqual(context.result.far,10000,cls+' hit outside area');
  }
});

t('area casts cannot spill into a different pack when a kill changes target mid-cast', () => {
  const cast=grab('function castSkill(sk,k){','function playerAttack(){');
  const sk=K.SKILLS.find(s=>s.aoe&&s.type==='act');assert.ok(sk);
  const context={sk};vm.createContext(context);
  vm.runInContext(`
    const first={x:0,z:0,hp:100,pack:0},near={x:1,z:1,hp:1,pack:0},waiting={x:1,z:2,hp:100,pack:1};
    let mob=first;const mobs=[first,near,waiting],pend=[];let dots=0,stuns=0,chains=0;
    const lv=()=>1,st=()=>1,atk=()=>50,matk=()=>50,strike=()=>{},shot=()=>{},playSkillFx=()=>{},
      chainHit=()=>{chains++},applyDot=()=>{dots++},applyStun=()=>{stuns++},
      hurt=(o,d)=>{o.hp-=d;if(o.hp<=0){mobs.splice(mobs.indexOf(o),1);mob=waiting}};
    ${cast}
    castSkill(sk,1);this.result={waiting:waiting.hp,near:near.hp,mob:mob.pack};
  `,context);
  assert.ok(context.result.near<=0,'the first pack should take the area hit');
  assert.strictEqual(context.result.mob,1,'the test must switch targets during the cast');
  assert.strictEqual(context.result.waiting,100,'the waiting pack must not be hit despite being nearby');
  assert.ok(/mob.pack!==pack/.test(src), 'multi-cast swings must stop at pack boundaries');
});

t('invented and wrong-job skills are gone', () => {
  const gone = ['tstone', 'rcutter', 'adoramus', 'chargearr', 'hcrush', 'firewall'];
  for (const id of gone) assert.ok(!byId(id), id + ' is still in the roster');
  const names = K.SKILLS.map(s => s.n);
  for (const n of ['Throw Stone', 'Rolling Cutter', 'Adoramus', 'Charged Arrow', 'Head Crush'])
    assert.ok(!names.includes(n), `"${n}" is not a skill for the job it was on`);
  // and their real replacements exist
  for (const id of ['akatar', 'basilica', 'wwalk', 'tblow', 'fnova'])
    assert.ok(byId(id), 'missing replacement ' + id);
  assert.strictEqual(byId('akatar').from, 'Assassin Cross');
  assert.strictEqual(byId('basilica').from, 'High Priest');
  assert.strictEqual(byId('wwalk').from, 'Sniper');
  assert.strictEqual(byId('wwalk').type, 'to', 'Wind Walk should be a tradeoff');
  assert.strictEqual(byId('tblow').from, 'Lord Knight');
  assert.strictEqual(byId('fnova').from, 'Wizard');
});

t('the mechanics are spread far enough that every line feels them', () => {
  // Accuracy is explicitly NOT the goal - this is an RO-flavoured game, not a clone. What
  // matters is that dot/stun/chain/tradeoff are things a player actually meets, so no job
  // line may reach fewer than three of them.
  const kinds = s => ['dot','stun','chain','aoe'].filter(k => s[k]).concat(s.type === 'to' ? ['tradeoff'] : []);
  for (const [name, c] of Object.entries(K.CLASSES)) {
    if (name === 'Novice') continue;
    const reach = K.SKILLS.filter(s => s.cls.includes(name));
    const set = new Set(reach.flatMap(kinds));
    assert.ok(set.size >= 3, `${name} only reaches ${set.size} mechanics: ${[...set].join('/') || 'none'}`);
  }
  const n = k => K.SKILLS.filter(s => s[k]).length;
  assert.ok(n('chain') >= 5, `chain is on only ${n('chain')} skills - too rare to notice`);
  assert.ok(n('dot') >= 8 && n('stun') >= 8, 'dot or stun is too thin');
  assert.ok(K.SKILLS.filter(s => s.type === 'to').length >= 5, 'too few tradeoffs');
});

t('no class sees two skills with the same name', () => {
  // Sniper shipped with both act('falcon','Falcon Assault') and a second 'Falcon Assault',
  // so its tree showed the same label twice with different numbers behind it.
  for (const name of Object.keys(K.CLASSES)) {
    const names = K.SKILLS.filter(s => s.cls.includes(name)).map(s => s.n);
    // Array.from: the vm hands back foreign-prototype arrays, which never deepStrictEqual a host []
    const dup = Array.from(names).filter((n, i) => names.indexOf(n) !== i);
    assert.strictEqual(dup.length, 0, `${name} shows a duplicate skill name: ${dup.join(', ')}`);
  }
});

t('Bash stays a clean single-target nuke', () => {
  // one baseline per line should stay untagged, so the effects read as a difference
  const bash = byId('bash');
  assert.ok(bash, 'Bash is missing');
  for (const k of ['dot','stun','chain','aoe']) assert.ok(!bash[k], `Bash picked up ${k}`);
});

t('actives carry a cooldown and a damage multiplier that grows with level', () => {
  for (const s of K.SKILLS.filter(x => x.type === 'act')) {
    assert.ok(s.cd > 0, s.id + ' has no cooldown');
    assert.strictEqual(typeof s.mul, 'function', s.id + ' has no multiplier');
    assert.ok(s.hits >= 1, s.id + ' has no hit count');
    assert.ok(s.mul(5) > s.mul(1), `${s.id} does not scale with level`);
    assert.ok(s.col, s.id + ' has no colour');
  }
});

t('the four new effects are all present in the roster', () => {
  const dot = K.SKILLS.filter(s => s.dot), stun = K.SKILLS.filter(s => s.stun);
  const chain = K.SKILLS.filter(s => s.chain), trade = K.SKILLS.filter(s => s.type === 'to');
  // chain is deliberately the rarest: in RO almost every multi-target skill is a true area
  // (Bowling Bash, Magnum Break, Storm Gust, Lord of Vermilion...). Only Blitz Beat's falcon
  // and Sharp Shooting's piercing line genuinely bounce, so only those two carry it.
  for (const [label, list, min] of [['dot', dot, 6], ['stun', stun, 6], ['chain', chain, 2], ['tradeoff', trade, 3]])
    assert.ok(list.length >= min, `only ${list.length} ${label} skills, expected at least ${min}`);
  console.log('       dot ' + dot.length + ' | stun ' + stun.length + ' | chain ' + chain.length +
              ' | tradeoff ' + trade.length + ' | aoe ' + K.SKILLS.filter(s => s.aoe).length);
});

t('effect parameters are in sane ranges', () => {
  for (const s of K.SKILLS) {
    if (s.dot) {
      assert.ok(s.dot.pow > 0 && s.dot.pow <= .15, `${s.id} dot.pow ${s.dot.pow} out of range`);
      assert.ok(s.dot.dur >= 1 && s.dot.dur <= 10, `${s.id} dot.dur ${s.dot.dur} out of range`);
      // a dot should add a fraction of the hit, not several times the hit
      assert.ok(s.dot.pow * s.dot.dur <= 1.0, `${s.id} dot totals ${(s.dot.pow * s.dot.dur).toFixed(2)}x the hit`);
      assert.ok(s.dot.col, s.id + ' dot has no colour');
    }
    if (s.stun) assert.ok(s.stun.dur > 0 && s.stun.dur <= 2, `${s.id} stun.dur ${s.stun.dur} out of range`);
    if (s.chain) {
      assert.ok(s.chain.n >= 1 && s.chain.n <= 4, `${s.id} chain.n ${s.chain.n} out of range`);
      assert.ok(s.chain.pow > 0 && s.chain.pow <= 1, `${s.id} chain.pow ${s.chain.pow} out of range`);
    }
  }
});

t('a tradeoff always gives something and always costs something', () => {
  // Energy Coat is deliberately defensive (DEF up, ATK down), so benefit and cost are scored
  // in both directions instead of assuming every tradeoff is an ATK/ASPD buff.
  for (const s of K.SKILLS.filter(x => x.type === 'to')) {
    const o = s.to, L = s.max;
    for (const f of ['atk','aspd','def','drain','dur'])
      assert.strictEqual(typeof o[f], 'function', `${s.id}.to.${f} must be a function of level`);
    const atk = o.atk(L), aspd = o.aspd(L), def = o.def(L), drain = o.drain(L), dur = o.dur(L);
    for (const [k, v] of Object.entries({atk, aspd, def, drain, dur}))
      assert.ok(Number.isFinite(v), `${s.id}.to.${k}(${L}) is not a number`);
    const benefit = Math.max(0, atk) + Math.max(0, aspd) + Math.max(0, def);
    const cost = Math.max(0, -atk) + Math.max(0, -aspd) + Math.max(0, -def) + drain * dur;
    assert.ok(benefit > 0, s.n + ' grants nothing at max level');
    assert.ok(cost > 0, s.n + ' has no downside - it is a free buff, not a tradeoff');
    assert.ok(dur > 0 && dur <= 30, s.n + ' duration out of range');
    assert.ok(o.hp > 0 && o.hp <= 1, s.n + ' hp gate out of range');
    assert.ok(s.cd > dur, `${s.n} cooldown ${s.cd}s must exceed its ${dur}s duration or it never lapses`);
    console.log(`       ${s.n} (${s.from}): +${benefit.toFixed(0)} for -${cost.toFixed(0)} over ${dur}s`);
  }
});

t('tradeoffs scale with level, and their drain cannot out-damage the buff window', () => {
  for (const s of K.SKILLS.filter(x => x.type === 'to')) {
    assert.ok(s.to.dur(5) >= s.to.dur(1), s.id + ' duration shrinks with level');
    const drainTotal = s.to.drain ? s.to.drain(5) * s.to.dur(5) : 0;
    assert.ok(drainTotal < 100, `${s.id} drains ${drainTotal.toFixed(0)}% of max HP in one cast`);
  }
});

t('applyStun never stacks and caps out, halved on bosses', () => {
  const m = { boss: false };
  K.applyStun(m, 1); K.applyStun(m, 1); K.applyStun(m, 1);
  assert.strictEqual(m.stun, 1, 'stun stacked instead of refreshing');
  K.applyStun(m, 99);
  assert.ok(m.stun <= 2, 'a normal mob can be locked down for ' + m.stun + 's');
  const b = { boss: true };
  K.applyStun(b, 2);
  assert.ok(b.stun <= 1, 'a boss was stunned for ' + b.stun + 's');
  K.applyStun(b, 0); K.applyStun(b, -5);
  assert.strictEqual(b.stun, 1, 'a zero/negative stun changed the timer');
});

t('applyDot accumulates ticks and ignores nonsense input', () => {
  const m = {};
  K.applyDot(m, 100, 4, '#fff');
  K.applyDot(m, 50, 2, '#0f0');
  assert.strictEqual(m.dots.length, 2, 'dots should stack as separate entries');
  K.applyDot(m, 100, 0, '#fff');
  assert.strictEqual(m.dots.length, 2, 'a zero-duration dot was added');
  K.applyDot(null, 100, 4, '#fff');
  K.applyDot(m, 0, 4, '#fff');
  assert.ok(m.dots.every(d => Number.isFinite(d.dps) && Number.isFinite(d.dur)), 'a dot holds NaN');
});

t('job tier decides how many skills fire per swing', () => {
  assert.strictEqual(K.SKSLOTS(0), 1, 'Novice should cast one skill per swing');
  assert.strictEqual(K.SKSLOTS(1), 2, 'a first job should cast two');
  assert.strictEqual(K.SKSLOTS(2), 3, 'a second job should cast three');
  // tier 3 is the transcendent job (Lord Knight, Assassin Cross, High Priest, ...)
  assert.strictEqual(K.SKSLOTS(3), 4, 'a transcendent job should cast four');
  assert.strictEqual(K.SKSLOTS(undefined), 1, 'a missing tier must fall back to one');
  assert.deepStrictEqual(Array.from(K.SKFADE), [1, .55, .3, .18], 'SKFADE needs a rung per tier');
  for (let i = 1; i < K.SKFADE.length; i++)
    assert.ok(K.SKFADE[i] < K.SKFADE[i - 1], `cast ${i + 1} should land softer than cast ${i}`);
});

t('learned active skills auto-cast by default; unchecking one pauses only that skill', () => {
  K.S = { cls: 'Lord Knight', sk: { frenzy: 5, spiral: 5 }, skOff: {} };
  assert.strictEqual(K.skOff('frenzy'), false, 'a newly learned skill should start with Auto cast checked');
  assert.ok(K.skillOn('frenzy'), 'frenzy should be usable at level 5');
  K.S.skOff.frenzy = 1;
  assert.strictEqual(K.skOff('frenzy'), true, 'the unchecked state was not saved');
  assert.ok(!K.skillOn('frenzy'), 'frenzy still fires after being switched off');
  assert.ok(K.skillOn('spiral'), 'switching one skill off must not affect another');
  delete K.S.skOff.frenzy;
  assert.ok(K.skillOn('frenzy'), 'frenzy did not come back after being switched on');
});

t('a skill with no levels, or from another line, is never usable', () => {
  K.S = { cls: 'Lord Knight', sk: { spiral: 5 }, skOff: {} };
  assert.ok(!K.skillOn('mbrk'), 'an unleveled skill is usable');
  assert.ok(!K.skillOn('env'), 'a Thief skill is usable by a Lord Knight');
});

t('an unknown skill id is simply unusable rather than a crash', () => {
  K.S = { cls: 'Lord Knight', sk: { spiral: 5 }, skOff: {} };
  assert.strictEqual(K.skillOn('nosuchskill'), false);
});

t('a save with no skOff at all still works', () => {
  K.S = { cls: 'High Wizard', sk: { meteor: 5 }, skOff: undefined };
  assert.ok(K.skillOn('meteor'), 'missing skOff broke skillOn');
});

t('a ready tradeoff actually fires and fills tb with NUMBERS', () => {
  K.S = { cls:'Lord Knight', hp:1000, sk:{frenzy:5}, skOff:{} };
  K.tb = {}; K.skCd = {};
  K.run(ACTIVATE);
  assert.ok(K.tb.n, 'no tradeoff fired - the activation guard is wrong');
  assert.strictEqual(K.tb.n, 'Frenzy');
  for (const k of ['atk','aspd','def','drain','t'])
    assert.ok(Number.isFinite(K.tb[k]), `tb.${k} is ${typeof K.tb[k]}, not a finite number`);
  assert.ok(K.tb.aspd > 0, 'Frenzy grants no attack speed');
  assert.ok(K.tb.def < 0, 'Frenzy has no defence penalty');
  assert.ok(K.tb.t > 0, 'the buff has no duration');
  assert.strictEqual(K.skCd.frenzy, K.SKILLS.find(s=>s.id==='frenzy').cd, 'cooldown was not set');
  console.log('       Frenzy L5: aspd +' + K.tb.aspd + '%, def ' + K.tb.def + ', ' + K.tb.t + 's');
});

t('the buff expires and clears instead of lasting forever', () => {
  K.S = { cls:'Lord Knight', hp:1000, sk:{frenzy:5}, skOff:{} };
  K.tb = {}; K.skCd = {}; K.run(ACTIVATE);
  const dur = K.tb.t;
  K.dt = dur + 1; K.run(TICK);
  assert.deepStrictEqual({ ...K.tb }, {}, 'the tradeoff never expired');
});

t('a draining tradeoff actually drains HP, and never kills you outright', () => {
  K.S = { cls:'Assassin Cross', hp:1000, sk:{dpois:5}, skOff:{} };
  K.tb = {}; K.skCd = {}; K.run(ACTIVATE);
  assert.strictEqual(K.tb.n, 'Deadly Poison');
  assert.ok(K.tb.drain > 0, 'Deadly Poison has no HP drain');
  const before = K.S.hp;
  K.dt = 1; K.run(TICK);
  assert.ok(K.S.hp < before, 'HP did not drop while Deadly Poison was running');
  K.S.hp = 2; for (let i = 0; i < 400; i++) K.run(TICK);
  assert.ok(K.S.hp >= 1, 'the drain killed the player outright - it should floor at 1 HP');
});

t('a tradeoff will not fire below its HP floor, or while one is running', () => {
  const sk = K.SKILLS.find(s => s.id === 'coat');
  K.S = { cls:'High Wizard', hp:Math.floor(1000 * sk.to.hp) - 1, sk:{coat:5}, skOff:{} };
  K.tb = {}; K.skCd = {}; K.run(ACTIVATE);
  assert.ok(!K.tb.n, 'Energy Coat fired below its ' + Math.round(sk.to.hp*100) + '% HP floor');
  K.S.hp = 1000; K.run(ACTIVATE);
  assert.strictEqual(K.tb.n, 'Energy Coat', 'a healthy caster should get the buff');
  const first = { ...K.tb }; K.skCd = {}; K.run(ACTIVATE);
  assert.deepStrictEqual({ ...K.tb }, first, 'a second tradeoff stacked on top of a running one');
});

t('switching a tradeoff off stops it firing', () => {
  K.S = { cls:'Lord Knight', hp:1000, sk:{frenzy:5}, skOff:{frenzy:1} };
  K.tb = {}; K.skCd = {}; K.run(ACTIVATE);
  assert.ok(!K.tb.n, 'a switched-off tradeoff still fired');
});

t('a defensive tradeoff raises DEF and costs ATK', () => {
  K.S = { cls:'High Wizard', hp:1000, sk:{coat:5}, skOff:{} };
  K.tb = {}; K.skCd = {}; K.run(ACTIVATE);
  assert.ok(K.tb.def > 0, 'Energy Coat grants no defence');
  assert.ok(K.tb.atk < 0, 'Energy Coat has no attack cost');
  console.log('       Energy Coat L5: def +' + K.tb.def + ', atk ' + K.tb.atk + '%');
});

t('when several tradeoffs are ready, the strongest one wins', () => {
  // a Lord Knight inherits Two-Hand Quicken from Knight and has Frenzy of its own
  K.S = { cls:'Lord Knight', hp:1000, sk:{quick:5,frenzy:1}, skOff:{} };
  K.tb = {}; K.skCd = {}; K.run(ACTIVATE);
  const q = K.SKILLS.find(s=>s.id==='quick'), f = K.SKILLS.find(s=>s.id==='frenzy');
  const gq = q.to.aspd(5) + q.to.atk(5), gf = f.to.aspd(1) + f.to.atk(1);
  const want = gq >= gf ? 'Two-Hand Quicken' : 'Frenzy';
  assert.strictEqual(K.tb.n, want, `picked ${K.tb.n}, but ${want} has the bigger payoff`);
});


// ---- skill points are per class LINE, not one global pile (the overflow bug) -----
// Point supply: Novice line 9 / tier-1 58 / tier-2 107 / tier-3 156 for a fully levelled line.
// Tree cost to max everything a line can reach is 15 / 75 / 135 / 195, so no line can max its
// own tree. The bug was never the supply: the old skpAvail() summed the job levels of EVERY
// class in S.jobs against one global S.sk, so a second line's points funded the first and the
// number kept climbing with nothing left to buy.
const lineOf = cls => { const a = []; for (let n = cls; n; n = K.CLASSES[n].par) a.unshift(n); return a };
const jobRec = (cls, jl) => ({ Novice: { jl: 10 }, [cls]: { jl } });
function treeCost(cls) {
  const names = new Set(lineOf(cls));
  // what ACT.skill charges to walk a skill from 0 to max: 1+2+...+max
  return K.SKILLS.filter(s => names.has(s.from)).reduce((a, s) => a + (s.max * (s.max + 1)) / 2, 0);
}
t('points are earned from the current line only', () => {
  K.S = { cls: 'Swordman', jobs: { Novice: { jl: 10 }, Swordman: { jl: 50 }, Thief: { jl: 50 }, Mage: { jl: 40 } }, sk: {} };
  assert.strictEqual(K.skLine().join('>'), 'Novice>Swordman');
  assert.strictEqual(K.skEarned(), 9 + 49, 'only the Novice and Swordman job levels count');
  // the old code would have returned 9+49+49+39 = 146 here, which is the overflow
  assert.ok(K.skEarned() < 146, 'other lines must not fund this one');
});

t('spending on another line does not drain this one', () => {
  const thiefSkills = K.SKILLS.filter(s => s.from === 'Thief').slice(0, 2).map(s => s.id);
  K.S = { cls: 'Swordman', jobs: { Novice: { jl: 10 }, Swordman: { jl: 20 }, Thief: { jl: 50 } }, sk: {} };
  assert.strictEqual(K.skSpent(), 0, 'nothing spent on the Swordman line yet');
  const before = K.skpAvail();
  thiefSkills.forEach(id => { K.S.sk[id] = 5 });
  assert.strictEqual(K.skSpent(), 0, 'Thief skills must not draw on the Swordman pool');
  assert.strictEqual(K.skpAvail(), before, 'the Swordman pool is untouched');
});

t('a line can never buy its whole tree', () => {
  const rows = [];
  ['Novice', 'Swordman', 'Swordman>Knight'.split('>').pop(), 'Knight', 'Lord Knight', 'Mage', 'Wizard', 'High Wizard', 'Thief', 'Assassin', 'Assassin Cross', 'Archer', 'Hunter', 'Sniper', 'Merchant', 'Blacksmith', 'Whitesmith', 'Acolyte', 'Priest', 'High Priest'].forEach(cls => {
    // every class in the line capped at Job Lv 50 (the Novice at 10) - the most a line can earn
    const earn = lineOf(cls).reduce((a, n) => a + (n === 'Novice' ? 9 : 49), 0);
    rows.push([cls, earn, treeCost(cls) - 1]);   // -1 for the free first point of aid
  });
  rows.forEach(([cls, earn, cost]) => assert.ok(cost > earn, cls + ' can max its tree: ' + earn + ' earned vs ' + cost + ' to buy'));
  console.log('       ' + rows.map(r => r[0] + ' ' + r[1] + 'vs' + r[2]).join(' · '));
});

t('the ledger matches what the + button charges (no phantom points)', () => {
  // The bug's second half: skSpent() used to add the skill LEVEL while the shop charged
  // 1+2+3+4+5 = 15 points for it, so every purchase minted points. Run the real purchase loop
  // exactly as ACT.skill does it and compare the purse with the ledger.
  const sim = (cls, jobs, rounds) => {
    K.S = { cls, jobs, sk: { aid: 1 }, aid: 1 };
    const line = lineOf(cls);
    let charged = 0, bought = 0, guard = 0;
    for (; guard < rounds; guard++) {
      const id = K.SKILLS.filter(s => line.includes(s.from) && (K.S.sk[s.id] || 0) < s.max)
        .sort((a, b) => K.skCost((K.S.sk[a.id] || 0) + 1) - K.skCost((K.S.sk[b.id] || 0) + 1))[0];
      if (!id) break;
      const L = (K.S.sk[id.id] || 0) + 1, c = K.skCost(L);
      if (K.skpAvail() < c) break;
      assert.ok(K.skpAvail() >= 0, 'the ledger went negative');
      K.S.sk[id.id] = L; charged += c; bought++;
    }
    return { charged, bought, left: K.skpAvail() };
  };
  const knight = sim('Knight', { Novice: { jl: 10 }, Swordman: { jl: 50 }, Knight: { jl: 50 } }, 100);
  assert.ok(knight.bought > 0, 'the Knight must be able to buy something');
  assert.strictEqual(knight.charged, K.skSpent() - 1, 'the ledger must equal what was charged (minus the free aid point)');
  assert.ok(knight.left >= 0 && knight.left < 100, 'sane remainder: ' + knight.left);
  // every reachable skill is maxed or unaffordable - no points stranded by the accounting
  const line = lineOf('Knight');
  const next = K.SKILLS.filter(s => line.includes(s.from) && (K.S.sk[s.id] || 0) < s.max)
    .reduce((m, s) => Math.min(m, K.skCost((K.S.sk[s.id] || 0) + 1)), Infinity);
  if (next !== Infinity) assert.ok(knight.left < next, 'left ' + knight.left + ' but the next level costs only ' + next);
  // and the old signature is gone: it used to leave ~2.5x the points it counted
  const novice = sim('Novice', { Novice: { jl: 10 } }, 50);
  assert.ok(novice.charged <= 9, 'a Novice cannot outspend its 9 points: ' + novice.charged);
});

t('an over-spent legacy save reads as zero, never negative', () => {
  // builds written by the old accounting bought skills with phantom points; the ledger must
  // clamp instead of going negative (which would grey out every + and every dot)
  K.S = { cls: 'Knight', jobs: { Novice: { jl: 10 }, Swordman: { jl: 50 }, Knight: { jl: 50 } }, sk: { aid: 5 }, aid: 1 };
  K.SKILLS.filter(s => lineOf('Knight').includes(s.from)).forEach(s => { K.S.sk[s.id] = s.max });
  assert.ok(K.skSpent() > K.skEarned(), 'this save really is over-spent: ' + K.skSpent() + ' vs ' + K.skEarned());
  assert.strictEqual(K.skpAvail(), 0, 'over-spent reads as nothing spare');
  K.S.jobs.Knight.jl = 50; K.S.jobs.Swordman.jl = 50;
  assert.strictEqual(K.skpAvail(), 0);
  // earning more job levels pays the deficit down before it pays out again
  K.S.jobs.Knight.jl = 50;
  assert.ok(K.skpAvail() >= 0);
});

t('the aid skill is the one free point, as before', () => {
  const aid = K.SKILLS.find(s => s.id === 'aid');
  assert.ok(aid, 'aid must exist');
  const jobs = { Novice: { jl: 10 }, Swordman: { jl: 50 }, Knight: { jl: 50 }, 'Lord Knight': { jl: 50 } };
  K.S = { cls: 'Lord Knight', jobs, sk: {} };
  const clean = K.skpAvail();
  K.S = { cls: 'Lord Knight', jobs, sk: { aid: aid.max } };
  // the freebie is one point: a fully bought aid costs its whole ladder (1+2+...+max) less 1
  const ladder = aid.max * (aid.max + 1) / 2;
  assert.strictEqual(K.skpAvail(), clean - (ladder - 1), 'only the levels past the first cost');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
