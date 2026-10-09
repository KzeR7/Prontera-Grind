// Offline progress uses the saved recent kill rate, is capped at four hours, and applies half
// of the equivalent online kills before presenting a reward summary.
//   node tools/tests/offline_sim.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const from = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  assert.ok(i >= 0 && j > i, `missing source boundary ${a}`);
  return src.slice(i, j);
};
const config = from('const BAGMAX=1000;', 'const MAPTIER=');
// v88.6: save() is inside the span below and checks the save-owner stamp, so the stamp helpers come along.
const stamp = from('// ---------- the save-owner stamp (v88.6) ----------', 'const num_= (v,d)');
const helpers = from('function offlineRateSample(now=Date.now()){', '// ---------- accounts (stored in this browser; real cross-device accounts need a server) ----------');
const simulation = from('function offlineMobForCurrentField(){', '// ---------- skill effects: damage over time, stun, chain ----------');

function harness() {
  const state = { saves: 0, writes: [], nextId: 0 };
  const clock = { now: Date.now() };
  class FakeDate extends Date { static now() { return clock.now; } }
  const elements = Object.create(null);
  const $ = id => elements[id] || (elements[id] = { textContent: '', style: {}, onclick: null, focused: false, focus() { this.focused = true; } });
  const stableMath = Object.create(Math); stableMath.random = () => .5;
  const setup = `
    let S = null, currentUser = 'Test', zenyEarned = 0, expEarned = 0;
    const CLOUD = { on: false };
    const MAPS = Array.from({length:10},(_,i)=>({n:'Map '+i})); let mapM=0,mapL=1;
    const cl = (v,a,b) => Math.max(a,Math.min(b,v));
    const safeCount = v => {const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(n))):0};
    const lsPut = (k,v) => {state.writes.push([k,v]);state.saves++};
    const saveKey = () => 'pg_save3_Test';
    const lsGet = () => null, log = () => {};   // save() reads the slot's stamp and logs a refusal (v88.6)
    const cloudTouch = () => {};
    const fieldOf = () => ({sec:0,boss:null,mobs:[{n:'Poring',drops:[[ {k:'sword',n:'Training Sword'},100 ]],card:{n:'Poring Card',g:0,stat:'str'},cardCh:100,ore:true,oreCh:1}]});
    const rnd = (a,b)=>a+Math.random()*(b-a), fieldPower = () => 1, EXPK = 50, ZMIN = 1, ZK = [1000,1000], MPS = 100;
    const ri = (a,b) => Math.floor(a + Math.random()*(b-a+1));
    const pv = () => 0, gx = () => 1, expRate = () => 1;
    const earnZeny = n => {S.zeny += n;zenyEarned += n};
    const earnExp = n => {S.exp += n;expEarned += n};
    const recordMonsterKill = () => {}, qProg = () => {}, addJob = () => {}, checkLevel = () => {};
    const genGear = (T,l,sec,boss,tier) => ({id:++state.nextId,slot:'weapon',wt:'sword',tier:0,val:1,name:T.n,aff:[],cards:[],sec,lvl:l});
    const RAR = [{n:'Common'},{n:'Fine'},{n:'Rare'},{n:'Epic'},{n:'Legendary'}], RAR5 = {n:'N'}, RARALL = RAR.concat([RAR5]);
    const rarIdx = it => ((it && +it.sec >= 4) ? 5 : Math.max(0, Math.min(RAR.length - 1, (it && it.tier) || 0)));
    const autoSellOn = () => false, sellVal = () => 5;
    const canUse = () => true, ekey = () => 'weapon', ev = it => it.val, maxHp = () => 100;
    const cardVal = () => 1, uid = () => ++state.nextId;
    const pickW = () => 0, PW = [[100]], PETS = [], PET_SKILL_WEIGHTS = [], PET_SKILLS = [], EGG = 1;
  `;
  const code = config + '\n' + stamp + '\n' + helpers + '\n' + simulation + `
    globalThis.api = {
      offlinePlan, offlineRateSample, applyOfflineProgress, offlineAwardKill,
      mapSelection(){return[mapM,mapL]},
      OFFLINE_POPUP_MIN_MS, OFFLINE_SIM_COVER_MS, OFFLINE_CAP_MS,
      setState(v){S=v}, getState(){return S}, setNow(v){clock.now=v}, setCloud(v){CLOUD.on=!!v},
      setPageBoot(v){PAGE_BOOT_AT=v}, getPageBoot(){return PAGE_BOOT_AT}, elements, $, state
    };
  `;
  const box = { console, Math: stableMath, Date: FakeDate, JSON, Number, String, Object, Array, state, clock, elements, $ };
  vm.createContext(box);
  vm.runInContext(setup.replace('const BAGMAX_PLACEHOLDER = 0;', '') + code, box);
  return box.api;
}
const h = harness();
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
}
console.log('offline reward plan and simulation\n');

t('one offline hour awards exactly half the saved online kill rate', () => {
  const p = h.offlinePlan(1, 1 + 3600000, 120, 0);
  assert.strictEqual(p.show, true);
  assert.strictEqual(p.creditedMs, 3600000);
  assert.strictEqual(p.kills, 60);
});

t('long absences are capped at four hours before applying the half-rate multiplier', () => {
  const p = h.offlinePlan(1, 1 + 24*3600000, 100, 0);
  assert.strictEqual(p.awayMs, 24*3600000);
  assert.strictEqual(p.creditedMs, 4*3600000);
  assert.strictEqual(p.kills, 200);
});

t('fractional kills carry forward, while sub-minute absences do not open a reward popup', () => {
  const p = h.offlinePlan(1, 1 + 3600000, .5, .75);
  assert.strictEqual(p.kills, 1);
  assert.strictEqual(p.remainder, 0);
  assert.strictEqual(h.offlinePlan(1, 1 + 59999, 1000, 0).show, false);
  assert.strictEqual(h.offlinePlan(0, 3600001, 1000, 0).show, false);
});

t('offline normal Stage 10 boss clears follow Auto-advance but never jump into Nightmare', () => {
  const award = (map, adv) => {
    const S={offlineAt:1,kills:0,kl:0,mp:map,lvl:10,prog:Array(10).fill(1),adv,zeny:0,exp:0,
      ore:{ori:0,elu:0},cards:[],inv:[],eq:{},pets:[],auto:false,autoSell:[],q:[]};
    h.setState(S);const r={kills:0,zeny:0,exp:0,stages:0};
    h.offlineAwardKill({boss:true,zeny:1,exp:1,drops:[],cardCh:0,ore:false,lvl:1,sec:0},r);
    return {S,r,selection:h.mapSelection()};
  };
  const next=award(3,true);
  assert.deepStrictEqual([next.S.mp,next.S.lvl,next.r.stages], [4,1,1], 'a boss clear advances to the next normal map');
  assert.deepStrictEqual(Array.from(next.selection),[4,1], 'the map selection follows the offline route');
  const farm=award(3,false);
  assert.deepStrictEqual([farm.S.mp,farm.S.lvl,farm.r.stages],[3,10,0], 'Auto-advance off leaves the MVP field farmable');
  const last=award(9,true);
  assert.deepStrictEqual([last.S.mp,last.S.lvl,last.r.stages],[9,10,0], 'Abyss Stage 10 never auto-jumps into Nightmare');
});

t('v88: offline catch-up - Auto-advance on walks a parked player forward, off leaves them farming (owner: "sometimes it does nothing")', () => {
  // The harness's MPS is 100, so one kill from kl=99 fires the stage gate.
  const award = (lvl, prog, adv) => {
    const S={offlineAt:1,kills:0,kl:99,mp:0,lvl,prog:Array(10).fill(prog),adv,zeny:0,exp:0,
      ore:{ori:0,elu:0},cards:[],inv:[],eq:{},pets:[],auto:false,autoSell:[],q:[]};
    h.setState(S);const r={kills:0,zeny:0,exp:0,stages:0};
    h.offlineAwardKill({boss:false,zeny:1,exp:1,drops:[],cardCh:0,ore:false,lvl:1,sec:0},r);
    return {S,r};
  };
  const up=award(3,10,true);
  assert.deepStrictEqual([up.S.lvl,up.S.prog[0],up.r.stages],[4,10,1],'fifteen-kill gate below the frontier advances one stage when Auto-advance is on');
  const farm=award(3,10,false);
  assert.deepStrictEqual([farm.S.lvl,farm.S.prog[0],farm.r.stages],[3,10,0],'Auto-advance off still farms the stage');
  const frontier=award(5,5,false);
  assert.deepStrictEqual([frontier.S.lvl,frontier.S.prog[0],frontier.r.stages],[5,6,0],'the frontier clear still unlocks the next stage with the switch off');
});

t('cloud accounts use the server-authorized kill budget and cannot reuse a claim ID', () => {
  const S = { offlineAt:1,offlineKph:30000,offlineRateAt:0,offlineRateKills:0,offlineKillRemainder:0,
    kills:0,kl:0,mp:0,lvl:1,prog:[1],exp:0,zeny:0,ore:{ori:0,elu:0},cards:[],inv:[],eq:{},
    pets:[],auto:false,autoSell:[false,false,false,false,false],jobs:{},q:[],st:{str:1,agi:1,dex:1,luk:1,int:1,vit:1},
    sk:{},skOff:{},cls:'Novice',base:{},hp:100 };
  h.setState(S);h.setCloud(true);h.setNow(9*3600000);
  const claim={id:17,awayMs:8*3600000,creditedMs:4*3600000,rateKph:100,kills:200,remainder:.25};
  const r=h.applyOfflineProgress(9*3600000,claim);
  assert.strictEqual(r.kills,200,'the client follows the server kill budget, not its saved 30,000 KPH');
  assert.strictEqual(r.awayMs,8*3600000);
  assert.strictEqual(S.kills,200);
  assert.strictEqual(S.offlineClaimId,17);
  const writes=h.state.saves;
  const again=h.applyOfflineProgress(9*3600000,claim);
  assert.strictEqual(again.alreadyApplied,true,'a pending retry does not simulate the same claim again');
  assert.strictEqual(S.kills,200);
  assert.strictEqual(h.state.saves,writes);
  h.setCloud(false);
});

t('an online cloud account receives no rewards from its device clock without a server claim', () => {
  const S={offlineAt:1,offlineKph:30000,offlineKillRemainder:0,kills:0,ore:{ori:0,elu:0},pets:[],inv:[],cards:[]};
  h.setState(S);h.setCloud(true);
  assert.strictEqual(h.applyOfflineProgress(8*3600000),null);
  assert.strictEqual(S.kills,0);
  h.setCloud(false);
});

t('online kills are sampled in real elapsed time and the stored rate is bounded', () => {
  const S = { kills: 20, offlineRateAt: 0, offlineRateKills: 0, offlineKph: 0 };
  h.setState(S); h.offlineRateSample(1000);
  assert.strictEqual(S.offlineRateAt, 1000, 'the first sample starts a baseline');
  S.kills = 25; h.offlineRateSample(30000);
  assert.strictEqual(S.offlineKph, 0, 'a partial minute is not treated as a full sample');
  h.offlineRateSample(61000);
  assert.strictEqual(S.offlineKph, 300, 'five kills in one minute become 300 per hour');
  S.kills += 10000; h.offlineRateSample(121000);
  assert.strictEqual(S.offlineKph, 30000, 'implausible rates are capped to keep simulation bounded');
});

t('offline simulation grants EXP, Zeny, gear, cards, both ores, and shows its full summary', () => {
  const S = { offlineAt:1,offlineKph:2,offlineRateAt:0,offlineRateKills:0,offlineKillRemainder:0,
    kills:0,kl:0,mp:0,lvl:1,prog:[1],exp:0,zeny:0,ore:{ori:0,elu:0},cards:[],inv:[],eq:{},
    pets:[],auto:false,autoSell:[false,false,false,false,false],jobs:{},q:[],st:{str:1,agi:1,dex:1,luk:1,int:1,vit:1},
    sk:{},skOff:{},cls:'Novice',base:{},hp:100 };
  h.setState(S); h.state.saves = 0; h.state.writes.length = 0;
  const now = 3600001; h.setNow(now);
  const r = h.applyOfflineProgress(now);
  assert.strictEqual(r.kills, 1);
  assert.strictEqual(r.drops, 4, 'one item, one card and two ore rewards are counted');
  assert.strictEqual(r.items, 1);
  assert.strictEqual(r.cards, 1);
  assert.strictEqual(S.kills, 1);
  assert.ok(S.exp > 0 && S.zeny > 0, 'EXP and Zeny are added to the save');
  assert.strictEqual(S.inv.length, 1);
  assert.strictEqual(S.cards.length, 1);
  assert.deepStrictEqual([S.ore.ori,S.ore.elu], [1,1]);
  assert.strictEqual(S.offlineAt, now, 'the timestamp is advanced so the same interval cannot pay twice');
  assert.strictEqual(h.state.saves, 1, 'updated rewards are saved');
  assert.strictEqual(h.$('offlineModal').style.display, 'flex');
  assert.strictEqual(h.$('offlineAway').textContent, '1h');
  assert.strictEqual(h.$('offlineKills').textContent, '+1');
  assert.strictEqual(h.$('offlineItems').textContent, '+1');
  assert.strictEqual(h.$('offlineCards').textContent, '+1');
  assert.match(h.$('offlineExplanation').textContent, /50%/);
  h.$('offlineContinue').onclick();
  assert.strictEqual(h.$('offlineModal').style.display, 'none');
});

t('a claim this page has been alive for is acknowledged, never paid again (v73)', () => {
  const S = { offlineAt:1,offlineKph:30000,offlineRateAt:0,offlineRateKills:0,offlineKillRemainder:0,
    kills:0,kl:0,mp:0,lvl:1,prog:[1],exp:0,zeny:0,ore:{ori:0,elu:0},cards:[],inv:[],eq:{},
    pets:[],auto:false,autoSell:[false,false,false,false,false],jobs:{},q:[],st:{str:1,agi:1,dex:1,luk:1,int:1,vit:1},
    sk:{},skOff:{},cls:'Novice',base:{},hp:100 };
  const now = 9 * 3600000;
  h.setState(S); h.setCloud(true); h.setNow(now);
  h.setPageBoot(1);                                  // the page has been open since the beginning
  h.$('offlineModal').style.display = 'none';
  const writes = h.state.saves;
  // a five-minute window inside this page's lifetime: the sim replayed it (or ground it while
  // hidden) at full rate, so paying the server budget too would double those minutes
  const r = h.applyOfflineProgress(now, { id:44, awayMs:5 * 60000, creditedMs:5 * 60000, rateKph:100, kills:5, remainder:0 });
  assert.strictEqual(r.covered, true, 'the window lies inside this page lifetime');
  assert.strictEqual(r.show, false, 'a covered claim must not open the popup');
  assert.strictEqual(r.kills, 0, 'and must not simulate the same minutes twice');
  assert.strictEqual(S.kills, 0);
  assert.strictEqual(S.offlineClaimId, 44, 'the claim is still acknowledged so the server clears it');
  assert.strictEqual(S.offlineAt, now, 'the timestamp advances so the window can never pay later');
  assert.strictEqual(h.state.saves, writes + 1, 'the acknowledgement is saved');
  assert.strictEqual(h.$('offlineModal').style.display, 'none', 'no welcome-back card');
  // the old one-minute throttled-tab gap no longer even reaches the popup floor
  const tiny = h.applyOfflineProgress(now, { id:43, awayMs:60000, creditedMs:60000, rateKph:100, kills:1, remainder:0 });
  assert.strictEqual(tiny.show, false, 'a one-minute gap is below the three-minute away window');
  assert.strictEqual(tiny.kills, 0);
  h.setCloud(false);
});

t('a real absence is still paid in full (page born after the window)', () => {
  const S = { offlineAt:1,offlineKph:30000,offlineRateAt:0,offlineRateKills:0,offlineKillRemainder:0,
    kills:0,kl:0,mp:0,lvl:1,prog:[1],exp:0,zeny:0,ore:{ori:0,elu:0},cards:[],inv:[],eq:{},
    pets:[],auto:false,autoSell:[false,false,false,false,false],jobs:{},q:[],st:{str:1,agi:1,dex:1,luk:1,int:1,vit:1},
    sk:{},skOff:{},cls:'Novice',base:{},hp:100 };
  const now = 9 * 3600000, claim = { id:45, awayMs:3 * 3600000, creditedMs:3 * 3600000, rateKph:100, kills:150, remainder:0 };
  h.setState(S); h.setCloud(true); h.setNow(now);
  h.setPageBoot(now - 60000);                        // this page just booted; the 3h window predates it
  h.$('offlineModal').style.display = 'none';
  const r = h.applyOfflineProgress(now, claim);
  assert.strictEqual(r.covered, false);
  assert.strictEqual(r.kills, 150, 'a tab that was closed pays the whole server budget');
  assert.strictEqual(S.kills, 150);
  assert.strictEqual(h.$('offlineModal').style.display, 'flex');
  // a long frozen gap is paid too: the sim can only replay its 10-minute catch-up budget
  const long = { id:46, awayMs:h.OFFLINE_SIM_COVER_MS + 1, creditedMs:h.OFFLINE_SIM_COVER_MS + 1, rateKph:100, kills:20, remainder:0 };
  h.setPageBoot(1);
  const r2 = h.applyOfflineProgress(now, long);
  assert.strictEqual(r2.covered, false, 'a window longer than the sim catch-up budget is a real absence');
  assert.strictEqual(r2.kills, 20);
  h.setCloud(false);
});

t('the client and the server share the three-minute away window, not the old one minute', () => {
  assert.strictEqual(h.OFFLINE_POPUP_MIN_MS, 3 * 60 * 1000, 'client popup floor');
  assert.strictEqual(h.OFFLINE_SIM_COVER_MS, 10 * 60 * 1000, 'the cover window mirrors SIM_CATCHUP');
  assert.ok(src.includes('const SIM_CATCHUP=600;'), 'SIM_CATCHUP stays the catch-up budget the cover window mirrors');
  assert.ok(!src.includes('OFFLINE_POPUP_MIN_MS=60000'), 'the one-minute floor that produced the 1m popup must be gone');
  const server = fs.readFileSync(__dirname + '/../../functions/api/save.js', 'utf8');
  assert.match(server, /const OFFLINE_MIN_MS = 3 \* 60 \* 1000;/,
    'the server must mint no claim for a background tab\'s ~1-minute sync gap');
  assert.match(server, /OFFLINE_REWARD_MULT = \.5;/, 'the half-rate factor is unchanged');
  assert.match(server, /OFFLINE_CAP_MS = 4 \* 60 \* 60 \* 1000;/, 'the four-hour cap is unchanged');
});

t('initial local and cloud session paths are wired to apply offline progress and the popup fields exist', () => {
  assert.match(src, /function initSession\(gm,newAccount=false\)[\s\S]*?applyOfflineProgress\(\)/);
  assert.match(src, /async function cloudJoin\(u,localBlob\)[\s\S]*?applyOfflineProgress\(Date\.now\(\),data\.offlineClaim\)/);
  for (const id of ['offlineAway','offlineCredited','offlineDrops','offlineExp','offlineItems','offlineCards','offlineContinue'])
    assert.ok(src.includes(`id="${id}"`), `offline summary is missing ${id}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
