// Real selection and DOM event paths: replacing equipment stays open inside the panel.
const assert=require('node:assert/strict'),{createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev,doc=g.window.document;
try{
 ev(`S.auto=false;S.inv=[{...S.eq.weapon,id:9876,name:'Replacement dagger'}];tabs.splice(0,tabs.length,'equip');eclipseSearch='hidden';eclipseRarity=4;ACT.seleq('weapon')`);
 assert.equal(ev('eclipseSearch'),'');assert.equal(ev('eclipseRarity'),-1);
 assert.ok(doc.querySelector('.cell.fit[data-v="9876:weapon"]'));
 const filters=doc.querySelector('[data-a=filtergear][data-v="-1"]');
 filters.dispatchEvent(new g.window.MouseEvent('pointerdown',{bubbles:true}));filters.click();
 assert.equal(ev('eqPick'),'weapon','inventory controls retain selected equipment slot');
 const fit=doc.querySelector('.cell.fit');fit.dispatchEvent(new g.window.MouseEvent('pointerdown',{bubbles:true}));fit.click();
 assert.equal(ev('S.eq.weapon.id'),9876);assert.equal(ev('S.inv.length'),1,'old equipment returns to bag');
 assert.equal(ev('eqPick'),'weapon','replacement click does not immediately clear mode');
 ev('renderWin()');doc.querySelector('[data-a=eqclose]').click();assert.equal(ev('eqPick'),null);
 // Mobile browsers synthesize mouseover after a tap: it must not open a sticky tooltip.
 g.window.matchMedia=()=>({matches:false});
 const tile=doc.querySelector('[data-tip]');tile.dispatchEvent(new g.window.MouseEvent('mouseover',{bubbles:true}));
 assert.equal(doc.getElementById('tooltip').style.display,'none');
 g.window.matchMedia=()=>({matches:true});tile.dispatchEvent(new g.window.MouseEvent('mouseover',{bubbles:true}));
 assert.equal(doc.getElementById('tooltip').style.display,'block','desktop mouse retains hover details');
 const touch=new g.window.Event('pointerdown',{bubbles:true});Object.defineProperty(touch,'pointerType',{value:'touch'});tile.dispatchEvent(touch);
 assert.equal(doc.getElementById('tooltip').style.display,'none');
 console.log('PASS: slot selection, filter reset, replacement highlight, panel pointer containment, equip identity, cancel and touch/desktop tooltips');
}finally{g.close()}
