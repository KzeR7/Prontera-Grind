// Town placement dump - for tools/preview_town_board.py
//   node tools/_town_dump.js            # writes /tmp/town_placements.json
//
// Boots the real index.html in jsdom with the real town atlas manifest, walks into the town, and
// writes out every painted sprite (which art, where, how big, mirrored or not) plus the five NPC
// spots and the plaza's radius. The board renderer composes those onto one image, which is how the
// town's layout gets looked at without a browser. Not part of the `*_sim.js` gate: needs jsdom.
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const ROOT='/home/user/Prontera-Grind';
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const three=fs.readFileSync(require.resolve('three/build/three.min.js'),'utf8');
function ctx(){return new Proxy({drawImage(){},createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getImageData:(x,y,w,h)=>({data:new Uint8Array(Math.max(1,w*h*4)),width:w,height:h}),createPattern:()=>null,measureText:()=>({width:8})},{get:(t,k)=>k in t?t[k]:()=>{}})}
const dom=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',beforeParse(w){
 Object.defineProperty(w.HTMLCanvasElement.prototype,'getContext',{value:()=>ctx()});
 Object.defineProperty(w.HTMLCanvasElement.prototype,'toDataURL',{value:()=>'data:,'});
 w.Element.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1200,height:800});
 w.requestAnimationFrame=()=>1; w.fetch=()=>Promise.reject(new Error('x')); w.eval(three);
 w.eval(`THREE.WebGLRenderer=function(){this.domElement=document.createElement('canvas');this.shadowMap={enabled:false};this.setSize=()=>{};this.setPixelRatio=()=>{};this.render=()=>{};this.outputEncoding=0;this.toneMapping=0}`);
 for(const f of ['assets/sprite_pack_data.js','assets/class_skins_data.js','assets/weapon_joints_data.js'])w.eval(fs.readFileSync(path.join(ROOT,f),'utf8'));
}});
const ev=c=>dom.window.eval(c);
ev("currentUser='t';initSession(false)");
const man=fs.readFileSync(path.join(ROOT,'assets/town/town-atlas.json'),'utf8');
ev(`TOWNP.man=JSON.parse(${JSON.stringify(man)});TOWNP.png=document.createElement('canvas');TOWNP.ok=1;TOWNP.tex.clear();TOWN.paint=0;`);
ev('window.town()');
const out=JSON.parse(ev(`(()=>{
  // The camera the player actually gets: entered town, after the zoom clamp, positioned by the same
  // code the frame loop uses. Written out so the board can draw the town through it.
  TOWN.zoom=1;zoom=1;window.town();if(!townOn())window.town();
  TOWN.zoom=1;   // enter at the wallet's default view, then apply the town's own clamp
  cam.aspect=16/9;                       // a normal desktop window, not the stub's 3:2
  const dd=(cam.aspect<1.5?26:18)/zoom;
  az=0;el=.95;
  // The camera follows the hero (ct lerps towards pl each frame), so the honest "just walked in"
  // view is the one from where the hero lands, with ct settled on them - gate and avenue in shot.
  const ct={x:pl.x*.6,z:pl.z-CAMERA_LEAD_Z,y:CAMERA_FOCUS_Y};
  cam.position.set(ct.x+Math.sin(az)*Math.cos(el)*dd,Math.sin(el)*dd+.5,ct.z+Math.cos(az)*Math.cos(el)*dd);
  cam.lookAt(new THREE.Vector3(ct.x,ct.y,ct.z));cam.updateMatrixWorld(true);cam.updateProjectionMatrix();
  const seen=new Set(),list=[];
  const walk=(root)=>{
    root.traverse(o=>{
      if(!o.isSprite)return;
      let p=o,art=null;
      while(p){if(p.userData&&p.userData.art){art=p.userData.art;break}p=p.parent}
      if(!art)return;
      if(seen.has(o.id))return;seen.add(o.id);
      const map=o.material.map;
      const key=art+'@'+root.uuid+'@'+o.id;
      list.push({art,
        x:+p.position.x.toFixed(3),
        z:+p.position.z.toFixed(3),
        y:+(p.position.y||0).toFixed(3),
        w:+o.scale.x.toFixed(3),h:+o.scale.y.toFixed(3),
        flip:!!(map&&TOWNP.tex.get(art+'@f')===map),
        off:map?[+map.offset.x.toFixed(5),+map.offset.y.toFixed(5)]:null,
        rep:map?[+map.repeat.x.toFixed(5),+map.repeat.y.toFixed(5)]:null,
        grp:(o.parent===TOWN.houseKit?'ring':p.parent===TOWN.houseKit?'ring':p.parent===TOWN.propBlk?'prop':'town'),
        parent:(p.parent&&p.parent.name)||''});
    });
  };
  [TOWN.houseKit,TOWN.propBlk,TOWN.g].forEach(walk);
  return JSON.stringify({sprites:list,npc:TOWN.list.map(n=>({id:n.def.id,x:n.def.x,z:n.def.z})),
    plaza:{r:TOWN_R,z:TOWN_Z},
    bound:TOWN_BOUND,
    cam:{pos:cam.position.toArray(),target:[ct.x,0,ct.z],
         proj:Array.from(cam.projectionMatrix.elements),
         view:Array.from(cam.matrixWorldInverse.elements),
         world:Array.from(cam.matrixWorld.elements),
         fov:cam.fov,near:cam.near,far:cam.far,aspect:cam.aspect,zoom:zoom,
         viewW:1600,viewH:900}});
})()`));
fs.writeFileSync('/tmp/town_placements.json',JSON.stringify(out,null,1));
console.log('sprites:',out.sprites.length,'groups:',JSON.stringify(out.sprites.reduce((a,s)=>(a[s.grp]=(a[s.grp]||0)+1,a),{})));
console.log('ring sample:',JSON.stringify(out.sprites.filter(s=>s.grp==='ring').slice(0,3)));
console.log('npcs:',JSON.stringify(out.npc));
process.exit(0);
