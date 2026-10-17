// Actual Chromium native-pixel check; local Three replaces only the blocked CDN download.
// CHROMIUM_BUNDLED_LIBS=1 node tools/check_cosmetic_combo_browser.cjs [base URL]
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core'),moduleChromium=require('@sparticuz/chromium'),bundled=moduleChromium.default||moduleChromium;
const base=process.argv[2]||'http://127.0.0.1:8000',out=path.resolve('node_modules/.arena-checks');
(async()=>{
 if(process.env.CHROMIUM_BUNDLED_LIBS==='1'){const pkg=path.resolve(path.dirname(require.resolve('@sparticuz/chromium')),'..'),lib=await moduleChromium.inflate(path.join(pkg,'bin/al2023.tar.br'));process.env.LD_LIBRARY_PATH=path.join(lib,'lib')+':'+(process.env.LD_LIBRARY_PATH||'');}
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||await bundled.executablePath(),args:[...bundled.args,'--enable-unsafe-swiftshader'],headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(require.resolve('three/build/three.min.js'))}));
  await page.addInitScript(()=>{window.requestAnimationFrame=cb=>{window.__pendingFrame=cb;return 1};});
  await page.goto(base+'/');
  await page.waitForFunction(()=>typeof captureWardrobeFrame==='function'&&typeof playerAttack==='function');
  const graphics=await page.evaluate(()=>{const gl=R.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{version:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown'};});
  const rows=[];
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   for(const cls of ['Guillotine Cross','Warlock'])for(const sex of ['m','f']){
    const result=await page.evaluate(async({cls,sex})=>{
     currentUser='cosmetic-test';S=fresh();S.cls=cls;S.lv=150;S.sex=sex;S.st.agi=120;S.st.dex=120;S.auto=false;S.adv=false;S.pets=[];S.bgm={enabled:false};
     for(const name of lineOf(S.cls))S.jobs[name]={jl:CLASSES[name].mj,jx:0};S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,s.max]));
     S.skOff=Object.fromEntries(SKILLS.filter(s=>s.type==='buff').map(s=>[s.id,true]));
     const look=await wardrobeStore.select('cosmetic-check',PGWardrobe.defaults(sex),cls),sprite=mkWardrobeHero(look);
     const oldClassAspd=C().aspd;C().aspd=.1;resetSkillRuntime();t=1;pl.x=0;pl.z=0;pl.run=false;S.hp=maxHp();
     mob={n:'Animation check',x:0,z:0,hx:0,hz:0,pack:0,size:1,hp:1e12,max:1e12,atk:0,at:1e9,spawn:1,fixed:true};mobs=[mob];activePack=0;camps=[];
     const r=skillState();r.comboSlots=rotationSkills().map(s=>s.id);r.cursor=1;r.nextCastAt=1.5;r.recoverUntil=0;
     TRIAL.on=true;TRIAL.left=1e9;for(const key in skCd)delete skCd[key];swing=null;pAtkT=0;atkAnim=0;
     const damage=S.dmg||0,hp=mob.hp;playerAttack();
     if(!swing?.visualOnly)throw Error('No cosmetic swing');
     const duration=swingDur,paint=[],pixels=[];
     for(let i=0;i<3;i++){
      if(i)for(let k=0;k<8;k++)update(duration/24);
      captureWardrobeFrame(sprite,0,false,atkAnim,1000+i*duration*1000/3);
      paint.push(sprite.userData.wardrobe.paint);pixels.push(sprite.userData.wardrobe.cv.getContext('2d').getImageData(0,0,320,280).data);
     }
     let changed=0;for(let i=0;i<pixels[0].length;i+=4)if(pixels[0][i]!==pixels[2][i]||pixels[0][i+1]!==pixels[2][i+1]||pixels[0][i+2]!==pixels[2][i+2]||pixels[0][i+3]!==pixels[2][i+3])changed++;
     if(new Set(paint).size<2||changed<20)throw Error('Native attack pixels stayed static');
     if((S.dmg||0)!==damage||mob.hp!==hp)throw Error('Cosmetic swing dealt damage');
     C().aspd=oldClassAspd;TRIAL.on=false;
     $('loginOverlay').style.display='none';tabs.splice(0,tabs.length);openTab('skills');
     if(!document.querySelector('.combo-live').textContent.includes('visual-only swings'))throw Error('Missing player hint');
     const pause=document.querySelector('[data-a="combopause"]');pause.click();if(comboConfig().enabled)throw Error('Pause failed');
     document.querySelector('[data-a="combopause"]').click();if(!comboConfig().enabled)throw Error('Resume failed');
     return{cls,sex,width:innerWidth,duration,paint,changedPixels:changed,damageDelta:(S.dmg||0)-damage,pauseResume:true};
    },{cls,sex});
    rows.push(result);
   }
  }
  assert.deepEqual(errors,[]);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'cosmetic-browser.json'),JSON.stringify({graphics,rows,errors},null,2)+'\n');
  console.log(JSON.stringify({graphics,checks:rows.length,nativePixelsChange:true,zeroGapDamage:true,desktopAnd390px:true,pauseResume:true,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
