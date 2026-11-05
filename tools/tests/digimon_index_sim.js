'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const index=JSON.parse(fs.readFileSync(path.join(root,'assets/digimon/index.json'),'utf8'));
assert.equal(index.schemaVersion,1);
assert.equal(index.coverage.profileCount,251);
assert.equal(index.species.length,251);
assert.equal(new Set(index.species.map(s=>s.id)).size,251,'profile IDs must be unique');
assert.equal(index.coverage.evolutionLinksListed,index.species.reduce((n,s)=>n+s.evolvesTo.length,0));
assert.equal(index.coverage.localSpriteCount,index.species.filter(s=>s.image).length);
assert.equal(index.coverage.profilesWithoutLocalSprite,index.species.filter(s=>!s.image).length);
for(const s of index.species){
 assert.ok(s.id&&s.name&&s.stage,`profile identity/stage ${s.id}`);
 assert.ok(Array.isArray(s.evolvesFrom)&&Array.isArray(s.evolvesTo),`evolution lists ${s.id}`);
 if(s.image)assert.ok(fs.existsSync(path.join(root,s.image.path)),`local sprite path ${s.id}`);
}
assert.ok(index.species.find(s=>s.id==='agumon').evolvesTo.includes('greymon'));
assert.ok(index.species.find(s=>s.id==='greymon').evolvesFrom.includes('agumon'));
console.log(`digimon_index_sim: PASS (${index.species.length} profiles, ${index.coverage.evolutionLinksListed} listed evolution links, ${index.coverage.localSpriteCount} local sprites)`);
