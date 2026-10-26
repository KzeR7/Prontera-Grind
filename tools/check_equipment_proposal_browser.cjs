// Visual-only equipment study: local browser audit and repeatable captures.
// node tools/check_equipment_proposal_browser.cjs [base URL] [--capture]
// npm install --no-save --package-lock=false playwright @sparticuz/chromium jsdom three@0.128.0 ws
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const moduleChromium=require('@sparticuz/chromium');
const bundled=moduleChromium.default||moduleChromium;
const root=path.resolve(__dirname,'..');
const base=process.argv.find(x=>/^https?:\/\//.test(x))||'http://127.0.0.1:8000';
const capture=process.argv.includes('--capture');
const out=path.join(root,'docs/proposals/equipment-2026-10-26');
const scratch=path.join(root,'.arena/equipment-review');
const report={checks:[],viewports:[],errors:[],failedRequests:[],requests:[],captures:[]};
const rgb=h=>h.match(/[\da-f]{2}/gi).map(x=>parseInt(x,16));
const distance=(a,b)=>Math.hypot(...rgb(a).map((v,i)=>v-rgb(b)[i]));
const luminance=h=>{const c=rgb(h).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
(async()=>{
  fs.mkdirSync(scratch,{recursive:true});
  if(capture)fs.mkdirSync(out,{recursive:true});
  const pkg=path.resolve(path.dirname(require.resolve('@sparticuz/chromium')),'..');
  const lib=await moduleChromium.inflate(path.join(pkg,'bin/al2023.tar.br'));
  process.env.LD_LIBRARY_PATH=path.join(lib,'lib')+':'+(process.env.LD_LIBRARY_PATH||'');
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||await bundled.executablePath(),args:bundled.args,headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1120},deviceScaleFactor:1,reducedMotion:'reduce'});
    await context.addInitScript(()=>{
      for(const method of ['getItem','setItem','removeItem','clear'])Storage.prototype[method]=function(){throw Error('Visual-only study accessed persistence: '+method)};
    });
    const page=await context.newPage();
    page.on('pageerror',error=>report.errors.push(error.message));
    page.on('request',request=>report.requests.push({url:request.url(),method:request.method()}));
    page.on('requestfailed',request=>report.failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
    page.on('response',response=>{if(response.status()>=400)report.errors.push(`${response.status()} ${response.url()}`)});
    const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const view=async name=>{
      await page.locator(`.review-tabs a[data-view="${name}"]`).click();await settle();
      if(name==='loadout'){
        await page.waitForFunction(()=>document.querySelector('#nativeHero')?.dataset.ready==='true'||document.querySelector('#nativeHero')?.dataset.error);
        await page.waitForLoadState('networkidle');
      }
    };
    const loadoutGeometry=()=>page.evaluate(()=>{
      const canvas=document.querySelector('#nativeHero'),doll=document.querySelector('.loadout-doll');
      const frame=canvas.getBoundingClientRect(),area=doll.getBoundingClientRect();
      const orbit=document.querySelector('.doll-orbit').getBoundingClientRect();
      const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let x0=canvas.width,y0=canvas.height,x1=-1,y1=-1;
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]){
        x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
      }
      const sx=frame.width/canvas.width,sy=frame.height/canvas.height;
      const painted={left:frame.left+x0*sx,right:frame.left+(x1+1)*sx,top:frame.top+y0*sy,bottom:frame.top+(y1+1)*sy};
      const overlaps=[...document.querySelectorAll('.doll-slot .icon-tile')].filter(tile=>{
        const r=tile.getBoundingClientRect();
        return Math.min(r.right,painted.right)>Math.max(r.left,painted.left)&&Math.min(r.bottom,painted.bottom)>Math.max(r.top,painted.top);
      }).map(tile=>tile.parentElement.className);
      return{painted,centerDelta:Math.abs((painted.left+painted.right)/2-(area.left+area.right)/2),groundDelta:Math.abs(painted.bottom-(orbit.top+orbit.height/2)),aspectDelta:Math.abs(sx-sy),overlaps,headBottom:document.querySelector('.doll-slot.head .icon-tile').getBoundingClientRect().bottom,accessoryTop:document.querySelector('.doll-slot.acc1 .icon-tile').getBoundingClientRect().top};
    });
    const badgeGeometry=()=>page.locator('.icon-tile').evaluateAll(tiles=>tiles.flatMap(tile=>{
      const problems=[],badge=tile.querySelector('.rarity-badge'),frame=tile.getBoundingClientRect();
      if(!frame.width||!frame.height)return problems;
      if(!badge)return ['Missing rarity badge'];
      const b=badge.getBoundingClientRect();
      if(b.left<frame.left||b.right>frame.right||b.top<frame.top||b.bottom>frame.bottom)problems.push('Rarity badge outside its tile');
      if(badge.scrollWidth>badge.clientWidth+1||badge.scrollHeight>badge.clientHeight+1)problems.push('Clipped rarity badge');
      const lock=tile.closest('.bag-tile')?.querySelector('.tile-lock'),rank=tile.querySelector('.rank');
      for(const marker of [lock,rank].filter(Boolean)){
        const r=marker.getBoundingClientRect();
        if(Math.min(r.right,b.right)>Math.max(r.left,b.left)&&Math.min(r.bottom,b.bottom)>Math.max(r.top,b.top))problems.push('Rarity overlaps lock/refinement');
      }
      return problems;
    }));
    const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('ok '+name)};
    await page.goto(`${base}/tools/equipment-proposal/index.html`);
    await page.evaluate(()=>document.fonts.ready);
    await check('default screen focuses affixes and is explicitly a visual-only proposal',async()=>{
      assert.equal((await page.evaluate(()=>PGEquipmentVisual.diagnostics())).view,'affixes');
      assert.match(await page.locator('.proposal-badge').textContent(),/VISUAL PROPOSAL/);
      assert.match(await page.locator('.stage-caption').textContent(),/STATIC MOCKUP/);
      assert.equal(await page.locator('.review-tabs a').count(),5);
      assert.equal(await page.locator('input,textarea,form').count(),0);
      assert.equal(await page.locator('button:not([data-device])').count(),0,'Only the review device buttons are interactive');
    });
    await check('Mythic uses a distinct, accessible cyan badge instead of gold-adjacent orange',async()=>{
      await view('loadout');
      const fixture=await page.evaluate(()=>PGEquipmentVisual.diagnostics());
      assert.equal(fixture.rarityColors[7],'#3ddad9');
      assert.equal(fixture.rarityColors[4],'#ffd26e');
      assert(distance(fixture.rarityColors[7],fixture.rarityColors[4])>180,'Mythic must be far from Legendary gold');
      assert(Math.min(...fixture.rarityColors.slice(0,7).map(c=>distance(c,fixture.rarityColors[7])))>65,'Mythic must differ from all other grades');
      assert(contrast(fixture.rarityColors[7],'#0e1823')>4.5,'Mythic cyan must be readable on the dark badge background');
      assert(contrast('#06171d',fixture.rarityColors[7])>7,'Mythic badge text must be readable on cyan');
      assert.match(await page.locator('.rarity-key[data-rarity="7"]').textContent(),/Mythic · cyan/);
      const style=await page.locator('.rarity-key[data-rarity="7"] .rarity-badge').evaluate(el=>{const c=getComputedStyle(el);return{color:c.color,background:c.backgroundImage,radius:c.borderTopRightRadius}});
      assert.match(style.background,/linear-gradient/);assert.equal(style.radius,'7px');
      await view('affixes');
    });
    await check('card examples match the real game catalog and keep grades separate from equipment rarity',async()=>{
      const fixture=await page.evaluate(()=>PGEquipmentVisual.diagnostics());
      const {createGame}=require('./tests/helpers/game.js');const game=createGame();
      try{
        const names=fixture.cards.map(c=>c.name);
        const actual=JSON.parse(game.ev(`JSON.stringify(${JSON.stringify(names)}.map(n=>{const c=CARD_CATALOG.find(x=>x.n===n&&!x.nightmare);return{name:c.n,family:cardFamily(c),grade:GRADE[c.g],gameEffects:cardEffects(c).map(cardEffectText),fit:c.fit,boss:!!c.bossCard,value:c.v}}))`));
        assert.deepEqual(fixture.cards.map(({name,family,grade,gameEffects,fit,boss,value})=>({name,family,grade,gameEffects,fit,boss,value})),actual);
        assert.deepEqual(fixture.gradeNames,JSON.parse(game.ev('JSON.stringify(GRADE)')));
        assert.deepEqual(JSON.parse(game.ev('JSON.stringify(CARD_MERGE_COST)')),[1,3,5]);
      }finally{game.close()}
    });
    await check('real card system still passes catalog, collection, socket, merge, transfer, Mastery and auto-sell action checks',async()=>{
      const output=execFileSync(process.execPath,[path.join(root,'tools/check_equipment_card_system.cjs')],{cwd:root,encoding:'utf8'});
      assert.match(output,/PASS 8 card-system checks/);
    });
    await check('example ranges and reforge prices match the real game helpers',async()=>{
      const {createGame}=require('./tests/helpers/game.js');
      const game=createGame();
      try{
        const actual=game.ev(`(()=>{const it={id:101,slot:'weapon',wt:'sword',tier:4,sec:6,mythic:true,ascSet:'celestial',mp:0,r:10,aff:[{k:'str',v:66},{k:'atk',v:62},{k:'crit',v:25},{k:'agi',v:46}]};return{ranges:it.aff.map(a=>({min:rolledAffixValue(a.k,it,.8),max:rolledAffixValue(a.k,it,1.25)})),single:reforgeQuote(it,1),full:reforgeQuote(it,4),rarities:RARALL.map(x=>x.n)}})()`);
        const fixture=await page.evaluate(()=>PGEquipmentVisual.diagnostics());
        assert.deepEqual(fixture.affixes.map(a=>({min:a.min,max:a.max})),JSON.parse(JSON.stringify(actual.ranges)));
        for(const field of ['zeny','ore','ascMat']){
          assert.equal(fixture.singleQuote[field],actual.single[field]);
          assert.equal(fixture.fullQuote[field],actual.full[field]);
        }
        assert.deepEqual(fixture.rarities,JSON.parse(JSON.stringify(actual.rarities)));
      }finally{game.close()}
    });
    await check('affix view selects one piece and distinguishes one reroll from three retained affixes',async()=>{
      assert.equal(await page.locator('.gear-row.selected').count(),1);
      assert.equal(await page.locator('.affix-row').count(),4);
      assert.equal(await page.locator('.affix-row.reroll').count(),1);
      assert.equal(await page.locator('.affix-row:not(.reroll) .row-state').count(),3);
      assert.match(await page.locator('.roll-note').textContent(),/change both the stat and its value/);
      assert.match(await page.locator('.workbench-footer').textContent(),/not refunded/);
    });
    await check('result view preserves current values and never labels a different stat a guaranteed upgrade',async()=>{
      await view('offer');
      assert.equal(await page.locator('.compare-row').count(),4);
      assert.equal(await page.locator('.compare-row.changed').count(),1);
      assert.match(await page.locator('.compare-row.changed').textContent(),/AGI \+46.*ASPD \+45%/s);
      assert.match(await page.locator('.compare-note').textContent(),/not automatically an upgrade/);
      assert.match(await page.locator('.offer-safe').textContent(),/survives a reload/);
      assert.match(await page.locator('.footer-actions').textContent(),/Keep current.*Use new affixes/s);
    });
    await check('auto-sell shows all eight rarities, only active affix conditions, and explicit any/all logic',async()=>{
      await view('autosell');
      assert.equal(await page.locator('.rarity-option').count(),8);
      assert.equal(await page.locator('.rarity-option.active').count(),3);
      assert.equal(await page.locator('.condition').count(),2);
      assert.match(await page.locator('.summary-sentence').textContent(),/Common, Fine & Rare/);
      assert.match(await page.locator('.summary-sentence').textContent(),/ATK ≥ 20%ORCrit ≥ 8%/);
      assert.match(await page.locator('.always-protected').textContent(),/Locked gear.*equipped items.*saved class loadouts.*paid reforge offers/s);
      assert.match(await page.locator('.advanced-line').textContent(),/Slots, weapons, exact names & empty sockets/);
    });
    await check('draft application and current-bag selling are visually separate and sample data is labelled',async()=>{
      assert.match(await page.locator('.sell-topline .pill').textContent(),/Draft.*Not active/);
      assert.match(await page.locator('.workbench-footer').textContent(),/future drops.*offline loot.*existing bag is not sold/s);
      assert.match(await page.locator('.sample-tag').textContent(),/sample items/);
      assert.match(await page.locator('.sell-summary>.helper').textContent(),/Illustrative preview only/);
      assert.equal(await page.locator('.preview-example').count(),3);
      assert.match(await page.locator('.preview-example').nth(1).textContent(),/ATK \+24%.*Keep/s);
    });
    await check('loadout uses the unchanged native renderer and locally available item artwork',async()=>{
      await view('loadout');
      await page.waitForFunction(()=>document.querySelector('#nativeHero')?.dataset.ready==='true'||document.querySelector('#nativeHero')?.dataset.error);
      assert.equal(await page.locator('#nativeHero').getAttribute('data-ready'),'true');
      assert.equal(await page.locator('.doll-slot').count(),7);
      assert.equal(await page.locator('.bag-tile').count(),30);
      assert.equal(await page.locator('.item-inspector').count(),1);
      assert.match(await page.locator('.inventory-bottom').textContent(),/Affixes and cards are not compared/);
      assert.match(await page.locator('.socket-visual .socket-link').textContent(),/Manage cards/);
      assert.equal(await page.locator('.socket-visual .socket-link').getAttribute('href'),'#cards');
      const broken=await page.locator('img').evaluateAll(images=>images.filter(img=>!img.complete||img.naturalWidth===0).map(img=>img.src));
      assert.deepEqual(broken,[]);
    });
    await check('character is visibly centered, grounded on the orbit and clear of equipment slots',async()=>{
      const geometry=await loadoutGeometry();
      assert(geometry.centerDelta<=1,`Character not centered: ${JSON.stringify(geometry)}`);
      assert(geometry.groundDelta<=1,`Character floats below/above orbit: ${JSON.stringify(geometry)}`);
      assert(geometry.aspectDelta<.001,'Native pose retains its aspect ratio');
      assert(geometry.painted.top>=geometry.headBottom+8,'Leave clear space below headgear');
      assert(geometry.painted.bottom<=geometry.accessoryTop-8,'Leave clear space above accessories');
      assert.deepEqual(geometry.overlaps,[],'Visible character pixels do not cover equipment slots');
    });
    await check('all equipment has explicit eight-grade badges independent of refinement, including sale examples',async()=>{
      const metadata=(await page.evaluate(()=>PGEquipmentVisual.diagnostics())).rarityBadges;
      assert.deepEqual(metadata.map(r=>r.code),['C','F','R','E','L','N','N+','M']);
      assert.equal(await page.locator('.icon-tile').count(),32);
      assert.equal(await page.locator('.icon-tile > .rarity-badge').count(),32);
      assert.equal(await page.locator('.bag-tile.empty .rarity-badge').count(),0);
      assert.equal(await page.locator('.rarity-key').count(),8);
      const shown=await page.locator('.bag-tile .icon-tile').evaluateAll(tiles=>tiles.map(tile=>({rarity:Number(tile.dataset.rarity),code:tile.querySelector('.rarity-badge').textContent,name:tile.querySelector('.rarity-badge').getAttribute('aria-label')})));
      assert.deepEqual([...new Set(shown.map(tile=>tile.rarity))].sort(),[0,1,2,3,4,5,6,7]);
      for(const tile of shown){assert.equal(tile.code,metadata[tile.rarity].code);assert.equal(tile.name,'Rarity: '+metadata[tile.rarity].name);}
      assert.equal(await page.locator('.item-inspector .rank').textContent(),'+10');
      assert.equal(await page.locator('.item-inspector .rarity-badge').textContent(),'M','Refinement +10 is not a rarity');
      assert.deepEqual(await badgeGeometry(),[]);
      for(const name of ['affixes','offer','cards','autosell']){
        await view(name);assert.deepEqual(await badgeGeometry(),[],name+' badge placement');
        assert.equal(await page.locator('.icon-tile').count(),await page.locator('.icon-tile > .rarity-badge').count());
      }
      assert.deepEqual(await page.locator('.preview-example .rarity-badge').allTextContents(),['C','R','F']);
    });
    await check('desktop and narrow layouts avoid page overflow, clipped labels and primary-action collisions',async()=>{
      for(const width of [1440,1280,1024,768,390,320]){
        await page.setViewportSize({width,height:1120});
        for(const name of ['loadout','affixes','autosell','offer','cards']){
          await view(name);
          if(name==='loadout'){
            await page.waitForFunction(()=>document.querySelector('#nativeHero')?.dataset.ready==='true');
            const geometry=await loadoutGeometry();
            assert(geometry.centerDelta<=1&&geometry.groundDelta<=1&&geometry.aspectDelta<.001,`${width}: centered, grounded and undistorted character`);
            assert.deepEqual(geometry.overlaps,[],`${width}: character does not cover equipment slots`);
          }
          assert.deepEqual(await badgeGeometry(),[],`${width}/${name}: badges stay legible and separate from lock/refinement`);
          const measure=await page.evaluate(()=>{
            const viewport=innerWidth,documentWidth=document.documentElement.scrollWidth;
            const clipped=[...document.querySelectorAll('.affix-value,.roll-range,.cost-main,.row-state,.condition,.summary-sentence,.gear-copy,.compare-row,.visual-button,.rarity-option,.window-head h2,.card-copy,.card-effects,.card-fit-chips,.card-rule,.socket-copy,.cards-topline h3,.card-grade-badge,.card-row,.socket-row,.card-actions,.socket-link')].filter(el=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0&&el.scrollWidth>el.clientWidth+1).map(el=>({class:el.className,text:el.textContent,scroll:el.scrollWidth,client:el.clientWidth}));
            const buttons=[...document.querySelectorAll('.footer-actions>.visual-button')].map(el=>{const r=el.getBoundingClientRect();return{x:r.x,right:r.right,height:r.height}});
            return{viewport,documentWidth,clipped,buttons};
          });
          assert(measure.documentWidth<=width+1,`${width}/${name}: page overflow ${measure.documentWidth}`);
          assert.deepEqual(measure.clipped,[],`${width}/${name}: clipped text`);
          if(measure.buttons.length>1)assert(measure.buttons[0].right<=measure.buttons[1].x,`${width}/${name}: buttons overlap`);
          report.viewports.push({width,view:name});
        }
      }
    });
    await check('phone preview adapts the layout rather than scaling the desktop down',async()=>{
      await page.setViewportSize({width:1440,height:1120});
      await view('affixes');await page.locator('[data-device="phone"]').click();await settle();
      assert.equal(Math.round((await page.locator('#visual').boundingBox()).width),390);
      assert.equal(await page.locator('.mobile-picker').isVisible(),true);
      assert.equal(await page.locator('.gear-sidebar').isHidden(),true);
      const editor=await page.locator('.affix-editor').boundingBox(),quote=await page.locator('.quote').boundingBox();
      assert(quote.y>=editor.y+editor.height-1);
      await page.locator('[data-device="desktop"]').click();await settle();
      assert.equal(await page.locator('.gear-sidebar').isVisible(),true);
    });
    await check('review navigation works with keyboard focus and meaningful current-page markers',async()=>{
      await page.locator('.review-tabs [data-view="autosell"]').focus();await page.keyboard.press('Enter');await settle();
      assert.equal(await page.locator('.review-tabs [aria-current="page"]').getAttribute('data-view'),'autosell');
      assert.equal(await page.locator('.subnav [aria-current="page"]').textContent(),'Auto-sell NEW HOME');
      assert.match(await page.locator('#stageLabel').textContent(),/AUTO-SELL/);
      assert.equal(await page.locator('.design-note').count(),3);
      await page.locator('.review-tabs [data-view="cards"]').focus();await page.keyboard.press('Enter');await settle();
      assert.equal(await page.locator('.review-tabs [aria-current="page"]').getAttribute('data-view'),'cards');
      assert.match(await page.locator('.subnav [aria-current="page"]').textContent(),/Cards WORKSPACE/);
      assert.match(await page.locator('#stageLabel').textContent(),/CARDS/);
      assert.equal(await page.locator('button:not([data-device])').count(),0);
    });
    await check('Cards view explains collection, compatibility, sockets, merges and card safety',async()=>{
      await view('cards');
      assert.equal(await page.locator('.card-row').count(),6);
      assert.equal(await page.locator('.card-grade-filters > span').count(),5);
      assert.equal(await page.locator('.card-grade-badge').count(),1);
      assert.equal(await page.locator('.socket-row').count(),3);
      assert.equal(await page.locator('.socket-row.filled').count(),1);
      assert.equal(await page.locator('.socket-row.empty').count(),2);
      assert.equal(await page.locator('.card-rule').count(),4);
      assert.match(await page.locator('.card-detail').textContent(),/Fits Main hand.*STR \+12.*ATK \+6%.*Merge to ★ · 1 extra copy.*Sell 1 · 1,800 Zeny/s);
      assert.match(await page.locator('.card-rule-box').textContent(),/Only cards that fit.*One card per monster family.*At most two boss cards.*two Crit DMG cards.*Cards are never silently discarded/s);
      assert.match(await page.locator('.card-mastery').textContent(),/Only loose cards can be dedicated.*starred cards are not consumed/s);
      assert.match(await page.locator('.card-safety').textContent(),/Auto-sell protects inserted cards.*bulk sale returns inserted cards/s);
      assert.match(await page.locator('.socket-remove').textContent(),/Remove · 200 Zeny/);
      assert.deepEqual(await badgeGeometry(),[]);
    });
    if(capture){
      await page.setViewportSize({width:1440,height:1120});
      for(const [name,file]of [['loadout','01-loadout.png'],['affixes','02-affixes.png'],['autosell','03-auto-sell.png'],['offer','04-reforge-result.png'],['cards','08-cards.png']]){
        await view(name);
        if(name==='loadout')await page.waitForFunction(()=>document.querySelector('#nativeHero')?.dataset.ready==='true');
        await page.evaluate(()=>document.fonts.ready);await settle();
        await page.locator('#visual').screenshot({path:path.join(out,file)});report.captures.push(file);
      }
      await view('loadout');await page.locator('[data-device="phone"]').click();await settle();
      await page.locator('#visual').screenshot({path:path.join(out,'07-loadout-phone.png')});report.captures.push('07-loadout-phone.png');
      await view('affixes');await settle();
      await page.locator('#visual').screenshot({path:path.join(out,'05-affixes-phone.png')});report.captures.push('05-affixes-phone.png');
      await view('autosell');await settle();
      await page.locator('#visual').screenshot({path:path.join(out,'06-auto-sell-phone.png')});report.captures.push('06-auto-sell-phone.png');
      await view('cards');await settle();
      await page.locator('#visual').screenshot({path:path.join(out,'09-cards-phone.png')});report.captures.push('09-cards-phone.png');
      await page.locator('[data-device="desktop"]').click();await view('affixes');await settle();
      await page.screenshot({path:path.join(out,'00-design-direction.png'),fullPage:true});report.captures.push('00-design-direction.png');
      const reviewPath=path.join(root,'tools/equipment-proposal/review.html');
      if(fs.existsSync(reviewPath)){
        await page.goto(`${base}/tools/equipment-proposal/review.html`);await page.evaluate(()=>document.fonts.ready);
        await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
        await check('print review contains six complete sheets without notes colliding with footers',async()=>{
          assert.equal(await page.locator('.sheet').count(),6);
          const collisions=await page.locator('.sheet').evaluateAll(sheets=>sheets.map((sheet,index)=>{
            const content=sheet.querySelector('.notes')||sheet.querySelector('.phone-layout');
            const footer=sheet.querySelector('.foot');
            return {page:index+1,bottom:content.getBoundingClientRect().bottom,footer:footer.getBoundingClientRect().top,overflow:sheet.scrollHeight>sheet.clientHeight+1};
          }).filter(row=>row.bottom>row.footer||row.overflow));
          assert.deepEqual(collisions,[]);
        });
        await page.locator('.sheet').first().screenshot({path:path.join(scratch,'print-affixes.png')});
        await page.locator('.sheet').nth(4).screenshot({path:path.join(scratch,'print-cards.png')});
        await page.locator('.sheet').nth(5).screenshot({path:path.join(scratch,'print-phone.png')});
        await page.pdf({path:path.join(out,'equipment-redesign-proposal.pdf'),printBackground:true,preferCSSPageSize:true});
        await check('exported PDF has exactly six pages',async()=>{
          const bytes=fs.readFileSync(path.join(out,'equipment-redesign-proposal.pdf'));
          assert.equal((bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,6);
        });
        report.captures.push('equipment-redesign-proposal.pdf');
      }
    }
    await check('visual study makes no API requests, persistent-state accesses or gameplay submissions',async()=>{
      assert.deepEqual(report.requests.filter(r=>r.method!=='GET'),[]);
      assert.deepEqual(report.requests.filter(r=>new URL(r.url).pathname.startsWith('/api/')),[]);
      assert.deepEqual(report.requests.filter(r=>new URL(r.url).pathname==='/game'),[]);
      assert.deepEqual(report.errors,[]);
      assert.deepEqual(report.failedRequests,[]);
    });
    fs.writeFileSync(path.join(scratch,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(`PASS ${report.checks.length} checks; ${report.viewports.length} viewport/screen combinations; ${report.captures.length} captures; no page/resource errors.`);
  }finally{await browser.close()}
})().catch(error=>{fs.mkdirSync(scratch,{recursive:true});fs.writeFileSync(path.join(scratch,'failure.json'),JSON.stringify({...report,failure:error.stack},null,2)+'\n');console.error(error);process.exitCode=1});
