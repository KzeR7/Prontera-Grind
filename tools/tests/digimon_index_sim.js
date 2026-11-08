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
const crypto=require('node:crypto');
const roster=require('../../assets/digimon/roster.js');
const sanctuary=require('../../assets/digimon-sanctuary.js');
const graph=sanctuary.evolutionCatalog();
assert.deepEqual(graph.outgoing.get('agumon'),['greymon','flarerizamon','meramon','monochromon','tuskmon','tyrannomon']);
assert.deepEqual(graph.incoming.get('agumon'),['koromon']);
assert.equal(graph.outgoing.get('machinedramon').length,0);
assert.equal(graph.incoming.get('machinedramon').length,9);
assert.equal(graph.incoming.get('gallantmon').length,4);
assert.equal(graph.incoming.get('apocalymon').length,0);
assert.equal(graph.reachable.has('apocalymon'),false);
assert.equal(graph.reachable.size,232);
for(const id of roster.IDS){for(const target of graph.outgoing.get(id))assert.ok(graph.incoming.get(target).includes(id),`incoming reciprocal ${id} -> ${target}`);for(const source of graph.incoming.get(id))assert.ok(graph.outgoing.get(source).includes(id),`outgoing reciprocal ${source} -> ${id}`)}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/digimon/digidex-portraits.json'),'utf8'));
const portrait=fs.readFileSync(path.join(root,'assets/digimon',manifest.image));
assert.equal(manifest.count,roster.IDS.length);assert.deepEqual(manifest.ids,roster.IDS);assert.equal(manifest.width,manifest.columns*manifest.cell);assert.equal(manifest.height,manifest.rows*manifest.cell);assert.equal(manifest.rows,Math.ceil(roster.IDS.length/manifest.columns));assert.equal(crypto.createHash('sha256').update(portrait).digest('hex'),manifest.sha256);assert.ok(portrait.length<700*1024,'the complete static portrait sheet stays below 700 KiB');
console.log(`digimon_index_sim: PASS (${index.species.length} profiles, ${index.coverage.evolutionLinksListed} listed evolution links, ${graph.reachable.size} reachable forms, ${manifest.count} portraits / ${Math.round(portrait.length/1024)} KiB)`);
