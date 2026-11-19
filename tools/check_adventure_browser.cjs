// Starts its own disposable tools/dev_server.js instance against freshly built dist.
// node tools/check_adventure_browser.cjs [chromium|firefox] [output-directory]
const {chromium,firefox}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const engine=process.argv[2]||'chromium',out=path.resolve(process.argv[3]||'work/adventure-review');
 if(!['chromium','firefox'].includes(engine))throw Error('Use chromium or firefox');
 fs.mkdirSync(out,{recursive:true});
 const {start}=await import('./dev_server.js');
 const server=await start({port:0,site:path.resolve('dist'),previewAuth:true});
 const base='http://127.0.0.1:'+server.port;
 const browser=await ({chromium,firefox}[engine]).launch({headless:true,args:engine==='chromium'?['--enable-unsafe-swiftshader']:[]});
 try{
  for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
   try{
   page.on('pageerror',e=>errors.push(e.message));
   // Serve the same pinned engine from disk to make this test independent of CDN uptime.
   await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:path.resolve('tools/vendor/three-r128.min.js'),contentType:'application/javascript',headers:{'access-control-allow-origin':'*'}}));
   await page.route('https://challenges.cloudflare.com/**',r=>r.abort());
   await page.goto(base,{waitUntil:'load'});
   await page.waitForFunction(()=>CLOUD.api&&!CLOUD.probing);
   const user='g'+engine.slice(0,1)+viewport.width+Date.now().toString(36).slice(-7);
   await page.locator('#tabReg').click();
   await page.locator('#username').fill(user);await page.locator('#password').fill('PreviewAdventure123!');
   await page.locator('#password2').fill('PreviewAdventure123!');
   await page.locator('#email').fill(user+'@example.test');await page.locator('#authBtn').click();
   await page.locator('#modal').getByRole('button',{name:'Create account',exact:true}).click();
   await page.locator('#modal').getByRole('button',{name:'I saved it — enter the game',exact:true}).click();
   try{await page.locator('#adventureGuide [data-adventure="start"]').waitFor({timeout:30000});}
   catch(e){await page.screenshot({path:path.join(out,engine+'-'+viewport.width+'-failure.png')});console.error({errors,state:await page.evaluate(()=>({loginError:document.getElementById('loginErr')?.textContent,guide:typeof adventureState==='function'?adventureState():null,companion:document.getElementById('adventureGuide')?.outerHTML}))});throw e;}
   assert.ok(await page.evaluate(()=>document.body.classList.contains('social-open')));
   await page.waitForFunction(()=>PGSocial.app.scene?.active,{timeout:60000});
   const box=await page.locator('#adventureGuide').boundingBox();
   assert.ok(box.x>=0&&box.x+box.width<=viewport.width&&box.y>=0&&box.y+box.height<=viewport.height,'companion fits viewport');
   await page.screenshot({path:path.join(out,engine+'-'+viewport.width+'-welcome.png')});
   await page.locator('#adventureGuide [data-adventure="later"]').click();
   await page.reload({waitUntil:'load'});
   await page.waitForFunction(()=>CLOUD.api&&!CLOUD.probing);
   // The app intentionally requires login after a reload.
   await page.locator('#username').fill(user);await page.locator('#password').fill('PreviewAdventure123!');await page.locator('#authBtn').click();
   await page.locator('#adventureGuide [data-adventure="resume"]').waitFor({timeout:30000});
   assert.equal(await page.evaluate(()=>adventureState().status),'deferred');
   await page.locator('#adventureGuide [data-adventure="resume"]').click();
   await page.locator('#adventureGuide [data-adventure="start"]').click();
   await page.locator('#adventureGuide [data-adventure="town"]').click();
   await page.locator('#adventureGuide [data-adventure="field"]').click();
   await page.waitForFunction(()=>!document.body.classList.contains('social-open')&&adventureState().fieldSeen,{timeout:30000});
   await page.waitForFunction(()=>adventureState().step==='stats',{timeout:60000});
   assert.ok(await page.evaluate(()=>S.kills>0),'actual combat delivered a first kill');
   await page.screenshot({path:path.join(out,engine+'-'+viewport.width+'-field.png')});
   await page.locator('#adventureGuide [data-adventure="stats"]').click();
   await page.locator('[data-a="stat"][data-v="str"]').click();
   await page.waitForFunction(()=>adventureState().step!=='stats');
   await page.locator('#adventureGuide [data-adventure="resume"]').click();
   if(await page.evaluate(()=>adventureState().step==='gear'))await page.locator('#adventureGuide [data-adventure="gear-later"]').click();
   assert.equal(await page.evaluate(()=>adventureState().step),'job');
   await page.locator('#adventureGuide [data-adventure="handbook"]').click();
   await page.locator('.adventure-town-grid').waitFor();
   await page.screenshot({path:path.join(out,engine+'-'+viewport.width+'-handbook.png')});
   // Isolated fixture advances only the long level grind; class choice still uses real UI.
   await page.evaluate(()=>{S.jobs.Novice.jl=10;save();adventureAction('resume');});
   await page.locator('#adventureGuide [data-adventure="job"]').click();
   await page.screenshot({path:path.join(out,engine+'-'+viewport.width+'-jobs.png')});
   assert.ok(await page.evaluate(()=>tabs.includes('job')));
   await page.locator('[data-a="selfamily"][data-v="Swordman"]').first().click();
   await page.locator('[data-a="selk"][data-v="Swordman"]').first().click();
   await page.locator('.action-switch-btn[data-a="job"][data-v="Swordman"]').click();
   await page.waitForFunction(()=>S.cls==='Swordman'&&adventureState().step==='skill');
   await page.locator('#adventureGuide [data-adventure="resume"]').click();
   await page.locator('#adventureGuide [data-adventure="skill"]').click();
   // Skip only the long Job EXP wait, not learning or assigning the attack.
   await page.evaluate(()=>{S.jobs.Swordman.jl=5;save();renderWin();});
   await page.locator('[data-a="skill"][data-v="bash"]').click();
   await page.locator('[data-combo-slot="0"]').selectOption('bash');
   await page.waitForFunction(()=>adventureState().step==='ready');
   await page.locator('#adventureGuide [data-adventure="resume"]').click();
   await page.screenshot({path:path.join(out,engine+'-'+viewport.width+'-complete.png')});
   await page.locator('#adventureGuide [data-adventure="finish"]').click();
   assert.equal(await page.evaluate(()=>adventureState().status),'complete');
   assert.equal(await page.locator('#adventureGuide').count(),0);
   assert.deepEqual(errors,[],'no uncaught exceptions');
   console.log(engine+' '+viewport.width+': registration, town, pause/relogin, field, live kill, stats, handbook, class choice, learning, combo and completion passed');
   }catch(e){await page.screenshot({path:path.join(out,engine+'-'+viewport.width+'-failure.png')});console.error(await page.evaluate(()=>({login:document.getElementById('loginErr')?.textContent,modal:document.getElementById('mt')?.textContent,user:currentUser,state:typeof adventureState==='function'?adventureState():null,errors:typeof S==='undefined'?'no S':!!S})));throw e;}finally{await context.close();}
  }
 }finally{await browser.close();await server.close();server.sqlite.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
