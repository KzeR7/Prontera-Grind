// Actual shipped-page rendering with local native assets. No renderer stub.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core'),mod=require('@sparticuz/chromium'),bundled=mod.default||mod;
const base=process.argv[2]||'http://localhost:8000/dist',out=path.resolve('node_modules/.arena-checks/native-fields');fs.mkdirSync(out,{recursive:true});
(async()=>{
 if(process.env.CHROMIUM_BUNDLED_LIBS==='1'){const pkg=path.resolve(path.dirname(require.resolve('@sparticuz/chromium')),'..'),lib=await mod.inflate(path.join(pkg,'bin/al2023.tar.br'));process.env.LD_LIBRARY_PATH=path.join(lib,'lib')+':'+(process.env.LD_LIBRARY_PATH||'');}
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||await bundled.executablePath(),args:[...bundled.args,'--enable-unsafe-swiftshader'],headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],rows=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error'&&/THREE|shader|WebGL/.test(msg.text()))errors.push(msg.text())});page.on('request',r=>requests.push(r.url()));
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(require.resolve('three/build/three.min.js'))}));
  await page.addInitScript(()=>{window.requestAnimationFrame=cb=>{window.__pendingFrame=cb;return 1}});
  async function checkDefault(){
   const firstRequest=requests.length;
   await page.goto(base+'/');await page.waitForFunction(()=>typeof draw==='function');
   await page.evaluate(()=>{currentUser='default-map-check';S=fresh();S.auto=false;S.adv=false;S.pets=[];S.tutorial=99;$('loginOverlay').style.display='none';ui()});
   await page.waitForFunction(()=>KIT.ok,null,{polling:100});
   const result=await page.evaluate(()=>{
    const maps=[];for(let m=0;m<10;m++){S.mp=m;S.lvl=4;lastKey='';spawn();draw();maps.push({map:m,native:!!KIT.built?.native,placed:KIT.built?.placed,floor:actorFloorY(0,-8)})}
    return{enabled:nativeFieldsEnabled,store:!!nativeFieldStore,maps};
   });
   assert(!result.enabled&&!result.store,'ordinary URL enabled parked fields');
   assert(result.maps.every(m=>!m.native&&m.placed>0&&m.floor===.035),'ordinary URL did not retain original maps and flat contact');
   const fieldRequests=requests.slice(firstRequest).filter(u=>/\/native-fields\/v1\/(catalog\.json|(?:prontera|izlude|geffen|morocc|payon|comodo|louyang|amatsu|gl_chyard|hu_fild05)\/)/.test(u));
   assert.equal(fieldRequests.length,0,'default maps downloaded parked field assets');
   return result;
  }
  const defaultBefore=await checkDefault();
  let releaseMap;const mapGate=new Promise(r=>releaseMap=r);
  await page.route('**/native-fields/v1/prontera/models.bin',async r=>{await mapGate;await r.continue()});
  await page.goto(base+'/?nativeFields=1');await page.waitForFunction(()=>typeof draw==='function'&&typeof PGNativeFields==='object');
  await page.evaluate(async()=>{await referenceMobStore.init();currentUser='native-field-check';S=fresh();S.auto=false;S.adv=false;S.bgm={enabled:false};S.pets=[];S.tutorial=99;$('loginOverlay').style.display='none';ui();});
  await page.waitForFunction(()=>KIT.ok,null,{polling:100});
  // Change stages while the first native geometry request is held in flight.
  await page.evaluate(()=>{S.mp=0;S.lvl=1;spawn();lastKey='';draw();S.lvl=4;spawn();draw()});releaseMap();
  await page.waitForFunction(()=>KIT.built?.native&&KIT.built.stage===4,null,{polling:100,timeout:20000});
  await page.waitForFunction(()=>{draw();return !!heroSpr?.userData.wardrobe},null,{polling:100,timeout:20000});
  const graphics=await page.evaluate(()=>{const gl=R.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{version:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown'}});
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width===390?844:960});
   for(const map of (process.env.NATIVE_MAPS?process.env.NATIVE_MAPS.split(',').map(Number):Array.from({length:10},(_,i)=>i))){
    for(const stage of width===390||process.env.NATIVE_QUICK?[4]:[1,4,7,10]){
     const result=await page.evaluate(async({map,stage})=>{
      S.mp=map;S.lvl=stage;pl.x=0;pl.z=0;lastKey='';spawn();await nativeFieldStore.ensure(map);
      for(const m of mobs){m.spawn=1;m.atkAnim=0;m.run=false}await Promise.all(mobs.map(m=>referenceMobStore.request(m.spriteId)));draw();
      if(!KIT.built?.native)throw Error('Native field not installed');
      if(Math.abs(P.position.y-(PGNativeFields.heightAt(map,pl.x,pl.z)+.035))>.001)throw Error('Hero lost native floor contact');
      for(const m of mobs){const v=mobMesh.get(m);if(Math.abs(v.G.position.y-(actorFloorY(m.x,m.z)-.035))>.001)throw Error('Monster lost native floor contact')}
      const samples=[];for(const x of [-12,0,12])for(const z of [-24,-8,10])samples.push(PGNativeFields.heightAt(map,x,z));
      if(Math.max(...samples)-Math.min(...samples)<2)throw Error('Playable field has no hills');
      // Cross hills in both directions using the actual production drawing path.
      for(const [x,z] of [[-10,10],[8,5],[-7,-8],[10,-18],[0,-25]]){pl.x=x;pl.z=z;draw();if(Math.abs(P.position.y-actorFloorY(x,z))>.001)throw Error('Hero lost floor on slope')}
      pl.x=pl.z=0;ct.set(0,CAMERA_FOCUS_Y+actorFloorY()-.035,-CAMERA_LEAD_Z);draw();
      if(KIT.nativeWorld.props.some(p=>['house','gate','marker','landmark','crate','barrel'].includes(p.role)))throw Error('Town scenery in mob field');
      return{map,stage,...KIT.nativeWorld.diagnostics,cache:nativeFieldStore.diagnostics(),sprites:mobs.filter(m=>mobMesh.get(m)?.referenceMob).length};
     },{map,stage});rows.push({width,...result});
     if(stage===4){await page.waitForTimeout(120);const png=await page.evaluate(()=>{draw();R.render(scene,cam);return R.domElement.toDataURL('image/png').split(',')[1]});fs.writeFileSync(path.join(out,`${map}-${width}.png`),Buffer.from(png,'base64'));}
    }
   }
  }
  const contactChecks=await page.evaluate(()=>{
   const oldLevel=S.lv;S.lv=99;S.auraShow=true;S.hideUI=false;const petId=901;S.pets=[{id:petId,sp:0,on:true}];petR[petId]={x:0,z:10,run:false,face:0};
   const drop={wx:0,wz:10,y:0,it:{ore:'ori'}},shot={x0:0,z0:10,x1:0,z1:10,t:0,col:0xffffff,arrow:true};drops.push(drop);shots.push(shot);
   const checked=[];for(const z of [10,-8,-23]){petR[petId].z=z;drop.wz=z;shot.z0=shot.z1=z;pl.z=z;draw();
    const y=PGNativeFields.heightAt(S.mp,0,z),near=(actual,expected,name)=>{if(Math.abs(actual-expected)>.001)throw Error(name+' lost sloping ground contact')};
    near(petMesh.get(petId).G.position.y,y+.035,'Pet');near(dmesh.get(drop).position.y,y+.35,'Loot');near(shot.m.position.y,y+1.4,'Projectile');near(levelAura.position.y,y+.045,'Hero aura');checked.push(z);
   }
   S.lv=oldLevel;S.pets=[];delete petR[petId];drops=drops.filter(d=>d!==drop);shots=shots.filter(s=>s!==shot);scene.remove(shot.m);shot.m.geometry.dispose();shot.m.material.dispose();pl.z=0;draw();return checked;
  });
  // The same Poring canvas must contain different original pixels as its idle frame changes.
  const pixelCheck=await page.evaluate(async()=>{
   await referenceMobStore.request(1002);const v={spr:new THREE.Sprite(new THREE.SpriteMaterial()),official:false},m={spriteId:1002};
   referenceMobStore.draw(THREE,v,m,0,1000);const first=v.referenceMob.ctx.getImageData(0,0,v.referenceMob.cv.width,v.referenceMob.cv.height).data.slice();referenceMobStore.draw(THREE,v,m,0,1100);const second=v.referenceMob.ctx.getImageData(0,0,v.referenceMob.cv.width,v.referenceMob.cv.height).data;let changed=0;for(let i=0;i<first.length;i++)if(first[i]!==second[i])changed++;
   v.referenceMob.tex.dispose();v.spr.material.dispose();return changed;
  });assert(pixelCheck>20,'original animated pixels stayed static');
  await page.evaluate(()=>{clearAscension();if(KIT.nativeWorld)throw Error('native world retained on arena transition')});
  // Reload with native delivery unavailable: supplied kit remains a complete fallback.
  await page.route('**/assets/native-fields/v1/**',r=>r.abort());await page.reload();await page.waitForFunction(()=>typeof draw==='function');
  const fallback=await page.evaluate(async()=>{currentUser='fallback-check';S=fresh();S.auto=false;S.adv=false;S.pets=[];await new Promise(r=>setTimeout(r,200));draw();return{kit:KIT.ok,placed:KIT.built?.placed,native:!!KIT.built?.native}});assert(fallback.kit&&fallback.placed>0&&!fallback.native,'missing native assets broke existing kit fallback');
  await page.unroute('**/assets/native-fields/v1/**');
  const defaultAfter=await checkDefault(); // Preview choice must not persist on reload without the query.
  assert.equal(errors.length,0,errors.join('\n'));
  const report={defaultBefore,defaultAfter,graphics,rows,contactChecks,pixelCheck,fallback,errors,referenceAssetRequests:requests.filter(u=>u.includes('/native-fields/')).length};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({defaultMaps:defaultAfter.maps.length,graphics,scenes:rows.length,contactChecks,pixelCheck,fallback,errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
