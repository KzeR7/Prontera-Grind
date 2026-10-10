// Verify curated original artwork is complete, unchanged and bundled locally.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'assets/equipment-icons');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const assets=new Map(manifest.assets.map(a=>[a.id,a]));
assert.strictEqual(manifest.bands.length,6);
assert.strictEqual(Object.keys(manifest.families).length,14);
for(const [family,ids] of Object.entries(manifest.families)){
 assert.strictEqual(ids.length,6,family+' needs every progression band');
 assert.strictEqual(new Set(ids).size,6,family+' must evolve at each band');
 for(const id of ids){
  const asset=assets.get(id);assert.ok(asset,'missing provenance '+id);
  assert.strictEqual(asset.file,id+'.png');
  assert.strictEqual(asset.source,`https://static.divine-pride.net/images/items/item/${id}.png`);
  const data=fs.readFileSync(path.join(dir,asset.file));
  assert.ok(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'invalid PNG '+id);
  assert.ok(data.readUInt32BE(16)>=24&&data.readUInt32BE(20)>=24,'undersized sprite '+id);
  assert.strictEqual(crypto.createHash('sha256').update(data).digest('hex'),asset.sha256,'original pixels changed '+id);
 }
}
console.log(`equipment art: ${assets.size} original PNGs verified across 14 families and six progression bands`);
