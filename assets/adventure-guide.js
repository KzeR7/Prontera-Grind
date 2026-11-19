/* First Adventure: client-only, account-owned onboarding. No timers or network messages. */
'use strict';
function adventureState(){
 const a=S&&guideProgress().adventure;
 return a&&a.version===1&&['active','deferred','skipped','complete'].includes(a.status)?a:null;
}
function adventureWrite(patch){
 if(!S)return;
 const a=adventureState();
 S.handbook={...guideProgress(),adventure:{...(a||{version:1,status:'active',step:'welcome'}),...patch}};
 save();
}
function adventureMaybeGuide(){
 if(!S||fourthJob())return false;
 const p=guideProgress();
 // An unknown future format is preserved. Completed legacy tours are never restarted.
 if(p.adventure&&!adventureState())return true;
 if(!adventureState()){
  if(p.beginner||p.beginnerSeen||p.beginnerHubSeen||S.cls!=='Novice'||S.lv>1||S.kills>0)return false;
  adventureWrite({});
 }
 guideTour=null;guideFindOwner=null;guideFindStage='';guideFinderClear();clearGuidePointer();
 adventureSync();return true;
}
function adventureFieldReady(){
 return !inPlazaNow()&&!hubFirstPending&&!!R&&Array.isArray(mobs)&&mobs.length>0;
}
function adventureHasAttack(){
 return SKILLS.some(s=>s.type==='act'&&s.cls.includes(S.cls)&&lv(s.id)>0);
}
function adventureHasCombo(){
 const c=S.skillCombos?.[S.cls];
 return c?.enabled!==false&&Array.isArray(c?.slots)&&c.slots.some(id=>SKILLS.some(s=>s.id===id&&s.type==='act'&&s.cls.includes(S.cls)&&skillOn(id)));
}
function adventureStep(a){
 if(!a.started)return 'welcome';
 if(!a.townSeen)return 'town';
 if(!a.fieldSeen)return 'field';
 if(!a.killSeen)return 'kill';
 if(!a.statsSeen)return 'stats';
 if(!a.gearDeferred&&!a.gearSeen)return 'gear';
 if(S.cls==='Novice')return 'job';
 if(!adventureHasAttack())return 'skill';
 if(!adventureHasCombo())return 'combo';
 return 'ready';
}
const ADVENTURE_STEPS={
 welcome:{title:'Your adventure starts here',text:'Welcome to Prontera! This town is your place to meet other players. I’ll help you find your first battle, grow stronger and choose a job.',action:'Start my adventure',run:'start',detail:'You can explore at your own pace. This companion saves your place and never spends points, chooses a job or equips items for you.'},
 town:{title:'A town to call home',text:'The Fountain Plaza is your social home. Your main character earns EXP, Zeny and equipment in the fields. Let’s try that first; town activities will be here when you return.',action:'Show me the battlefield',run:'town',detail:'Tap the ground or use arrow keys to walk. Chat is on the left. Fishing and DigiPet have their own progress; they are optional. Before your first field visit there is no measured farming rate to earn in town. After farming, town income uses your last measured field rate.'},
 field:{title:'Find your first battlefield',text:'Use Field to leave town. A new character starts at Prontera Fields, Stage 1. Your character fights automatically once the field is ready.',action:'Go to the field',run:'field',detail:'The World Map lets you choose a destination later. Travel only opens places your character can reach. This guide never resets a returning character’s saved destination.'},
 kill:{title:'Watch your first victory',text:'Watch your character attack a monster. Each victory earns Base EXP, Job EXP and Zeny, with a chance of loot. You do not need to click each attack.',action:'View the battlefield',run:'watch',detail:'Base levels grant stat points. Job levels unlock skills and promotions. Auto-advance moves to another stage after a clear; turn it off when you want to farm one place. If combat is paused, use Start combat below.'},
 stats:{title:'Make your character stronger',text:'Open Character → Stats and spend a stat point. Read each stat before choosing: STR helps physical damage, INT helps magic, and VIT helps you survive.',action:'Open Character',run:'stats',detail:'Your Novice begins with stat points. You choose how to spend them; this guide allocates nothing automatically. Later, the Your build handbook chapter compares farming, bosses and survival.'},
 gear:{title:'Turn loot into an upgrade',text:'Open Equipment → Loadout. Select an owned item, compare it with what you wear and press Equip for an improvement, then lock anything you want to keep.',action:'Open Loadout',run:'gear',detail:'Drops are random. You can continue the guide now and learn this later. Loadout shows worn and unequipped gear; Bag holds materials, consumables and loose cards; Auto-sell controls future drops. Read selling rules carefully before enabling them.'},
 job:{title:'Choose your first job',text:'Keep farming until Novice reaches Job 10, then open Class Tree and choose a path. Your Job level is separate from your Base level.',action:'Open Class Tree',run:'job',detail:'Swordman: close-range combat. Thief: agile melee. Mage: magic. Archer: ranged attacks. Merchant: a merchant-themed combat path. Acolyte: holy and support skills. Inspect each class before choosing. Previously played classes keep their own progression and equipment.'},
 skill:{title:'Learn your first attack',text:'Open Skills, select an attack and learn a rank with Job points. Then place learned attacks in the combo slots in the order you want them to fire.',action:'Open Skills',run:'skill',detail:'Attacks are marked separately from passive, buff and healing skills. Up to six attacks run in order, followed by recovery. Buffs cast independently. Check that an attack is enabled and assigned to your combo; learning it and arranging the combo are separate choices.'},
 combo:{title:'Put your attack to work',text:'In Skills, choose a learned attack for a combo slot. Enable the combo and the attack’s Auto cast control so your character can use it.',action:'Set up my combo',run:'combo',detail:'Combo slots cast from left to right, followed by recovery. Start with one attack and add more as you learn them. A learned attack that is paused or absent from the combo does not satisfy this lesson.'},
 ready:{title:'You’re ready to explore',text:'You have seen combat, spent points, chosen a job and learned an attack. Your next goal: compare an equipment upgrade and find a field you can clear reliably.',action:'Finish first adventure',run:'finish',detail:'Open World Map to inspect your next destination. Watch EXP/min and survival before moving into tougher fights. Return to the Social Hub whenever you want a break. Your handbook keeps the detailed routes, builds and feature explanations.'}
};
const ADVENTURE_ORDER=Object.keys(ADVENTURE_STEPS);
function adventureRecordKill(){
 const a=adventureState();
 // Only a live field kill counts. Offline/AFK income never calls this hook.
 if(a&&a.status==='active'&&a.started&&a.townSeen&&!inPlazaNow()&&!a.killSeen)
  adventureWrite({fieldSeen:true,killSeen:true});
}
function adventureOpen(tab){
 if(!tabs.includes(tab))openTab(tab);
 if(tab==='status')sub.status='stats';
 if(tab==='equip')sub.equip='equip0';
 if(tab==='skills')sub.skills='skilllist';
 renderWin();
}
function adventureAction(action){
 if(!S)return;
 let a=adventureState();
 if(action==='handbook'){
  guideTour=null;guidePage='beginner';adventureOpen('guide');return;
 }
 if(action==='resume'){
  // Preserve unknown formats; replay means explaining the current character, not resetting it.
  if(guideProgress().adventure&&!a)return;
  adventureWrite({status:'active'});guideTour=null;
  tabs.length=0;
  renderWin();return;
 }
 if(!a)return;
 if(action==='later'||action==='skip'){
  adventureWrite({status:action==='later'?'deferred':'skipped'});
 }else if(action==='start'&&a.step==='welcome')adventureWrite({started:true});
 else if(action==='town'&&a.step==='town')adventureWrite({townSeen:true});
 else if(action==='gear-later'&&a.step==='gear')adventureWrite({gearDeferred:true});
 else if(action==='finish'&&a.step==='ready'){
  adventureWrite({status:'complete'});
  // Honour existing once-ever markers and prevent the old tour reopening after completion.
  S.handbook={...guideProgress(),beginner:true,beginnerSeen:true,beginnerHubSeen:true};save();
 }else if(action==='field'||action==='watch'){
  if(inPlazaNow())guideGoField();
  else {tabs.length=0;renderWin();}
 }else if(action==='combat'){
  if(!inPlazaNow()&&S.auto===false){S.auto=true;save();ui();}
 }else if(['stats','gear','job','skill','combo'].includes(action)){
  adventureOpen({stats:'status',gear:'equip',job:'job',skill:'skills',combo:'skills'}[action]);return;
 }
 adventureSync();
}
function adventureSync(){
 let root=document.getElementById('adventureGuide');
 const a=adventureState();
 if(!S||!currentUser||!a||a.status==='complete'||a.status==='skipped'){
  document.querySelectorAll('.adventure-target').forEach(el=>el.classList.remove('adventure-target'));
  if(root)root.remove();return;
 }
 if(a.status==='active'){
  const patch={};
  if(a.started&&a.townSeen&&!a.fieldSeen&&adventureFieldReady())patch.fieldSeen=true;
  if(!a.statsSeen&&ptsSpent()>0)patch.statsSeen=true;
  if(!a.gearSeen&&items().some(it=>it&&it.id!==1))patch.gearSeen=true;
  const next=adventureStep({...a,...patch});if(next!==a.step)patch.step=next;
  if(Object.keys(patch).length)adventureWrite(patch);
 }
 const state=adventureState(),step=ADVENTURE_STEPS[state.step]||ADVENTURE_STEPS.welcome;
 const n=ADVENTURE_ORDER.indexOf(state.step),compact=state.status==='deferred'||tabs.length>0||guideTour||TRIAL.on||JOB_RITE.on;
 if(!root){root=document.createElement('aside');root.id='adventureGuide';root.setAttribute('aria-label','First Adventure companion');document.body.append(root);}
 root.classList.toggle('is-compact',!!compact);
 // Keep confirmation, offline claims and social activity windows above the companion.
 root.hidden=!!document.querySelector('#socialHub [role="dialog"]:not([hidden]),#sanctuaryPanel:not([hidden])');
 document.querySelectorAll('.adventure-target').forEach(el=>el.classList.remove('adventure-target'));
 const target={field:'#socialLeave',stats:'#dock [data-t="status"]',gear:'#dock [data-t="equip"]',job:'#dock [data-t="job"]',skill:'#dock [data-t="skills"]',combo:'#dock [data-t="skills"]'}[state.step];
 if(state.status==='active'&&!root.hidden&&target)document.querySelector(target)?.classList.add('adventure-target');
 const html=compact?`<button class="adventure-resume" data-adventure="resume"><span aria-hidden="true">✦</span> ${state.status==='deferred'?'Resume first adventure':'First adventure · '+(n+1)+' / '+ADVENTURE_ORDER.length}</button>`:
 `<div class="adventure-heading"><span class="adventure-seal" aria-hidden="true">✦</span><div><small>ADVENTURER’S GUILD</small><b>First Adventure</b></div><span class="adventure-count">${n+1} / ${ADVENTURE_ORDER.length}</span></div>
 <div class="adventure-track" role="progressbar" aria-label="First adventure" aria-valuemin="0" aria-valuemax="${ADVENTURE_ORDER.length}" aria-valuenow="${n}"><i style="width:${n/ADVENTURE_ORDER.length*100}%"></i></div>
 <div class="adventure-copy"><span class="adventure-announcement" role="status" aria-live="polite">Step ${n+1}: ${step.title}</span><h2 tabindex="-1">${step.title}</h2><p>${step.text}</p>
 ${state.step==='job'?`<p class="adventure-hint">Novice Job ${S.jobs?.Novice?.jl||1} / 10 · Keep farming to earn Job EXP.</p>`:''}
 ${state.step==='field'&&!inPlazaNow()&&!adventureFieldReady()?'<p class="adventure-hint">Waiting for the battlefield to load. If it stays blank, use the game’s graphics recovery notice.</p>':''}
 <details><summary>Tell me more</summary><p>${step.detail}</p></details>
 <button class="adventure-primary" data-adventure="${step.run}">${step.action}<span aria-hidden="true"> →</span></button>
 ${state.step==='kill'&&S.auto===false?'<button data-adventure="combat">Start combat</button>':''}
 ${state.step==='gear'?'<button data-adventure="gear-later">Continue; learn equipment later</button>':''}
 <div class="adventure-links"><button data-adventure="handbook">Detailed handbook</button><button data-adventure="later">${state.step==='welcome'?'Explore first':'Pause guide'}</button></div>
 <details class="adventure-dismiss"><summary>Guide options</summary><button data-adventure="skip">Skip this guide</button><p>Resume any time from Guide → Beginner. Your character’s progress is kept.</p></details></div>`;
 // Patch only on a real change, preserving focus and open explanations during combat refreshes.
 if(root._adventureHTML!==html){
  const opened=[...root.querySelectorAll('details')].map(d=>d.open),focus=root.contains(document.activeElement)?document.activeElement.dataset.adventure:null;
  root.innerHTML=html;root._adventureHTML=html;
  root.querySelectorAll('details').forEach((d,i)=>{d.open=!!opened[i]});
  if(focus)(root.querySelector(`[data-adventure="${focus}"]`)||root.querySelector('h2'))?.focus({preventScroll:true});
 }
}
function adventureHandbook(){
 const a=adventureState(),label=a?.status==='complete'?'Revisit first adventure':a?.status==='skipped'?'Start skipped adventure':'Resume first adventure';
 return `<section class="adventure-handbook"><small>YOUR NEXT STEP</small><h2>Town → Battle → Your first job</h2><p>Start with one battle, make one improvement, then choose the job you want to grow. There is no need to learn every system on your first visit.</p><button data-adventure="resume">${label}</button>
 <ol class="adventure-roadmap">${ADVENTURE_ORDER.slice(1,-1).map(id=>`<li><b>${ADVENTURE_STEPS[id].title}</b><span>${ADVENTURE_STEPS[id].text}</span></li>`).join('')}</ol>
 <h3>Your town, at a glance</h3><p>These activities are optional. Main-character combat and DigiPet combat are separate systems.</p>
 <div class="adventure-town-grid"><article><b>Chat & friends</b><p>Use World chat to talk across the game, Local for your plaza and Whisper for a private conversation. Select a player’s name to find social actions.</p></article><article><b>Fishing</b><p>Use Fishing in the plaza toolbar and visit the lake. Cast and reel to collect fish. Fishing has its own bag, coins, rods and bait.</p></article><article><b>DigiPet Sanctuary</b><p>Use DigiPet for your companion roster, care, training and battles. Its eggs and progression belong to DigiPets; main-character field pets come from monster drops.</p></article><article><b>Returning to the field</b><p>Use Field to return to your saved destination. Before your first field visit you have no measured field income; after farming, town earnings use your measured field rate.</p></article></div>
 <p class="adventure-hint">Need a reminder? Open Guide (H) → Beginner in the field. In town, use the Guide button. You can pause the companion without losing your place.</p></section>`;
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-adventure]');if(!b||b.disabled)return;
 e.preventDefault();adventureAction(b.dataset.adventure);
});
