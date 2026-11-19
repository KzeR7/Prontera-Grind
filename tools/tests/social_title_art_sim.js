// Supplied plaza-title artwork: every existing title has one distinct local image.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const art=require('../../assets/social-title-art.js');
const fishing=require('../../assets/social-fishing.js');
const digi=require('../../assets/digimon-sanctuary.js');
const map=JSON.parse(fs.readFileSync(path.join(root,'tools/social-title-icons/source-map.json'),'utf8'));
const seen=new Set(),cells=new Set();
for(const [kind,titles,expectedSheets] of [['digi',digi.DIGI_TITLES,[1]],['fishing',fishing.FISHING_TITLES,[2,3]]]){
 assert.equal(titles.length,kind==='digi'?36:20);
 assert.deepEqual(Object.keys(art.ART[kind]).sort(),titles.map(t=>t.id).sort(),kind+' covers the current title catalog exactly');
 assert.deepEqual(Object.keys(map[kind]).sort(),titles.map(t=>t.id).sort(),kind+' records the source of every used cell');
 for(const t of titles){
  const item=map[kind][t.id],src=art.url(kind,t.id),cell=[item.sheet,item.row,item.column].join(':');
  assert.equal(item.name,t.name);assert(expectedSheets.includes(item.sheet),t.name+' uses the requested sheet');
  assert(!seen.has(src)&&!cells.has(cell),'title artwork is distinct');seen.add(src);cells.add(cell);
  assert.match(src,new RegExp('^assets/social-title-icons/'+kind+'-[a-z0-9-]+\\.webp\\?v=440$'));
  assert.equal(src,art.ART[kind][t.id]+'?v=440','changed cutouts bypass stale opaque image caches');
  assert(fs.statSync(path.join(root,art.ART[kind][t.id])).size>0,src+' exists');
  assert(art.icon(kind,t.id).includes('loading="lazy"'));assert(art.icon(kind,t.id,true).includes('loading="eager"'));
 }
}
assert.equal(seen.size,56);
for(const [kind,id] of [['fishing','__proto__'],['digi','constructor'],['__proto__','x'],['fishing','<img src=x>']]){
 assert.equal(art.url(kind,id),'');assert.equal(art.icon(kind,id),'','unknown or untrusted IDs never become HTML or URLs');
}
for(const source of map.sources){
 const sheet=path.join(root,'tools/social-title-icons/supplied-2026-11-19',source.file);
 assert.equal(fs.statSync(sheet).size,source.bytes,'the entire original sheet is retained for future title additions');
}
const page=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert(page.indexOf('assets/social-title-art.js')>0&&page.indexOf('assets/social-title-art.js')<page.indexOf('assets/social-scene.js'),'the registry loads before plaza presentation');
// Decode the shipped WebPs, not just their filenames: every mark must actually
// have transparent corners and a visible opaque core. Fishing marks stay black.
(async()=>{
 const sharp=require('sharp');
 for(const kind of ['digi','fishing'])for(const rel of Object.values(art.ART[kind])){
  const {data,info}=await sharp(path.join(root,rel)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.channels,4);
  const alpha=(x,y)=>data[(y*info.width+x)*4+3];
  for(const [x,y] of [[0,0],[info.width-1,0],[0,info.height-1],[info.width-1,info.height-1]])assert.equal(alpha(x,y),0,rel+' has no opaque background corner');
  let clear=0,opaque=0;
  for(let n=0;n<data.length;n+=4){
   if(data[n+3]===0)clear++;if(data[n+3]===255)opaque++;
   if(kind==='fishing'&&data[n+3])assert(Math.max(data[n],data[n+1],data[n+2])<=5,rel+' retains the black mark without the white matte');
  }
  assert(clear>0&&opaque>0,rel+' has both transparency and visible logo');
 }
 console.log('PASS social title art: 56 transparent marks, safe cache-busted lookups and all three retained sheets');
})().catch(e=>{console.error(e);process.exitCode=1});
