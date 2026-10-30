// Real-browser recovery UI check, against a disposable local dev server ONLY.
// Requires playwright-core, @sparticuz/chromium and three, as in the other browser checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const base = new URL(process.env.RECOVERY_TEST_URL || 'http://127.0.0.1:8793');
if (!['127.0.0.1','localhost','[::1]'].includes(base.hostname) || !['http:','https:'].includes(base.protocol) || base.username || base.password)
  throw new Error('Recovery browser tests may only use a disposable loopback server.');
const target=base.origin;
(async()=>{
  const mod=require('@sparticuz/chromium'), bundled=mod.default||mod;
  const pkg=path.resolve(path.dirname(require.resolve('@sparticuz/chromium')),'..');
  const lib=await mod.inflate(path.join(pkg,'bin/al2023.tar.br'));
  process.env.LD_LIBRARY_PATH=path.join(lib,'lib')+':'+(process.env.LD_LIBRARY_PATH||'');
  // Separate browsers avoid the single-process Chromium teardown crash when closing two contexts.
  for (const width of [1440,390]) {
    const name='R'+width+Date.now().toString(36).slice(-7);
    const oldPass='Synthetic-old-password-123!',newPass='Synthetic-new-password-456!';
    const email=name+'@example.test';
    const reg=await fetch(target+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({u:name,p:oldPass,email})});
    assert.equal(reg.status,201,'create disposable account');const code=(await reg.json()).recovery;
    const browser=await chromium.launch({executablePath:await bundled.executablePath(),
      args:[...bundled.args,'--enable-unsafe-swiftshader'],headless:true});
    try {
      const context=await browser.newContext({viewport:{width,height:width===390?844:900}}),page=await context.newPage(),errors=[];
      page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({
        contentType:'application/javascript',body:fs.readFileSync(require.resolve('three/build/three.min.js'))}));
      await page.goto(target+'/',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>typeof CLOUD!=='undefined'&&CLOUD.api);
      await page.click('#recoveryOpen');
      assert.equal(await page.locator('#loginForm').isVisible(),false);
      assert.equal(await page.locator('#authTabs').isVisible(),false);
      assert.equal(await page.locator('#recoveryForm').isVisible(),true);
      await page.click('#recoverClose');
      assert.equal(await page.locator('#loginForm').isVisible(),true,'cancel returns to login');
      await page.click('#recoveryOpen');
      const layout=await page.evaluate(()=>{
        const card=document.querySelector('#loginOverlay .login-card').getBoundingClientRect();
        return [...document.querySelectorAll('#recoveryForm .form-group input')].map(el=>{
          const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,cardLeft:card.left,cardRight:card.right};
        });
      });
      assert.equal(layout.length,5);
      for(const r of layout) assert(r.left>=r.cardLeft-1 && r.right<=r.cardRight+1 && r.width>100,'fields stay within login card');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
      await page.fill('#recoverUser',name);await page.fill('#recoverEmail',email);await page.fill('#recoverCode',code);
      await page.fill('#recoverPassword',newPass);await page.fill('#recoverConfirm','Mismatch-password-456!');
      await page.click('#recoverSubmit');assert.match(await page.locator('#recoverStatus').textContent(),/do not match/i);
      await page.fill('#recoverConfirm',newPass);await page.fill('#recoverCode','WRNG-WRNG-WRNG-WRNG');
      await page.click('#recoverSubmit');await page.waitForFunction(()=>document.querySelector('#recoverStatus').textContent.includes('incorrect'));
      await page.fill('#recoverCode',code);await page.click('#recoverSubmit');
      await page.waitForFunction(()=>!document.querySelector('#recoverySuccess').hidden);
      assert.equal(await page.locator('#recoveryForm').isVisible(),false);
      assert.equal(await page.locator('#loginForm').isVisible(),false,'code remains on screen until acknowledged');
      assert.equal(await page.locator('#recoverNewCode').isVisible(),true);
      assert.match(await page.locator('#recoverNewCode').textContent(),/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/);
      assert.notEqual(await page.locator('#recoverNewCode').textContent(),code);
      await page.click('#recoverDone');
      assert.equal(await page.locator('#loginForm').isVisible(),true,'login returns without refresh');
      assert.equal(await page.locator('#recoverySuccess').isVisible(),false);
      assert.equal(await page.locator('#recoverNewCode').textContent(),'','code is cleared when leaving confirmation');
      assert.equal(await page.locator('#username').inputValue(),name);
      await page.fill('#password',newPass);await page.click('#authBtn');
      await page.waitForFunction(()=>document.querySelector('#loginOverlay').style.display==='none');
      assert.equal(await page.evaluate(()=>CLOUD.on),true);assert.deepEqual(errors,[]);
      console.log(`PASS ${width}px: aligned recovery fields, mismatch/error, new-code confirmation, return and login without refresh`);
    } finally { await browser.close().catch(()=>{}); }
  }
})().catch(e=>{console.error(e);process.exitCode=1});
