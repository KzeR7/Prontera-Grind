const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),{ev}=g;
try{
 ev("S=fresh();maybeGuide()");
 assert.equal(ev('guideTour'),'beginner');
 ev("guideStep('next')");
 assert.equal(ev('S.handbook.beginnerStep'),1);
 ev("localStorage.setItem(saveKey(),JSON.stringify(S));S=load();maybeGuide()");
 assert.equal(ev('S.handbook.beginnerStep'),1);
 assert.match(ev('guideTourPanel()'),/2 \/ 4/);
 ev("guideStep('dismiss');maybeGuide()");assert.equal(ev('guideTour'),null);
 ev("S.cls='Lord Knight';S.lv=150;S.handbook={beginner:true};maybeGuide()");assert.equal(ev('guideTour'),null);
 ev("for(const n of lineOf('Lord Knight'))S.jobs[n]={jl:50,jx:0};JOB_RITE.passed='Rune Knight';changeClass('Rune Knight')");assert.equal(ev('guideTour'),'ascension');
 for(let i=0;i<5;i++)ev("guideStep('next')");
 ev('maybeGuide()');assert.equal(ev('guideTour'),null);
 ev("currentUser='other-player';S=fresh();maybeGuide()");assert.equal(ev('guideTour'),'beginner');
 ev("S.handbook={beginnerStep:999};maybeGuide()");assert.match(ev('guideTourPanel()'),/4 \/ 4/);
 ev("S.handbook=null;maybeGuide()");assert.match(ev('guideTourPanel()'),/1 \/ 4/);
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
 console.log('Guide regression passed: tour persistence, completion, fourth-job gate, account isolation, malformed progress, chapters and source filters.');
}finally{g.close()}
