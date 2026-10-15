// Actual Chromium/WebGL dev-viewer checks. SwiftShader is not physical-device proof.
// npm install --no-save --package-lock=false jsdom three@0.128.0 playwright-core @sparticuz/chromium
// node tools/check_endgame_scenery_browser.js [base URL] [capture directory]
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sourceHashes=()=>Object.fromEntries(['tools/maps/endgame-scenes.js','tools/map_scene_preview.html'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'..',file))).digest('hex')]));
const captureSources=sourceHashes();
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const moduleChromium=require('@sparticuz/chromium');
const bundled=moduleChromium.default||moduleChromium;
const base=process.argv[2]||'http://127.0.0.1:8000';
const out=path.resolve(process.argv[3]||'tools/preview/endgame-captures');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 // Minimal Debian containers may need the package's bundled NSS libraries.
 if(process.env.CHROMIUM_BUNDLED_LIBS==='1'){
  const packageRoot=path.resolve(path.dirname(require.resolve('@sparticuz/chromium')),'..');
  const libRoot=await moduleChromium.inflate(path.join(packageRoot,'bin/al2023.tar.br'));
  process.env.LD_LIBRARY_PATH=path.join(libRoot,'lib')+':'+(process.env.LD_LIBRARY_PATH||'');
 }
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||await bundled.executablePath(),args:[...bundled.args,'--enable-unsafe-swiftshader'],headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:800},reducedMotion:'reduce'});
  const errors=[],failed=[],warnings=[],layouts=[];
  const ready=()=>page.waitForFunction(()=>window.PGEndgameStudio&&PGEndgameStudio.diagnostics().materialsLoaded&&PGEndgameStudio.diagnostics().renderedVersion===PGEndgameStudio.diagnostics().revision);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>failed.push(r.url()));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text())});
  const response=await page.goto(base+'/tools/map_scene_preview.html');assert.equal(response.status(),200);
  await page.waitForFunction(()=>document.querySelector('#stats').textContent.includes('instanced'));
  assert.equal(await page.locator('#error').isVisible(),false);
  assert.equal(await page.locator('#motion').isChecked(),false);
  // Browser diagnostics from the same WebGL context that paints the view.
  const graphics=await page.locator('canvas').evaluate(canvas=>{
    const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
    const extension=gl.getExtension('WEBGL_debug_renderer_info');
    return {version:gl.getParameter(gl.VERSION),renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  });
  await ready();await page.locator('#wholeBridge').click();await ready();
  assert.equal(await page.locator('#routeLabels span').count(),4);
  await page.locator('#viewport').screenshot({path:path.join(out,'astral-route-desktop.png')});
  await page.locator('#tourBridge').click();assert.equal((await page.evaluate(()=>PGEndgameStudio.diagnostics())).tourActive,true);
  await page.waitForFunction(()=>PGEndgameStudio.diagnostics().focusZ<0);
  await page.locator('#wholeBridge').click();assert.equal((await page.evaluate(()=>PGEndgameStudio.diagnostics())).tourActive,false);
  for(const destination of ['astral','thor']){
    await page.locator(`[data-map="${destination}"]`).click();
    for(const stage of [1,4,7,10]){
      await page.locator(`[data-stage="${stage}"]`).click();
      await ready();
      const diagnostics=await page.evaluate(()=>PGEndgameStudio.diagnostics());
      assert.equal(diagnostics.footprint,destination==='astral'?(stage===10?'bridge-terminus':'bridge'):(stage===10?'circle':'natural-field'));
      if(destination==='astral'){assert.equal(diagnostics.focusZ,[-8,-74,-140,-208][[1,4,7,10].indexOf(stage)]);assert.equal(await page.locator('#focus').inputValue(),String(diagnostics.focusZ));}
      assert.equal(diagnostics.features.length,4);layouts.push({destination,stage,footprint:diagnostics.footprint,features:diagnostics.features});
      assert.equal(await page.locator('#error').isVisible(),false);
      await page.locator('#viewport').screenshot({path:path.join(out,`${destination}-${stage}-desktop.png`)});
    }
  }
  await page.locator('#gameCamera').click();assert.equal(await page.locator('#zoom').inputValue(),'1');
  await page.locator('#bounds').check();await page.locator('#quality').uncheck();await page.locator('#motion').check();
  await page.locator('#surveyCamera').click();
  for(let i=0;i<8;i++){
    await page.locator(`[data-map="${i%2?'thor':'astral'}"]`).click();
    await page.locator(`[data-stage="${[1,4,7,10][i%4]}"]`).click();
  }
  assert.equal(await page.locator('#viewport canvas').count(),1,'Scene switching does not duplicate renderer canvases');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#reset').click();
  await page.locator('[data-map=astral]').click();await ready();await page.locator('#viewport').screenshot({path:path.join(out,'astral-route-phone.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow at phone width');
  for(const destination of ['astral','thor']){
    await page.locator(`[data-map="${destination}"]`).click();
    await page.locator('[data-stage="10"]').click();
    await ready();
    await page.screenshot({path:path.join(out,`${destination}-phone.png`),fullPage:true});
  }
  await page.goto(base+'/tools/map_scene_review.html');
  await page.waitForFunction(()=>document.querySelectorAll('.card').length===8);
  await page.waitForFunction(()=>{const img=document.querySelector('.route-hero img');return img&&img.complete&&img.naturalWidth>0});
  await page.screenshot({path:path.join(out,'comparison-board-phone.png')});
  assert.equal(await page.locator('.card.boss').count(),2);
  await page.locator('#read').click();await page.waitForFunction(()=>document.getElementById('document').textContent.includes('New Endgame Maps'));await page.locator('#close').click();
  await page.goto(base+'/tools/map_scene_preview.html?map=thor&stage=10');await ready();
  assert.equal((await page.evaluate(()=>PGEndgameStudio.diagnostics())).footprint,'circle');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#stats').textContent.includes('instanced'));
  assert.equal(await page.locator('#error').isVisible(),false);
  const canvas=page.locator('#viewport canvas');
  await canvas.evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.waitForFunction(()=>!document.getElementById('error').hidden);
  assert.match(await page.locator('#errorText').textContent(),/context was lost/);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  assert.deepEqual(sourceHashes(),captureSources,'Sources must not change while captures are running');
  const report={captureSources,layouts,graphics,errors,failedRequests:failed,warnings,checks:'Eight desktop local views, whole-bridge desktop/phone captures, two phone boss captures, tour start/progress/stop, controls, 8 repeated switches, one canvas, phone overflow, comparison board, full proposal dialog, direct boss links, reload and actual context loss passed. Software WebGL, not physical-device performance.'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
