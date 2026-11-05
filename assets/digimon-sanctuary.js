/* Separate, casual Sanctuary rules. Client-authored progress is NOT PvP authority. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PGDigimonSanctuary=api})(globalThis,function(){
'use strict';
const LINES={agumon:['agumon','greymon','metalgreymon','wargreymon'],gabumon:['gabumon','garurumon','weregarurumon','metalgarurumon'],patamon:['patamon','angemon','magnaangemon','seraphimon'],palmon:['palmon','togemon','lillymon','rosemon']};
const STARTERS=Object.keys(LINES),SPECIES=Object.values(LINES).flat(),STATS=['power','guard','agility','focus'],DURATION=15000;
const cap=(n,min,max)=>Math.max(min,Math.min(max,Math.floor(Number.isFinite(Number(n))?Number(n):min)));
const total=p=>STATS.reduce((a,k)=>a+p.stats[k],0);
function freshPartner(){return {stage:0,stats:{power:0,guard:0,agility:0,focus:0},fatigue:0,fullness:70,mastery:0,wins:0,xp:0,training:null,battle:null}}
function normalize(raw){
 if(raw&&typeof raw==='object'&&Number(raw.v)>1)return null;
 const state={v:1,partners:{}};
 for(const line of STARTERS){const p=raw?.partners?.[line]||{},q=freshPartner();q.stage=cap(p.stage,0,3);q.fatigue=cap(p.fatigue,0,100);q.fullness=cap(p.fullness??70,0,100);q.mastery=cap(p.mastery,0,6);q.wins=cap(p.wins,0,999);q.xp=cap(p.xp,0,3996);for(const k of STATS)q.stats[k]=cap(p.stats?.[k],0,12);
  if(p.training&&STATS.includes(p.training.stat)&&Number.isFinite(p.training.ends)&&p.training.ends>=0)q.training={stat:p.training.stat,ends:p.training.ends};
  const b=p.battle;if(b&&SPECIES.includes(b.opponent)&&['active','win','loss'].includes(b.status)&&Number.isFinite(b.deadline))q.battle={opponent:b.opponent,hp:cap(b.hp,0,200),maxHp:cap(b.maxHp,1,200),enemyHp:cap(b.enemyHp,0,200),enemyMaxHp:cap(b.enemyMaxHp,1,200),energy:cap(b.energy,0,5),turn:cap(b.turn,0,500),status:b.status,deadline:b.deadline,log:typeof b.log==='string'?b.log.slice(0,180):''};
  state.partners[line]=q;
 }
 return state;
}
function species(raw,line){if(!STARTERS.includes(line))return null;const s=normalize(raw);return s?LINES[line][s.partners[line].stage]:line}
function requirements(p){const needed=[4,10,18][p.stage],wins=[2,5,9][p.stage];return p.stage>=3?null:{points:needed,wins,ready:total(p)>=needed&&p.wins>=wins}}
function update(raw,now){const state=normalize(raw);if(!state)return {state:null,changed:false};let changed=false;now=Number.isFinite(now)?now:Date.now();
 for(const line of STARTERS){const p=state.partners[line];if(p.training&&now>=p.training.ends){const stat=p.training.stat;p.training=null;if(p.stats[stat]<12&&total(p)<24){p.stats[stat]++;p.fatigue=cap(p.fatigue+10,0,100);p.fullness=cap(p.fullness-5,0,100)}changed=true}
  if(p.battle?.status==='active'&&now>=p.battle.deadline){p.battle.status='loss';p.battle.log='Time is up. Your partner can try again.';changed=true}}
 return {state,changed};
}
function act(raw,line,action,now){now=Number.isFinite(now)?now:Date.now();const u=update(raw,now),state=u.state;if(!state||!STARTERS.includes(line))return {ok:false,state,changed:u.changed,message:'Sanctuary data is unavailable.'};const p=state.partners[line],done=(message)=>({ok:true,state,changed:true,message}),fail=message=>({ok:false,state,changed:u.changed,message});
 if(!action||typeof action!=='object')return fail('Choose an action.');
 if(action.type==='feed'){if(p.fullness>=100)return fail('Your partner is already full.');p.fullness=cap(p.fullness+25,0,100);return done('Your partner enjoyed a meal.')}
 if(action.type==='rest'){if(p.fatigue===0)return fail('Your partner is already rested.');p.fatigue=cap(p.fatigue-30,0,100);return done('Your partner rested and recovered.')}
 if(action.type==='train'){const stat=action.stat;if(!STATS.includes(stat))return fail('Choose a training stat.');if(p.training||p.battle?.status==='active')return fail('Finish the current activity first.');if(p.stats[stat]>=12||total(p)>=24)return fail('Training cap reached.');if(p.fatigue>=80)return fail('Your partner needs to rest first.');if(p.fullness<10)return fail('Feed your partner before training.');p.training={stat,ends:now+DURATION};return done('Training started. It completes in 15 seconds.')}
 if(action.type==='mastery'){if(p.mastery>=6||total(p)<(p.mastery+1)*4)return fail('Train four more points for the next mastery.');p.mastery++;return done('Mastery improved without changing form.')}
 if(action.type==='evolve'){if(p.training||p.battle?.status==='active')return fail('Finish the current activity first.');const req=requirements(p);if(!req||!req.ready)return fail('Evolution requirements are not met.');p.stage++;return done('Your partner evolved into '+LINES[line][p.stage]+'.')}
 if(action.type==='startBattle'){if(p.training||p.battle?.status==='active')return fail('Finish the current activity first.');const level=Math.min(4,Math.floor(p.wins/2)),enemyLine=STARTERS[(STARTERS.indexOf(line)+1+level)%STARTERS.length],opponent=LINES[enemyLine][Math.min(2,Math.floor(p.wins/3))],maxHp=100+p.stats.guard*5,enemyMaxHp=45+level*12;p.battle={opponent,hp:maxHp,maxHp,enemyHp:enemyMaxHp,enemyMaxHp,energy:2,turn:0,status:'active',deadline:now+90000,log:'A friendly spar begins. Choose a command.'};return done('Spar started. No items or currency are at stake.')}
 if(action.type==='battle'){const b=p.battle;if(!b||b.status!=='active')return fail('No active spar.');if(!['attack','guard','special'].includes(action.command))return fail('Choose a valid command.');if(action.command==='special'&&b.energy<2)return fail('Special needs 2 energy.');let damage=0;if(action.command==='attack')damage=9+p.stats.power*2+p.mastery;if(action.command==='special'){damage=20+p.stats.focus*2+p.mastery;b.energy-=2}if(action.command==='guard')b.energy=Math.min(5,b.energy+1);b.enemyHp=Math.max(0,b.enemyHp-damage);b.turn++;if(!b.enemyHp){b.status='win';b.log='Victory! Your partner won a friendly spar.';p.wins=cap(p.wins+1,0,999);return done(b.log)}const level=Math.min(4,Math.floor(p.wins/2));let incoming=Math.max(2,8+level*2-Math.floor(p.stats.guard/2));if(action.command==='guard')incoming=Math.max(1,Math.floor(incoming/2));const evadeEvery=Math.max(2,8-Math.floor(p.stats.agility/2));if(p.stats.agility>0&&b.turn%evadeEvery===0)incoming=0;b.hp=Math.max(0,b.hp-incoming);b.log=(damage?'You dealt '+damage+' damage. ':'You guarded and gained energy. ')+(incoming?'Opponent dealt '+incoming+'.':'Your partner evaded the attack.');if(!b.hp){b.status='loss';b.log='Your partner was defeated. Rest and try again.'}return done(b.log)}
 if(action.type==='endBattle'){if(!p.battle)return fail('No spar to close.');p.battle=null;return done('Spar closed.')}
 return fail('Unknown Sanctuary action.');
}
// A completed live-world session uses the same limits as the old timed prototype,
// but does not persist a timer that could finish while the scene is closed.
function completeWorldTraining(raw,line,stat,now){
 const start=act(raw,line,{type:'train',stat},now);if(!start.ok)return start;
 start.state.partners[line].training.ends=now;
 const finished=update(start.state,now);finished.state.partners[line].xp=cap(finished.state.partners[line].xp+1,0,3996);return {ok:true,state:finished.state,changed:true,message:stat[0].toUpperCase()+stat.slice(1)+' training complete: +1 point.'};
}
const level=p=>1+Math.floor(cap(p?.xp,0,3996)/4);
return {LINES,STARTERS,STATS,DURATION,level,normalize,update,act,species,total,requirements,completeWorldTraining};
});
