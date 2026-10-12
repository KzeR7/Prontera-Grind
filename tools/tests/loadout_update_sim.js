const assert=require('node:assert/strict'),fs=require('node:fs');
const {createGame}=require('./helpers/game');
let html=fs.readFileSync(__dirname+'/../../index.html','utf8').replace('</body>','<script>window.realUI=ui;window.realBars=bars;window.realLog=log;window.realFx=playSkillFx;</script></body>');
const g=createGame(html),ev=g.ev,doc=g.window.document;let pass=0;
function test(name,fn){ev(`S=fresh();S.auto=false;S.cls='Thief';S.inv=[];tabs.splice(0,tabs.length,'equip');sub.equip='equip0';eclipseInventoryState=null;eclipseRarity=-1;eclipseSearch='';eqPick=null;selB=null;autoSellDraft=null;autoSellPreview=null;bulkSellSelection=null;ui=window.realUI;`);fn();pass++;console.log('ok '+name)}
ev(`window.gear=(id,name,slot='weapon',wt='dagger',aff=[])=>({id,name,slot,wt,aff,tier:0,sec:0,val:12,r:0,slots:0,cards:[]});`);
try{
test('compatible gear leads across rarities, followed by grouped type and names',()=>{
 ev(`S.inv=[gear(1,'Armor B','armor',''),gear(2,'Dagger B'),gear(3,'Sword A','weapon','sword'),gear(4,'Dagger A'),gear(5,'Armor A','armor','')];S.inv[2].tier=4;renderWin();ACT.seleq('weapon')`);
 assert.deepEqual([...doc.querySelectorAll('.eclipse-bag .grid [data-tip]')].map(x=>x.dataset.tip),['4','2','3','5','1']);
 ev(`ACT.seleq('armor')`);assert.deepEqual([...doc.querySelectorAll('.eclipse-bag .grid [data-tip]')].map(x=>x.dataset.tip),['5','1','4','2','3']);
 assert.equal(ev('S.inv.map(x=>x.id).join()'),'1,2,3,4,5');
});
test('Loadout exposes independent bulk selection, affix actions, preview and protected confirmation',()=>{
 ev(`S.inv=[gear(11,'Keep STR','weapon','dagger',[{k:'str',v:6}]),gear(12,'Sell AGI','weapon','dagger',[{k:'agi',v:2}]),{...gear(13,'Locked'),locked:true}];renderWin()`);
 const tools=doc.querySelector('.eclipse-bag > .bag-tools');assert.ok(tools);tools.open=true;
 const editor=tools.querySelector('.autosell-editor');editor.open=true;
 const aff=editor.querySelector('[data-sell-affix=str]');aff.checked=true;aff.dispatchEvent(new g.window.Event('change',{bubbles:true}));
 doc.querySelector('[data-a=sellrulesapply]').click();
 doc.querySelector('[data-a=bulksellnow]').click();assert.equal(ev('autoSellPreview.ids.join()'),'12');assert.equal(ev('S.autoSell.some(Boolean)'),false);assert.equal(ev('S.inv.length'),3);
 doc.querySelector('[data-a=sellconfirm]').click();assert.equal(ev('S.inv.map(x=>x.id).join()'),'11,13');
 ev(`S.autoSellRules.affixAction='sell';S.inv.push(gear(14,'No match'));ACT.bulksellnow()`);assert.equal(ev('autoSellPreview.ids.join()'),'11');
 ev(`S.inv[0].locked=true;ACT.sellconfirm()`);assert.equal(ev('S.inv.length'),3);
});
test('bulk preview excludes later drops and rechecks selected rarity',()=>{
 ev(`S.inv=[gear(21,'A')];ACT.bulksellnow();S.inv.push(gear(22,'B'));bulkSellSelection.rarities[0]=false;ACT.sellconfirm()`);assert.equal(ev('S.inv.length'),2);
 ev(`bulkSellSelection.rarities[0]=true;ACT.bulksellnow();S.inv.push(gear(23,'C'));ACT.sellconfirm()`);assert.equal(ev('S.inv.map(x=>x.id).join()'),'23');
});
test('Bag previews actual item counts and retains card and Loadout navigation',()=>{
 ev(`S.ore.ori=42;S.refineScrolls=7;S.nmMat[0]=13;tabs.splice(0,tabs.length,'bag');sub.bag='bag';renderWin()`);
 assert.equal(doc.querySelectorAll('.bag-item-list article').length,10);assert.match(doc.querySelector('.bag-items').textContent,/Oridecon42/);assert.equal(doc.querySelector('.grid'),null);
 doc.querySelector('[data-v="bag:cards"]').click();assert.ok(doc.querySelector('.eclipse-card-grid'));
 ev(`sub.bag='bag';renderWin()`);doc.querySelector('.bag-items [data-t=equip]').click();assert.ok(doc.querySelector('.eclipse-bag'));
});
test('every skill has a distinct motif/emblem composition with valid artwork',()=>{
 const keys=ev(`SKILLS.map(s=>(SKILL_ICON[s.id]||'rune')+':'+(SKILL_EMBLEM[s.id]||''))`);assert.equal(new Set(keys).size,keys.length);
 assert.equal(ev(`SKILLS.every(s=>SKILL_PICTO[SKILL_ICON[s.id]]&&(!SKILL_EMBLEM[s.id]||SKILL_PICTO[SKILL_EMBLEM[s.id]]))`),true);
});
test('hidden simulation retains logs without rebuilding DOM or allocating skill effects',()=>{
 ev(`renderWin()`);const win=doc.querySelector('.wbody'),content=win.innerHTML;
 Object.defineProperty(doc,'hidden',{value:true,configurable:true});
 ev(`S.ore.ori+=10;window.realUI();window.realBars();window.realLog('Hidden combat');window.realFx('bash',null,'#fff')`);
 assert.equal(win.innerHTML,content);assert.equal(ev("logs.at(-1).m"),'Hidden combat');assert.equal(ev('skillFx.length'),0);
 Object.defineProperty(doc,'hidden',{value:false,configurable:true});
});
console.log(`${pass} loadout update checks passed`);
}finally{g.close()}
