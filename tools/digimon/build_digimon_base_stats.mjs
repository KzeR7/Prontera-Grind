#!/usr/bin/env node
/* Build per-form base battle modifiers for every bundled Digimon form.
 *
 * Sources, in order of preference — no stat is ever invented for a form that has one:
 *  1. tools/digimon/cyber_sleuth_stats.json — fan-compiled Digimon Story: Cyber Sleuth
 *     level-1 base stats (HP/ATK/DEF/INT/SPD), matched by localized name (alias table
 *     below covers romanization differences). Each matched stat becomes a multiplier
 *     against the average of matched forms in the same evolution stage, so the stage
 *     power curve of the live combat formula is preserved while forms inside a stage
 *     spread out.
 *  2. House archetype for forms Cyber Sleuth never catalogued: the Reference Book
 *     type/attribute leans the four stats, and a deterministic FNV-1a hash of the form
 *     id adds a small stable jitter so no two forms are identical.
 *
 * Output: assets/digimon/base-stats.js — permille multipliers (1000 = the live formula
 * unchanged), clamped to 850–1150. Variants inherit their base species. Run with
 * --check to verify the committed output without rewriting it.
 */
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..','..');
const require=createRequire(import.meta.url);
const DATA=require(join(ROOT,'assets/digimon/roster.js'));
const SOURCE=JSON.parse(readFileSync(join(ROOT,'tools/digimon/cyber_sleuth_stats.json'),'utf8'));
const OUT=join(ROOT,'assets/digimon/base-stats.js');

const MIN=850,MAX=1150,NEUTRAL=1000;
// Cyber Sleuth stat spreads inside a stage are wider than the casual formula should carry,
// so deviations are compressed toward the stage average before the hard clamp. This keeps
// the stage power curve centered while avoiding a pile-up of identical boundary values.
const COMPRESS=550;
const clean=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
// Our roster ids are romanized; the Cyber Sleuth compilation uses localized names.
const ALIASES={
  ankiromon:'Ankylomon',
  diablomon:'Diaboromon',
  imperialdramon_dragonmode:'Imperialdramon DM',
  imperialdramon_fightermode:'Imperialdramon FM',
  phoenixmon:'Hououmon',
  sistermon_noir:'Sistermon Ciel', // western Cyber Sleuth substitution for Sistermon Noir
  gekkomon:'Gekomon',
};
// Reference Book type keywords → permille leans for forms without Cyber Sleuth data.
const ARCHETYPES=[
  [['dinosaur','dragon','reptile'],{hp:0,atk:40,def:-15,spd:15}],
  [['machine','cyborg','mutant','ore','mineral','armor','weapon'],{hp:25,atk:-10,def:35,spd:-25}],
  [['bird'],{hp:-10,atk:0,def:-20,spd:45}],
  [['beast','mammal'],{hp:10,atk:10,def:-15,spd:30}],
  [['vegetation','plant','bulb','seed'],{hp:35,atk:-20,def:0,spd:-10}],
  [['fire'],{hp:-20,atk:45,def:0,spd:10}],
  [['aquatic','crustacean'],{hp:30,atk:0,def:15,spd:-25}],
  [['angel','fairy'],{hp:-20,atk:0,def:25,spd:20}],
  [['devil','undead','ghost'],{hp:-15,atk:35,def:-25,spd:25}],
  [['insectoid','larva','insect'],{hp:-25,atk:10,def:0,spd:30}],
  [['slime','lesser'],{hp:10,atk:-10,def:-10,spd:10}],
];
function fnv1a(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h>>>0}
function jitter(form,seed){ // three bounded, deterministic offsets from one hash
  const h=fnv1a(form+':'+seed);
  return [h&7, (h>>>3)&7, (h>>>6)&7, (h>>>9)&7].map(v=>(v-3.5)*10); // ±35 permille
}
const clamp=v=>Math.max(MIN,Math.min(MAX,Math.round(v)));

const byName=new Map(SOURCE.map(d=>[clean(d.name),d]));
const profiled=DATA.IDS.filter(id=>DATA.entry(id)?.stage);
// Step 1 — Cyber Sleuth matches per profile base.
const csStats=new Map(); // profile id → {hp,atk,def,spd} raw CS stats
for(const id of profiled){
  const base=DATA.entry(id).profile||id;
  if(csStats.has(base))continue;
  const hit=byName.get(clean(base))||byName.get(clean(ALIASES[base]||''));
  if(hit)csStats.set(base,{hp:hit.hp,atk:hit.atk,def:hit.def,spd:hit.spd});
}
// Step 2 — per-stage averages over matched forms, so the live formula's stage curve stays put.
const stageSums=new Map(),stageCounts=new Map();
for(const id of profiled){
  const hit=csStats.get(DATA.entry(id).profile||id);if(!hit)continue;
  const stage=DATA.entry(id).stage,sum=stageSums.get(stage)||{hp:0,atk:0,def:0,spd:0};
  for(const k of ['hp','atk','def','spd'])sum[k]+=hit[k];
  stageSums.set(stage,sum);stageCounts.set(stage,(stageCounts.get(stage)||0)+1);
}
const stageAvg=new Map();
for(const [stage,sum] of stageSums){const n=stageCounts.get(stage);stageAvg.set(stage,{hp:sum.hp/n,atk:sum.atk/n,def:sum.def/n,spd:sum.spd/n})}
// Step 3 — every profiled form gets modifiers; variants inherit their base species.
const stats=new Map();
for(const id of profiled){
  const entry=DATA.entry(id),base=entry.profile||id,stage=entry.stage;
  const cs=csStats.get(base),avg=stageAvg.get(stage);
  if(cs&&avg){
    const mod={};for(const k of ['hp','atk','def','spd'])mod[k]=clamp(NEUTRAL+(cs[k]/avg[k]-1)*COMPRESS);
    stats.set(id,mod);
    continue;
  }
  // House archetype: type lean + deterministic per-form jitter.
  const type=(entry.type||'').toLowerCase(),attribute=(entry.attribute||'').toLowerCase();
  let lean={hp:0,atk:0,def:0,spd:0};
  for(const [keys,delta] of ARCHETYPES)if(keys.some(k=>type.includes(k))){lean=delta;break}
  const dark=attribute.includes('virus');
  const j=jitter(base,'base');
  stats.set(id,{
    hp:clamp(NEUTRAL+lean.hp+j[0]),
    atk:clamp(NEUTRAL+lean.atk+j[1]+(dark?15:0)),
    def:clamp(NEUTRAL+lean.def+j[2]),
    spd:clamp(NEUTRAL+lean.spd+j[3]),
  });
}
// Step 4 — the 14 profile-less entries can never be partners; keep them neutral and honest.
for(const id of DATA.IDS)if(!stats.has(id))stats.set(id,{hp:NEUTRAL,atk:NEUTRAL,def:NEUTRAL,spd:NEUTRAL});

const entries=DATA.IDS.map(id=>` ${JSON.stringify(id)}:${JSON.stringify(stats.get(id))}`);
const body=`/* Generated by tools/digimon/build_digimon_base_stats.mjs — do not edit by hand.
 * ${csStats.size} of ${new Set(profiled.map(id=>DATA.entry(id).profile||id)).size} source profiles use Digimon Story: Cyber Sleuth
 * level-1 base stats (stage-normalized); the rest use documented house archetypes.
 * Permille multipliers over the live combat formula; 1000 leaves it unchanged. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PGDigimonBaseStats=api})(globalThis,function(){
'use strict';
const STATS=${'{'+entries.join(',')+'}'};
const NEUTRAL={hp:1000,atk:1000,def:1000,spd:1000};
function stats(form){return STATS[form]||NEUTRAL}
return {stats,FORM_COUNT:Object.keys(STATS).length};
});
`;
const check=process.argv.includes('--check');
if(check){
  const current=readFileSync(OUT,'utf8');
  if(current!==body){console.error('base-stats.js is out of date — run tools/digimon/build_digimon_base_stats.mjs');process.exit(1)}
  console.log(`Verified ${DATA.IDS.length} forms · ${csStats.size} Cyber Sleuth profiles · ${stats.size} entries`);
}else{
  writeFileSync(OUT,body);
  console.log(`Built ${DATA.IDS.length} forms · ${csStats.size} Cyber Sleuth-matched profiles · ${profiled.length-csStats.size} archetype forms → assets/digimon/base-stats.js`);
}
