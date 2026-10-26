const fs=require('node:fs'),assert=require('node:assert/strict');const {createGame}=require('/home/vercel-sandbox/workspace/repos/github.com/kingz0007/prontera-grind/tools/tests/helpers/game');
const source=fs.readFileSync('index.html','utf8'),normal=fs.readFileSync('/tmp/prontera-normalize-audit.js','utf8');
const definitions=normal.slice(normal.indexOf('const original='),normal.indexOf('for(const variant'));
const formulas=new Function('source',definitions+'return formula;')(source),original=source.split('\n').find(l=>l.startsWith('const aspd='));
const g=createGame(source.replace(original,formulas.revised));
const result=g.ev(`(()=>{
 const prep=cls=>{S=fresh();S.cls=cls;S.lv=150;for(const n of lineOf(cls))S.jobs[n]={jl:CLASSES[n].mj,jx:0};autoAllocateSkills();resetSkillRuntime();for(const s of SKILLS.filter(s=>s.cls.includes(cls)&&s.type==='buff'&&s.key==='speed'))skillState().buffs[s.id]={key:s.key,value:s.f(s.max)};S.eq.leg={slot:'leg',aff:[{k:'agi',v:25},{k:'aspd',v:0}],cards:[]};};
 prep('Assassin Cross');
 const thresholds=[10,20,30,50].map(gear=>{S.eq.leg.aff[1].v=gear;let at=null;for(let a=1;a<=120;a++){S.st.agi=a;if(aspd()===.13){at=a;break;}}return{gearAspd:gear,minimumAllocatedAgi:at};});
 S.eq.leg.aff[1].v=125.5;S.cardIndex.bonus=5;S.cardIndex.rolls=Array(5).fill('aspdPct');let maxThreshold=null;for(let a=1;a<=120;a++){S.st.agi=a;if(aspd()===.13){maxThreshold=a;break;}}
 const classes=['Lord Knight','High Wizard','Sniper','Assassin Cross','High Priest','Whitesmith'].map(cls=>{prep(cls);S.st.agi=120;S.eq.leg.aff[1].v=125.5;S.cardIndex.bonus=5;S.cardIndex.rolls=Array(5).fill('aspdPct');return{cls,interval:aspd(),attacksPerSecond:1/aspd(),skillAspd:pv('aspd')};});
 return {thresholds,maxThreshold,classes};
})()`);
assert.equal(result.maxThreshold,79);assert.equal(result.thresholds.map(x=>x.minimumAllocatedAgi).join(','),'93,90,87,82');assert.ok(result.classes.every(x=>x.interval>=.13));assert.ok(result.classes.find(x=>x.cls==='High Priest').interval>.131);
console.log(JSON.stringify(result,null,2));g.close();
