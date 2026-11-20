// Research prototype: runtime-only changes; never writes game data. Run from repository root.
// npm install --no-save --package-lock=false jsdom three@0.128.0
const fs=require('fs');const {createGame}=require('../../tools/tests/helpers/game');const {stationary}=require('../../tools/skill_balance');
const source=fs.readFileSync('tools/fit_expanded_budget.js','utf8');
eval(source.slice(source.indexOf('function configure'),source.indexOf('const g=createGame();')).replace('solo?150:[10,49,99,150,175][tier]','150'));
const baseline=require('node:child_process').execFileSync('git',['show','33fcf48a13cd7e1f32c3c75570ad56ab1faa3390:index.html'],{encoding:'utf8',maxBuffer:20e6});
const g=createGame(baseline),combo=['su_sky','su_tiger','su_rampage','su_gate','su_knuckle','ch_asura'];
g.ev(`{
 SKILLS.find(s=>s.id==='su_sky').castGain={key:'sphere',max:5,life:20};
 SKILLS.find(s=>s.id==='su_tiger').power*=1.15;SKILLS.find(s=>s.id==='su_gate').power*=1.2;SKILLS.find(s=>s.id==='su_gate').execute=.3;ASC_UPGRADES.su_knuckle.boss=20;
 window.__counts={};window.__cycles=0;const cast=castSkill;castSkill=(sk,k)=>{window.__counts[sk.id]=(window.__counts[sk.id]||0)+1;let e=skillState().stacks?.sphere;if(sk.id==='su_rampage'&&e&&e.until>t)k*=1+.05*e.n;cast(sk,k)};
 const finish=finishCombo;finishCombo=(...a)=>{window.__cycles++;return finish(...a)};
}`);
for(const rank of [1,3,5])for(const cd of [12,10,8,7,6,5])for(const seed of [123,321,456]){
 configure(g,'Sura');g.ev(`{
 let seed=${seed};Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 const a=ascState(),q=a.skills.Sura;q.level=30;q.ranks={};for(const s of ASC_SKILLS.filter(x=>x.from==='Sura'))q.ranks[s.id]=${rank};
 SKILLS.find(s=>s.id==='su_knuckle').cd=${cd};S.skillCombos.Sura={enabled:true,slots:${JSON.stringify(combo)}};window.__counts={};window.__cycles=0;
 }`);
 const v=stationary(g,1,120),d=JSON.parse(g.ev('JSON.stringify({cycles:window.__cycles,counts:window.__counts})'));
 console.log(JSON.stringify({rank,cd,seed,dps:Math.round(v.dps),...d}));
}g.close();
