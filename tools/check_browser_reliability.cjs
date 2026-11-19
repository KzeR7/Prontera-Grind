// Against dist/ and a disposable local API only. No live credentials, hosted URLs or DO.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, firefox } = require('playwright-core');
const engine = process.argv[2] || 'chromium';
const only = process.argv[3];
const out = process.env.BROWSER_ARTIFACTS || '.tmpcheck/browser-reliability';
const desktop = {width:1280,height:800}, small = {width:390,height:844};
const build = fs.readFileSync('dist/version.txt','utf8').trim();
async function launch() {
  if(engine==='firefox') return firefox.launch({headless:!process.env.HEADED}); // Playwright's matching Firefox build
  if(['chrome','msedge'].includes(engine)) return chromium.launch({channel:engine});
  assert.equal(engine,'chromium');
  const mod=require('@sparticuz/chromium'), sp=mod.default;
  const lib=await mod.inflate(path.resolve(path.dirname(require.resolve('@sparticuz/chromium')),'../bin/al2023.tar.br'));
  return chromium.launch({executablePath:await sp.executablePath(),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
    env:{...process.env,LD_LIBRARY_PATH:path.join(lib,'lib')+':'+(process.env.LD_LIBRARY_PATH||'')}});
}
async function click(p,selector) {
  const control=p.locator(selector).first();
  await p.evaluate(s=>{window.lastControl=null;window.hitExpected=false;window.expectedControl=s},selector);
  if(p.viewportSize().width<500)await control.tap();else await control.click(); // no force, no synthetic dispatch: includes hit-testing/scrolling
  assert(await p.evaluate(()=>window.hitExpected),`click did not reach ${selector}`);
}
async function sceneDraws(p,plaza) {
  // Observe an actual framebuffer immediately after Three renders it, before browser compositing.
  await p.waitForFunction(plaza=>{
    const r=plaza?PGSocial.app.scene?.renderer:R;
    if(!(r instanceof THREE.WebGLRenderer)||r.info.render.calls===0)return false;
    const gl=r.getContext();if(gl.isContextLost())return false;
    if(!r.pixelProbe){const render=r.render;r.pixelProbe={};r.render=function(...args){
      render.apply(this,args);r.render=render;
      const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,buf=new Uint8Array(w*4);
      gl.readPixels(0,Math.floor(h/2),w,1,gl.RGBA,gl.UNSIGNED_BYTE,buf);
      if(new Set(new Uint32Array(buf.buffer)).size>4)r.pixelProbe.ok=true;else delete r.pixelProbe;
    }}return r.pixelProbe?.ok;
  },plaza,{timeout:90000});
}
async function scaledPick(p,viewport) {
  await p.setViewportSize({...viewport,height:viewport.height-48});
  const point=await p.evaluate(()=>{
    const host=document.querySelector('#socialScene'),hub=document.querySelector('#socialHub');
    hub.style.transformOrigin='top left';hub.style.transform='scale(.85)';
    const rect=host.getBoundingClientRect(),proto=THREE.Raycaster.prototype,original=proto.setFromCamera;
    // The visual viewport can finish resizing between tap and pointerup. Use the
    // painted canvas at dispatch, not the earlier rectangle used to aim the tap.
    host.addEventListener('pointerup',e=>{const r=host.querySelector('canvas').getBoundingClientRect();
      window.expectedPick=[2*(e.clientX-r.left)/r.width-1,1-2*(e.clientY-r.top)/r.height];
    },{capture:true,once:true});
    proto.setFromCamera=function(v,c){window.pick=[v.x,v.y];proto.setFromCamera=original;return original.call(this,v,c)};
    for(let y=.35;y<.7;y+=.08)for(let x=.2;x<.9;x+=.08){
      const px=Math.round(rect.left+x*rect.width),py=Math.round(rect.top+y*rect.height);
      if(host.contains(document.elementFromPoint(px,py)))return {px,py};
    }throw Error('No hittable plaza surface');
  });
  if(viewport.width<500)await p.touchscreen.tap(point.px,point.py);else await p.mouse.click(point.px,point.py,{button:'right'});
  await p.waitForFunction(()=>window.pick);
  const [pick,expected]=await p.evaluate(()=>[window.pick,window.expectedPick]);
  assert(expected&&pick.every((v,i)=>Math.abs(v-expected[i])<.005),JSON.stringify({point,pick,expected}));
  await p.evaluate(()=>{document.querySelector('#socialHub').style.transform=''});await p.setViewportSize(viewport);
}
async function contextCycle(p,plaza) {
  await p.evaluate(plaza=>{
    const r=plaza?PGSocial.app.scene.renderer:R;delete r.pixelProbe;
    window.loss=r.getContext().getExtension('WEBGL_lose_context');if(!loss)throw Error('WEBGL_lose_context unavailable');loss.loseContext();
  },plaza);
  const msg=plaza?'#plazaRenderNotice':'#renderNotice';
  await p.locator(msg).filter({hasText:'paused'}).waitFor();
  await p.evaluate(()=>loss.restoreContext());
  await p.locator(msg).waitFor({state:'hidden'});
  await sceneDraws(p,plaza);
}
async function run(base,name,viewport) {
  const browser=await launch(); // distinct temporary profile for each case
  const ctx=await browser.newContext({viewport,hasTouch:viewport.width<500});
  const p=await ctx.newPage(), errors=[], network=new Set();
  const id=`${engine}-${name}-${viewport.width}`, shot=path.join(out,id+'.jpg');
  console.log(id,browser.version(),process.platform,process.arch,build);
  const clean=url=>{const u=new URL(url);return u.protocol==='http:'||u.protocol==='https:'?u.hostname+u.pathname:u.protocol};
  p.on('requestfailed',r=>network.add(`${clean(r.url())} ${r.failure().errorText}`));
  p.on('response',r=>{if(r.status()>=400)network.add(`${clean(r.url())} ${r.status()}`)});
  p.on('pageerror',e=>errors.push(e.message));
  p.setDefaultTimeout(30000);
  try {
    // Deliberately no hosted captcha/BGM services in this disposable test. No stub for Three or either scene.
    await p.route('https://**/*',r=>r.abort('blockedbyclient'));
    await p.addInitScript(()=>document.addEventListener('click',e=>{window.lastControl=e.target.closest('button,[role=button]');window.hitExpected=!!window.expectedControl&&window.lastControl?.matches(window.expectedControl)},true));
    let held;
    if(name==='stalled-optional')await p.route('**/turnstile/v0/api.js',r=>{held=r});
    if(['stalled-town','delayed-town','adopt-town','adopt-town-reject'].includes(name))await p.route('**/assets/social/town/catalog.json',r=>{held=r},{times:1});
    if(name==='stalled-engine')await p.route('**/three-r128.min.js',r=>{held=r},{times:1});
    if(name==='dependency')await p.route('**/three-r128.min.js',r=>r.abort('failed'),{times:1});
    if(name==='no-webgl')await p.addInitScript(()=>{const orig=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(t,...rest){return /webgl/.test(t)?null:orig.call(this,t,...rest)}});
    if(name==='storage')await p.addInitScript(()=>{for(const k of ['localStorage','sessionStorage'])Object.defineProperty(window,k,{get(){throw new DOMException('Storage denied','SecurityError')}})});
    if(name==='offline-chat')await p.addInitScript(()=>{window.WebSocket=class{constructor(){throw new DOMException('Socket denied','SecurityError')}}});
    await p.goto(base,{waitUntil:name==='stalled-engine'?'commit':'domcontentloaded'});
    if(name==='stalled-engine'){
      const retry=p.getByRole('button',{name:'Retry startup'});await retry.waitFor();assert(held);
      await Promise.all([p.waitForNavigation({waitUntil:'domcontentloaded'}),retry.click()]);
      await p.waitForFunction(()=>CLOUD.api);assert.deepEqual(errors,[]);return;
    }
    if(name==='dependency'){
      const retry=p.getByRole('button',{name:'Retry startup'});await retry.waitFor();
      await p.waitForFunction(()=>CLOUD.api);assert(await p.locator('#authBtn').isDisabled());
      await click(p,'#recoveryOpen');assert(await p.locator('#recoveryForm').isVisible());await click(p,'#recoverClose');
      assert.deepEqual(errors,['Startup stopped: Three.js did not load']);errors.length=0;
      await p.screenshot({path:shot,quality:65});await Promise.all([p.waitForNavigation({waitUntil:'domcontentloaded'}),retry.click()]);await p.waitForFunction(()=>CLOUD.api);
      assert.equal(await p.locator('#buildTag').textContent(),'build '+build);assert.deepEqual(errors,[]);return;
    }
    await p.waitForFunction(()=>CLOUD.api);
    assert.equal(await p.locator('#buildTag').textContent(),'build '+build);
    if(name==='stalled-optional'){assert(held);assert.notEqual(await p.evaluate(()=>document.readyState),'complete');await held.abort()}
    await click(p,'#recoveryOpen');assert(await p.locator('#recoveryForm').isVisible());await click(p,'#recoverClose');
    const u='probe'+Date.now().toString(36),pw='SyntheticPreview123!';
    assert.equal((await ctx.request.post(base+'/api/register',{data:{u,p:pw,email:u+'@example.test'}})).status(),201);
    await p.fill('#username',u);await p.fill('#password',pw);await click(p,'#authBtn');
    await p.locator('#adventureGuide').waitFor();
    if(name==='adopt-town'||name==='adopt-town-reject'){
      await p.waitForFunction(()=>PGSocial.app.entering&&PGSocial.app.wanted&&!PGSocial.app.scene);
      assert(held,'required town catalog is pending');
      const canvas=await p.locator('#socialScene canvas').elementHandle();
      const adopted=await p.evaluate(async()=>{
        const old=S,user=currentUser,id=CLOUD.id,epoch=CLOUD.epoch,guide=JSON.stringify(S.handbook);
        if(!CLOUD.on||!id||S.accountId!==id||!sameAccount(S.owner,user))throw Error('Expected an owned, authenticated save');
        await cloudAdopt({blob:JSON.stringify(packSave(S)),version:CLOUD.ver});
        return S!==old&&S.accountId===id&&currentUser===user&&CLOUD.id===id&&CLOUD.epoch===epoch&&JSON.stringify(S.handbook)===guide;
      });
      assert(adopted,'cloudAdopt replaced the same account’s save and kept its milestones');
      if(name==='adopt-town-reject')await held.fulfill({status:503,body:'Test: catalog unavailable'});
      else await held.continue();
      await p.waitForFunction(()=>!PGSocial.app.entering,null,{timeout:60000});
      const state=await p.evaluate(()=>({wanted:PGSocial.app.wanted,visible:!document.querySelector('#socialHub').hidden,active:!!PGSocial.app.scene?.active,notice:document.querySelector('#plazaRenderNotice').textContent}));
      assert(state.visible&&state.wanted,JSON.stringify(state));
      if(name==='adopt-town-reject'){
        assert(await p.locator('#plazaRenderNotice').isVisible());assert.match(state.notice,/could not start.*Field.*retry/i);assert(!state.active);
        assert.equal(await p.locator('#socialScene canvas').count(),0);
        await click(p,'#socialLeave');await sceneDraws(p,false);await click(p,'#socialHubBtn');
      }else{
        assert(state.active,JSON.stringify(state));
        assert(await canvas.evaluate(el=>el===PGSocial.app.scene.renderer.domElement),'same in-flight renderer activated');
      }
      await sceneDraws(p,true);assert.equal(await p.locator('#socialScene canvas').count(),1);
      await p.locator('#plazaRenderNotice').waitFor({state:'hidden'});
      assert.deepEqual(errors,[]);return;
    }
    if(name==='delayed-town'){
      await p.waitForFunction(()=>PGSocial.app.entering);await click(p,'#socialLeave');
      assert(await p.locator('#socialHub').isHidden());
      await click(p,'#socialHubBtn');await click(p,'#socialLeave');await click(p,'#socialHubBtn');
      assert(held);assert(await p.evaluate(()=>PGSocial.app.wanted&&PGSocial.app.entering&&!PGSocial.app.scene),'latest visit still waits on the held scene');
      await held.continue();await sceneDraws(p,true);
      assert.equal(await p.locator('#socialScene canvas').count(),1);
    }
    if(name==='no-webgl'||name==='stalled-town'){await p.locator('#plazaRenderNotice').filter({hasText:'could not start'}).waitFor({timeout:65000});assert.equal(await p.locator('#socialScene canvas').count(),0);if(held)await held.abort()}
    else await sceneDraws(p,true);
    if(name==='offline-chat')assert.match(await p.locator('#socialConnection').textContent(),/unavailable/i);
    await click(p,'[data-adventure="start"]');await click(p,'[data-adventure="town"]');
    await p.waitForFunction(()=>adventureState().step==='field');
    if(name==='journey'){
      if(viewport.width<500){await click(p,'#pgQuests');assert.equal(await p.locator('#pgQuests').getAttribute('aria-expanded'),'true');await click(p,'#pgQuests')}
      await scaledPick(p,viewport);await contextCycle(p,true);
      // Avoid random auto-equips bypassing the manual equipment lesson.
      await p.evaluate(()=>{S.auto=false});
    }
    await click(p,'#socialLeave');await p.waitForFunction(()=>!document.body.classList.contains('social-open')&&!hubFirstPending);
    if(name==='no-webgl'){await p.locator('#renderNotice').waitFor();assert.equal(await p.evaluate(()=>R),null)}
    else{await sceneDraws(p,false);if(name==='journey')await contextCycle(p,false)}
    if(name==='stalled-town'){
      await click(p,'#socialHubBtn');await sceneDraws(p,true);
      assert.equal(await p.locator('#socialScene canvas').count(),1,'retry owns exactly one canvas');
    }
    if(name==='journey'){
      await p.waitForFunction(()=>adventureState().step==='stats'&&S.kills>0,null,{timeout:90000});
      await click(p,'[data-adventure="stats"]');await click(p,'[data-a="stat"][data-v="str"]');
      await p.waitForFunction(()=>adventureState().step==='gear');await click(p,'#adventureGuide [data-adventure="resume"]');
      // Seed only one owned, usable upgrade; no random loot wait or tutorial flag edits.
      await p.evaluate(()=>{S.inv.unshift({...S.eq.weapon,id:77123,name:'Training dagger',val:S.eq.weapon.val+5})});
      await click(p,'[data-adventure="gear"]');assert.equal(await p.evaluate(()=>sub.equip),'equip0');
      await click(p,'[data-a="sub"][data-v="equip:refine"]');
      await p.evaluate(()=>adventureAction('gear'));assert.equal(await p.evaluate(()=>sub.equip),'equip0');
      assert.equal(await p.evaluate(()=>adventureState().step),'gear');
      await click(p,'[data-a="selb"][data-v="77123"]');assert.equal(await p.evaluate(()=>S.eq.weapon.id),1);
      await click(p,'[data-a="equip"][data-v="77123"]');await p.waitForFunction(()=>S.eq.weapon.id===77123&&adventureState().step==='job');
    }
    await p.screenshot({path:shot,quality:65});assert.deepEqual(errors,[]);
  } catch(e){await p.screenshot({path:shot,quality:65,timeout:30000}).catch(()=>{});console.error('first exception:',errors[0]||'none','requests:',[...network],'last click:',await p.evaluate(()=>window.lastControl?.id||window.lastControl?.dataset.a||null).catch(()=>null));throw e}
  finally {await browser.close()}
}
(async()=>{fs.mkdirSync(out,{recursive:true});const {start}=await import('./dev_server.js');const s=await start({port:0});
 try{
   const cases=[['journey',desktop],['journey',small],['dependency',small],['no-webgl',small],['offline-chat',desktop],['storage',small],['stalled-optional',desktop],['stalled-town',desktop],['delayed-town',desktop],['stalled-engine',small],['adopt-town',desktop],['adopt-town-reject',desktop]]
     .filter(([name,vp])=>(!only||name===only)&&(!process.env.WIDTH||vp.width===Number(process.env.WIDTH)));
   assert(cases.length,'No matching browser scenario');
   for(const [name,vp] of cases)await run(`http://127.0.0.1:${s.port}`,name,vp);
   console.log(`PASS ${cases.length} ${engine} browser cases`);
 }finally{await s.close()}
})().then(()=>process.exit(0),e=>{console.error(e);process.exit(1)});
