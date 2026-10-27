// Equipment workspaces expose existing inventory, rules and actions without changing gameplay.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),doc=g.window.document,ev=g.ev;
let passed=0;
function reset(){
 ev(`S=fresh();S.auto=false;S.lv=150;S.zeny=1e9;S.ore.ori=1000;S.ore.elu=1000;S.nmMat=Array(5).fill(1000);S.cards=[];S.inv=[];S.autoSell=Array(8).fill(false);S.autoSellRules=defaultAutoSellRules();tabs.length=0;expandedPanels.clear();sub.equip='equip0';sub.bag='bag';equipmentCardPickId=null;equipmentCardFilter='all';equipmentCardSearch='';collectionGrade=-1;autoSellWorkspaceDraft=null;autoSellPreview=null;reforgeSelection={};reforgePoolOpen=null;selE='weapon';`);
}
function test(name,fn){reset();fn();console.log('ok '+name);passed++;}
try{
 test('Equipment exposes first-class Loadout, Affixes, Cards and Auto-sell navigation',()=>{
  ev(`tabs.push('equip');sub.equip='equip0';renderWin()`);
  const nav=[...doc.querySelectorAll('[data-win=equip] .atabs button')].map(b=>b.textContent.trim());
  assert.deepEqual(nav.slice(0,5),['Loadout','Refine','Affixes','Cards','Auto-sell'],'workspace tabs match the reference without extra badges');
  assert.ok(doc.querySelector('[data-v="equip:cardsWork"]'));assert.ok(doc.querySelector('[data-v="equip:autosell"]'));
  doc.querySelector('[data-v="equip:cardsWork"]').click();assert.equal(ev('sub.equip'),'cardsWork');assert.ok(doc.querySelector('.eclipse-card-workspace'));
  doc.querySelector('[data-v="equip:autosell"]').click();assert.equal(ev('sub.equip'),'autosell');assert.ok(doc.querySelector('.eclipse-autosell-workspace'));
 });
 test('Cards workspace uses the owned card, existing socket rules and explicit removal costs',()=>{
  ev(`window.workspaceCard={...newCard(CARD_CATALOG.find(c=>c.fit.includes('weapon')&&!c.bossCard)),id:91001};S.cards=[workspaceCard];S.eq.weapon.slots=2;S.eq.weapon.cards=[];S.zeny=5000;tabs.push('equip');sub.equip='cardsWork';renderWin()`);
  assert.match(doc.querySelector('.eclipse-card-workspace').textContent,/Cards, without the guesswork/);
  assert.ok(doc.querySelector('[data-a=cardworkspacepick][data-v="91001"]'));
  assert.ok(doc.querySelector('.eclipse-card-socket.empty'));
  assert.match(doc.querySelector('.eclipse-card-gear-select').textContent,/Main hand/);
  assert.ok(doc.querySelector('.eclipse-workspace-pills .protected svg[data-ui-icon=shield]'));
  const before=ev('JSON.stringify({cards:S.cards.length,sockets:S.eq.weapon.cards.length})');
  doc.querySelector('[data-a=cardworkspacepick][data-v="91001"]').click();
  assert.equal(ev('JSON.stringify({cards:S.cards.length,sockets:S.eq.weapon.cards.length})'),before,'selection alone is not an insertion');
  const insert=doc.querySelector('[data-a=sock][data-v="91001:weapon"]');assert.ok(insert,'compatible equipped weapon is offered');assert.match(insert.textContent,/Insert into Main hand/);insert.click();
  assert.equal(ev('S.cards.length'),0);assert.equal(ev('S.eq.weapon.cards[0].id'),91001);
  ev('renderWin()');const remove=doc.querySelector('.eclipse-card-socket.filled [data-a=unsock]');assert.ok(remove);assert.match(remove.textContent,/200 Zeny/);remove.click();
  assert.equal(ev('S.cards[0].id'),91001);assert.equal(ev('S.zeny'),4800);assert.equal(ev('S.eq.weapon.cards.length'),0);
 });
 test('Cards Mastery link navigates to the actual card index',()=>{
  ev(`tabs.push('equip');sub.equip='cardsWork';renderWin()`);
  const link=doc.querySelector('[data-a=cardmastery]');assert.ok(link);link.click();
  assert.equal(ev('tabs.join()'),'index');assert.equal(ev('indexMode'),'cards');assert.ok(doc.querySelector('[data-win=index]'));
 });
 test('Auto-sell draft simulates current inventory but only apply changes future-drop rules',()=>{
  ev(`S.inv=[{...S.eq.weapon,id:92001,locked:true,cards:[],aff:[]},{...S.eq.weapon,id:92002,locked:false,cards:[],aff:[]}];S.autoSell=Array(8).fill(false);window.workInv=JSON.stringify(S.inv);ACT.openautosell()`);
  const panel=doc.querySelector('.eclipse-autosell-workspace');assert.ok(panel);assert.match(panel.textContent,/DRAFT PREVIEW · CURRENT BAG/);assert.match(panel.textContent,/sample outcomes · 2 items checked/);assert.match(panel.textContent,/Always protected/);assert.ok(panel.querySelector('.eclipse-autosell-always svg[data-ui-icon=shield]'));
  const enabledBefore=ev('JSON.stringify(S.autoSell)');doc.querySelector('[data-a=autosellDraftRarity][data-v="2"]').click();
  assert.equal(ev('JSON.stringify(S.autoSell)'),enabledBefore,'editing remains a draft until Apply');
  assert.equal(ev('S.inv.length'),2);assert.equal(ev('JSON.stringify(S.inv)'),ev('window.workInv'));
  assert.ok(doc.querySelector('[data-a=autosellapply]'));doc.querySelector('[data-a=autosellapply]').click();
  assert.equal(ev('S.autoSell[2]'),true);assert.equal(ev('S.inv.length'),2);assert.equal(ev('JSON.stringify(S.inv)'),ev('window.workInv'));
 });
 test('Auto-sell presets and advanced edits remain drafts until explicitly applied',()=>{
  ev(`S.autoSellRules=defaultAutoSellRules();window.savedRules=JSON.stringify(S.autoSellRules);ACT.openautosell()`);
  const details=doc.querySelector('.autosell-editor');assert.ok(details);assert.ok(details.querySelector('[data-a=sellpresetWorkspace]'));
  details.querySelector('[data-a=sellpresetWorkspace][data-v=physical]').click();
  assert.equal(ev('JSON.stringify(S.autoSellRules)'),ev('window.savedRules'),'preset is a draft');
  assert.ok(ev('autoSellWorkspaceDraft.rules.affixes.some(a=>a.k===\'str\')'));
  doc.querySelector('[data-a=autosellapply]').click();assert.ok(ev('S.autoSellRules.affixes.some(a=>a.k===\'str\')'));
  assert.equal(ev('autoSellWorkspaceDraft'),null);
 });
 test('Auto-sell uses explicit affix logic and a draft-only pause-all control',()=>{
  ev(`S.autoSell=Array(8).fill(false);S.autoSell[2]=true;S.autoSellRules=defaultAutoSellRules();S.inv=[{...S.eq.weapon,id:92011,aff:[],cards:[]}];window.savedRarities=JSON.stringify(S.autoSell);ACT.openautosell()`);
  doc.querySelector('[data-a=autosellConditionAdd]').click();let min=doc.querySelector('[data-sell-min=atk]');assert.ok(min);min.value='20';min.dispatchEvent(new g.window.Event('change',{bubbles:true}));
  doc.querySelector('[data-a=autosellConditionAdd]').click();min=doc.querySelector('[data-sell-min=crit]');assert.ok(min);min.value='8';min.dispatchEvent(new g.window.Event('change',{bubbles:true}));
  assert.match(doc.querySelector('.eclipse-autosell-summary').textContent,/ATK ≥ 20% OR Crit ≥ 8%/);
  assert.match(doc.querySelector('.eclipse-autosell-rule-summary').textContent,/gear matching ATK ≥ 20% OR Crit ≥ 8%/);
  assert.equal(ev('JSON.stringify(S.autoSellRules)'),ev('JSON.stringify(defaultAutoSellRules())'),'conditions remain drafts');
  doc.querySelector('[data-a=autosellDraftMode][data-v=all]').click();assert.match(doc.querySelector('.eclipse-autosell-rule-summary').textContent,/ATK ≥ 20% AND Crit ≥ 8%/);
  const action=doc.querySelector('[data-sell-field=affixAction]');action.value='sell';action.dispatchEvent(new g.window.Event('change',{bubbles:true}));
  assert.match(doc.querySelector('.eclipse-autosell-summary').textContent,/Only sell items with matching affixes/);
  assert.match(doc.querySelector('.eclipse-autosell-rule-summary').textContent,/only when affix rules match/);
  doc.querySelector('[data-a=autosellConditionRemove][data-v="1"]').click();assert.equal(ev('autoSellWorkspaceDraft.rules.affixes.length'),1);
  const pause=doc.querySelector('[data-a=autosellDraftPause]');assert.ok(pause&&!pause.disabled);pause.click();
  assert.ok(ev('autoSellWorkspaceDraft.rarities.every(x=>!x)'));assert.equal(ev('JSON.stringify(S.autoSell)'),ev('window.savedRarities'),'Pause all remains a draft until Apply');
  assert.equal(ev('S.inv.length'),1);doc.querySelector('[data-a=autosellapply]').click();assert.ok(ev('S.autoSell.every(x=>!x)'));assert.equal(ev('S.inv.length'),1,'applying never sells existing bag items');
 });
 test('Affixes show a readable range meter and keep action costs in the footer',()=>{
  ev(`S.eq.weapon.aff=[{k:'str',v:9999},{k:'atk',v:20},{k:'crit',v:8}];tabs.push('equip');sub.equip='reforge';renderWin()`);
  assert.ok(doc.body.classList.contains('equipment-workspace-open'));assert.match(doc.querySelector('.eclipse-equipment-workspace-window .title').textContent,/Equipment/);
  const rows=[...doc.querySelectorAll('.eclipse-affix-row')];assert.equal(rows.length,3);assert.ok(rows[0].classList.contains('outside-range'));assert.ok(rows[0].querySelector('svg[data-ui-icon=gem]'));
  assert.match(rows[0].querySelector('.eclipse-affix-range-label').textContent,/Range/);assert.match(rows[0].querySelector('.eclipse-affix-meter i').getAttribute('style'),/width:/);
  assert.ok(doc.querySelector('.eclipse-affix-row[aria-label*="Roll range"]'));assert.ok(doc.querySelector('[data-a=bmref][data-v="weapon:selected"]'));
 });
 test('Paid reforge result is saved, compared and unchanged until accept',()=>{
  ev(`S.eq.weapon.aff=[{k:'str',v:10},{k:'agi',v:10}];S.zeny=1e9;S.ore.ori=1000;tabs.push('equip');sub.equip='reforge';renderWin()`);
  assert.ok(doc.querySelector('.eclipse-affix-workbench'));const old=ev('JSON.stringify(S.eq.weapon.aff)'),zeny=ev('S.zeny');
  const action=doc.querySelector('[data-a=bmref][data-v="weapon:selected"]');assert.ok(action);action.click();ev('renderWin()');
  const offer=doc.querySelector('.eclipse-reforge-offer');assert.ok(offer);assert.ok(offer.querySelector('.eclipse-offer-banner svg[data-ui-icon=check]'));assert.equal(ev('JSON.stringify(S.eq.weapon.aff)'),old,'paid result is only an offer');assert.ok(ev('S.zeny<'+zeny));
  assert.match(offer.textContent,/CURRENT/);assert.match(offer.textContent,/NEW OFFER/);assert.match(doc.querySelector('.eclipse-affix-paid').textContent,/PAID OFFER/);
  assert.ok(doc.querySelector('[data-a=refaccept][data-v=no]'));assert.ok(doc.querySelector('[data-a=refaccept][data-v=yes]'));
  const pending=ev('JSON.stringify(S.reforgePending)'),before=ev('JSON.stringify(S.eq.weapon.aff)');
  assert.ok(ev('S.reforgePending.paid.zeny>0'));doc.querySelector('[data-a=refaccept][data-v=no]').click();
  assert.equal(ev('JSON.stringify(S.eq.weapon.aff)'),before);assert.equal(ev('S.reforgePending'),undefined);
  assert.ok(pending);
 });
 test('Workspace title bars no longer repeat the player Zeny',()=>{
  for(const k of ['reforge','cardsWork','autosell']){
   ev(`S.zeny=48923924963;tabs.push('equip');sub.equip='${k}';renderWin()`);
   const tools=doc.querySelector('[data-win=equip] .ui-window-tools');
   assert.ok(tools,'window tools stay available');
   assert.equal(doc.querySelector('[data-win=equip] .eclipse-workspace-wallet'),null,`${k} shows no duplicate Zeny wallet`);
   assert.equal(doc.querySelectorAll('[data-win=equip] .ui-window-tools .eclipse-workspace-wallet').length,0);
   assert.equal(doc.querySelector('[data-win=equip] .title').textContent.includes('48,923,924,963'),false,'the equipment header carries no Zeny figure');
   assert.ok(doc.querySelector('[data-win=equip] [data-x]'),'the close button stays in the title bar');
  }
 });
 test('Paid reforge decisions sit in the Affixes rail for quick repeats',()=>{
  ev(`S.eq.weapon.aff=[{k:'str',v:10},{k:'agi',v:10}];S.zeny=1e9;S.ore.ori=1000;tabs.push('equip');sub.equip='reforge';renderWin()`);
  doc.querySelector('[data-a=bmref][data-v="weapon:selected"]').click();ev('renderWin()');
  assert.ok(ev('!!S.reforgePending'),'the reforge produced a paid offer');
  const rail=doc.querySelector('.eclipse-affix-aside.eclipse-affix-decision');assert.ok(rail,'the decision rail is the Affixes aside');
  assert.ok(rail.querySelector('[data-a=refaccept][data-v=yes]'),'use the new affixes is in the rail');
  assert.ok(rail.querySelector('[data-a=refaccept][data-v=no]'),'keep current is in the rail');
  assert.ok(rail.querySelector('[data-a=refagain]'),'try again is in the rail');
  assert.equal(rail.querySelector('[data-a=refagain]').disabled,false,'the repeat action is available');
  const footer=doc.querySelector('[data-win=equip] .eclipse-window-footer');
  assert.equal(footer.querySelectorAll('[data-a=refaccept],[data-a=refagain]').length,0,'the footer no longer duplicates the decisions');
  assert.equal(doc.querySelector('.eclipse-affix-main [data-a=refagain]'),null,'try again is not buried under the comparison');
 });
 test('Workspace styling keeps the Loadout frame, height and tool icons',()=>{
  const css=require('node:fs').readFileSync(__dirname+'/../../assets/ui/eclipse.css','utf8');
  assert.match(css,/body\.equipment-workspace-open #wins\{[^}]*max-height:none/,'workspace windows use the Loadout window height instead of the old 618px clamp');
  assert.match(css,/\.eclipse-equipment-workspace-window\{[^}]*border:2px solid var\(--e-screen-edge\)/,'workspace windows carry the same gold frame as Loadout');
  assert.match(css,/\.title \.ui-window-tools \.ui-icon\{width:18px!important;height:18px!important/,'window tool icons stay inside their buttons');
  assert.doesNotMatch(css,/\.title \.ui-icon\{display:grid;width:38px/,'the framed title badge no longer applies to the close button');
 });
 console.log(`${passed} equipment workspace checks passed`);
}finally{g.close()}
