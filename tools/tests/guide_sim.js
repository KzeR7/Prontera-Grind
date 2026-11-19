const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),{ev}=g;
const doc=g.window.document;
try{
 ev("S=fresh();maybeGuide()");
 assert.equal(ev('guideTour'),'beginner');
 // v404: the tour is split by where the player is standing. In the field it is the field
 // lessons; in the plaza it opens with the plaza lessons and leads them out. The old test
 // counted GUIDE_LESSONS.beginner, which is now both halves plus the plaza ones.
 const steps=ev('guideVisibleSteps("beginner").length');
 assert.ok(steps>=4,'the first-login tour covers the current screen');
 ev("guideStep('next')");
 assert.equal(ev('S.handbook.beginnerStepId'),'points');
 assert.equal(ev('S.handbook.beginnerStep'),1);
 ev("localStorage.setItem(saveKey(),JSON.stringify(S));S=load();maybeGuide()");
 assert.equal(ev('S.handbook.beginnerStepId'),'points');
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
 // haven-v417: the Ascension maps drop equipment now (Astral the Nightmare tier, Thor the Mythic
 // tier), so the guide says what they pay instead of promising no equipment at all.
 assert.doesNotMatch(ascension,/drop no equipment/);
 // haven-v432 (PR #257 design): both maps drop new N+ weapons only and Mythic gear is crafted, never dropped.
 assert.match(ascension,/new N\+ weapons only/);assert.match(ascension,/Mythic items are crafted only in Equipment/);
 assert.match(ascension,/Mythic set targets for survival/);assert.match(ascension,/View recipe/);
 const recipes=['farm','boss','survive'].map(mode=>ev(`guideMode='${mode}';guideMythicTargets()`));assert.equal(new Set(recipes).size,3);

 // ---- v404: the beginner tour starts in the plaza and leads to the field ------------------
 // Owner: "when players login they are teleported into plaza, there are no guide whatsoever
 // to guide them to the field. the old guide only start in the field not plaza."
 // The tour used to be the else-branch of the plaza login, so the plaza skipped it entirely.
 ev("S=fresh();S.handbook={};guideTour=null;document.body.classList.add('social-open');maybeGuide()");
 assert.equal(ev('guideTour'),'beginner','the guide opens in the plaza, where the player lands');
 const plazaSteps=ev('guideVisibleSteps("beginner").map(s=>s.id).join(",")');
 assert.equal(plazaSteps,'hub,hub-tour,hub-field','the plaza gets the plaza lessons only');
 assert.ok(ev('GUIDE_LESSONS.beginner.filter(s=>s.hub).every(s=>s.pointer||s.act)'),
   'every plaza lesson points at something that exists in the plaza');
 // The dock is hidden in the plaza, so no plaza lesson may point at it.
 assert.ok(ev('GUIDE_LESSONS.beginner.filter(s=>s.hub).every(s=>!String(s.pointer||"").includes("#dock"))'),
   'no plaza lesson rings a dock button that the hub hides');
 assert.match(ev('guideTourPanel()'),/1 \/ 3/,'the plaza tour counts its own lessons');
 ev("guideStep('next')");
 assert.equal(ev('S.handbook.beginnerStepId'),'hub-tour','Next advances instead of travelling');
 ev("guideStep('next')");
 assert.equal(ev('S.handbook.beginnerStepId'),'hub-field');
 assert.ok(ev('guideTourPanel().includes("Go to the field")'),'the last plaza lesson offers the trip');
 // Pressing it travels rather than retiring the tour.
 ev("guideStep('next')");
 assert.equal(ev('guideTour'),'beginner','the tour survives the trip');
 assert.notEqual(ev('S.handbook.beginnerSeen'),true,'it does not mark the field half as read');
 // Arriving in the field picks the field lessons up from the top.
 ev("document.body.classList.remove('social-open');guideHubResume()");
 assert.equal(ev('guideTour'),'beginner','the tour continues on arrival');
 assert.equal(ev('S.handbook.beginnerStepId'),'combat');
 assert.equal(ev('guideVisibleSteps("beginner").map(s=>s.id).join(",")'),'combat,points,gear,job,hub2',
   'the field gets the field lessons, starting where the travel left off');
 assert.match(ev('guideTourPanel()'),/1 \/ 5/);
 // Finishing the field half retires the tour for good.
 for(let i=0;i<6;i++)ev("guideStep('next')");
 assert.equal(ev('guideTour'),null);
 assert.equal(ev('S.handbook.beginnerSeen'),true);
 ev("S.handbook={...S.handbook,beginnerHubSeen:true};maybeGuide()");
 assert.equal(ev('guideTour'),null,'a finished beginner tour never reopens by itself');
 // Back in the plaza, a player who finished the field half long ago still gets the new
 // plaza lessons once - that is the whole point of the separate marker.
 ev("S.handbook={beginner:true,beginnerSeen:true};guideTour=null;document.body.classList.add('social-open');maybeGuide()");
 assert.equal(ev('guideTour'),'beginner','the plaza lessons are new, so they are shown once');
 ev("guideStep('dismiss');maybeGuide()");
 assert.equal(ev('guideTour'),null,'and only once');
 // A mid-plaza dismissal must not retire the field half, and vice versa.
 ev("S.handbook={};guideTour=null;maybeGuide();guideStep('dismiss')");
 assert.equal(ev('S.handbook.beginnerHubSeen'),true,'dismissing in the plaza marks only the plaza half');
 assert.equal(ev('S.handbook.beginnerSeen'),undefined);
 ev("document.body.classList.remove('social-open');maybeGuide()");
 assert.equal(ev('guideTour'),'beginner','the field half is still owed');

 // ---- v255: first-session checklist -------------------------------------------------
 // The beginner page opens on a live checklist rather than a wall of text, so every row has to
 // read the save and flip on its own, including the class-specific attack row.
 ev("S=fresh();S.auto=false;guidePage='beginner';S.lv=1;S.pts=10");
 const page=()=>{const d=doc.createElement('div');d.innerHTML=ev('beginnerGuide()');return d};
 let html=page();
 // The row count is read from the checklist itself: it gained a "Learn an attack skill" row
 // and this test kept asserting the old magic 7, so it failed on every build regardless of the
 // code under test. Counting the source keeps the intent (every row is live and pressable)
 // without pinning a number that the checklist legitimately grows past.
 const rows=ev('beginnerChecklist().length');
 assert.ok(rows>=7,'the first-session checklist covers the opening moves');
 assert.equal(html.querySelectorAll('.guide-checklist').length,1);
 assert.equal(html.querySelectorAll('.guide-checklist li').length,rows);
 assert.equal(html.querySelector('.guide-checklist header span').textContent,'0 / '+rows+' done');
 assert.equal(html.querySelectorAll('.guide-checklist li.done').length,0);
 assert.equal(html.querySelectorAll('.guide-checklist li button').length,rows,'every open row jumps to its panel');
 for(const li of html.querySelectorAll('.guide-checklist li')){
   assert.ok(li.querySelector('b').textContent.length>4);
   assert.ok(li.querySelector('small').textContent.length>20,li.querySelector('b').textContent+' explains itself');
   assert.ok(li.querySelector('button').hasAttribute('data-t')||li.querySelector('button').hasAttribute('data-a'));
 }
 // Derived, not pinned: the handbook grew to thirteen chapters and the literal 12 made this
 // fail on every build. The intent is that every chapter is a real disclosure and the first
 // one opens.
 const chapters=html.querySelectorAll('.guide-chapters details').length;
 assert.ok(chapters>=12,'the handbook keeps its chapters');
 assert.ok(html.querySelector('.guide-chapters details').open,'the first chapter starts open');
 assert.equal(html.querySelectorAll('[data-ui-disclosure^="handbook-beginner-"]').length,chapters,
   'every chapter is a real disclosure');
 // progress: points, equipment, stage, job, card and the daily spin
 ev("S.pts=0;S.st.str=30;S.prog[0]=2;S.cls='Swordman';S.eq.weapon={...S.eq.weapon,id:7};S.cards=[{id:'probe',cardKey:'poring'}];S.dailyWheel={day:trialDay(),spun:1,bonusRolls:0,lastReward:null,totalSpins:1}");
 html=page();
 assert.equal(html.querySelector('.guide-checklist header span').textContent,(rows-1)+' / '+rows+' done');
 const doneLabels=[...html.querySelectorAll('.guide-checklist li.done b')].map(x=>x.textContent);
 for(const label of ['Spend your first stat points','Equip a better weapon','Clear a second stage','Choose your first job at Job 10','Get a card','Spin the daily roulette'])
   assert.ok(doneLabels.includes(label),label+' is ticked when done');
 assert.equal(html.querySelectorAll('.guide-checklist li.done em').length,rows-1,'done rows show a tick instead of a button');
 assert.equal(html.querySelectorAll('.guide-checklist li button').length,1,'only the unfinished row keeps its button');
 ev("S.sk={aid:1,bash:1}");html=page();
 assert.equal(html.querySelector('.guide-checklist header span').textContent,rows+' / '+rows+' done');
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
 // ---- v404: every login path has to actually reach the guide --------------------------
 // The unit tests above call maybeGuide() directly, so they pass even when the login flow
 // never calls it - which is exactly the bug the owner reported. These assertions read the
 // source and check the call sites, because the call site IS the bug.
 {
   const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','..','index.html'),'utf8');
   // The plaza login used to be `if(hubFirstPending){PGSocial.enter()} else maybeGuide()`,
   // so the plaza - the screen every login opens since v363 - skipped the guide entirely.
   assert.ok(!/PGSocial\.enter\(\)[^\n]*\n\s*else if\(typeof maybeGuide/.test(src),
     'the guide is not the else-branch of the plaza login');
   assert.ok(/PGSocial\.enter\(\).*\n\s*if\(typeof maybeGuide==='function'\)maybeGuide\(\);/.test(src),
     'the plaza login opens the guide too');
   // The cloud login path never called it at all.
   const cloud=src.slice(src.indexOf('await cloudPull();')-600,src.indexOf('await cloudPull();'));
   assert.ok(/maybeGuide/.test(cloud),'the cloud login path opens the guide');
   // The plaza lessons must be reachable without the legacy beginner flag, or a returning
   // player whose save says beginner:true would never be shown the new lessons.
   assert.ok(/p\.beginner!==true\|\|plazaLesson/.test(src),
     'the plaza lessons do not depend on the legacy beginner flag');
   // The tour must survive the trip to the field.
   assert.ok(/guideHubResume/.test(src),'arriving at the field resumes the tour');
 }
 console.log('Guide regression passed: tour persistence, completion, fourth-job gate, account isolation, malformed progress, chapters, source filters, the beginner checklist and the coach tips.');
}finally{g.close()}
