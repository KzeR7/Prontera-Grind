// Disposable authenticated console check against real handlers and in-memory SQLite.
// PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/browser node tools/check_gm_audit_browser.cjs /output/path
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('url');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const mod=rel=>import(pathToFileURL(path.join(root,rel)).href);
 const {freshDb,makeD1}=await mod('tools/dev_server.js'),db=await mod('functions/_lib/db.js');
 const {tokenHash}=await mod('functions/_lib/auth.js');const sql=freshDb(),D=makeD1(sql);
 await db.insertUser(D,{username:'ReviewOwner',email:null,recoveryHash:null,passHash:'fixture',gm:2});
 await db.insertUser(D,{username:'ReviewPlayer',email:null,recoveryHash:null,passHash:'fixture',gm:0});
 const owner=(await db.userByName(D,'ReviewOwner')).id,id=(await db.userByName(D,'ReviewPlayer')).id;
 const token='b'.repeat(48);await db.insertSession(D,await tokenHash(token),owner,Date.now()+30*86400000,'test',null);
 await db.saveAlertWithEvidence(D,{userId:id,kind:'kill-rate',at:Date.now(),value:150000,threshold:30000,detail:'Synthetic review fixture',ruleVersion:'browser-fixture',evidenceJson:JSON.stringify({rawDelta:10000,credited:5000,unexplained:5000,elapsedMs:120000,rolling:true})});
 await db.logEvent(D,'ReviewOwner',id,'gm-grant','Synthetic activity fixture');
 const out=path.resolve(process.argv[2]||'gm-browser-output');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport});await context.addCookies([{name:'pg_session',value:token,domain:'game.test',path:'/',secure:true}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://game.test/**',async route=>{
   const r=route.request(),url=new URL(r.url());
   if(url.pathname==='/gm.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'gm.html'),'utf8')});
   if(!url.pathname.startsWith('/api/'))return route.fulfill({status:404,body:'Not found'});
   try{const handler=await mod('functions'+url.pathname+'.js');const result=await handler[r.method()==='POST'?'onRequestPost':'onRequestGet']({request:new Request(r.url(),{method:r.method(),headers:await r.allHeaders(),...(r.postData()?{body:r.postData()}:{})}),env:{DB:D}});await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:await result.text()});}
   catch(e){await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({err:e.message})});}
  });
  await page.goto('https://game.test/gm.html');await page.waitForFunction(()=>document.querySelector('#auditlist button[data-audit-player]'));
  await page.locator('[data-nav="reviews"]').click();await page.locator('#auditlist details').evaluate(e=>e.open=true);
  assert.match(await page.locator('#auditlist').innerText(),/Raw gain: 10,000/);
  await page.locator('#auditlist [data-audit-player]').click();await page.locator('[data-tab="damage"]').click();
  await page.waitForFunction(()=>document.querySelector('#tabbody details'));
  await page.locator('#tabbody details').evaluate(e=>e.open=true);assert.match(await page.locator('#tabbody').innerText(),/Credited: 5,000/);
  assert.match(await page.locator('#tabbody').innerText(),/30,000 kills\/hr/);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,'player-'+viewport.width+'.png'),fullPage:true});
  await page.locator('[data-nav="activity"]').click();await page.waitForFunction(()=>document.getElementById('activitybody').textContent.includes('Synthetic activity fixture'));
  const bounds=await page.locator('#activitycard').boundingBox(),content=await page.locator('.gm-content').boundingBox();assert.ok(bounds.width>=content.width-2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page must not overflow horizontally');
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,'activity-'+viewport.width+'.png'),fullPage:true});assert.deepEqual(errors,[]);
  console.log('ok console evidence, Reviews → Players, Activity layout:',viewport.width);await context.close();
 }}finally{await browser.close();sql.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
