const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),{ev}=g;
const doc=g.window.document;
try{
 ev("S=fresh();maybeGuide()");
 assert.equal(ev('guideTour'),'beginner');
 const steps=ev('GUIDE_LESSONS.beginner.length');
 assert.ok(steps>=5,'the first-login tour covers the current screen');
 ev("guideStep('next')");
 assert.equal(ev('S.handbook.beginnerStep'),1);
 ev("localStorage.setItem(saveKey(),JSON.stringify(S));S=load();maybeGuide()");
 assert.equal(ev('S.handbook.beginnerStep'),1);
 assert.match(ev('guideTourPanel()'),new RegExp('2 / '+steps));
 ev("guideStep('dismiss');maybeGuide()");assert.equal(ev('guideTour'),null);
 ev("S.cls='Lord Knight';S.lv=150;S.handbook={beginner:true};maybeGuide()");assert.equal(ev('guideTour'),null);
 ev("for(const n of lineOf('Lord Knight'))S.jobs[n]={jl:50,jx:0};JOB_RITE.passed='Rune Knight';changeClass('Rune Knight')");assert.equal(ev('guideTour'),'ascension');
 for(let i=0;i<ev('GUIDE_LESSONS.ascension.length');i++)ev("guideStep('next')");
 ev('maybeGuide()');assert.equal(ev('guideTour'),null);
 ev("currentUser='other-player';S=fresh();maybeGuide()");assert.equal(ev('guideTour'),'beginner');
 ev("S.handbook={beginnerStep:999};maybeGuide()");assert.match(ev('guideTourPanel()'),new RegExp(steps+' / '+steps));
 ev("S.handbook=null;maybeGuide()");assert.match(ev('guideTourPanel()'),/1 \/ /);
 for(const page of ['beginner','leveling','build','cards','ascension']){
   const html=ev(`guidePage='${page}';handbook()`);assert.ok(!html.includes('undefined'));assert.ok(html.length>1000);
 }
 ev("guideTier='normal';guidePage='cards'");assert.ok(!ev('buildGuide().includes("Astral Citadel ·")'));
 ev("guideTier='ascension'");assert.ok(!ev('buildGuide().includes("Prontera ·")'));
 const links=ev("guideTier='normal';buildGuide()").matchAll(/data-a="guidemap" data-v="(\d+):(\d+)"/g);
 for(const [,m,l] of links){assert.ok(+m<10);assert.ok(+l<=10);}
 assert.equal(ev("S.lv=1;guideReachable(0,10)===canTravel(0,10)"),true);
 // The controls must change advice, not just button state or hidden markup.
 ev("guidePage='build';guideTier='normal'");
 const plans=['farm','boss','survive'].map(mode=>ev(`guideMode='${mode}';guideBuildPlan()`));
 for(const field of ['title','stats','affixes','skills','goal'])assert.equal(new Set(plans.map(p=>p[field])).size,3,field+' changes for all goals');
 ev("S=fresh();guideTier='nightmare';guideMode='survive'");
 const nightmare=ev('buildGuide()');
 assert.match(nightmare,/N and N\+ equipment/);assert.match(nightmare,/cannot equip yet/);assert.match(nightmare,/NM [45]/);
 ev("guideTier='ascension'");const ascension=ev('buildGuide()');
 assert.match(ascension,/drop no equipment/);assert.match(ascension,/Mythic set targets for survival/);assert.match(ascension,/View recipe/);
 const recipes=['farm','boss','survive'].map(mode=>ev(`guideMode='${mode}';guideMythicTargets()`));assert.equal(new Set(recipes).size,3);

 // ---- v255: first-session checklist -------------------------------------------------
 // The beginner page opens on a live checklist rather than a wall of text, so every row has to
 // read the save and flip on its own, including the class-specific attack row.
 ev("S=fresh();S.auto=false;guidePage='beginner';S.lv=1;S.pts=10");
 const page=()=>{const d=doc.createElement('div');d.innerHTML=ev('beginnerGuide()');return d};
 let html=page();
 assert.equal(html.querySelectorAll('.guide-checklist').length,1);
 assert.equal(html.querySelectorAll('.guide-checklist li').length,7);
 assert.equal(html.querySelector('.guide-checklist header span').textContent,'0 / 7 done');
 assert.equal(html.querySelectorAll('.guide-checklist li.done').length,0);
 assert.equal(html.querySelectorAll('.guide-checklist li button').length,7,'every open row jumps to its panel');
 for(const li of html.querySelectorAll('.guide-checklist li')){
   assert.ok(li.querySelector('b').textContent.length>4);
   assert.ok(li.querySelector('small').textContent.length>20,li.querySelector('b').textContent+' explains itself');
   assert.ok(li.querySelector('button').hasAttribute('data-t')||li.querySelector('button').hasAttribute('data-a'));
 }
 assert.equal(html.querySelectorAll('.guide-chapters details').length,12,'the handbook keeps its twelve chapters');
 assert.ok(html.querySelector('.guide-chapters details').open,'the first chapter starts open');
 assert.equal(html.querySelectorAll('[data-ui-disclosure^="handbook-beginner-"]').length,12);
 // progress: points, equipment, stage, job, card and the daily spin
 ev("S.pts=0;S.st.str=30;S.prog[0]=2;S.cls='Swordman';S.eq.weapon={...S.eq.weapon,id:7};S.cards=[{id:'probe',cardKey:'poring'}];S.dailyWheel={day:trialDay(),spun:1,bonusRolls:0,lastReward:null,totalSpins:1}");
 html=page();
 assert.equal(html.querySelector('.guide-checklist header span').textContent,'6 / 7 done');
 const doneLabels=[...html.querySelectorAll('.guide-checklist li.done b')].map(x=>x.textContent);
 for(const label of ['Spend your first stat points','Equip a better weapon','Clear a stage','Choose your first job at Job 10','Get a card','Spin the daily roulette'])
   assert.ok(doneLabels.includes(label),label+' is ticked when done');
 assert.equal(html.querySelectorAll('.guide-checklist li.done em').length,6,'done rows show a tick instead of a button');
 assert.equal(html.querySelectorAll('.guide-checklist li button').length,1,'only the unfinished row keeps its button');
 ev("S.sk={aid:1,bash:1}");html=page();
 assert.equal(html.querySelector('.guide-checklist header span').textContent,'7 / 7 done');
 assert.equal(html.querySelectorAll('.guide-checklist li button').length,0,'a finished checklist hands nothing else to press');

 // ---- v255: new-player coach tips ---------------------------------------------------
 const tip=()=>doc.querySelector('#coachTip');
 const ring=()=>doc.querySelector('#coachRing');
 const click=el=>el.dispatchEvent(new g.window.MouseEvent('click',{bubbles:true}));
 ev("S=fresh();S.auto=false;S.lv=2;S.pts=10;guideTour=null;guideFindStage='';S.handbook={beginner:true};tabs.length=0;coachTipSig='';coachSync()");
 assert.ok(tip(),'unspent points earn a tip');
 assert.match(tip().textContent,/Spend your first points/);
 assert.equal(tip().dataset.direction,'up','the card sits above the dock it points at');
 assert.ok(tip().style.getPropertyValue('--pointer-x'),'the pointer tracks the anchored button');
 assert.ok(ring(),'the control the tip is about is ringed');
 assert.ok(doc.querySelector('#dock [data-t="status"]'),'the points anchor exists in the dock');
 click(tip().querySelector('[data-coach="dismiss"]'));
 assert.equal(tip(),null,'Got it closes the card');
 assert.equal(ev('coachSeen().points'),true,'the tip is remembered on this account');
 ev("coachSync()");assert.equal(tip(),null,'the next tip waits for a real change');
 ev("S.lv=5;coachSync()");assert.ok(tip(),'a change re-arms the engine');
 assert.match(tip().textContent,/free spin/,'the daily tip follows the points tip');
 assert.ok(doc.querySelector('#minimapTools #dailyBtn'),'the daily anchor exists in the header');
 // settings switch
 ev("ACT.hints('off')");
 assert.equal(ev('S.hints'),false);
 assert.equal(tip(),null,'tips off hides the card immediately');
 ev("S.pts=30;coachSync()");assert.equal(tip(),null,'and keeps it hidden');
 ev("ACT.hints('on')");assert.ok(ev('S.hints'));
 // the handbook itself is never covered
 ev("S=fresh();S.auto=false;S.lv=5;guideFindStage='';S.handbook={beginner:true};tabs.length=0;tabs.push('guide');coachTipSig='';coachSync()");
 assert.equal(tip(),null,'no tip while the guide is open');
 ev("tabs.length=0;coachTipSig='';coachSync()");assert.ok(tip());
 // past the opening levels the tip set retires itself
 ev("S=fresh();S.auto=false;S.lv=80;S.pts=40;S.handbook={beginner:true};guideFindStage='';tabs.length=0;coachTipSig='';coachSync()");
 assert.equal(tip(),null,'a high-level account gets no first-session tips');
 ev("S.lv=3;coachSync()");assert.ok(tip(),'and the same account is eligible again below Base 30');
 ev("S.lv=1");
 // accounts that never started the beginner page see nothing
 ev("S.handbook={};coachTipSig='';coachSync()");assert.equal(tip(),null);
 // a modal dialog owns the screen
 ev("S.handbook={beginner:true};S.lv=5;guideFindStage='';coachTipSig='';$('modal').style.display='flex';coachSync()");
 assert.equal(tip(),null,'no tip over a dialog');
 ev("$('modal').style.display='none';coachTipSig='';coachSync()");assert.ok(tip());
 // Go opens the panel the tip is about and clears the card
 const go=tip().querySelector('[data-coach="go"]');
 assert.match(go.textContent,/Open Character/);
 click(go);
 assert.equal(tip(),null,'Go dismisses the card');
 assert.ok(ev("tabs.includes('status')"),'Go opens Character');
 // blocked-state fingerprint: a tip that returns after an unblock still counts the same dismissal
 ev("S=fresh();S.auto=false;S.lv=5;S.handbook={beginner:true};S.hints=false;guideFindStage='';coachTipSig='';coachSync()");
 assert.equal(tip(),null);

 // Exercise the actual close -> More -> Guide path, including escaped and switched accounts.
 ev("S=fresh();tabs.length=0;maybeGuide();openTab('guide')");
 assert.equal(ev('guideFindStage'),'more');assert.ok(g.window.document.querySelector('#guideFinder'));
 assert.equal(ev('S.handbook.beginner'),true);
 g.window.document.querySelector('#dock .eclipse-more').click();
 assert.equal(ev('guideFindStage'),'guide');
 g.window.document.querySelector('#sideLinks [data-t="guide"]').click();
 assert.equal(ev('S.handbook.findGuide'),true);assert.equal(g.window.document.querySelector('#guideFinder'),null);
 ev("localStorage.setItem(saveKey(),JSON.stringify(S));S=load();tabs.length=0;maybeGuide()");assert.equal(ev('guideFindStage'),'');
 ev("S=fresh();tabs.length=0;maybeGuide();escapeUI()");assert.equal(ev('guideFindStage'),'more');
 ev("S=fresh();guideFinderSync()");assert.equal(g.window.document.querySelector('#guideFinder'),null);assert.equal(ev('S.handbook?.findGuide'),undefined);
 ev("tabs.length=0;maybeGuide();openTab('guide');guideFinderFinish();maybeGuide()");assert.equal(ev('guideFindStage'),'');
 console.log('Guide regression passed: tour persistence, completion, fourth-job gate, account isolation, malformed progress, chapters, source filters, the beginner checklist and the coach tips.');
}finally{g.close()}
