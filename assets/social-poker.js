/* Shared Plaza Hold'em engine, chip packs and gift-exchange preview catalog. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PGSocialPoker=api})(globalThis,()=>{
'use strict';

const SMALL_BLIND=10,BIG_BLIND=20,MIN_BUY_IN=40,DEFAULT_BUY_IN=1000,MAX_BUY_IN=50000;
const STARTING_CHIPS=1000,DAILY_FREE_CHIPS=1000;
const TURN_MS=20000,DEAL_DELAY_MS=1800,BOT_DELAY_MS=750,SHOWDOWN_MS=5000,FOLD_WIN_MS=3000;
const AFK_MAX_TIMEOUTS=2,AFK_BUST_MS=60000;
const RANKS='..23456789TJQKA',SUITS=['s','h','d','c'];

const ZENY_PACKS=[
 {id:'pack500',chips:500,zeny:50000,label:'Starter Stack',desc:'Quick table buy-in (100z / chip)'},
 {id:'pack2500',chips:2500,zeny:250000,label:'High-Roller Stack',desc:'2.5× standard buy-in (100z / chip)'},
 {id:'pack10000',chips:10000,zeny:1000000,label:'VIP Vault Stack',desc:'Deep-stack session (100z / chip)'},
];

const GIFT_EXCHANGE_PREVIEW=[
 {id:'ore_satchel',icon:'⛏',name:'Refinement Ore Satchel',chips:1500,badge:'Later Update',desc:'Oridecon & Elunium bundle for gear refinement.'},
 {id:'card_pack',icon:'🃏',name:"Dealer's Sealed Card Pack",chips:2500,badge:'Later Update',desc:'Random Monster Card for album or Card Mastery.'},
 {id:'roulette_roll',icon:'🎡',name:'Banked Roulette Spin',chips:4000,badge:'Later Update',desc:'Adds +1 bonus roll to the Daily Reward Roulette.'},
 {id:'felt_flair',icon:'♠',name:'Emerald Felt Crest',chips:8000,badge:'Later Update',desc:'Plaza table nameplate trim & card-back prestige.'},
 {id:'protect_scroll',icon:'📜',name:'Refine Protection Scroll',chips:12000,badge:'Later Update',desc:'Guards +5 to +10 gear on a failed refine attempt.'},
 {id:'high_roller_flair',icon:'👑',name:"High Roller's Keepsake",chips:25000,badge:'Later Update',desc:'Signature Fountain Plaza VIP keepsake & title.'},
];

const HAND_NAMES=['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush'];

function defaultRng(){
 if(typeof crypto==='object'&&crypto&&typeof crypto.getRandomValues==='function'){
  const buf=new Uint32Array(1);return()=>{crypto.getRandomValues(buf);return buf[0]/4294967296};
 }
 return Math.random;
}

function makeDeck(){const d=[];for(let r=2;r<=14;r++)for(const s of SUITS)d.push(RANKS[r]+s);return d;}
function shuffleDeck(rng=defaultRng()){const d=makeDeck();for(let i=d.length-1;i>0;i--){const j=Math.min(i,Math.floor(rng()*(i+1)));const t=d[i];d[i]=d[j];d[j]=t;}return d;}

function parseCard(c){
 if(typeof c!=='string'||c.length!==2)return null;
 const r=RANKS.indexOf(c[0]);if(r<2||!SUITS.includes(c[1]))return null;
 return {code:c,rank:r,suit:c[1]};
}

function eval5(five){
 const parsed=five.map(parseCard);if(parsed.some(x=>!x))return null;
 const ranks=parsed.map(c=>c.rank).sort((a,b)=>b-a);
 const flush=parsed.every(c=>c.suit===parsed[0].suit);
 const counts=new Map();for(const r of ranks)counts.set(r,(counts.get(r)||0)+1);
 const groups=[...counts.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
 let straightHigh=0;
 if(groups.length===5){
  if(ranks[0]-ranks[4]===4)straightHigh=ranks[0];
  else if(ranks[0]===14&&ranks[1]===5&&ranks[2]===4&&ranks[3]===3&&ranks[4]===2)straightHigh=5;
 }
 let cat=0,tie=ranks;
 if(flush&&straightHigh){cat=8;tie=[straightHigh,0,0,0,0];}
 else if(groups[0][1]===4){cat=7;tie=[groups[0][0],groups[1][0],0,0,0];}
 else if(groups[0][1]===3&&groups[1][1]===2){cat=6;tie=[groups[0][0],groups[1][0],0,0,0];}
 else if(flush){cat=5;tie=ranks;}
 else if(straightHigh){cat=4;tie=[straightHigh,0,0,0,0];}
 else if(groups[0][1]===3){cat=3;tie=[groups[0][0],groups[1][0],groups[2][0],0,0];}
 else if(groups[0][1]===2&&groups[1][1]===2){cat=2;tie=[groups[0][0],groups[1][0],groups[2][0],0,0];}
 else if(groups[0][1]===2){cat=1;tie=[groups[0][0],groups[1][0],groups[2][0],groups[3][0],0];}
 let score=cat;for(let i=0;i<5;i++)score=score*15+(tie[i]||0);
 const name=cat===8&&straightHigh===14?'Royal Flush':HAND_NAMES[cat];
 return {category:cat,name,tiebreak:tie,score,best5:five.slice()};
}

function evaluateHand(cards){
 if(!Array.isArray(cards)||cards.length<5)return null;
 const n=cards.length;let best=null;
 const pick=(start,chosen)=>{
  if(chosen.length===5){const r=eval5(chosen);if(r&&(!best||r.score>best.score))best=r;return;}
  for(let i=start;i<=n-(5-chosen.length);i++){chosen.push(cards[i]);pick(i+1,chosen);chosen.pop();}
 };
 pick(0,[]);return best;
}

function describePocket(hole){
 if(!Array.isArray(hole)||hole.length!==2)return '';
 const a=parseCard(hole[0]),b=parseCard(hole[1]);if(!a||!b)return '';
 const names={14:'Ace',13:'King',12:'Queen',11:'Jack',10:'Ten'};
 const label=r=>names[r]||String(r);
 if(a.rank===b.rank)return 'Pocket '+label(a.rank)+'s';
 const hi=Math.max(a.rank,b.rank),lo=Math.min(a.rank,b.rank);
 return label(hi)+'-'+label(lo)+(a.suit===b.suit?' Suited':'');
}

// Compute main & side pots from { key, id, name, isBot, amount, folded, score } entries in clockwise button-left order.
function computeSidePots(entries){
 const levels=[...new Set(entries.map(e=>Math.max(0,Math.floor(e.amount||0))).filter(v=>v>0))].sort((a,b)=>a-b);
 const pots=[];let prev=0;
 for(const lvl of levels){
  const contributors=entries.filter(e=>e.amount>=lvl);
  const amount=(lvl-prev)*contributors.length;
  prev=lvl;
  if(amount<=0)continue;
  const eligible=contributors.filter(e=>!e.folded);
  if(!eligible.length){
   if(pots.length)pots[pots.length-1].amount+=amount;
   continue;
  }
  const sig=eligible.map(e=>String(e.key)).join(',');
  if(pots.length&&pots[pots.length-1]._sig===sig)pots[pots.length-1].amount+=amount;
  else pots.push({amount,eligible,_sig:sig});
 }
 for(const p of pots)delete p._sig;
 return pots;
}

class HoldemTable{
 constructor({tableId=0,label='Table 1',dealerName='Dealer Vane',rng=defaultRng(),onLedger=()=>{},onCallout=()=>{},onKick=()=>{}}={}){
  this.tableId=tableId;this.label=label;this.dealerName=dealerName;
  this.rng=rng;this.onLedger=onLedger;this.onCallout=onCallout;this.onKick=onKick;
  this.seats=Array(6).fill(null);
  this.vsHouse=true;
  this.house={seat:'vane',id:'vane',name:dealerName,isBot:true,stack:DEFAULT_BUY_IN,hole:[],streetBet:0,totalBet:0,folded:false,allIn:false,lastTag:'',arrived:true};
  this.phase='idle'; // idle | starting | preflop | flop | turn | river | showdown
  this.handNo=0;this.seq=0;
  this.community=[];this.deck=[];
  this.buttonKey=null;this.sbKey=null;this.bbKey=null;this.turnKey=null;
  this.turnDeadline=0;this.nextPhaseAt=0;
  this.currentBet=0;this.minRaise=BIG_BLIND;this.pot=0;
  this.needAction=new Set();this.handOrder=[];
  this.winners=[];this.banner=`Sit at ${label} (${dealerName}) to start Hold'em.`;
 }

 humanSeats(){return this.seats.filter(Boolean);}
 findPlayer(id){return this.seats.find(s=>s&&s.id===id)||null;}

 sit(seatIndex,player,buyIn=DEFAULT_BUY_IN,now=Date.now(),arrived=true){
  const idx=Number(seatIndex);
  if(!Number.isInteger(idx)||idx<0||idx>=6)return {ok:false,error:'Choose a valid seat (1–6).'};
  if(this.seats[idx]&&this.seats[idx].id!==player.id)return {ok:false,error:'That seat is already taken.'};
  const existing=this.findPlayer(player.id);
  if(existing&&existing.seat!==idx){
   if(['preflop','flop','turn','river'].includes(this.phase)&&this.handOrder.includes(existing.seat))
    return {ok:false,error:'Finish or fold the current hand before changing seats.'};
   this.seats[existing.seat]=null;
  }
  const stack=Math.max(MIN_BUY_IN,Math.min(MAX_BUY_IN,Math.floor(Number(buyIn)||0)));
  if(Number(buyIn)<MIN_BUY_IN)return {ok:false,error:`Need at least ${MIN_BUY_IN} Plaza Chips to sit (visit Chip Bank to refill).`};
  this.seats[idx]={
   seat:idx,id:player.id,name:player.name||'Adventurer',isBot:false,
   stack,pendingAdd:0,hole:[],streetBet:0,totalBet:0,folded:false,allIn:false,
   missedTurns:0,bustedSince:0,
   lastTag:arrived?'Seated':'Walking…',arrived:!!arrived
  };
  this.seq++;
  this.checkSchedule(now);
  return {ok:true,seat:idx,stack};
 }

 markArrived(playerId,arrived,now=Date.now()){
  const p=this.findPlayer(playerId);if(!p)return false;
  if(p.arrived===!!arrived)return false;
  p.arrived=!!arrived;
  if(p.arrived&&p.lastTag==='Walking…')p.lastTag='Ready';
  this.seq++;
  this.checkSchedule(now);
  return true;
 }

 topUp(playerId,amount,now=Date.now()){
  const p=this.findPlayer(playerId);if(!p)return {ok:false,error:'Sit at the table first.'};
  const add=Math.max(0,Math.floor(Number(amount)||0));
  if(add<=0)return {ok:false,error:'Invalid chip amount.'};
  p.missedTurns=0;p.bustedSince=0;
  const activeHand=['preflop','flop','turn','river'].includes(this.phase)&&this.handOrder.includes(p.seat)&&!p.folded;
  if(activeHand){
   const roomLeft=Math.max(0,MAX_BUY_IN-(p.stack+p.pendingAdd));
   const applied=Math.min(roomLeft,add);
   p.pendingAdd+=applied;this.seq++;
   return {ok:true,added:applied,pending:true};
  }
  const roomLeft=Math.max(0,MAX_BUY_IN-p.stack);
  const applied=Math.min(roomLeft,add);
  p.stack+=applied;if(p.stack>=BIG_BLIND&&p.lastTag==='Needs Refill')p.lastTag='Ready';
  this.seq++;this.checkSchedule(now);
  return {ok:true,added:applied,pending:false};
 }

 kick(playerId,reason='afk',now=Date.now()){
  const p=this.findPlayer(playerId);if(!p)return false;
  const info={id:p.id,name:p.name,seat:p.seat,globalSeat:this.tableId*6+p.seat,tableId:this.tableId,reason};
  this.stand(playerId,now);
  this.banner=reason==='empty'?`${info.name} stood up (out of chips / idle).`:`${info.name} was auto-removed from ${this.label} (AFK).`;
  this.seq++;
  this.onKick(info);
  return true;
 }

 setHouse(enabled,now=Date.now()){
  this.vsHouse=!!enabled;this.seq++;
  if(!this.vsHouse&&this.phase==='starting'&&this.eligibleHumans().length<2){
   this.phase='idle';this.nextPhaseAt=0;this.banner='Waiting for another adventurer to take a seat…';
  }else this.checkSchedule(now);
  return true;
 }

 stand(playerId,now=Date.now()){
  const p=this.findPlayer(playerId);if(!p)return false;
  const seatKey=p.seat;
  const inLiveHand=['preflop','flop','turn','river'].includes(this.phase)&&this.handOrder.includes(seatKey)&&!p.folded;
  this.seats[seatKey]=null;
  this.seq++;
  if(inLiveHand){
   // Keep dead money in the pot for side-pot accounting; mark folded and advance if needed.
   p.folded=true;p.lastTag='Left';
   this.ghostBets=this.ghostBets||[];
   if(p.totalBet>0)this.ghostBets.push({key:'ghost-'+seatKey+'-'+p.id,id:p.id,name:p.name,isBot:false,amount:p.totalBet,folded:true});
   this.needAction.delete(seatKey);
   this.handOrder=this.handOrder.filter(k=>k!==seatKey);
   const contenders=this.activeParticipants().filter(x=>!x.folded);
   if(contenders.length<=1){
    if(contenders.length===1)this.finishByFold(contenders[0],now);
    else this.resetToIdle(now);
    return true;
   }
   if(this.turnKey===seatKey)this.advanceAfterAction(seatKey,now);
   else this.maybeAdvanceStreet(now);
  }else{
   this.handOrder=this.handOrder.filter(k=>k!==seatKey);
   this.checkSchedule(now);
  }
  return true;
 }

 participant(key){return key==='vane'?this.house:Number.isInteger(key)?this.seats[key]:null;}
 activeParticipants(){return this.handOrder.map(k=>this.participant(k)).filter(Boolean);}
 eligibleHumans(){return this.seats.filter(s=>s&&s.arrived&&(s.stack+s.pendingAdd)>=BIG_BLIND);}
 walkingHumans(){return this.seats.filter(s=>s&&!s.arrived);}

 resetToIdle(now){
  this.phase='idle';this.turnKey=null;this.turnDeadline=0;this.nextPhaseAt=0;
  this.community=[];this.pot=0;this.currentBet=0;this.handOrder=[];this.needAction.clear();this.ghostBets=[];
  const seated=this.humanSeats();
  if(!seated.length)this.banner=`Sit at ${this.label} (${this.dealerName}) to start Hold'em.`;
  else if(this.walkingHumans().length&&!this.eligibleHumans().length)this.banner=`Walking to ${this.label}…`;
  else if(!this.eligibleHumans().length)this.banner='Out of chips — open Chip Bank for your free daily refill or Zeny chips!';
  else this.banner=`Waiting for another adventurer (or enable Play vs. ${this.dealerName}).`;
  this.seq++;
 }

 checkSchedule(now=Date.now()){
  if(!['idle','starting'].includes(this.phase))return;
  for(const s of this.seats)if(s&&s.pendingAdd>0&&this.phase==='idle'){s.stack+=s.pendingAdd;s.pendingAdd=0;}
  for(const s of this.seats)if(s){
   if(s.arrived&&s.stack<BIG_BLIND){if(!s.bustedSince)s.bustedSince=now;}
   else s.bustedSince=0;
  }
  const humans=this.eligibleHumans();
  const canPlay=humans.length>=2||(humans.length===1&&this.vsHouse);
  if(!canPlay){
   if(this.phase==='starting'){this.phase='idle';this.nextPhaseAt=0;}
   const all=this.humanSeats();
   if(!all.length)this.banner=`Sit at ${this.label} (${this.dealerName}) to start Hold'em.`;
   else if(this.walkingHumans().length&&!humans.length)this.banner='Walking to the table — cards deal once seated…';
   else if(!humans.length)this.banner='Stack below 20 chips — open Chip Bank to refill!';
   else this.banner='Waiting for another adventurer to sit down…';
   return;
  }
  if(this.phase==='idle'){
   this.phase='starting';this.nextPhaseAt=now+DEAL_DELAY_MS;
   this.banner=humans.length>=2?`Players seated — ${this.dealerName} is shuffling…`:`Seated — dealing heads-up vs. ${this.dealerName}…`;
   this.seq++;
  }
 }

 startHand(now=Date.now()){
  for(const s of this.seats)if(s&&s.pendingAdd>0){s.stack=Math.min(MAX_BUY_IN,s.stack+s.pendingAdd);s.pendingAdd=0;}
  for(const s of this.seats)if(s&&s.arrived&&s.stack<BIG_BLIND)s.lastTag='Needs Refill';
  const humans=this.eligibleHumans();
  const useHouse=humans.length===1&&this.vsHouse;
  if(humans.length<2&&!useHouse){this.resetToIdle(now);return false;}
  const order=humans.map(s=>s.seat).sort((a,b)=>a-b);
  if(useHouse){
   if(this.house.stack<BIG_BLIND*5)this.house.stack=Math.max(DEFAULT_BUY_IN,Math.min(5000,humans[0].stack));
   order.push('vane');
  }
  this.handNo++;this.seq++;
  this.handOrder=order;this.ghostBets=[];this.winners=[];
  this.deck=shuffleDeck(this.rng);this.community=[];
  this.pot=0;this.currentBet=0;this.minRaise=BIG_BLIND;
  for(const key of order){
   const p=this.participant(key);
   p.hole=[this.deck.pop(),this.deck.pop()];
   p.streetBet=0;p.totalBet=0;p.folded=false;p.allIn=false;p.lastTag='';
  }
  // Rotate dealer button clockwise along handOrder.
  const prevIdx=order.indexOf(this.buttonKey);
  const btnIdx=prevIdx>=0?(prevIdx+1)%order.length:0;
  this.buttonKey=order[btnIdx];
  const headsUp=order.length===2;
  const sbIdx=headsUp?btnIdx:(btnIdx+1)%order.length;
  const bbIdx=headsUp?(btnIdx+1)%order.length:(btnIdx+2)%order.length;
  this.sbKey=order[sbIdx];this.bbKey=order[bbIdx];
  this.postBlind(this.participant(this.sbKey),SMALL_BLIND,'SB');
  this.postBlind(this.participant(this.bbKey),BIG_BLIND,'BB');
  this.currentBet=Math.max(this.participant(this.sbKey).streetBet,this.participant(this.bbKey).streetBet);
  this.minRaise=BIG_BLIND;
  this.phase='preflop';
  this.needAction=new Set(order.filter(k=>{const p=this.participant(k);return p&&!p.folded&&!p.allIn;}));
  const firstIdx=headsUp?btnIdx:(bbIdx+1)%order.length;
  this.turnKey=this.nextActingFrom(firstIdx,true);
  if(this.turnKey==null){this.runoutToShowdown(now);return true;}
  this.armTurn(now);
  this.banner=`Hand #${this.handNo} · Preflop`;
  return true;
 }

 postBlind(p,amount,label){
  const put=Math.min(p.stack,amount);
  p.stack-=put;p.streetBet+=put;p.totalBet+=put;this.pot+=put;
  if(p.stack===0)p.allIn=true;
  p.lastTag=`${label} ${put}`;
  if(!p.isBot&&put>0)this.onLedger(p.id,-put,'blind');
 }

 nextActingFrom(startIdx,inclusive=false){
  const n=this.handOrder.length;if(!n)return null;
  for(let step=inclusive?0:1;step<=n;step++){
   const k=this.handOrder[(startIdx+step)%n];
   if(this.needAction.has(k)){const p=this.participant(k);if(p&&!p.folded&&!p.allIn)return k;}
  }
  return null;
 }

 armTurn(now){
  const actor=this.participant(this.turnKey);
  if(!actor){this.turnDeadline=0;this.nextPhaseAt=0;return;}
  if(actor.isBot){this.turnDeadline=now+TURN_MS;this.nextPhaseAt=now+BOT_DELAY_MS;}
  else{this.turnDeadline=now+TURN_MS;this.nextPhaseAt=this.turnDeadline;}
 }

 act(playerId,action,amount=0,now=Date.now()){
  if(!['preflop','flop','turn','river'].includes(this.phase))return {ok:false,error:'No active betting round.'};
  const actor=this.participant(this.turnKey);
  if(!actor||actor.id!==playerId)return {ok:false,error:'Wait for your turn.'};
  actor.missedTurns=0;actor.bustedSince=0;
  return this.applyAction(actor,action,amount,now);
 }

 applyAction(actor,rawAction,amount,now){
  const action=String(rawAction||'').toLowerCase();
  const toCall=Math.max(0,this.currentBet-actor.streetBet);
  if(action==='fold'){
   actor.folded=true;actor.lastTag='Fold';this.needAction.delete(actor.seat);
  }else if(action==='check'){
   if(toCall>0)return {ok:false,error:`Must call ${toCall} or fold.`};
   actor.lastTag='Check';this.needAction.delete(actor.seat);
  }else if(action==='call'){
   if(toCall<=0){actor.lastTag='Check';this.needAction.delete(actor.seat);}
   else{
    const put=Math.min(actor.stack,toCall);
    actor.stack-=put;actor.streetBet+=put;actor.totalBet+=put;this.pot+=put;
    if(actor.stack===0)actor.allIn=true;
    if(!actor.isBot&&put>0)this.onLedger(actor.id,-put,'call');
    actor.lastTag=actor.allIn?'All-In':`Call ${put}`;
    this.needAction.delete(actor.seat);
   }
  }else if(action==='raise'){
   const maxTo=actor.streetBet+actor.stack;
   if(maxTo<=this.currentBet){
    if(actor.stack<=0)return {ok:false,error:'No chips left to raise.'};
    return this.applyAction(actor,'call',0,now);
   }
   const minTo=this.currentBet+this.minRaise;
   const target=maxTo<minTo?maxTo:Math.max(minTo,Math.min(maxTo,Math.floor(Number(amount)||minTo)));
   const put=target-actor.streetBet;
   const raiseDelta=target-this.currentBet;
   const prevBet=this.currentBet;
   actor.stack-=put;actor.streetBet=target;actor.totalBet+=put;this.pot+=put;
   if(actor.stack===0)actor.allIn=true;
   if(!actor.isBot&&put>0)this.onLedger(actor.id,-put,'raise');
   this.currentBet=target;
   if(raiseDelta>=this.minRaise){
    this.minRaise=raiseDelta;
    this.needAction=new Set(this.handOrder.filter(k=>{const p=this.participant(k);return p&&k!==actor.seat&&!p.folded&&!p.allIn;}));
   }else{
    for(const k of this.handOrder){const p=this.participant(k);if(p&&k!==actor.seat&&!p.folded&&!p.allIn&&p.streetBet<target)this.needAction.add(k);}
    this.needAction.delete(actor.seat);
   }
   actor.lastTag=actor.allIn?`All-In ${target}`:prevBet===0?`Bet ${target}`:`Raise ${target}`;
  }else return {ok:false,error:'Unknown poker action.'};

  this.seq++;
  this.advanceAfterAction(actor.seat,now);
  return {ok:true};
 }

 advanceAfterAction(lastSeatKey,now){
  const contenders=this.activeParticipants().filter(p=>!p.folded);
  if(contenders.length<=1){
   if(contenders.length===1)this.finishByFold(contenders[0],now);
   else this.resetToIdle(now);
   return;
  }
  const idx=Math.max(0,this.handOrder.indexOf(lastSeatKey));
  const next=this.nextActingFrom(idx,false);
  const canStillBet=contenders.filter(p=>!p.allIn);
  if(next==null||(canStillBet.length<=1&&canStillBet.every(p=>p.streetBet===this.currentBet))){
   this.maybeAdvanceStreet(now);
  }else{
   this.turnKey=next;
   this.armTurn(now);
  }
 }

 maybeAdvanceStreet(now){
  for(const p of this.activeParticipants())p.streetBet=0;
  this.currentBet=0;this.minRaise=BIG_BLIND;this.needAction.clear();
  const contenders=this.activeParticipants().filter(p=>!p.folded);
  const canBet=contenders.filter(p=>!p.allIn);
  if(canBet.length<2||this.phase==='river'){
   this.runoutToShowdown(now);
   return;
  }
  if(this.phase==='preflop'){this.phase='flop';this.community.push(this.deck.pop(),this.deck.pop(),this.deck.pop());}
  else if(this.phase==='flop'){this.phase='turn';this.community.push(this.deck.pop());}
  else if(this.phase==='turn'){this.phase='river';this.community.push(this.deck.pop());}
  for(const p of contenders)if(!p.allIn){p.lastTag='';this.needAction.add(p.seat);}
  const btnIdx=Math.max(0,this.handOrder.indexOf(this.buttonKey));
  this.turnKey=this.nextActingFrom(btnIdx,false);
  if(this.turnKey==null){this.runoutToShowdown(now);return;}
  this.armTurn(now);
  const streetLabel=this.phase[0].toUpperCase()+this.phase.slice(1);
  this.banner=`Hand #${this.handNo} · ${streetLabel}`;
  this.seq++;
 }

 runoutToShowdown(now){
  while(this.community.length<5)this.community.push(this.deck.pop());
  this.finishShowdown(now);
 }

 finishByFold(winner,now){
  const total=this.pot;
  winner.stack+=total;
  if(!winner.isBot&&total>0)this.onLedger(winner.id,total,'win');
  winner.lastTag=`+${total}`;
  this.winners=[{seat:winner.seat,id:winner.id,name:winner.name,amount:total,handName:'Uncontested Pot',best5:[]}];
  this.phase='showdown';this.foldedWin=true;
  this.turnKey=null;this.turnDeadline=0;this.nextPhaseAt=now+FOLD_WIN_MS;
  this.banner=`${winner.name} wins ${total.toLocaleString()} chips (others folded)`;
  this.seq++;
 }

 finishShowdown(now){
  this.foldedWin=false;
  const btnIdx=Math.max(0,this.handOrder.indexOf(this.buttonKey));
  const ordered=[];
  for(let i=1;i<=this.handOrder.length;i++){
   const p=this.participant(this.handOrder[(btnIdx+i)%this.handOrder.length]);
   if(p)ordered.push(p);
  }
  const evalMap=new Map();
  for(const p of ordered){
   if(!p.folded){
    const ev=evaluateHand([...p.hole,...this.community]);
    evalMap.set(p.seat,ev);
   }
  }
  const entries=[
   ...ordered.map(p=>({key:p.seat,seat:p.seat,id:p.id,name:p.name,isBot:!!p.isBot,amount:p.totalBet,folded:p.folded,eval:evalMap.get(p.seat)||null})),
   ...(this.ghostBets||[])
  ];
  const pots=computeSidePots(entries);
  const winTotals=new Map();
  for(const pot of pots){
   if(!pot.eligible.length)continue;
   let bestScore=-1;
   for(const e of pot.eligible)if(e.eval&&e.eval.score>bestScore)bestScore=e.eval.score;
   const tied=pot.eligible.filter(e=>e.eval&&e.eval.score===bestScore);
   const share=Math.floor(pot.amount/tied.length);
   let rem=pot.amount-share*tied.length;
   for(const w of tied){
    const gain=share+(rem>0?1:0);if(rem>0)rem--;
    const prev=winTotals.get(w.seat)||{seat:w.seat,id:w.id,name:w.name,isBot:w.isBot,amount:0,eval:w.eval};
    prev.amount+=gain;winTotals.set(w.seat,prev);
   }
  }
  this.winners=[];
  for(const w of winTotals.values()){
   const p=this.participant(w.seat);
   if(p){
    p.stack+=w.amount;
    p.lastTag=`+${w.amount}`;
    if(!p.isBot&&w.amount>0)this.onLedger(p.id,w.amount,'win');
   }
   this.winners.push({seat:w.seat,id:w.id,name:w.name,amount:w.amount,handName:w.eval?w.eval.name:'Winner',category:w.eval?w.eval.category:0,best5:w.eval?w.eval.best5:[]});
  }
  this.winners.sort((a,b)=>b.amount-a.amount);
  this.phase='showdown';this.turnKey=null;this.turnDeadline=0;this.nextPhaseAt=now+SHOWDOWN_MS;
  if(this.winners.length===1){
   const w=this.winners[0];
   this.banner=`${w.name} wins ${w.amount.toLocaleString()} chips · ${w.handName}!`;
  }else if(this.winners.length>1){
   this.banner=`Split pot · ${this.winners.map(w=>`${w.name} (+${w.amount})`).join(' · ')}`;
  }
  const top=this.winners.find(w=>w.seat!=='vane')||this.winners[0];
  if(top&&(top.category>=6||this.pot>=1000)){
   this.onCallout(`🃏 ${top.handName}! ${top.name} scoops ${top.amount.toLocaleString()} Plaza Chips at the Hold'em table!`);
  }
  this.seq++;
 }

 chooseBotAction(){
  const bot=this.house,toCall=Math.max(0,this.currentBet-bot.streetBet);
  const a=parseCard(bot.hole[0]),b=parseCard(bot.hole[1]);
  let strength=0.35;
  if(this.community.length>=3){
   const ev=evaluateHand([...bot.hole,...this.community]);
   strength=ev?Math.min(1,0.18+ev.category*0.16+(ev.tiebreak[0]||0)/60):0.3;
  }else if(a&&b){
   const hi=Math.max(a.rank,b.rank),lo=Math.min(a.rank,b.rank);
   strength=(hi/14)*0.45+(lo/14)*0.2+(a.rank===b.rank?0.32:0)+(a.suit===b.suit?0.06:0)+(hi-lo===1?0.04:0);
  }
  const roll=this.rng();
  if(toCall===0){
   if(strength>0.62&&bot.stack>=BIG_BLIND&&roll<0.65){
    const size=Math.max(this.currentBet+this.minRaise,Math.min(bot.streetBet+bot.stack,Math.round(Math.max(BIG_BLIND*2,this.pot*0.6)/10)*10));
    return {action:'raise',amount:size};
   }
   return {action:'check',amount:0};
  }
  const potOdds=toCall/Math.max(1,this.pot+toCall);
  if(strength+roll*0.18<potOdds*0.95&&toCall>BIG_BLIND)return {action:'fold',amount:0};
  if(strength>0.78&&bot.stack>toCall+this.minRaise&&roll<0.45){
   const size=Math.max(this.currentBet+this.minRaise,Math.min(bot.streetBet+bot.stack,this.currentBet+Math.max(this.minRaise,Math.round(this.pot*0.75/10)*10)));
   return {action:'raise',amount:size};
  }
  return {action:'call',amount:0};
 }

 nextDeadline(){
  let d=0;
  if(this.phase==='starting'||this.phase==='showdown')d=this.nextPhaseAt||0;
  else if(['preflop','flop','turn','river'].includes(this.phase))d=this.nextPhaseAt||this.turnDeadline||0;
  for(const s of this.seats){
   if(s&&s.bustedSince){
    const bd=s.bustedSince+AFK_BUST_MS;
    if(!d||bd<d)d=bd;
   }
  }
  return d;
 }

 tick(now=Date.now()){
  let changed=false;
  for(const s of this.seats.slice()){
   if(s&&s.arrived&&s.stack<BIG_BLIND&&!['preflop','flop','turn','river'].includes(this.phase)){
    if(!s.bustedSince)s.bustedSince=now;
    else if(now-s.bustedSince>=AFK_BUST_MS){this.kick(s.id,'empty',now);changed=true;}
   }else if(s&&s.stack>=BIG_BLIND)s.bustedSince=0;
  }
  for(let guard=0;guard<8;guard++){
   if(this.phase==='starting'&&this.nextPhaseAt&&now>=this.nextPhaseAt){
    this.startHand(now);changed=true;continue;
   }
   if(this.phase==='showdown'&&this.nextPhaseAt&&now>=this.nextPhaseAt){
    this.phase='idle';this.nextPhaseAt=0;this.checkSchedule(now);
    if(this.phase==='starting'&&this.nextPhaseAt&&now>=this.nextPhaseAt)continue;
    changed=true;break;
   }
   if(['preflop','flop','turn','river'].includes(this.phase)){
    const actor=this.participant(this.turnKey);
    if(!actor){this.resetToIdle(now);changed=true;break;}
    if(actor.isBot&&this.nextPhaseAt&&now>=this.nextPhaseAt){
     const pick=this.chooseBotAction();
     this.applyAction(actor,pick.action,pick.amount,now);changed=true;continue;
    }
    if(!actor.isBot&&this.turnDeadline&&now>=this.turnDeadline){
     const actorId=actor.id;
     actor.missedTurns=(actor.missedTurns||0)+1;
     const toCall=Math.max(0,this.currentBet-actor.streetBet);
     this.applyAction(actor,toCall===0?'check':'fold',0,now);
     if(actor.missedTurns>=AFK_MAX_TIMEOUTS){
      this.kick(actorId,'afk',now);
     }else{
      actor.lastTag=`AFK ${actor.missedTurns}/${AFK_MAX_TIMEOUTS}`;
     }
     changed=true;continue;
    }
   }
   break;
  }
  if(changed)this.seq++;
  return changed;
 }

 snapshotFor(viewerId,now=Date.now()){
  const inHand=k=>this.handOrder.includes(k);
  const revealAll=this.phase==='showdown'&&!this.foldedWin;
  const formatSeat=s=>{
   if(!s)return null;
   const mine=s.id===viewerId;
   const active=inHand(s.seat)&&this.phase!=='idle'&&this.phase!=='starting';
   const showCards=active&&s.hole.length===2&&(mine||(revealAll&&!s.folded));
   const cards=showCards?s.hole.slice():active&&s.hole.length===2&&!s.folded?['??','??']:[];
   let handHint='';
   if(mine&&s.hole.length===2&&active&&!s.folded){
    if(this.community.length>=3){const ev=evaluateHand([...s.hole,...this.community]);if(ev)handHint=ev.name;}
    else handHint=describePocket(s.hole);
   }else if(showCards&&this.community.length===5){
    const ev=evaluateHand([...s.hole,...this.community]);if(ev)handHint=ev.name;
   }
   return {
    seat:s.seat,globalSeat:typeof s.seat==='number'?this.tableId*6+s.seat:null,
    id:s.id,name:s.name,isBot:!!s.isBot,
    stack:s.stack,pendingAdd:s.pendingAdd||0,arrived:!!s.arrived,
    inHand:active,folded:!!s.folded,allIn:!!s.allIn,
    missedTurns:s.missedTurns||0,
    streetBet:s.streetBet||0,totalBet:s.totalBet||0,
    cards,handHint,lastTag:s.lastTag||'',
    isDealer:this.buttonKey===s.seat,isSB:this.sbKey===s.seat,isBB:this.bbKey===s.seat,
    isTurn:this.turnKey===s.seat&&['preflop','flop','turn','river'].includes(this.phase)
   };
  };
  const houseActive=inHand('vane')&&(this.phase!=='idle'&&this.phase!=='starting');
  const mySeat=this.seats.find(s=>s&&s.id===viewerId)||null;
  const isMyTurn=!!(mySeat&&this.turnKey===mySeat.seat&&['preflop','flop','turn','river'].includes(this.phase));
  const toCall=mySeat?Math.max(0,this.currentBet-mySeat.streetBet):0;
  const maxTo=mySeat?mySeat.streetBet+mySeat.stack:0;
  const minRaiseTo=mySeat?Math.min(maxTo,this.currentBet+this.minRaise):0;
  const turnActor=this.participant(this.turnKey);
  return {
   tableId:this.tableId,tableLabel:this.label,dealerName:this.dealerName,
   seq:this.seq,handNo:this.handNo,phase:this.phase,banner:this.banner,
   vsHouse:this.vsHouse,pot:this.pot,currentBet:this.currentBet,minRaise:this.minRaise,
   community:this.community.slice(),
   seats:this.seats.map(formatSeat),
   house:houseActive||(this.eligibleHumans().length===1&&this.vsHouse)?formatSeat(this.house):null,
   seatedCount:this.humanSeats().length,
   turnSeat:this.turnKey,turnName:turnActor?turnActor.name:'',
   turnLeftMs:this.turnDeadline?Math.max(0,this.turnDeadline-now):0,
   phaseLeftMs:this.nextPhaseAt?Math.max(0,this.nextPhaseAt-now):0,
   winners:this.winners,
   me:mySeat?{seat:mySeat.seat,globalSeat:this.tableId*6+mySeat.seat,stack:mySeat.stack,pendingAdd:mySeat.pendingAdd||0,missedTurns:mySeat.missedTurns||0,afkMax:AFK_MAX_TIMEOUTS,isTurn:isMyTurn,toCall,minRaiseTo,maxTo,canCheck:toCall===0,canRaise:maxTo>this.currentBet}:null
  };
 }
}

return {
 SMALL_BLIND,BIG_BLIND,MIN_BUY_IN,DEFAULT_BUY_IN,MAX_BUY_IN,
 STARTING_CHIPS,DAILY_FREE_CHIPS,TURN_MS,DEAL_DELAY_MS,SHOWDOWN_MS,
 AFK_MAX_TIMEOUTS,AFK_BUST_MS,
 ZENY_PACKS,GIFT_EXCHANGE_PREVIEW,HAND_NAMES,
 makeDeck,shuffleDeck,parseCard,evaluateHand,describePocket,computeSidePots,HoldemTable
};
});
