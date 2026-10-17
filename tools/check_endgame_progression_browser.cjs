// Built-site controls at desktop/390px. Real WebGL context; not a phone/FPS benchmark.
// CHROMIUM_BUNDLED_LIBS=1 node tools/check_endgame_progression_browser.cjs [base URL]
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core'),moduleChromium=require('@sparticuz/chromium'),bundled=moduleChromium.default||moduleChromium;
const base=process.argv[2]||'http://127.0.0.1:8000/dist',out=path.resolve('node_modules/.arena-checks');
(async()=>{
 if(process.env.CHROMIUM_BUNDLED_LIBS==='1'){const pkg=path.resolve(path.dirname(require.resolve('@sparticuz/chromium')),'..'),lib=await moduleChromium.inflate(path.join(pkg,'bin/al2023.tar.br'));process.env.LD_LIBRARY_PATH=path.join(lib,'lib')+':'+(process.env.LD_LIBRARY_PATH||'');}
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||await bundled.executablePath(),args:[...bundled.args,'--enable-unsafe-swiftshader'],headless:true});
 try{
  const page=await browser.newPage(),errors=[],rows=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(require.resolve('three/build/three.min.js'))}));
  await page.addInitScript(()=>{window.requestAnimationFrame=cb=>{window.__frame=cb;return 1};});
  await page.goto(base+'/');await page.waitForFunction(()=>typeof ascStatValue==='function');fs.mkdirSync(out,{recursive:true});
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(()=>{currentUser='endgame-browser-test';S=fresh();S.cls='Rune Knight';S.lv=150;S.auto=false;S.adv=false;S.pets=[];mobs=[];mob=null;resetSkillRuntime();S.hp=maxHp();ascState().level=10;ascState().skills[S.cls].level=5;$('loginOverlay').style.display='none';tabs.splice(0,tabs.length);openTab('status');});
   await page.locator('[data-a="sub"][data-v="status:ascstats"]').click();
   const might=page.locator('[data-a="ascstat"][data-v="might"]');
   for(let i=0;i<5;i++)await might.click();
   assert.equal(await page.evaluate(()=>ascStat('might')),2.5);
   assert.match(await might.locator('..').textContent(),/\+2.5%/);
   await page.screenshot({path:path.join(out,`endgame-${width}-stats.png`)});
   const reset=page.locator('[data-a="ascreset"][data-v="stats"]');await reset.click();await page.locator('#mn').click();assert.equal(await page.evaluate(()=>ascStat('might')),2.5);
   await reset.click();await page.locator('#my').click();assert.equal(await page.evaluate(()=>ascStat('might')),0);assert.equal(await page.evaluate(()=>ascPoints()),10);
   await page.evaluate(()=>{tabs.splice(0,tabs.length);ACT.ascopenskill();});
   const charge=page.locator('[data-a="ascskill"][data-v="rk_charge"]');await charge.click();
   assert.ok(Math.abs(await page.evaluate(()=>ascSkillValue('rk_charge','damage'))-1)<1e-9);assert.match(await charge.locator('..').textContent(),/Current: \+1% skill damage/);
   await page.screenshot({path:path.join(out,`endgame-${width}-skills.png`)});
   await page.evaluate(()=>{S.eq=Object.fromEntries(['weapon','armor','head','leg','acc1','acc2'].map((slot,i)=>[slot,{id:100+i,slot:slot.startsWith('acc')?'acc':slot,wt:slot==='weapon'?'sword':null,sec:6,ascSet:'infernal',r:10,val:100,cards:[],aff:[]}]));tabs.splice(0,tabs.length);openTab('equip');});
   await page.locator('[data-a="sub"][data-v="equip:ascension"]').click();
   await page.locator('[data-a="ascset"][data-v="infernal"]').click();
   assert.match(await page.locator('.ascension-set-info').textContent(),/atk \+8\.8%/);
   await page.screenshot({path:path.join(out,`endgame-${width}-forge.png`)});
   await page.evaluate(()=>{for(const it of items())it.r=15;renderWin();});assert.match(await page.locator('.ascension-set-info').textContent(),/atk \+22%/);
   await page.evaluate(()=>{localStorage.setItem(saveKey(),JSON.stringify(S));S=load();sub.skills='skillasc';tabs.splice(0,tabs.length,'skills');renderWin();});assert.equal(await page.evaluate(()=>ascRank('rk_charge')),1);
   await page.evaluate(()=>{currentUser='isolated-endgame-account';S=fresh();S.cls='Rune Knight';sub.status='ascstats';tabs.splice(0,tabs.length,'status');renderWin();});assert.equal(await page.evaluate(()=>ascStat('might')),0);
   rows.push({width,allocateStat:true,allocateSkill:true,resetCancel:true,resetApply:true,refinementPreview:true,reload:true,accountIsolation:true});
  }
  assert.deepEqual(errors,[]);const result={rows,errors,rendererStub:false,rafPaused:true};fs.writeFileSync(path.join(out,'endgame-browser.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
