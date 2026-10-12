/* Measure static response bytes. HTTP compression and GPU overhead are separate. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const W=require('../assets/wardrobe.js'),root=path.resolve(__dirname,'../assets/wardrobe/v5');
(async()=>{
 let bytes=0,requests=0;const store=new W.Store({fetcher:async url=>{const file=fs.readFileSync(path.join(root,path.basename(url)));bytes+=file.length;requests++;return new Response(file)},decode:async b=>{const v=new DataView(b.buffer,b.byteOffset,b.byteLength);return{width:v.getUint32(16),height:v.getUint32(20),close(){}}}});
 const measure=async fn=>{const start=bytes,n=requests;await fn();return{bytes:bytes-start,requests:requests-n}};
 const look=W.defaults('m');const cold=await measure(()=>store.select('hero',look,'Novice'));assert.equal(cold.requests,5);
 const open=await measure(()=>store.select('preview',look,'Novice'));assert.equal(open.bytes,0);
 const halo={...look,headwear:'halo'},firstPiece=await measure(()=>store.select('preview',halo,'Novice'));assert.equal(firstPiece.requests,2);
 const cachedPiece=await measure(()=>store.select('preview',halo,'Novice'));assert.equal(cachedPiece.bytes,0);
 const remove=await measure(()=>store.select('preview',look,'Novice'));assert.equal(remove.bytes,0);
 const changeClass=await measure(()=>store.select('hero',look,'Mage'));assert.equal(changeClass.requests,2);
 const color=await measure(()=>store.select('preview',{...look,colors:{m:8,f:0}},'Mage'));assert.equal(color.requests,1);
 const catalog=store.catalog,catalogBytes=fs.statSync(path.join(root,'catalog.json')).size;let min=Infinity,max=0;
 for(const cls of Object.keys(W.CLASSES))for(const sex of ['m','f'])for(const head of W.HAIRS[sex])for(let color=0;color<9;color++){
  const n=catalogBytes+['base-'+W.CLASSES[cls]+'-'+sex,'hair-'+sex+'-'+head+'-'+color].reduce((n,k)=>n+catalog.assets[k].imageBytes+catalog.assets[k].metaBytes,0);min=Math.min(min,n);max=Math.max(max,n);
 }
 const pieceBytes=Object.entries(catalog.assets).filter(([k])=>k.startsWith('piece-')).map(([,r])=>r.imageBytes+r.metaBytes);
 const report={units:'uncompressed static response bytes; HTTP headers and compression excluded',pack:{bytes:fs.readdirSync(root).reduce((n,f)=>n+fs.statSync(path.join(root,f)).size,0),files:fs.readdirSync(root).length},baseLooksCold:{minBytes:min,maxBytes:max},firstSelectedPiece:{minBytes:Math.min(...pieceBytes),maxBytes:Math.max(...pieceBytes)},noviceMaleDefault:cold,openWardrobe:open,firstHalo:firstPiece,cachedHalo:cachedPiece,removeAccessory:remove,switchToMage:changeClass,changeHairColor:color,decodedAtlasBudgetBytes:store.budget,measuredDecodedAtlasBytes:store.pixelBytes,serializedMetadataCacheBudgetBytes:store.metadataBudget};
 store.dispose();if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
