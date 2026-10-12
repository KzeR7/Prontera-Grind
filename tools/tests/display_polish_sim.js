// Display preference, real log/loot handlers, and retained navigation nodes.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const src=fs.readFileSync(__dirname+'/../../index.html','utf8');
const g=createGame(src.replace('</body>','<script>window.realBars=bars;window.realLog=log;window.realSave=save;window.realUI=ui;</script></body>'));
const ev=g.ev,doc=g.window.document;let passed=0;
function test(name,fn){ev(`S=fresh();S.auto=false;currentUser='display-test';tabs.length=0;sideOpen=false;logs=[];feedLive=[];log=window.realLog;save=window.realSave;ui=window.realUI;shake=0;renderWin();`);fn();console.log('ok '+name);passed++;}
try{
test('Display can disable shake immediately, save it and restore it after login',()=>{
 doc.getElementById('screenOptions').hidden=true;doc.getElementById('screenBtn').click();
 const toggle=doc.querySelector('[data-display=cameraShake]');assert.ok(toggle.checked);
 ev('shake=6');toggle.checked=false;toggle.dispatchEvent(new g.window.Event('change',{bubbles:true}));
 assert.equal(ev('shake'),0);assert.equal(ev('S.cameraShake'),false);
 assert.equal(JSON.parse(g.window.localStorage.getItem('pg_save3_display-test')).cameraShake,false);
 assert.equal(ev('load().cameraShake'),false);
 ev('delete S.cameraShake;save()');assert.equal(ev('load().cameraShake'),true,'older saves retain the default');
});
test('rendered camera ignores a critical impulse with shake off and responds with it on',()=>{
 const start=src.indexOf('const dd=(cam.aspect<1.5?26:18)/zoom,sk='),end=src.indexOf('cam.lookAt(ct)',start),camera=src.slice(start,end);
 assert.ok(start>0&&end>start);
 ev('shake=6;S.cameraShake=false');ev(`(()=>{${camera}})()`);const off=ev('cam.position.clone()');
 ev('shake=0');ev(`(()=>{${camera}})()`);assert.equal(ev('cam.position.x'),off.x);assert.equal(ev('cam.position.z'),off.z);
 ev('shake=6;S.cameraShake=true');ev(`(()=>{${camera}})()`);assert.ok(ev('cam.position.x')!==off.x||ev('cam.position.z')!==off.z);
});
test('actual pickup and auto-sale create equipment artwork, labels and Zeny without changing history',()=>{
 ev(`collect({...S.eq.weapon,id:8001,name:'Test Blade',locked:false,cards:[],aff:[]})`);
 let row=doc.querySelector('#feed .feed-entry');assert.ok(row.querySelector('.feed-art img,.feed-art svg'));assert.equal(row.querySelector('.feed-label').textContent,'Loot acquired');assert.equal(row.querySelector('.feed-title').textContent,'Test Blade');assert.match(ev('logs.at(-1).m'),/^Picked up/);
 ev(`S.autoSell=Array(7).fill(true);S.autoSellRules=defaultAutoSellRules();collect({...S.eq.weapon,id:8002,name:'Sale Blade',r:0,locked:false,cards:[],aff:[]})`);
 row=doc.querySelector('#feed .feed-entry:last-child');assert.equal(row.querySelector('.feed-label').textContent,'Auto-sold');assert.ok(row.querySelector('.feed-zeny [data-ui-icon=coin]'));assert.ok(!ev('S.inv.some(x=>x.id===8002)'));assert.match(ev('logs.at(-1).m'),/^Auto-sold/);
});
test('feed keeps filters, escapes names and allocates no hidden rows',()=>{
 ev(`log('unsafe <img onerror=alert(1)>','r2','gear',{item:{...S.eq.weapon,name:'<img onerror=alert(1)>'},label:'Loot acquired'});log('reward','','kills,zeny',{title:'Poring defeated',zeny:42})`);
 assert.equal(doc.querySelector('.feed-title').textContent,'<img onerror=alert(1)>');assert.equal(doc.querySelectorAll('#feed img[onerror]').length,0);
 ev(`S.logOff={gear:1};feedDraw()`);assert.equal(doc.querySelectorAll('#feed .feed-entry').length,1);assert.match(doc.querySelector('.feed-zeny').textContent,/42 Zeny/);
 Object.defineProperty(doc,'hidden',{value:true,configurable:true});const before=ev('feedLive.length');ev(`log('Hidden loot','','gear',{item:S.eq.weapon})`);assert.equal(ev('feedLive.length'),before);assert.equal(ev('logs.at(-1).m'),'Hidden loot');Object.defineProperty(doc,'hidden',{value:false,configurable:true});
});
test('field buffs keep distinct colored artwork, countdowns, descriptions and expiry',()=>{
 ev('bars=window.realBars;petBuff={};petBuffSrc={}');
 for(const id of ['warcry','arcane','siphon','vital']){
  ev(`petBuff={};petBuffSrc={};{const s=PET_SKILLS.find(x=>x.id==='${id}');petBuff[s.stat]=s.power;petBuff[s.stat+'T']=12.2;petBuffSrc[s.stat]='Poring'};ui()`);
  const tile=doc.querySelector('#hudBuffs .pbx'),art=tile.querySelector('svg.buff-art');
  assert.equal(art.dataset.buff,id);assert.equal(art.querySelector('g').getAttribute('color'),ev(`PET_SKILLS.find(x=>x.id==='${id}').color`));
  assert.equal(tile.querySelector('.s').textContent,'13');assert.match(tile.querySelector('[role=tooltip]').textContent,/Poring/);assert.ok(tile.getAttribute('aria-label').includes(ev(`PET_SKILLS.find(x=>x.id==='${id}').n`)));assert.equal(tile.tabIndex,0);
 }
 ev('petBuff={};petBuffSrc={};ui()');assert.equal(doc.querySelectorAll('#hudBuffs .pbx').length,0);assert.equal(doc.getElementById('hudBuffs').style.display,'none');
});
test('buff countdown updates retain the hovered and focused tile, even when another buff expires',()=>{
 ev("bars=window.realBars;petBuff={atk:15,atkT:15,hp:15,hpT:20};petBuffSrc={atk:'Poring',hp:'Drops'};ui()");
 const tile=doc.getElementById('pet-buff-vital'),tooltip=tile.querySelector('[role=tooltip]');tile.focus();
 for(let i=0;i<12;i++)ev('petBuff.hpT-=.1;bars()');
 assert.equal(doc.getElementById('pet-buff-vital'),tile);assert.equal(tile.querySelector('[role=tooltip]'),tooltip);assert.equal(doc.activeElement,tile);
 assert.equal(tile.querySelector('.s').textContent,'19');assert.match(tooltip.textContent,/19s left/);
 ev('petBuff.atk=0;bars()');assert.equal(doc.getElementById('pet-buff-vital'),tile);assert.equal(doc.activeElement,tile);
 assert.equal(doc.querySelectorAll('#hudBuffs .pbx').length,1);
 ev('petBuff.hp=0;bars()');assert.equal(tile.isConnected,false);
});
test('Zeny and DPS update without native or custom hover tips and keep accessible exact values',()=>{
 ev('bars=window.realBars;bars()');
 for(const id of ['zenymin','dps']){const node=doc.getElementById(id);assert.equal(node.hasAttribute('title'),false);assert.equal(node.hasAttribute('data-full'),false);assert.match(node.getAttribute('aria-label'),/: 0$/);}
 assert.equal(doc.getElementById('zenyRate'),null);assert.equal(doc.getElementById('zenyHover').hasAttribute('aria-describedby'),false);
});
test('More follows the dock edge and viewport limits',()=>{
 const dock=doc.getElementById('dock'),menu=doc.getElementById('sideMenu');
 dock.getBoundingClientRect=()=>({left:100,right:800,top:700,bottom:766});Object.defineProperty(menu,'offsetWidth',{value:225,configurable:true});
 ev('sideOpen=true;renderQ()');assert.equal(menu.style.left,'575px');assert.equal(menu.style.bottom,(g.window.innerHeight-700+8)+'px');
 dock.getBoundingClientRect=()=>({left:0,right:100,top:700,bottom:766});ev('eclipsePositionMore()');assert.equal(menu.style.left,'8px');
});
test('combat redraws retain the animated window while reopening inserts a new one',()=>{
 ev(`openTab('status')`);const first=doc.querySelector('[data-win=status]');ev('S.zeny++;ui()');assert.equal(doc.querySelector('[data-win=status]'),first);
 ev(`openTab('status');openTab('status')`);assert.notEqual(doc.querySelector('[data-win=status]'),first);
 const css=fs.readFileSync(__dirname+'/../../assets/ui/eclipse.css','utf8');assert.match(css,/@keyframes eclipse-window-enter/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{#wins>\.wp,#sideMenu\.eclipse-more-open\{animation:none\}\}/);
});
console.log(`${passed} display polish checks passed`);
}finally{g.close()}
