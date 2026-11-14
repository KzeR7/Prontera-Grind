// v406 (owner: "does the random emoji from pets actually ... do? also i like to tune it down").
// The pet's emotion images are purely visual - they never touch a save, a drop or a stat - so
// there is nothing to assert about rewards here. What the owner tuned is HOW OFTEN they fire:
//   idle follower  every 60-300 s   (was 9-22 s)
//   fishing        every 30-60 s    (was 5-11 s)
//   a normal hit   5%               (was 12%)
//   a critical     30%              (was every single crit)
// These tests extract the shipped functions out of assets/social-scene.js and RUN them, rather
// than restating the numbers inline - a test that reimplements the rule can never fail.
//   node tools/tests/pet_emoji_tune_sim.js
const assert=require('node:assert/strict'),fs=require('node:fs');
const src=fs.readFileSync('assets/social-scene.js','utf8');

// ---- 1. the ambient scheduler ------------------------------------------------------
{
 const m=src.match(/function ambientEmojiDelay\(fishing\)\{[^}]*\}/);
 assert(m,'ambientEmojiDelay is still a single extractable function');
 const delay=eval('('+m[0]+')');
 assert.equal(typeof delay,'function');
 const idle=[],fish=[];
 for(let i=0;i<4000;i++){idle.push(delay(false));fish.push(delay(true))}
 const range=a=>[Math.min(...a),Math.max(...a)];
 const [i0,i1]=range(idle),[f0,f1]=range(fish);
 assert(i0>=60000&&i1<=300000,'idle reactions land in the tuned 60-300 s window, got '+i0+'-'+i1);
 assert(f0>=30000&&f1<=60000,'fishing reactions land in the tuned 30-60 s window, got '+f0+'-'+f1);
 assert(i1-i0>60000,'the idle window is actually randomised, not a fixed beat');
 assert(f1-f0>15000,'the fishing window is actually randomised, not a fixed beat');
 // Both must be slower than they were: 22 s and 11 s were the old ceilings.
 assert(i0>22000,'idle is strictly slower than the old 9-22 s schedule');
 assert(f0>11000,'fishing is strictly slower than the old 5-11 s schedule');
}

// ---- 2. the battle reactions --------------------------------------------------------
{
 const m=src.match(/if\(field&&amount>0\)\{if\(crit\)\{[\s\S]*?triggerBattleEmoji\(unit,'hit'\)\}/);
 assert(m,'the field hit/crit reaction line is present and extractable');
 const body=m[0];
 const calls=[];
 const triggerBattleEmoji=(unit,mood)=>calls.push(mood);
 const run=(crit,rand)=>{ // Math.random is read once, in whichever branch is taken.
  const real=Math.random;Math.random=rand;
  try{new Function('field','amount','crit','unit','triggerBattleEmoji',body)(true,42,crit,{},triggerBattleEmoji)}
  finally{Math.random=real}
  return calls.splice(0);
 };
 // A critical at 30%: fires below the cut, silent above it.
 assert.deepEqual(run(true,()=>0.01),['crit'],'a roll under the cut reacts to a crit');
 assert.deepEqual(run(true,()=>0.29),['crit'],'29% is still inside the 30% cut');
 assert.deepEqual(run(true,()=>0.31),[],'31% is past the cut - a crit no longer ALWAYS reacts');
 assert.deepEqual(run(true,()=>0.99),[],'the far end of the roll stays silent');
 // A normal hit at 5%: 0.10 used to react at the old 12%, so this pins the change.
 assert.deepEqual(run(false,()=>0.01),['hit'],'a roll under the cut reacts to a plain hit');
 assert.deepEqual(run(false,()=>0.04),['hit'],'4% is still inside the 5% cut');
 assert.deepEqual(run(false,()=>0.06),[],'6% is past the cut - the old 12% would still have fired');
 assert.deepEqual(run(false,()=>0.99),[],'the far end of the roll stays silent');
 // amount<=0 and a non-field duel never react at all.
 assert.deepEqual((()=>{const real=Math.random;Math.random=()=>0;try{
   new Function('field','amount','crit','unit','triggerBattleEmoji',body)(true,0,true,{},triggerBattleEmoji);
   new Function('field','amount','crit','unit','triggerBattleEmoji',body)(false,42,true,{},triggerBattleEmoji);
  }finally{Math.random=real}return calls.splice(0)})(),[],
  'a zero-damage strike and the ring duel never raise a sticker');
}

// ---- 3. it is still only decoration -------------------------------------------------
{
 // The owner asked what the emoji actually DOES. The answer is nothing: no save, no reward, no
 // stat is reachable from this block. Pin that so a future "while I am here" cannot quietly
// turn a cosmetic flourish into a gameplay effect.
 const poolStart=src.indexOf('const BATTLE_EMOJI_POOLS');
 const poolEnd=src.indexOf('function battleEvent');
 assert(poolStart>0&&poolEnd>poolStart,'the emoji block is still bounded');
 const block=src.slice(poolStart,poolEnd);
 for(const forbidden of ['save(','earnExp','earnZeny','grant','checkLevel','drops.'])
  assert(!block.includes(forbidden),'the emoji block must stay cosmetic - found '+forbidden);
 assert.match(src,/Purely visual; nothing here touches a save/,'the comment still tells the truth');
 // The pools the scheduler draws from are unchanged - only the cadence moved.
 for(const id of ['idle','fish','hit','crit','win','lose'])
  assert.match(src,new RegExp(id+":\\['"),"the "+id+" pool still exists");
 const warm=src.match(/function warmBattleEmotions\(\)\{[\s\S]*?\n \}/);
 assert(warm,'emotions are still pre-warmed, so the first reaction is not a blank sprite');
}

console.log('PASS pet emoji tune: idle 60-300 s, fishing 30-60 s, normal hit 5%, crit 30%, both windows randomised and strictly slower than before, and the whole feature is still decoration that touches no save');
