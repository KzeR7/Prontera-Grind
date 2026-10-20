// Built-site control/marker checks. --shared attaches to customer Preview with its documented
// renderer stub; the ordinary mode uses real Chromium WebGL through software rendering.
// CHROMIUM_BUNDLED_LIBS=1 node tools/check_ground_combat_browser.cjs [URL] [output-dir] [--shared]
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require('playwright-core');
(async()=>{
 const shared=process.argv.includes('--shared'),base=process.argv[2]||'http://localhost:8788/';
 const out=process.argv[3]||'node_modules/.arena-checks/ground-browser';fs.mkdirSync(out,{recursive:true});
 let browser;
 if(shared)browser=await chromium.connectOverCDP(cp.execFileSync('coderabbit-agent-browser',['get','cdp-url'],{encoding:'utf8'}).trim());
 else{
  const mod=require('@sparticuz/chromium'),bundled=mod.default||mod;
  if(process.env.CHROMIUM_BUNDLED_LIBS==='1'){const pkg=path.resolve(path.dirname(require.resolve('@sparticuz/chromium')),'..'),lib=await mod.inflate(path.join(pkg,'bin/al2023.tar.br'));process.env.LD_LIBRARY_PATH=path.join(lib,'lib')+':'+(process.env.LD_LIBRARY_PATH||'');}
  browser=await chromium.launch({executablePath:await bundled.executablePath(),args:[...bundled.args,'--enable-unsafe-swiftshader'],headless:true});
 }
 let page;
 try{
  page=shared?browser.contexts()[0].pages()[0]:await browser.newPage();
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(require.resolve('three/build/three.min.js'))}));
  await page.addInitScript(({shared})=>{
   window.__groundNativeRaf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>{window.__groundFrame=cb;return 1};
   if(shared){window.__groundRendererStub=true;let value;Object.defineProperty(window,'THREE',{configurable:true,get(){return value},set(v){value=new Proxy(v,{get(t,k){if(k!=='WebGLRenderer')return t[k];return function(){this.domElement=document.createElement('canvas');this.shadowMap={};this.setSize=(w,h)=>{this.domElement.width=w;this.domElement.height=h;this.domElement.style.width=w+'px';this.domElement.style.height=h+'px'};this.setPixelRatio=()=>{};this.render=()=>{};this.getContext=()=>({});}}})}})}
  },{shared});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>typeof skillAfterglow!=='undefined'&&typeof R!=='undefined',null,{polling:100});
  const graphics=await page.evaluate(()=>{if(window.__groundRendererStub)return 'shared Preview renderer stub; Canvas/UI are real';const gl=R.getContext();return gl.getParameter(gl.VERSION)});
  const rows=[];
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   const before=await page.evaluate(()=>{
    currentUser='ground-preview';S=fresh();S.cls='High Wizard';S.lv=150;S.auto=false;S.adv=false;S.bgm={enabled:false};S.pets=[];S.st.int=120;S.st.dex=100;
    for(const n of lineOf(S.cls))S.jobs[n]={jl:CLASSES[n].mj,jx:0};S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,s.max]));
    S.hp=maxHp();$('loginOverlay').style.display='none';tabs.splice(0,tabs.length);spawn();mobs=mobs.filter(o=>o.pack===0);activePack=0;
    mobs.forEach((o,i)=>Object.assign(o,{x:(i-1)*1.5,z:0,hp:1e15,max:1e15,atk:0,at:1e9,fixed:true,spawn:1}));mob=mobs[0];pl.x=0;pl.z=4;pl.run=false;
    resetSkillRuntime();swing=null;atkAnim=0;pAtkT=1e9;for(const key in skCd)delete skCd[key];skillFx=[];resize();ui();for(let i=0;i<120;i++)draw();
    const selector=$('rangedMovementMode'),a=$('eclipseAdvance').getBoundingClientRect(),b=selector.getBoundingClientRect();
    return {below:b.top>=a.bottom,enabled:!selector.disabled,bounds:{left:b.left,right:b.right},default:selector.value};
   });
   assert(before.below&&before.enabled);assert.equal(before.default,'stand');assert(before.bounds.left>=0&&before.bounds.right<=width);
   await page.selectOption('#rangedMovementMode','kite');assert.equal(await page.evaluate(()=>S.kite),true);
   await page.evaluate(()=>{save();S=load();bars()});assert.equal(await page.inputValue('#rangedMovementMode'),'kite');
   await page.selectOption('#rangedMovementMode','stand');assert.equal(await page.evaluate(()=>S.kite),false);
   await page.evaluate(()=>draw());await page.waitForFunction(()=>!!wardrobeEquipped&&wardrobeEquipped.cls===S.cls,null,{polling:100});
   const spell=await page.evaluate(()=>{
    castSkill(SKILLS.find(s=>s.id==='amp'),1);update(.8);draw();
    const effects=skillFx;skillFx=[];syncSkillFx();const canvas=$('skillAfterglowLayer'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])visible++;skillFx=effects;draw();
    return {fields:skillState().fields.length,radius:skillState().fields[0].radius,markerPixels:visible,damage:S.dmg};
   });
   assert.equal(spell.fields,1);assert.ok(spell.markerPixels>100&&spell.damage>0);assert.ok(Math.abs(spell.radius-7.0875)<1e-8);
   await page.screenshot({path:path.join(out,`meteor-${shared?'shared':'webgl'}-${width}.png`)});
   await page.evaluate(()=>{S.cls='Knight';bars()});assert.equal(await page.isDisabled('#rangedMovementMode'),true);
   await page.evaluate(()=>{tickCombatSkills(.1);draw()});assert.equal(await page.evaluate(()=>skillState().fields.length),0);
   rows.push({width,...before,...spell,saved:true,meleeDisabled:true,classCleanup:true});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,`ground-${shared?'shared':'webgl'}.json`),JSON.stringify({graphics,rows,errors},null,2));console.log(JSON.stringify({graphics,rows,errors},null,2));
 }finally{
  // Disconnect the CDP client without closing the user's shared browser.
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
