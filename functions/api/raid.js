// Player-character Rift Raid API.
// D1 owns daily entries, rewards, weapon stars and idempotent settlement. The existing Social DO
// owns only action-driven live combat state; raids add no alarm, timer loop or per-tick messages.
import { currentUser } from '../_lib/auth.js';
import { json, guard, readJson, fail, unauth } from '../_lib/http.js';
import { saveBelongsTo } from '../_lib/validate.js';
import * as db from '../_lib/db.js';
import {
  RAID_RULES, raidTotalHp, raidPhaseHp, rollRaidClear, rollPityChest, rollFracturedChest,
  raidCardPityLabel, raidCardRank, raidCardArmorPen, raidWeaponArmorPen, raidWeaponAtkBonus,
  raidStarCost, raidStarChance, rollRaidStarUpgrade, expectedRaidStarSpend, raidMeaningful, raidDayKey,
} from '../_lib/raid-rules.js';

const now = () => Date.now();
const dayKey = at => raidDayKey(at);
const int = (n,lo=0,hi=Number.MAX_SAFE_INTEGER) => Math.max(lo,Math.min(hi,Math.floor(Number(n)||0)));
const number = (n,lo=0,hi=Number.MAX_SAFE_INTEGER) => Math.max(lo,Math.min(hi,Number.isFinite(Number(n))?Number(n):lo));
const safeJson = value => { try { const x=JSON.parse(String(value||'{}'));return x&&typeof x==='object'&&!Array.isArray(x)?x:{} } catch { return {} } };
const idString = v => typeof v==='string'&&v.length>0&&v.length<=80&&/^[A-Za-z0-9:_-]+$/.test(v);
const actionString = v => typeof v==='string'&&v.length>=8&&v.length<=100&&/^[A-Za-z0-9:_-]+$/.test(v);
const installed = D => db.raidTablesInstalled(D);

async function socialRequest(env,path,user,method='GET',body=null){
  if(!env.SOCIAL||typeof env.SOCIAL.idFromName!=='function')return {ok:false,status:503,data:{err:'The raid room is unavailable in this preview.'}};
  try{
    const stub=env.SOCIAL.get(env.SOCIAL.idFromName('world'));
    const headers={'X-Social-Identity':JSON.stringify({id:user.id,username:user.username})};
    let request;
    if(body!==null){headers['Content-Type']='application/json';request=new Request('https://social'+path,{method,headers,body:JSON.stringify(body)})}
    else request=new Request('https://social'+path,{method,headers});
    const response=await stub.fetch(request),data=await response.json().catch(()=>({err:'Invalid raid room response'}));
    return {ok:response.ok,status:response.status,data};
  }catch(error){console.error('Raid Social request failed',error);return {ok:false,status:503,data:{err:'The raid room could not be reached.'}}}
}

function equipmentList(save){
  const list=[],seen=new Set();
  for(const [slot,it] of Object.entries(save?.eq||{}))if(it&&typeof it==='object'&&it.slot==='weapon'&&it.id!=null){
    const id=String(it.id);if(!seen.has(id)){seen.add(id);list.push({...it,_equippedSlot:slot})}
  }
  for(const it of Array.isArray(save?.inv)?save.inv:[])if(it&&typeof it==='object'&&it.slot==='weapon'&&it.id!=null){
    const id=String(it.id);if(!seen.has(id)){seen.add(id);list.push(it)}
  }
  return list;
}
function mythicWeapons(save){return equipmentList(save).filter(it=>Number(it.sec)===6&&typeof it.wt==='string'&&it.wt.length<=24)}
function weaponById(save,weaponId){return mythicWeapons(save).find(it=>String(it.id)===String(weaponId))||null}
function saveItemId(it){return it?.id==null?'':String(it.id)}
function savedProfile(save,weapon,weaponUpgrade,cardCopies){
  const level=int(save?.lv,1,150),st=save?.st&&typeof save.st==='object'?save.st:{};
  const stat=(key)=>number(st[key],1,120);
  const r=int(weapon?.r,0,15),stars=int(weaponUpgrade?.stars,0,20),val=number(weapon?.val,0,100000);
  // This raid-only server snapshot approximates the existing ATK sheet formula. It is bounded
  // against edited save blobs, frozen at entry, and uses the same item-bound ATK add-on as the Map.
  const weaponAtk=val*(1+r*.15)*(1+raidWeaponAtkBonus(stars));
  const attack=(4+level*2+weaponAtk+stat('str')*1.5+(stat('dex')+stat('luk'))*.25);
  const atkPct=number((Array.isArray(weapon?.aff)?weapon.aff:[]).filter(a=>a&&a.k==='atk').reduce((n,a)=>n+number(a.v,0,300),0),0,300);
  const dps=Math.max(25_000,Math.min(650_000,Math.round(attack*(1+atkPct/100)*60)));
  const eq=save?.eq&&typeof save.eq==='object'?save.eq:{};
  const head=number(eq.head?.val,0,100000),acc=number(eq.acc1?.val,0,100000)+number(eq.acc2?.val,0,100000);
  const hpAff=Object.values(eq).filter(Boolean).flatMap(it=>Array.isArray(it.aff)?it.aff:[]).filter(a=>a&&a.k==='hp').reduce((n,a)=>n+number(a.v,0,100000)*2,0);
  const maxHp=Math.max(1000,Math.min(1e9,Math.round((80+level*20+head*4+acc*3+stat('vit')*8+hpAff)*(1+number(save?.pv?.hpp,0,500)/100))));
  const weaponPen=raidWeaponArmorPen(stars),cardPen=Number(cardCopies)>0?raidCardArmorPen(cardCopies):0;
  return {dps,maxHp,armorPen:Math.min(.8,weaponPen+cardPen),weaponId:saveItemId(weapon),weaponStars:stars};
}
function publicAccount(account,userId,entriesUsed,chests,titles,auras,activeRun,weapons){
  const a=account||{};
  return {
    userId:Number(userId),riftShards:int(a.rift_shards),bossCardCopies:int(a.boss_card_copies),cardRank:raidCardRank(a.boss_card_copies),
    cardArmorPen:raidCardArmorPen(a.boss_card_copies),cardPity:int(a.card_pity,0,29),cardPityLabel:raidCardPityLabel(a.card_pity),
    qualifyingClears:int(a.qualifying_clears),soloClears:int(a.solo_clears),trioClears:int(a.trio_clears),supportClears:int(a.support_clears),
    equippedAura:a.equipped_aura||null,equippedTitle:a.equipped_title||null,
    entriesUsed,entriesLeft:Math.max(0,RAID_RULES.dailyEntries-entriesUsed),
    chestsToday:{total:int(chests?.total),pity:int(chests?.pity),fractured:int(chests?.fractured)},
    titles:titles.map(x=>x.title_id),auras:auras.map(x=>x.aura_id),weapons,
    activeRun:activeRun||null,
  };
}
function weaponListFor(save,rows){
  const upgrades=new Map(rows.map(x=>[String(x.weapon_id),x]));
  return mythicWeapons(save).map(it=>{
    const u=upgrades.get(String(it.id)),stars=int(u?.stars,0,20);
    return {id:String(it.id),name:String(it.name||it.wt||'Mythic Weapon').slice(0,80),type:String(it.wt),refine:int(it.r,0,15),atk:int(it.val,0,1e7),stars,failures:int(u?.failures,0,2),maxStars:20,
      atkBonus:raidWeaponAtkBonus(stars),raidArmorPen:raidWeaponArmorPen(stars),nextCost:raidStarCost(stars),nextChance:stars>=20?0:raidStarChance(stars)};
  });
}
function parseSocialRun(data){return data?.run&&typeof data.run==='object'?data.run:null}

function installPayload(run,rows){
  return {id:run.id,leaderId:Number(run.leader_id),partySize:Number(run.party_size),totalHp:Number(run.total_hp),phaseHps:raidPhaseHp(Number(run.total_hp)),
    phaseNames:RAID_RULES.phaseNames,startedAt:Number(run.started_at),deadlineAt:Number(run.deadline_at),bossArmor:.30,
    members:(rows.results||[]).map(x=>({id:Number(x.user_id),name:String(x.display_name||'Adventurer').slice(0,32),profile:safeJson(x.profile_json)}))};
}
async function socialRunSnapshot(env,user,run){
  let remote=await socialRequest(env,'/raid/snapshot',user,'POST',{runId:run.id});
  if(!remote.ok&&remote.status===404){
    const roster=await db.raidRunMembers(env.DB,run.id),payload=installPayload(run,roster);
    const restored=await socialRequest(env,'/raid/restore',user,'POST',payload);
    if(restored.ok)remote=await socialRequest(env,'/raid/snapshot',user,'POST',{runId:run.id});
    else remote=restored;
  }
  return remote;
}

async function settleRun(env,user,runId){
  const D=env.DB,run=await db.raidRun(D,runId);
  if(!run)return {ok:false,status:404,data:{err:'Raid run not found.'}};
  const member=await db.raidRunMember(D,runId,user.id);
  if(!member)return {ok:false,status:403,data:{err:'You were not part of this raid.'}};
  const previous=await db.raidSettlement(D,runId);
  if(previous){const rows=await db.raidRewardsForUser(D,runId,user.id);return {ok:true,status:200,data:{ok:true,outcome:previous.outcome,rewards:rows.results.map(r=>({kind:r.kind,...safeJson(r.payload)}))}}}
  const remote=await socialRunSnapshot(env,user,run);
  if(!remote.ok)return remote;
  const snapshot=parseSocialRun(remote.data);
  if(!snapshot||snapshot.id!==runId||snapshot.partySize!==run.party_size||snapshot.totalHp!==run.total_hp)return {ok:false,status:409,data:{err:'Raid state did not match its D1 record.'}};
  if(!['cleared','failed'].includes(snapshot.state))return {ok:false,status:409,data:{ok:false,active:true,run:snapshot}};
  const settledAt=now(),isClear=snapshot.state==='cleared',finishedAt=Number(snapshot.finishedAt);
  if(isClear&&(snapshot.hpRemaining!==0||Number(snapshot.startedAt)!==Number(run.started_at)||Number(snapshot.deadlineAt)!==Number(run.deadline_at)||!Number.isFinite(finishedAt)||finishedAt<Number(run.started_at)||finishedAt>Number(run.deadline_at)||finishedAt>settledAt))
    return {ok:false,status:409,data:{err:'This clear did not finish within the raid time limit.'}};
  if(!isClear&&snapshot.hpRemaining<=0)return {ok:false,status:409,data:{err:'Invalid failed-run state.'}};
  const roster=await db.raidRunMembers(D,runId),byId=new Map((snapshot.members||[]).map(x=>[Number(x.id),x]));
  if(roster.results.length!==run.party_size||byId.size!==run.party_size||roster.results.some(x=>!byId.has(Number(x.user_id))))return {ok:false,status:409,data:{err:'Raid roster mismatch.'}};
  const participation=new Map();
  for(const row of roster.results){
    const r=byId.get(Number(row.user_id)),profile=safeJson(row.profile_json);
    const meaningful=raidMeaningful({damage:r.damage,support:r.support,maxHp:profile.maxHp,totalHp:run.total_hp,actions:r.actions});
    participation.set(Number(row.user_id),{r,profile,meaningful});
  }
  const statements=[
    db.raidSettlementInsertStatement(D,{runId,outcome:isClear?'clear':'failed',settledAt,result:{state:snapshot.state,hpRemaining:snapshot.hpRemaining,finishedAt:snapshot.finishedAt||settledAt}}),
    db.raidRunSettleStatement(D,{runId,outcome:isClear?'cleared':'failed',settledAt,result:{state:snapshot.state,hpRemaining:snapshot.hpRemaining,finishedAt:snapshot.finishedAt||settledAt}}),
  ];
  for(const row of roster.results){
    const userId=Number(row.user_id),{r,meaningful}=participation.get(userId),support=int(r.support);
    statements.push(db.raidRunContributionStatement(D,{runId,userId,damage:r.damage,support,actions:r.actions,dodges:r.dodges,downs:r.downs,meaningful}));
    if(isClear){
      // Every reserved participant receives the same clear pool and Fractured Chest; contribution
      // metrics are recorded but never gate rewards or chests.
      const account=await db.raidAccount(D,userId),rolled=rollRaidClear({partySize:run.party_size,cardPity:account?.card_pity||0});
      const clearPayload={...rolled.rewards,cardDrop:rolled.cardDrop,cardPityBefore:rolled.cardPityBefore,cardPityAfter:rolled.cardPityAfter,
        guaranteedCard:rolled.guaranteedCard,partySize:run.party_size,support};
      statements.push(db.raidRewardLedgerInsertStatement(D,{runId,userId,kind:'clear',payload:clearPayload,createdAt:settledAt}));
      // Every timed kill creates a Fractured Chest. Repeated clears have no chest cap.
      statements.push(db.raidChestInsertStatement(D,{runId,userId,dayKey:dayKey(settledAt),kind:'fractured',payload:rollFracturedChest({partySize:run.party_size}),createdAt:settledAt}));
    }else{
      // Every reserved participant receives a Pity Chest on every failed attempt, with no
      // contribution floor or once-a-day cap. The two-entry D1 reservation bounds attempts.
      statements.push(db.raidChestInsertStatement(D,{runId,userId,dayKey:dayKey(settledAt),kind:'pity',payload:rollPityChest({partySize:run.party_size}),createdAt:settledAt}));
    }
  }
  try{await D.batch(statements)}catch(error){console.error('Raid settlement failed',error);return {ok:false,status:503,data:{err:'Raid rewards could not be settled yet. They are safe to retry.'}}}
  const final=await db.raidSettlement(D,runId),rows=await db.raidRewardsForUser(D,runId,user.id);
  return {ok:true,status:200,data:{ok:true,outcome:final?.outcome|| (isClear?'clear':'failed'),rewards:rows.results.map(r=>({kind:r.kind,...safeJson(r.payload)}))}};
}

async function getState(env,user){
  const D=env.DB,at=now(),day=dayKey(at);
  if(!(await installed(D)))return fail('Rift Raid D1 migration is not installed.',503,{installed:false});
  await db.raidAccountEnsureStatement(D,user.id,at).run();
  let account=await db.raidAccount(D,user.id),active=await db.raidActiveForUser(D,user.id),activeLive=null,activeError='',settlement=null;
  if(active){
    const remote=await socialRunSnapshot(env,user,active);
    if(remote.ok){const live=parseSocialRun(remote.data);if(live&&['cleared','failed'].includes(live.state)){const settled=await settleRun(env,user,active.id);if(settled.ok){settlement=settled.data;account=await db.raidAccount(D,user.id);active=await db.raidActiveForUser(D,user.id)}else activeError=settled.data?.err||'Settlement is waiting to retry.'}
      else if(live)activeLive=live;}
    else activeError=remote.data?.err||'The live raid room is not available yet.';
  }
  const [entries,chests,titles,auras,upgradeRows,saveRow]=await Promise.all([
    db.raidDailyEntries(D,user.id,day),db.raidDailyChests(D,user.id,day),db.raidTitlesForUser(D,user.id),db.raidCosmeticsForUser(D,user.id),db.raidWeaponsForUser(D,user.id),db.saveByUser(D,user.id),
  ]);
  const save=saveRow&&saveBelongsTo(saveRow.blob,user)?safeJson(saveRow.blob):{};
  const weapons=weaponListFor(save,upgradeRows.results||[]);
  let activeRun=null;
  if(active){
    activeRun=activeLive||{id:active.id,state:'active',partySize:Number(active.party_size),totalHp:Number(active.total_hp),startedAt:Number(active.started_at),deadlineAt:Number(active.deadline_at),liveError:activeError||undefined};
  }
  return json({ok:true,day,dayTimeZone:RAID_RULES.dayTimeZone,settlement,account:publicAccount(account,user.id,Number(entries?.n)||0,chests,titles.results||[],auras.results||[],activeRun,weapons),
    rules:{dailyEntries:RAID_RULES.dailyEntries,hpByParty:RAID_RULES.totalHpByParty,clearSeconds:RAID_RULES.clearTargetSeconds,
      upgradeExpectedSpend:Math.round(expectedRaidStarSpend()*1000)/1000,
      weaponAddon:{mythicOnly:true,maxStars:20,atkPerStar:RAID_RULES.weaponAddon.atkPerStar,raidArmorPenPerStar:RAID_RULES.weaponAddon.raidArmorPenPerStar,raidArmorPenCap:RAID_RULES.weaponAddon.raidArmorPenCap},
      fullClear:RAID_RULES.fullClear,pityChest:RAID_RULES.pityChest,fracturedChest:RAID_RULES.fracturedChest,
      cardChance:RAID_RULES.fullClear.cardChance,cardPity:RAID_RULES.fullClear.cardPityClears,
      titles:RAID_RULES.titles,auras:RAID_RULES.aura}});
}

async function startRaid(env,user,body){
  const D=env.DB,at=now(),day=dayKey(at);
  if(!(await installed(D)))return {ok:false,status:503,data:{err:'Rift Raid D1 migration is not installed.',installed:false}};
  const partyMode=body.mode==='party';let party=null,members=[];
  if(partyMode){
    const roster=await socialRequest(env,'/raid/party',user);
    if(!roster.ok)return roster;
    party=roster.data.party;
    if(!party||party.leader!==user.id||!Array.isArray(party.members)||party.members.length<2||party.members.length>3)return {ok:false,status:409,data:{err:'Create or join a Rift Raid party in the Social Hub; only its leader can begin the party run.'}};
    if(party.open!==true||party.members.some(m=>m.ready!==true))return {ok:false,status:409,data:{err:'Every Rift Raid party member must ready up before the leader can start.'}};
    members=party.members.map(m=>({id:Number(m.id),name:String(m.name||'Adventurer').slice(0,32)}));
  }else members=[{id:user.id,name:user.username}];
  if(members.some(m=>!Number.isInteger(m.id)||m.id<1)||new Set(members.map(m=>m.id)).size!==members.length)return {ok:false,status:409,data:{err:'Invalid raid party roster.'}};
  for(const m of members){if(await db.raidActiveForUser(D,m.id))return {ok:false,status:409,data:{err:'Every party member must finish or time out their active raid first.'}}}
  const profiles=[];
  for(const m of members){
    await db.raidAccountEnsureStatement(D,m.id,at).run();
    const saved=await db.saveByUser(D,m.id);
    if(!saved||!saveBelongsTo(saved.blob,{id:m.id,username:m.name}))return {ok:false,status:409,data:{err:m.id===user.id?'Sync your signed-in character save before starting a raid.':'A party member needs an up-to-date cloud save before the raid can start.'}};
    const state=safeJson(saved.blob),weapons=equipmentList(state);
    // Only the actual main-hand slot contributes to this entry snapshot; an owned Mythic weapon
    // left in the bag is upgradeable but must not grant combat stats until equipped.
    const weapon=weapons.find(it=>it._equippedSlot==='weapon')||null,weaponId=weapon?String(weapon.id):'',upgrade=weaponId?await db.raidWeaponUpgrade(D,m.id,weaponId):null;
    const account=await db.raidAccount(D,m.id);
    profiles.push(savedProfile(state,weapon,upgrade,account?.boss_card_copies||0));
  }
  const partySize=members.length,totalHp=raidTotalHp(partySize),phaseHps=raidPhaseHp(totalHp),seconds=partySize===1?RAID_RULES.clearTargetSeconds.solo:RAID_RULES.clearTargetSeconds.group;
  const runId='raid:'+crypto.randomUUID(),deadlineAt=at+seconds*1000;
  const statements=[db.raidRunInsertStatement(D,{id:runId,leaderId:user.id,partySize,region:0,totalHp,startedAt:at,deadlineAt})];
  for(let i=0;i<members.length;i++)statements.push(db.raidRunMemberInsertStatement(D,{runId,userId:members[i].id,name:members[i].name,profile:profiles[i]}));
  for(const m of members)statements.push(db.raidEntryInsertStatement(D,{userId:m.id,dayKey:day,runId,enteredAt:at}));
  try{await D.batch(statements)}catch(error){
    const message=String(error?.message||error);
    if(message.includes('raid_daily_entry_limit'))return {ok:false,status:429,data:{err:'A party member has used both raid entries for today.'}};
    if(message.includes('raid_active_run'))return {ok:false,status:409,data:{err:'A party member already has an active raid.'}};
    console.error('Raid start D1 transaction failed',error);return {ok:false,status:503,data:{err:'The raid could not reserve every party entry. Nothing was charged.'}};
  }
  const payload={id:runId,leaderId:user.id,partySize,totalHp,phaseHps,phaseNames:RAID_RULES.phaseNames,startedAt:at,deadlineAt,bossArmor:.30,
    members:members.map((m,i)=>({id:m.id,name:m.name,profile:profiles[i]}))};
  const install=await socialRequest(env,'/raid/install',user,'POST',payload);
  if(!install.ok){
    if(install.status===409){try{await D.batch([db.raidRunDeleteStatement(D,runId)])}catch{}return {ok:false,status:409,data:{err:install.data?.error||'The raid room rejected the roster. Your daily entries were restored.'}}}
    // The DO may have accepted an install whose response was lost. Keep the D1 reservation and
    // recover the exact run on the next state/action request instead of refunding into a ghost run.
    return {ok:false,status:503,data:{err:'The run was reserved, but the raid room did not confirm. Refresh Challenge; your entries will not be charged twice.',runId}};
  }
  return {ok:true,status:200,data:{ok:true,runId,partySize,totalHp,phaseHps,deadlineAt,entriesUsed:1}};
}

async function actionRun(env,user,body){
  const D=env.DB,runId=body.runId,combatAction=String(body.combatAction||''),actionId=body.actionId;
  if(!idString(runId)||!['strike','heavy','dodge','heal','ward','revive'].includes(combatAction)||!actionString(actionId))return {ok:false,status:400,data:{err:'Invalid raid action.'}};
  const run=await db.raidRun(D,runId),member=run&&await db.raidRunMember(D,runId,user.id);
  if(!run||!member)return {ok:false,status:403,data:{err:'You are not in that raid.'}};
  if(run.state!=='active'){const settled=await settleRun(env,user,runId);return settled.ok?settled:{ok:false,status:settled.status,data:settled.data}}
  const payload={runId,action:combatAction,actionId};
  if(body.zone!==undefined)payload.zone=String(body.zone);
  if(body.targetId!==undefined)payload.targetId=int(body.targetId,0,Number.MAX_SAFE_INTEGER);
  let result=await socialRequest(env,'/raid/action',user,'POST',payload);
  if(!result.ok&&(result.status===404||(result.status===409&&!result.data?.run))){
    const recovered=await socialRunSnapshot(env,user,run);
    if(recovered.ok)result=await socialRequest(env,'/raid/action',user,'POST',payload);
  }
  const live=result.data?.run;
  if(live&&['cleared','failed'].includes(live.state)){
    const settled=await settleRun(env,user,runId);
    if(settled.ok)return {ok:true,status:200,data:{...result.data,settlement:settled.data}};
  }
  return result;
}

async function upgradeWeapon(env,user,body){
  const D=env.DB,at=now(),weaponId=String(body.weaponId||''),actionId=body.actionId;
  if(!idString(weaponId)||!actionString(actionId))return {ok:false,status:400,data:{err:'Invalid weapon or upgrade action id.'}};
  if(!(await installed(D)))return {ok:false,status:503,data:{err:'Rift Raid D1 migration is not installed.',installed:false}};
  const saved=await db.saveByUser(D,user.id);if(!saved||!saveBelongsTo(saved.blob,user))return {ok:false,status:409,data:{err:'Sync your signed-in save before upgrading a weapon.'}};
  const state=safeJson(saved.blob),weapon=weaponById(state,weaponId);
  if(!weapon)return {ok:false,status:404,data:{err:'That Mythic weapon is not in your saved equipment or bag.'}};
  await db.raidAccountEnsureStatement(D,user.id,at).run();
  await db.raidWeaponEnsureStatement(D,user.id,weaponId,at).run();
  const previous=await db.raidUpgradeActionById(D,user.id,actionId);
  if(previous)return {ok:true,status:200,data:{ok:true,...upgradeActionResult(previous,await db.raidAccount(D,user.id))}};
  const account=await db.raidAccount(D,user.id),up=await db.raidWeaponUpgrade(D,user.id,weaponId),star=int(up?.stars,0,20),failures=int(up?.failures,0,2);
  if(star>=RAID_RULES.weaponAddon.maxStars)return {ok:false,status:409,data:{err:'This weapon is already at 20★.'}};
  const quote={cost:raidStarCost(star),chance:raidStarChance(star)};
  if(int(account?.rift_shards)<quote.cost)return {ok:false,status:409,data:{err:`This attempt costs ${quote.cost} Rift Shards.`,required:quote.cost,owned:int(account?.rift_shards)}};
  const outcome=rollRaidStarUpgrade({star,failures,rng:Math.random});
  try{
    await D.batch([db.raidUpgradeAction(D,{userId:user.id,actionId,weaponId,cost:outcome.cost,starBefore:star,failuresBefore:failures,
      starAfter:outcome.starAfter,failuresAfter:outcome.failuresAfter,success:outcome.success,guaranteed:outcome.guaranteed,chance:outcome.chance,createdAt:at})]);
  }catch(error){
    if(String(error?.message||error).includes('raid_upgrade_state_changed'))return {ok:false,status:409,data:{err:'Your Rift Shards or weapon upgrade changed. Refresh and try again.'}};
    console.error('Raid weapon upgrade transaction failed',error);return {ok:false,status:503,data:{err:'The weapon upgrade could not be recorded. Retry the same action id.'}};
  }
  const result=await db.raidUpgradeActionById(D,user.id,actionId);
  if(!result)return {ok:false,status:409,data:{err:'Not enough Rift Shards or weapon state changed. Refresh before retrying.'}};
  const current=await db.raidAccount(D,user.id);
  return {ok:true,status:200,data:{ok:true,...upgradeActionResult(result,current)}};
}
function upgradeActionResult(result,account){
  return {weaponId:result.weapon_id,cost:Number(result.cost),success:!!result.success,guaranteed:!!result.guaranteed,chance:Number(result.chance),
    starBefore:Number(result.star_before),starAfter:Number(result.star_after),failuresAfter:Number(result.failures_after),riftShards:int(account?.rift_shards)};
}

async function equipCosmetic(env,user,body){
  if(!['aura','title'].includes(body.kind))return {ok:false,status:400,data:{err:'Choose a raid title or aura.'}};
  const D=env.DB,kind=body.kind,id=body.id==null||body.id==='none'?null:String(body.id);
  if(id&&!(kind==='aura'?RAID_RULES.aura.some(x=>x.id===id):RAID_RULES.titles.some(x=>x.id===id)))return {ok:false,status:400,data:{err:'Unknown raid cosmetic.'}};
  const unlocked=kind==='aura'?await db.raidCosmeticsForUser(D,user.id):await db.raidTitlesForUser(D,user.id);
  if(id&&!unlocked.results.some(x=>(kind==='aura'?x.aura_id:x.title_id)===id))return {ok:false,status:403,data:{err:'That cosmetic has not been unlocked.'}};
  await db.raidAccountEnsureStatement(D,user.id,now()).run();
  await (kind==='aura'?db.raidEquipAuraStatement(D,user.id,id,now()):db.raidEquipTitleStatement(D,user.id,id,now())).run();
  const a=await db.raidAccount(D,user.id);return {ok:true,status:200,data:{ok:true,kind,id,equippedAura:a?.equipped_aura||null,equippedTitle:a?.equipped_title||null}};
}

export const onRequestGet = guard(async ({request,env})=>{
  const user=await currentUser(request,env.DB);if(!user)return await unauth(request);
  return await getState(env,user);
});

export const onRequestPost = guard(async ({request,env})=>{
  const user=await currentUser(request,env.DB);if(!user)return await unauth(request);
  if(user.banned)return fail('This account is suspended.',403);
  const body=await readJson(request,4096),action=String(body.action||'');
  if(action==='start'){
    const r=await startRaid(env,user,body);return json(r.data,r.status);
  }
  if(action==='settle'){
    if(!idString(body.runId))return fail('Invalid raid run id.',400);
    if(!(await installed(env.DB)))return fail('Rift Raid D1 migration is not installed.',503,{installed:false});
    const r=await settleRun(env,user,body.runId);return json(r.data,r.status);
  }
  if(action==='act'){
    if(!(await installed(env.DB)))return fail('Rift Raid D1 migration is not installed.',503,{installed:false});
    const r=await actionRun(env,user,body);return json(r.data,r.status);
  }
  if(action==='upgrade'){
    const r=await upgradeWeapon(env,user,body);return json(r.data,r.status);
  }
  if(action==='equip'){
    if(!(await installed(env.DB)))return fail('Rift Raid D1 migration is not installed.',503,{installed:false});
    const r=await equipCosmetic(env,user,body);return json(r.data,r.status);
  }
  if(action==='state')return await getState(env,user);
  return fail('Unknown raid action.',400);
});

export const _raidTest={savedProfile,weaponById,settleRun,startRaid,upgradeWeapon,dayKey};
