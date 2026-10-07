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
    plaza:{r:TOWN_R,z:TOWN_Z},flip:!!TOWN.houseBlk.visible===false});
})()`));
fs.writeFileSync('/tmp/town_placements.json',JSON.stringify(out,null,1));
console.log('sprites:',out.sprites.length,'groups:',JSON.stringify(out.sprites.reduce((a,s)=>(a[s.grp]=(a[s.grp]||0)+1,a),{})));
console.log('ring sample:',JSON.stringify(out.sprites.filter(s=>s.grp==='ring').slice(0,3)));
console.log('npcs:',JSON.stringify(out.npc));
process.exit(0);
