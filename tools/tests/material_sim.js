// Refine Protection Scroll (v90.6; recipe set to 20 materials of any mix in v90.7): the crafting materials, the scroll craft, and the refine rule that a
// scroll keeps the rank on a failed refine at +5 or higher.   node tools/tests/material_sim.js
//
// The rules being checked:
//   * each Nightmare map's Stage 15 boss drops that map's own material; mobs and the Stage 10 boss do not;
//   * craftDps() spends DPS_MATS (20) materials of any mix from the stacks and makes one scroll (v90.7);
//   * a failed refine at +5 or higher drops a rank, unless a scroll is in the bag, in which case the scroll
//     is spent and the rank stays when protection is On; On spends a scroll on success too;
//   * turning protection Off leaves the reserve untouched and allows the usual rank loss.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name); return m[0]; };

// The game-side pieces the refine tab uses. The refine tab itself runs in the page, so its helpers are
// read straight from the source; the stubs stand in for the page's log, UI and save.
const harness = `
${pick(/const NM_MAT=\[[^\]]*\];/, 'NM_MAT')}
${pick(/const NM_MAT_CH=[^;]+;/, 'NM_MAT_CH')}
${pick(/const DPS_MATS=\d+;/, 'DPS_MATS')}
const safeCount=v=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(n))):0};
const rarIdx=it=>((it&&+it.sec>=5)?6:(it&&+it.sec>=4)?5:Math.max(0,Math.min(4,(it&&it.tier)||0)));
${grab('const REF_ZENY_MUL=3,refCost=', 'const affTxt=')}
const ORE={ori:'Oridecon',elu:'Elunium'};
const iname=it=>(it.r?'+'+it.r+' ':'')+it.name;
${grab('function refine(sl){', 'const bmOpen=()=>')}
// v311: the workshop now buys missing ore itself, so the Black Market's ore price travels with it.
// Presentation is exercised with a real DOM in eclipse_ui_sim.js.
eclipseRefineFeedback=()=>{};
let S=null,LOGS=[],RND=0;
const questEvent=()=>{};
const log=(m)=>LOGS.push(m), ui=()=>{}, save=()=>{}, addFloat=()=>{}, pl={x:0,z:0};
// The page's modal question. The sim never answers it unless a test asks for the callback.
let ASKED=[];
const ask=(message,yes)=>{ASKED.push({message,yes})};
Math.random=()=>RND;
this.__m={refine,craftDps,dpsPanel,refCh,refCost,refOre,NM_MAT,DPS_MATS,get S(){return S},set S(v){S=v},LOGS,ASKED,set RND(v){RND=v}};
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const M = sb.__m;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('material: Refine Protection Scroll, crafting and refine\n');

const piece = (r, extra) => ({ name: 'Dread Sword', r, sec: 5, tier: 4, val: 100, slot: 'weapon', wt: 'sword', ...extra });
const fresh = (over) => ({ eq: { weapon: piece(5) }, ore: { ori: 999, elu: 999 }, zeny: 1e12, nmMat: [0,0,0,0,0], refineScrolls: 0, useRefineScroll: true, ...over });
const FAIL = 0.999, WIN = 0;

// ---- 1. the materials come from the Stage 15 boss only -----------------------
t('Nightmare materials use only Void Core', () => {
  assert.deepStrictEqual(Array.from(M.NM_MAT), ['Void Core']);
});

// ---- 2. craftDps: 20 materials of any mix --------------------------------------
t('craftDps needs 20 materials, any mix, and spends exactly 20', () => {
  M.S = fresh({ nmMat: [5,5,5,5,0] });   // 20 in total, from four maps
  M.craftDps();
  assert.strictEqual(M.S.refineScrolls, 1, 'one scroll is made');
  assert.deepStrictEqual(Array.from(M.S.nmMat), [0], 'all 20 are spent from the shared wallet');
});
t('craftDps refuses with 19 and says how many are held', () => {
  M.S = fresh({ nmMat: [5,5,5,4,0] });   // 19
  M.LOGS.length = 0;
  M.craftDps();
  assert.strictEqual(M.S.refineScrolls, 0, 'no scroll for 19');
  assert.deepStrictEqual(Array.from(M.S.nmMat), [5,5,5,4,0], 'nothing is spent');
  assert.ok(M.LOGS.some(x => x.includes('20 Void Cores') && x.includes('You have 19')), 'the player is told the count');
});
t('craftDps keeps the leftovers when more than 20 are held', () => {
  M.S = fresh({ nmMat: [9,9,9,0,0] });   // 27
  M.craftDps();
  assert.strictEqual(M.S.refineScrolls, 1);
  assert.strictEqual(M.S.nmMat.reduce((x, n) => x + n, 0), 7, 'seven are left over');
});

t('the refine panel shows the count, and the craft button is off under 20', () => {
  M.S = fresh({ nmMat: [5,5,5,4,0], refineScrolls: 2 });
  const short = M.dpsPanel();
  assert.ok(short.includes('Scrolls: 2'), 'the scroll count is shown');
  assert.ok(short.includes('Materials 19/20'), 'the material count is shown');
  assert.ok(/data-a="craftdps" disabled/.test(short), 'the craft button is off');
  M.S.nmMat[3] = 5;
  assert.ok(!/disabled/.test(M.dpsPanel()), 'and it is on at 20');
});

// ---- 3. refine buys what you are short of (v311) --------------------------------
t('a short ore stack is bought only after the purchase is confirmed, at the Black Market price', () => {
  M.S = fresh({ refineScrolls: 0, useRefineScroll: false, ore: { ori: 6, elu: 0 }, zeny: 1e6 });
  const need = M.refOre(M.S.eq.weapon), fee = M.refCost(M.S.eq.weapon), miss = need - 6;
  M.RND = WIN; M.LOGS.length = 0; M.ASKED.length = 0;
  const zeny = M.S.zeny, before = JSON.stringify(M.S.eq.weapon);
  M.refine('weapon');
  // v313: the purchase is a question that names the count, the unit price and the total.
  assert.strictEqual(M.ASKED.length, 1, 'the purchase is asked, not assumed');
  assert.strictEqual(M.S.eq.weapon.r, 5, 'and nothing has been refined yet');
  assert.strictEqual(M.S.zeny, zeny, 'and not a coin spent');
  assert.strictEqual(JSON.stringify(M.S.eq.weapon), before);
  assert.match(M.ASKED[0].message, new RegExp('Buy the missing ' + miss + ' Oridecon'), 'it names how many');
  assert.match(M.ASKED[0].message, new RegExp((miss * 100000).toLocaleString() + 'z'), 'and what they cost');
  assert.match(M.ASKED[0].message, new RegExp((fee + miss * 100000).toLocaleString() + 'z'), 'and the total for the attempt');
  M.ASKED[0].yes();
  assert.strictEqual(M.S.eq.weapon.r, 6, 'the refine still lands');
  assert.strictEqual(M.S.ore.ori, 6 + (need - 6) - need, 'the shortfall is bought, then spent');
  assert.strictEqual(zeny - M.S.zeny, fee + (need - 6) * 100000, 'the attempt costs its fee plus the ore it had to buy');
  assert.ok(M.LOGS.some(x => /Bought \d+ Oridecon for [\d,]+z to finish this refine/.test(x)), 'the purchase is announced, not silent');
});

t('cancelling the purchase confirmation spends nothing at all', () => {
  // The owner's worry: "players just press and finish all the zeny". Declining leaves the wallet,
  // the bench and the rank exactly as they were - and asks again next time, because nothing is remembered.
  M.S = fresh({ refineScrolls: 0, useRefineScroll: false, ore: { ori: 1, elu: 0 }, zeny: 1e6 });
  M.RND = WIN; M.LOGS.length = 0; M.ASKED.length = 0;
  const before = JSON.stringify(M.S);
  M.refine('weapon');
  assert.strictEqual(M.ASKED.length, 1);
  assert.strictEqual(JSON.stringify(M.S), before, 'a refused purchase has spent nothing');
  assert.ok(!M.LOGS.some(x => /Bought/.test(x)), 'and bought no ore');
  M.ASKED[0].yes();
  assert.ok(M.S.zeny < 1e6, 'agreeing to it does buy');
});

t('a short stack with no Zeny for the ore buys nothing and says why', () => {
  M.S = fresh({ refineScrolls: 0, useRefineScroll: false, ore: { ori: 1, elu: 0 }, zeny: 50000 });
  M.RND = WIN; M.LOGS.length = 0;
  const before = JSON.stringify(M.S.eq.weapon);
  M.refine('weapon');
  assert.strictEqual(JSON.stringify(M.S.eq.weapon), before, 'nothing was refined');
  assert.strictEqual(M.S.ore.ori, 1, 'and nothing was bought');
  assert.strictEqual(M.S.zeny, 50000);
  assert.ok(M.LOGS.some(x => /Not enough Zeny/.test(x)));
});

t('cancelling the scroll confirmation buys nothing', () => {
  // The protection-scroll question is asked before the ore is bought, so "Cancel" leaves the
  // wallet and the bench exactly as they were.
  M.S = fresh({ refineScrolls: 1, useRefineScroll: true, ore: { ori: 2, elu: 0 }, zeny: 1e6, eq: { weapon: piece(3) } });
  M.RND = WIN; M.LOGS.length = 0; M.ASKED.length = 0;
  const before = JSON.stringify(M.S);
  M.refine('weapon');
  assert.strictEqual(M.ASKED.length, 1, 'the scroll question is asked first');
  assert.strictEqual(JSON.stringify(M.S), before, 'an unanswered confirmation has spent nothing');
  assert.ok(!M.LOGS.some(x => /Bought/.test(x)), 'and has bought no ore');
});

t('the purchase is asked before the scroll question, and both must be answered', () => {
  M.S = fresh({ refineScrolls: 1, useRefineScroll: true, ore: { ori: 2, elu: 0 }, zeny: 1e6, eq: { weapon: piece(3) } });
  M.RND = WIN; M.LOGS.length = 0; M.ASKED.length = 0;
  const need = M.refOre(M.S.eq.weapon), fee = M.refCost(M.S.eq.weapon), zeny = M.S.zeny;
  M.refine('weapon');
  assert.strictEqual(M.ASKED.length, 1, 'one question at a time');
  assert.match(M.ASKED[0].message, /Buy the missing/, 'the money question comes first');
  M.ASKED[0].yes();
  assert.strictEqual(M.ASKED.length, 2, 'then the scroll question');
  assert.match(M.ASKED[1].message, /Protection Scroll/);
  assert.strictEqual(M.S.eq.weapon.r, 3, 'still nothing refined until every question is answered');
  M.ASKED[1].yes();
  assert.strictEqual(M.S.eq.weapon.r, 4, 'the refine lands after both answers');
  assert.strictEqual(M.S.ore.ori, 0, 'the bought ore is spent on the attempt');
  assert.strictEqual(zeny - M.S.zeny, fee + (need - 2) * 100000, 'fee plus the ore it had to buy');
});

t('a full stack never touches the auto-purchase', () => {
  M.S = fresh({ refineScrolls: 0, useRefineScroll: false, ore: { ori: 999, elu: 0 } });
  M.RND = WIN; M.LOGS.length = 0;
  M.refine('weapon');
  assert.ok(!M.LOGS.some(x => /Bought/.test(x)), 'no purchase line when the bench has the ore');
});

// ---- 3b. refine: a scroll keeps the rank ----------------------------------------
t('a failed refine at +5 drops the rank with no scroll (unchanged)', () => {
  M.S = fresh({ refineScrolls: 0, useRefineScroll: false });
  M.RND = FAIL; M.LOGS.length = 0;
  M.refine('weapon');
  assert.strictEqual(M.S.eq.weapon.r, 4, 'the rank drops to +4');
  assert.ok(M.LOGS.some(x => x.includes('dropped to +4')));
});

t('a failed refine at +5 with a scroll keeps the rank and spends the scroll', () => {
  M.S = fresh({ refineScrolls: 1 });
  M.RND = FAIL; M.LOGS.length = 0;
  M.refine('weapon');
  assert.strictEqual(M.S.eq.weapon.r, 5, 'the rank stays at +5');
  assert.strictEqual(M.S.refineScrolls, 0, 'the scroll is spent');
  assert.ok(M.LOGS.some(x => x.includes('kept +5')));
});

t('an unprotected failure below +5 never uses a scroll', () => {
  M.S = fresh({ refineScrolls: 3, useRefineScroll: false, eq: { weapon: piece(4) } });
  M.RND = FAIL; M.LOGS.length = 0;
  M.refine('weapon');
  assert.strictEqual(M.S.eq.weapon.r, 4, 'nothing drops below +4 anyway');
  assert.strictEqual(M.S.refineScrolls, 3, 'and no scroll is spent');
});

t('a successful protected refine spends one scroll', () => {
  M.S = fresh({ refineScrolls: 1 });
  M.RND = WIN;
  M.refine('weapon');
  assert.strictEqual(M.S.eq.weapon.r, 6, 'the rank goes up');
  assert.strictEqual(M.S.refineScrolls, 0, 'the selected scroll is spent');
});

t('the success chance is the same as before v90.6, and the attempt cost is x3 since v90.8', () => {
  // refCh is read from the source: +5 is 42%. v90.8 (owner, Zeny sink): an N+ piece at +0 costs 4,200 Zeny (was 1,400) with 10 ore.
  assert.strictEqual(M.refCh(piece(5)), 42, 'success at +5 is 42%');
  assert.strictEqual(M.refCh(piece(0)), 70, 'success at +0 is 70%');
  assert.strictEqual(M.refCost(piece(0)), 4200, 'attempt cost at +0, N+ weapon: 3 x 1,400 (v90.8)');
  assert.strictEqual(M.refOre(piece(0)), 10, 'N+ takes 10 ore a try');
});

// ---- 4. the wiring: drop, pickup, save and the button ---------------------------
t('the live and offline kills roll the material, and pickup puts it in the stack', () => {
  assert.ok(src.includes("if(mob.mat&&Math.random()*100<NM_MAT_CH)drops.push(mkDrop({mat:mob.mat.m,id:uid(),n:mob.mat.n}));"), 'the live kill rolls the material');
  assert.ok(src.includes("if(mob.mat&&Math.random()*100<NM_MAT_CH){S.nmMat[mob.mat.m]=safeCount(S.nmMat[mob.mat.m])+1;r.drops++}"), 'the offline kill rolls the material');
  assert.ok(src.includes("if(it.mat!=null){S.nmMat[it.mat]=safeCount(S.nmMat[it.mat])+1;"), 'pickup adds the material to the stack');
  assert.ok(src.includes("refine:k=>refine(k),craftdps:()=>craftDps(),"), 'the craft button is wired to the action table');
  assert.ok(src.includes("repairMaterials(f,s.nmMatVersion);f.dps=safeCount(f.dps);"), 'an old save loads with zero materials and scrolls');
});

const total = pass + fail;
console.log('\n' + pass + ' passed, ' + fail + ' failed  (' + total + ' assertion groups)');
process.exit(fail ? 1 : 0);
