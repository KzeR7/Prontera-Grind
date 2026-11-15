// Wardrobe for the expanded roster (haven-v410): 22 classes dressed by assets/wardrobe/expanded/v1/.
// Bodies are this pack's own atlases; hair and accessories are the shipped v5 / sitting atlases,
// moved onto each job's head attach point by PGExpandedJobs.Store.route().
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..');process.chdir(root);
const W=require('../../assets/wardrobe.js');
const box={PGWardrobe:W,TextDecoder};vm.createContext(box);vm.runInContext(fs.readFileSync('assets/expanded-jobs.js','utf8'),box);
if(!global.crypto)global.crypto=webcrypto;
const X=box.PGExpandedJobs,base='assets/wardrobe/expanded/v1/',catalog=JSON.parse(fs.readFileSync(base+'catalog.json'));
let closed=0,passed=0;const asked=new Set();
const options={fetcher:async url=>{const file=path.normalize(url);asked.add(file);return new Response(fs.readFileSync(file))},decode:async bytes=>({width:Buffer.from(bytes).readUInt32BE(16),height:Buffer.from(bytes).readUInt32BE(20),close(){closed++}})};
const ok=name=>{passed++;console.log('  ok   '+name)};
const STAND=['idle','walk','attack'].flatMap(s=>[0,1,2,3,4,5,6,7].map(d=>s+d));
function checkLook(look,stances,label){
  const slots=new Set(['body','hair','weapon','shadow',...Object.values(W.ACCESSORIES).flatMap(s=>Object.keys(s.items))]);
  for(const stance of stances)for(let d=0;d<8;d++){const name=stance+d,b=look.base.metadata.actions[name];assert.ok(b&&b.frames.length>=1&&b.frames.length<=32,label+' '+name);
    for(const part of [look.hair,...look.pieces]){const a=part.metadata.actions[name];assert.ok(a,label+' has no '+name);
      if(part.metadata.clock!=='independent'){assert.equal(a.delay,b.delay,label+' '+name+' delay');if(!part.metadata.clock)assert.equal(a.frames.length,b.frames.length,label+' '+name+' frames')}
      for(const f of a.frames)for(const p of f){assert.equal(p.length,8);assert.ok(p[4]>=0&&p[5]>=0&&p[4]+p[2]<=320&&p[5]+p[3]<=280,label+' '+name+' leaves the canvas');assert.ok(slots.has(p[7]))}}
    for(const f of b.frames)assert.ok(f.some(p=>p[7]==='body'),label+' '+name+' has no body');
  }
}
(async()=>{
  console.log('expanded wardrobe: bodies, shared hair and accessories');
  assert.deepEqual(Object.keys(X.CLASSES).sort(),Object.keys(catalog.classes).sort());
  for(const [cls,job] of Object.entries(X.CLASSES)){assert.equal(catalog.classes[cls],job);assert.ok(!Object.values(W.CLASSES).includes(job)&&![4054,4055,4056,4059,4057,4058].includes(job),cls+' reuses a shipped job id')}
  assert.equal(Object.keys(catalog.assets).length,44);
  for(const [id,r] of Object.entries(catalog.assets)){
    assert.match(id,/^base-\d+-[mf]$/);const img=fs.readFileSync(base+r.image),meta=fs.readFileSync(base+r.meta);
    assert.equal(createHash('sha256').update(img).digest('hex'),r.imageSha256,id);assert.equal(createHash('sha256').update(meta).digest('hex'),r.metaSha256,id);
    assert.equal(img.length,r.imageBytes);assert.equal(meta.length,r.metaBytes);assert.ok(r.figureHeight>=80&&r.figureHeight<=110,id+' figure height '+r.figureHeight);
  }
  ok('44 body atlases, hashes and sizes as catalogued');

  const store=new X.Store(options);let looks=0;
  for(const cls of Object.keys(X.CLASSES))for(const sex of ['m','f']){
    for(const head of W.HAIRS[sex]){const a=W.defaults(sex);a.heads[sex]=head;a.colors[sex]=head%9;const look=await store.select('hero',a,cls);assert.ok(look,cls);checkLook(look,['idle','walk','attack'],cls+' '+sex+' hair '+head);looks++}
    for(const [field,slot] of Object.entries(W.ACCESSORIES))for(const item of Object.keys(slot.items)){if(item==='none')continue;
      const a=W.defaults(sex);a[field]=item;const look=await store.select('hero',W.normalize(a),cls);assert.equal(look.pieces.length,1);checkLook(look,['idle','walk','attack'],cls+' '+sex+' '+item);looks++}
  }
  ok(looks+' looks: every class, gender, hairstyle and accessory composes inside the canvas');
  assert.ok([...asked].every(f=>f.startsWith(path.normalize(base))||f.startsWith(path.normalize('assets/wardrobe/v5/'))),'the standing pack reads only itself and v5');
  ok('hair and accessory pixels are read in place from assets/wardrobe/v5/');

  // Classes whose weapon sprite is available hold it while attacking, never while idle.
  const armed=new Set(['Crusader','Paladin','Royal Guard','Sage','Scholar','Sorcerer','Alchemist','Biochemist','Geneticist','Rogue','Stalker','Bard & Dancer','Minstrel & Gypsy','Ninja']);
  for(const cls of Object.keys(X.CLASSES))for(const sex of ['m','f']){const look=await store.select('hero',W.defaults(sex),cls),held=[0,1,2,3,4,5,6,7].some(d=>look.base.metadata.actions['attack'+d].frames.some(f=>f.some(p=>p[7]==='weapon')));
    assert.equal(held,armed.has(cls),cls+' '+sex);assert.ok(!look.base.metadata.actions.idle0.frames.some(f=>f.some(p=>p[7]==='weapon')))}
  ok('fourteen classes hold their native weapon while attacking; the Monk line fights with fists');

  // The game derives exactly what tools/make_expanded_wardrobe.py derives.
  const fixture=JSON.parse(fs.readFileSync('tools/tests/fixtures/expanded_wardrobe_routes.json')).routes;
  for(const [key,want] of Object.entries(fixture)){const [asset,cls]=key.split('|'),hair=asset.startsWith('hair-'),sex=hair?asset.split('-')[1]:asset.slice(-1),a=W.defaults(sex);
    if(hair){a.heads[sex]=+asset.split('-')[2];a.colors[sex]=+asset.split('-')[3]}else{const item=asset.split('-')[1];a[Object.keys(W.ACCESSORIES).find(f=>Object.hasOwn(W.ACCESSORIES[f].items,item))]=item}
    const look=await store.select('fixture',W.normalize(a),cls),part=hair?look.hair:look.pieces[0];
    assert.equal(createHash('sha256').update(JSON.stringify(Object.fromEntries(STAND.map(k=>[k,part.metadata.actions[k]])))).digest('hex'),want,key+' drifted from the builder');}
  ok(Object.keys(fixture).length+' derived routes match the builder byte for byte');

  // The move itself, on shipped data: the Knight's own routes come back unchanged.
  const v5=JSON.parse(fs.readFileSync('assets/wardrobe/v5/catalog.json')),hm=JSON.parse(fs.readFileSync('assets/wardrobe/v5/'+v5.assets['hair-m-2-0'].meta));
  const ref=catalog.reference.m;for(const k of STAND){const a=hm.actions['7:'+k],frames=a.frames.map(i=>hm.poses[i]),out=X.reroute({delay:a.delay,frames},ref[k].length,ref[k],ref[k],a.delay,undefined);assert.equal(JSON.stringify(out.frames),JSON.stringify(frames),k)}
  ok('moving the reference job onto itself changes nothing');

  const sit=new X.Store({...options,stances:['sit']});let sat=0;
  for(const cls of Object.keys(X.CLASSES))for(const sex of ['m','f']){const a=W.defaults(sex);a.headwear='halo';a.backwear='wings';const look=await sit.select('seat',W.normalize(a),cls);checkLook(look,['sit'],cls+' '+sex+' sitting');sat++}
  ok(sat+' sitting looks compose from assets/social/sitting/');

  const out=JSON.parse(fs.readFileSync('tools/native-expanded/wardrobe-output-manifest.json')).files;
  assert.deepEqual(fs.readdirSync(base).sort(),Object.keys(out).sort());
  const index=fs.readFileSync('index.html','utf8');
  assert.match(index,/<script src="assets\/fourth-jobs\.js\?v=\d+"><\/script>\n<script src="assets\/expanded-jobs\.js\?v=\d+"><\/script>/);
  assert.ok(index.indexOf('assets/expanded-jobs.js')<index.indexOf('assets/wardrobe-ui.js'),'the pack must load before the Wardrobe UI');
  ok('the pack is committed whole and loaded before the Wardrobe UI');
  console.log(passed+' passed, 0 failed');
})().catch(e=>{console.error('  FAIL '+(e&&e.stack||e));process.exit(1)});
