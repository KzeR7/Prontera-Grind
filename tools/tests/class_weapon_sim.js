// Native class/weapon/hair preview: exact game coverage, source integrity and controller races.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'../..'),dir=path.join(root,'Updates/class-weapon-preview');
const report=JSON.parse(fs.readFileSync(path.join(dir,'audit.json')));
const src=fs.readFileSync(path.join(root,'index.html'),'utf8');
const begin=src.indexOf('const CD='),end=src.indexOf('const CLASSES=',begin);
const game=vm.runInNewContext(src.slice(begin,end)+';CD');
assert.deepEqual(report.catalog.classes.map(c=>[c.name,c.weapons]),JSON.parse(JSON.stringify(game.map(c=>[c[0],c[7]]))));
const combos=report.catalog.classes.reduce((n,c)=>n+c.weapons.length*2,0);
assert.equal(combos,50);assert.equal(report.cases.length,combos*3*3);
assert.deepEqual(report.summary,{pass:450,'missing-weapon':0,clipped:0,error:0});
const keys=new Set();let frames=0;
for(const cls of report.catalog.classes)for(const sex of ['m','f'])for(const weapon of cls.weapons)for(const hair of report.catalog.hairs)for(const direction of Object.keys(report.catalog.directions))keys.add(`${cls.job}-${sex}-${weapon}-${hair.id}-${direction}`);
for(const row of report.cases){
 assert.ok(keys.delete(row.key),'missing/duplicate case '+row.key);
 assert.equal(row.status,'pass');assert.equal(row.frames,row.durations.length);assert.equal(row.frames,row.weaponPixels.length);
 assert.ok(row.weaponPixels.some(n=>n>0));assert.deepEqual(row.clippedFrames,[]);
 const data=fs.readFileSync(path.join(dir,'art',row.file));
 assert.equal(crypto.createHash('sha256').update(data).digest('hex'),row.sha256);
 const query=new URL(row.url).searchParams,bare=new URL(row.baselineUrl).searchParams;
 assert.equal(query.get('weapon'),String(report.catalog.weapons[row.weapon]));assert.equal(bare.get('weapon'),'0');
 query.delete('weapon');bare.delete('weapon');assert.equal(query.toString(),bare.toString());
 assert.equal(query.get('head'),String(row.hair));assert.equal(query.get('gender'),row.sex==='f'?'female':'male');
 const cls=report.catalog.classes.find(c=>c.name===row.class);
 assert.equal(query.get('action'),String((cls.action||cls.actions[row.sex][row.weapon])+report.catalog.directions[row.direction]));
 let nframes=0,acFrames,loops;const delays=[];
 for(let p=8;p+12<=data.length;){
  const len=data.readUInt32BE(p),type=data.toString('ascii',p+4,p+8),b=data.subarray(p+8,p+8+len);
  if(type==='IHDR'){assert.equal(b.readUInt32BE(0),320);assert.equal(b.readUInt32BE(4),280)}
  if(type==='acTL'){acFrames=b.readUInt32BE(0);loops=b.readUInt32BE(4)}
  if(type==='fcTL'){nframes++;delays.push(Math.round(b.readUInt16BE(20)*1000/(b.readUInt16BE(22)||100)))}
  p+=len+12;
 }
 assert.equal(nframes,row.frames);assert.equal(acFrames,row.frames);assert.equal(loops,0);assert.deepEqual(delays,row.durations);
 const still=fs.readFileSync(path.join(dir,'art',row.file.replace('.png','-still.png')));
 assert.equal(still.readUInt32BE(16),320);assert.equal(still.readUInt32BE(20),280);frames+=nframes;
}
assert.equal(keys.size,0);
// Gender/weapon action exceptions must not regress to a universal attack animation.
const action=(name,sex,weapon)=>{const c=report.catalog.classes.find(c=>c.name===name);return c.action||c.actions[sex][weapon]};
assert.equal(action('Wizard','f','staff'),88);assert.equal(action('Wizard','m','staff'),80);
assert.equal(action('Novice','m','sword'),88);assert.equal(action('Novice','f','sword'),80);
assert.equal(action('Assassin Cross','m','katar'),88);assert.equal(action('Assassin Cross','m','dagger'),80);
console.log(`PASS: all ${report.cases.length} assets / ${frames} frames, exact 19-class game roster, every allowed weapon, native action exceptions, hashes and timing`);
function harness(reduced=false){
 const elements={},pending=[];let mediaChange;
 const make=(id,dataset={})=>({id,dataset,children:[],attrs:{},listeners:{},hidden:false,value:'',textContent:'',classList:{set:new Set(),toggle(k,on){on?this.set.add(k):this.set.delete(k)},remove(k){this.set.delete(k)},add(k){this.set.add(k)}},setAttribute(k,v){this.attrs[k]=String(v)},addEventListener(k,f){this.listeners[k]=f},append(...c){this.children.push(...c)},add(c){this.children.push(c)},replaceChildren(...c){this.children=c},click(){this.listeners.click()},change(v){this.value=v;this.listeners.change()}});
 for(const id of ['classSelect','weaponSelect','hairSelect','classes','coverage','routeCount','auditSummary','selectionTitle','selectionMeta','motion','mirror','male','female','maleStatus','femaleStatus','maleFrames','femaleFrames','retry'])elements[id]=make(id);
 const dirs=['S','SE','NE'].map(direction=>make(direction,{direction}));
 const box={window:{CLASS_WEAPON_AUDIT:report},document:{getElementById:id=>elements[id],querySelectorAll:()=>dirs,createElement:tag=>make(tag)},matchMedia:()=>({matches:reduced,addEventListener:(_,f)=>mediaChange=f}),Option:function(text,value){this.text=text;this.value=value},Image:function(){pending.push(this)}};
 vm.runInNewContext(fs.readFileSync(path.join(dir,'preview.js'),'utf8'),box);
 return {e:elements,dirs,pending,finish:()=>{pending.at(-2).onload();pending.at(-1).onload()},reduce:()=>mediaChange({matches:true})};
}
const h=harness();h.finish();
for(const cls of report.catalog.classes){
 h.e.classSelect.change(cls.name);
 assert.deepEqual(h.e.weaponSelect.children.map(o=>o.value),cls.weapons);
 for(const weapon of cls.weapons)for(const hair of report.catalog.hairs)for(const d of h.dirs){
  h.e.weaponSelect.change(weapon);h.e.hairSelect.change(String(hair.id));d.click();h.finish();
  for(const [sex,id] of [['m','male'],['f','female']])assert.equal(h.e[id].dataset.key,`${cls.job}-${sex}-${weapon}-${hair.id}-${d.dataset.direction}`);
 }
}
h.e.classSelect.change('Assassin');h.e.weaponSelect.change('katar');h.e.classSelect.change('Mage');h.finish();assert.equal(h.e.weaponSelect.value,'staff');
h.e.classSelect.change('Novice');const stale=h.pending.slice(-2);h.e.classSelect.change('Sniper');h.finish();for(const old of stale){old.onload();old.onerror()}assert.ok(h.e.male.dataset.key.startsWith('4012-m-bow-'));assert.equal(h.e.male.hidden,false);
h.e.hairSelect.change('1');assert.equal(h.e.male.hidden,true);h.pending.at(-2).onerror();assert.match(h.e.maleStatus.textContent,/could not load/);h.e.retry.click();h.finish();assert.equal(h.e.male.hidden,false);
h.e.mirror.click();h.finish();assert.ok(h.e.male.classList.set.has('mirrored'));assert.ok(h.e.female.classList.set.has('mirrored'));
const r=harness(true);r.finish();assert.match(r.e.male.src,/-still\.png$/);r.e.motion.click();r.finish();assert.doesNotMatch(r.e.male.src,/-still\.png$/);r.reduce();r.finish();assert.match(r.e.female.src,/-still\.png$/);
console.log('PASS: 450 controller selections, allowed-weapon reset, male/female pairing, stale response/error suppression, retry, mirroring and reduced motion');
