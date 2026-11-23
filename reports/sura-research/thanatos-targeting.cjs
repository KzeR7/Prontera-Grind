// Research-only: seeded actual solo raid boss-stage update loop. No game files modified.
// npm install --no-save --package-lock=false jsdom@22 three@0.128.0
// node reports/sura-research/thanatos-targeting.cjs > results.jsonl
const fs=require('node:fs'),assert=require('node:assert/strict');
const {createGame}=require('../../tools/tests/helpers/game');
const {fourthSetup}=require('../../tools/tests/helpers/endgame');
// Frozen pre-change source: the stored data measures the v465 research prototype.
let html=process.env.SOURCE==='working'?fs.readFileSync('index.html','utf8'):require('node:child_process').execFileSync('git',['show','824511bd35e9fedda474a331546048c405ef1b66:index.html'],{encoding:'utf8',maxBuffer:20e6});
const marker='if(!mob||!mobs.includes(mob)||!isEngaged(mob))mob=mobs.find(m=>m.boss)||packMob();';
if(html.split(marker).length!==2)throw Error('target hook changed');
// Prototype only: once Asura is the next ready rotation slot, select a live, engaged boss.
// Normal movement handles the approach; the chosen boss can remain the current target afterwards.
if(process.env.SOURCE!=='working')html=html.replace(marker,marker+`\n    if(window.__bossPriority&&S.cls==='Sura'&&!swing){const r=skillState(),s=SKILLS.find(x=>x.id==='ch_asura'),b=mobs.find(x=>x.boss&&x.hp>0&&isEngaged(x));if(b&&r.comboSlots?.[r.cursor]==='ch_asura'&&skillOn('ch_asura')&&skillStackReady(s)&&(skCd.ch_asura||0)<=0)mob=b;}`);
// Styling is irrelevant to the headless combat loop; jsdom 22 cannot parse modern CSS.
html=html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
let raid=fs.readFileSync('assets/raid.js','utf8');
const raidHook='spawnSanctuaryPillars: spawnSanctuaryPillars,';
if(raid.split(raidHook).length!==2)throw Error('raid hook changed');
const seeds=(process.env.SEEDS||'123,321,456,789,987').split(',').map(Number);
const survivalModes=(process.env.SURVIVAL||'normal,invulnerable').split(',');
const classes=(process.env.CLASSES||'Sura,Guillotine Cross').split(',');
const scenarios=(process.env.SCENARIOS||'natural,escort-engaged').split(',');
const weapons={'Sura':'knuckle','Guillotine Cross':'katar','Geneticist':'axe','Mechanic':'axe'};
for(const survival of survivalModes)for(const scenario of scenarios)for(const cls of classes)for(const mode of (cls==='Sura'&&process.env.SOURCE!=='working'?['current','priority']:['current']))for(const seed of seeds){
 const g=createGame(html);
 g.ev(raid.replace(raidHook,raidHook+'\n    researchSpawnRaidStage: spawnRaidStage,'));
 g.ev(`{
  GM_ASC_PRESETS[${JSON.stringify(cls)}].set='infernal';
  const originalHurt=hurt;hurt=function(o,...args){const before=S.dmg||0;const result=originalHurt(o,...args);const delta=(S.dmg||0)-before;if(window.__research&&o.boss)window.__research.bossDamage+=delta;return result};
  const originalCast=castSkill;castSkill=function(sk,k){if(window.__research&&sk.id==='ch_asura'){window.__research.asuraTotal++;if(mob&&mob.boss)window.__research.asuraBoss++;else window.__research.asuraMob++;}return originalCast(sk,k)};
}`);
 if(!weapons[cls])throw Error('Unsupported class '+cls);
 fourthSetup(g,cls,weapons[cls],seed);
 g.ev(`{
  S.eq.weapon.r=${cls==='Guillotine Cross'?14:15};
  const a=ascState();a.level=50;a.stats[S.cls]={might:10,precision:10,ferocity:10,slayer:10,vitality:10};const q=a.skills[S.cls];q.level=30;q.ranks=Object.fromEntries(ASC_SKILLS.filter(x=>x.from===S.cls).map(x=>[x.id,5]));
  S.hp=maxHp();S.pets=[];S.dmg=0;S.raid={day:trialDay(),used:0};window.__bossPriority=${mode==='priority'};
  let seed=${seed};Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  window.__research=null;PGRaid.raid.on=false;PGRaid.start('solo');PGRaid.researchSpawnRaidStage(3,false);
  S.hp=maxHp();S.dmg=0;PGRaid.raid.dmg0=0;PGRaid.raid.elapsed=0;
  window.__research={bossDamage:0,asuraTotal:0,asuraBoss:0,asuraMob:0};
  ${scenario==='escort-engaged'?"mob=mobs.find(m=>!m.boss);engageTgt=mob;":""}
 }`);
 const r=JSON.parse(g.ev(`JSON.stringify((()=>{
 const boss=mobs.find(m=>m.boss),hp=boss.hp,critRes=boss.critRes,armor=boss.raidArmor;let time=0;
 for(let i=0;i<180*30&&PGRaid.raid.on&&boss.hp>0;i++){if(${survival==='invulnerable'})S.hp=maxHp();update(1/30);time=(i+1)/30;floats.length=0;shots.length=0;drops.length=0;}
 return {time,killed:boss.hp<=0,reason:PGRaid.raid.result?.reason||null,bossHp:hp,bossRemaining:Math.max(0,boss.hp),critRes,armor,totalDamage:S.dmg,bossDamage:Math.min(hp,Math.max(0,hp-boss.hp)),skillBossDamage:window.__research.bossDamage,asuraTotal:window.__research.asuraTotal,asuraBoss:window.__research.asuraBoss,asuraMob:window.__research.asuraMob,setCount:ascensionSetBonuses().infernal?.count||0};
 })())`));
 assert.equal(r.setCount,6,'six Infernal pieces');assert.equal(r.critRes,.55,'Thanatos crit resistance');assert.equal(r.armor,.5,'raid armor');assert.equal(r.asuraTotal,r.asuraBoss+r.asuraMob,'Asura cast accounting');
 console.log(JSON.stringify({survival,scenario,cls,mode,seed,...r}));
 g.close();
}
