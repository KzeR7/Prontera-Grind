#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'Updates/hair-color-preview');
const data=JSON.parse(fs.readFileSync(path.join(dir,'catalog.json'))),raw=fs.readFileSync(path.join(dir,'hair-source.json'));
const model=require(path.join(dir,'model.js')),audit=JSON.parse(fs.readFileSync(path.join(dir,'audit.json')));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(sha(raw),data.selection.sourceSha256);
assert.equal(sha(fs.readFileSync(path.join(dir,'catalog.json'))),audit.catalogSha256);
const generated={window:{}};vm.runInNewContext(fs.readFileSync(path.join(dir,'catalog.js'),'utf8'),generated);
assert.deepEqual(JSON.parse(JSON.stringify(generated.window.HAIR_CATALOG)),data);
for(const sex of ['m','f']){
 const row=JSON.parse(raw).find(r=>r.race==='human'&&r.gender===sex);
 const selected=row.styles.map(s=>s.n).sort((a,b)=>sha(`${data.selection.seed}|${sex}|${a}`).localeCompare(sha(`${data.selection.seed}|${sex}|${b}`))).slice(0,20).sort((a,b)=>a-b);
 assert.deepEqual(data.hairs[sex],selected);assert.equal(new Set(selected).size,20);
 assert.deepEqual(data.palettes[sex].map(p=>p.id),[0,1,2,3,4,5,6,7,8]);
 for(const id of selected)assert.equal(row.styles.find(s=>s.n===id).colors,9);
}
const game=fs.readFileSync(path.join(root,'index.html'),'utf8'),start=game.indexOf('const CD=');
const classes=vm.runInNewContext(game.slice(start,game.indexOf('const CLASSES=',start))+';CD.filter(c=>!CD4.includes(c))');
assert.deepEqual(data.classes.map(c=>[c.name,c.weapons]),JSON.parse(JSON.stringify(classes.map(c=>[c[0],c[7]]))));
const state={cls:'Lord Knight',weapon:'sword',hair:{m:data.hairs.m[0],f:data.hairs.f[0]},palette:{m:0,f:0},direction:'SE',animated:true};
const keys=new Set();
for(const cls of data.classes)for(const sex of ['m','f'])for(const weapon of cls.weapons)for(const hair of data.hairs[sex])for(const palette of data.palettes[sex])for(const direction of Object.keys(data.directions))for(const stance of Object.keys(data.stances)){
 const s={...state,cls:cls.name,weapon,hair:{...state.hair,[sex]:hair},palette:{...state.palette,[sex]:palette.id},direction,stance};
 const result=model.resolve(data,s,sex),q=new URL(result.url).searchParams;
 assert.equal(q.get('head'),String(hair));assert.equal(q.get('headPalette'),String(palette.id));
 assert.equal(q.get('gender'),sex==='f'?'female':'male');assert.equal(q.get('weapon'),String(data.weapons[weapon]));
 assert.equal(q.get('action'),String((stance==='attack'?(cls.action||cls.actions[sex][weapon]):data.stances[stance].baseAction)+data.directions[direction]));
 assert.ok(!q.has('frame'));assert.equal(new URL(model.resolve(data,{...s,animated:false},sex).url).searchParams.get('frame'),'0');
 assert.ok(!keys.has(result.key));keys.add(result.key);
}
assert.equal(keys.size,81000);
for(const invalid of [{weapon:'katar'},{hair:{m:0,f:2}},{palette:{m:9,f:0}},{direction:'toString'},{cls:'Unknown'},{stance:'constructor'}])assert.throws(()=>model.resolve(data,{...state,...invalid},'m'));
const records=new Map(audit.cases.map(r=>[r.key,r]));
for(const row of audit.cases){
 assert.equal(row.status,'pass',row.key);assert.ok(keys.has(row.key));
 const s={...state,cls:row.class,weapon:row.weapon,hair:{...state.hair,[row.sex]:row.hair},palette:{...state.palette,[row.sex]:row.palette},direction:row.direction,stance:row.stance};
 assert.equal(model.resolve(data,s,row.sex).url,row.url);
 const result=model.source(data,s,row.sex,records);assert.equal(result.local,true);assert.equal(result.src,'art/'+row.file);
 assert.equal(sha(fs.readFileSync(path.join(dir,'art',row.file))),row.sha256);
 assert.equal(sha(fs.readFileSync(path.join(dir,'art',row.file.replace('.png','-still.png')))),row.stillSha256);
 if(row.stance==='attack')assert.ok(row.weaponPixels.some(n=>n>0));else assert.ok(['visible','stowed-or-not-rendered'].includes(row.weaponVisibility));assert.deepEqual(row.clippedFrames,[]);
}
assert.equal(model.source(data,state,'m',new Map()).local,false);
const sample=model.source(data,state,'m',records), embedded={[path.basename(sample.src)]:'data:image/png;base64,test'};
assert.equal(model.source(data,state,'m',records,embedded).src,embedded[path.basename(sample.src)]);
assert.equal(model.source(data,state,'m',records,{}).local,false);
console.log(`PASS: reproducible 20+20 selection, palette IDs, exact 19-class roster, 81,000 stance/animation/still routes, ${audit.cases.length} cached sources and hashes`);

// Execute the actual controller with controlled image events; exercise failure and stale callbacks.
function harness(reduced=false){
 const elements={},pending=[],timers=new Map();let nextTimer=0,mediaChange;
 const make=(id,dataset={})=>({id,dataset,children:[],attrs:{},listeners:{},hidden:false,value:'',textContent:'',style:{setProperty(){}},classList:{set:new Set(),toggle(k,on){on?this.set.add(k):this.set.delete(k)},remove(k){this.set.delete(k)},add(k){this.set.add(k)}},setAttribute(k,v){this.attrs[k]=String(v)},addEventListener(k,f){this.listeners[k]=f},append(...c){this.children.push(...c)},add(c){this.children.push(c)},replaceChildren(...c){this.children=c},replaceWith(next){elements[this.id]=next},click(){this.listeners.click()},change(v){this.value=v;this.listeners.change()}});
 const ids=['stanceSelect','classSelect','weaponSelect','selectionTitle','selectionMeta','motion','mirror','retry','sampleLook','auditSummary'];
 for(const sex of ['male','female'])for(const suffix of ['','Hair','Palette','Swatches','Gallery','Choice','Status','Source'])ids.push(sex+suffix);
 for(const id of ids)elements[id]=make(id);
 const dirs=['S','SE','NE'].map(direction=>make(direction,{direction}));
 const box={window:{HAIR_CATALOG:data,HAIR_AUDIT:audit},HairModel:model,document:{getElementById:id=>elements[id],querySelectorAll:()=>dirs,createElement:tag=>make(tag)},matchMedia:()=>({matches:reduced,addEventListener:(_,f)=>mediaChange=f}),Option:function(text,value){this.text=text;this.value=value},Image:function(){Object.assign(this,make(''));this.naturalWidth=320;pending.push(this)},setTimeout:f=>{timers.set(++nextTimer,f);return nextTimer},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync(path.join(dir,'preview.js'),'utf8'),box);
 return{e:elements,dirs,pending,timers,finish:()=>{pending.at(-2).onload();pending.at(-1).onload()},reduce:()=>mediaChange({matches:true})};
}
const h=harness();h.finish();assert.equal(h.e.stanceSelect.value,'idle');h.e.stanceSelect.change('attack');h.finish();
assert.equal(h.e.maleHair.children.length,20);assert.equal(h.e.femaleHair.children.length,20);
for(const [sex,id] of [['m','male'],['f','female']])for(const hair of data.hairs[sex])for(const palette of data.palettes[sex]){
 h.e[id+'Hair'].change(String(hair));h.e[id+'Palette'].change(String(palette.id));h.finish();
 assert.equal(h.e[id].dataset.key,`4008-${sex}-sword-${hair}-${palette.id}-SE`);
}
for(const cls of data.classes){h.e.classSelect.change(cls.name);for(const weapon of cls.weapons){h.e.weaponSelect.change(weapon);for(const d of h.dirs){d.click();h.finish();assert.ok(h.e.male.dataset.key.startsWith(`${cls.job}-m-${weapon}-`));}}}
h.e.classSelect.change('Assassin');h.e.weaponSelect.change('katar');h.e.classSelect.change('Mage');h.finish();assert.equal(h.e.weaponSelect.value,'staff');
const stale=h.pending.slice(-2);h.e.classSelect.change('High Wizard');h.finish();for(const old of stale){old.onload();old.onerror()}assert.ok(h.e.male.dataset.key.startsWith('4010-'));assert.equal(h.e.male.hidden,false);
h.e.retry.click();h.pending.at(-2).onerror();assert.equal(h.e.male.hidden,true);assert.ok(h.e.maleStatus.classList.set.has('error'));
h.e.retry.click();h.finish();assert.equal(h.e.male.hidden,false);
h.e.retry.click();for(const fire of [...h.timers.values()])fire();assert.match(h.e.maleStatus.textContent,/retry/);h.finish();assert.equal(h.e.male.hidden,true);
h.e.sampleLook.click();h.finish();assert.equal(h.e.classSelect.value,'Lord Knight');assert.equal(h.e.weaponSelect.value,'sword');assert.match(h.e.maleStatus.textContent,/Saved & audited/);
for(const stance of ['idle','walk','attack']){h.e.stanceSelect.change(stance);h.finish();assert.equal(h.e.male.dataset.key,`4008-m-sword-${data.hairs.m[0]}-0-SE${stance==='attack'?'':'-'+stance}`);}
h.e.mirror.click();h.finish();assert.ok(h.e.male.classList.set.has('mirrored'));
const r=harness(true);r.finish();assert.match(r.e.male.src,/-still.png$/);r.e.classSelect.change('Mage');r.finish();assert.equal(new URL(r.e.male.src).searchParams.get('frame'),'0');r.e.motion.click();r.finish();assert.ok(!new URL(r.e.male.src).searchParams.has('frame'));r.reduce();r.finish();assert.equal(new URL(r.e.female.src).searchParams.get('frame'),'0');
console.log('PASS: independent gender/style/color selectors, class/weapon/direction controls, stale callbacks, timeout, retry, offline samples, mirror and reduced motion');
