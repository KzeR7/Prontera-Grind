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
const ledger = grab('const skLine=()=>lineOf(S.cls);', 'const REF_ZENY_MUL=3,refCost=it=>');
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
const maxHp = () => 1000, earnZeny = () => {}, log = () => {}, addFloat = () => {}, skillNameFloat = () => {}, playSkillFx = () => {}, pl = {x:0,z:0};
this.__k = { SKILLS, CLASSES, SKSLOTS, SKFADE, SKILL_VFX, skillFxSpec, skCost, applyDot, applyStun, skillOn, skOff, down, skLine, skEarned, skSpent, skpAvail, autoAllocateSkills, skTree, skEarnedMax,
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
// Sprite-layer surface: the v79 skill effects draw procedurally rendered sheets on a canvas
// and play them as animated billboard/ground quads, so the stand-ins grow a plane with a
// writable UV attribute, a CanvasTexture, and a fake 2D context every draw call can no-op.
class FakePlaneGeometry extends FakeGeometry {
  constructor(...args){super(...args);this.attributes={uv:{xy:[],setXY(i,x,y){this.xy[i]=[x,y]},needsUpdate:false}}}
}
class FakeCanvasTexture { constructor(image){this.image=image;this.generateMipmaps=true;this.minFilter=0;this.magFilter=0} dispose(){this.disposed=true} }
function fakeCanvas(){
  const grad={addColorStop(){}};
  const ctx={canvas:null,globalAlpha:1,fillStyle:'',strokeStyle:'',lineWidth:1,lineCap:'',lineJoin:'',
    save(){},restore(){},translate(){},rotate(){},scale(){},beginPath(){},closePath(){},moveTo(){},lineTo(){},
    quadraticCurveTo(){},bezierCurveTo(){},arc(){},ellipse(){},rect(){},fill(){},stroke(){},clearRect(){},fillRect(){},
    setLineDash(){},createRadialGradient:()=>grad,createLinearGradient:()=>grad};
  const cv={width:0,height:0,style:{},getContext:()=>ctx};ctx.canvas=cv;return cv;
}
const fakeThree={RingGeometry:FakeGeometry,TorusGeometry:FakeGeometry,IcosahedronGeometry:FakeGeometry,ConeGeometry:FakeGeometry,
  BoxGeometry:FakeGeometry,CircleGeometry:FakeGeometry,PlaneGeometry:FakePlaneGeometry,MeshBasicMaterial:FakeMaterial,LineBasicMaterial:FakeMaterial,
  CanvasTexture:FakeCanvasTexture,LinearFilter:1006,NormalBlending:1,
  Mesh:FakeMesh,Line:FakeLine,Group:FakeObject,BufferGeometry:FakeBufferGeometry,Vector3:FakeVec3,DoubleSide:2,AdditiveBlending:3};
const vfxBox={THREE:fakeThree,removed:[],scene:{add(){},remove(o){vfxBox.removed.push(o)}},cam:{quaternion:{}},pl:{x:0,z:0},cl:(v,a,b)=>Math.max(a,Math.min(b,v)),
  document:{createElement:t=>t==='canvas'?fakeCanvas():{}},
  skillFx:[],SKILL_VFX:JSON.parse(JSON.stringify(K.SKILL_VFX))};
vm.createContext(vfxBox);
vm.runInContext(grab('function skillFxSpec(id,color)', '// ---------- world:')+'\n'+grab('const SKILL_FX_GEOMETRY=', 'let drag=null;const dom=R.domElement;')+
  '\nthis.__renderer={playSkillFx,tickSkillFx,syncSkillFx,get effects(){return skillFx},get sprRecipes(){return SKILL_FX_SPR},get sheets(){return SKILL_FX_SHEETS}};',vfxBox);

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
// v97 replaces exclusive tradeoffs; coexistence/expiry are exercised by skill_redesign_sim.js.
const PET_SKILL_SRC = pick(/const PET_SKILLS=\[[\s\S]*?\n\];/, 'eight pet gacha skills');
const PET_DATA_SRC = pick(/const PETS=\[[\s\S]*?\];/, 'Divine Pride pet sprite data');
const PET_SKILL_COST_SRC = pick(/petSkillCost=p=>[^,;]+/, 'pet skill gacha cost');
const PET_TRAINING_SRC = pick(/const EGG=3000,GW=\[[^\]]*\],PT=\[[^\]]*\],PTG=\[[^\]]*\],GREAT=[^;]+;/, 'pet training odds');
const PET_UPGRADE_DATA = pick(/const PEQ=\[[\s\S]*?\];/, 'Claw/Collar/Charm names');
const PET_UPGRADE_COST_SRC = pick(/peqCost=t=>[^,;]+/, 'pet upgrade cost');
const PET_UPGRADE_OF_SRC = pick(/peqCostOf=\(p,t\)=>[^,;]+/, 'rarity-aware pet upgrade cost (v90)');
const PET_UPGRADE_ACTION = block('peq:v=>');
const PET_RELEASE_ACTION = block('prel:id=>');
const PET_SKILL_GAP = pick(/const PETGAP=\d+/, 'the per-pet skill gap');
const PET_SKILL_ROLL = pick(/const PET_SKILL_WEIGHTS=\[[^\n]*/, 'both-slot pet skill gacha');
const pickWMatch = src.match(/const pickW=w=>\{[\s\S]*?\},gp=/);
if (!pickWMatch) throw new Error('cannot extract weighted gacha picker');
const PICKW_CODE = pickWMatch[0].slice(0, -',gp='.length) + ';';
const PET_HIT_SRC = grab('const petSkills=p=>', 'const rollingSet=new Set');
const PET_GACHA_ACTION = block('pskill:id=>');
const STRIKE_SRC = 'const fieldDamage=()=>1,applyLeech=()=>0,cardMasteryStat=()=>0;\n' + grab('function strike(mult,col,magic=false,skill=false){', '// Higher job tiers');
function makePetHarness(){
  const box={};vm.createContext(box);
  vm.runInContext(`
    ${PET_DATA_SRC}
    ${PET_SKILL_SRC}
    const MUT=[1,2,4,6,8,18,38],MC=[0];
    let petBuff={atk:0,matk:0,hp:0,leech:0,def:0,atkT:0,matkT:0,hpT:0,leechT:0,defT:0},petBuffSrc={},petSkillCd={},petNote={},mobs=[];
    let t=0,S={hp:500};
    ${require('./helpers/progression')(src,'leech')}
    const petDmg=()=>100,pl={x:0,z:0},rnd=(a,b)=>(a+b)/2,numTxt=String,maxHp=()=>1000;
    const logs=[],log=(...x)=>logs.push(x),earnZeny=()=>{},addFloat=()=>{},playSkillFx=()=>{},hurt=(o,d)=>{o.hp-=d};
    ${PICKW_CODE}
    ${PET_SKILL_GAP}
    ${PET_SKILL_ROLL}
    ${PET_HIT_SRC}
    const zeroBuff=()=>({atk:0,matk:0,hp:0,leech:0,def:0,atkT:0,matkT:0,hpT:0,leechT:0,defT:0});
    this.__pet={PET_SKILLS,PETGAP,petHit,logs,get buff(){return petBuff},set buff(v){petBuff=v},zeroBuff,
      get notes(){return petNote},set notes(v){petNote=v},
      get cooldowns(){return petSkillCd},set cooldowns(v){petSkillCd=v},get mobs(){return mobs},set mobs(v){mobs=v},
      // A deterministic stream is enough to exercise weighted draws without assuming equal odds.
      rollAll(){let seed=20261005;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
        return Array.from({length:200},()=>Array.from(rollPetSkills()))}};
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
  assert.strictEqual(byId('amp').training.matk,2.5,'Meteor Storm retains learned magic training');
  assert.strictEqual(byId('mystic').key,'damage','Mystical Amplification boosts spell damage');
  assert.ok(src.includes('amount/sk.hits'), 'every hit receives a share of the declared total');
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
    let mob={x:0,z:0,hp:10000,size:.6,spriteScale:1},shake=0,S={dmg:0};
    const atk=()=>100,matk=()=>200,missCh=()=>0,crit=()=>0,st=()=>0,critD=()=>2,rnd=(a,b)=>a,addFloat=()=>{},damageFloat=()=>{},
      showDamage=(o,x,y,z,a,c,sk)=>damageFloat(x,y,z,a,c,false,sk),mobDamageY=()=>1.9;
    ${STRIKE_SRC}
    const hp=mob.hp;strike(1,'#fff',false);const physical=hp-mob.hp;mob.hp=hp;strike(1,'#fff',true);this.damage={physical,magical:hp-mob.hp};
  `,strikeBox);
  assert.strictEqual(strikeBox.damage.magical,strikeBox.damage.physical*2,'the real strike() ignored its magic flag');
});

t('the gacha contains four buffs, two AoE attacks, two single-target attacks and four utility skills, and rolls two at a time', () => {
  const P=makePetHarness(),skills=Array.from(P.PET_SKILLS);
  assert.strictEqual(skills.length,12,'the pet skill pool must contain exactly twelve skills');
  const buffs=skills.filter(s=>s.kind==='buff');
  assert.strictEqual(buffs.length,4,'need four player buffs');
  assert.deepStrictEqual(buffs.map(s=>s.stat).sort(),['atk','hp','leech','matk'],'ATK, MATK, life leech and max HP');
  assert.ok(buffs.every(s=>s.duration===30&&s.cd===60),'every player buff lasts 30s on a 60s cooldown');
  assert.ok(buffs.every(s=>/never stacks/i.test(s.desc)),'and every one says it does not stack');
  assert.strictEqual(skills.filter(s=>s.kind==='aoe').length,2,'need two AoE attacks');
  assert.strictEqual(skills.filter(s=>s.kind==='single').length,2,'need two single-target attacks');
  assert.strictEqual(skills.filter(s=>s.kind==='utility').length,4,'need four low-impact utility skills');
  assert.ok(skills.filter(s=>s.kind==='utility').every(s=>/no combat damage/i.test(s.desc)),'utility skills must not be hidden DPS');
  assert.ok(skills.every(s=>s.cd>0&&s.desc&&K.SKILL_VFX[s.vfx]),'every gacha skill needs cooldown, description and visible effect');
  assert.strictEqual(P.PETGAP,7,'a pet may use one skill every seven seconds');
  const rolled=P.rollAll();
  assert.strictEqual(rolled.length,200,'deterministic weighted rolls');
  rolled.forEach(pair=>{assert.strictEqual(pair.length,2,'one roll fills BOTH slots');assert.notStrictEqual(pair[0],pair[1],'a pet can never hold the same skill twice');});
  assert.strictEqual(new Set(rolled.flat()).size,12,'weighted rolls must reach every one of the twelve skills');
});

t('the real pet skill gacha action charges Zeny, saves the roll and respects the balance', () => {
  const action=PET_GACHA_ACTION.slice('pskill:'.length),box={};vm.createContext(box);
  vm.runInContext(`
    ${PET_DATA_SRC}
    ${PET_SKILL_SRC}
    ${PICKW_CODE}
    ${PET_SKILL_ROLL}
    // the real pet-combat helpers, so the action's clearPetCd() runs as shipped
    let petBuff={atk:0,matk:0,hp:0,leech:0,atkT:0,matkT:0,hpT:0,leechT:0},petBuffSrc={},petNote={},mobs=[],pl={x:0,z:0};
    const numTxt=String,maxHp=()=>100,earnZeny=()=>{},hurt=()=>{},addFloat=()=>{},playSkillFx=()=>{};
    ${PET_HIT_SRC}
    const ${PET_SKILL_COST_SRC};
    let S={zeny:5000,pets:[{id:7,sp:0,skills:[]}]},petSkillCd={7:4,'7|warcry':9},logRows=[],uiCount=0,saveCount=0;
    const gp=id=>S.pets.find(p=>String(p.id)===String(id)),log=(...x)=>logRows.push(x),ui=()=>uiCount++,save=()=>saveCount++;
    const pskillAction=${action};
    this.__g={S,logRows,get uiCount(){return uiCount},get saveCount(){return saveCount},get petSkillCd(){return petSkillCd},run:id=>pskillAction(id)};
  `,box);
  vm.runInContext('Math.random=()=>.01;this.__g.run(7);',box);
  assert.strictEqual(box.__g.S.zeny,3000,'gacha cost should be charged once');
  assert.deepStrictEqual(Array.from(box.__g.S.pets[0].skills),['warcry','arcane'],'one gacha must fill BOTH skill slots');
  assert.strictEqual(Object.keys(box.__g.petSkillCd).length,0,'rerolled pets begin off cooldown, gate and per-skill timers alike');
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
    const PETS=[{n:'Poring',r:0}];   // Common, so the Legendary x2 does not apply here
    const ${PET_UPGRADE_OF_SRC};
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
    ${PET_SKILL_SRC}
    let petBuff={atk:0,matk:0,hp:0,leech:0,atkT:0,matkT:0,hpT:0,leechT:0},petBuffSrc={},petNote={},mobs=[],pl={x:0,z:0};
    const numTxt=String,maxHp=()=>100,hurt=()=>{},addFloat=()=>{},playSkillFx=()=>{},log=()=>{};
    ${PET_HIT_SRC}
    const EGG=3000;let S={zeny:100,pets:[{id:7,sp:0}]},petSkillCd={7:8,'7|warcry':3},autoSet=new Set([7]),pending=null,saveCount=0,uiCount=0;
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
  assert.strictEqual(P.petSkillCd['7|warcry'],undefined,'nor may its per-skill cooldowns linger');
  assert.strictEqual(P.autoSet.has(7),false,'released pet auto-roll state must not leak');
  assert.strictEqual(P.S.zeny,100+900,'the established 30% egg-value refund is paid');
  assert.strictEqual(P.saveCount,1,'release must save');
});

t('pet skills execute their buff, AoE and single-target effects in combat', () => {
  const P=makePetHarness(),pet=id=>({id:1,sp:0,mut:0,eq:[0,0,0],skills:[id]}),target=()=>({x:0,z:0,hp:1000}),near=()=>({x:1,z:1,hp:1000}),far=()=>({x:9,z:9,hp:1000});
  let a=target();P.mobs=[a];P.cooldowns={};P.buff=P.zeroBuff();P.petHit(pet('warcry'),a);
  assert.strictEqual(P.buff.atk,15,'War Cry must buff player ATK by 15%');
  assert.strictEqual(P.buff.atkT,30,'War Cry lasts 30s now');
  assert.strictEqual(P.cooldowns['1|warcry'],60,'on a 60s cooldown');
  assert.strictEqual(P.cooldowns[1],7,'and the pet is held for the 7s skill gap');
  assert.strictEqual(a.hp,1000,'a player buff is not an attack');
  // the exclusivity rule: a MATK buff cannot join an ATK buff, and the reason is said out loud
  P.cooldowns={};P.petHit(pet('arcane'),a);
  assert.strictEqual(P.buff.matk,0,'MATK cannot run next to an active ATK buff');
  assert.ok(P.logs.some(r=>String(r[0]).includes('cannot run next to')),'and the pet says why the buff was held');
  // and it may not stack: the same buff from another pet is ignored until it lapses
  // (the "why" line is throttled to one per pet per 12s so a held buff cannot spam the log)
  P.cooldowns={};P.notes={};
  P.petHit(pet('warcry'),a);
  assert.ok(P.logs.some(r=>String(r[0]).includes('the ATK buff is already up')),'a second pet cannot stack a second ATK buff');
  P.buff=P.zeroBuff();
  P.cooldowns={};P.petHit(pet('arcane'),a);
  assert.strictEqual(P.buff.matk,15,'with the ATK buff gone, MATK is free to run');
  // the two other buffs: 3% of the pet's damage as healing, and +15% max HP for the player
  P.buff=P.zeroBuff();P.cooldowns={};P.petHit(pet('siphon'),a);
  assert.strictEqual(P.buff.leech,.5,'Blood Siphon leeches 0.5%');
  assert.strictEqual(P.cooldowns['1|siphon'],60,'on a 60s cooldown');
  P.buff=P.zeroBuff();P.cooldowns={};P.petHit(pet('vital'),a);
  assert.strictEqual(P.buff.hp,15,'Vital Aura adds 15% max HP');
  assert.strictEqual(P.buff.hpT,30,'for 30s');
  P.buff=P.zeroBuff();
  for(const [id,power] of [['flameburst',1.45],['thunderclap',1.25]]){
    a=target();const b=near(),c=far();P.cooldowns={};P.mobs=[a,b,c];P.petHit(pet(id),a);
    assert.strictEqual(a.hp,1000-100*power,id+' missed its target');assert.strictEqual(b.hp,1000-100*power,id+' missed a nearby AoE target');assert.strictEqual(c.hp,1000,id+' hit outside the AoE radius');
  }
  for(const [id,power] of [['piercingfang',2],['spiritbolt',2.25]]){
    a=target();const b=near(),c=far();P.cooldowns={};P.mobs=[a,b,c];P.petHit(pet(id),a);
    assert.strictEqual(a.hp,1000-100*power,id+' missed its single target');assert.strictEqual(b.hp,1000,id+' spilled onto a nearby mob');assert.strictEqual(c.hp,1000,id+' spilled onto a distant mob');
  }
  // Low-impact utility rolls never hit a mob; they only perform their described comfort action.
  for(const id of ['treasuresniff','warmnuzzle','guardingchirp','tailwag']){
    a=target();P.cooldowns={};P.buff=P.zeroBuff();P.mobs=[a];P.petHit(pet(id),a);
    assert.strictEqual(a.hp,1000,id+' must not deal combat damage');
  }
});

t('a two-slot pet alternates its skills, and a blocked buff falls back to a real attack', () => {
  const P=makePetHarness(),target=()=>({x:0,z:0,hp:1000});
  const two={id:1,sp:0,mut:0,eq:[0,0,0],skills:['piercingfang','spiritbolt']};
  let a=target();P.mobs=[a];P.cooldowns={};P.buff=P.zeroBuff();P.petHit(two,a);
  assert.strictEqual(a.hp,775,'the stronger ready skill goes first (Spirit Bolt, 2.25x)');
  // clear only the gate: the other skill must be the one that fires next
  delete P.cooldowns[1];
  P.petHit(two,a);
  assert.strictEqual(a.hp,775-200,'then Piercing Fang (2.0x), not Spirit Bolt again');
  // with both on cooldown the pet swings normally instead of standing still
  delete P.cooldowns[1];
  const before=a.hp;P.petHit(two,a);
  assert.strictEqual(a.hp,before-100,'nothing ready means a plain 1x attack, not a wasted turn');
  delete P.cooldowns[1];delete P.cooldowns['1|piercingfang'];delete P.cooldowns['1|spiritbolt'];
  assert.strictEqual(P.petHit(two,a),true,'a ready attack skill reports that it cast');
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
  const known = new Set(['act', 'pas', 'heal', 'buff']);
  for (const s of K.SKILLS) assert.ok(known.has(s.type), `${s.id} has type "${s.type}"`);
});

t('every active attack, automatic heal and temporary buff has a visible skill effect', () => {
  const visualSkills = K.SKILLS.filter(s => ['act','heal','buff'].includes(s.type));
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
  for (const id of ['storm','fdiver']) assert.ok(/ice|frost/i.test(K.SKILL_VFX[id].kind), id + ' should use an ice visual');
  for (const id of ['fire','amp','mbrk']) assert.ok(/fire|meteor/i.test(K.SKILL_VFX[id].kind), id + ' should use a fire visual');
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

t('every visual family has a sprite recipe over the researched RO effect sheets', () => {
  const fxr=vfxBox.__renderer;
  // the classic client's effect vocabulary the sheets rebuild: pok bursts, rings, lens glows,
  // slash streaks (purpleslash), ice, the diving shard, bolts, pillars, meteors, bubbles,
  // arrows, coins, the falcon, smoke, sparkles, a ground AoE decal, and the v79.1 accents:
  // wave, vortex, cross, star
  for(const sh of ['pok','ring','lens','slash','flame','ice','shard','bolt','pillar','meteor','bubble','arrow','coin','falcon','smoke','spark','decal','wave','vortex','cross','star','hammer'])
    assert.ok(fxr.sheets[sh],'sheet '+sh+' is missing');
  const kinds=new Set(Object.values(K.SKILL_VFX).map(v=>v.kind));
  const ids=new Set(K.SKILLS.map(s=>s.id));
  for(const k of Object.keys(fxr.sprRecipes)){
    // Shared recipe library can retain families unused by the current roster.
    const layers=fxr.sprRecipes[k];
    assert.ok(Array.isArray(layers)&&layers.length,k+' has no sprite recipe');
    for(const L of layers){
      assert.ok(fxr.sheets[L.sh],k+' uses unknown sheet '+L.sh);
      assert.ok(!(L.d0!=null&&L.d1!=null&&L.d1<=L.d0),k+' has an inverted layer window');
      assert.ok(L.sc==null||L.sc>0,k+' has a sizeless layer');
      assert.ok(L.face==null||L.face==='cam'||L.face==='ground',k+' has an unknown facing');
    }
  }
  for(const k of kinds) assert.ok(fxr.sprRecipes[k],'family '+k+' lost its recipe');
});

t('shared families no longer read as copies: the visible overrides differ', () => {
  const fxr=vfxBox.__renderer;
  const eff=id=>fxr.sprRecipes[id]||fxr.sprRecipes[K.SKILL_VFX[id].kind];
  const sig=id=>JSON.stringify(eff(id));
  for(const [a,b] of [['tstorm','vermilion'],['cart','cartrev'],['quick','wwalk'],['quick','iconc'],['iagi','cboost'],
    ['fireball','mbrk'],['mbrk','meltdown'],['signum','magnus'],['judex','holy'],['kyrie','coat'],['fire','napalm'],
    ['blitz','falcon'],['focus','pharrow'],['vdust','env'],['sdestroy','soulb'],['provoke','frenzy'],['ovthrust','frenzy'],
    ['env','vsplash'],['vdust','vsplash']]){
    assert.ok(eff(a)&&eff(b),a+' or '+b+' has no recipe');
    assert.notStrictEqual(sig(a),sig(b),a+' and '+b+' still play the identical effect');
  }
});

t('the mage line strikes from the sky', () => {
  const fxr=vfxBox.__renderer;
  for(const id of ['fire','fdiver']){
    assert.strictEqual(K.SKILL_VFX[id].at||'target','target',id+' must land on the target, not fly a path');
    const layers=fxr.sprRecipes[id]||fxr.sprRecipes[K.SKILL_VFX[id].kind];
    const sky=layers.filter(L=>L.y>=4&&L.rise<=-3);
    assert.ok(sky.length,id+' has nothing falling from the sky');
  }
  // Fire Bolt is a few single bolts dropping out of the sky
  assert.ok((fxr.sprRecipes.fire||[]).filter(L=>L.sh==='bolt'&&L.y>=4&&L.rise<=-3).length>=2,
    'Fire Bolt lost its falling bolts');
});

t('v79.3 cast reworks: paths, targets and the literal hammer', () => {
  const fxr=vfxBox.__renderer;
  const eff=id=>fxr.sprRecipes[id]||fxr.sprRecipes[K.SKILL_VFX[id].kind];
  // Fire Ball and Napalm Vulcan are projectiles fired from the caster
  for(const id of ['fireball'])
    assert.strictEqual(K.SKILL_VFX[id].at,'path',id+' must fly the caster-to-target path');
  // Holy Light and Judex appear on the target - no projectile
  for(const id of ['holy','judex'])
    assert.strictEqual(K.SKILL_VFX[id].at,'target',id+' must not be a projectile');
  // Meteor Assault sweeps horizontally: slashes strike at the caster's sides, none vertical
  const ma=eff('mAss').filter(L=>L.sh==='slash');
  assert.ok(ma.filter(L=>Math.abs(L.x||0)>=1).length>=2,'Meteor Assault has no side slashes');
  assert.ok(!ma.some(L=>L.face==='ground'),'Meteor Assault must not lay giant blades on the floor');
  // Soul Breaker / Soul Destroyer: ONE clean slash wave riding caster to target
  for(const id of ['soulb']){
    assert.strictEqual(K.SKILL_VFX[id].at,'path',id+' must travel caster to target');
    assert.strictEqual(eff(id).filter(L=>L.sh==='slash').length,1,id+' must be a single slash wave');
  }
  // Hammer Fall: a translucent light-hammer swings down (spin), then the impact lands
  const hm=(eff('hammer')||[]).find(L=>L.sh==='hammer');
  assert.ok(hm,'Hammer Fall has no hammer layer');
  assert.ok(hm.spin&&hm.ang!=null,'the hammer must swing, not fall');
  assert.notStrictEqual(hm.blend,'normal','the hammer is translucent light, not a solid object');
  assert.ok((eff('hammer')||[]).some(L=>L.sh==='star'&&L.d0>=.3),'no impact beat after the swing');
  // Storm Gust is a gust: a swirling vortex field, not just falling shards
  assert.ok(eff('storm').filter(L=>L.sh==='vortex').length>=2,'Storm Gust lost its swirl');
  // Magnus pillars rain out of the sky
  assert.ok(eff('magnus').filter(L=>L.sh==='pillar'&&L.rise<=-3).length>=3,'Magnus pillars do not fall');
  // ground layers never sit coplanar with the terrain
  for(const [key,layers] of Object.entries(fxr.sprRecipes))for(const L of layers)
    if(L.face==='ground')assert.ok((L.y||0)>=0,'ground layer of '+key+' at the floor would z-fight');
});

t('spun layers rotate in place and never smear across the sheet (the v79 box-bands bug)', () => {
  const fxr=vfxBox.__renderer;
  fxr.playSkillFx('hammer',{x:2,z:0},'#ffcf6a');   // the light-hammer swings (spin)
  fxr.playSkillFx('spiral',{x:2,z:0},'#ffffff');   // vortex + slash spin
  for(let i=0;i<6;i++){fxr.tickSkillFx(.03);fxr.syncSkillFx()}
  let checked=0;
  for(const fx of fxr.effects)for(const p of fx.parts){
    const uv=p.mesh.geometry&&p.mesh.geometry.attributes&&p.mesh.geometry.attributes.uv;
    if(!uv||!uv.xy||uv.xy.length<4)continue;
    const n=p.n,us=uv.xy.map(q=>q[0]),vs=uv.xy.map(q=>q[1]);
    const cx=us.reduce((a,b)=>a+b,0)/4;
    for(const u of us)assert.ok(Math.abs(u-cx)<=.75/n+1e-6,'u smeared across the sheet: '+u.toFixed(3));
    // corners may poke past v (they clamp onto the transparent frame margin); the visible art
    // (radius <= ~.46 of the cell) never leaves its own frame
    for(const v of vs)assert.ok(v>-.3&&v<1.3,'v out of range: '+v.toFixed(3));
    checked++;
  }
  assert.ok(checked>=2,'no spun sprite parts were checked');
  for(let i=0;i<40;i++)fxr.tickSkillFx(.05);   // let them expire for the next tests
});

t('skill effects build animated sprite layers and advance their frames in flight', () => {
  const fxr=vfxBox.__renderer;
  for(const id of Object.keys(K.SKILL_VFX)){
    const before=fxr.effects.length;
    fxr.playSkillFx(id,{x:1,z:-2},'#ffc94a');
    const fx=fxr.effects[before];fxr.syncSkillFx();
    const spr=fx.parts.filter(p=>p.spr);
    assert.ok(spr.length,id+' produced no sprite layers');
    for(const p of spr){
      assert.ok(p.mesh.material.map,id+' sprite layer has no sheet texture');
      assert.ok(Number.isInteger(p.frame)&&p.frame>=0&&p.frame<p.n,id+' sprite frame is out of range');
      assert.ok(Number.isFinite(p.mesh.material.opacity),id+' sprite opacity is not finite');
    }
    fx.age=fx.life*.6;fxr.syncSkillFx();
    fxr.tickSkillFx(fx.life);
  }
  assert.strictEqual(fxr.effects.length,0,'effects remained active after expiry');
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

t('a maxed job level fits its data-derived tree without exposed overflow', () => {
  // Every level costs ONE point. The live purse is capped to the data-derived tree so a maxed
  // job line can finish all reachable skills without showing a phantom remainder.
  assert.strictEqual([1,2,3,4,5].reduce((a, L) => a + K.skCost(L), 0), 5, 'maxing a skill should cost 5');
  assert.strictEqual(K.skCost(1), 1, 'every level costs the same single point');
  const rows = [];
  for (const [name, c] of Object.entries(K.CLASSES)) {
    const line = []; for (let x = name; x; x = K.CLASSES[x].par) line.unshift(x);
    const reach = K.SKILLS.filter(s => line.includes(s.from));
    // the flat per-level cost, less the one free level of First Aid every line inherits
    const need = reach.reduce((a, s) => a + 1 * s.max, 0) - 1;
    const earned = line.reduce((a, n) => a + (K.CLASSES[n].mj - 1), 0);
    rows.push([name, c.tier, need, earned]);
    assert.ok(need <= earned,
      `${name} is ${need - earned} points short: the tree costs ${need} and a maxed line earns ${earned}`);
  }
  const byTier = {};
  for (const [name, tier, need, earned] of rows) {
    if (byTier[tier]) assert.strictEqual(byTier[tier].need, need, 'tier ' + tier + ' lines disagree on tree cost');
    byTier[tier] = { need, earned };
  }
  console.log('       ' + Object.entries(byTier).map(([t, r]) => 'tier ' + t + ': tree ' + r.need + ' of ' + r.earned + ' earned (' + (r.earned - r.need) + ' spare)').join(' | '));
  console.log('       ' + rows.map(r => r[0] + ' ' + r[3] + '/' + r[2]).join(' · '));
});

t('a rushed promotion is deliberately short of the full tree (v59 build choice)', () => {
  // v59: skill caps went RO-style (mostly 10, one 5-level utility skill per class), so a full
  // line tree costs 139 points against 156 earned at max job. Promoting at the minimum gate and
  // restarting the Novice gives 127 - twelve short, which is the build choice, not a bug. What
  // must still hold: a maxed line always finishes, and the early lines keep a real cushion.
  const lines = { Novice: ['Novice'], '1st job': ['Novice','Swordman'], '2nd job': ['Novice','Swordman','Knight'],
                  'Lord Knight': ['Novice','Swordman','Knight','Lord Knight'] };
  const floor = 0;                       // the Novice restarted: no Novice job levels at all
  const rows = [];
  for (const [label, line] of Object.entries(lines)) {
    const reach = K.SKILLS.filter(s => line.includes(s.from));
    const tree = reach.reduce((a, s) => a + s.max, 0) - (reach.some(s => s.id === 'aid') ? 1 : 0);
    const earn = label === 'Novice' ? 9
      : label === '1st job' ? 9 + 49
      : label === '2nd job' ? 9 + 39 + 49
      : floor + 39 + 39 + 49;
    rows.push([label, tree, earn]);
    if (label === 'Lord Knight') {
      assert.strictEqual(earn - tree, -12, 'the thinnest history is 12 points short by design');
    } else {
      assert.ok(tree <= earn, `${label}: tree ${tree} of ${earn} earned on the thinnest history`);
      assert.ok(earn - tree >= 3, `${label}: only ${earn - tree} points spare - too tight to trust`);
    }
  }
  // and the intended path - every job level taken to 50 - has room to finish the whole line
  const maxed = 9 + 49 + 49 + 49, fullTree = rows.find(r => r[0] === 'Lord Knight')[1];
  assert.ok(maxed - fullTree >= 10, 'a maxed line must finish its tree with a real cushion (' + (maxed - fullTree) + ')');
  console.log('       thinnest history: ' + rows.map(r => r[0] + ' tree ' + r[1] + ' of ' + r[2] + ' (' + (r[2] - r[1]) + ')').join(' · '));
});


// v97: superseded by the behavioral coverage in skill_redesign_sim.js.


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

// v97: superseded by the behavioral coverage in skill_redesign_sim.js.


// v97: superseded by the behavioral coverage in skill_redesign_sim.js.


// v97: superseded by the behavioral coverage in skill_redesign_sim.js.


// v97: superseded by the behavioral coverage in skill_redesign_sim.js.


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

// v97: superseded by the behavioral coverage in skill_redesign_sim.js.


t('effect parameters are in sane ranges', () => {
  for (const s of K.SKILLS) {
    if (s.dot) {
      assert.ok((typeof s.dot==='number'?s.dot:s.dot.pow) > 0 && (typeof s.dot==='number'?s.dot:s.dot.pow) <= .15, `${s.id} dot.pow ${(typeof s.dot==='number'?s.dot:s.dot.pow)} out of range`);
      assert.ok((typeof s.dot==='number'?2:s.dot.dur) >= 1 && (typeof s.dot==='number'?2:s.dot.dur) <= 10, `${s.id} dot.dur ${(typeof s.dot==='number'?2:s.dot.dur)} out of range`);
      // a dot should add a fraction of the hit, not several times the hit
      assert.ok((typeof s.dot==='number'?s.dot:s.dot.pow) * (typeof s.dot==='number'?2:s.dot.dur) <= 1.0, `${s.id} dot totals ${((typeof s.dot==='number'?s.dot:s.dot.pow) * (typeof s.dot==='number'?2:s.dot.dur)).toFixed(2)}x the hit`);
      assert.ok(typeof s.dot==='number'?s.col:s.dot.col, s.id + ' dot has no colour');
    }
    if (s.stun) assert.ok((typeof s.stun==='number'?s.stun:s.stun.dur) > 0 && (typeof s.stun==='number'?s.stun:s.stun.dur) <= 2, `${s.id} stun.dur ${(typeof s.stun==='number'?s.stun:s.stun.dur)} out of range`);
    if (s.chain) {
      assert.ok(s.chain.n >= 1 && s.chain.n <= 4, `${s.id} chain.n ${s.chain.n} out of range`);
      assert.ok(s.chain.pow > 0 && s.chain.pow <= 1, `${s.id} chain.pow ${s.chain.pow} out of range`);
    }
  }
});

t('automatic buffs have positive benefits and valid cooldowns', () => {
  const buffs=K.SKILLS.filter(s=>s.type==='buff');assert.ok(buffs.length>=10);
  for(const s of buffs){assert.ok(s.f(1)>0,s.id);assert.ok(s.cd>0&&s.duration>0,s.id);assert.ok(!s.to,s.id+' must not retain the old HP gate');}
});
t('buff upgrades never weaken their benefit', () => {
  for(const s of K.SKILLS.filter(s=>s.type==='buff'))for(let rank=2;rank<=s.max;rank++)assert.ok(s.f(rank)>=s.f(rank-1),s.id);
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

// v97: superseded by the behavioral coverage in skill_redesign_sim.js.


// v97: superseded by the behavioral coverage in skill_redesign_sim.js.


// v97: superseded by the behavioral coverage in skill_redesign_sim.js.


// v97: superseded by the behavioral coverage in skill_redesign_sim.js.


// v97: superseded by the behavioral coverage in skill_redesign_sim.js.


// v97: superseded by the behavioral coverage in skill_redesign_sim.js.


// v97: superseded by the behavioral coverage in skill_redesign_sim.js.



// ---- skill points are per class LINE, not one global pile (the overflow bug) -----
// Raw point supply remains Novice 9 / tier-1 58 / tier-2 107 / tier-3 156 for a fully levelled
// line. The live purse is capped to the reachable flat-cost tree (4 / 24 / 44 / 64), so the
// old cross-line overflow cannot fund an unrelated branch or leave unusable points behind.
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
  assert.strictEqual(K.skEarned(), 49, 'the current line earns only its capped Swordman tree budget');
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

t('a maxed job line reaches its tree and never leaves extra skill points', () => {
  const classes = ['Novice','Swordman','Knight','Lord Knight','Mage','Wizard','High Wizard','Thief','Assassin','Assassin Cross','Archer','Hunter','Sniper','Merchant','Blacksmith','Whitesmith','Acolyte','Priest','High Priest'];
  for (const cls of classes) {
    const jobs={};for (let n=cls;n;n=K.CLASSES[n].par)jobs[n]={jl:n==='Novice'?10:50};
    K.S={cls,jobs,sk:{aid:1}};
    assert.strictEqual(K.skEarnedMax(),K.skTree(),cls+' must not mint spare points at max job level');
    assert.strictEqual(K.skEarned(),K.skTree(),cls+' must expose exactly its payable tree budget');
  }
});

// v97: superseded by the behavioral coverage in skill_redesign_sim.js.


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
  assert.strictEqual(knight.charged, K.skSpent() - 1, 'the ledger must equal what was charged (minus the free aid level)');
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
  K.S = { cls: 'Knight', jobs: { Novice: { jl: 4 }, Swordman: { jl: 4 }, Knight: { jl: 4 } }, sk: { aid: 5 }, aid: 1 };
  K.SKILLS.filter(s => lineOf('Knight').includes(s.from)).forEach(s => { K.S.sk[s.id] = s.max });
  assert.ok(K.skSpent() > K.skEarned(), 'this save really is over-spent: ' + K.skSpent() + ' vs ' + K.skEarned());
  assert.strictEqual(K.skpAvail(), 0, 'over-spent reads as nothing spare');
  K.S.jobs.Knight.jl = 6;
  assert.strictEqual(K.skpAvail(), 0, 'still in deficit');
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
  // the freebie is exactly one level: a fully bought aid costs max points less the free one
  const ladder = aid.max;
  assert.strictEqual(K.skpAvail(), clean - (ladder - 1), 'only the levels past the first cost');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
