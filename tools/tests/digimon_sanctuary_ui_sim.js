// Fresh-account Sanctuary flow: egg hatch -> owned partner -> bag/shop -> care/reward.
const assert=require('node:assert/strict'),fs=require('node:fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="view"><div id="feedWrap"></div><div id="minimapTools"><button id="socialHubBtn" type="button"><span class="minimap-tool-label">Social</span><b id="socialHubBadge" hidden>0</b></button></div></div>',{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window,d=w.document;
Object.assign(w,{CLOUD:{on:false,user:null},S:{cls:'Novice',eq:{},lv:1,zeny:123,pets:[{sp:2,on:true}]},tabs:[],wardrobeAppearance:()=>({version:1,sex:'m'}),logShown:()=>[],openTab:()=>{},HUNT_TITLES:[{id:'poring',name:'Poring Hunter'}],titleUnlocked:()=>true,setInterval:fn=>{if(fn.name==='worldTrainingTick')w.trainingTick=fn;else w.sessionTick=fn},PGSocialScene:{}});
w.eval(fs.readFileSync('assets/digimon/roster.js','utf8'));w.eval(fs.readFileSync('assets/digimon/base-stats.js','utf8'));w.eval(fs.readFileSync('assets/social-rules.js','utf8'));w.eval(fs.readFileSync('assets/digimon-sanctuary.js','utf8'));w.eval(fs.readFileSync('assets/digimon-battle.js','utf8'));w.eval(fs.readFileSync('assets/social.js','utf8'));
const G=w.PGDigimonSanctuary,pick=d.getElementById('socialDigimon');let saved=0;w.save=()=>saved++;
const nav=view=>d.querySelector('.sanctuary-nav [data-sanctuary-view="'+view+'"]').click();
const open=()=>{if(d.getElementById('sanctuaryPanel').hidden)d.getElementById('sanctuaryOpen').click()};
const bag=()=>w.S.digimonBag;
// No legacy partner or owned collection: the only acquisition path is the saved egg.
open();assert.equal(bag().v,3);assert.equal(bag().coins,50);assert.equal(bag().eggs,1);assert.equal(bag().owned.length,0);assert.equal(d.querySelectorAll('[data-sanctuary-pet]').length,0);assert.equal(pick.options.length,1);assert.match(d.getElementById('sanctuaryGameplay').textContent,/Hatch a Digi-Egg/);assert.equal(d.getElementById('sanctuaryTitle').textContent.trim(),'DigiPet');assert(d.querySelector('#sanctuaryTitle .digipet-logo svg'));assert.equal(d.getElementById('sanctuaryPanel').firstElementChild,d.querySelector('.sanctuary-head'),'the fixed header remains outside the scrolling content');assert(d.querySelector('.sanctuary-head #sanctuaryClose'));
nav('bag');assert(!d.getElementById('sanctuaryBagView').hidden);assert.match(d.getElementById('sanctuaryBagView').textContent,/Mystery Digi-Egg/);d.querySelector('[data-bag-action="hatch"]').click();
assert.equal(bag().eggs,0);assert.equal(bag().owned.length,1);const line=bag().owned[0];assert(G.STARTER_POOL.includes(line));assert.equal(w.S.digimonPartner,line);assert.match(d.getElementById('sanctuaryBagView').textContent,/HATCHED PARTNER/);assert(saved>0,'hatch and selection are saved');
nav('partners');assert.match(d.getElementById('sanctuaryGameplay').textContent,/5 min per session/);assert.equal(pick.value,line);assert.equal(d.querySelectorAll('[data-sanctuary-pet]').length,0,'the owned-forms card grid is retired');
// v349 panel: four partner slots, one Energy meter, no rest control and no live-battles section.
assert.equal(d.querySelectorAll('.sanctuary-partner-grid [data-partner-slot]').length,4,'four partner slot cards are offered');assert.deepEqual(Array.from(d.querySelectorAll('.sanctuary-partner-grid [data-partner-slot] .sanctuary-partner-head b'),b=>b.textContent),['Partner 1','Partner 2','Partner 3','Partner 4']);assert(d.querySelector('.sanctuary-partner-grid [data-partner-slot="0"].is-active'),'the active slot is flagged on its card');assert(d.querySelector('.sanctuary-partner-activity.is-idle'),'an unused slot shows an IDLE chip');assert.match(d.querySelector('.sanctuary-collection-note').textContent,/DigiDex/,'the partner section points to the DigiDex for species assignment');assert(d.querySelector('.sanctuary-partner-grid [data-partner-slot="1"].is-empty'),'an unused slot is an explicit empty card');
assert(!/Energy \d+\//.test(d.getElementById('sanctuaryGameplay').textContent),'the energy meter is retired');assert(!d.querySelector('[data-sanctuary-action="feed"]'),'the feed control is gone');assert(!d.querySelector('[data-sanctuary-action="rest"]'),'the removed rest control is gone');assert(!d.querySelector('.sanctuary-live-battles'),'the grind & challenge section is gone');assert(!/Grind or challenge/.test(d.getElementById('sanctuaryPanel').textContent));assert(!d.querySelector('.sanctuary-note'),'the bottom disclaimer wording is gone');// v358 (owner: "remove the restart as digi eggs button"): the restart control is gone for good.
assert(!d.querySelector('[data-sanctuary-action="requestReset"]'),'the egg-restart control is removed');assert(!d.querySelector('[data-sanctuary-action="reset"]'),'no confirm-restart control lingers');assert(d.querySelector('[data-sanctuary-action="requestEvolution"]'),'the rolled evolution control exists');
// v354: the field-grind explainer section is removed — the battle HUD carries that live.
assert(!/FIELD GRIND/.test(d.getElementById('sanctuaryGameplay').textContent),'the stages-and-bosses explainer is gone');
// Feeding and Pet Meals are retired with the meter; shopping never touches Zeny/RO pets.
// v373: the separate shop view was retired; eggs are bought from the Pet Bag view.
nav('bag');assert.match(d.getElementById('sanctuaryBagView').textContent,/Digi-Egg/);assert(!d.querySelector('[data-shop-item="food"]'),'Pet Meals are no longer sold');d.querySelector('[data-shop-item="egg"]').click();assert.equal(bag().coins,50);assert.equal(bag().eggs,0);assert.equal(d.querySelector('[data-shop-item="egg"]').disabled,true,'an egg costs 500 coins, so the buy button is disabled with 50');assert.equal(w.S.zeny,123);assert.equal(w.S.pets[0].sp,2);
d.querySelector('[data-shop-item="egg"]').click();assert.equal(bag().coins,50);assert.equal(bag().eggs,0);assert.equal(d.querySelector('[data-shop-item="egg"]').disabled,true,'an egg costs 500 coins, so the buy button is disabled with 50');
// Practice spar is removed; live battle wins and the roster-backed branch index remain.
assert(!d.querySelector('.sanctuary-arena'));assert(!d.querySelector('[data-sanctuary-action="startBattle"]'));assert(!/Practice spar/i.test(d.getElementById('sanctuaryGameplay').textContent));assert.equal(bag().coins,50);assert.equal(G.normalize(w.S.digimonSanctuary,line).partners[line].wins,0);assert.equal(w.S.pets[0].on,true);
nav('index');assert(!d.getElementById('sanctuaryIndexView').hidden);assert.equal(d.querySelectorAll('[data-index-form]').length,24);assert.match(d.getElementById('sanctuaryIndexStatus').textContent,/attainable forms/);assert(!/280/.test(d.getElementById('sanctuaryIndexStatus').textContent),'unattainable forms are not listed');const indexSearch=d.getElementById('sanctuaryIndexSearch');indexSearch.value='agumon';indexSearch.dispatchEvent(new w.Event('input'));const agumonEntry=d.querySelector('[data-index-form="agumon"]');assert(agumonEntry);const branches=G.evolutionOptions('agumon','agumon',0);assert(branches.length>1,'Agumon has multiple direct evolution possibilities');assert.match(agumonEntry.textContent,new RegExp('Evolves to · '+branches.length));assert.match(agumonEntry.textContent,/Evolves from · 1/);assert(agumonEntry.textContent.includes('Koromon'),'DigiDex explains how to evolve into Agumon');assert.match(agumonEntry.textContent,/BASE BATTLE · LV 1/);assert.match(agumonEntry.textContent,/HP 167/);assert.match(agumonEntry.textContent,/ATK 28/);assert(agumonEntry.textContent.includes('SPD'),'the base layer shows the per-form speed class');assert(agumonEntry.querySelector('.digidex-portrait').getAttribute('style').includes('--portrait-x:'));for(const target of branches)assert(agumonEntry.textContent.includes(G.name(target)),'DigiDex lists '+G.name(target));agumonEntry.querySelector('[data-digidex-form="greymon"]').click();assert.equal(indexSearch.value,'Greymon');assert(d.querySelector('[data-index-form="greymon"]'),'route links open the selected form');indexSearch.value='apocalymon';indexSearch.dispatchEvent(new w.Event('input'));assert(!d.querySelector('[data-index-form="apocalymon"]'),'unattainable forms are not listed in the dex at all');
nav('partners');d.querySelector('[data-open-digidex]').click();assert(!d.getElementById('sanctuaryIndexView').hidden,'the Partner evolution section links to the DigiDex');
// v351: the browse button opens the guide focused on the active partner's direct branch.
{
 const clear=d.getElementById('sanctuaryIndexBranchClear');assert(!clear.hidden,'a branch view shows its clear chip');
 const family=new Set([line,...(G.evolutionCatalog().incoming.get(line)||[]),...(G.evolutionCatalog().outgoing.get(line)||[])]);
 assert.equal(d.querySelectorAll('[data-index-form]').length,Math.min(24,family.size),'the branch view lists only the direct family');
 for(const card of d.querySelectorAll('[data-index-form]'))assert(family.has(card.dataset.indexForm),'no form outside the family is listed');
 clear.click();assert(clear.hidden,'clearing restores the full guide');assert.equal(d.querySelectorAll('[data-index-form]').length,24);
}
// v383 (owner: "digidex not working well, unable to link to the branch - I need to remove zerimon
// branch to see terriermon"): a typed name searches every attainable form, branch view or not.
{
 nav('partners');d.querySelector('[data-open-digidex]').click();
 const clear=d.getElementById('sanctuaryIndexBranchClear');assert(!clear.hidden,'the browse button still opens the partner branch');
 const catalog=G.evolutionCatalog(),family=new Set([line,...(catalog.incoming.get(line)||[]),...(catalog.outgoing.get(line)||[])]);
 const outside=[...catalog.reachable].find(id=>!family.has(id)&&G.STARTER_POOL.includes(id)===false)||[...catalog.reachable].find(id=>!family.has(id));
 assert(outside,'the roster has an attainable form outside the active partner branch');
 const search=d.getElementById('sanctuaryIndexSearch');
 search.value=G.name(outside).toLowerCase();search.dispatchEvent(new w.Event('input'));
 assert(d.querySelector('[data-index-form="'+outside+'"]'),'a searched form is found without clearing the branch scope');
 assert.match(d.getElementById('sanctuaryIndexStatus').textContent,/Searching every branch/);
 search.value='';search.dispatchEvent(new w.Event('input'));
 assert.equal(d.querySelectorAll('[data-index-form]').length,Math.min(24,family.size),'an empty query returns to the branch view');
 clear.click();
}
// v383: no duplicate minimise control, and reopening DigiPet always lands on the Partners tab.
assert(!d.getElementById('sanctuaryMin'),'the DigiPet header only offers Close, not a duplicate minimise');
nav('index');d.getElementById('sanctuaryClose').click();d.getElementById('sanctuaryOpen').click();
assert(!d.getElementById('sanctuaryPartnersView').hidden&&d.getElementById('sanctuaryIndexView').hidden,'reopening DigiPet lands on Partners');
// v383: the Mastery tab answers "what does mastery do" in plain numbers.
nav('mastery');
const masteryCopy=d.getElementById('sanctuaryMasteryView').textContent;
assert.match(masteryCopy,/\+1\.5 attack/);assert.match(masteryCopy,/Right now: \+[\d.]+ attack/);
assert.match(masteryCopy,/never spent/);
// v385: remembered evolutions are selectable in both directions and the title catalog is 3× larger.
{const raw=G.normalize(w.S.digimonSanctuary,line),p=raw.partners[line],target=G.evolutionOptions(p.form,line,p.stage)[0];assert(target,'the fresh Baby line has a direct evolution for the history UI test');p.form=target;p.stage=1;p.peakStage=1;p.unlocked=[line,target];w.S.digimonSanctuary=raw;nav('evolution');assert.equal(d.querySelectorAll('.sanctuary-unlocked-forms button').length,2);d.querySelector(`.sanctuary-unlocked-forms [data-target="${line}"]`).click();assert.equal(G.species(w.S.digimonSanctuary,line),line,'the Evolution tab can switch back to the Baby form');d.querySelector(`.sanctuary-unlocked-forms [data-target="${target}"]`).click();assert.equal(G.species(w.S.digimonSanctuary,line),target,'a remembered evolved form can be selected again');nav('titles');assert.equal(d.querySelectorAll('[data-digi-title-row]').length,36);assert.equal(d.querySelectorAll('.digi-title-progress').length,36,'the clearer compact grid gives every title a progress bar')}
nav('partners');
// v385 gear workspace: compact kind tabs, one side inspector, equip/remove from the Partner
// loadout, manual sale and future-drop auto-sell.
{
 const bagNow=()=>w.S.digimonBag;
 nav('bag');assert.match(d.getElementById('sanctuaryBagView').textContent,/Partner equipment/,'the bag shows the gear workspace');
 assert.match(d.getElementById('sanctuaryBagView').textContent,/No gear in this category/,'an empty gear bag says how drops work');
 const uid=G.gearAdd(bagNow(),{kind:'weapon',tier:2,main:{stat:'atk',value:6},special:{stat:'crit',value:1}}),hoverUid=G.gearAdd(bagNow(),{kind:'armor',tier:1,main:{stat:'def',value:3}});
 w.S.digimonBag=G.normalizeBag(bagNow());assert(uid&&hoverUid&&bagNow().gear.items[uid],'gear pieces can join the bag');
 nav('bag');let tile=d.querySelector(`[data-gear-select="${uid}"]`);assert(tile&&d.querySelector(`[data-gear-detail="${uid}"]`),'the compact tile selects one full stat inspector');
 d.querySelector(`[data-gear-select="${hoverUid}"]`).dispatchEvent(new w.Event('pointerover',{bubbles:true}));assert(d.querySelector(`[data-gear-detail="${hoverUid}"]`),'hovering another tile updates the side inspector without a click');
 d.querySelector(`[data-gear-select="${uid}"]`).click();tile=d.querySelector(`[data-gear-select="${uid}"]`);const detail=d.querySelector(`[data-gear-detail="${uid}"]`);
 assert.match(tile.textContent,/Iron (Claw|Fang|Core)/);assert.match(detail.textContent,/\+ATK 6/);
 detail.querySelector('[data-gear-action="equip"]').click();
 assert.equal(bagNow().gear.equip[line]?.weapon,uid,'equipping binds the piece to the active partner line');
 assert.match(d.querySelector(`[data-gear-detail="${uid}"]`).textContent,new RegExp('Equipped on '+G.name(G.species(w.S.digimonSanctuary,line))),'the inspector names the current evolved form, not only the Baby line');
 nav('partners');const loadout=d.querySelector('[data-partner-gear-kind="weapon"]');assert(loadout&&loadout.dataset.partnerGearUid===uid,'the Partner loadout slot identifies its exact equipped piece');loadout.click();assert(!d.getElementById('sanctuaryBagView').hidden);assert.equal(d.querySelector('.sanctuary-gear-tabs .is-selected').dataset.gearKind,'weapon');assert(d.querySelector(`[data-gear-detail="${uid}"]`),'clicking the Partner slot opens that item in its kind sub-tab');
 d.querySelector(`[data-gear-detail="${uid}"] [data-gear-action="unequip"]`).click();assert(!bagNow().gear.equip[line],'Remove frees the piece without deleting it');
 bagNow().coins=1000;nav('bag');const coinsBefore=bagNow().coins;
 d.querySelector(`[data-gear-detail="${uid}"] [data-gear-action="tier"]`).click();
 assert.equal(bagNow().coins,coinsBefore-G.FORGE_TIER_COST[1],'the Forge charges its tier-up fee');assert.equal(bagNow().gear.items[uid].tier,3);assert.equal(bagNow().gear.items[uid].main.stat,'atk');
 const refineBtn=d.querySelector(`[data-gear-detail="${uid}"] [data-gear-action="refine"]`),coinsBeforeRefine=bagNow().coins,statBefore=bagNow().gear.items[uid].main.value;refineBtn.click();assert.equal(bagNow().coins,coinsBeforeRefine-G.REFINE_COST[2]);assert.equal(bagNow().gear.items[uid].main.value,statBefore);
 const auto=d.querySelector('[data-gear-auto="1"]');auto.checked=true;auto.dispatchEvent(new w.Event('click',{bubbles:true}));assert(bagNow().gearAutoSell.includes(1),'future T1 drops can be auto-sold');
 const sellValue=G.gearSellValue(bagNow().gear.items[uid]),coinsBeforeSell=bagNow().coins;d.querySelector(`[data-gear-detail="${uid}"] [data-gear-action="sell"]`).click();assert(!bagNow().gear.items[uid]);assert.equal(bagNow().coins,coinsBeforeSell+sellValue,'manual sale pays the displayed Pet Coin value');
}
// Dismiss removes the species from the live collection, while a later hatch restores its saved form history.
{const remembered=G.species(w.S.digimonSanctuary,line),peak=G.normalize(w.S.digimonSanctuary,line).partners[line].peakStage;w.S.digimonBag.owned=[...G.STARTER_POOL];w.S.digimonBag.eggs=1;nav('partners');d.getElementById('sanctuaryDismiss').click();assert(!w.S.digimonBag.owned.includes(line));assert.equal(w.S.digimonPartner,null);nav('bag');d.querySelector('[data-bag-action="hatch"]').click();assert.equal(w.S.digimonPartner,line);assert.equal(G.species(w.S.digimonSanctuary,line),remembered);assert.equal(G.normalize(w.S.digimonSanctuary,line).partners[line].peakStage,peak,'rehatching restores the evolution history instead of resetting it')}
// Existing current/progressed partners and all four slots migrate into ownership without a new hatch.
d.getElementById('sanctuaryClose').click();w.S={cls:'Novice',eq:{},lv:1,zeny:123,pets:[],digimonPartner:'agumon',digimonPartner2:'renamon',digimonPartner3:'palmon',digimonActiveSlot:2,digimonSanctuary:{v:1,partners:{agumon:{stats:{power:3},battle:{opponent:'gabumon',hp:80,maxHp:100,enemyHp:20,enemyMaxHp:45,energy:2,turn:2,status:'active',deadline:Date.now()+90000,log:'legacy'}}}},digimonSanctuary2:{v:1,partners:{renamon:{xp:4}}},digimonSanctuary3:{v:1,partners:{palmon:{fatigue:20,fullness:60}}}};open();assert.deepEqual(Array.from(bag().owned),['agumon','renamon','palmon']);assert.equal(bag().eggs,0);assert.equal(G.normalize(w.S.digimonSanctuary,'agumon').partners.agumon.stats.power,3);assert.equal(G.normalize(w.S.digimonSanctuary,'agumon').partners.agumon.battle,null,'obsolete spar state is cleared without erasing partner progress');assert.equal(G.normalize(w.S.digimonSanctuary2,'renamon').partners.renamon.xp,4);assert.equal(G.normalize(w.S.digimonSanctuary3,'palmon').partners.palmon.energy,undefined,'legacy meter pairs are dropped with the retired meter');assert.equal(d.querySelectorAll('[data-sanctuary-pet]').length,0,'owned-form cards are gone; ownership lives in the DigiDex');assert.equal(d.querySelector('.sanctuary-partner-grid [data-partner-slot="2"]').getAttribute('aria-pressed'),'true','the third slot can be active');
// A newer bag is refused rather than silently replaced by a fresh 50-coin wallet.
d.getElementById('sanctuaryClose').click();const future={v:4,coins:999,food:4,eggs:2,owned:['agumon']};w.S.digimonBag=future;open();assert.equal(w.S.digimonBag,future);assert.match(d.getElementById('sanctuaryBagView').textContent,/newer save version/);
console.log('PASS DigiPet UI: fresh saved egg hatch into the first empty slot, four-slot migration, meter-free care, Cook Lina egg shop, branched DigiDex with owned-only view and assign, rolled-evolution panel, partner slot cards, gear equip/tier-keeps-affix/refine and branch browsing');
