// Publish-only JSON whitespace reduction. Source assets/native catalogs remain untouched.
// Only these four kit documents are plain JSON fetched with response.json(); native
// metadata has byte/hash contracts and MUST NOT be processed here.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const FILES=Object.freeze(['ro-map-payon.json','ro-map-morocc.json','ro-spritesheet.json','ro-tiles-hd.json']);
function optimize(output){
 let saved=0;
 for(const file of FILES){
  const target=path.join(output,'assets/kit',file),before=fs.readFileSync(target),value=JSON.parse(before.toString('utf8')),after=Buffer.from(JSON.stringify(value));
  // Reject any number/structure change (including negative zero); don't silently rewrite content.
  assert.deepEqual(JSON.parse(after.toString('utf8')),value,'Delivery JSON must preserve parsed values: '+file);
  if(after.length<before.length){fs.writeFileSync(target,after);saved+=before.length-after.length;}
 }
 return saved;
}
if(require.main===module){if(!process.argv[2])throw Error('Pass the assembled publish directory');console.log('  kit JSON whitespace removed: '+optimize(path.resolve(process.argv[2]))+' bytes (source art/native packs unchanged)');}
module.exports={FILES,optimize};
