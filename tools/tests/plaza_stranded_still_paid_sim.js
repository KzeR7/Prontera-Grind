/* v392 regression: "when i tab away the basically doesnt work, exp is stuck" / "do it by awaiting
   connection".
   A lost websocket used to freeze the ENTIRE simulation. That was correct when the field could be
   farmed unsynced (v247, cloud-only saves must not accrue), but v388 made the plaza pay a rate that
   was measured BEFORE the drop. Replaying that rate cannot inflate it - it is capped by the completed
   60-second field minute - so freezing it protects nothing and only leaves a frozen number on screen.
   Rules pinned here:
     * the PLAZA keeps earning while awaiting connection;
     * the FIELD still halts (its combat COULD be inflated by simulating longer);
     * gate / server-pause still stop the plaza (the server refused writes; a local number would be
       adopted on reconnect);
     * the card says "awaiting connection" instead of pretending to be paused. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
try{
 ev(`S=fresh();currentUser='D';CLOUD.on=true;respawn=0;S.mp=11;S.lvl=1;S.lv=150;S.cls='Guillotine Cross';`);
 ev('window.CT=1750000000000;Date.now=()=>window.CT;performance.now=()=>window.CT-1750000000000;');
 // a real measured Thor minute
 ev(`farmSession=null;farmSample(window.CT-61000);recordFarmIncome(600,300,420,10,window.CT-30000);farmSample(window.CT-1000);`);
 assert.equal(ev('!!plazaFarmIncome()'),true,'fixture: a measured rate exists');

 // ---- awaiting connection, standing in the plaza -----------------------------------------
 ev(`document.body.classList.add('social-open')`);
 ev('CLOUD.lost=true');
 assert.equal(ev('!!plazaFarmIncome()'),true,'a lost connection must NOT stop the plaza paying');
 assert.equal(ev('plazaEarningWhileAway()'),true,'the plaza is the one thing still allowed to simulate');

 ev('window.e0=expEarned');
 for(let i=0;i<120;i++){ ev('window.CT+=1000;loop(performance.now())') }
 const paid=ev('expEarned-window.e0');
 assert.ok(paid>=1190,`two minutes in the plaza while awaiting connection must pay (got ${paid})`);

 ev('simAt=0;bgTick();window.e1=expEarned');
 for(let i=0;i<60;i++){ ev('window.CT+=1000;bgTick()') }
 assert.ok(ev('expEarned-window.e1')>0,'the hidden-tab ticker pays it too, not just the visible frame loop');

 // ---- the FIELD must still halt ----------------------------------------------------------
 ev(`document.body.classList.remove('social-open')`);
 assert.equal(ev('plazaEarningWhileAway()'),false,'outside the plaza nothing keeps simulating while lost');
 ev('window.e2=expEarned;simAt=0');
 for(let i=0;i<60;i++){ ev('window.CT+=1000;bgTick()') }
 assert.equal(ev('expEarned-window.e2'),0,'field combat stays halted on a lost connection (it could be inflated)');

 // ---- gate / server pause still stop the plaza -------------------------------------------
 ev(`document.body.classList.add('social-open')`);
 ev('CLOUD.lost=false;CLOUD.gate=true');
 assert.equal(ev('plazaFarmIncome()'),null,'a write gate stops the plaza: the number would not be trusted on reconnect');
 ev('CLOUD.gate=false;CLOUD.paused=true');
 assert.equal(ev('plazaFarmIncome()'),null,'a server pause stops the plaza for the same reason');
 ev('CLOUD.paused=false');

 // ---- and the card STATES it -------------------------------------------------------------
 const w=g.window,d=w.document;
 w.setInterval=fn=>(fn.name==='battleUITick'?(w.battleTick=fn):0);
 for(const f of ['digimon/roster.js','digimon/base-stats.js','social-rules.js','digimon-sanctuary.js','digimon-battle.js','social-poker.js','social.js'])
   w.eval(fs.readFileSync('assets/'+f,'utf8'));
 d.getElementById('socialHub').hidden=false;d.body.classList.add('social-open');
 const tick=()=>{for(let i=0;i<4;i++)w.battleTick()};
 tick();
 assert.equal(d.getElementById('socialFieldState').textContent,'Plaza AFK','healthy state unchanged');
 ev('CLOUD.lost=true');tick();
 assert.equal(d.getElementById('socialFieldState').textContent,'Plaza AFK · awaiting connection','a drop is named, not hidden');
 assert.equal(d.getElementById('socialFieldExp').textContent,'600','and the rate is still shown while awaiting');
 // A dropped socket with NOTHING to pay (no completed field minute yet) is genuinely stopped. The card
 // must still say why: a bare "Field paused" is exactly what read as "exp is stuck".
 const keep=ev('JSON.stringify(S.offlineIncome)');
 ev('S.offlineIncome=null;CLOUD.lost=true');tick();
 assert.equal(d.getElementById('socialFieldState').textContent,'Field paused · awaiting connection','without a rate the drop is named, not hidden');
 assert.equal(d.getElementById('socialFieldExp').textContent,'\u2014','and there is no rate to show');
 ev('S.offlineIncome='+keep+';CLOUD.lost=false;CLOUD.gate=true');tick();
 assert.equal(d.getElementById('socialFieldState').textContent,'Field paused','a real gate still pauses');
 assert.equal(d.getElementById('socialFieldExp').textContent,'\u2014','and shows nothing while it does');

 console.log('PASS plaza while awaiting connection: keeps earning, field stays halted, gate still pauses, card states it');
}finally{g.close()}
