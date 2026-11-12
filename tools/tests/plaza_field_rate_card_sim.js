/* v390 regression: the plaza's Field card must show the MEASURED rate, not the live HUD sampler.
   Owner report: "in social hub i still dont get exp from field".
   The card copied #expmin/#zenymin, which are live combat readings on a 30s idle reset
   (HUD_IDLE_RESET). Standing in the plaza therefore showed 0 EXP/min - and a player reading
   0/min concludes the plaza pays nothing - while a perfectly good rate sat in S.offlineIncome. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const ASSETS='assets/social.js';

function build(income){
 const dom=new JSDOM('<div id="view"></div><div id="socialHub" hidden></div><div id="socialFieldMonitor"></div>',
   {runScripts:'outside-only'});
 const w=dom.window;
 const mk=id=>{const e=w.document.createElement('div');e.id=id;w.document.body.appendChild(e);return e};
 ['socialFieldExp','socialFieldZeny','socialFieldState','socialDigipetDock','activityStatus'].forEach(mk);
 Object.assign(w,{
  $id:id=>w.document.getElementById(id),
  hub:(()=>{const e=w.document.getElementById('socialHub');e.hidden=false;e.classList.toggle=()=>{};e.classList.contains=()=>false;return e})(),
  fieldMonitor:w.document.getElementById('socialFieldMonitor'),
  hubFirstPending:false,respawn:0,CLOUD:{on:false,lost:false,paused:false,gate:false},
  S:{cls:'Novice',mp:0,lvl:1,offlineIncome:income},
  currentUser:'rate-card',TRIAL:{on:false},JOB_RITE:{on:false},CLASSES:{Novice:1},MAPS:new Array(20).fill({}),
  ASC_REWARD_VERSION:6,eclipseMetricNumber:n=>String(Math.round(Number(n)||0)),
  syncDigipetDock(){},sanctuaryName(){return ''},gymClock(){return ''},myPve:()=>null,myPvp:()=>null,
  worldTraining:null,openActivityPanel(){},PGDigimonSanctuary:{DURATION:0},tabs:[],
 });
 // the real validator from index.html, so this suite tests the real acceptance rule
 w.eval(`function plazaFarmIncome(){const i=S.offlineIncome,s=String(i?.key||'').split(':'),sm=Number(s[1]),ss=Number(s[2]);
  const v=i&&i.version===1&&(sm<10||i.rewardVersion===ASC_REWARD_VERSION)&&s.length===3&&Object.hasOwn(CLASSES,s[0])&&
   Number.isInteger(sm)&&sm>=0&&sm<MAPS.length&&Number.isInteger(ss)&&ss>=1&&ss<=(sm>=10?5:15)&&Number.isFinite(i.at)&&
   ['xp','zeny','job'].every(k=>Number.isFinite(i[k])&&i[k]>=0);
  return v&&['xp','zeny','job'].some(k=>i[k]>0)?i:null}`);
 const src=fs.readFileSync(ASSETS,'utf8');
 w.eval(src.slice(src.indexOf('function syncFieldMonitor'),src.indexOf('const leaveWarning')));
 return w;
}
const RATE={version:1,key:'Novice:0:1',at:1,rewardVersion:6,xp:600,zeny:300,job:420,kph:600};

const w=build(RATE);
w.eval('syncFieldMonitor()');
assert.equal(w.eval('!!plazaFarmIncome()'),true,'the fixture must be a valid measured rate');
assert.equal(w.document.getElementById('socialFieldExp').textContent,'600','the card shows the measured EXP/min');
assert.equal(w.document.getElementById('socialFieldZeny').textContent,'300','the card shows the measured Zeny/min');
assert.equal(w.document.getElementById('socialFieldState').textContent,'Plaza AFK','the card names the mode');
assert.match(w.document.getElementById('socialFieldExp').title,/600 EXP\/min/,'the tooltip states the measured rate');
// The old implementation copied the live HUD sampler, which reads 0 once combat stops (HUD_IDLE_RESET).
for(const id of ['expmin','zenymin']){const e=w.document.createElement('b');e.id=id;e.textContent='0';w.document.body.appendChild(e)}
w.eval('syncFieldMonitor()');
assert.equal(w.document.getElementById('socialFieldExp').textContent,'600','a stale 0 in the HUD sampler cannot zero the card');
assert.equal(w.document.getElementById('socialFieldZeny').textContent,'300');

// No measured rate yet: the card must say so rather than invent or pay one.
const none=build(null);
none.eval('syncFieldMonitor()');
assert.equal(none.document.getElementById('socialFieldExp').textContent,'\u2014','with no measured rate the card shows a dash');
assert.equal(none.eval('plazaFarmIncome()'),null,'and nothing is payable');

// A zeroed save is not "earning" either (v389 rule preserved).
const zero=build({...RATE,xp:0,zeny:0,job:0});
zero.eval('syncFieldMonitor()');
assert.equal(zero.eval('plazaFarmIncome()'),null,'a zeroed save is not advertised as earning');
assert.equal(zero.document.getElementById('socialFieldExp').textContent,'\u2014');

console.log('PASS plaza field rate card: shows the measured rate, ignores a stale HUD sampler, and invents nothing');
