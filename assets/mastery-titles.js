/* Cosmetic title challenges. The existing Index XP ranks and their Crit rewards stay separate. */
(function(root){
'use strict';
const RANK_SYMBOLS={
  'field-initiate':47,'field-scout':45,'midgard-vanguard':29,'midgard-tracker':13,
  'dungeon-reaper':19,'rift-warden':25,'abyss-stalker':35,'dark-lords-bane':32,
  'midgard-champion':44,'valkyries-chosen':43
};
// Each challenge has an independent, stable save ID and one of the owner's 50 symbols.
// A mastered class means a non-Novice job at its own maximum job level.
const CHALLENGES=[
  {id:'mythic-edge',name:'Mythic Edge',category:'forge',metric:'weapon',goal:15,symbol:49,description:'Reach +15 refinement on any weapon.'},
  {id:'thanatos-end',name:"Thanatos' End",category:'hunt',metric:'thanatos',goal:10000,symbol:15,description:'Defeat Memory of Thanatos 10,000 times.'},
  {id:'master-of-five',name:'Master of Five',category:'class',metric:'classes',goal:5,symbol:4,description:'Master five different non-Novice classes at their maximum Job level.'},
  {id:'tempered-edge',name:'Tempered Edge',category:'forge',metric:'weapon',goal:5,symbol:9,description:'Reach +5 refinement on any weapon.'},
  {id:'masterwork',name:'Masterwork',category:'forge',metric:'weapon',goal:10,symbol:21,description:'Reach +10 refinement on any weapon.'},
  {id:'ascendant-blade',name:'Ascendant Blade',category:'forge',metric:'weapon',goal:12,symbol:28,description:'Reach +12 refinement on any weapon.'},
  {id:'gilded-guard',name:'Gilded Guard',category:'forge',metric:'armor',goal:10,symbol:11,description:'Reach +10 refinement on any armor, headgear, shield or legwear.'},
  {id:'unbroken',name:'Unbroken',category:'forge',metric:'armor',goal:15,symbol:24,description:'Reach +15 refinement on any armor, headgear, shield or legwear.'},
  {id:'thanatos-echo',name:'Echo of Thanatos',category:'hunt',metric:'thanatos',goal:1,symbol:6,description:'Defeat Memory of Thanatos once.'},
  {id:'memory-breaker',name:'Memory Breaker',category:'hunt',metric:'thanatos',goal:100,symbol:5,description:'Defeat Memory of Thanatos 100 times.'},
  {id:'abyssal-requiem',name:'Abyssal Requiem',category:'hunt',metric:'thanatos',goal:1000,symbol:20,description:'Defeat Memory of Thanatos 1,000 times.'},
  {id:'embers-bane',name:"Ember's Bane",category:'hunt',metric:'ifrit',goal:1,symbol:26,description:'Defeat Ifrit once.'},
  {id:'godslayer',name:'Godslayer',category:'hunt',metric:'ifrit',goal:1000,symbol:38,description:'Defeat Ifrit 1,000 times.'},
  {id:'darkness-undone',name:'Darkness Undone',category:'hunt',metric:'darklord',goal:1000,symbol:48,description:'Defeat Dark Lord 1,000 times.'},
  {id:'dragon-hunter',name:'Dragon Hunter',category:'hunt',metric:'dragon',goal:1000,symbol:8,description:'Defeat Dragon Lord 1,000 times.'},
  {id:'crimson-hunter',name:'Crimson Hunter',category:'hunt',metric:'kills',goal:10000,symbol:18,description:'Defeat 10,000 monsters in total.'},
  {id:'relentless',name:'Relentless',category:'hunt',metric:'kills',goal:100000,symbol:14,description:'Defeat 100,000 monsters in total.'},
  {id:'eternal-hunt',name:'Eternal Hunt',category:'hunt',metric:'kills',goal:1000000,symbol:50,description:'Defeat 1,000,000 monsters in total.'},
  {id:'first-mastery',name:'First Mastery',category:'class',metric:'classes',goal:1,symbol:34,description:'Master one non-Novice class at its maximum Job level.'},
  {id:'triple-discipline',name:'Triple Discipline',category:'class',metric:'classes',goal:3,symbol:22,description:'Master three different non-Novice classes at their maximum Job level.'},
  {id:'tenfold-master',name:'Tenfold Master',category:'class',metric:'classes',goal:10,symbol:36,description:'Master ten different non-Novice classes at their maximum Job level.'},
  {id:'grand-polymath',name:'Grand Polymath',category:'class',metric:'classes',goal:20,symbol:40,description:'Master twenty different non-Novice classes at their maximum Job level.'},
  {id:'ascended-master',name:'Ascended Master',category:'class',metric:'fourth',goal:1,symbol:1,description:'Reach maximum Job level on a fourth-job class.'},
  {id:'celestial-council',name:'Celestial Council',category:'class',metric:'fourth',goal:5,symbol:10,description:'Reach maximum Job level on five different fourth-job classes.'},
  {id:'first-frontier',name:'First Frontier',category:'explore',metric:'clears',goal:1,symbol:3,description:'Clear the final normal stage of one map.'},
  {id:'wayfarer',name:'Wayfarer',category:'explore',metric:'clears',goal:5,symbol:17,description:'Clear the final normal stage of five different maps.'},
  {id:'midgard-explorer',name:'Midgard Explorer',category:'explore',metric:'clears',goal:10,symbol:39,description:'Clear the final normal stage of ten different maps.'},
  {id:'worlds-end',name:"World's End",category:'explore',metric:'clears',goal:12,symbol:7,description:'Clear the final normal stage of all twelve maps.'},
  {id:'creature-scholar',name:'Creature Scholar',category:'explore',metric:'discovered',goal:25,symbol:12,description:'Record 25 different monster species in the Index.'},
  {id:'living-atlas',name:'Living Atlas',category:'explore',metric:'discovered',goal:75,symbol:30,description:'Record 75 different monster species in the Index.'},
  {id:'myriad-seeker',name:'Myriad Seeker',category:'explore',metric:'discovered',goal:100,symbol:27,description:'Record 100 different monster species in the Index.'},
  {id:'card-apprentice',name:'Card Apprentice',category:'mastery',metric:'cardRanks',goal:5,symbol:46,description:'Earn 5 Card Mastery ranks.'},
  {id:'arcane-collector',name:'Arcane Collector',category:'mastery',metric:'cardRanks',goal:25,symbol:16,description:'Earn 25 Card Mastery ranks.'},
  {id:'card-archivist',name:'Card Archivist',category:'mastery',metric:'cardRanks',goal:100,symbol:31,description:'Earn 100 Card Mastery ranks.'},
  {id:'living-grimoire',name:'Living Grimoire',category:'mastery',metric:'cardRanks',goal:250,symbol:42,description:'Earn 250 Card Mastery ranks.'},
  {id:'perfect-hunter',name:'Perfect Hunter',category:'mastery',metric:'finishedSpecies',goal:5,symbol:33,description:'Reach 50,000 recorded kills on each of five monster species.'},
  {id:'stormbound',name:'Stormbound',category:'journey',metric:'baseLevel',goal:100,symbol:41,description:'Reach Base Level 100 on any class.'},
  {id:'eclipsed-limit',name:'Eclipsed Limit',category:'journey',metric:'baseLevel',goal:150,symbol:2,description:'Reach Base Level 150 on any class.'},
  {id:'echo-beginner',name:'Echo Beginner',category:'journey',metric:'echoRuns',goal:1,symbol:37,description:'Use one ranked Endless Echo attempt (finishing or leaving after the grace period).'},
  {id:'echo-veteran',name:'Echo Veteran',category:'journey',metric:'echoRuns',goal:100,symbol:23,description:'Use 100 ranked Endless Echo attempts (finishing or leaving after the grace period).'},
  {id:'rift-clearer',name:'Rift Clearer',category:'raid',metric:'raidClears',goal:1,symbol:50,description:'Clear the Rift Sovereign once.'},
  {id:'sovereign-breaker',name:'Sovereign Breaker',category:'raid',metric:'raidClears',goal:3,symbol:49,description:'Clear the Rift Sovereign three times.'},
  {id:'fracture-veteran',name:'Fracture Veteran',category:'raid',metric:'raidClears',goal:6,symbol:43,description:'Clear the Rift Sovereign six times.'},
  {id:'eternal-warden',name:'Eternal Warden',category:'raid',metric:'raidClears',goal:10,symbol:32,description:'Clear the Rift Sovereign ten times.'}
];
const BY_ID=Object.assign(Object.create(null),Object.fromEntries(CHALLENGES.map(t=>[t.id,t])));
const FILTERS=[['all','All titles'],['earned','Earned'],['rank','Hunt ranks'],['hunt','Boss & hunts'],['raid','Rift Raid'],['forge','Forge'],['class','Classes'],['explore','Exploration'],['mastery','Mastery'],['journey','Journey']];
const LABELS={rank:'Hunt rank',hunt:'Hunt challenge',raid:'Rift Raid challenge',forge:'Forge challenge',class:'Class challenge',explore:'Exploration challenge',mastery:'Mastery challenge',journey:'Journey challenge'};
const count=v=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(n))):0};
const e=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const xpOf=state=>Number.isFinite(Number(state?.indexXp))?count(state.indexXp):count(state?.kills);
const symbolOf=t=>t&&(t.symbol||RANK_SYMBOLS[t.id]);
const icon=(t,eager=false)=>{const n=symbolOf(t);return n?`<img class="title-symbol" src="assets/title-symbols/${String(n).padStart(2,'0')}.webp" alt="" loading="${eager?'eager':'lazy'}" decoding="async">`:''};

function metrics(state,classes){
  state=state&&typeof state==='object'?state:{};classes=classes&&typeof classes==='object'?classes:{};
  const best=state.titleBest&&typeof state.titleBest==='object'?state.titleBest:{};
  let weapon=Math.min(15,count(best.weapon)),armor=Math.min(15,count(best.armor));
  const equipment=[...Object.values(state.eq&&typeof state.eq==='object'?state.eq:{}),...(Array.isArray(state.inv)?state.inv:[])];
  for(const item of equipment){if(!item||typeof item!=='object')continue;const rank=Math.min(15,count(item.r));
    if(item.slot==='weapon')weapon=Math.max(weapon,rank);
    else if(['armor','head','off','leg'].includes(item.slot))armor=Math.max(armor,rank);
  }
  let classesDone=0,fourth=0;
  for(const [name,job] of Object.entries(state.jobs&&typeof state.jobs==='object'?state.jobs:{})){
    const cls=classes[name];if(name==='Novice'||!cls||!job||!Number.isFinite(Number(cls.mj))||Number(cls.mj)<1)continue;
    if(count(job.jl)>=Number(cls.mj)){classesDone++;if(Number(cls.tier)>=4)fourth++;}
  }
  const ledger=state.mobKills&&typeof state.mobKills==='object'&&!Array.isArray(state.mobKills)?state.mobKills:{};
  const counts=Object.values(ledger).map(count);
  const mastery=state.cardIndex&&state.cardIndex.mastery&&typeof state.cardIndex.mastery==='object'?state.cardIndex.mastery:{};
  const cardRanks=Object.values(mastery).reduce((sum,n)=>sum+Math.min(5,count(n)),0);
  const baseLevel=Object.values(state.base&&typeof state.base==='object'?state.base:{}).reduce((max,rec)=>Math.max(max,count(rec&&rec.lv)),count(state.lv));
  return {weapon,armor,classes:classesDone,fourth,thanatos:count(ledger['10:Memory of Thanatos']),ifrit:count(ledger['11:Ifrit']),darklord:count(ledger['9:Dark Lord']),dragon:count(ledger['6:Dragon Lord']),
    kills:count(state.kills),clears:Array.isArray(state.mapClears)?state.mapClears.filter(x=>x===true).length:0,
    discovered:counts.filter(n=>n>0).length,finishedSpecies:counts.filter(n=>n>=50000).length,cardRanks,
    baseLevel,echoRuns:count(state.trial&&state.trial.runs),raidClears:count(state.raidClears)};
}
function progress(title,state,classes,snapshot){
  if(!title)return 0;
  if(Number.isFinite(Number(title.xp)))return xpOf(state);
  return count((snapshot||metrics(state,classes))[title.metric]);
}
function unlocked(title,state,classes,snapshot){
  if(!title||!state)return false;
  if(BY_ID[title.id]&&Array.isArray(state.titleAwards)&&state.titleAwards.includes(title.id))return true;
  const goal=Number.isFinite(Number(title.xp))?count(title.xp):count(title.goal);
  return goal>0&&progress(title,state,classes,snapshot)>=goal;
}
// Save a bounded list of earned challenges and the best observed weapon/armor refines.
// Existing saves can earn from their surviving ledgers and currently owned equipment.
function sync(state,classes){
  if(!state||typeof state!=='object'||Array.isArray(state))return [];
  const m=metrics(state,classes);
  state.titleBest={weapon:m.weapon,armor:m.armor};
  const awarded=new Set((Array.isArray(state.titleAwards)?state.titleAwards:[]).filter(id=>typeof id==='string'&&BY_ID[id]));
  const added=[];
  for(const t of CHALLENGES)if(m[t.metric]>=t.goal&&!awarded.has(t.id)){awarded.add(t.id);added.push(t.id)}
  state.titleAwards=[...awarded];
  return added;
}
function find(id,ranks){return (Array.isArray(ranks)?ranks:[]).find(t=>t.id===id)||BY_ID[id]||null;}
// The plaza already sends a sanitized title name in its look message. Resolve only
// locally known names to artwork, without adding an ID or any extra room traffic.
function findByName(name,ranks){return typeof name==='string'&&name?CHALLENGES.find(t=>t.name===name)||(Array.isArray(ranks)?ranks:[]).find(t=>t.name===name)||null:null;}
function requirement(t){return !t?'':Number.isFinite(Number(t.xp))?`${count(t.xp).toLocaleString()} Index XP`:t.description||'';}

// This markup is shared by the real Mastery Index and the focused review page.
function renderCollection(state,classes,ranks,crit,filter='all'){
  state=state||{};ranks=Array.isArray(ranks)?ranks:[];crit=Array.isArray(crit)?crit:[];
  if(!FILTERS.some(row=>row[0]===filter))filter='all';
  const m=metrics(state,classes),entries=[...CHALLENGES,...ranks.map((t,i)=>({...t,category:'rank',goal:t.xp,description:`Earn ${count(t.xp).toLocaleString()} Index XP.`,bonus:crit[i]}))];
  const earned=entries.filter(t=>unlocked(t,state,classes,m)).length;
  const selected=entries.find(t=>t.id===state.equippedTitle&&unlocked(t,state,classes,m));
  const visible=entries.filter(t=>filter==='all'||(filter==='earned'?unlocked(t,state,classes,m):t.category===filter));
  const filters=FILTERS.map(([id,label])=>`<button type="button" data-a="titlefilter" data-v="${id}" class="${id===filter?'on':''}" aria-pressed="${id===filter}">${label}</button>`).join('');
  const cards=visible.map(t=>{
    const isEarned=unlocked(t,state,classes,m),isEquipped=selected?.id===t.id,goal=count(t.goal),raw=progress(t,state,classes,m),value=isEarned?Math.max(goal,raw):raw,pct=Math.min(100,goal?value/goal*100:0);
    const progressText=isEarned?'Challenge complete':`${Math.min(value,goal).toLocaleString()} / ${goal.toLocaleString()}${t.category==='rank'?' XP':''}`;
    return `<article class="tc-card${isEarned?' is-earned':' is-locked'}${isEquipped?' is-equipped':''}" data-title-id="${e(t.id)}">
      <div class="tc-symbol">${icon(t)}</div><div class="tc-copy"><div class="tc-kicker">${e(LABELS[t.category])}${t.bonus?` <span>+${e(t.bonus)}% Index Crit</span>`:''}</div><h3>${e(t.name)}</h3><p>${e(t.description)}</p>
      <div class="tc-progress-label"><span>${e(progressText)}</span><span>${isEquipped?'EQUIPPED':isEarned?'EARNED':Math.floor(pct)+'%'}</span></div><div class="tc-progress" role="progressbar" aria-label="${e(t.name)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct.toFixed(1)}%"></i></div></div>
      <button type="button" class="tc-equip" data-a="titleequip" data-v="${isEquipped?'none':e(t.id)}" aria-pressed="${isEquipped}" aria-label="${isEquipped?'Remove '+e(t.name):isEarned?'Equip '+e(t.name):e(t.name)+' is locked'}" ${isEarned?'':'disabled'}>${isEquipped?'Equipped':isEarned?'Equip':'Locked'}</button></article>`;
  }).join('');
  return `<section class="title-collection" aria-label="Title collection"><header class="tc-hero"><div class="tc-hero-copy"><div class="tc-eyebrow">THE MASTERY JOURNAL <span>✦</span> YOUR LEGACY</div><h2>Titles worth<br><em>earning.</em></h2><p>Every hunt, milestone and hard-won mastery leaves its mark. Complete challenges to collect a title, then wear it into the world.</p><div class="tc-count"><strong>${earned}</strong><span>/ ${entries.length}<small>TITLES EARNED</small></span></div></div><div class="tc-feature">${selected?icon(selected):'<span class="tc-empty-symbol">✧</span>'}<small>CURRENT TITLE</small><b>${selected?e(selected.name):'None equipped'}</b><span>${selected?'Your legacy on display':'Choose an earned title below'}</span>${selected?'<button type="button" data-a="titleequip" data-v="none">Remove title</button>':''}</div></header>
    <div class="tc-section-head"><div><small>YOUR COLLECTION</small><h3>Find your next title</h3></div><span>${visible.length} shown</span></div><div class="tc-filters" role="group" aria-label="Filter titles">${filters}</div><div class="tc-list">${cards||'<div class="tc-empty">No titles here yet. Your completed challenges will appear in Earned.</div>'}</div><p class="tc-footnote">Challenge titles are cosmetic. Hunt-rank Crit bonuses are earned from Index XP and never depend on which title is equipped.</p></section>`;
}
const api={CHALLENGES,RANK_SYMBOLS,FILTERS,metrics,progress,unlocked,sync,find,findByName,requirement,icon,renderCollection};
root.PGTitles=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
