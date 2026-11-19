/* Presentation of the real transient class-skill buffs; it never changes combat state. */
(function(root){
'use strict';
const escape=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={atk:'Attack',matk:'Magic attack',speed:'Attack speed',damage:'Direct damage',guard:'Damage reduction',
  block:'Block chance',critical:'Critical chance',move:'Movement speed',sacred:'Sacred damage',
  ascBlade:'Basic-attack damage',ascRanged:'Ranged physical damage'};
const defaultRemaining=(sk,buff)=>buff.left;
function active(skills,buffs,enabled,remaining=defaultRemaining){
  if(!Array.isArray(skills)||!buffs||typeof buffs!=='object')return [];
  const on=typeof enabled==='function'?enabled:()=>true;
  return skills.filter(sk=>{
    const b=sk&&buffs[sk.id];if(!sk||sk.type!=='buff'||!b||!on(sk.id))return false;
    const left=Number(remaining(sk,b));return Number.isFinite(left)&&left>0;
  });
}
function describe(sk,buff,extra){
  // The skill's general effect is stable. Its generic skill-tree description can report base
  // values/durations instead of Ascension upgrades, so display the value captured at cast time.
  let text=sk.absorb?'Absorbs incoming damage while the barrier holds.':String(sk.text||'');
  text=text.replace(/\b(for) \d+(?:\.\d+)? seconds?\b/gi,match=>match[0]===match[0].toUpperCase()?'While active':'while active');
  const value=Number(buff.value),label=labels[buff.key];
  if(label&&Number.isFinite(value)&&value!==0)text+=` ${label}: ${value>0?'+':''}${Number(value.toFixed(2))}%.`;
  if(extra)text+=' '+extra;
  return text.trim();
}
function render(skills,buffs,options={}){
  const icon=typeof options.icon==='function'?options.icon:()=>'';
  const remaining=typeof options.remaining==='function'?options.remaining:defaultRemaining;
  return active(skills,buffs,options.enabled,remaining).map(sk=>{
    const buff=buffs[sk.id],seconds=Math.ceil(Number(remaining(sk,buff)));
    const extra=typeof options.extra==='function'?options.extra(sk,buff):'';
    const description=describe(sk,buff,extra),id='player-buff-'+sk.id;
    return `<span class="pbx player-buff" id="${escape(id)}" tabindex="0" role="status" aria-label="${escape(sk.n)}: ${escape(description)} ${seconds} seconds remaining" aria-describedby="${escape(id)}-details">${icon(sk.id)}<i class="s">${seconds}</i><span class="pbx-fly" id="${escape(id)}-details" role="tooltip"><b>${escape(sk.n)}</b> <i>player skill</i><br>${escape(description)}<br>${seconds}s left</span></span>`;
  }).join('');
}
const api={active,describe,render};root.PGPlayerBuffs=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
