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
open();assert.equal(bag().v,2);assert.equal(bag().coins,50);assert.equal(bag().eggs,1);assert.equal(bag().owned.length,0);assert.equal(d.querySelectorAll('[data-sanctuary-pet]').length,0);assert.equal(pick.options.length,1);assert.match(d.getElementById('sanctuaryGameplay').textContent,/Hatch a Digi-Egg/);assert.equal(d.getElementById('sanctuaryTitle').textContent.trim(),'DigiPet');assert(d.querySelector('#sanctuaryTitle .digipet-logo svg'));assert.equal(d.getElementById('sanctuaryPanel').firstElementChild,d.querySelector('.sanctuary-head'),'the fixed header remains outside the scrolling content');assert(d.querySelector('.sanctuary-head #sanctuaryClose'));
nav('bag');assert(!d.getElementById('sanctuaryBagView').hidden);assert.match(d.getElementById('sanctuaryBagView').textContent,/Mystery Digi-Egg/);d.querySelector('[data-bag-action="hatch"]').click();
assert.equal(bag().eggs,0);assert.equal(bag().owned.length,1);const line=bag().owned[0];assert(G.STARTER_POOL.includes(line));assert.equal(w.S.digimonPartner,line);assert.match(d.getElementById('sanctuaryBagView').textContent,/HATCHED PARTNER/);assert(saved>0,'hatch and selection are saved');
nav('partners');assert.match(d.getElementById('sanctuaryGameplay').textContent,/10 min per session/);assert.equal(pick.value,line);assert.equal(d.querySelectorAll('[data-sanctuary-pet]').length,0,'the owned-forms card grid is retired');
// v349 panel: four partner slots, one Energy meter, no rest control and no live-battles section.
assert.equal(d.querySelectorAll('.sanctuary-partner-grid [data-partner-slot]').length,4,'four partner slot cards are offered');assert.deepEqual(Array.from(d.querySelectorAll('.sanctuary-partner-grid [data-partner-slot] .sanctuary-partner-head b'),b=>b.textContent),['Partner 1','Partner 2','Partner 3','Partner 4']);assert(d.querySelector('.sanctuary-partner-grid [data-partner-slot="0"].is-active'),'the active slot is flagged on its card');assert(d.querySelector('.sanctuary-partner-activity.is-idle'),'an unused slot shows an IDLE chip');assert.match(d.querySelector('.sanctuary-collection-note').textContent,/DigiDex/,'the partner section points to the DigiDex for species assignment');assert(d.querySelector('.sanctuary-partner-grid [data-partner-slot="1"].is-empty'),'an unused slot is an explicit empty card');
assert(!/Energy \d+\//.test(d.getElementById('sanctuaryGameplay').textContent),'the energy meter is retired');assert(!d.querySelector('[data-sanctuary-action="feed"]'),'the feed control is gone');assert(!d.querySelector('[data-sanctuary-action="rest"]'),'the removed rest control is gone');assert(!d.querySelector('.sanctuary-live-battles'),'the grind & challenge section is gone');assert(!/Grind or challenge/.test(d.getElementById('sanctuaryPanel').textContent));assert(!d.querySelector('.sanctuary-note'),'the bottom disclaimer wording is gone');// v358 (owner: "remove the restart as digi eggs button"): the restart control is gone for good.
assert(!d.querySelector('[data-sanctuary-action="requestReset"]'),'the egg-restart control is removed');assert(!d.querySelector('[data-sanctuary-action="reset"]'),'no confirm-restart control lingers');assert(d.querySelector('[data-sanctuary-action="requestEvolution"]'),'the rolled evolution control exists');
// v354: the field-grind explainer section is removed — the battle HUD carries that live.
assert(!/FIELD GRIND/.test(d.getElementById('sanctuaryGameplay').textContent),'the stages-and-bosses explainer is gone');
// Feeding and Pet Meals are retired with the meter; shopping never touches Zeny/RO pets.
nav('shop');assert.match(d.getElementById('sanctuaryShopView').textContent,/COOK LINA/);assert(!d.querySelector('[data-shop-item="food"]'),'Pet Meals are no longer sold');d.querySelector('[data-shop-item="egg"]').click();assert.equal(bag().coins,50);assert.equal(bag().eggs,0);assert.match(d.getElementById('sanctuaryMessage').textContent,/Not enough Pet Coins/);assert.equal(w.S.zeny,123);assert.equal(w.S.pets[0].sp,2);
d.querySelector('[data-shop-item="egg"]').click();assert.equal(bag().coins,50);assert.equal(bag().eggs,0);assert.match(d.getElementById('sanctuaryMessage').textContent,/Not enough Pet Coins/);
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
nav('partners');
// v351 gear: the Pet Bag owns the inventory, the Forge spends Pet Coins, and equipping is
// per partner line through the same DOM the player uses.
{
 const bagNow=()=>w.S.digimonBag;
 nav('bag');assert.match(d.getElementById('sanctuaryBagView').textContent,/Partner equipment/,'the bag shows the gear section');
 assert.match(d.getElementById('sanctuaryBagView').textContent,/No gear yet/,'an empty gear bag says how drops work');
 const uid=G.gearAdd(bagNow(),{kind:'weapon',tier:2,main:{stat:'atk',value:6},special:{stat:'crit',value:1}});
 w.S.digimonBag=G.normalizeBag(bagNow());assert(uid&&bagNow().gear.items[uid],'a gear piece can join the bag');
 nav('bag');const gearItem=d.querySelector(`[data-gear-uid="${uid}"]`);assert(gearItem,'the gear piece is listed with equip and forge actions');
 assert.match(gearItem.textContent,/Iron (Claw|Fang|Core)/);assert.match(gearItem.textContent,/\+ATK 6/);
 gearItem.querySelector('[data-gear-action="equip"]').click();
 assert.equal(bagNow().gear.equip[line]?.weapon,uid,'equipping binds the piece to the active partner line');
 assert.match(d.querySelector(`[data-gear-uid="${uid}"]`).textContent,new RegExp('On: '+G.name(w.S.digimonPartner)),'an equipped piece names its holder');
 nav('partners');assert.match(d.getElementById('sanctuaryGameplay').textContent,/EQUIPMENT/,'the care panel shows the gear build');assert.match(d.getElementById('sanctuaryGameplay').textContent,/\+ATK 6/);
 nav('bag');d.querySelector(`[data-gear-uid="${uid}"] [data-gear-action="unequip"]`).click();assert(!bagNow().gear.equip[line],'unequipping frees the piece');
 bagNow().coins=1000;nav('bag');
 const coinsBefore=bagNow().coins;
 d.querySelector(`[data-gear-uid="${uid}"] [data-gear-action="tier"]`).click();
 assert.equal(bagNow().coins,coinsBefore-G.FORGE_TIER_COST[1],'the Forge charges its tier-up fee');
 assert.equal(bagNow().gear.items[uid].tier,3,'the Forge raises the tier');
 assert.equal(bagNow().gear.items[uid].main.stat,'atk','tiering up keeps the affix identity');
 const refineBtn=d.querySelector(`[data-gear-uid="${uid}"] [data-gear-action="refine"]`);
 assert(refineBtn,'the refine action is offered');
 const coinsBeforeRefine=bagNow().coins,statBefore=bagNow().gear.items[uid].main.value;
 refineBtn.click();
 assert.equal(bagNow().coins,coinsBeforeRefine-G.REFINE_COST[2],'the Forge charges its refine fee');
 assert.equal(bagNow().gear.items[uid].main.value,statBefore,'a refine attempt never rewrites the stats');
 assert(!d.querySelector(`[data-gear-uid="${uid}"] [data-gear-action="reroll"]`),'the reroll action is retired');
}
// Existing current/progressed partners and all four slots migrate into ownership without a new hatch.
d.getElementById('sanctuaryClose').click();w.S={cls:'Novice',eq:{},lv:1,zeny:123,pets:[],digimonPartner:'agumon',digimonPartner2:'renamon',digimonPartner3:'palmon',digimonActiveSlot:2,digimonSanctuary:{v:1,partners:{agumon:{stats:{power:3},battle:{opponent:'gabumon',hp:80,maxHp:100,enemyHp:20,enemyMaxHp:45,energy:2,turn:2,status:'active',deadline:Date.now()+90000,log:'legacy'}}}},digimonSanctuary2:{v:1,partners:{renamon:{xp:4}}},digimonSanctuary3:{v:1,partners:{palmon:{fatigue:20,fullness:60}}}};open();assert.deepEqual(Array.from(bag().owned),['agumon','renamon','palmon']);assert.equal(bag().eggs,0);assert.equal(G.normalize(w.S.digimonSanctuary,'agumon').partners.agumon.stats.power,3);assert.equal(G.normalize(w.S.digimonSanctuary,'agumon').partners.agumon.battle,null,'obsolete spar state is cleared without erasing partner progress');assert.equal(G.normalize(w.S.digimonSanctuary2,'renamon').partners.renamon.xp,4);assert.equal(G.normalize(w.S.digimonSanctuary3,'palmon').partners.palmon.energy,undefined,'legacy meter pairs are dropped with the retired meter');assert.equal(d.querySelectorAll('[data-sanctuary-pet]').length,0,'owned-form cards are gone; ownership lives in the DigiDex');assert.equal(d.querySelector('.sanctuary-partner-grid [data-partner-slot="2"]').getAttribute('aria-pressed'),'true','the third slot can be active');
// A newer bag is refused rather than silently replaced by a fresh 50-coin wallet.
d.getElementById('sanctuaryClose').click();const future={v:3,coins:999,food:4,eggs:2,owned:['agumon']};w.S.digimonBag=future;open();assert.equal(w.S.digimonBag,future);assert.match(d.getElementById('sanctuaryBagView').textContent,/newer save version/);
console.log('PASS DigiPet UI: fresh saved egg hatch into the first empty slot, four-slot migration, meter-free care, Cook Lina egg shop, branched DigiDex with owned-only view and assign, rolled-evolution panel, partner slot cards, gear equip/tier-keeps-affix/refine and branch browsing');
