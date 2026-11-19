// The parked Ascension RO-look proposal (Updates/ascension-ro-looks, not in the game) stays complete
// and byte-verified, and nothing in the shipped game refers to it.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.join(__dirname,'..','..'),dir=path.join(root,'Updates/ascension-ro-looks');
const pk=JSON.parse(fs.readFileSync(path.join(dir,'sets.json'),'utf8'));
const slots=['sword','dagger','katar','axe','mace','spear','staff','book','bow','knuckle','instrument','whip','shuriken','gun','armor','head','off','leg','acc'];
const byId=new Map(pk.assets.map(a=>[a.id,a]));
assert.deepEqual(Object.keys(pk.sets),['valkyrie','thanatos','archangel','ifrit','thor','diabolus']);
for(const [k,set] of Object.entries(pk.sets)){
  assert.ok(set.look&&set.name,k);
  for(const s of slots){
    const name=s in set.pieces.weapon?set.pieces.weapon[s]:set.pieces[s];assert.ok(typeof name==='string'&&name.length>2,k+' '+s+' name');
    const a=byId.get(set.icons[s]);assert.ok(a,k+' '+s+' icon listed');
  }
  for(const s of slots.slice(0,14))assert.equal(Object.keys(pk.sets).filter(o=>pk.sets[o].icons[s]===set.icons[s]).length,1,k+' '+s+' icon is unique among the looks');
}
for(const a of pk.assets){
  const f=path.join(dir,a.file),b=fs.readFileSync(f);
  assert.equal(b.subarray(1,4).toString(),'PNG',a.file);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),a.sha256,a.file);
  assert.match(a.source,/^https:\/\//,a.file);
}
assert.equal(fs.readdirSync(path.join(dir,'icons')).length,pk.assets.filter(a=>a.file.startsWith('icons/')).length,'no stray icons');
const game=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const k of Object.keys(pk.sets))assert.ok(!new RegExp('\\n  '+k+':\\{').test(game),k+' is not in the game');
assert.ok(!game.includes('ascension-ro-looks'),'the game does not load the proposal');
console.log('PASS: RO-look proposal: 6 sets x 19 pieces, '+pk.assets.length+' icons byte-verified, not shipped.');
