const assert=require('node:assert/strict'),fs=require('node:fs');
const {createGame}=require('./helpers/game');const g=createGame(),ev=g.ev,doc=g.window.document;
try{
 assert.equal(ev('fresh().bgm.volume'),.05);
 ev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.zeny=1e12;S.auto=false;S.eq.weapon={id:9101,name:'Test sword',slot:'weapon',wt:'sword',sec:5,tier:3,r:10,val:100,slots:3,cards:[],aff:[{k:'str',v:10},{k:'crit',v:20},{k:'cdm',v:10}]};S.inv=[];ascensionItemPick='9101'`);
 assert.match(ev('ascensionForgePanel()'),/Current affixes.*STR \+10/s);
 assert.ok(!ev('V.market()').includes('market:ascension'));
 ev(`reforgePoolOpen='weapon'`);
 const pool=ev('reforgePanel()');assert.match(pool,/Possible affixes/);assert.match(pool,/Crit/);assert.ok(!pool.includes('MATK +0'));
 ev(`window.choices=[{id:1,val:1000,r:0,cards:[]},{id:2,val:5,r:10,cards:[]},{id:3,val:10,r:10,cards:[{}]},{id:4,val:20,r:10,cards:[{}]}];window.sorted=choices.sort((a,b)=>equipmentPreference(b,a)).map(x=>x.id)`);
 assert.deepEqual(Array.from(ev('sorted')),[4,3,2,1]);
 ev(`S.mp=10;TRIAL.on=false;JOB_RITE.on=false`);assert.equal(ev('actorFloorY()'),.12);
 ev(`S.mp=0`);assert.equal(ev('actorFloorY()'),.035);
 ev(`trialEnter('ranked');TRIAL.left=175;trialExit()`);assert.equal(ev('TRIAL.on'),false);assert.equal(ev('S.trial.used'),0);
 ev(`trialEnter('ranked');TRIAL.left=160;trialExit()`);assert.equal(ev('S.trial.used'),1);assert.equal(ev('S.shards'),0);
 ev(`window.contacts=[];window.CombatAudio={hit:(...x)=>contacts.push(x)};window.target={hp:100,x:0,z:0,size:1};hurt(target,5,'red',true);S.sfx=false;hurt(target,5,'red',false)`);
 assert.deepEqual(JSON.parse(ev('JSON.stringify(contacts)')),[[true,true],[false,false]]);
 ev(`S=fresh();S.sfx=false;localStorage.setItem(saveKey(),JSON.stringify(S));S=load()`);assert.equal(ev('S.sfx'),false);
 console.log('PASS polish: default audio, forge affixes, market, sorting, floor anchors, trial exit, hit routing and saved SFX');
}finally{g.close()}
