/* Separate, casual Sanctuary rules. Client-authored progress is NOT PvP authority. */
(function(root,factory){
 const data=typeof module==='object'&&module.exports?require('./digimon/roster.js'):root.PGDigimonRoster;
 const api=factory(data);if(typeof module==='object'&&module.exports)module.exports=api;else root.PGDigimonSanctuary=api;
})(globalThis,function(DATA){
'use strict';
if(!DATA)throw Error('Digimon roster data must load before DigiPet rules');
const LINES={agumon:['agumon','greymon','metalgreymon','wargreymon'],gabumon:['gabumon','garurumon','weregarurumon','metalgarurumon'],patamon:['patamon','angemon','magnaangemon','seraphimon'],palmon:['palmon','togemon','lillymon','rosemon']};
// STARTERS remains the original four save keys. ROSTER/SPECIES are the complete
// catalog; the owned bag gates selection while existing saves keep progression.
const STARTERS=Object.keys(LINES),ROSTER=[...DATA.IDS],SPECIES=ROSTER,STATS=['power','guard','agility','focus'],DURATION=5*60*1000 /* v371 (owner: "change to 5min per session"): halved again from v359's 10 */,MAX_EVOLUTIONS=6;
const EVOLUTION_REQUIREMENTS=[{points:4,wins:2},{points:10,wins:5},{points:18,wins:9},{points:22,wins:12},{points:24,wins:16},{points:24,wins:20}];
// v354: the Energy meter is retired. Gym sessions are paced by their 20-minute timer alone
// and grind runs end on waves or defeat; old saves simply drop their stale meter values.
const MAX_SLOT=3;
// The owned collection and pet-item economy are separate from Zeny, Cash Shop
// purchases and Ragnarok pets. Eggs only reveal bundled Baby I / Baby II forms.
const STARTER_POOL=ROSTER.filter(id=>['Baby I','Baby II'].includes(DATA.entry(id)?.stage));
const ITEMS={egg:{name:'Mystery Digi-Egg',price:500}};
const COIN_START=50,SPAR_COINS=20;
// v351 partner equipment: the Pet Bag owns the gear inventory and each owned line equips at
// most one piece per kind, so the four partner slots can carry different builds. Drops come
// from field grind (see digimon-battle.js). v354: the Forge no longer rerolls affixes —
// tier-up keeps the piece's stats and raises their numbers, and Refine (+1..+5) is the
// Pet Coin sink with falling success rates, mirroring the pet level-up feel.
const BAG_VERSION=2,GEAR_ITEM_CAP=80;
const GEAR_KINDS=['weapon','armor','accessory','relic'];
const GEAR_MAIN_STATS=['hp','atk','def','spdPct'],GEAR_SPECIAL_STATS=['crit','lifesteal','thorns','xpPct'];
const GEAR_KIND_NOUN={weapon:['Claw','Fang','Core'],armor:['Hide','Plate','Mail'],accessory:['Charm','Band','Talisman'],relic:['Chip','Core','Matrix']};
const GEAR_VARIANCE_FORGE=.2,REFINE_MAX=5,REFINE_BONUS=.08,FORGE_TIER_COST=[120,200,320,480],REFINE_COST=[30,50,80,120,170],REFINE_SUCCESS=[1,.85,.65,.45,.25];
const GEAR_TIER_NAME=['Field','Iron','Chrome','Mythril','Legend'];
const GEAR_STAT_NAME={hp:'+HP',atk:'+ATK',def:'+DEF',spdPct:'+SPD %',crit:'Crit %',lifesteal:'Lifesteal %',thorns:'Thorns',xpPct:'+XP %'};
// Shape caps for a single stored piece. The battle-side aggregate caps in digimon-battle.js
// are the real competitive boundary; these only keep saved items sane.
const GEAR_STAT_CAP={hp:200,atk:40,def:25,spdPct:25,crit:25,lifesteal:20,thorns:15,xpPct:50};
const GEAR_SALVAGE=15;
const cap=(n,min,max)=>Math.max(min,Math.min(max,Math.floor(Number.isFinite(Number(n))?Number(n):min)));
const total=p=>STATS.reduce((a,k)=>a+p.stats[k],0);
const clean=id=>DATA.clean(id);
function freshPartner(line){return {stage:0,form:line,stats:{power:0,guard:0,agility:0,focus:0},mastery:0,wins:0,xp:0,training:null,battle:null}}
function normalize(raw,line){
 if(raw&&typeof raw==='object'&&Number(raw.v)>1)return null;
 const state={v:1,partners:{}},keys=[...STARTERS,...Object.keys(raw?.partners||{}).filter(clean)];
 if(clean(line))keys.push(line);
 for(const key of new Set(keys)){
  const p=raw?.partners?.[key]||{},q=freshPartner(key);q.stage=cap(p.stage,0,MAX_EVOLUTIONS);q.form=clean(p.form)||LINES[key]?.[q.stage]||key;
  q.mastery=cap(p.mastery,0,6);q.wins=cap(p.wins,0,999);q.xp=cap(p.xp,0,3996);for(const k of STATS)q.stats[k]=cap(p.stats?.[k],0,12);
  if(p.training&&STATS.includes(p.training.stat)&&Number.isFinite(p.training.ends)&&p.training.ends>=0)q.training={stat:p.training.stat,ends:p.training.ends};
  const b=p.battle;if(b&&clean(b.opponent)&&['active','win','loss'].includes(b.status)&&Number.isFinite(b.deadline))q.battle={opponent:clean(b.opponent),hp:cap(b.hp,0,200),maxHp:cap(b.maxHp,1,200),enemyHp:cap(b.enemyHp,0,200),enemyMaxHp:cap(b.enemyMaxHp,1,200),energy:cap(b.energy,0,5),turn:cap(b.turn,0,500),status:b.status,deadline:b.deadline,log:typeof b.log==='string'?b.log.slice(0,180):''};
  state.partners[key]=q;
 }
 return state;
}
function species(raw,line){if(!clean(line))return null;const s=normalize(raw,line);return s?s.partners[line].form:null}
function evolutionOptions(form,line,stage=0){
 const options=DATA.directEvolutions(form),preferred=LINES[line]?.[stage+1];
 return preferred&&options.includes(preferred)?[preferred,...options.filter(id=>id!==preferred)]:options;
}
let catalogCache;
function evolutionCatalog(){
 if(catalogCache)return catalogCache;
 const outgoing=new Map(),incoming=new Map(DATA.IDS.map(id=>[id,[]]));
 for(const id of DATA.IDS){const options=evolutionOptions(id,id,0);outgoing.set(id,options);for(const target of options)incoming.get(target)?.push(id)}
 const reachable=new Set(STARTER_POOL),queue=[...STARTER_POOL];for(let i=0;i<queue.length;i++)for(const target of outgoing.get(queue[i])||[])if(!reachable.has(target)){reachable.add(target);queue.push(target)}
 catalogCache={outgoing,incoming,reachable};return catalogCache;
}
function requirements(p,line){
 const stage=cap(p?.stage,0,MAX_EVOLUTIONS),form=clean(p?.form)||LINES[line]?.[stage]||line,options=evolutionOptions(form,line,stage);
 if(stage>=MAX_EVOLUTIONS||!options.length)return null;
 const needed=EVOLUTION_REQUIREMENTS[stage];return {...needed,ready:total(p)>=needed.points&&p.wins>=needed.wins,options};
}
function update(raw,now,line){const state=normalize(raw,line);if(!state)return {state:null,changed:false};let changed=false;now=Number.isFinite(now)?now:Date.now();
 for(const p of Object.values(state.partners)){
  if(p.training&&now>=p.training.ends){const stat=p.training.stat;p.training=null;if(p.stats[stat]<12&&total(p)<24)p.stats[stat]++;changed=true}
  if(p.battle?.status==='active'&&now>=p.battle.deadline){p.battle.status='loss';p.battle.log='Time is up. Your partner can try again.';changed=true}}
 return {state,changed};
}
function act(raw,line,action,now,random=randomUnit){now=Number.isFinite(now)?now:Date.now();const u=update(raw,now,clean(line)?line:undefined),state=u.state;if(!state||!clean(line))return {ok:false,state,changed:u.changed,message:'DigiPet data is unavailable.'};const p=state.partners[line],done=message=>({ok:true,state,changed:true,message}),fail=message=>({ok:false,state,changed:u.changed,message});
 if(!action||typeof action!=='object')return fail('Choose an action.');
 if(action.type==='train'){const stat=action.stat;if(!STATS.includes(stat))return fail('Choose a training stat.');if(p.training||p.battle?.status==='active')return fail('Finish the current activity first.');if(p.stats[stat]>=12||total(p)>=24)return fail('Training cap reached.');p.training={stat,ends:now+DURATION};return done('Training started. It completes in 5 minutes.')}
 if(action.type==='mastery'){if(p.mastery>=6||total(p)<(p.mastery+1)*4)return fail('Train four more points for the next mastery.');p.mastery++;return done('Mastery improved without changing form.')}
 // v349: the evolution branch is rolled, not chosen. The possible pool stays visible in
 // the DigiDex so players know what a form can become before they commit.
 if(action.type==='evolve'){
  if(p.training||p.battle?.status==='active')return fail('Finish the current activity first.');const req=requirements(p,line);if(!req||!req.ready)return fail('Evolution requirements are not met.');
  if(req.options.length<1)return fail('No direct evolution is available.');
  const roll=Math.max(0,Math.min(.999999999,Number(random())||0)),target=req.options[Math.floor(roll*req.options.length)];
  p.form=target;p.stage++;return done('Your partner evolved into '+DATA.name(target)+'!');
 }
 // v349 reroll loop: a fresh egg restarts this line's training, wins and level. The owned
 // collection is untouched, so the species stays unlocked while you raise it again.
 if(action.type==='reset'){
  if(p.training||p.battle?.status==='active')return fail('Finish the current activity first.');
  Object.assign(p,freshPartner(line));return done('Your partner returned to its egg. Level, training and wins start fresh.');
 }
 if(action.type==='startBattle'){
  if(p.training||p.battle?.status==='active')return fail('Finish the current activity first.');const level=Math.min(4,Math.floor(p.wins/2));let opponent;
  if(LINES[line]){const enemyLine=STARTERS[(STARTERS.indexOf(line)+1+level)%STARTERS.length];opponent=LINES[enemyLine][Math.min(2,Math.floor(p.wins/3))]}
  else{const index=Math.max(0,SPECIES.indexOf(p.form));opponent=SPECIES[(index+1+level*17)%SPECIES.length]}
  const maxHp=100+p.stats.guard*5,enemyMaxHp=45+level*12;p.battle={opponent,hp:maxHp,maxHp,enemyHp:enemyMaxHp,enemyMaxHp,energy:2,turn:0,status:'active',deadline:now+90000,log:'A friendly spar begins. Choose a command.'};return done('Spar started. Win for '+SPAR_COINS+' Pet Coins; this is local practice, not server-authoritative PvP.');
 }
 if(action.type==='battle'){const b=p.battle;if(!b||b.status!=='active')return fail('No active spar.');if(!['attack','guard','special'].includes(action.command))return fail('Choose a valid command.');if(action.command==='special'&&b.energy<2)return fail('Special needs 2 energy.');let damage=0;if(action.command==='attack')damage=9+p.stats.power*2+p.mastery;if(action.command==='special'){damage=20+p.stats.focus*2+p.mastery;b.energy-=2}if(action.command==='guard')b.energy=Math.min(5,b.energy+1);b.enemyHp=Math.max(0,b.enemyHp-damage);b.turn++;if(!b.enemyHp){b.status='win';b.log='Victory! Your partner won a friendly spar.';p.wins=cap(p.wins+1,0,999);return done(b.log)}const level=Math.min(4,Math.floor(p.wins/2));let incoming=Math.max(2,8+level*2-Math.floor(p.stats.guard/2));if(action.command==='guard')incoming=Math.max(1,Math.floor(incoming/2));const evadeEvery=Math.max(2,8-Math.floor(p.stats.agility/2));if(p.stats.agility>0&&b.turn%evadeEvery===0)incoming=0;b.hp=Math.max(0,b.hp-incoming);b.log=(damage?'You dealt '+damage+' damage. ':'You guarded and gained energy. ')+(incoming?'Opponent dealt '+incoming+'.':'Your partner evaded the attack.');if(!b.hp){b.status='loss';b.log='Your partner was defeated. Rest and try again.'}return done(b.log)}
 if(action.type==='endBattle'){if(!p.battle)return fail('No spar to close.');p.battle=null;return done('Spar closed.')}
 return fail('Unknown DigiPet action.');
}
// A completed live-world session uses the same limits as the old timed prototype,
// but does not persist a timer that could finish while the scene is closed.
function completeWorldTraining(raw,line,stat,now){const start=act(raw,line,{type:'train',stat},now);if(!start.ok)return start;start.state.partners[line].training.ends=now;const finished=update(start.state,now,line);finished.state.partners[line].xp=cap(finished.state.partners[line].xp+1,0,3996);return {ok:true,state:finished.state,changed:true,message:stat[0].toUpperCase()+stat.slice(1)+' training complete: +1 point.'}}
const level=p=>1+Math.floor(cap(p?.xp,0,3996)/4);
// Versioned pet bag / owned-species collection. Unknown future versions are
// refused rather than overwritten, matching the Sanctuary save contract.
function cleanOwned(raw){return [...new Set((Array.isArray(raw)?raw:[]).map(clean).filter(Boolean))].slice(0,ROSTER.length)}
function cleanGearStat(raw,allowed){
 if(!raw||typeof raw!=='object'||!allowed.includes(raw.stat))return null;
 return {stat:raw.stat,value:cap(raw.value,1,GEAR_STAT_CAP[raw.stat])};
}
// v354: refine (+0..+5) lives on the piece; every stat it carries gains +8% per level.
function cleanGearItem(raw){
 if(!raw||typeof raw!=='object'||!GEAR_KINDS.includes(raw.kind))return null;
 const main=cleanGearStat(raw.main,GEAR_MAIN_STATS);if(!main)return null;
 const special=cleanGearStat(raw.special,GEAR_SPECIAL_STATS);
 return {kind:raw.kind,tier:cap(raw.tier,1,5),refine:cap(raw.refine,0,REFINE_MAX),main,special};
}
function gearItemName(item){return item?GEAR_TIER_NAME[item.tier-1]+' '+GEAR_KIND_NOUN[item.kind][Math.min(2,Math.floor((item.tier-1)/2))]:''}
function gearRefineTag(item){const n=cap(item?.refine,0,REFINE_MAX);return n>0?' +'+n:''}
// The effective value shown and summed everywhere: round(value*(1+refine*REFINE_BONUS)).
function gearStatValue(stat,refine=0){return Math.round(stat.value*(1+cap(refine,0,REFINE_MAX)*REFINE_BONUS))}
function gearItemLabel(item){return item?gearItemName(item)+gearRefineTag(item)+' · '+GEAR_STAT_NAME[item.main.stat]+' '+gearStatValue(item.main,item.refine)+(item.special?' · '+GEAR_STAT_NAME[item.special.stat]+' '+gearStatValue(item.special,item.refine):''):''}
function normalizeBagGear(raw){
 const gear={seq:cap(raw?.seq,0,999999),items:{},equip:{}};
 if(!raw||typeof raw!=='object')return gear;
 if(raw.items&&typeof raw.items==='object')for(const [uid,item] of Object.entries(raw.items)){
  if(!/^[A-Za-z0-9_-]{1,24}$/.test(uid))continue;const piece=cleanGearItem(item);if(piece)gear.items[uid]=piece;
 }
 if(Object.keys(gear.items).length>GEAR_ITEM_CAP){
  const keep=Object.entries(gear.items).slice(0,GEAR_ITEM_CAP);gear.items=Object.fromEntries(keep);
 }
 if(raw.equip&&typeof raw.equip==='object')for(const [line,slots] of Object.entries(raw.equip)){
  const key=clean(line);if(!key||!slots||typeof slots!=='object')continue;
  const map={};for(const kind of GEAR_KINDS){const uid=slots[kind];if(typeof uid==='string'&&gear.items[uid]&&cleanGearItem(gear.items[uid])?.kind===kind)map[kind]=uid}
  if(Object.keys(map).length)gear.equip[key]=map;
 }
 return gear;
}
function normalizeBag(raw){
 if(raw&&typeof raw==='object'&&Number(raw.v)>BAG_VERSION)return null;
 return {v:BAG_VERSION,coins:cap(raw?.coins??COIN_START,0,999999),eggs:cap(raw?.eggs,0,STARTER_POOL.length),owned:cleanOwned(raw?.owned),gear:normalizeBagGear(raw?.gear)};
}
function ensureBag(raw,legacyOwned=[]){
 const state=normalizeBag(raw);if(!state)return null;
 state.owned=cleanOwned([...state.owned,...legacyOwned]);
 // Equipment can only be equipped by a line the bag actually owns.
 for(const line of Object.keys(state.gear.equip))if(!state.owned.includes(line))delete state.gear.equip[line];
 if(raw==null&&!state.owned.length)state.eggs=1;
 return state;
}
function bagBuy(raw,item,quantity=1){
 const state=normalizeBag(raw),qty=Number(quantity),entry=ITEMS[item];
 if(!state||!entry||!Number.isInteger(qty)||qty<1||qty>99)return {ok:false,state,changed:false,message:'Choose a valid pet-shop purchase.'};
 if(item==='egg'){
  const available=STARTER_POOL.filter(id=>!state.owned.includes(id)).length;
  if(qty+state.eggs>available)return {ok:false,state,changed:false,message:available?'Hatch your current eggs first; every egg is duplicate-protected.':'You already own every starter-pool species.'};
 }
 const cost=entry.price*qty;if(state.coins<cost)return {ok:false,state,changed:false,message:'Not enough Pet Coins.'};
 state.coins-=cost;state.eggs+=qty;
 return {ok:true,state,changed:true,message:'Bought '+qty+' × '+entry.name+' for '+cost+' Pet Coins.'};
}
function randomUnit(){const c=globalThis.crypto;if(c&&typeof c.getRandomValues==='function'){const a=new Uint32Array(1);c.getRandomValues(a);return a[0]/4294967296}return Math.random()}
function bagHatch(raw,random=randomUnit){
 const state=normalizeBag(raw);if(!state)return {ok:false,state,changed:false,message:'This pet bag uses a newer save version.'};
 if(state.eggs<1)return {ok:false,state,changed:false,message:'No Digi-Egg to hatch.'};
 const available=STARTER_POOL.filter(id=>!state.owned.includes(id));if(!available.length)return {ok:false,state,changed:false,message:'Your starter-pool collection is already complete.'};
 const roll=Math.max(0,Math.min(.999999999,Number(random())||0)),line=available[Math.floor(roll*available.length)];
 state.eggs--;state.owned.push(line);return {ok:true,state,changed:true,line,message:DATA.name(line)+' hatched from the Digi-Egg!'};
}
function bagReward(raw,kind){
 const state=normalizeBag(raw);if(!state||kind!=='spar')return {ok:false,state,changed:false,message:'This pet reward is not available.'};
 const before=state.coins;state.coins=cap(state.coins+SPAR_COINS,0,999999);
 return {ok:true,state,changed:state.coins!==before,amount:state.coins-before,message:state.coins>before?'+'+(state.coins-before)+' Pet Coins from the spar.':'Pet Coin pouch is full.'};
}
// ----------------------------- Partner equipment -----------------------------
function gearUid(state){state.gear.seq=cap(state.gear.seq+1,0,999999);return 'g'+state.gear.seq.toString(36)+Math.floor(randomUnit()*46656).toString(36)}
function gearAdd(state,item){
 const piece=cleanGearItem(item);if(!piece)return null;
 if(Object.keys(state.gear.items).length>=GEAR_ITEM_CAP)return null;
 const uid=gearUid(state);state.gear.items[uid]=piece;return uid;
}
function gearEquip(raw,uid,line){
 const state=normalizeBag(raw);
 if(!state)return {ok:false,state,changed:false,message:'This pet bag uses a newer save version.'};
 const fail=message=>({ok:false,state,changed:false,message}),done=message=>({ok:true,state,changed:true,message});
 const item=state.gear.items[uid],key=clean(line);
 if(!item)return fail('Choose a gear piece from your Pet Bag.');
 if(!key||!state.owned.includes(key))return fail('Hatch that species before equipping gear on it.');
 // One piece per kind: unequip it from whichever line currently holds it.
 for(const [held,slots] of Object.entries(state.gear.equip))if(slots[item.kind]===uid){delete slots[item.kind];if(!Object.keys(slots).length)delete state.gear.equip[held]}
 (state.gear.equip[key]=state.gear.equip[key]||{})[item.kind]=uid;
 return done(gearItemLabel(item)+' equipped.');
}
function gearUnequip(raw,uid){
 const state=normalizeBag(raw);
 if(!state)return {ok:false,state,changed:false,message:'This pet bag uses a newer save version.'};
 const fail=message=>({ok:false,state,changed:false,message}),done=message=>({ok:true,state,changed:true,message});
 const item=state.gear.items[uid];if(!item)return fail('Choose a gear piece from your Pet Bag.');
 let held=false;
 for(const [line,slots] of Object.entries(state.gear.equip))if(slots[item.kind]===uid){delete slots[item.kind];held=true;if(!Object.keys(slots).length)delete state.gear.equip[line]}
 if(!held)return fail('That piece is not equipped.');
 return done(gearItemLabel(item)+' returned to the Pet Bag.');
}
// Sum the equipped pieces of one line into the aggregate bonuses a battle profile carries.
// The server re-clamps these aggregates in digimon-battle.js before they can affect a match.
function gearBonuses(state,line){
 const g={hp:0,atk:0,def:0,spdPct:0,crit:0,lifesteal:0,thorns:0,xpPct:0};
 const slots=state?.gear?.equip?.[clean(line)||''];
 if(slots)for(const uid of Object.values(slots)){
  const item=state.gear.items[uid];if(!item)continue;
  g[item.main.stat]=Math.min(GEAR_STAT_CAP[item.main.stat],g[item.main.stat]+gearStatValue(item.main,item.refine));
  if(item.special)g[item.special.stat]=Math.min(GEAR_STAT_CAP[item.special.stat],g[item.special.stat]+gearStatValue(item.special,item.refine));
 }
 return g;
}
// v354 Forge: no reroll. 'tier' raises the tier of the SAME affixes — the stats keep their
// identity and their numbers are redrawn from the higher tier's value band, never below the
// values the piece already shows. 'refine' attempts +1..+5 with falling success rates; a miss
// only spends the coins, the piece is never destroyed.
function bagForge(raw,uid,mode,random=randomUnit){
 const state=normalizeBag(raw);
 if(!state)return {ok:false,state,changed:false,message:'This pet bag uses a newer save version.'};
 const fail=message=>({ok:false,state,changed:false,message}),done=message=>({ok:true,state,changed:true,message});
 const item=state.gear.items[uid];
 if(!item)return fail('Choose a gear piece from your Pet Bag.');
 if(!['tier','refine'].includes(mode))return fail('Choose a Forge action.');
 if(mode==='tier'&&item.tier>=5)return fail(gearItemName(item)+' is already at the maximum tier.');
 if(mode==='refine'&&item.refine>=REFINE_MAX)return fail(gearItemName(item)+' is already +'+REFINE_MAX+', the Forge cannot refine further.');
 const cost=(mode==='tier'?FORGE_TIER_COST:REFINE_COST)[item.tier-1];
 if(state.coins<cost)return fail('Not enough Pet Coins — the Forge needs '+cost+'.');
 state.coins-=cost;
 if(mode==='refine'){
  const roll=Math.max(0,Math.min(.999999999,Number(random())||0));
  if(roll<REFINE_SUCCESS[item.refine]){
   item.refine++;
   return done(gearItemName(item)+' refined to +'+item.refine+'! Every stat it carries is stronger.');
  }
  return done('The refine failed — the '+gearItemName(item)+' is unchanged, and the Pet Coins were spent.');
 }
 const battle=globalThis.PGDigimonBattle;
 if(!battle||typeof battle.GEAR_MAIN_VALUE!=='object')return fail('Battle rules are not loaded yet. Reload and try again.');
 const tier=item.tier+1,roll=()=>Math.max(0,Math.min(.999999999,Number(random())||0));
 // Same affix, better band: keep the stat identity and redraw the value from the higher
 // tier's range, never below what the piece already shows after its current refine.
 const band=Math.round(battle.GEAR_MAIN_VALUE[item.main.stat][item.kind][tier-1]*(1-GEAR_VARIANCE_FORGE+roll()*GEAR_VARIANCE_FORGE*2));
 const main={stat:item.main.stat,value:Math.max(gearStatValue(item.main,item.refine),band)};
 let special=item.special;
 if(special){
  const table=battle.GEAR_SPECIAL&&battle.GEAR_SPECIAL[special.stat]?battle.GEAR_SPECIAL[special.stat][tier-1]:special.value;
  special={stat:special.stat,value:Math.max(gearStatValue(special,item.refine),table)};
 }
 state.gear.items[uid]=cleanGearItem({kind:item.kind,tier,refine:item.refine,main,special});
 return done(gearItemName(state.gear.items[uid])+' rose to '+GEAR_TIER_NAME[tier-1]+' tier — same affix, stronger numbers.');
}
// The room sends this profile as a battle loadout. It contains no inventory or Zeny and is
// normalized again by the server before it can influence a match. Equipped gear travels as
// clamped aggregate bonuses, never as the item list itself.
function combatProfile(raw,line,slot=0,bag=null){
 const state=normalize(raw,line),p=state?.partners?.[line];if(!p)return null;
 return {lineId:line,form:p.form,slot:cap(slot,0,MAX_SLOT),level:level(p),xp:p.xp,wins:p.wins,mastery:p.mastery,stats:{...p.stats},gear:gearBonuses(bag,line)};
}
// Apply a clamped result to the existing owned line. Online callers accept only server-issued
// messages; Solo plaza uses the same math for explicitly labeled local practice. The caller
// deduplicates the battle id; this helper never chooses an outcome or reward amount itself.
function applyBattleReward(raw,bagRaw,line,reward,gearDrop=null){
 const state=normalize(raw,line),bag=normalizeBag(bagRaw),p=state?.partners?.[line];
 if(!state||!bag||!p||!reward||typeof reward!=='object')return {ok:false,state,bag,changed:false,message:'This battle reward could not be applied.'};
 const coins=cap(reward.coins,0,10000),eggs=cap(reward.eggs,0,99),xp=cap(reward.xp,0,100),wins=cap(reward.wins,0,1);
 const before=bag.coins,beforeEggs=bag.eggs;bag.coins=cap(bag.coins+coins,0,999999);bag.eggs=cap(bag.eggs+eggs,0,STARTER_POOL.length);p.xp=cap(p.xp+xp,0,3996);p.wins=cap(p.wins+wins,0,999);
 const coinGain=bag.coins-before,bonusGain=Math.min(coinGain,cap(reward.dropCoins,0,coins)),baseGain=coinGain-bonusGain,eggGain=bag.eggs-beforeEggs,eggMessage=eggs?(eggGain?' · +'+eggGain+' Digi-Egg'+(eggGain===1?'':'s'):' · Digi-Egg bag full'):'';
 // A gear drop lands in the Pet Bag; a full bag salvages it into Pet Coins instead of losing it.
 let gearItem=null;
 if(gearDrop&&typeof gearDrop==='object'){
  const uid=gearAdd(bag,gearDrop);
  if(uid)gearItem=bag.gear.items[uid];
  else{const salvage=cap(gearDrop.tier,1,5)*GEAR_SALVAGE;bag.coins=cap(bag.coins+salvage,0,999999);return {ok:true,state,bag,changed:true,amount:bag.coins-before,bonus:bonusGain,eggs:eggGain,gear:null,message:'+'+baseGain+' Pet Coins'+(bonusGain?' · +'+bonusGain+' bonus petgold':'')+' · +'+xp+' XP'+(wins?' · +1 win':'')+eggMessage+' · Gear bag full — salvaged the '+gearItemName(cleanGearItem(gearDrop))+' for '+salvage+' Pet Coins'}
  }
 }
 return {ok:true,state,bag,changed:true,amount:coinGain,bonus:bonusGain,eggs:eggGain,gear:gearItem,message:'+'+baseGain+' Pet Coins'+(bonusGain?' · +'+bonusGain+' bonus petgold':'')+' · +'+xp+' XP'+(wins?' · +1 win':'')+eggMessage+(gearItem?' · ⚙ '+gearItemLabel(gearItem):'')};
}
return {LINES,STARTERS,ROSTER,SPECIES,STAGES:DATA.STAGES,STATS,DURATION,MAX_EVOLUTIONS,MAX_SLOT,STARTER_POOL,ITEMS,COIN_START,SPAR_COINS,BAG_VERSION,GEAR_ITEM_CAP,GEAR_KINDS,GEAR_MAIN_STATS,GEAR_SPECIAL_STATS,GEAR_STAT_NAME,GEAR_STAT_CAP,FORGE_TIER_COST,REFINE_MAX,REFINE_BONUS,REFINE_COST,REFINE_SUCCESS,level,normalize,update,act,species,total,requirements,evolutionOptions,evolutionCatalog,completeWorldTraining,normalizeBag,ensureBag,bagBuy,bagHatch,bagReward,cleanGearItem,gearItemName,gearItemLabel,gearRefineTag,gearStatValue,gearAdd,gearEquip,gearUnequip,gearBonuses,bagForge,combatProfile,applyBattleReward,name:DATA.name,entry:DATA.entry,visualScale:DATA.visualScale};
});
