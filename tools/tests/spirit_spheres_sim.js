// Exercise the real field draw and real Spirit Sphere stack lifetime without a WebGL browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),{createGame}=require('./helpers/game');
let html=fs.readFileSync('index.html','utf8');for(const f of ['assets/signature-fx.js','assets/spirit-spheres.js']){
 const re=new RegExp('<script src="'+f.replaceAll('.','\\.')+'\\?v=[0-9]+"></script>');assert.match(html,re);html=html.replace(re,()=>'<script>'+fs.readFileSync(f,'utf8')+'</script>');}
const g=createGame(html),ev=g.ev;
try{
 ev(`S.cls='Sura';resetSkillRuntime();ensureHero=()=>{};t=1;draw()`);
 const count=()=>ev(`spiritSpheres.group.children.filter(s=>s.visible).length`);
 assert.equal(count(),0);ev(`for(let i=0;i<3;i++)addSelfStack('sphere',5,20);draw()`);assert.equal(count(),3);
 const x=ev(`spiritSpheres.group.children[0].position.x`);ev(`t+=1;draw()`);assert.notEqual(ev(`spiritSpheres.group.children[0].position.x`),x,'orbits move');
 ev(`takeSelfStacks('sphere');draw()`);assert.equal(count(),0,'consumption removes orbs');
 ev(`for(let i=0;i<5;i++)addSelfStack('sphere',5,20);draw()`);assert.equal(count(),5);ev(`t+=21;draw()`);assert.equal(count(),0,'expiry removes orbs');
 ev(`addSelfStack('sphere',5);S.cls='Knight';draw()`);assert.equal(count(),0,'only Monk line has orbs');
 ev(`S=fresh();S.cls='Sura';draw()`);assert.equal(count(),0,'new save does not inherit stacks');
 console.log('Spirit Spheres: field count, motion, consumption, expiry, class and save changes passed');
}finally{g.close()}
