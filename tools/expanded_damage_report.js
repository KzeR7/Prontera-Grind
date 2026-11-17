// Damage report for the expanded-roster classes: sustained DPS on 1 and 3 targets against the
// sibling class, the share dealt by normal attacks, and the biggest skills.
//   node tools/expanded_damage_report.js            (all 22 classes, about 2 minutes)
//   node tools/expanded_damage_report.js Sura Sage
// Same measurement as tools/fit_expanded_budget.js (120 s, stationary target, every skill maxed,
// the Auto-fill combo). "*" marks an autocast bonus skill.
const fs=require('node:fs'),path=require('node:path');
const fit=fs.readFileSync(path.join(__dirname,'fit_expanded_budget.js'),'utf8');
const {createGame}=require('./tests/helpers/game'),{stationary}=require('./skill_balance');
const SEC=+process.env.SEC||120;
const configure=new Function('return '+fit.slice(fit.indexOf('function configure'),fit.indexOf('const g=createGame()')).replace(/^function configure/,'function'))();
const g=createGame(),dps=(cls,n,weapon)=>{configure(g,cls,weapon);return stationary(g,n,SEC).dps};
const budget=JSON.parse(fs.readFileSync(path.join(__dirname,'tests/fixtures/expanded_skill_budget.json'),'utf8')).classes;
const want=process.argv.slice(2),k=n=>n>=10000?Math.round(n/1000)+'k':(n/1000).toFixed(1)+'k';
g.ev("window.__c={};window.__d={};{const o=castSkill;castSkill=function(sk,k){const b=S.dmg,r=o(sk,k),id=sk.autocastChild?sk.n+'*':sk.n;window.__c[id]=(window.__c[id]||0)+1;window.__d[id]=(window.__d[id]||0)+(S.dmg-b);return r}}");
console.log('| Class | DPS 1 / 3 targets | vs sibling | Normal attacks | Biggest skills (per cast, share) |\n|---|---|---|---|---|');
for(const cls of Object.keys(budget).filter(c=>!want.length||want.includes(c))){
  const b=budget[cls],sw=/Assassin|Guillotine/.test(b.sibling)?'katar':null;
  g.ev('window.__c={};window.__d={}');const d1=dps(cls,1);
  const i=JSON.parse(g.ev('JSON.stringify({c:window.__c,d:window.__d,total:S.dmg,normal:window.__normalDamage})'));
  const d3=dps(cls,3),s1=dps(b.sibling,1,sw),s3=dps(b.sibling,3,sw);
  const top=Object.entries(i.d).sort((x,y)=>y[1]-x[1]).slice(0,3).map(([n,d])=>`${n} ${k(d/i.c[n])}, ${Math.round(100*d/i.total)}%`).join('; ');
  console.log(`| ${cls} | ${k(d1)} / ${k(d3)} | ${Math.round(100*d1/s1)}% / ${Math.round(100*d3/s3)}% ${b.sibling} | ${Math.round(100*i.normal/i.total)}% | ${top} |`);
}
g.close();
