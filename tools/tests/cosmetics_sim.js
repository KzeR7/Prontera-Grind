// First wardrobe fitting: native asset integrity and actual controller behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '../..');
const dir = path.join(root, 'Updates/cosmetics-preview');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(dir,'art/manifest.js'),'utf8'), context);
const manifest = context.window.COSMETIC_SKINS;
assert.equal(Object.keys(manifest.sets).length,16);
const sources = JSON.parse(fs.readFileSync(path.join(dir,'art/sources.json')));
assert.equal(sources.files.length,64);
let images = 0;
for (const source of sources.files) {
  const data=fs.readFileSync(path.join(dir,'art',source.file));
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'),source.sha256,source.file);
  const [mask,view] = source.file.replace('.png','').split('-');
  const rec=manifest.sets[mask];
  const query=new URL(source.url).searchParams;
  assert.equal(query.get('job'), +mask&8 ? '4054':'4008');
  assert.equal(query.get('headgear'),`${+mask&1?69:0},${+mask&2?3:0}`);
  assert.equal(query.get('garment'), +mask&4 ? '1':'0');
  let count=0,frames=0;const delays=[];
  assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  for(let p=8;p+12<=data.length;){
    const n=data.readUInt32BE(p),kind=data.toString('ascii',p+4,p+8),b=data.subarray(p+8,p+8+n);
    if(kind==='IHDR'){assert.equal(b.readUInt32BE(0),200);assert.equal(b.readUInt32BE(4),200)}
    if(kind==='acTL'){frames=b.readUInt32BE(0);assert.equal(b.readUInt32BE(4),0)}
    if(kind==='fcTL'){count++;delays.push(b.readUInt16BE(20)/(b.readUInt16BE(22)||100))}
    p+=12+n;
  }
  assert.equal(frames,rec.frames[view]);assert.equal(count,frames);assert.ok(frames>1);
  assert.deepEqual(delays,Array.from(rec.delays[view],d=>d[0]/(d[1]||1000)));
  const still=fs.readFileSync(path.join(dir,'art',source.file.replace('.png','-still.png')));
  assert.equal(still.readUInt32BE(16),200);assert.equal(still.readUInt32BE(20),200);
  images++;
}
console.log(`PASS: ${images} APNG sources, hashes, slot combinations, frame counts, loops, delays and still sizes`);
// A controllable Image loader checks stale completion/error races, which are easy to miss by eye.
function harness(reduced=false){
  const elements={};
  function element(id,dataset={}){return elements[id]={dataset,hidden:false,textContent:'',attrs:{},listeners:{},setAttribute(k,v){this.attrs[k]=String(v)},addEventListener(k,fn){this.listeners[k]=fn},classList:{values:new Set(),toggle(k,on){on?this.values.add(k):this.values.delete(k)}},click(){(this.onclick||this.listeners.click)()}}}
  ['motion','mirror','pieceCount','lookName','status','retry','hero','all','none'].forEach(id=>element(id));
  const bits=[1,2,4,8].map(n=>element('bit'+n,{bit:String(n)}));
  const views=['S','SE','NE','attack'].map(view=>element(view,{view}));
  const pending=[];let mediaChange;
  const media={matches:reduced,addEventListener:(_,fn)=>mediaChange=fn};
  const sandbox={window:{COSMETIC_SKINS:manifest},document:{getElementById:id=>elements[id],querySelectorAll:s=>s==='[data-bit]'?bits:views},matchMedia:()=>media,Image:function(){pending.push(this)}};
  vm.runInNewContext(fs.readFileSync(path.join(dir,'wardrobe.js'),'utf8'),sandbox);
  return {elements,bits,views,pending,finish:()=>pending.at(-1).onload(),reduce:()=>mediaChange({matches:true})};
}
const h=harness();h.finish();assert.equal(h.elements.hero.dataset.mask,15);
for(let mask=0;mask<16;mask++){
  h.elements.none.click();for(const b of h.bits)if(mask&+b.dataset.bit)b.click();h.finish();
  assert.equal(h.elements.hero.dataset.mask,mask);
  assert.equal(h.elements.pieceCount.textContent,`${mask.toString(2).replace(/0/g,'').length} / 4 pieces`);
  for(const v of h.views){v.click();h.finish();assert.equal(h.elements.hero.dataset.view,v.dataset.view)}
}
console.log('PASS: all 16 independent selections across all four views');
h.elements.none.click();const stale=h.pending.at(-1);h.elements.all.click();h.finish();stale.onload();stale.onerror();
assert.equal(h.elements.hero.dataset.mask,15);assert.equal(h.elements.retry.hidden,true);
h.elements.none.click();assert.equal(h.elements.hero.hidden,true);h.pending.at(-1).onerror();assert.equal(h.elements.retry.hidden,false);
h.elements.retry.click();h.finish();assert.equal(h.elements.hero.hidden,false);assert.equal(h.elements.retry.hidden,true);
h.elements.mirror.click();h.finish();assert.ok(h.elements.hero.classList.values.has('mirrored'));
h.elements.motion.click();h.finish();assert.match(h.elements.hero.src,/-still\.png$/);
const r=harness(true);r.finish();assert.match(r.elements.hero.src,/-still\.png$/);r.elements.motion.click();r.finish();assert.doesNotMatch(r.elements.hero.src,/-still\.png$/);r.reduce();r.finish();assert.match(r.elements.hero.src,/-still\.png$/);
console.log('PASS: stale-load cancellation, load error/retry, mirror, still mode and reduced motion');
