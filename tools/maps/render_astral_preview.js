(async()=>{
// Export actual live scene triangles for the deterministic software atlas renderer.
// node tools/maps/render_astral_preview.js | <Pillow/numpy python> tools/maps/render_astral_preview.py
const THREE=require('three'),kind=process.argv[2]==='thor'?'thor':'astral';
const stage=kind==='thor'?Number(process.argv[3]||1):process.argv[2]?Number(process.argv[2]):null;
const options={};
if(kind==='thor'){const {createCanvas,loadImage}=require('@napi-rs/canvas'),fs=require('fs'),path=require('path');options.createCanvas=()=>createCanvas(1,1);options.surfaces={};for(const [key,file] of [['stone','weathered-stone.png'],['lava','molten-basalt.png']]){const img=await loadImage(fs.readFileSync(path.join(__dirname,'textures',file)));options.surfaces[key]=img;}}
const world=kind==='thor'?require('./endgame-scenes.js')(THREE).build('thor',stage,options):require('../../assets/astral-scenery.js')(THREE).build(stage||5),extent=stage?30:110;
const camera=new THREE.OrthographicCamera(-extent*750/350,extent*750/350,extent,-extent,.1,1000);
if(stage){camera.position.set(26,50,(world.view.focus||-8)+42);camera.lookAt(0,0,(world.view.focus||-8)-3);}else{camera.position.set(100,190,70);camera.lookAt(0,0,-110);}camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
const light=new THREE.Vector3(-.4,1,.3).normalize(),normal=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),m=new THREE.Matrix4();
const faces=[],textures=[],textureIds=new Map();
function textureId(map){if(!map||!map.image)return null;if(textureIds.has(map))return textureIds.get(map);const {createCanvas}=require('@napi-rs/canvas'),canvas=createCanvas(map.image.width,map.image.height);canvas.getContext('2d').drawImage(map.image,0,0);const id=textures.length;textures.push(canvas.toBuffer('image/png').toString('base64'));textureIds.set(map,id);return id;}
world.scene.updateMatrixWorld(true);
world.scenery.traverse(o=>{if(!o.geometry)return;const g=o.geometry,vertices=g.attributes.position,uv=g.attributes.uv,index=g.index,material=o.material,colors=g.attributes.color;
 for(let instance=0;instance<(o.isInstancedMesh?o.count:1);instance++){
  if(o.isInstancedMesh){o.getMatrixAt(instance,m);m.premultiply(o.matrixWorld);}else m.copy(o.matrixWorld);
  for(let i=0;i<(index?index.count:vertices.count);i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
   [a,b,c].forEach((v,j)=>v.fromBufferAttribute(vertices,ids[j]).applyMatrix4(m));normal.crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize();
   const shade=material.isMeshBasicMaterial?1:Math.max(.28,.58+normal.dot(light)*.45),color=material.color.clone().multiplyScalar(shade);
   if(material.vertexColors&&colors){const tint=new THREE.Color(0,0,0);for(const id of ids){tint.r+=colors.getX(id)/3;tint.g+=colors.getY(id)/3;tint.b+=colors.getZ(id)/3;}color.multiply(tint);}
   const points=[a,b,c].map(v=>v.clone().project(camera)).map(v=>[(v.x+1)*750/2,(1-v.y)*350/2,v.z]);
   faces.push({p:points,c:[color.r,color.g,color.b].map(x=>Math.min(255,Math.round(x*255))),glow:o.userData.category==='rune',texture:kind==='thor'?textureId(material.map):null,uv:(kind==='thor'?material.map:o.userData.texture==='stone')&&uv?ids.map(j=>[uv.getX(j)*(material.map?.repeat.x||1),uv.getY(j)*(material.map?.repeat.y||1)]):null});
  }
 }
});
process.stdout.write(JSON.stringify({kind,faces,textures}));world.dispose();

})().catch(error=>{console.error(error);process.exitCode=1;});
