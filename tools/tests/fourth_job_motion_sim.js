const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),box={};vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(root,'Updates/fourth-jobs/motion.js'),'utf8')+'\nthis.motion=PGFourthJobMotion;',box);
const catalog=JSON.parse(fs.readFileSync(path.join(root,'Updates/fourth-jobs/native/catalog.json')));
vm.runInContext(fs.readFileSync(path.join(root,'Updates/fourth-jobs/skills.js'),'utf8')+'\nthis.skills=FOURTH_REVIEW_SKILLS;',box);
for(const sex of ['m','f'])for(let direction=0;direction<8;direction++){
 const record=catalog.looks['4059-'+sex],skill=box.skills.find(s=>s.id==='gc_roll');
 // Each spin must traverse the actual native katar clip, and restart in the next spin.
 for(let spin=0;spin<5;spin++){
  const frames=new Set();for(let i=0;i<8;i++){
   const sample=box.motion.sample(record,skill,spin*.2+(i+.3)*.2/8,direction);
   assert.equal(sample.action,88+direction);assert.equal(sample.key,'roll'+direction);frames.add(sample.frame);
  }assert.equal(frames.size,8);
 }
 assert.equal(record.actions['roll'+direction].delay,100,'preserve original native ACT delay');
 assert.equal(box.motion.sample(record,skill,1.05,direction).key,'idle'+direction);
 const manual=box.motion.sample(record,skill,.21,direction,false,'roll');assert.equal(manual.frame,2,'manual plays native timing');
 const a=box.motion.sample(record,skill,.08,direction),b=box.motion.sample(record,skill,.08,direction);assert.deepEqual(a,b,'scrubbing deterministic');
}
for(const from of ['Warlock','Arch Bishop']){
 const record=catalog.looks[catalog.classes[from]+'-m'],skill=box.skills.find(s=>s.from===from);
 assert.equal(box.motion.sample(record,skill,.3,0).action,96,'caster uses native casting action');
}
console.log('PASS: 16 native Rolling Cutter routes, five full clips per slot, native/manual timing, deterministic scrub and caster actions.');
