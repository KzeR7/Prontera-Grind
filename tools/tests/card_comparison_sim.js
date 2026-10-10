const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),{createGame}=require('./helpers/game');
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'Updates/cards-gear-audit/card-effect-comparison.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously'}),doc=dom.window.document,g=createGame();
const current=JSON.parse(g.ev('JSON.stringify(CARD_CATALOG)'));g.close();
const proposals=JSON.parse(fs.readFileSync(path.join(root,'Updates/card-effect-proposal/proposals.json'),'utf8'));
const rows=[...doc.querySelectorAll('.card')];assert.equal(rows.length,90);assert.equal(rows.filter(r=>!r.hidden).length,38);
assert.equal(rows.filter(r=>r.dataset.changed==='false').length,52);
for(const r of rows){const family=r.querySelector('h2').textContent;const pair=current.filter(c=>c.family===family);assert.equal(pair.length,2,family);
  const before=r.querySelector('.comparison section:first-child');for(const c of pair)for(const e of c.effects)assert.ok(before.textContent.includes(e.k==='cdm'?(e.v/100).toFixed(2)+'×':String(e.v)),family+' before values');
  const p=proposals.find(p=>p.family+' Card'===family);if(p){assert.ok(r.querySelector('.after').textContent.includes(p.normal));assert.ok(r.querySelector('.after').textContent.includes(p.nightmare));}
}
function change(id,value){const e=doc.getElementById(id);e.value=value;e.dispatchEvent(new dom.window.Event(id==='search'?'input':'change',{bubbles:true}));}
change('show','all');assert.equal(rows.filter(r=>!r.hidden).length,90);
change('search','Poring');assert.ok(rows.filter(r=>!r.hidden).every(r=>r.dataset.search.includes('poring')));
change('search','');change('map','Abyss');assert.ok(rows.filter(r=>!r.hidden).every(r=>r.dataset.map==='Abyss'));
change('search','definitely no card');assert.equal(rows.filter(r=>!r.hidden).length,0);assert.equal(doc.getElementById('empty').hidden,false);
assert.ok(html.includes('Proposals only'));assert.ok(html.includes('1 / 3 / 6 / 10 / 15'));
dom.window.close();console.log('Card comparison: 90 families / 180 current definitions, 38 proposals and search/map/status filters passed');
