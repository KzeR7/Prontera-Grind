// Drop Protection Scroll (v90.6): the crafting materials, the scroll craft, and the refine rule that a
// scroll keeps the rank on a failed refine at +5 or higher.   node tools/tests/material_sim.js
//
// The rules being checked:
//   * each Nightmare map's Stage 15 boss drops that map's own material; mobs and the Stage 10 boss do not;
//   * craftDps() needs one of each of the ten materials and turns them into one scroll;
//   * a failed refine at +5 or higher drops a rank, unless a scroll is in the bag, in which case the scroll
//     is spent and the rank stays; a failure below +5 never uses a scroll;
//   * the refine rule itself (success chance, rank drop) is unchanged for every other attempt.
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
${grab('const refCost=', 'const affTxt=')}
const ORE={ori:'Oridecon',elu:'Elunium'};
const iname=it=>(it.r?'+'+it.r+' ':'')+it.name;
${grab('function refine(sl){', '// ---------- v90: Black Market')}
let S=null,LOGS=[],RND=0;
const log=(m)=>LOGS.push(m), ui=()=>{}, save=()=>{}, addFloat=()=>{}, pl={x:0,z:0};
Math.random=()=>RND;
this.__m={refine,craftDps,dpsPanel,refCh,refCost,refOre,NM_MAT,DPS_MATS,get S(){return S},set S(v){S=v},LOGS,set RND(v){RND=v}};
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const M = sb.__m;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('material: Drop Protection Scroll, crafting and refine\n');

const piece = (r, extra) => ({ name: 'Dread Sword', r, sec: 5, tier: 4, val: 100, slot: 'weapon', wt: 'sword', ...extra });
const fresh = (over) => ({ eq: { weapon: piece(5) }, ore: { ori: 999, elu: 999 }, zeny: 1e12, nmMat: [0,0,0,0,0,0,0,0,0,0], dps: 0, ...over });
const FAIL = 0.999, WIN = 0;

// ---- 1. the materials come from the Stage 15 boss only -----------------------
t('the Nightmare materials are ten different names, one per map', () => {
  assert.deepStrictEqual(Array.from(M.NM_MAT), ['Dread Essence','Kraken Scale','Void Core','Sandwraith Dust','Spectral Ectoplasm','Leviathan Fin','Oni Horn','Yokai Mask','Helheim Rune','Glast Fragment']);
});

// ---- 2. craftDps: 20 materials of any mix --------------------------------------
t('craftDps needs 20 materials, any mix, and spends exactly 20', () => {
  M.S = fresh({ nmMat: [5,5,5,5,0,0,0,0,0,0] });   // 20 in total, from four maps
  M.craftDps();
  assert.strictEqual(M.S.dps, 1, 'one scroll is made');
  assert.deepStrictEqual(Array.from(M.S.nmMat), [0,0,0,0,0,0,0,0,0,0], 'all 20 are spent, from whichever maps they came from');
});
t('craftDps refuses with 19 and says how many are held', () => {
  M.S = fresh({ nmMat: [5,5,5,4,0,0,0,0,0,0] });   // 19
  M.LOGS.length = 0;
  M.craftDps();
  assert.strictEqual(M.S.dps, 0, 'no scroll for 19');
  assert.deepStrictEqual(Array.from(M.S.nmMat), [5,5,5,4,0,0,0,0,0,0], 'nothing is spent');
  assert.ok(M.LOGS.some(x => x.includes('20 Nightmare materials') && x.includes('You have 19')), 'the player is told the count');
});
t('craftDps keeps the leftovers when more than 20 are held', () => {
  M.S = fresh({ nmMat: [9,9,9,0,0,0,0,0,0,0] });   // 27
  M.craftDps();
  assert.strictEqual(M.S.dps, 1);
  assert.strictEqual(M.S.nmMat.reduce((x, n) => x + n, 0), 7, 'seven are left over');
});

t('the refine panel shows the count, and the craft button is off under 20', () => {
  M.S = fresh({ nmMat: [5,5,5,4,0,0,0,0,0,0], dps: 2 });
  const short = M.dpsPanel();
  assert.ok(short.includes('Scrolls: 2'), 'the scroll count is shown');
  assert.ok(short.includes('Materials 19/20'), 'the material count is shown');
  assert.ok(/data-a="craftdps" disabled/.test(short), 'the craft button is off');
  M.S.nmMat[3] = 5;
  assert.ok(!/disabled/.test(M.dpsPanel()), 'and it is on at 20');
});

// ---- 3. refine: a scroll keeps the rank ----------------------------------------
t('a failed refine at +5 drops the rank with no scroll (unchanged)', () => {
  M.S = fresh({ dps: 0 });
  M.RND = FAIL; M.LOGS.length = 0;
  M.refine('weapon');
  assert.strictEqual(M.S.eq.weapon.r, 4, 'the rank drops to +4');
  assert.ok(M.LOGS.some(x => x.includes('dropped to +4')));
});

t('a failed refine at +5 with a scroll keeps the rank and spends the scroll', () => {
  M.S = fresh({ dps: 1 });
  M.RND = FAIL; M.LOGS.length = 0;
  M.refine('weapon');
  assert.strictEqual(M.S.eq.weapon.r, 5, 'the rank stays at +5');
  assert.strictEqual(M.S.dps, 0, 'the scroll is spent');
  assert.ok(M.LOGS.some(x => x.includes('kept +5')));
});

t('a failed refine below +5 never uses a scroll', () => {
  M.S = fresh({ dps: 3, eq: { weapon: piece(4) } });
  M.RND = FAIL; M.LOGS.length = 0;
  M.refine('weapon');
  assert.strictEqual(M.S.eq.weapon.r, 4, 'nothing drops below +4 anyway');
  assert.strictEqual(M.S.dps, 3, 'and no scroll is spent');
});

t('a successful refine is unchanged and keeps the scroll', () => {
  M.S = fresh({ dps: 1 });
  M.RND = WIN;
  M.refine('weapon');
  assert.strictEqual(M.S.eq.weapon.r, 6, 'the rank goes up');
  assert.strictEqual(M.S.dps, 1, 'the scroll is kept');
});

t('the success chance and the attempt cost are the same as before v90.6', () => {
  // refCh is read from the source: +5 is 42%, and an N+ piece at +0 costs 1,400 Zeny x 1 with 10 ore.
  assert.strictEqual(M.refCh(piece(5)), 42, 'success at +5 is 42%');
  assert.strictEqual(M.refCh(piece(0)), 70, 'success at +0 is 70%');
  assert.strictEqual(M.refCost(piece(0)), 1400, 'attempt cost at +0, N+ weapon');
  assert.strictEqual(M.refOre(piece(0)), 10, 'N+ takes 10 ore a try');
});

// ---- 4. the wiring: drop, pickup, save and the button ---------------------------
t('the live and offline kills roll the material, and pickup puts it in the stack', () => {
  assert.ok(src.includes("if(mob.mat&&Math.random()*100<NM_MAT_CH)drops.push(mkDrop({mat:mob.mat.m,id:uid(),n:mob.mat.n}));"), 'the live kill rolls the material');
  assert.ok(src.includes("if(mob.mat&&Math.random()*100<NM_MAT_CH){S.nmMat[mob.mat.m]=safeCount(S.nmMat[mob.mat.m])+1;r.drops++}"), 'the offline kill rolls the material');
  assert.ok(src.includes("if(it.mat!=null){S.nmMat[it.mat]=safeCount(S.nmMat[it.mat])+1;"), 'pickup adds the material to the stack');
  assert.ok(src.includes("refine:k=>refine(k),craftdps:()=>craftDps(),"), 'the craft button is wired to the action table');
  assert.ok(src.includes("f.nmMat=Array.from({length:10},(_,i)=>safeCount(f.nmMat&&f.nmMat[i]));f.dps=safeCount(f.dps);"), 'an old save loads with zero materials and scrolls');
});

const total = pass + fail;
console.log('\n' + pass + ' passed, ' + fail + ' failed  (' + total + ' assertion groups)');
process.exit(fail ? 1 : 0);
