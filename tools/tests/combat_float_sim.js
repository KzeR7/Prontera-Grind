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
const box = { S: {}, numTxt: n => 'n' + n, addFloat: (...args) => emitted.push(args) };
vm.createContext(box);
vm.runInContext(damageCode + ';globalThis.__damageFloat=damageFloat;', box);
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
t('critical styling wins over the skill color and stays modestly larger', () => {
  emitted.length = 0; box.__damageFloat(1, 2, 3, 2400, true, false, true);
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
t('projected hit numbers stay absolute, and skill/critical distinctions avoid oversized ornaments', () => {
  assert.ok(src.includes('.fl.damage,.fl.skill-damage,.fl.critical,.fl.incoming{position:absolute'), 'screen projection needs absolute nodes');
  assert.ok(src.includes('.fl.critical{font-size:21px'), 'critical numbers are only modestly larger');
  assert.ok(!src.includes('.fl.critical::before{')&&!src.includes('.fl.critical::after{'), 'critical has no frame or tag');
  assert.ok(src.includes('.fl.skill-damage{font-size:17px')&&!src.includes('.fl.skill-damage::before'), 'skill hits use color, not a large backing plate');
});
t('direct, AoE, chain, DoT and delayed hits retain their skill visual type', () => {
  assert.ok(src.includes('strike(m,sk.col,!!sk.magic,true)'));
  assert.ok(src.includes('hurt(o,Math.max(1,Math.round(base*m*.8)),sk.col,false,true)'));
  assert.ok(src.includes('chainHit(target,base*m*(sk.chain.pow||.5),sk.col,Math.min(4,(sk.chain.n||2)+Math.floor(lv(sk.id)/2)),true)'));
  assert.ok(src.includes('applyDot(target,base*m*(sk.dot.pow||.05),sk.dot.dur||4,sk.dot.col||sk.col,true)'));
  assert.ok(src.includes('magic:!!sk.magic,skill:true'));
  assert.ok(src.includes('damageFloat(o.x+rnd(-.4,.4),1.2+.8*(o.spriteScale||o.size),o.z,d,c,false,skill)'));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
