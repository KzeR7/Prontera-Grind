// Dev-only map proposal viewer: DOM behavior, not GPU or layout validation.
'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const artRoot=path.join(root,'docs/map-concepts/environments');
const manifest=JSON.parse(fs.readFileSync(path.join(artRoot,'manifest.json'),'utf8'));
assert.equal(manifest.files.length,8);
assert.deepEqual(manifest.groups.map(g=>g.stages),[[1,2,3],[4,5,6],[7,8,9],[10]]);
for(const entry of manifest.files){
  const b=fs.readFileSync(path.join(artRoot,entry.file));
  assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(b.readUInt32BE(16),entry.width);assert.equal(b.readUInt32BE(20),entry.height);
  assert.equal(b.length,entry.bytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),entry.sha256);
}
const identities=JSON.parse(fs.readFileSync(path.join(root,'docs/map-concepts/mob-source-identities.json'),'utf8'));
assert.equal(identities.monsters.length,12);
assert.equal(new Set(identities.monsters.map(m=>m.id)).size,12);
assert.ok(identities.monsters.every(m=>m.spriteStatus.includes('not recovered')));
const errors=[];
const dom=new JSDOM(fs.readFileSync(path.join(root,'tools/map_proposal.html'),'utf8'),{
  runScripts:'dangerously',url:'http://preview.test/',
  beforeParse(w){
    w.addEventListener('error',e=>errors.push(e.error));
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
    w.HTMLDialogElement.prototype.close=function(){this.open=false};
    w.fetch=async url=>({ok:true,text:async()=>fs.readFileSync(path.join(root,url),'utf8')});
  }
});
const d=dom.window.document;
const by=id=>d.getElementById(id);
const click=sel=>d.querySelector(sel).click();
(async()=>{
  assert.equal(by('mapTitle').textContent,'Astral Citadel');
  assert.equal(d.querySelectorAll('[data-stage]').length,4);
  assert.equal(d.querySelectorAll('.chip').length,6);
  click('[data-stage="10"]');
  assert.match(by('stageTag').textContent,/Memory of Thanatos/);
  click('[data-map="thor"]');
  assert.equal(by('mapTitle').textContent,'Thor Volcano');
  assert.match(by('stageTag').textContent,/Ifrit/);
  assert.match(by('common').textContent,/Primal Catalyst/);
  assert.equal(d.querySelector('[data-map="thor"]').getAttribute('aria-pressed'),'true');
  const image=by('concept').getAttribute('src');
  click('[data-stage="4"]');
  assert.match(by('stageTitle').textContent,/Magma Gallery/);
  assert.notEqual(by('concept').getAttribute('src'),image,'Each group has its own environment artwork');
  click('#fit');assert.equal(by('art').classList.contains('fill'),true);
  click('#fit');assert.equal(by('art').classList.contains('fill'),false);
  click('#ambient');assert.equal(d.body.classList.contains('ambient'),true);
  click('[data-map="astral"]');
  assert.equal(d.body.classList.contains('thor'),false);
  assert.match(by('stageTitle').textContent,/Broken Nave/);
  assert.match(by('common').textContent,/Astral Shard/);
  for(const key of ['astral','thor']){
    click(`[data-map="${key}"]`);
    const images=new Set();
    for(const n of [1,4,7,10]){click(`[data-stage="${n}"]`);const src=by('concept').getAttribute('src');assert.ok(fs.existsSync(path.join(root,src)));images.add(src);}
    assert.equal(images.size,4);
  }
  assert.match(d.querySelector('.bottom').textContent,/0.035%/);
  assert.match(d.querySelector('.bottom').textContent,/0.0025%/);
  assert.match(d.querySelector('.bottom').textContent,/0.1%/);
  click('#read');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(by('proposal').open,true);
  assert.match(by('proposalText').textContent,/# New Endgame Maps/);
  click('#close');assert.equal(by('proposal').open,false);
  dom.window.fetch=async()=>({ok:false,status:500});
  click('#read');await new Promise(resolve=>setImmediate(resolve));
  assert.match(by('proposalText').textContent,/Could not load/);
  by('concept').dispatchEvent(new dom.window.Event('error'));
  assert.equal(by('error').style.display,'block');
  click('[data-map="astral"]');assert.equal(by('error').style.display,'none');
  assert.deepEqual(errors,[]);
  dom.window.close();
  console.log('Map proposal viewer: map/stage selection, asset paths, fit, ambient, dialog and failure handling pass. Layout/GPU not tested.');
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
