// Browser check for the integrated "Royal Dispatch" mail, roulette, shared-buff and GM
// studio UI in the real game (index.html), not the proposal prototype.
//
// Dependencies (install together so npm does not prune the other optional packages):
//   npm install --no-save --package-lock=false playwright @sparticuz/chromium jsdom three@0.128.0 ws
//
// Run against the disposable GM server described in docs/TESTING.md:
//   node tools/dev_server.js --gm-all --port 8788
//   node tools/check_mail_roulette_integration_browser.cjs http://127.0.0.1:8788 [--capture]
//
// Verifies layout and flow at five viewports: no horizontal overflow, no clipped reward
// text, the 408px wheel, the removed reserves panel, buffs in the shared HUD strip and the
// separate GM studio. Add --capture to write screenshots into .arena/ui-review/ (ignored).
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const moduleChromium=require('@sparticuz/chromium');
const bundled=moduleChromium.default||moduleChromium;
const root=path.resolve(__dirname,'..');
const base=process.argv.find(x=>/^https?:\/\//.test(x))||'http://127.0.0.1:8788';
const capture=process.argv.includes('--capture');
const outDir=path.join(root,'.arena/ui-review');
let checks=0;
const ok=(cond,msg)=>{assert.ok(cond,msg);checks++;console.log('  ok  '+msg)};
const eq=(a,b,msg)=>{assert.equal(a,b,msg);checks++;console.log('  ok  '+msg)};

(async()=>{
  if(capture)fs.mkdirSync(outDir,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||await bundled.executablePath(),args:bundled.args,headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  const pageErrors=[],failedRequests=[];
  page.on('pageerror',e=>pageErrors.push(String(e)));
  page.on('requestfailed',r=>failedRequests.push(r.url()+' '+(r.failure()?.errorText||'')));

  const u='dispatch'+Date.now().toString(36),p='preview-pass-1';
  await page.goto(base+'/');
  await page.waitForFunction(()=>typeof CLOUD!=='undefined'&&CLOUD.api,null,{timeout:60000});
  await context.request.delete(base+'/api/sessions');
  await page.locator('#username').fill(u);
  await page.locator('#password').fill(p);
  await page.locator('#authBtn').click();
  await page.waitForFunction(()=>typeof S!=='undefined'&&S&&document.getElementById('loginOverlay').style.display==='none',null,{timeout:60000});

  // A realistic inbox: one legacy single-line notice, one announcement with an unclaimed
  // gift, one long event notice, and two live roulette boosts.
  await page.evaluate(()=>{
    S.gm=true;S.auto=false;S.ore.ori=1240;S.ore.elu=880;S.zeny=4250000;S.refineScrolls=3;
    S.cards=[{n:'Poring Card'}];
    const now=Date.now();
    S.mail=[
      {id:'srv:3',kind:'event',from:'Horizon Haven team',at:now-3600e3,read:false,
       body:'Weekend refinement festival\n\nHello adventurer,\n\nEvery refinement scroll spent this weekend returns one Echo Shard, and the Prontera forge stays open until Sunday night.\n\nBring your armour.\n\n— The Horizon Haven team',
       gift:{grantId:null,kind:'gift',payload:{resource:'refineScrolls',amount:2},label:'2 × Refine Protection Scroll',claimed:false}},
      {id:'srv:2',kind:'notice',from:'Horizon Haven team',at:now-86400e3,read:true,
       body:'Maintenance complete\n\nThe fields are open again. Thank you for your patience.',gift:null},
      {id:'welcome-1',kind:'welcome',from:'Horizon Haven',at:now-172800e3,read:true,
       body:'Welcome to Horizon Haven! Official announcements, event notices, and GM gifts are delivered here in announcement form. Spin the Daily Reward Roulette every day for free ores, boosts, Zeny, cards, and scrolls!',gift:null}
    ];
    S.dailyWheel={day:trialDay(),spun:0,lastReward:null,totalSpins:0,
      buffs:{zenyUntil:Date.now()+21*60000,expUntil:Date.now()+27*60000}};
    ui();
  });

  const noOverflow=async(sel,label)=>{
    const bad=await page.locator(sel).evaluateAll(nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.className||n.tagName));
    eq(bad.length,0,label+(bad.length?' — overflowing: '+bad.join(', '):''));
  };
  const shot=async name=>{if(capture)await page.screenshot({path:path.join(outDir,name),fullPage:false})};

  console.log('\nMail');
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>openMailDaily('mail'));
  await page.waitForSelector('.rd-mail-layout');
  ok(await page.locator('#mailDailyModal .mail-daily-card').evaluate(n=>Math.round(n.getBoundingClientRect().width))>=1180,
    'the desktop card is the proposed ~1184px panel');
  eq(await page.locator('.rd-filters button').count(),3,'All mail, Notices and Rewards filters');
  eq(await page.locator('.rd-item').count(),3,'three messages indexed');
  ok(await page.locator('[data-a=gmcomposemail]').count()===0,'no GM form inside player mail');
  ok(await page.locator('[data-a=opengmstudio]').count()===1,'a GM sees the Compose entry instead');
  await noOverflow('#mailDailyBody','mail body has no horizontal overflow');
  await noOverflow('.rd-item','.mail index rows do not overflow');
  await page.locator('.rd-item').first().click();
  await page.waitForSelector('.rd-attachment');
  ok(await page.locator('.rd-reader .rd-copy').evaluate(n=>n.getBoundingClientRect().height)>40,
    'the letter body is laid out at reading size');
  ok(await page.locator('[data-a=claimmail]').count()===1,'the claim action sits at the foot of the letter');
  await shot('game-01-mail-1440.png');

  await page.locator('#mailSearch').fill('refinement');
  eq(await page.locator('.rd-item').count(),1,'search narrows the index');
  eq(await page.locator('#mailSearch').inputValue(),'refinement','the search box keeps what was typed');
  await page.locator('#mailSearch').fill('');
  await page.locator('[data-a=mailfilter][data-v=rewards]').click();
  eq(await page.locator('.rd-item').count(),1,'Rewards shows only the unclaimed gift');
  await page.locator('[data-a=mailfilter][data-v=all]').click();
  await shot('game-02-mail-rewards-1440.png');

  console.log('\nDaily roulette');
  await page.evaluate(()=>openMailDaily('daily'));
  await page.waitForSelector('#dailyRouletteWheel');
  const stage=await page.locator('.rd-wheel-stage').evaluate(n=>Math.round(n.getBoundingClientRect().width));
  ok(stage>=400&&stage<=408,'the wheel stage is ~408px wide (measured '+stage+'px)');
  eq(await page.locator('.rd-reward-row').count(),7,'one full-width row per reward');
  eq(await page.locator('#dailyRouletteWheel .wheel-slice').count(),7,'seven wheel slices');
  const clipped=await page.locator('.rd-reward-copy b, .rd-reward-copy small, .rd-reward-rate b').evaluateAll(
    nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent.slice(0,40)));
  eq(clipped.length,0,'no reward name, description or rate is clipped');
  eq(await page.locator('.roulette-mat-stock, .rm-cell').count(),0,'the reserves & active buffs panel is gone');
  ok(await page.locator('#mailDailyBody').evaluate(n=>!n.textContent.includes('YOUR RESERVES')),'with no renamed copy either');
  await noOverflow('.rd-roulette-content','roulette panel has no horizontal overflow');
  await page.locator('#dailySpinBtn').click();
  await page.waitForFunction(()=>!dailyWheelSpinning&&dailySpinsLeft()===0,null,{timeout:30000});
  ok(await page.locator('.rd-spin-result').count()===1,'the spin result is announced');
  await shot('game-03-roulette-1440.png');

  console.log('\nShared buff HUD');
  await page.evaluate(()=>closeMailDaily());
  await page.waitForSelector('#hudBuffs .efx');
  eq(await page.locator('#hudBuffs .efx').count(),2,'both roulette boosts float in the shared strip');
  eq(await page.locator('#dailyBuffPill').count(),0,'the pill under the Daily shortcut is gone');
  ok(await page.locator('#hudBuffs .efx-fly').first().evaluate(n=>getComputedStyle(n).backgroundColor)==='rgba(17, 29, 41, 0.65)',
    'the hover popup surface is 65% opaque');
  ok(await page.locator('#hudBuffs .efx-fly').first().evaluate(n=>getComputedStyle(n).visibility==='hidden'),
    'and it stays closed until hover, focus or tap');
  await page.locator('#hudBuffs .efx').first().hover();
  await page.waitForTimeout(250);
  ok(await page.locator('#hudBuffs .efx-fly').first().evaluate(n=>getComputedStyle(n).visibility==='visible'),
    'hovering opens it');
  await shot('game-04-shared-buffs-1440.png');
  await page.evaluate(()=>{S.dailyWheel.buffs={zenyUntil:0,expUntil:0};bars()});
  eq(await page.locator('#hudBuffs .efx').count(),0,'expired boosts leave nothing behind');
  ok(await page.locator('#hudBuffs').evaluate(n=>n.children.length===0||getComputedStyle(n).display==='none'),
    'no empty-state box or placeholder replaces them');

  console.log('\nGM announcement studio');
  await page.evaluate(()=>openGmStudio());
  await page.waitForSelector('.rd-gm-layout');
  eq(await page.locator('.rd-step').count(),3,'audience, message and attachment steps');
  await page.locator('#gmStudioHeadline').fill('Festival extended');
  await page.locator('#gmStudioBody').fill('The forge stays open one more night.');
  await page.waitForFunction(()=>document.getElementById('gmStudioPreview').textContent.includes('Festival extended'),null,{timeout:10000});
  ok(await page.locator('#gmStudioPreview .rd-attachment').count()===1,'the preview shows the attachment');
  ok(await page.locator('[data-a=gmstudioreview]').isEnabled(),'the review action enables as you type');
  await page.locator('[data-a=gmstudioreview]').click();
  await page.waitForSelector('.rd-confirm');
  ok(await page.locator('.rd-confirm').textContent().then(t=>t.includes('all players')),'the confirmation names the audience');
  await shot('game-05-gm-studio-1440.png');
  await page.locator('[data-a=gmstudiocancel]').click();
  eq(await page.locator('#gmStudioHeadline').inputValue(),'Festival extended','cancelling keeps the draft');
  await page.locator('[data-a=closegmstudio]').click();
  ok(!(await page.locator('#gmStudioModal').evaluate(n=>n.classList.contains('on'))),'the studio closes');

  console.log('\nResponsive');
  for(const [w,h] of [[1024,800],[768,900],[390,844]]){
    await page.setViewportSize({width:w,height:h});
    await page.evaluate(()=>{mailDetail=false;openMailDaily('mail')});
    await page.waitForSelector('.rd-mail-layout');
    await noOverflow('#mailDailyModal .mail-daily-card',w+'px mail card has no horizontal overflow');
    await page.locator('.rd-item').first().click();
    await page.waitForTimeout(120);
    const detail=await page.locator('.rd-mail').evaluate(n=>{
      const list=n.querySelector('.rd-list-panel'),reader=n.querySelector('.rd-reader');
      return {listShown:getComputedStyle(list).display!=='none',readerShown:getComputedStyle(reader).display!=='none'};
    });
    if(w<=620){ok(detail.readerShown&&!detail.listShown,w+'px drills into the letter, hiding the list');}
    else{ok(detail.readerShown&&detail.listShown,w+'px keeps the index beside the letter');}
    if(w<=620){ok(await page.locator('.rd-back').evaluate(n=>getComputedStyle(n).display!=='none'),w+'px offers Back to inbox');
      await page.locator('.rd-back').click();
      ok(await page.locator('.rd-list-panel').evaluate(n=>getComputedStyle(n).display!=='none'),w+'px returns to the list');}
    await page.evaluate(()=>openMailDaily('daily'));
    await page.waitForSelector('#dailyRouletteWheel');
    await noOverflow('#mailDailyModal .mail-daily-card',w+'px roulette card has no horizontal overflow');
    const wheel=await page.locator('.rd-wheel-stage').evaluate(n=>Math.round(n.getBoundingClientRect().width));
    ok(wheel>0&&wheel<=408,w+'px wheel stage is '+wheel+'px and never exceeds 408px');
    const clip=await page.locator('.rd-reward-copy b, .rd-reward-copy small').evaluateAll(
      nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+1).length);
    eq(clip,0,w+'px keeps every reward description whole');
    const stacked=w<=820?await page.locator('.rd-roulette-content').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length===1):true;
    ok(stacked,w<=820?w+'px stacks the wheel above the reward pool':w+'px keeps the two-column layout');
    await shot(`game-06-responsive-${w}.png`);
  }

  eq(pageErrors.length,0,'no page errors'+(pageErrors.length?': '+pageErrors[0]:''));
  const missing=failedRequests.filter(u=>!/favicon|\.map$/.test(u));
  eq(missing.length,0,'no failed asset requests'+(missing.length?': '+missing[0]:''));

  console.log(`\n${checks} browser checks passed`+(capture?', screenshots in .arena/ui-review/':''));
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1)});
