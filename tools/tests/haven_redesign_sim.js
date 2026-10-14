const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
ev(`S=fresh();S.auto=false;S.clickSell=true;S.inv=[{id:991,name:'Test Sword',slot:'weapon',wt:'sword',tier:0,sec:1,lvl:1,val:10,aff:[],cards:[],slots:0}];`);
assert.equal(ev(`V.bag0().includes('data-a="quicksell"')`),false);
ev(`ACT.quicksell('991')`);
assert.equal(ev('S.inv.length'),1);assert.equal(ev('selB'),'991');
ev(`S.autoSell=Array(7).fill(true);ACT.autosell('0')`);assert.equal(ev('S.inv.length'),1);
ev('ACT.sellpause()');assert.equal(ev('S.autoSell.some(Boolean)'),false);
ev(`S=fresh();S.autoSell=Array(7).fill(true);S.clickSell=true;S.auto=false;window.oldGear=S.eq.weapon;S.inv=[{...S.eq.weapon,id:992,r:3}];eqPick='weapon';ACT.selb('992');`);
assert.equal(ev('S.eq.weapon.id'),ev('oldGear.id'));
ev(`ACT.equip('992')`);assert.equal(ev('S.eq.weapon.id'),992);assert.equal(ev('S.inv.filter(x=>x.id===oldGear.id).length'),1);
assert.equal(ev('S.inv.some(x=>x.id===992)'),false);
// Combo cadence is covered end to end by combo_rotation_sim.js.
g.close();console.log('Haven safe inventory selection passed');
