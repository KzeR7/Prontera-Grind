/* Map → Rift Raid client. Combat intents go through the authenticated Pages API; the browser
   never reports damage, outcome, reward rolls or upgrade success. */
(function(){
'use strict';
const state={account:null,rules:null,day:'',error:'',notice:'',loading:false,busy:'',busyId:0,lastFetchAt:0,lastAccountId:0,accountEpoch:0,loadEpoch:0,previewToken:'',lastOutcome:null,liveRun:null,clockOffset:0,settling:new Set(),deadlineRetryAt:new Map()};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>Math.max(0,Math.floor(Number(value)||0)).toLocaleString('en-US');
const idFor=()=>globalThis.crypto?.randomUUID?.()||('raid-action-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12));
const fire=refreshCombat=>{try{globalThis.dispatchEvent(new Event('pg-raid-ui-change'));if(refreshCombat)globalThis.dispatchEvent(new Event('pg-raid-atk-change'))}catch{}};
const beginBusy=kind=>{const id=++state.busyId;state.busy=kind;fire();return id};
const finishBusy=id=>{if(state.busyId===id){state.busy='';fire()}};
const userId=()=>Number(state.account?.userId||state.lastAccountId||0);
function currentRun(){return state.liveRun||state.account?.activeRun||null}
function actor(){const run=currentRun(),id=userId();return run?.members?.find(m=>Number(m.id)===id)||null}
function setLiveRun(run){
 if(!run||typeof run!=='object')return;
 state.liveRun=run;
 if(Number.isFinite(Number(run.serverNow)))state.clockOffset=Number(run.serverNow)-Date.now();
 if(state.account)state.account.activeRun=run;
 fire();
 if(['cleared','failed'].includes(run.state))settle(run.id);
}
async function readResponse(response){
 const data=await response.json().catch(()=>({err:'Invalid Rift Raid response.'}));
 if(!response.ok)throw Object.assign(new Error(data.err||'Rift Raid request failed.'),{status:response.status,data});
 return data;
}
async function getState(force=false){
 if(state.loading&&!force)return state.loading;
 if(!force&&Date.now()-state.lastFetchAt<60000)return state.account;
 const accountEpoch=state.accountEpoch,loadEpoch=++state.loadEpoch;
 const request=(async()=>{
  try{
   const response=await fetch('/api/raid',{method:'GET',credentials:'same-origin',cache:'no-store',headers:state.previewToken?{'X-Preview-Session':state.previewToken}:{}}),data=await readResponse(response);
   if(accountEpoch!==state.accountEpoch||loadEpoch!==state.loadEpoch)return null;
   if(state.lastAccountId&&Number(data.account?.userId)!==state.lastAccountId)throw new Error('The signed-in account changed. Reload the Map before using raid upgrades.');
   state.account=data.account||null;state.rules=data.rules||null;state.day=data.day||'';state.error='';state.lastFetchAt=Date.now();
   if(data.settlement){state.lastOutcome=data.settlement;state.notice=data.settlement.outcome==='clear'?'Timed clear settled. Rewards are in your Rift Raid account and cloud gift queue.':'Failed attempt settled. Your Pity Chest is in your Rift Raid account and cloud gift queue.';try{globalThis.dispatchEvent(new Event('pg-raid-rewards'))}catch{}}
   state.liveRun=data.account?.activeRun||null;
   if(Number.isFinite(Number(state.liveRun?.serverNow)))state.clockOffset=Number(state.liveRun.serverNow)-Date.now();
   fire(true);
   if(['cleared','failed'].includes(state.liveRun?.state))settle(state.liveRun.id);
   return state.account;
  }catch(error){if(accountEpoch!==state.accountEpoch||loadEpoch!==state.loadEpoch)return null;state.error=String(error?.message||error);state.lastFetchAt=Date.now();fire();return null}
  finally{if(accountEpoch===state.accountEpoch&&loadEpoch===state.loadEpoch){state.loading=false;fire()}}
 })();
 state.loading=request;return request;
}
async function post(body){
 const response=await fetch('/api/raid',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(state.previewToken?{'X-Preview-Session':state.previewToken}:{})},body:JSON.stringify(body)});
 const data=await response.json().catch(()=>({err:'Invalid Rift Raid response.'}));
 if(!response.ok)throw Object.assign(new Error(data.err||'Rift Raid request failed.'),{status:response.status,data});
 return data;
}
function showReward(result){
 if(!result)return;
 state.lastOutcome=result;state.error='';
 state.notice=result.outcome==='clear'?'Timed clear settled. Rewards are in your Rift Raid account and cloud gift queue.':'Failed attempt settled. Your Pity Chest is in your Rift Raid account and cloud gift queue.';
 try{globalThis.dispatchEvent(new Event('pg-raid-rewards'))}catch{}
 fire();
}
async function settle(runId){
 const id=String(runId||''),epoch=state.accountEpoch;if(!id||!userId()||state.settling.has(id))return;
 state.settling.add(id);const busyId=beginBusy('settle');
 try{const result=await post({action:'settle',runId:id});if(epoch!==state.accountEpoch)return;showReward(result);await getState(true)}
 catch(error){if(epoch!==state.accountEpoch)return;state.error=String(error?.message||error);if(error.data?.run)setLiveRun(error.data.run);fire()}
 finally{if(epoch===state.accountEpoch){state.settling.delete(id);finishBusy(busyId)}}
}
async function start(mode){
 if(state.busy)return;const epoch=state.accountEpoch;state.error='';state.notice='';const busyId=beginBusy('start');
 try{const result=await post({action:'start',mode});if(epoch!==state.accountEpoch)return;state.notice='Raid entries reserved for every participant. Opening the encounter…';state.liveRun=null;await getState(true);if(epoch===state.accountEpoch&&!state.account?.activeRun&&result.runId)state.error='The run was reserved. Refresh the Challenge panel to restore or resume it.'}
 catch(error){if(epoch!==state.accountEpoch)return;state.error=String(error?.message||error);await getState(true)}
 finally{if(epoch===state.accountEpoch)finishBusy(busyId)}
}
async function act(action,button){
 const run=currentRun();if(!run?.id||state.busy)return;const epoch=state.accountEpoch;
 state.error='';const busyId=beginBusy('act');
 const root=button?.closest('.rift-raid-run'),zone=root?.querySelector('[data-raid-zone]')?.value||'center',targetId=Number(button?.dataset.targetId||root?.querySelector('[data-raid-target]')?.value)||userId();
 try{
  const result=await post({action:'act',runId:run.id,combatAction:action,actionId:idFor(),zone,targetId});if(epoch!==state.accountEpoch)return;
  if(result.run)setLiveRun(result.run);
  if(result.settlement)showReward(result.settlement);
  if(result.run&&['cleared','failed'].includes(result.run.state))await settle(result.run.id);
 }catch(error){if(epoch!==state.accountEpoch)return;state.error=String(error?.message||error);if(error.data?.run){setLiveRun(error.data.run);if(['cleared','failed'].includes(error.data.run.state))await settle(error.data.run.id)}else if(error.status>=500)await getState(true)}
 finally{if(epoch===state.accountEpoch)finishBusy(busyId)}
}
async function upgrade(weaponId){
 if(state.busy)return;const epoch=state.accountEpoch;state.error='';const busyId=beginBusy('upgrade');
 try{const result=await post({action:'upgrade',weaponId:String(weaponId),actionId:idFor()});if(epoch!==state.accountEpoch)return;state.notice=result.success?'Upgrade succeeded: '+result.starBefore+'★ → '+result.starAfter+'★.':'Upgrade failed; the weapon kept '+result.starAfter+'★. The attempt cost '+fmt(result.cost)+' Rift Shards.';await getState(true)}
 catch(error){if(epoch!==state.accountEpoch)return;state.error=String(error?.message||error);if(error.status>=500)await getState(true)}
 finally{if(epoch===state.accountEpoch)finishBusy(busyId)}
}
async function equipCosmetic(kind,id){
 if(state.busy)return;const epoch=state.accountEpoch;state.error='';const busyId=beginBusy('cosmetic');
 try{
  const result=await post({action:'equip',kind,id:id==='none'?null:String(id)});if(epoch!==state.accountEpoch)return;
  if(state.account){state.account.equippedAura=result.equippedAura||null;state.account.equippedTitle=result.equippedTitle||null}
  const label=kind==='aura'?'Rift aura':'Rift title';state.notice=id==='none'?label+' unequipped.':label+' equipped.';
  await getState(true);
 }catch(error){if(epoch!==state.accountEpoch)return;state.error=String(error?.message||error);if(error.status>=500)await getState(true)}
 finally{if(epoch===state.accountEpoch)finishBusy(busyId)}
}
function raidTitleProgress(title,account){
 const count=Math.max(0,Number(account.qualifyingClears)||0),solo=Math.max(0,Number(account.soloClears)||0),trio=Math.max(0,Number(account.trioClears)||0),support=Math.max(0,Number(account.supportClears)||0);
 if(title.rule==='first-clear')return count?'1 / 1 timed clear':'0 / 1 timed clear';
 if(title.rule==='clears')return fmt(Math.min(count,Number(title.value)||0))+' / '+fmt(title.value)+' timed clears';
 if(title.rule==='solo-clear')return (solo?'1':'0')+' / 1 solo clear';
 if(title.rule==='trio-clear')return (trio?'1':'0')+' / 1 trio clear';
 if(title.rule==='support-clear')return (support?'1':'0')+' / 1 support clear';
 return 'Raid achievement';
}
function renderCosmeticRows(kind,items,unlocked,equipped,account){
 return items.map(item=>{
  const has=unlocked.includes(item.id),worn=equipped===item.id,color=/^#[0-9a-f]{6}$/i.test(String(item.color||''))?item.color:'#b7c4cc';
  const progress=has?'Unlocked':kind==='aura'?fmt(Math.min(Number(account.qualifyingClears)||0,Number(item.clears)||0))+' / '+fmt(item.clears)+' timed clears':raidTitleProgress(item,account);
  const button=has?'<button type="button" data-raid-ui="equip" data-kind="'+kind+'" data-id="'+(worn?'none':esc(item.id))+'" aria-pressed="'+worn+'" '+(state.busy?'disabled':'')+'>'+(worn?'Unequip':'Equip')+'</button>':'<button type="button" disabled>Locked</button>';
  return '<article class="rift-raid-cosmetic" style="--raid-cosmetic-color:'+color+'"><span class="rift-raid-cosmetic-mark" aria-hidden="true">'+(kind==='aura'?'✧':'✦')+'</span><div><b>'+esc(item.name)+'</b><small>'+esc(progress)+'</small></div>'+button+'</article>';
 }).join('');
}
function renderCosmetics(account,rules){
 const titles=Array.isArray(rules.titles)?rules.titles:[],auras=Array.isArray(rules.auras)?rules.auras:[];
 const titleCount=(account.titles||[]).length,auraCount=(account.auras||[]).length;
 return '<section class="rift-raid-cosmetics"><header><small>RAID WARDROBE · COSMETIC ONLY</small><h3>Titles &amp; auras</h3><p>Earn titles and sigils from timed clears. Equip one title and aura; they add no combat stats and appear in the field and Fountain Plaza. A worn Rift aura replaces the level-milestone sigil until unequipped.</p></header><div class="rift-raid-cosmetic-columns"><div><h4>Titles <small>'+titleCount+' / '+titles.length+' unlocked</small></h4><div class="rift-raid-cosmetic-list">'+renderCosmeticRows('title',titles,account.titles||[],account.equippedTitle,account)+'</div></div><div><h4>Auras <small>'+auraCount+' / '+auras.length+' unlocked</small></h4><div class="rift-raid-cosmetic-list">'+renderCosmeticRows('aura',auras,account.auras||[],account.equippedAura,account)+'</div></div></div></section>';
}
function raidCosmeticLook(){
 const account=state.account||{},rules=state.rules||{},titles=Array.isArray(account.titles)?account.titles:[],auras=Array.isArray(account.auras)?account.auras:[];
 const title=titles.includes(account.equippedTitle)?rules.titles?.find(x=>x.id===account.equippedTitle):null;
 const aura=auras.includes(account.equippedAura)?rules.auras?.find(x=>x.id===account.equippedAura):null;
 return {titleId:title?.id||'',title:title?.name||'',titleColor:title?.color||'',auraId:aura?.id||'',auraColor:aura?.color||'',auraPattern:aura?.pattern||''};
}
function attackBonus(weaponId){
 const id=String(weaponId??'');return Number(state.account?.weapons?.find(w=>String(w.id)===id)?.atkBonus)||0;
}
function rewardSummary(row){
 const p=row||{},bits=[];
 if(p.riftShards)bits.push(fmt(p.riftShards)+' Rift Shards');
 if(p.sigils)bits.push(fmt(p.sigils)+' Valkyrie’s Sigils');
 if(p.regionalMaterials)bits.push(fmt(p.regionalMaterials)+' Astral Shards');
 if(p.zeny)bits.push(fmt(p.zeny)+' Zeny');
 if(p.cardCopies)bits.push(fmt(p.cardCopies)+' Rift Sovereign Card');
 return bits.join(' · ')||'No item quantities recorded';
}
function renderOutcome(){
 const result=state.lastOutcome;if(!result)return '';
 return '<section class="rift-raid-result" role="status"><b>'+esc(result.outcome==='clear'?'Timed clear settled':'Failed attempt settled')+'</b>'+
  (Array.isArray(result.rewards)?result.rewards.map(r=>'<p><span>'+esc(r.kind==='clear'?'Full-clear pool':r.kind==='fractured'?'Fractured Chest':'Pity Chest')+'</span><strong>'+esc(rewardSummary(r))+'</strong></p>').join(''):'')+'</section>';
}
function renderRun(){
 const run=currentRun();if(!run)return '';
 const own=actor(),ratio=run.totalHp>0?Math.max(0,Math.min(100,(1-Number(run.hpRemaining||0)/Number(run.totalHp))*100)):0;
 const phase=Math.max(0,Math.min((run.phaseNames||[]).length-1,Number(run.phaseIndex)||0));
 const hazard=run.hazard,canAct=run.state==='active'&&!state.busy,reviveTarget=(run.members||[]).find(m=>m.hp<=0&&m.id!==own?.id),canDodge=!!hazard&&Number(hazard.endsAt)>Date.now()+state.clockOffset&&own?.dodgeHazardId!==hazard.id;
 const targetOptions=(run.members||[]).map(m=>'<option value="'+Number(m.id)+'" '+(Number(m.id)===Number(own?.id)?'selected':'')+'>'+esc(m.name)+(m.hp<=0?' · DOWN':'')+'</option>').join('');
 const members=(run.members||[]).map(m=>'<li class="'+(m.hp<=0?'is-down':'')+'"><span><b>'+esc(m.name)+'</b><small>'+fmt(m.hp)+' / '+fmt(m.maxHp)+' HP · '+fmt(m.damage)+' damage · '+fmt(m.support)+' support</small></span><strong>'+(m.hp<=0?'DOWN':'UP')+'</strong></li>').join('');
 const controls=run.state==='active'?
  '<div class="rift-raid-controls"><div class="rift-raid-action-grid">'+
   '<button type="button" data-raid-ui="act" data-action="strike" '+(!canAct||!own||own.hp<=0?'disabled':'')+'>Strike</button>'+
   '<button type="button" data-raid-ui="act" data-action="heavy" '+(!canAct||!own||own.hp<=0?'disabled':'')+'>Heavy Strike</button>'+
   '<label>Lane<select data-raid-zone><option value="left">Left</option><option value="center" selected>Center</option><option value="right">Right</option></select></label>'+
   '<button type="button" data-raid-ui="act" data-action="dodge" '+(!canAct||!own||own.hp<=0||!canDodge?'disabled':'')+'>Dodge to lane</button>'+
   '<label>Target<select data-raid-target>'+targetOptions+'</select></label>'+
   '<button type="button" data-raid-ui="act" data-action="heal" '+(!canAct||!own||own.hp<=0?'disabled':'')+'>Mend · 25% HP</button>'+
   '<button type="button" data-raid-ui="act" data-action="ward" '+(!canAct||!own||own.hp<=0?'disabled':'')+'>Aegis Ward</button>'+
   '<button type="button" data-raid-ui="act" data-action="revive" '+(reviveTarget?'data-target-id="'+Number(reviveTarget.id)+'" ':'')+(!canAct||!own||own.hp<=0||!reviveTarget?'disabled':'')+'>Revive teammate</button>'+
  '</div><small>Actions resolve on the server. Strike has a 5-second recovery; Heavy Strike has a 15-second recovery. No raid tick messages or alarm are used.</small></div>':
  '<p class="rift-raid-ended">'+(state.busy==='settle'?'Recording the D1 settlement…':run.state==='cleared'?'Boss defeated before the deadline.':'The attempt ended without a timed clear.')+'</p>';
 return '<section class="rift-raid-run" data-run-id="'+esc(run.id)+'"><header><div><small>LIVE ENCOUNTER · '+Number(run.partySize||1)+' PLAYER'+(Number(run.partySize)===1?'':'S')+'</small><h3>'+esc((run.phaseNames||[])[phase]||'The Rift Sovereign')+'</h3></div><strong class="rift-raid-clock" data-raid-clock data-deadline="'+Number(run.deadlineAt||0)+'">—</strong></header>'+
  '<div class="rift-raid-bossbar"><div><span>Boss integrity</span><b>'+fmt(run.hpRemaining)+' / '+fmt(run.totalHp)+'</b></div><i><span style="width:'+ratio.toFixed(2)+'%"></span></i></div>'+
  (hazard?'<div class="rift-raid-hazard" role="status"><b>'+esc(hazard.kind==='rift-sweep'?'Rift Sweep':'Fracture Slam')+'</b> · danger lanes: '+esc((hazard.dangerZones||[]).join(', '))+' · dodge window <time data-raid-hazard="'+Number(hazard.endsAt||0)+'">—</time></div>':'')+
  (run.liveError?'<p class="rift-raid-error">'+esc(run.liveError)+' The room will retry when you refresh.</p>':'')+
  '<ul class="rift-raid-members">'+members+'</ul>'+controls+'</section>';
}
function renderWeapons(){
 const weapons=state.account?.weapons||[];if(!weapons.length)return '<section class="rift-raid-upgrades"><header><small>MYTHIC WEAPON ADD-ON</small><h3>20★ Rift Tempering</h3></header><p>No Mythic weapons are present in your current cloud save. The add-on is item-bound and Mythic-only.</p></section>';
 return '<section class="rift-raid-upgrades"><header><small>MYTHIC-ONLY · ITEM-BOUND</small><h3>20★ Rift Tempering</h3></header><p>Each star adds <b>+1% weapon ATK everywhere</b> and <b>+0.5% armor penetration against raid armor</b> (capped at +10%). Failed attempts spend Rift Shards but never remove a star; attempt three at the same star is guaranteed.</p><div class="rift-raid-weapon-list">'+weapons.map(w=>{
  const max=Number(w.stars)>=20,cost=Number(w.nextCost)||0,chance=Number(w.nextChance)||0,affordable=Number(state.account?.riftShards)>=cost;
  return '<article><div><b>'+esc(w.name)+'</b><small>'+esc(w.type)+' · +'+Number(w.refine||0)+' refine · '+fmt(w.atk)+' base ATK</small></div><strong>'+Number(w.stars||0)+'★ / 20★</strong><small>ATK add-on +'+Math.round(Number(w.atkBonus||0)*100)+'% · raid penetration +'+Math.round(Number(w.raidArmorPen||0)*1000)/10+'%</small>'+
   (max?'<span class="rift-raid-max">MAXIMUM</span>':'<button type="button" data-raid-ui="upgrade" data-weapon-id="'+esc(w.id)+'" '+(state.busy||!affordable?'disabled':'')+'>Attempt +1 · '+fmt(cost)+' Shards · '+Math.round(chance*100)+'%</button><small>Consecutive failures: '+Number(w.failures||0)+'/2 before guarantee</small>')+'</article>';
 }).join('')+'</div><small>Derived schedule: about '+Number(state.rules?.upgradeExpectedSpend||0).toFixed(3)+' Rift Shards expected from 0★ to 20★, including failed attempts.</small></section>';
}
function render(){
 if(userId()&&Date.now()-state.lastFetchAt>60000&&!state.loading)getState(true);
 const account=state.account,rules=state.rules||{},run=account?.activeRun||currentRun();
 const entries=account?.entriesLeft??0,partyStart=partyStartState(account);
 const full=(rules.fullClear||{}),pity=(rules.pityChest||{}),fractured=(rules.fracturedChest||{});
 return '<section class="rift-raid-destination" role="region" aria-label="Rift Raid challenge"><header class="rift-raid-hero"><small>CHALLENGE · PLAYER-CHARACTER CO-OP</small><h2>The Rift Sovereign</h2><p>A timed, action-driven raid for your character—not a DigiPet battle or field-combat mode. Start solo, or form a separate Rift Raid party in the Social Hub.</p></header>'+
  '<div class="rift-raid-content">'+
   (state.error?'<p class="rift-raid-error" role="alert">'+esc(state.error)+'</p>':'')+(state.notice?'<p class="rift-raid-notice" role="status">'+esc(state.notice)+'</p>':'')+
   (state.loading&&!account?'<p class="rift-raid-note">Loading your D1 raid account…</p>':'')+
   (account?'<div class="rift-raid-overview"><article><small>RIFT SHARDS</small><b>'+fmt(account.riftShards)+'</b><span>Separate from Echo Shards</span></article><article><small>ENTRIES TODAY</small><b>'+Number(account.entriesLeft)+' / '+Number(rules.dailyEntries||2)+'</b><span>'+Number(account.entriesUsed)+' reserved · reset at Malaysia midnight</span></article><article><small>RIFT SOVEREIGN CARD</small><b>'+Number(account.bossCardCopies||0)+' copies · '+Number(account.cardRank||0)+'★</b><span>Raid armor penetration +'+Math.round((Number(account.cardArmorPen)||0)*100)+'% · Card pity '+esc(account.cardPityLabel||'0/30')+'</span></article><article><small>CHESTS TODAY</small><b>'+Number(account.chestsToday?.pity||0)+' Pity · '+Number(account.chestsToday?.fractured||0)+' Fractured</b><span>No daily chest cap</span></article></div>':'')+
   (account?renderCosmetics(account,rules):'')+
   (run?renderRun():'<section class="rift-raid-entry"><header><small>ENTER THE RIFT</small><h3>Two entries per player, per Malaysia day</h3><p>A party start reserves one entry for every member. Start is transactional: either all entries are reserved or none are.</p></header><div class="rift-raid-entry-buttons"><button type="button" data-raid-ui="start" data-mode="solo" '+(!account||entries<1||state.busy?'disabled':'')+'>Start solo · 5-minute timer</button><button type="button" data-raid-ui="start" data-mode="party" title="'+esc(partyStart.note)+'" '+(!account||entries<1||state.busy||!partyStart.canStart?'disabled':'')+'>Start Social party'+(partyStart.members?' · '+partyStart.ready+'/'+partyStart.members+' ready':'')+' · 6-minute timer</button></div><button type="button" class="rift-raid-social-link" data-raid-ui="open-social">Open Social Hub · Rift Raid party</button><small>Party starts require the leader of a 2–3 player Rift Raid party created in Social. Every member must ready up; each roster member also needs a current cloud save and one remaining entry. '+esc(partyStart.note)+'</small></section>')+
   '<section class="rift-raid-rewards"><header><small>TUNABLE V1 REWARD PROPOSAL</small><h3>Clear and chest rewards</h3></header><p><b>Timed full clear:</b> '+fmt(full.riftShards||10)+' Rift Shards base, a 50% chance at +'+fmt(full.bonusRiftShards?.amount||10)+', '+fmt(full.sigils||4)+' Valkyrie’s Sigils, '+fmt(full.regionalMaterials||2)+' Astral Shards and '+fmt(full.zeny||1000000)+' Zeny. Stackable Shards, Sigils and Astral Shards in clears and chests get +10% duo / +20% trio (fractional amounts round stochastically); Zeny and card odds do not change.</p><p><b>Fractured Chest:</b> '+fmt(fractured.riftShards||5)+' Rift Shards, '+fmt(fractured.sigils||2)+' Sigils, '+fmt(fractured.regionalMaterials||1)+' Astral Shard and '+fmt(fractured.zeny||250000)+' Zeny for every timed kill, with the stackable party bonus.</p><p><b>Pity Chest:</b> '+fmt(pity.riftShards||10)+' Rift Shards, '+fmt(pity.sigils||2)+' Sigils, '+fmt(pity.regionalMaterials||1)+' Astral Shard and '+fmt(pity.zeny||250000)+' Zeny for every failed attempt, with the stackable party bonus.</p><p><b>Rift Sovereign Card:</b> '+Math.round(Number(rules.cardChance??.05)*100)+'% per timed clear, guaranteed by the '+fmt(rules.cardPity||30)+'th clear without a drop. Copies are delivered to Bag → Cards as bound, non-socketable collection cards; every awarded copy counts toward the raid account’s automatic penetration bonus.</p><small>Reward quantities are initial balance recommendations. Zeny, Sigils and Astral Shards use the existing cloud gift queue; Rift Shards live in the separate raid account.</small></section>'+
   renderWeapons()+renderOutcome()+'</div></section>';
}
function openSocialParty(){globalThis.PGSocial?.raidOpen?.()}
function partyStartState(account){
 const party=globalThis.PGSocial?.app?.raidParty||null,members=Array.isArray(party?.members)?party.members:[],ready=members.filter(m=>m.ready===true).length;
 const selfId=Number(account?.userId||0),member=members.some(m=>Number(m?.id)===selfId),leader=selfId>0&&member&&Number(party?.leader)===selfId,full=members.length>=2&&members.length<=3,allReady=full&&ready===members.length;
 const activeRun=account?.activeRun||state.liveRun,rosterEligible=!!(party&&party.open===true&&leader&&allReady),hasEntry=Number(account?.entriesLeft||0)>0,canStart=rosterEligible&&hasEntry&&!activeRun&&!state.busy;
 let note='Create or join a party in Social Hub first.';
 if(party){if(party.open!==true)note='This party is already running.';else if(!leader)note='Only the party leader can start the group run.';else if(!full)note='A group run needs 2–3 members.';else if(!allReady)note=ready+'/'+members.length+' ready — every member must ready up.';else if(!account)note='Load your Rift Raid account before starting.';else if(!hasEntry)note='You have no daily raid entries left.';else if(activeRun)note='Finish or settle your current Rift Raid first.';else if(state.busy)note='Wait for the current Rift Raid request to finish.';else note='All '+members.length+' members are ready. The leader may start.'}
 return{canStart,ready,members:members.length,note};
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-raid-ui]');if(!b)return;e.preventDefault();e.stopPropagation();
 const action=b.dataset.raidUi;
 if(action==='start')return start(b.dataset.mode==='party'?'party':'solo');
 if(action==='upgrade')return upgrade(b.dataset.weaponId);
 if(action==='equip')return equipCosmetic(b.dataset.kind,b.dataset.id||'none');
 if(action==='act')return act(b.dataset.action,b);
 if(action==='open-social')return openSocialParty();
});
function receiveRun(run){
 const id=userId();if(!id||!run||typeof run.id!=='string'||!Array.isArray(run.members)||!run.members.some(m=>Number(m.id)===id))return;
 if(state.account&&!state.account.activeRun)state.account.activeRun=run;
 setLiveRun(run);
}
function setAccount(id,name){
 const next=Number(id)||0,changed=next!==state.lastAccountId;
 if(changed){state.accountEpoch++;state.loadEpoch++;state.loading=false;state.busyId++;state.busy='';state.settling=new Set();state.deadlineRetryAt.clear();state.clockOffset=0;
  state.account=null;state.rules=null;state.day='';state.error='';state.notice='';state.lastOutcome=null;state.liveRun=null;state.lastFetchAt=0;state.lastAccountId=next}
 if(!next){state.account=null;state.liveRun=null;state.lastFetchAt=0;state.error='';state.notice='';if(changed)fire(true);return}
 // Start the new account's load before notifying renderers; a synchronous render must see it as
 // pending instead of issuing a duplicate initial fetch.
 getState(true);if(changed)fire(true);
}
function setPreviewToken(token){state.previewToken=typeof token==='string'?token:''}
function clearAccount(){setPreviewToken('');setAccount(0,'')}
function tick(){
 const run=currentRun();if(!run||run.state!=='active')return;
 const clock=document.querySelector('[data-raid-clock]');
 const left=Math.max(0,Number(run.deadlineAt||0)-(Date.now()+state.clockOffset));
 if(clock){const seconds=Math.ceil(left/1000);clock.textContent=seconds>0?Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'00:00';clock.classList.toggle('is-urgent',seconds<=30)}
 const hazard=document.querySelector('[data-raid-hazard]');if(hazard){const sec=Math.max(0,Number(hazard.dataset.raidHazard)-(Date.now()+state.clockOffset));hazard.textContent=(sec/1000).toFixed(1)+'s'}
 if(left<=0&&Date.now()>Number(state.deadlineRetryAt.get(run.id)||0)){state.deadlineRetryAt.set(run.id,Date.now()+15000);settle(run.id)}
}
setInterval(tick,1000);
globalThis.PGRaidUI={render,refresh:()=>getState(true),startParty:()=>start('party'),partyStartStatus:()=>partyStartState(state.account),attackBonus,raidCosmeticLook,receiveRun,setAccount,setPreviewToken,clearAccount,get account(){return state.account},_state:state};
})();
