// Pure report renderers: no game boot, combat replay or filesystem writes.
'use strict';
const REWARD_WARNING='> Reward-rate warning: fourth-job fixtures use GM x100 rewards; third-job fixtures use ordinary player rates. These native absolute rates must not be compared across tiers. Read `results.md` for ordinary-rate normalized results.\n\n';
function renderComparison(report){
 const {metadata,summaries}=report,{seeds,farmSeconds,bossLimit,fields}=metadata;
 const fmt=n=>n==null?'—':n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':n.toFixed(2),pct=n=>n==null?'—':(n>=0?'+':'')+n.toFixed(1)+'%';
 let md='# Real-field combat comparison — timing only\n\n**Exploratory simulations, not the owner’s save or a deployed browser test. No game balance was changed.**\n\nBefore uses only the pre-v177 `playerAttack()`; after uses current timing. All other source and each paired starting build/field/RNG seed match.\n\n'+seeds.length+' seeds; '+farmSeconds+' seconds per farming session; independent boss attempts up to '+bossLimit+' seconds, stopped on first death or victory. Actual movement, enemies, escorts, critical resistance, healing, procs and deaths are enabled. No pets.\n\n## Assumptions\n\n'+metadata.assumptions.map(x=>'- '+x).join('\n')+'\n\n'+REWARD_WARNING+'**Use EXP/min, boss clears/min, boss outcomes and deaths together. Boss death despawns surviving escorts, so a lower total kill count can coexist with faster boss farming. Raw/HUD-style DPS counts overkill.** Different fixtures are not a comprehensive class-balance ranking.\n\n';
 for(const fieldKey of Object.keys(fields)){
  md+='## '+fields[fieldKey].name+'\n\n| Build | ASPD start / peak current | EXP/min before → after | EXP change | Boss clears/min before → after | Farm deaths before → after¹ | Boss wins before → after² | Boss win seconds before → after³ |\n|---|---:|---:|---:|---:|---:|---:|---:|\n';
  for(const s of summaries.filter(s=>s.field===fieldKey))md+=`| ${s.config} | ${s.stats.aspd.toFixed(1)} / ${s.after.peakAspd.toFixed(1)} | ${fmt(s.before.expPerMinute)} → ${fmt(s.after.expPerMinute)} | ${pct(s.expChangePercent)} | ${s.before.bossClearsPerMinute.toFixed(2)} → ${s.after.bossClearsPerMinute.toFixed(2)} | ${s.before.deaths} → ${s.after.deaths} | ${s.before.bossAttempts?s.before.bossWins+'/'+s.before.bossAttempts+' → '+s.after.bossWins+'/'+s.after.bossAttempts:'—'} | ${fmt(s.before.bossMeanWinSeconds)} → ${fmt(s.after.bossMeanWinSeconds)} |\n`;
  md+='\n';
 }
 md+='¹ Deaths summed over all seeds, '+(farmSeconds*seeds.length/60).toFixed(1)+' total farming minutes per timing. ² Independent fresh-entry boss attempts with minions; Thor Stage 1 has no boss. ³ Mean of successful attempts only; never interpret missing or conditional win times as full kill-time parity.\n\n## Speed-conditioned spell bonus\n\nArch Bishop inherits Zeal (`iagi`): at rank 5 it provides a 15% speed buff and its active value also multiplies direct skill damage when the attack interval is ≤0.131 seconds. This is an existing rule, not a new experimental caster buff. The JSON records peak ASPD and boosted cast counts.\n\n## Current-timing damage composition (raw recorded DPS)\n\n| Field | Build | Total | Basic | Direct skills | Procs⁴ | DoT | Effective (overkill capped) |\n|---|---|---:|---:|---:|---:|---:|---:|\n';
 for(const s of summaries){const d=s.after.rawDpsBySource;md+=`| ${fields[s.field].name} | ${s.config} | ${fmt(s.after.rawDps)} | ${fmt(d.basic)} | ${fmt(d.skill)} | ${fmt(d.proc)} | ${fmt(d.dot)} | ${fmt(s.after.effectiveDps)} |\n`;}
 md+='\n⁴ Procs includes Twin Strike and `skillHit(..., proc=true)` paths, including delayed/ground-skill effects; this is an accounting category, not exclusively random on-hit procs. Raw JSON includes both timings and every seed.\n\n## Validation\n\n- '+metadata.pairedInputs+' old/current pairs had byte-identical input state, field definitions and seed.\n- '+metadata.fieldSessions+' farming sessions and '+metadata.independentBossAttempts+' independent boss attempts completed.\n- Every session reconciled damage components against the game’s damage counter, effective ≤ raw damage, and counted kills against the game’s kill counter.\n- Renderer/visual effects are stubbed; no GPU, production cloud account, owner-save or physical-device claims.\n- These short seeded runs identify candidates for further testing, not a justified damage multiplier.\n\nReproduce with Node24 and the documented dependencies:\n```sh\nnode tools/compare_field_combat.cjs reports/field-combat\n```\n';
 return md;
}

const percent=n=>Number.isFinite(n)?(n>=0?'+':'')+n.toFixed(1)+'%':'—';
const million=n=>Number.isFinite(n)?(n/1e6).toFixed(2)+'M':'—';
const seconds=n=>Number.isFinite(n)?n.toFixed(2)+'s':'—';
function bossReduction(before,after){
 return Number.isFinite(before)&&before>0&&Number.isFinite(after)&&after>=0?(1-after/before)*100:null;
}
function renderSummary(report,summaries){
 const {metadata}=report,{fieldSessions,farmSeconds,bossLimit,independentBossAttempts,seeds}=metadata;
 const wins=part=>`${part.bossWins}/${part.bossAttempts}`;
 const farmMinutes=Number((farmSeconds*seeds.length/60).toFixed(2));
 let md=`# Field-test results — ordinary reward rates

**No gameplay tuning was applied.** This compares old/current attack timing in memory, with identical starting builds per pair. ${fieldSessions} farming sessions (${farmSeconds} seconds each, ${seeds.length} seed${seeds.length===1?'':'s'}) and ${independentBossAttempts} independent boss attempts (first win/death or ${bossLimit} seconds). Real movement, enemy attacks, escorts, crit resistance, healing, shields and damage effects; headless renderer. No pets.

${metadata.quick?'**Quick harness check only — not acceptance evidence or a full-duration balance comparison.**\n\n':''}## Important qualifications

- GX is a **synthetic Infernal proxy**, not your saved character. Only visible base stats and weapon rolls could be matched; unseen equipment/cards/skills/Ascension are assumptions. See the recorded fixture snapshots for actual ATK/HP and investment. Its results must not be attributed to your actual character.
- Caster fixtures have +15 corrected Mythic gear, three-star cards, max card mastery and 50/30 Ascension budgets; they do not match the GX proxy’s full investment. Compare a build against itself, not absolute class rankings.
- Original fourth-job simulations retained the GM x100 reward setting used to generate gear. **All EXP/Zeny rates in this summary are normalized to ordinary Lv150 player rewards.** Normal EXP is calculated from each sample’s actual regular/boss kill counts using the unchanged real reward helpers, including integer rounding; it reconciles exactly to native measured rewards before normalization. Zeny uses the actual native/normal multiplier ratio. No combat result was changed.
- Boss death clears surviving escorts without awarding their kills. A faster boss clear can reduce total kills and EXP; use boss clears, income and survival together.
- ${seeds.length} seed${seeds.length===1?'':'s'} and ${farmSeconds}-second farming windows are exploratory, not enough to set a balance multiplier.

## Thor Stage 1 — farming

| Build | Current peak ASPD | EXP/min old → current | Timing gain | Deaths old → current¹ |
|---|---:|---:|---:|---:|
`;
 for(const s of summaries.filter(s=>s.field==='thor1'))md+=`| ${s.config} | ${s.after.peakAspd.toFixed(1)} | ${million(s.before.expPerMinute)} → ${million(s.after.expPerMinute)} | ${percent(s.expChangePercent)} | ${s.before.deaths} → ${s.after.deaths} |\n`;
 md+='\n## Astral Stage 5 — farming and independent boss trials\n\n| Build | EXP/min old → current | Timing gain | Boss time old → current | Deaths old → current¹ | Boss wins old → current |\n|---|---:|---:|---:|---:|---:|\n';
 const astral=summaries.filter(s=>s.field==='astral');
 for(const s of astral)md+=`| ${s.config} | ${million(s.before.expPerMinute)} → ${million(s.after.expPerMinute)} | ${percent(s.expChangePercent)} | ${seconds(s.before.bossMeanWinSeconds)} → ${seconds(s.after.bossMeanWinSeconds)} | ${s.before.deaths} → ${s.after.deaths} | ${wins(s.before)} → ${wins(s.after)} |\n`;
 if(astral.length){
  const totals=timing=>({bossWins:astral.reduce((n,s)=>n+s[timing].bossWins,0),bossAttempts:astral.reduce((n,s)=>n+s[timing].bossAttempts,0)});
  md+=`\n${astral.length} Astral fixtures: ${wins(totals('before'))} independent boss wins before; ${wins(totals('after'))} after.\n`;
 }
 md+='\n## Thor Stage 5 — boss trials\n\n| Build | Old timing: wins / time | Current timing: wins / time | Farm deaths old → current¹ |\n|---|---:|---:|---:|\n';
 for(const s of summaries.filter(s=>s.field==='thor5'))md+=`| ${s.config} | ${wins(s.before)} · ${seconds(s.before.bossMeanWinSeconds)} | ${wins(s.after)} · ${seconds(s.after.bossMeanWinSeconds)} | ${s.before.deaths} → ${s.after.deaths} |\n`;
 md+=`\n¹ Farming deaths summed over ${seeds.length} seed${seeds.length===1?'':'s'}: ${farmMinutes} minutes per build/timing. Boss time is the mean of winning independent trials only; missing times do not establish kill-time parity.\n`;
 const gx=summaries.find(s=>s.field==='thor5'&&s.group==='gx');
 if(gx&&gx.before.bossAttempts>0&&gx.after.bossAttempts>0&&!gx.before.bossWins&&!gx.after.bossWins)md+='GX has no successful independent Thor5 trial; a later farm clear does not make it a reliable farming build.\n';
 md+='\n## Lv150 N+ — Abyss Nightmare Stage 5\n\nAGI fixtures use identical speed-stripped gear; legal base-stat allocation differs. Ordinary N+ does not necessarily reach 192 ASPD.\n\n| Build | Base AGI | Boss time old → current | Boss-time reduction | EXP/min timing change |\n|---|---:|---:|---:|---:|\n';
 for(const s of summaries.filter(s=>s.group==='third'))md+=`| ${s.config.replace(/ AGI\d+$/,'')} | ${s.config.match(/AGI(\d+)$/)?.[1]||'—'} | ${seconds(s.before.bossMeanWinSeconds)} → ${seconds(s.after.bossMeanWinSeconds)} | ${percent(bossReduction(s.before.bossMeanWinSeconds,s.after.bossMeanWinSeconds))} | ${percent(s.expChangePercent)} |\n`;
 md+='\n## Findings and interpretation\n\n1. **Read timing effects from the measured rows.** Use the N+ table for third-job builds and compare each build against itself. Missing or conditional boss-win times are not unconditional clear-time improvements.\n2. **Caster speed investment has an existing trade-off.** The INT/AGI and INT-focused fixtures spend the same legal point budget differently; compare measured income, survival and boss outcomes rather than assuming a universal benefit.\n3. **Arch Bishop already has speed-conditioned spell scaling.** Its inherited Zeal rank 5 grants 15% speed; when the interval is ≤0.131s, its active value also multiplies direct skill damage by 1.15. Peak ASPD and boosted cast counts are recorded in the raw report. This is an existing rule, not a new caster buff.\n4. **A larger percentage gain does not establish stronger overall field performance.** These fixtures mix different investment assumptions. Do not use a synthetic GX proxy as evidence of the owner’s actual performance.\n5. **No balance coefficient is justified by these runs alone.** Obtain the actual GX save or complete loadout/skills/Ascension/pet details, and build matched-investment alternatives before making class-ranking or compensation decisions.\n\n## Data and reproduction\n\n- `comparison.md`: full native-rate field tables and damage-source composition.\n- `comparison.json`: raw measured sessions, complete synthetic fixtures, assumptions and hashes.\n- `ordinary-rates.json`: ordinary-rate summaries and all rate-conversion inputs.\n\n```sh\nnode tools/compare_field_combat.cjs reports/field-combat\nnode tools/summarize_field_combat.cjs reports/field-combat\n```\n';
 return md;
}
module.exports={REWARD_WARNING,renderComparison,renderSummary,bossReduction};
