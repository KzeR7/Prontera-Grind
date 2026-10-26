const assert=require('node:assert/strict'),fs=require('node:fs');
const {createGame}=require('./helpers/game');
let html=fs.readFileSync(__dirname+'/../../index.html','utf8').replace('</body>','<script>window.realUI=ui;window.realBars=bars;window.realLog=log;window.realFx=playSkillFx;</script></body>');
const g=createGame(html),ev=g.ev,doc=g.window.document;let pass=0;
function test(name,fn){ev(`S=fresh();S.auto=false;S.cls='Thief';S.inv=[];tabs.splice(0,tabs.length,'equip');sub.equip='equip0';eclipseInventoryState=null;eclipseRarity=-1;eclipseSlotFilter='all';eclipseSearch='';eclipseInspectBag=false;eqPick=null;selB=null;autoSellDraft=null;autoSellPreview=null;bulkSellSelection=null;ui=window.realUI;`);fn();pass++;console.log('ok '+name)}
ev(`window.gear=(id,name,slot='weapon',wt='dagger',aff=[])=>({id,name,slot,wt,aff,tier:0,sec:0,val:12,r:0,slots:0,cards:[]});`);
try{
test('compatible gear leads across rarities, followed by grouped type and names',()=>{
 ev(`S.inv=[gear(1,'Armor B','armor',''),gear(2,'Dagger B'),gear(3,'Sword A','weapon','sword'),gear(4,'Dagger A'),gear(5,'Armor A','armor','')];S.inv[2].tier=4;renderWin();ACT.seleq('weapon')`);
 assert.deepEqual([...doc.querySelectorAll('.eclipse-bag .grid [data-tip]')].map(x=>x.dataset.tip),['4','2','3','5','1']);
 ev(`ACT.seleq('armor')`);assert.deepEqual([...doc.querySelectorAll('.eclipse-bag .grid [data-tip]')].map(x=>x.dataset.tip),['5','1','4','2','3']);
 assert.equal(ev('S.inv.map(x=>x.id).join()'),'1,2,3,4,5');
});
test('Loadout filters by gear family and rarity without changing inventory state',()=>{
 ev(`S.inv=[gear(101,'Blade','weapon','sword'),gear(102,'Chain','armor',''),gear(103,'Cap','head',''),gear(104,'Shield','off',''),gear(105,'Boots','leg',''),gear(106,'Rare Ring','acc',''),gear(107,'Necklace','acc','')];S.inv[5].tier=2;renderWin()`);
 const before=ev('JSON.stringify(S)'),all=()=>[...doc.querySelectorAll('.eclipse-bag .grid [data-tip]')].map(tile=>tile.dataset.tip);
 assert.equal(doc.querySelectorAll('.eclipse-rarity-legend .eclipse-rarity-key').length,8);
 assert.deepEqual(all(),['101','102','103','104','105','107','106']);
 doc.querySelector('[data-a=filtergearslot][data-v=armor]').click();assert.deepEqual(all(),['102','103','104','105']);
 assert.equal(doc.querySelector('[data-a=filtergearslot][data-v=armor]').getAttribute('aria-pressed'),'true');
 doc.querySelector('[data-a=filtergearslot][data-v=acc]').click();assert.deepEqual(all(),['107','106']);
 doc.querySelector('[data-a=filtergearslot][data-v=weapon]').click();assert.deepEqual(all(),['101']);
 doc.querySelector('[data-a=filtergearslot][data-v=all]').click();doc.querySelector('[data-a=filtergear][data-v="2"]').click();assert.deepEqual(all(),['106']);
 assert.equal(ev('JSON.stringify(S)'),before,'filtering must be presentation-only');
});
test('Loadout inspection and the footer auto-sell shortcut retain explicit protected actions',()=>{
 ev(`S.eq.weapon=gear(301,'Worn Blade');S.eq.weapon.locked=true;S.inv=[gear(302,'Bag Blade')];selE='weapon';selB=null;renderWin()`);
 const before=ev('JSON.stringify(S)'),tile=doc.querySelector('.eclipse-bag .grid [data-tip="302"]');assert.ok(tile);
 tile.click();assert.equal(ev('JSON.stringify(S)'),before,'selecting a tile is inspection only');
 const inspector=doc.querySelector('.eclipse-equipment .ui-inspector');assert.ok(inspector.querySelector('[data-a=equip][data-v="302"]'));
 assert.ok(inspector.querySelector('[data-a=sell][data-v="302"]'));
 assert.ok(inspector.querySelector('[data-a=lockgear][data-v="302"]'));
 const selectedTile=doc.querySelector('.eclipse-bag .grid [data-tip="302"]');assert.equal(selectedTile.getAttribute('aria-pressed'),'true');assert.equal(doc.querySelectorAll('.eclipse-item-heading .eclipse-rarity-chip').length,2);
 const shortcut=doc.querySelector('.eclipse-loadout-autosell');assert.ok(shortcut);shortcut.click();
 assert.equal(doc.querySelector('.eclipse-bag>.bag-tools').open,true);assert.equal(doc.querySelector('.autosell-editor').open,true);
 assert.equal(ev('JSON.stringify(S)'),before,'opening the rule editor must not sell or unlock anything');
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
 ev(`S.ore.ori=42;S.ore.elu=5;S.refineScrolls=7;S.shards=11;S.nmMat=[13,17,19,23,29];S.ascensionMat=[31,37,41];tabs.splice(0,tabs.length,'bag');sub.bag='bag';renderWin()`);
 const expected=[['Oridecon','42'],['Elunium','5'],['Refine Protection Scroll','7'],['Echo Shards','11'],
  ...Array.from(ev('NM_MAT'),(name,i)=>[name,String([13,17,19,23,29][i])]),
  ...Array.from(ev('ASCENSION_MATERIALS'),(name,i)=>[name,String([31,37,41][i])])];
 assert.deepEqual([...doc.querySelectorAll('.bag-item-list article')].map(row=>[row.querySelector('b').textContent,row.querySelector('strong').textContent]),expected);
 assert.match(doc.querySelector('.bag-items').textContent,/Refine Protection Scroll7/);assert.doesNotMatch(doc.querySelector('.bag-items').textContent,/Drop Protection Scroll/);assert.match(doc.querySelector('.bag-items').textContent,/Oridecon42/);assert.equal(doc.querySelector('.grid'),null);
 doc.querySelector('[data-v="bag:cards"]').click();assert.ok(doc.querySelector('.eclipse-card-grid'));
 ev(`sub.bag='bag';renderWin()`);doc.querySelector('.bag-items [data-t=equip]').click();assert.ok(doc.querySelector('.eclipse-bag'));
});
test('legacy skills keep distinct motifs; fourth skills reuse approved valid artwork',()=>{
 const keys=ev(`SKILLS.filter(s=>!SKILLS4.includes(s)).map(s=>(SKILL_ICON[s.id]||'rune')+':'+(SKILL_EMBLEM[s.id]||''))`);assert.equal(new Set(keys).size,keys.length);
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
