// Pin encounter scope and exercise Thor's real incoming-damage path.
'use strict';
const assert=require('node:assert/strict'),{createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
const baseline=[{"m":0,"l":10,"hp":9976,"atk":73,"regularHp":838,"regularAtk":51},{"m":0,"l":15,"hp":19594285,"atk":3388,"regularHp":1645920,"regularAtk":2395},{"m":1,"l":10,"hp":92967,"atk":382,"regularHp":7809,"regularAtk":270},{"m":1,"l":15,"hp":22946881,"atk":3951,"regularHp":1927538,"regularAtk":2793},{"m":2,"l":10,"hp":105093,"atk":432,"regularHp":8827,"regularAtk":305},{"m":2,"l":15,"hp":26409285,"atk":4528,"regularHp":2218380,"regularAtk":3201},{"m":3,"l":10,"hp":117219,"atk":482,"regularHp":9846,"regularAtk":340},{"m":3,"l":15,"hp":29982153,"atk":5119,"regularHp":2518500,"regularAtk":3619},{"m":4,"l":10,"hp":129345,"atk":532,"regularHp":10865,"regularAtk":376},{"m":4,"l":15,"hp":33666131,"atk":5724,"regularHp":2827955,"regularAtk":4047},{"m":5,"l":10,"hp":239611,"atk":890,"regularHp":20127,"regularAtk":628},{"m":5,"l":15,"hp":49020325,"atk":7992,"regularHp":4117707,"regularAtk":5651},{"m":6,"l":10,"hp":320446,"atk":1154,"regularHp":26917,"regularAtk":815},{"m":6,"l":15,"hp":58694370,"atk":9535,"regularHp":4930327,"regularAtk":6742},{"m":7,"l":10,"hp":414016,"atk":1450,"regularHp":34777,"regularAtk":1025},{"m":7,"l":15,"hp":68638365,"atk":11112,"regularHp":5765622,"regularAtk":7857},{"m":8,"l":10,"hp":513213,"atk":1759,"regularHp":43109,"regularAtk":1243},{"m":8,"l":15,"hp":78853659,"atk":12721,"regularHp":6623707,"regularAtk":8995},{"m":9,"l":10,"hp":658173,"atk":3055,"regularHp":55286,"regularAtk":2159},{"m":9,"l":15,"hp":89341585,"atk":14364,"regularHp":7504693,"regularAtk":10157}];
try{
 ev("S=fresh();S.cls='Rune Knight';S.lv=150;S.auto=false;S.adv=false");
 for(const row of baseline){
  ev(`S.mp=${row.m};S.lvl=${row.l};spawn()`);
  const boss=ev('mobs.find(x=>x.boss)'),regular=ev('mobs.find(x=>!x.boss)');
  assert.equal(boss.hp,row.m===9&&row.l===15?Math.floor(row.hp*1.25):row.hp,`map ${row.m} stage ${row.l} boss HP`);
  assert.equal(boss.max,boss.hp);assert.equal(boss.atk,row.atk);
  assert.equal(regular.hp,row.regularHp);assert.equal(regular.atk,row.regularAtk);
 }
 // This is the real enemy-swing damage, with a fixed random roll and the real defense calculation.
 ev(`S.mp=11;S.lvl=5;spawn();window.boss=mobs.find(x=>x.boss);mobs=[boss];mob=boss;
  boss.x=pl.x=0;boss.z=pl.z=-4;boss.hx=0;boss.hz=-4;boss.at=0;
  S.hp=1000000;S.sk={};boss.mag=false;
  Math.random=()=>.5;window.beforeHp=S.hp;update(.01);`);
 assert.equal(ev('boss.atk'),182826);
 const expected=ev('Math.round(182826*(1-Math.min(.75,def()*(1-prOf(boss))/(def()*(1-prOf(boss))+4000))))');
 assert.equal(ev('beforeHp-S.hp'),expected,'Thor swing applies reduced ATK through real defense');
 assert.equal(ev('ascensionCombatStats(11,5).atk'),81256,'Thor escorts retain ATK');
 assert.equal(ev('ascensionCombatStats(10,5,true).atk'),115789,'Astral boss retains ATK');
 console.log('PASS: all original-map bosses/escorts pinned, only Abyss Nightmare boss HP +25%, real Thor boss swing -25%, unchanged escorts/Astral.');
}finally{g.close()}
