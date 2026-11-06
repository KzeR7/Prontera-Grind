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
const STARTERS=Object.keys(LINES),ROSTER=[...DATA.IDS],SPECIES=ROSTER,STATS=['power','guard','agility','focus'],DURATION=20*60*1000,MAX_EVOLUTIONS=6;
const EVOLUTION_REQUIREMENTS=[{points:4,wins:2},{points:10,wins:5},{points:18,wins:9},{points:22,wins:12},{points:24,wins:16},{points:24,wins:20}];
// v349 care model: one Energy meter replaces the old fatigue/fullness pair. Gym sessions
// and grind waves spend it; real time and Pet Meals restore it; ring PvP is always free.
// A 20-minute gym session costs more than the regen it passes, so training stays a choice.
const ENERGY_START=70,ENERGY_REGEN_MS=2*60*1000,ENERGY_TRAIN_COST=20,ENERGY_TRAIN_MIN=10,ENERGY_FEED=25,ENERGY_PVE_MIN=10,MAX_SLOT=3;
// The owned collection and pet-item economy are separate from Zeny, Cash Shop
// purchases and Ragnarok pets. Eggs only reveal bundled Baby I / Baby II forms.
const STARTER_POOL=ROSTER.filter(id=>['Baby I','Baby II'].includes(DATA.entry(id)?.stage));
const ITEMS={food:{name:'Pet Meal',price:25},egg:{name:'Mystery Digi-Egg',price:500}};
const COIN_START=50,SPAR_COINS=20;
const cap=(n,min,max)=>Math.max(min,Math.min(max,Math.floor(Number.isFinite(Number(n))?Number(n):min)));
const total=p=>STATS.reduce((a,k)=>a+p.stats[k],0);
const clean=id=>DATA.clean(id);
function freshPartner(line){return {stage:0,form:line,stats:{power:0,guard:0,agility:0,focus:0},energy:ENERGY_START,energyAt:null,mastery:0,wins:0,xp:0,training:null,battle:null}}
// v349 migration for one-roll saves: the old meters collapse into Energy once.
function migrateEnergy(p){return cap(Math.round(((p?.fullness??70)+(100-(p?.fatigue??0)))/2),0,100)}
function normalize(raw,line){
 if(raw&&typeof raw==='object'&&Number(raw.v)>1)return null;
 const state={v:1,partners:{}},keys=[...STARTERS,...Object.keys(raw?.partners||{}).filter(clean)];
 if(clean(line))keys.push(line);
 for(const key of new Set(keys)){
  const p=raw?.partners?.[key]||{},q=freshPartner(key);q.stage=cap(p.stage,0,MAX_EVOLUTIONS);q.form=clean(p.form)||LINES[key]?.[q.stage]||key;
  q.energy=cap(p.energy??(p.fatigue!=null||p.fullness!=null?migrateEnergy(p):ENERGY_START),0,100);q.mastery=cap(p.mastery,0,6);q.wins=cap(p.wins,0,999);q.xp=cap(p.xp,0,3996);for(const k of STATS)q.stats[k]=cap(p.stats?.[k],0,12);
  if(Number.isFinite(p.energyAt)&&p.energyAt>=0&&q.energy<100)q.energyAt=Math.floor(p.energyAt);
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
  // Energy refills over real time, online or off, one point per ENERGY_REGEN_MS.
  if(p.energy<100){
   if(p.energyAt==null){p.energyAt=now;changed=true}
   else{const gained=Math.floor((now-p.energyAt)/ENERGY_REGEN_MS);if(gained>0){p.energy=cap(p.energy+gained,0,100);p.energyAt=p.energy>=100?null:p.energyAt+gained*ENERGY_REGEN_MS;changed=true}}
  }else if(p.energyAt!=null){p.energyAt=null;changed=true}
  if(p.training&&now>=p.training.ends){const stat=p.training.stat;p.training=null;if(p.stats[stat]<12&&total(p)<24){p.stats[stat]++;p.energy=cap(p.energy-ENERGY_TRAIN_COST,0,100)}changed=true}
  if(p.battle?.status==='active'&&now>=p.battle.deadline){p.battle.status='loss';p.battle.log='Time is up. Your partner can try again.';changed=true}}
 return {state,changed};
}
function act(raw,line,action,now,random=randomUnit){now=Number.isFinite(now)?now:Date.now();const u=update(raw,now,clean(line)?line:undefined),state=u.state;if(!state||!clean(line))return {ok:false,state,changed:u.changed,message:'DigiPet data is unavailable.'};const p=state.partners[line],done=message=>({ok:true,state,changed:true,message}),fail=message=>({ok:false,state,changed:u.changed,message});
 if(!action||typeof action!=='object')return fail('Choose an action.');
 if(action.type==='feed'){if(p.energy>=100)return fail('Your partner is already full of energy.');p.energy=cap(p.energy+ENERGY_FEED,0,100);return done('Your partner enjoyed a meal. +'+ENERGY_FEED+' energy.')}
 if(action.type==='train'){const stat=action.stat;if(!STATS.includes(stat))return fail('Choose a training stat.');if(p.training||p.battle?.status==='active')return fail('Finish the current activity first.');if(p.stats[stat]>=12||total(p)>=24)return fail('Training cap reached.');if(p.energy<ENERGY_TRAIN_MIN)return fail('Your partner needs energy. Feed a Pet Meal or wait for it to recover.');p.training={stat,ends:now+DURATION};return done('Training started. It completes in 20 minutes.')}
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
function normalizeBag(raw){
 if(raw&&typeof raw==='object'&&Number(raw.v)>1)return null;
 return {v:1,coins:cap(raw?.coins??COIN_START,0,999999),food:cap(raw?.food,0,999),eggs:cap(raw?.eggs,0,STARTER_POOL.length),owned:cleanOwned(raw?.owned)};
}
function ensureBag(raw,legacyOwned=[]){
 const state=normalizeBag(raw);if(!state)return null;
 state.owned=cleanOwned([...state.owned,...legacyOwned]);
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
 if(item==='food'&&qty+state.food>999)return {ok:false,state,changed:false,message:'Your Pet Meal stack is full.'};
 const cost=entry.price*qty;if(state.coins<cost)return {ok:false,state,changed:false,message:'Not enough Pet Coins.'};
 state.coins-=cost;if(item==='food')state.food=cap(state.food+qty,0,999);else state.eggs+=qty;
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
function bagFeed(raw,sanctuaryRaw,line,now){
 const bag=normalizeBag(raw);if(!bag)return {ok:false,state:sanctuaryRaw,bag,changed:false,message:'This pet bag uses a newer save version.'};
 if(bag.food<1)return {ok:false,state:sanctuaryRaw,bag,changed:false,message:'Buy a Pet Meal from Cook Lina first.'};
 const result=act(sanctuaryRaw,line,{type:'feed'},now);if(!result.ok)return {...result,bag};
 bag.food--;return {ok:true,state:result.state,bag,changed:true,message:result.message+' One Pet Meal was used.'};
}
function bagReward(raw,kind){
 const state=normalizeBag(raw);if(!state||kind!=='spar')return {ok:false,state,changed:false,message:'This pet reward is not available.'};
 const before=state.coins;state.coins=cap(state.coins+SPAR_COINS,0,999999);
 return {ok:true,state,changed:state.coins!==before,amount:state.coins-before,message:state.coins>before?'+'+(state.coins-before)+' Pet Coins from the spar.':'Pet Coin pouch is full.'};
}
// The room sends this profile as a battle loadout. It contains no inventory or Zeny and is
// normalized again by the server before it can influence a match.
function combatProfile(raw,line,slot=0){
 const state=normalize(raw,line),p=state?.partners?.[line];if(!p)return null;
 return {lineId:line,form:p.form,slot:cap(slot,0,MAX_SLOT),level:level(p),xp:p.xp,wins:p.wins,mastery:p.mastery,energy:p.energy,stats:{...p.stats}};
}
// Apply a clamped result to the existing owned line. Online callers accept only server-issued
// messages; Solo plaza uses the same math for explicitly labeled local practice. The caller
// deduplicates the battle id; this helper never chooses an outcome or reward amount itself.
function applyBattleReward(raw,bagRaw,line,reward){
 const state=normalize(raw,line),bag=normalizeBag(bagRaw),p=state?.partners?.[line];
 if(!state||!bag||!p||!reward||typeof reward!=='object')return {ok:false,state,bag,changed:false,message:'This battle reward could not be applied.'};
 const coins=cap(reward.coins,0,10000),eggs=cap(reward.eggs,0,99),xp=cap(reward.xp,0,100),wins=cap(reward.wins,0,1),energy=cap(reward.energy,-20,0);
 const before=bag.coins,beforeEggs=bag.eggs;bag.coins=cap(bag.coins+coins,0,999999);bag.eggs=cap(bag.eggs+eggs,0,STARTER_POOL.length);p.xp=cap(p.xp+xp,0,3996);p.wins=cap(p.wins+wins,0,999);p.energy=cap(p.energy+energy,0,100);
 const coinGain=bag.coins-before,bonusGain=Math.min(coinGain,cap(reward.dropCoins,0,coins)),baseGain=coinGain-bonusGain,eggGain=bag.eggs-beforeEggs,eggMessage=eggs?(eggGain?' · +'+eggGain+' Digi-Egg'+(eggGain===1?'':'s'):' · Digi-Egg bag full'):'';
 return {ok:true,state,bag,changed:true,amount:coinGain,bonus:bonusGain,eggs:eggGain,message:'+'+baseGain+' Pet Coins'+(bonusGain?' · +'+bonusGain+' bonus petgold':'')+' · +'+xp+' XP'+(wins?' · +1 win':'')+eggMessage};
}
return {LINES,STARTERS,ROSTER,SPECIES,STAGES:DATA.STAGES,STATS,DURATION,MAX_EVOLUTIONS,MAX_SLOT,ENERGY_START,ENERGY_REGEN_MS,ENERGY_TRAIN_COST,ENERGY_TRAIN_MIN,ENERGY_FEED,ENERGY_PVE_MIN,STARTER_POOL,ITEMS,COIN_START,SPAR_COINS,level,normalize,update,act,species,total,requirements,evolutionOptions,evolutionCatalog,completeWorldTraining,normalizeBag,ensureBag,bagBuy,bagHatch,bagFeed,bagReward,combatProfile,applyBattleReward,name:DATA.name,entry:DATA.entry,visualScale:DATA.visualScale};
});
