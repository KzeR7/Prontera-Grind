// Real field handlers + social UI, with the existing headless renderer harness.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createGame}=require('./helpers/game');
const game=createGame(),w=game.window,d=w.document,ev=game.ev;
try{
 w.setInterval=fn=>{if(fn.name==='battleUITick')w.battleTick=fn;return 0};
 for(const file of ['digimon/roster.js','digimon/base-stats.js','social-rules.js','digimon-sanctuary.js','digimon-battle.js','social-poker.js','social.js'])w.eval(fs.readFileSync('assets/'+file,'utf8'));
 const hub=d.getElementById('socialHub');hub.hidden=false;d.body.classList.add('social-open');w.PGSocial.app.wanted=true;
 ev("S.digimonPartner='agumon';S.digimonSanctuary=PGDigimonSanctuary.normalize(null,'agumon');S.digimonBag=PGDigimonSanctuary.normalizeBag(null,['agumon']);hubFirstPending=false");
 const click=id=>d.getElementById(id).click();
 click('socialMore');assert.equal(d.getElementById('socialMore').getAttribute('aria-expanded'),'true');
 const links=[...d.querySelectorAll('[data-hub-tab]')].map(b=>b.dataset.hubTab);
 assert(links.includes('equip')&&links.includes('skills')&&links.includes('friends')&&links.includes('set'));
 assert(!links.includes('gm'),'normal accounts cannot open GM through More');
 d.querySelector('[data-hub-sub=refine]').click();
 assert.equal(ev('sub.equip'),'refine');assert.deepEqual(Array.from(ev('tabs')),['equip']);assert.equal(hub.hidden,false,'refine stays in the hub');
 assert(d.querySelector('#wins [data-win=equip]'),'real equipment window rendered');
 click('sanctuaryOpen');assert.equal(d.getElementById('sanctuaryPanel').hidden,false);assert.equal(ev('tabs.length'),0,'DigiPet replaces field management');
 assert.equal(d.querySelectorAll('[data-partner-slot]').length,4);assert(d.getElementById('sanctuaryHero'));assert.equal(d.querySelectorAll('.sanctuary-gauge').length,4);
 for(const view of ['index','bag','evolution','mastery','titles','partners']){d.querySelector('[data-sanctuary-view='+view+']').click();assert.equal(d.getElementById('sanctuary'+({index:'Index',bag:'Bag',evolution:'Evolution',mastery:'Mastery',titles:'Titles',partners:'Partners'}[view])+'View').hidden,false)}
 assert(d.querySelector('#sanctuaryTitlesView .digi-title'),'the Titles tab renders the title rows');
 assert(!d.getElementById('sanctuaryGameplay').querySelector('.digi-title'),'titles no longer render inside the Partners view');
 {const css=fs.readFileSync('assets/social.css','utf8');assert(css.includes('background-size:1920px 1344px'),'the 96px dex portrait shows exactly one 64px sheet cell');assert(css.includes('background-size:600px 420px'),'tree-node faces use single-cell math too');}
 {d.querySelector('[data-sanctuary-view=partners]').click();const panel=d.getElementById('sanctuaryActivityPanel');assert(panel.querySelector('[data-sap-tab=party]'),'the merged training panel has a Party overview tab');}
 click('socialPartyBtn');assert(d.getElementById('sanctuaryPanel').hidden);assert(!d.getElementById('socialPartyPanel').hidden);
 click('socialMiniMap');assert(d.getElementById('socialPartyPanel').hidden);assert(!d.getElementById('socialMapModal').hidden);
 click('socialMore');assert(d.getElementById('socialMapModal').hidden);
 const tick=()=>{for(let i=0;i<4;i++)w.battleTick()};
 // v390: the card prints the MEASURED plaza rate (plazaFarmIncome) - the value the plaza actually
 // pays - not the live #expmin/#zenymin HUD samplers. Those reset to 0 after HUD_IDLE_RESET (30s)
 // without a kill, which is how a paying plaza came to read "0 EXP/min" to a standing player.
 const seedRate=`S.offlineIncome={version:1,rewardVersion:6,key:S.cls+":"+S.mp+":"+S.lvl,at:Date.now(),xp:12300,zeny:456,job:10,kills:1}`;
 d.getElementById('expmin').textContent='12.3k';d.getElementById('zenymin').textContent='456';
 ev(seedRate);tick();
 assert.equal(d.getElementById('socialFieldExp').textContent,'12,300','the card shows the measured EXP/min');
 assert.equal(d.getElementById('socialFieldZeny').textContent,'456','the card shows the measured Zeny/min');

 // A stale 0 in the live sampler must never zero a paying card - the exact v390 bug.
 d.getElementById('expmin').textContent='0';d.getElementById('zenymin').textContent='0';tick();
 assert.equal(d.getElementById('socialFieldExp').textContent,'12,300','a stale HUD sampler cannot zero the card');

 // With NO measured rate a hub-first account is "Field not started" and shows a dash - it must not
 // claim the plaza is earning before a real field minute exists.
 ev('S.offlineIncome=null;hubFirstPending=true;respawn=1e9');tick();assert.equal(d.getElementById('socialFieldState').textContent,'Field not started');assert.equal(d.getElementById('socialFieldExp').textContent,'—');
 ev('S.offlineIncome={version:1,rewardVersion:1,key:S.cls+":"+S.mp+":"+S.lvl,at:Date.now(),xp:100,zeny:50,job:10}');tick();assert.equal(d.getElementById('socialFieldState').textContent,'Plaza AFK');
 // v392: a LOST connection keeps the plaza earning and says so; a write GATE is what genuinely pauses.
 ev('hubFirstPending=false;CLOUD.lost=true');tick();
 assert.equal(d.getElementById('socialFieldState').textContent,'Plaza AFK · awaiting connection','a dropped socket is named, and still earning');
  // (the rate in force here is the 100/50 fixture seeded above, not the 12300/456 one)
 assert.equal(d.getElementById('socialFieldZeny').textContent,'50','and the rate stays on screen');
 ev('CLOUD.lost=false;CLOUD.gate=true');tick();
 assert.equal(d.getElementById('socialFieldState').textContent,'Field paused','a write gate still pauses');
 assert.equal(d.getElementById('socialFieldZeny').textContent,'—');
 ev('CLOUD.gate=false');ev(seedRate);tick();assert.equal(d.getElementById('socialFieldExp').textContent,'12,300','the rate returns once the connection does');
 const mini=d.getElementById('socialMiniMapCanvas'),ctx=mini.getContext('2d');let painted=0;ctx.fillRect=()=>painted++;mini.getContext=()=>ctx;w.BGM={phoneShell:()=>true};tick();assert(painted>0,'a phone-first hub paints its top minimap too');
 const world=d.querySelector('[data-channel=world]');w.PGSocial.syncDisplay();assert.equal(d.querySelector('[data-channel=world]'),world,'chat buttons remain stable');
 w.PGSocial.select('whisper');assert(!d.getElementById('socialTo').hidden);click('socialMin');assert(d.getElementById('socialChat').classList.contains('minimized'));
 console.log('PASS Afterdark: real More/refine routing, four partner views, exclusive management panels, native portrait, gauges, truthful shared rates and stable chat controls');
}finally{game.close()}
