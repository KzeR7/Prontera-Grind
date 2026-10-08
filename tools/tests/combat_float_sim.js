// Combat float styles/types: ordinary hits, skill hits, crits, incoming damage and evades.
//   node tools/tests/combat_float_sim.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const start = src.indexOf('const damageFloat=');
const end = src.indexOf('\n// Skill labels track', start);
assert.ok(start >= 0 && end > start, 'cannot locate the production damageFloat helper');
const damageCode = src.slice(start, end);
const emitted = [];
const box = { S: {}, numTxt: n => 'n' + n, addFloat: (...args) => emitted.push(args), floats: [], rnd: (a, b) => (a + b) / 2, mobVisualScale: () => 1,
  DMG_LIFE: 1 / .95, DMG_RISE: 30, DMG_FADE: .55, DMG_RATE: .95 };
vm.createContext(box);
vm.runInContext(damageCode + ';globalThis.__damageFloat=damageFloat;globalThis.__d={showDamage,flushDamageGroup,dotTick,open:()=>{dmgGroup=new Map()}};', box);
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
}
console.log('combat floats: visual hierarchy and damage-type labels\n');
t('ordinary hits keep the RO-style gold damage class', () => {
  emitted.length = 0; box.__damageFloat(1, 2, 3, 1200);
  assert.strictEqual(emitted[0][3], 'n1200');
  assert.strictEqual(emitted[0][6], 'damage');
});
t('skill hits get a separate blue-spark damage class', () => {
  emitted.length = 0; box.__damageFloat(1, 2, 3, 1200, false, false, true);
  assert.strictEqual(emitted[0][6], 'skill-damage');
});
t('a skill critical gets its own skill-critical class, a plain critical keeps critical', () => {
  emitted.length = 0; box.__damageFloat(1, 2, 3, 2400, true, false, true);
  assert.strictEqual(emitted[0][6], 'skill-critical');
  emitted.length = 0; box.__damageFloat(1, 2, 3, 2400, true, false, false);
  assert.strictEqual(emitted[0][6], 'critical');
});
t('incoming hits stay red even if a caller also supplies the skill flag', () => {
  emitted.length = 0; box.__damageFloat(1, 2, 3, 50, false, true, true);
  assert.strictEqual(emitted[0][6], 'incoming');
});
t('the existing hide-damage option still suppresses combat numbers', () => {
  emitted.length = 0; box.S.dmgShow = false; box.__damageFloat(1, 2, 3, 50);
  assert.strictEqual(emitted.length, 0);
});
t('miss and dodge have explicit labels and styled classes', () => {
  assert.ok(src.includes("addFloat(mob.x,1.8,mob.z,'MISS','#dfe5ed',false,'miss')"));
  assert.ok(src.includes("addFloat(pl.x,2.4,pl.z,'DODGE','#76eaff',false,'evade')"));
  assert.ok(src.includes('.fl.miss,.fl.evade{position:absolute;'));
  assert.ok(src.includes('padding:0;border:0;border-radius:0;background:transparent'), 'MISS has plain text styling, not a frame');
});
t('projected hit numbers stay absolute; crits carry the owner\'s starburst frame with no CRIT chip', () => {
  assert.ok(src.includes('.fl.damage,.fl.skill-damage,.fl.critical,.fl.skill-critical,.fl.incoming,.fl.dot{position:absolute'), 'screen projection needs absolute nodes');
  assert.ok(src.includes('.fl.critical,.fl.skill-critical{font:900 32px "Trebuchet MS",Verdana,sans-serif'), 'criticals use the 32px size the owner has been playing with');
  assert.ok(!src.includes('.fl.critical::before{')&&!src.includes('.fl.critical::after{'), 'the bubble is a child element, not a pseudo-element');
  assert.ok(src.includes('.fl.skill-critical .fnum{background-image:linear-gradient(#eafaff 10%,#7cd4ff 90%)'), 'skill criticals get the same gradient digits in silver-blue');
  assert.ok(src.includes('class="fburst"'), 'the critical frame is the v82 starburst behind the digits');
  assert.ok(src.includes('class="fstreak"')&&src.includes('class="fring"'), 'with its speed-line spray and its impact ring');
  assert.ok(!src.includes('class="fbubble"')&&!src.includes('class="fflash"'),
    'the v83 blob and its impact flash are gone: the owner had already tuned the starburst and keeps it');
  assert.ok(!src.includes('>CRIT<'), 'no CRIT text chip (owner request)');
  assert.ok(src.includes('Math.max(fs*2,len*fs*.84)'), 'the starburst box is sized from the finished number so 6-7 digit crits still fit');
  assert.ok(src.includes('.fl.skill-damage{color:#c9f1ff!important;-webkit-text-stroke:.5px #123a57'), 'skill hits keep their blue treatment at the same size (v82: one font size for both, the colour is the difference)');
});
// v72: the owner's attached selection says "font: game", which is the copy button's raw key for
// Game (Trebuchet) - "Chunky (Verdana 900)" prints as "font: classic". The build had shipped the
// chunky one, so the digits did not look like the strip they tuned. Criticals now also take strip
// B's exact fill: a cream-to-gold gradient clipped to the glyphs with a thin maroon stroke and
// soft drop shadows, not a flat gold fill under a heavy 4-way outline.
t('the digits use the selected font at the readable size, with the gradient crit fill and soft shadow', () => {
  assert.ok(src.includes('.fl.damage,.fl.skill-damage{font:700 17px "Trebuchet MS",Verdana,sans-serif'), 'normal/skill digits are the game font at the 17px the owner plays with');
  assert.ok(src.includes('.fl.critical .fnum{background-image:linear-gradient(#fff3b0 10%,#ffc93c 90%)')&&src.includes('-webkit-background-clip:text'), 'the crit fill is the page\'s gradient, clipped to the digits span');
  assert.ok(src.includes('-webkit-text-stroke:.6px #57330a'), 'the crit stroke is the page\'s thin maroon one, not a fat dark outline');
  assert.ok(src.includes('.fnum{text-shadow:none;-webkit-background-clip:text'), 'transparent gradient text must not carry a text-shadow silhouette, and the filter stays off the burst');
  assert.ok(src.includes('drop-shadow(0 1px 2px #000) drop-shadow(0 0 6px #ffb52e77)'), 'the page soft shadow + glow pair');
  assert.ok(src.includes('drop-shadow(0 0 1px #2e0a02)'), 'a tight dark rim keeps the thin-stroke gradient legible on bright maps');
  assert.ok(src.includes('@keyframes fburst-pop{0%{transform:translate(-50%,-50%) scale(.3)}30%{transform:translate(-50%,-50%) scale(1.25)}'),
    'the star pops in with the page overshoot (1.25 at 30%) and then breathes for its whole life');
  assert.ok(src.includes('@keyframes fring-pop')&&src.includes('@keyframes fstreak-fly'),
    'the ring and the speed lines fly too');
  assert.ok(!src.includes('fbubble-pop')&&!src.includes('fflash-pop'), 'the blob and its flash are gone with the blob');
});
// v71: the frame shipped misaligned - the pop animation sat on the svg, so the svg added its own
// translate(-50%,-50%) inside the already-centred .fburst box and drew the starburst half a burst
// up-left of the digits (the ring, correctly centred, is what gave it away). These assertions pin
// the geometry to the proposal page's own burst (12 outer spikes + 8 inner spikes + pale core).
t('the starburst is centred on the digits, re-jittered every hit, and dies with them', () => {
  assert.ok(src.includes('.fburst,.fring,.fstreak{position:absolute;left:50%;top:50%;pointer-events:none'), 'the three frame pieces are all centred on the digits box');
  assert.ok(src.includes('.fburst{transform:translate(-50%,-50%);animation:fburst-pop 1.05s'), 'the star pops with the page\'s 1.05s burst curve, on the box and not on the svg (v71 misalignment rule)');
  assert.ok(src.includes('.fburst svg{width:100%;height:100%;display:block;overflow:visible'), 'the svg fills the box and may overflow it');
  assert.ok(src.includes('const sk=f.kind===\'skill-critical\',fs=32,len=String(f.txt).length,w=Math.max(fs*2,len*fs*.84)'), 'the frame is sized from the finished number (v70 rule)');
  assert.ok(src.includes('starPts(12,48,30,rot)')&&src.includes('starPts(8,34,20,rot*.6)'), '12 jittered outer spikes and an 8-spike inner star, as on the proposal page');
  assert.ok(src.includes('const rot=Math.random()*Math.PI'), 'a fresh rotation every hit, so no two crits are identical');
  assert.ok(src.includes("'<i class=\"fstreak\" style=\"--a:'"), 'the speed lines carry their own angle, length, thickness and travel');
  // the whole frame is built in one innerHTML string; the digits must come last so they are never covered
  const critHtml = src.slice(src.indexOf("const sk=f.kind==='skill-critical'"), src.indexOf('}else e.textContent=f.txt'));
  assert.ok(critHtml.indexOf('<i class="fburst"') < critHtml.indexOf('<i class="fring"'), 'the star is painted, then the ring');
  assert.ok(critHtml.indexOf('<span class="fnum">') > critHtml.indexOf('<i class="fring"'), 'and the digits are painted last, so the number is never covered');
  assert.ok(src.includes('@keyframes fburst-pop')&&src.includes('@keyframes fring-pop')&&src.includes('@keyframes fstreak-fly'), 'all three frame animations are present');
  assert.ok(src.includes('const c1=sk?\'#16324f\':\'#a01608\',c2=sk?\'#4fd8ff\':\'#ffcf4d\',c3=sk?\'#eaffff\':\'#fff3c8\''), 'red-gold for a physical crit, blue-silver for a skill crit');
});
t('damage numbers spawn above the head and fly the owner\'s tuned arc: 30px over ~1.05s, hold-then-fade', () => {
  assert.ok(src.includes('function mobDamageY(o){return Math.max(1.7,3.15*mobVisualScale(o)-.3)}'), 'numbers spawn just above the monster head, following its drawn scale');
  assert.ok(src.includes("showDamage(o,o.x,mobDamageY(o),o.z,d,c,skill)"), 'AoE and hurt numbers spawn at the head');
  assert.ok(src.includes("showDamage(mob,mob.x,mobDamageY(mob),mob.z,d,c,skill)"), 'strike numbers spawn at the head');
  assert.ok(src.includes('const DMG_LIFE=1/.95,DMG_RISE=30,DMG_FADE=.55,DMG_RATE=.95;'), 'the climb, the life and the fade window are the owner-tuned v82 values: 30px / ~1.05s / fade from 55%');
  assert.ok(src.includes('const dy=-DMG_RISE*Math.min(1,tt*1.15)'), 'the number climbs 30px and settles - v82\'s arc, unchanged');
  assert.ok(src.includes('const sway=tt<.28?10*(tt/.28):10-38*Math.min(1,(tt-.28)/.72)'), 'the sway: out to the right, then drifting 38px left as it fades');
  assert.ok(src.includes('f.el.style.opacity=Math.min(1,Math.max(0,r/.45))'), 'hold-then-fade: solid for the first 55% of the life, then gone by the end of it');
  assert.ok(src.includes('const r=Math.max(0,f.life),tt=1-r,cs=(f.kind===\'critical\'||f.kind===\'skill-critical\')?1:.25;'), 'criticals punch to double size on spawn, ordinary hits to a quarter');
  const incomingRule = (src.match(/\.fl\.incoming\{[^}]*\}/) || [''])[0];
  assert.ok(incomingRule.includes('-webkit-text-stroke:.4px') && incomingRule.includes('animation:hit-pop .18s ease-out both'),
    'incoming damage keeps v82\'s 16px digits and its little hit pop (MISS/DODGE keep their own)');
});
t('direct, AoE, chain and DoT hits retain their skill visual type', () => {
  assert.ok(src.includes('strike(1,sk.col,!!sk.magic,true)'), 'the skill hit still prints as a skill hit');
  assert.ok(src.includes('hurt(o,Math.max(1,Math.round(base*m*.8)),sk.col,false,true)'));
  assert.ok(src.includes('chainHit(target,base*m*(sk.chain.pow||.5),sk.col,Math.min(4,(sk.chain.n||2)+Math.floor(lv(sk.id)/2)),true)'));
  assert.ok(src.includes('applyDot(target,base*m*(sk.dot.pow||.05),sk.dot.dur||4,sk.dot.col||sk.col,true)'));
  assert.ok(src.includes('for(let i=1;i<sk.hits;i++){if(!mob||!mobs.includes(mob)||mob.hp<=0)break;strike(1,sk.col,!!sk.magic,true)}'), 'multi-hit skills land in the swing frame');
  assert.ok(!src.includes('pend.push(')&&!src.includes('castQ.push('), 'the delayed-hit and queued-cast timers are gone: the swing owns its timing');
});

t('one swing prints one number per monster, however many hits it landed (v83 owner request)', () => {
  const D = box.__d;
  box.S.dmgShow = true;              // an earlier test left the hide-damage switch off
  const monster = {}, other = {};
  D.open();                          // resolveSwing opens the group before the first hit
  D.showDamage(monster, 1, 2, 2, 100, false, false);
  D.showDamage(monster, 1, 2, 2, 100, true, true);
  D.showDamage(other, 3, 4, 4, 50, false, false);
  assert.strictEqual(emitted.length, 0, 'nothing is printed while the swing is still resolving');
  D.flushDamageGroup();
  assert.strictEqual(emitted.length, 2, 'one number per monster, not one per hit');
  assert.strictEqual(emitted[0][3], 'n200', 'the hits on that monster are added up');
  assert.strictEqual(emitted[0][6], 'skill-critical', 'a critical among them keeps the critical treatment');
  assert.strictEqual(emitted[1][3], 'n50', 'the second monster keeps its own number');
  // outside a swing the per-hit path is untouched
  emitted.length = 0;
  D.showDamage(null, 1, 2, 2, 7, false, false);
  assert.strictEqual(emitted.length, 1, 'a stray hit still prints immediately');
  // and the group never survives a swing
  assert.strictEqual(vm.runInContext('dmgGroup', box), null, 'the group is cleared when it is flushed');
});

t('a damage-over-time burn climbs ONE number instead of sprinkling new ones', () => {
  const D = box.__d;
  box.S.dmgShow = true;
  const target = { x: 2, z: 3 };
  box.floats.length = 0;
  D.dotTick(target, 10, '#7dff6b', true);
  D.dotTick(target, 10, '#7dff6b', true);
  D.dotTick(target, 10, '#7dff6b', true);
  assert.strictEqual(box.floats.length, 1, 'a burn keeps a single number for its whole duration');
  assert.strictEqual(box.floats[0].txt, 'n30', 'and tops the same number up as it ticks');
  assert.strictEqual(box.floats[0].life, 1, 'each tick re-punches it, so it never reads as expired');
  assert.strictEqual(target._dotF, box.floats[0], 'the monster remembers its own burn number');
});

t('a swing resolves on the attack animation contact frame, not on the key press', () => {
  const box2 = {};
  vm.createContext(box2);
  const code = src.slice(src.indexOf('const SWING_CONTACT='), src.indexOf('function addJob('));
  vm.runInContext(`
    let mob={x:0,z:0,hp:100,pack:2},mobs=[mob],S={eq:{}},skCd={},skillOn=()=>false,SKILLS=[],
      atkAnim=0,pAtkT=0,pl={x:0,z:0},C=()=>({tier:1,n:'Knight'}),pv=()=>0,st=()=>0,SKFADE=[1],
      dmgGroup=null,log=[];
    const aspd=()=>.5,heroStandoff=()=>1.5,heroSpr=null,SWING_MIN_T=.3,SWING_MAX_T=.55,
      cl=(v,a,b)=>Math.max(a,Math.min(b,v)),pushed=[];
    const strike=(...a)=>log.push(['strike',...a]),shot=()=>log.push(['shot']),skillNameFloat=n=>log.push(['name',n]),
      castSkill=(sk,k)=>log.push(['cast',sk.id,k]),flushDamageGroup=()=>{pushed.push(dmgGroup);log.push(['flush'])};
    ${code}
    this.__swing={
      press:()=>{playerAttack();return {t:swing.t,atkAnim,pAtkT,dur:swingDur,n:log.length,before:swing.casts.length}},
      hitNewest:()=>{mobs.push({x:1,z:1,hp:100,pack:2});swing.target=mobs[0];mobs[0].hp=0;
        return mobs[mobs.length-1]},
      resolve:()=>{resolveSwing(swing);return {log:log.slice(),pushed:pushed.slice(),dmgGroup}}};
  `, box2);
  const S = box2.__swing, pressed = S.press();
  assert.strictEqual(pressed.n, 0, 'pressing attack prints nothing: the swing is scheduled, not resolved');
  assert.ok(Math.abs(pressed.t - .5 * .45) < 1e-9, 'the hit is scheduled at 45% of the drawn attack animation');
  assert.strictEqual(pressed.atkAnim, 1, 'the attack animation starts on the press');
  assert.strictEqual(pressed.pAtkT, .5, 'the swing runs on the real attack interval');
  const r = S.resolve();
  assert.strictEqual(JSON.stringify(r.log), JSON.stringify([['strike', 1], ['shot'], ['flush']]),
    'the swing lands once (strike, shot, one printed number) instead of a hit per frame');
  assert.strictEqual(r.pushed.length, 1, 'the hit group is opened exactly once per swing');
  assert.strictEqual(Object.prototype.toString.call(r.pushed[0]), '[object Map]',
    'and flushDamageGroup receives that group, which is what prints one number per monster');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
