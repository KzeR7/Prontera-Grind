// The experimental asset study is separate from the running game.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve('docs/proposals/gym-asset-study');
const models=['kit/Wall_Plaster_Straight','kit/Wall_Plaster_Window_Wide_Flat','kit/Wall_Plaster_Door_Flat','kit/Roof_RoundTiles_8x14','kit/Roof_Front_Brick8','kit/Window_Wide_Flat1','kit/Door_2_Flat','nature/CommonTree_1'];
for(const name of models){
 const file=path.join(root,name+'.gltf'),j=JSON.parse(fs.readFileSync(file));
 assert.equal(j.asset.version,'2.0');assert(j.meshes?.length,'real mesh '+name);
 for(const buffer of j.buffers){const f=path.resolve(path.dirname(file),buffer.uri);assert(f.startsWith(root+path.sep)&&fs.statSync(f).size===buffer.byteLength,'valid local mesh buffer '+name)}
 for(const material of j.materials){const tex=material.pbrMetallicRoughness?.baseColorTexture;if(tex){const image=j.images[j.textures[tex.index].source];assert(fs.existsSync(path.join(path.dirname(file),image.uri)),'local texture '+image.uri)}}
}
for(const [name,sha] of [['kit/Roof_RoundTiles_8x14.bin','2a9de46dee87ea46c6b1ff9d4da811817cc48b2c287c15db5edf13f9475591ea'],['kit/Wall_Plaster_Straight.bin','986bf171c62e9019eea9aab709d19d07a3bd5021ff76ab749f57563f364858f3'],['nature/CommonTree_1.bin','9dd689e84e1aa2f5b08db8def591254d582783c73737af54ba0d89b3e549c3ae']])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex'),sha,'pinned source mesh '+name);
const tree=JSON.parse(fs.readFileSync(path.join(root,'nature/CommonTree_1.gltf')));assert(tree.meshes[0].primitives.length>=2,'tree has separate trunk and foliage geometry');assert(tree.accessors.some(a=>a.type==='VEC3'&&a.max&&a.min&&a.max[2]-a.min[2]>1),'tree has depth, not a full-tree plane');
assert(fs.readFileSync(path.join(root,'index.html'),'utf8').includes('not the finished gym'),'sample is labeled honestly');console.log('PASS 3D source study: local glTF geometry, textures, pinned mesh hashes and non-flat tree');
