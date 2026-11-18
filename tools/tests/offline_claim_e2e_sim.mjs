// Real offline-claim contract: actual registration/save handlers + extracted production client applier.
//   node tools/tests/offline_claim_e2e_sim.mjs
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(__dirname,'..','..');

// Offline progress uses the saved recent kill rate, is capped at four hours, and applies half
// of the equivalent online kills before presenting a reward summary.
//   node tools/tests/offline_sim.js
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const from = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  assert.ok(i >= 0 && j > i, `missing source boundary ${a}`);
  return src.slice(i, j);
};
const config = from('const BAGMAX=1000;', 'const MAPTIER=');
// v88.6: save() is inside the span below and checks the save-owner stamp, so the stamp helpers come along.
const stamp = from('// ---------- the save-owner stamp (v88.6) ----------', 'const num_= (v,d)');
const helpers = from('let farmSession=null;', '// ---------- accounts (stored in this browser; real cross-device accounts need a server) ----------');
const stageCode=src.match(/const normalStages=[^\n]*/)[0];
const ascensionCode=from('const ASCENSION_MATERIALS=', 'function kill(o){')+'\n'+src.match(/const ascensionOpen=[^\n]*/)[0];
const newCardCode=require('./helpers/progression')(src,'newCard');
const reward = from('const ascRewardBonus=', '// One field monster, before it is placed.');
const simulation = from('function offlineMobForCurrentField(m=S.mp,stage=S.lvl){', '// ---------- skill effects: damage over time, stun, chain ----------');
// v408: there is no level ceiling any more - a claim pays half its measured minute and the page's
// own curve decides what that buys - so the harness still carries baseNeedAt/needAt.
const curve = [
  src.match(/BASE_EXP_LATE_LV\s*=\s*[0-9]+/)[0],
  src.match(/const NA1=[^;]+;/)[0],
  src.match(/BASE_EXP_LATE_X\s*=\s*[0-9.]+/)[0],
  src.match(/const roundReq\s*=\s*n=>\{[^}]*\};/)[0],
  src.match(/needAt=L=>[\s\S]*?(?=,baseNeedAt=)/)[0].replace(/^needAt=/, 'const needAt = '),
  src.match(/baseNeedAt=L=>[\s\S]*?(?=,need=)/)[0].replace(/^baseNeedAt=/, 'const baseNeedAt = '),
].join('\n') + '\n';

function harness() {
  const state = { saves: 0, writes: [], nextId: 0 };
  const clock = { now: Date.now() };
  class FakeDate extends Date { static now() { return clock.now; } }
  const elements = Object.create(null);
  const $ = id => elements[id] || (elements[id] = { textContent: '', style: {}, onclick: null, focused: false, focus() { this.focused = true; } });
  const stableMath = Object.create(Math); stableMath.random = () => .5;
  const setup = `
    let S = null, currentUser = 'Test', zenyEarned = 0, expEarned = 0;
    const CLOUD = { on: false };const CLASSES={Novice:{}};
    const gmStatSnapshot = () => ({});
    const MAPS = Array.from({length:10},(_,i)=>({n:'Map '+i})); let mapM=0,mapL=1;
    const cl = (v,a,b) => Math.max(a,Math.min(b,v));
    const safeCount = v => {const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(n))):0};
    const lsPut = (k,v) => {state.writes.push([k,v]);state.saves++};
    const saveKey = () => 'pg_save3_Test';
    const lsGet = () => null, log = () => {};   // save() reads the slot's stamp and logs a refusal (v88.6)
    const cloudTouch = () => {};
    const fieldOf = () => ({sec:0,boss:null,mobs:[{n:'Poring',drops:[[ {k:'sword',n:'Training Sword'},100 ]],card:{n:'Poring Card',g:0,stat:'str'},cardCh:100,ore:true,oreCh:1}]});
    const rnd = (a,b)=>a+Math.random()*(b-a), fieldPower = () => 1, EXPK = 50, BOSEK = 46, ZMIN = 1, ZK = [1000,1000], MPS = 100;
    const ri = (a,b) => Math.floor(a + Math.random()*(b-a+1));
    const pv = () => 0, gx = () => 1, expRate = () => 1;
    const earnZeny = n => {S.zeny += n;zenyEarned += n};
    const earnExp = n => {S.exp += n;expEarned += n};
    const questEvent=()=>{};
    const recordMonsterKill = () => {}, qProg = () => {}, addJob = () => {}, checkLevel = () => {};
    const genGear = (T,l,sec,boss,tier) => ({id:++state.nextId,slot:'weapon',wt:'sword',tier:0,val:1,name:T.n,aff:[],cards:[],sec,lvl:l});
    const RAR = [{n:'Common'},{n:'Fine'},{n:'Rare'},{n:'Epic'},{n:'Legendary'}], RAR5 = {n:'N'}, RARALL = RAR.concat([RAR5]);
    const rarIdx = it => ((it && +it.sec >= 4) ? 5 : Math.max(0, Math.min(RAR.length - 1, (it && it.tier) || 0)));
    const autoSellOn = () => false, sellVal = () => 5;
    const canUse = () => true, ekey = () => 'weapon', ev = it => it.val, maxHp = () => 100;
    const cardVal = () => 1, uid = () => ++state.nextId;
    const pickW = () => 0, PW = [[100]], PETS = [], PET_SKILL_WEIGHTS = [], PET_SKILLS = [], EGG = 1;
  `;
  const progression = from('// ---------- Ascension: shared earnings, independent class allocations ----------','const fresh=')+'\n'+src.match(/const FOURTH_JOBS_LIVE=[^;]+;/)[0];
  const code = curve + progression+'\n'+from('// ---------- auto-sell rules:', '// ---------- end auto-sell rules ----------') + '\n' + config + '\n' + stamp + '\n' + helpers + '\n' + newCardCode + '\n' + reward + '\n' + stageCode + '\n' + ascensionCode + '\n' + simulation + `
    globalThis.api = {
      offlinePlan, offlineRateSample, applyOfflineProgress, offlineAwardKill,
      offlineExpBudget, offlineLevelBudget,
      mapSelection(){return[mapM,mapL]},
      OFFLINE_POPUP_MIN_MS, OFFLINE_SIM_COVER_MS, OFFLINE_CAP_MS,
      setState(v){S=v;farmSession=null;if(!Object.hasOwn(S,'offlineIncome'))S.offlineIncome={version:1,key:farmStageKey(),at:S.offlineAt,xp:60,zeny:60,job:42,kph:30000};}, getState(){return S}, setNow(v){clock.now=v}, setCloud(v){CLOUD.on=!!v}, setGate(v){CLOUD.gate=!!v},
      setPageBoot(v){PAGE_BOOT_AT=v}, getPageBoot(){return PAGE_BOOT_AT},
      addSessionZeny(n){zenyEarned+=n}, getSessionZeny(){return zenyEarned},
      recordFarmIncome, hasFarmSession(){return !!farmSession}, elements, $, state
    };
  `;
  const box = { console, Math: stableMath, Date: FakeDate, JSON, Number, String, Object, Array, state, clock, elements, $ };
  vm.createContext(box);
  vm.runInContext(setup.replace('const BAGMAX_PLACEHOLDER = 0;', '') + code, box);
  return box.api;
}

function d1(sqlite){
  const wrap=(stmt,args=[],sql='')=>({
    _stmt:stmt,_args:args,_sql:sql,bind:(...more)=>wrap(stmt,args.concat(more),sql),
    first:async()=>stmt.get(...args)??null,all:async()=>({results:stmt.all(...args)}),
    run:async()=>({success:true,meta:stmt.run(...args)}),
  });
  return {prepare:sql=>wrap(sqlite.prepare(sql),[],sql),batch:async statements=>{
    sqlite.exec('BEGIN IMMEDIATE');try{const rows=statements.map(q=>({success:true,meta:q._stmt.run(...q._args)}));sqlite.exec('COMMIT');return rows}
    catch(e){sqlite.exec('ROLLBACK');throw e}
  }};
}
function env(through=Infinity){
  const sqlite=new DatabaseSync(':memory:');
  for(const name of fs.readdirSync(path.join(root,'migrations')).filter(n=>/^\d+_.*\.sql$/.test(n)).sort())
    if(Number(name.slice(0,name.indexOf('_')))<=through)sqlite.exec(fs.readFileSync(path.join(root,'migrations',name),'utf8'));
  return {sqlite,env:{DB:d1(sqlite)}};
}
function request(method,url,{body,cookie}={}){
  const h=new Map();if(cookie)h.set('cookie',cookie);const text=body===undefined?'':JSON.stringify(body);
  if(text)h.set('content-length',String(Buffer.byteLength(text)));
  return {method,url:'https://pg.test'+url,headers:{get:k=>h.get(String(k).toLowerCase())??null},text:async()=>text};
}
async function invoke(file,method,requestArg,environment){
  const mod=await import(pathToFileURL(path.join(root,'functions',file)).href);
  const response=await mod[method]({request:requestArg,env:environment});
  const data=await response.clone().json();
  return {status:response.status,data,cookie:(response.headers.get('set-cookie')||'').split(';')[0]||null};
}
async function register(environment,u,p){
  return invoke('api/register.js','onRequestPost',request('POST','/api/register',{body:{u,p,email:u+'@example.test'}}),environment);
}
async function put(environment,cookie,u,version,save,claimId=null){
  save.owner=u;
  return invoke('api/save.js','onRequestPut',request('PUT','/api/save',{cookie,body:{owner:u,version,blob:JSON.stringify(save),offlineClaimId:claimId}}),environment);
}
async function get(environment,cookie){return invoke('api/save.js','onRequestGet',request('GET','/api/save',{cookie}),environment)}
const clientSave=(id,income)=>({offlineAt:1,offlineKph:0,offlineRateAt:0,offlineRateKills:0,offlineKillRemainder:0,
  kills:0,kl:0,mp:0,lvl:1,prog:[1],exp:0,zeny:0,ore:{ori:0,elu:0},cards:[],inv:[],eq:{},pets:[],auto:false,
  autoSell:[],jobs:{},q:[],st:{str:1,agi:1,dex:1,luk:1,int:1,vit:1},sk:{},skOff:{},cls:'Novice',runSeq:1,runGen:1,
  accountId:id,base:{},hp:100,offlineIncome:income});
const saveBlob=(id,income)=>({pets:[],cls:'Novice',sex:'m',lv:20,exp:0,hp:100,zeny:0,kills:0,pts:4,jobs:{Novice:{jl:1,jx:0}},
  sk:{aid:1},st:{str:1,agi:1,dex:1,luk:1,int:1,vit:1},eq:{},inv:[],base:{},mp:0,lvl:1,prog:[1,1,1],q:null,cards:[],ore:{ori:0,elu:0},
  runSeq:1,runGen:1,accountId:id,offlineIncome:income});
const minute=(id,xp=60,zeny=30,kph=100)=>({version:1,rewardVersion:6,key:'Novice:0:1',at:1,aid:id,gen:1,xp,zeny,job:0,kph});

let pass=0,fail=0;
async function T(name,fn){try{await fn();console.log('  ok   '+name);pass++}catch(e){console.log('  FAIL '+name+' -> '+e.message);fail++}}
console.log('offline claim API/client integration (real handlers and real applier)\n');

await T('untrained issue -> later minute -> versioned acknowledgement remains permanently nonpaying',async()=>{
  const h=env(),reg=await register(h.env,'E2EUNTRAINED','e2e-untrained-password');assert.equal(reg.status,201);
  const id=h.sqlite.prepare('SELECT id FROM users WHERE username=?').get('E2EUNTRAINED').id;
  const initial=saveBlob(id,undefined);delete initial.offlineIncome;
  assert.equal((await put(h.env,reg.cookie,'E2EUNTRAINED',0,initial)).status,200);
  const start=Date.now()-4*3600000;h.sqlite.prepare('UPDATE saves SET last_seen=?,rate_kph=? WHERE user_id=?').run(start,120,id);
  const issued=await get(h.env,reg.cookie),claim=issued.data.offlineClaim;
  assert.equal(claim.pricingState,'ineligible');assert.equal(claim.pricing,null);assert.equal(claim.intervalStartAt,start);
  const app=harness(),later=minute(id,6000,3000,30000),state=clientSave(id,later);
  app.setState(state);app.setCloud(true);app.setNow(issued.data.serverNow);app.setPageBoot(issued.data.serverNow-1000);
  const result=app.applyOfflineProgress(issued.data.serverNow,claim,{serverNow:issued.data.serverNow,clientRequestAt:issued.data.serverNow});
  assert.equal(result.outcome,'ineligible-pricing');assert.deepEqual([state.kills,state.exp,state.zeny],[0,0,0]);
  const ack=JSON.parse(issued.data.blob);ack.offlineClaimId=claim.id;ack.offlineIncome=later;
  assert.equal((await put(h.env,reg.cookie,'E2EUNTRAINED',issued.data.version,ack,claim.id)).status,200);
  assert.ok(h.sqlite.prepare('SELECT claimed_at FROM offline_reward_claims WHERE id=?').get(claim.id).claimed_at>0);
});

await T('real legacy row still recovers from its matching local minute, while delayed issued bounds cannot be falsely covered',async()=>{
  const h=env(),reg=await register(h.env,'E2ELEGACY','e2e-legacy-password');assert.equal(reg.status,201);
  const id=h.sqlite.prepare('SELECT id FROM users WHERE username=?').get('E2ELEGACY').id, income=minute(id);
  assert.equal((await put(h.env,reg.cookie,'E2ELEGACY',0,saveBlob(id,income))).status,200);
  // A genuine all-null/backfilled row has the compatibility state and a real client can pay it.
  h.sqlite.prepare(`INSERT INTO offline_reward_claims(user_id,away_ms,credited_ms,rate_kph,kills,remainder,issued_at,pricing_state)
    VALUES(?,?,?,?,?,?,?,'legacy')`).run(id,4*3600000,4*3600000,100,200,0,Date.now());
  let got=await get(h.env,reg.cookie),legacy=got.data.offlineClaim;assert.equal(legacy.pricingState,'legacy');
  let app=harness(),state=clientSave(id,income);app.setState(state);app.setCloud(true);app.setNow(got.data.serverNow);app.setPageBoot(got.data.serverNow);
  const recovered=app.applyOfflineProgress(got.data.serverNow,legacy,{serverNow:got.data.serverNow,clientRequestAt:got.data.serverNow});
  assert.ok(recovered.kills>0&&state.exp>0,'legacy compatibility recovery is still a real payout');
  const ack=JSON.parse(got.data.blob);ack.offlineClaimId=legacy.id;assert.equal((await put(h.env,reg.cookie,'E2ELEGACY',got.data.version,ack,legacy.id)).status,200);
  // Actual handler issues a short priced claim. The response is modelled as arriving 2 s late; the
  // page boot was 1 s after the frozen start, so response-now reconstruction would wrongly cover it.
  const start=Date.now()-5*60000;h.sqlite.prepare('UPDATE saves SET last_seen=?,rate_kph=? WHERE user_id=?').run(start,100,id);
  got=await get(h.env,reg.cookie);const priced=got.data.offlineClaim;assert.equal(priced.pricingState,'priced');
  app=harness();state=clientSave(id,income);const requestAt=got.data.serverNow+10000,boot=requestAt-(got.data.serverNow-(priced.intervalStartAt+1000));
  app.setState(state);app.setCloud(true);app.setPageBoot(boot);app.setNow(requestAt+2000);
  const delayed=app.applyOfflineProgress(requestAt+2000,priced,{serverNow:got.data.serverNow,clientRequestAt:requestAt});
  assert.equal(delayed.covered,false);assert.ok(delayed.kills>0&&state.exp>0,'delayed GET cannot consume the issued interval at zero');
});

console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
