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
 // v77: the town ships shut to the public (TOWN_OPEN). This tool looks at the town, so it opens
 // the gate the same way the owner's console would.
 try{ w.localStorage.setItem('pg_town_open','1'); }catch(e){}
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
      // a building is a FACADE (a plane with a fixed facing) since the spin fix; a prop is still a
      // THREE.Sprite. Both are "the art", and neither is the shadow plane or the body box that
      // stand in the same group - those carry no userData.face and are not sprites.
      if(!o.isSprite&&!(o.userData&&o.userData.face))return;
      let p=o,art=null;
      while(p){if(p.userData&&p.userData.art){art=p.userData.art;break}p=p.parent}
      if(!art)return;
      if(seen.has(o.id))return;seen.add(o.id);
      const map=o.material.map;
      const key=art+'@'+root.uuid+'@'+o.id;
      const wh=o.isSprite?[o.scale.x,o.scale.y]
        :[o.geometry.parameters.width,o.geometry.parameters.height];
      list.push({art,
        x:+p.position.x.toFixed(3),
        z:+p.position.z.toFixed(3),
        y:+(p.position.y||0).toFixed(3),
        // how far the art is sunk into the ground (TOWN_SINK), so the board plants the base the
        // way the game does instead of hanging the crop by its lowest pixel
        sink:+(TOWN_SINK[art]||0).toFixed(4),
        face:o.isSprite?0:1,
        yaw:+(p.rotation.y||0).toFixed(3),
        w:+wh[0].toFixed(3),h:+wh[1].toFixed(3),
        flip:!!(map&&TOWNP.tex.get(art+'@f')===map),
        off:map?[+map.offset.x.toFixed(5),+map.offset.y.toFixed(5)]:null,
        rep:map?[+map.repeat.x.toFixed(5),+map.repeat.y.toFixed(5)]:null,
        grp:(o.parent===TOWN.houseKit?'ring':p.parent===TOWN.houseKit?'ring':p.parent===TOWN.propBlk?'prop':'town'),
        parent:(p.parent&&p.parent.name)||''});
    });
  };
  [TOWN.houseKit,TOWN.propBlk,TOWN.g].forEach(walk);
  // The solids: every visible box mesh in the town group (curtain wall, bridge deck, banks, gate
  // towers). The board draws these as real boxes, because a wall made of boxes is invisible to a
  // sprite-only board - and the wall is exactly what round 5 had to check.
  const boxes=[];const seenB=new Set();
  const walkBox=root=>{root.traverse(o=>{
    if(!o.isMesh||seenB.has(o.id))return;seenB.add(o.id);
    const g=o.geometry;if(!g||!g.parameters||!g.parameters.width||g.parameters.depth===undefined)return;
    if(o.rotation&&o.rotation.x)return;                     // flat planes: the board draws those itself
    let p2=o,vis=true;while(p2&&p2!==TOWN.g){if(p2.visible===false){vis=false;break}p2=p2.parent}
    if(!vis)return;
    const m=o.material;if(!m||!m.color)return;
    const wp=new THREE.Vector3();o.getWorldPosition(wp);
    boxes.push({c:'#'+m.color.getHexString(),x:+wp.x.toFixed(2),y:+(wp.y-g.parameters.height/2).toFixed(2),
      z:+wp.z.toFixed(2),w:+g.parameters.width.toFixed(2),h:+g.parameters.height.toFixed(2),
      d:+g.parameters.depth.toFixed(2),ry:o.rotation&&o.rotation.y?+o.rotation.y.toFixed(3):0});});};
  walkBox(TOWN.g);
  const dim=m=>{const q=m.geometry.parameters||{};
    return [q.width||(q.radius||0)*2,q.height||(q.radius||0)*2];};
  return JSON.stringify({sprites:list,npc:TOWN.list.map(n=>({id:n.def.id,x:n.def.x,z:n.def.z})),
    plaza:{r:TOWN_R,z:TOWN_Z},
    // the ground the town actually asks for, in the order it is drawn, and the river/bridge numbers,
    // so the boards show the real water band and the deck's own arch profile instead of a redraw
    grounds:(TOWN.grounds||[]).map(g=>{const[gw,gh]=dim(g.m);return {tile:g.tile,c:'#'+g.m.material.color.getHexString(),
      x:+g.m.position.x.toFixed(2),z:+g.m.position.z.toFixed(2),y:+g.m.position.y.toFixed(3),
      w:+gw.toFixed(2),h:+gh.toFixed(2)}}),
    tiles:(TOWN.tiles||[]).map(t=>{const[tw,th]=dim(t.m);return {tile:t.tile,r:+(t.m.geometry.parameters.radius||0).toFixed(3),
      x:+t.m.position.x.toFixed(2),z:+t.m.position.z.toFixed(2),y:+t.m.position.y.toFixed(3),
      w:+tw.toFixed(2),h:+th.toFixed(2)}}),
    river:{z0:TOWN_RIVER.z0,z1:TOWN_RIVER.z1,half:TOWN_RIVER.half,
      x:+TOWN.river.m.position.x.toFixed(2),z:+TOWN.river.m.position.z.toFixed(2),
      w:+TOWN.river.m.geometry.parameters.width.toFixed(2),h:+TOWN.river.m.geometry.parameters.height.toFixed(2)},
    bridge:{z0:TOWN.bridge.z0,z1:TOWN.bridge.z1,half:TOWN_RIVER.half,seg:TOWN.bridge.seg,ramp:TOWN.bridge.ramp,
      tops:Array.from({length:TOWN.bridge.seg},(_,i)=>+TOWN.bridge.top(i).toFixed(3))},
    boxes:boxes,
    bound:TOWN_BOUND,
    cam:{pos:cam.position.toArray(),target:[ct.x,0,ct.z],
         proj:Array.from(cam.projectionMatrix.elements),
         view:Array.from(cam.matrixWorldInverse.elements),
         world:Array.from(cam.matrixWorld.elements),
         fov:cam.fov,near:cam.near,far:cam.far,aspect:cam.aspect,zoom:zoom,
         viewW:1600,viewH:900},
    // The entrance view: the same camera, stood on the far bank looking north up the avenue. This is
    // the shot the round-5 screenshots were taken from, so the board has to be able to show it.
    camGate:(()=>{const g={x:0,z:TOWN_RIVER.z1+2.6,y:CAMERA_FOCUS_Y};
      const p2=new THREE.PerspectiveCamera(cam.fov,cam.aspect,cam.near,cam.far);
      p2.position.set(g.x+Math.sin(az)*Math.cos(el)*dd,Math.sin(el)*dd+.5,g.z+Math.cos(az)*Math.cos(el)*dd);
      p2.lookAt(new THREE.Vector3(g.x,g.y,g.z));p2.updateMatrixWorld(true);p2.updateProjectionMatrix();
      return {pos:p2.position.toArray(),target:[g.x,0,g.z],
        proj:Array.from(p2.projectionMatrix.elements),
        view:Array.from(p2.matrixWorldInverse.elements),
        fov:p2.fov,near:p2.near,far:p2.far,aspect:p2.aspect,zoom:zoom,viewW:1600,viewH:900};})()});
})()`));
fs.writeFileSync('/tmp/town_placements.json',JSON.stringify(out,null,1));
console.log('sprites:',out.sprites.length,'groups:',JSON.stringify(out.sprites.reduce((a,s)=>(a[s.grp]=(a[s.grp]||0)+1,a),{})));
console.log('ring sample:',JSON.stringify(out.sprites.filter(s=>s.grp==='ring').slice(0,3)));
console.log('npcs:',JSON.stringify(out.npc));
process.exit(0);
