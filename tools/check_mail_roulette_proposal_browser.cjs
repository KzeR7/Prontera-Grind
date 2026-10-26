// Browser regression + reproducible visuals for the isolated UI proposal, not the live game.
// node tools/check_mail_roulette_proposal_browser.cjs [base URL] [--capture]
// Dependencies: npm install --no-save --package-lock=false playwright @sparticuz/chromium jsdom three@0.128.0 ws
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {chromium} = require('playwright');
const moduleChromium = require('@sparticuz/chromium');
const bundled = moduleChromium.default || moduleChromium;
const root = path.resolve(__dirname, '..');
const base = process.argv.find(x=>/^https?:\/\//.test(x)) || 'http://127.0.0.1:8000';
const capture = process.argv.includes('--capture');
const out = path.join(root, 'docs/proposals/mail-roulette-2026-10-26');
const scratch = path.join(root, '.arena/ui-review');
const source = fs.readFileSync(path.join(root,'index.html'),'utf8');
const start = source.indexOf('const DAILY_WHEEL_SEGMENTS=') + 'const DAILY_WHEEL_SEGMENTS='.length;
const realRewards = JSON.parse(JSON.stringify(vm.runInNewContext('('+source.slice(start,source.indexOf('\n];',start)+2)+')')));
let passed = 0;
const report = {checks:[],viewports:[],captures:[],errors:[],failedRequests:[]};
const canonical = rows => rows.map(r=>Object.fromEntries(['id','resource','amount','buff','durationMin','pct','rate','zeny','randomCard'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])));

(async () => {
  fs.mkdirSync(scratch,{recursive:true});
  if (capture) fs.mkdirSync(out,{recursive:true});
  // The npm-distributed headless Chromium includes its Linux shared libraries.
  const pkg = path.resolve(path.dirname(require.resolve('@sparticuz/chromium')),'..');
  const lib = await moduleChromium.inflate(path.join(pkg,'bin/al2023.tar.br'));
  process.env.LD_LIBRARY_PATH = path.join(lib,'lib')+':'+(process.env.LD_LIBRARY_PATH||'');
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || await bundled.executablePath(),args:bundled.args,headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1020},deviceScaleFactor:1,reducedMotion:'reduce'});
    await context.addInitScript(() => {
      localStorage.setItem('proposal-check-sentinel','unchanged');
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key,value) {
        if (key !== 'proposal-check-sentinel') throw Error('Proposal tried to persist state: '+key);
        return setItem.call(this,key,value);
      };
    });
    const page = await context.newPage();
    await page.clock.install({time:new Date('2026-10-26T06:30:00Z')});
    const requests = [];
    page.on('pageerror',error=>report.errors.push(error.message));
    page.on('request',request=>requests.push({url:request.url(),method:request.method()}));
    page.on('requestfailed',request=>report.failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
    page.on('response',response=>{if(response.status()>=400)report.errors.push(`${response.status()} ${response.url()}`);});
    await page.goto(`${base}/tools/mail-roulette-proposal/index.html`);
    await page.evaluate(()=>document.fonts.ready);
    const diag = () => page.evaluate(()=>PGMailProposal.diagnostics());
    const settle = () => page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const view = async name => {await page.locator('#tab-'+name).click();await settle();};
    const reset = async () => {await page.locator('#resetDemo').click();await settle();};
    const check = async (name,fn) => {await fn();passed++;report.checks.push(name);console.log('ok '+name);};
    const noOverflow = async () => {
      const size = await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
      assert(size.document<=size.viewport+1,`Document overflows: ${JSON.stringify(size)}`);
    };
    const effectsHaveNoFrame = async () => {
      const surfaces=await page.locator('#effectsAnchor, #effectsTray, .effects-list, .effect-group, .effect-button, .effect-tile').evaluateAll(nodes=>nodes.map(el=>{
        const style=getComputedStyle(el);
        return {name:el.id||el.className,background:style.backgroundColor,image:style.backgroundImage,shadow:style.boxShadow,borders:['Top','Right','Bottom','Left'].map(side=>style[`border${side}Width`])};
      }));
      assert(surfaces.length>0);
      for(const surface of surfaces){
        assert.equal(surface.background,'rgba(0, 0, 0, 0)',surface.name+' has no background');
        assert.equal(surface.image,'none',surface.name+' has no panel gradient');
        assert.equal(surface.shadow,'none',surface.name+' has no box shadow');
        assert.deepEqual(surface.borders,['0px','0px','0px','0px'],surface.name+' has no frame');
      }
      assert.equal(await page.locator('.effects-heading, #effectCount, #hudEmptyNote, #placementNote').count(),0,'No panel heading, count or empty-state placeholder exists');
    };
    const rewardTextFits = async () => {
      const clipped = await page.locator('.reward-copy b, .reward-copy small, .reward-rate b').evaluateAll(nodes=>nodes.filter(el=>el.scrollWidth>el.clientWidth+1 || el.scrollHeight>el.clientHeight+1 || getComputedStyle(el).textOverflow==='ellipsis').map(el=>({text:el.textContent,client:[el.clientWidth,el.clientHeight],scroll:[el.scrollWidth,el.scrollHeight]})));
      assert.deepEqual(clipped,[],'No reward label, description or percentage is clipped');
      const collisions = await page.locator('.reward-row').evaluateAll(rows=>rows.filter(row=>row.querySelector('.reward-copy').getBoundingClientRect().right>row.querySelector('.reward-rate').getBoundingClientRect().left).map(row=>row.dataset.reward));
      assert.deepEqual(collisions,[],'Reward copy has its own column, separate from the odds');
    };

    await check('proposal uses the live reward pool, quantities, odds and buff durations without balance edits',async()=>{
      assert.deepEqual(canonical((await diag()).rewards),canonical(realRewards));
      assert.equal((await diag()).rewards.reduce((sum,r)=>sum+r.rate,0),100);
      assert.match(fs.readFileSync(path.join(root,'functions/_lib/validate.js'),'utf8'),/text\.length > 500/,'GM character budget still matches the API');
    });
    await check('mail separates list, reading pane and filters; opening one message does not read the rest',async()=>{
      assert.equal(await page.locator('.mail-item').count(),6);
      assert.equal(await page.locator('.mail-reader').isVisible(),true);
      assert.equal(await page.locator('#composerForm').count(),0);
      assert.equal((await diag()).unread,3);
      await page.locator('[data-message="event-gift"]').click();
      assert.equal((await diag()).unread,2);
      assert.equal((await diag()).messages.find(m=>m.id==='daily-notice').read,false);
      assert.match(await page.locator('#letterTitle').textContent(),/A gift for your next adventure/);
    });
    await check('mail search retains focus and filters safely, including a useful empty state',async()=>{
      await page.locator('#mailSearch').fill('refinement');
      assert(await page.locator('.mail-item').count()>0);
      assert.equal(await page.locator('#mailSearch').evaluate(el=>el===document.activeElement),true);
      await page.locator('#mailSearch').fill('<img src=x onerror=alert(1)>');
      assert.equal(await page.locator('.mail-item').count(),0);
      assert.match(await page.locator('#mailList').textContent(),/No matching messages/);
      assert.equal(await page.locator('#mailList img').count(),0);
      await page.locator('[data-action="clear-filter"]').click();
      assert.equal(await page.locator('#mailSearch').inputValue(),'');
      assert.equal(await page.locator('.mail-item').count(),6);
    });
    await check('mark-all-read never claims a reward; individual and bulk claims cannot repeat',async()=>{
      await reset();
      await page.locator('[data-action="read-all"]').click();
      assert.equal((await diag()).unread,0);
      assert.equal((await diag()).unclaimed,2);
      await page.locator('[data-claim="maintenance"]').click();
      assert.equal((await diag()).unclaimed,1);
      assert.equal(await page.locator('[data-claim="maintenance"]').count(),0);
      assert.equal(await page.locator('#claimDone').isVisible(),true);
      await page.locator('[data-filter="rewards"]').click();
      assert.equal(await page.locator('.mail-item').count(),1);
      await page.locator('[data-action="claim-all"]').click();
      assert.equal((await diag()).unclaimed,0);
      assert.equal(await page.locator('[data-action="claim-all"]').isDisabled(),true);
      assert.match(await page.locator('#mailList').textContent(),/All gifts claimed/);
      await page.locator('[data-filter="all"]').click();
      assert.equal(await page.locator('.mail-item').count(),6,'Claimed messages remain in history');
    });
    await check('desktop roulette is larger, all seven descriptions wrap, and reserve/active-buff panels are absent',async()=>{
      await view('roulette'); await reset();
      assert((await page.locator('.game-window').boundingBox()).width>=1100);
      assert((await page.locator('.wheel-stage').boundingBox()).width>=390);
      assert.equal(await page.locator('.reward-row').count(),7);
      assert.deepEqual(await page.locator('.reward-row').evaluateAll(rows=>rows.map(r=>Number(r.dataset.rate))),[33,33,11,11,7,4,1]);
      assert.equal(await page.locator('.roulette-mat-stock, .roulette-window .effects-tray, .minimap-buff-pill').count(),0);
      assert.doesNotMatch(await page.locator('.roulette-window').textContent(),/YOUR RESERVES|ACTIVE BUFFS/i);
      await rewardTextFits(); await noOverflow();
      await page.locator('[data-reward="buff_exp"] .reward-copy b').evaluate(el=>el.textContent+=' — long-description stress test with a very long localized reward name');
      await page.locator('[data-reward="buff_exp"] .reward-copy small').evaluate(el=>el.textContent+=' Extra detail is allowed to wrap onto additional lines; it must never be hidden or overlap the percentage.');
      await rewardTextFits();
      await reset();
    });
    await check('one scripted demo spin activates one EXP effect in the shared lower HUD, without an extra roulette buff section',async()=>{
      await page.locator('#spinButton').click();
      await page.waitForFunction(()=>PGMailProposal.diagnostics().spin==='done');
      assert.equal(await page.locator('#spinButton').isDisabled(),true);
      assert.equal((await diag()).effects.filter(e=>e.id==='daily-exp').length,1);
      assert.equal((await diag()).effects.find(e=>e.id==='daily-exp').remaining,1800000);
      assert.equal(await page.locator('.reward-row.is-won').getAttribute('data-reward'),'buff_exp');
      assert.equal(await page.locator('.roulette-window .effects-tray').count(),0);
      await view('buffs');
      assert.equal(await page.locator('#effectsTray [data-effect]').count(),4);
      assert.equal(await page.locator('#effectsTray [data-effect="daily-exp"] .effect-time').textContent(),'30:00');
      assert.equal(await page.locator('.mock-tools [data-effect]').count(),0);
      const strip = await page.locator('#effectsTray').boundingBox(), dock = await page.locator('.mock-dock').boundingBox();
      assert(strip.y+strip.height<dock.y,'Buff tray sits above the lower dock');
    });
    await check('active buffs retain the current floating-icon look without panel, tile backgrounds or frames',async()=>{
      await effectsHaveNoFrame();
      assert.equal(await page.locator('#effectTooltip').isHidden(),true,'No popup opens on its own');
      assert.deepEqual(await page.locator('.effect-tile').evaluateAll(nodes=>nodes.map(el=>Math.round(el.getBoundingClientRect().width))),[38,38,38,38],'Keep current 38px artwork size');
      assert.equal(await page.locator('.effect-button').evaluateAll(nodes=>nodes.every(el=>el.getBoundingClientRect().width>=44&&el.getBoundingClientRect().height>=44)),true,'Transparent touch targets remain usable');
      assert.equal(await page.locator('.effect-tile').evaluateAll(nodes=>nodes.every(el=>getComputedStyle(el,'::after').content==='none')),true,'No tile frame or progress rail is drawn');
    });
    await check('No buffs leaves no visible buff UI or placeholder and does not move the dock',async()=>{
      const dock=await page.locator('.mock-dock').boundingBox();
      await page.locator('[data-scenario="empty"]').click(); await settle();
      assert.equal((await diag()).effects.length,0);
      assert.equal(await page.locator('#effectsAnchor').boundingBox(),null);
      assert.equal(await page.locator('#effectsTray').isHidden(),true);
      assert.equal(await page.locator('#effectTooltip').isHidden(),true);
      assert.equal(await page.locator('[data-effect]').count(),0);
      assert.equal(await page.locator('#hudEmptyNote, #placementNote, .effects-heading').count(),0);
      assert.doesNotMatch(await page.locator('.hud-scene').innerText(),/No active effects|ACTIVE EFFECTS|0 active/);
      assert.deepEqual(await page.locator('.mock-dock').boundingBox(),dock,'No empty buff panel reserves layout space');
      await page.locator('[data-scenario="all"]').click(); await settle();
      assert.equal(await page.locator('[data-effect]').count(),4);
      assert.equal(await page.locator('#effectTooltip').isHidden(),true);
      await effectsHaveNoFrame();
    });
    await check('hover popup has a 65%-opaque background, readable text, and dismisses on pointer leave or keyboard blur',async()=>{
      await page.locator('[data-effect="daily-exp"]').hover();
      assert.equal(await page.locator('#effectTooltip').isVisible(),true);
      const style=await page.locator('#effectTooltip').evaluate(el=>({background:getComputedStyle(el).backgroundColor,opacity:getComputedStyle(el).opacity,textOpacity:getComputedStyle(el.querySelector('p')).opacity}));
      assert.equal(style.background,'rgba(17, 29, 41, 0.65)');
      assert.equal(style.opacity,'1','Do not fade the text with the surface');
      assert.equal(style.textOpacity,'1');
      await effectsHaveNoFrame();
      const popup=await page.locator('#effectTooltip').boundingBox();
      await page.mouse.move(popup.x+popup.width/2,popup.y+popup.height/2,{steps:5});
      assert.equal(await page.locator('#effectTooltip').isVisible(),true,'The popup remains hoverable');
      await page.mouse.move(0,0);
      assert.equal(await page.locator('#effectTooltip').isHidden(),true);
      await page.locator('[data-effect="daily-exp"]').focus();
      assert.equal(await page.locator('#effectTooltip').isVisible(),true);
      await page.locator('[data-scenario="all"]').focus();
      assert.equal(await page.locator('#effectTooltip').isHidden(),true);
    });
    await check('pet and roulette tooltips support focus/tap/Escape with original pet icon paths',async()=>{
      await page.locator('[data-effect="warcry"]').focus();
      assert.match(await page.locator('#effectTooltip').textContent(),/Player ATK \+15%/);
      assert.equal(await page.locator('[data-effect="warcry"] img').getAttribute('src'),'/assets/skill-icons/extra/pet_warcry.png');
      assert.equal(await page.locator('[data-effect="vital"] img').getAttribute('src'),'/assets/skill-icons/extra/pet_vital.png');
      await page.locator('[data-effect="daily-zeny"]').click();
      assert.match(await page.locator('#effectTooltip').textContent(),/Daily roulette/i);
      assert.match(await page.locator('#effectTooltip').textContent(),/30% more Zeny/);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#effectTooltip').isHidden(),true);
    });
    await check('countdowns preserve a surviving focused tile; expired effects and the empty tray disappear',async()=>{
      await page.locator('[data-scenario="expiring"]').click();
      await page.locator('[data-action="toggle-timers"]').click();
      await page.locator('[data-effect="vital"]').focus();
      await page.evaluate(()=>window.__focusedEffect=document.activeElement);
      await page.clock.fastForward(5000);
      assert.equal(await page.locator('[data-effect="warcry"]').count(),0);
      assert.equal(await page.evaluate(()=>window.__focusedEffect===document.activeElement),true);
      assert.equal(await page.locator('[data-effect="vital"]').isVisible(),true);
      await page.clock.fastForward(25000);
      assert.equal((await diag()).effects.length,0);
      assert.equal(await page.locator('#effectsTray').isHidden(),true);
      assert.equal(await page.locator('#effectTooltip').isHidden(),true);
      assert.equal(await page.locator('#hudEmptyNote').count(),0,'Expiry must not replace the icons with an empty-state box');
      assert.equal(await page.locator('#effectsAnchor').boundingBox(),null);
      await page.locator('[data-scenario="all"]').click();
      assert.equal((await diag()).effects.length,4);
      assert.equal((await diag()).paused,true);
    });
    await check('GM preview escapes plain text and retains a draft between views; a single-player audience must be named',async()=>{
      await view('gm'); await reset();
      await page.locator('[data-audience="player"]').click();
      assert.equal(await page.locator('#gmRecipient').isVisible(),true);
      assert.equal(await page.locator('#composerForm').evaluate(form=>form.checkValidity()),false);
      await page.locator('#gmRecipient').fill('Demo Adventurer');
      await page.locator('#gmHeadline').fill('<img src=x onerror=alert(1)>');
      assert.equal(await page.locator('#draftPreview img').count(),0);
      assert.match(await page.locator('#draftPreview h3').textContent(),/<img/);
      await page.locator('#gmHeadline').fill('A gift for Demo Adventurer');
      await page.locator('#gmBody').fill('A private test message. This is not a real send.');
      await page.locator('#gmGift').selectOption('zeny');
      await page.locator('#gmAmount').fill('500000');
      await view('mail'); await view('gm');
      assert.equal(await page.locator('#gmHeadline').inputValue(),'A gift for Demo Adventurer');
      assert.equal(await page.locator('#gmRecipient').inputValue(),'Demo Adventurer');
      assert.match(await page.locator('#draftPreview').textContent(),/500,000 Zeny/);
    });
    await check('GM validation respects the existing 500-character body budget and positive integer gift quantity',async()=>{
      await page.locator('#gmHeadline').fill('x'.repeat(100));
      await page.locator('#gmBody').fill('x'.repeat(450));
      assert.equal(await page.locator('#composerForm').evaluate(form=>form.checkValidity()),false);
      await page.locator('#reviewSend').click();
      assert.equal(await page.locator('#sendDialog').evaluate(d=>d.open),false);
      await page.locator('#gmHeadline').fill('A gift for Demo Adventurer');
      await page.locator('#gmBody').fill('A private test message. This is not a real send.');
      for (const quantity of ['0','-1','1.5','1000000001']) {
        await page.locator('#gmAmount').fill(quantity);
        assert.equal(await page.locator('#composerForm').evaluate(form=>form.checkValidity()),false,quantity+' is invalid');
      }
      await page.locator('#gmAmount').fill('500000');
      assert.equal(await page.locator('#composerForm').evaluate(form=>form.checkValidity()),true);
    });
    await check('GM review requires confirmation; cancel/Escape retain the draft and a confirm adds only a demo message',async()=>{
      const before = (await diag()).messages.length;
      await page.locator('#reviewSend').click();
      assert.equal(await page.locator('#sendDialog').evaluate(d=>d.open),true);
      assert.match(await page.locator('#sendSummary').textContent(),/Demo Adventurer/);
      assert.match(await page.locator('#sendSummary').textContent(),/500,000 Zeny/);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#sendDialog').evaluate(d=>d.open),false);
      assert.equal((await diag()).messages.length,before);
      assert.equal(await page.locator('#reviewSend').evaluate(el=>document.activeElement===el),true);
      await page.locator('#reviewSend').click();
      await page.locator('#confirmDemoSend').click();
      await page.waitForFunction(()=>PGMailProposal.diagnostics().sent===1);
      assert.equal((await diag()).messages.length,before+1);
      await view('mail');
      assert.match(await page.locator('#mailReader').textContent(),/A gift for Demo Adventurer/);
      assert.match(await page.locator('#mailReader').textContent(),/500,000 Zeny/);
      await view('gm');
      await page.locator('#gmGift').selectOption('none');
      assert.equal(await page.locator('#gmAmount').isDisabled(),true);
      assert.match(await page.locator('#draftPreview').textContent(),/no attachment/);
    });
    await check('view tabs support roving keyboard navigation, and narrow layouts do not overflow',async()=>{
      await page.locator('#tab-mail').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal((await diag()).view,'roulette');
      assert.equal(await page.locator('#tab-roulette').getAttribute('tabindex'),'0');
      await page.keyboard.press('End'); assert.equal((await diag()).view,'gm');
      await page.keyboard.press('Home'); assert.equal((await diag()).view,'mail');
      for (const width of [320,390,768,1280,1440]) {
        await page.setViewportSize({width,height:900});
        for (const screen of ['mail','roulette','buffs','gm']) {
          await view(screen); await reset(); await noOverflow();
          if (screen==='roulette') await rewardTextFits();
          if (screen==='buffs') {
            const player=await page.locator('.mock-player').boundingBox(), tools=await page.locator('.mock-tools').boundingBox();
            assert(player.x+player.width<=tools.x+1,`Top HUD overlaps at ${width}`);
            assert.equal(await page.locator('#effectTooltip').isHidden(),true);
            await effectsHaveNoFrame();
            await page.locator('[data-effect="daily-exp"]').focus();
            const tooltip=await page.locator('#effectTooltip').boundingBox();
            assert(tooltip.x>=0 && tooltip.x+tooltip.width<=width,`Tooltip outside viewport at ${width}`);
            await page.locator('[data-scenario="empty"]').click(); await settle();
            assert.equal(await page.locator('#effectsAnchor').boundingBox(),null,`No empty buff frame at ${width}px`);
            assert.equal(await page.locator('#hudEmptyNote').count(),0);
          }
          report.viewports.push(`${width}px/${screen}`);
        }
      }
    });
    await check('phone mail navigates list → detail → back; phone reward descriptions stay fully readable',async()=>{
      await page.setViewportSize({width:390,height:844});
      await view('mail'); await reset();
      assert.equal(await page.locator('.mail-reader').isHidden(),true);
      await page.locator('[data-message="maintenance"]').click();
      assert.equal(await page.locator('.mail-list-panel').isHidden(),true);
      assert.equal(await page.locator('.mail-reader').isVisible(),true);
      assert.equal(await page.locator('.mobile-back').isVisible(),true);
      await page.locator('[data-claim="maintenance"]').click();
      assert.equal((await diag()).unclaimed,1);
      await page.locator('.mobile-back').click();
      assert.equal(await page.locator('.mail-list-panel').isVisible(),true);
      await view('roulette'); await rewardTextFits(); await noOverflow();
      // The container breakpoint must also work in the desktop phone-width simulator.
      await page.setViewportSize({width:1440,height:1020});
      await page.locator('[data-device="phone"]').click();
      await page.waitForFunction(()=>Math.round(document.getElementById('previewStage').getBoundingClientRect().width)===390);
      assert.equal(Math.round((await page.locator('#previewStage').boundingBox()).width),390);
      await rewardTextFits();
      await page.locator('[data-device="desktop"]').click();
      await page.waitForFunction(()=>document.getElementById('previewStage').getBoundingClientRect().width>1100);
    });
    await check('reload resets only demo state; all resources are local and no API, save or account is touched',async()=>{
      await page.reload();
      assert.equal((await diag()).sent,0);
      assert.equal((await diag()).unclaimed,2);
      assert.equal((await diag()).spin,'ready');
      assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage))),{'proposal-check-sentinel':'unchanged'});
      assert(requests.every(r=>r.method==='GET' && r.url.startsWith(base+'/')),'Only same-origin static GETs');
      assert(!requests.some(r=>new URL(r.url).pathname.startsWith('/api/')),'No account or GM API calls');
      assert.deepEqual(report.errors,[]);
      assert.deepEqual(report.failedRequests,[]);
    });

    if (capture) {
      await page.setViewportSize({width:1440,height:1020});
      for (const [name,file] of [['mail','01-mail.png'],['roulette','02-roulette.png'],['buffs','03-shared-buffs.png'],['gm','04-gm-studio.png']]) {
        await view(name); await reset();
        await page.evaluate(()=>document.fonts.ready);
        if(name==='buffs'){
          await page.locator('.game-window').screenshot({path:path.join(out,'03-floating-buffs.png')});
          report.captures.push({file:'03-floating-buffs.png',state:'Active icons only; tooltip closed'});
          await page.locator('[data-effect="daily-exp"]').hover();
        }
        await page.locator('.game-window').screenshot({path:path.join(out,file)});
        const dimensions = await page.locator('.game-window').boundingBox();
        report.captures.push({file,width:Math.ceil(dimensions.width),height:Math.ceil(dimensions.height)});
        await page.screenshot({path:path.join(scratch,name+'-review.png'),fullPage:true});
        if(name==='buffs'){
          await page.locator('[data-scenario="empty"]').click(); await settle();
          await page.locator('.game-window').screenshot({path:path.join(out,'03-no-buffs.png')});
          report.captures.push({file:'03-no-buffs.png',state:'No buffs; no panel, popup, label or placeholder'});
        }
      }
      await page.setViewportSize({width:390,height:844});
      await view('roulette'); await reset();
      await page.locator('.game-window').screenshot({path:path.join(out,'05-roulette-phone.png')});
      const dimensions=await page.locator('.game-window').boundingBox();
      report.captures.push({file:'05-roulette-phone.png',width:Math.ceil(dimensions.width),height:Math.ceil(dimensions.height)});
      await view('mail'); await page.locator('[data-message="maintenance"]').click();
      await page.screenshot({path:path.join(scratch,'mail-phone-review.png'),fullPage:true});
      await view('buffs');
      await page.screenshot({path:path.join(scratch,'buffs-phone-default-review.png'),fullPage:true});
      await page.locator('[data-effect="daily-exp"]').focus();
      await page.screenshot({path:path.join(scratch,'buffs-phone-review.png'),fullPage:true});
      await page.locator('[data-scenario="empty"]').click(); await settle();
      await page.screenshot({path:path.join(scratch,'buffs-phone-empty-review.png'),fullPage:true});
      await view('gm');
      await page.screenshot({path:path.join(scratch,'gm-phone-review.png'),fullPage:true});
      const reviewPage = await context.newPage();
      await reviewPage.emulateMedia({media:'print'});
      await reviewPage.goto(`${base}/tools/mail-roulette-proposal/review.html`);
      await reviewPage.evaluate(()=>document.fonts.ready);
      assert.equal(await reviewPage.locator('.page').count(),4);
      assert.equal(await reviewPage.locator('.visual img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0)),true,'Every PDF visual loads');
      const pdf = await reviewPage.pdf({path:path.join(out,'mail-roulette-proposal.pdf'),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
      const pdfPages = (pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;
      assert.equal(pdfPages,4,'PDF contains exactly four pages');
      report.reviewPdf={file:'mail-roulette-proposal.pdf',pages:pdfPages,bytes:pdf.length};
      await reviewPage.screenshot({path:path.join(scratch,'print-review.png'),fullPage:true});
      await reviewPage.close();
    }
    report.passed=passed;
    report.scope='Real Chromium DOM/layout checks on an in-memory proposal. No integration, real rewards, real GM delivery, GPU gameplay or physical-phone performance claimed.';
    fs.writeFileSync(path.join(scratch,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(`\n${passed} proposal checks passed; ${report.viewports.length} responsive screen/viewport combinations; ${report.errors.length} page/resource errors.`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
