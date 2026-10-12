(async()=>{
 const assert=(ok,message)=>{if(!ok)throw Error(message)},tick=()=>new Promise(r=>setTimeout(r,20));
 const ready=async()=>{const start=performance.now();while(wardrobeState.loading||!wardrobeState.look||wardrobeState.look.cls!==S.cls){if(performance.now()-start>20000)throw Error('Wardrobe failed: '+wardrobeState.status);await tick()}};
 const heroReady=async()=>{for(let i=0;i<1000;i++){draw();if(heroSpr?.userData.wardrobe?.look.cls===S.cls)return;await tick()}throw Error('Hero did not load')};
 assert(window.__wardrobeRendererStub===true,'This check uses the explicitly marked WebGL stub');
 const oldSim=simAdvance;simAdvance=()=>{};
 try{
 currentUser='wardrobe-local-check';S=fresh();S.cls='Swordman';S.hair=17;S.q=['kill','loot','boss'].map(newQuest);$('loginOverlay').style.display='none';tabs.splice(0);tabs.push('wardrobe');ui();await ready();await heroReady();
 assert(S.appearance===null&&heroSpr.userData.wardrobe,'native sprite requires no Wardrobe opt-in');
 assert(!document.querySelector('[data-wardrobe="sex"]'),'Wardrobe changes hair/color/costume only');
 const change=(k,v)=>{const el=document.querySelector('[data-wardrobe="'+k+'"]');assert(el,'control '+k);if(el.type==='checkbox')el.checked=v;else el.value=String(v);el.dispatchEvent(new Event('change',{bubbles:true}))};
 const action=k=>document.querySelector('[data-wardrobe-action="'+k+'"]').click();
 // Settings owns gender; per-gender hair preferences and old numeric hair IDs survive.
 ACT.sex('f');await ready();await heroReady();change('head',42);await ready();change('color',8);await ready();change('headwear','halo');assert(S.appearance===null&&S.hair===17,'draft must not save');action('cancel');await ready();assert(wardrobeState.draft.heads.f===2,'cancel restores default');
 change('head',42);await ready();change('color',8);await ready();change('facewear','glasses');await ready();action('apply');await heroReady();
 assert(S.appearance.heads.f===42&&S.appearance.colors.f===8&&S.appearance.glasses,'apply saves IDs');assert(S.hair===17,'legacy hair survives');assert(JSON.parse(localStorage.getItem('pg_save3_'+currentUser)).appearance.heads.f===42,'actual local save');
 const saved=JSON.stringify(S.appearance),timings=[];let maxBytes=0;
 // Give the synthetic account previously played careers; use the real class-change path.
 for(const cls of Object.keys(PGWardrobe.CLASSES))S.jobs[cls]={jl:50,jx:0};
 for(const cls of Object.keys(PGWardrobe.CLASSES)){
  const start=performance.now();changeClass(cls);ui();await ready();await heroReady();
  assert(S.cls===cls&&wardrobeState.look.cls===cls,'actual class switch '+cls);assert(JSON.stringify(S.appearance)===saved,'class switch retains cosmetics');
  const sk=heroSpr.userData.wardrobe;
  for(let d=0;d<8;d++){
   captureWardrobeFrame(heroSpr,d,false,1,1000);assert(sk.paint==='attack'+d+':0','first swing frame');
   captureWardrobeFrame(heroSpr,d,false,.001,100000);const last=sk.look.base.metadata.actions['attack'+d].frames.length-1;assert(sk.paint==='attack'+d+':'+last,'one complete swing');assert(captureWardrobeFrame(heroSpr,d,false,.001,200000)===false,'same frame skips upload');
   captureWardrobeFrame(heroSpr,d,true,0,300000);captureWardrobeFrame(heroSpr,d,false,0,400000);
  }
  maxBytes=Math.max(maxBytes,wardrobeStore.pixelBytes);timings.push({cls,switchMs:Math.round(performance.now()-start)});
 }
 // A failed class load must not show a previously loaded body from another class.
 const fetcher=wardrobeStore.fetcher;wardrobeStore.release('preview');wardrobeStore.release('hero');wardrobeEquipped=null;wardrobeRequested='';wardrobeStore.dispose();
 wardrobeStore.fetcher=async()=>{throw Error('simulated offline')};changeClass('Knight');ui();draw();await tick();while(wardrobeState.loading)await tick();
 assert(!wardrobeHero({cls:'Knight'})&&wardrobeState.status.includes('could not load'),'failure falls back without wrong class');assert(JSON.stringify(S.appearance)===saved,'failure preserves save');assert($('wardrobeApply').disabled,'failed choice cannot apply');wardrobeStore.fetcher=fetcher;action('retry');await ready();await heroReady();
 const cv=document.createElement('canvas');cv.width=320;cv.height=280;const ctx=cv.getContext('2d');let looks=0,paints=0;const paintTimes=[];
 // All 360 images across all class attachment sets; class switches reuse shared images.
 for(const sex of ['m','f'])for(const head of (window.wardrobeAuditSample?[PGWardrobe.HAIRS[sex][0],PGWardrobe.HAIRS[sex].at(-1)]:PGWardrobe.HAIRS[sex]))for(const color of (window.wardrobeAuditSample?[0,8]:Array.from({length:9},(_,i)=>i))){
  const a=PGWardrobe.defaults(sex);a.heads[sex]=head;a.colors[sex]=color;
  for(const cls of Object.keys(PGWardrobe.CLASSES)){
   const look=await wardrobeStore.select('audit',a,cls);assert(look,'ready look');
   const start=performance.now();for(const stance of ['idle','walk','attack'])for(let d=0;d<8;d++){PGWardrobe.draw(ctx,look,stance,d,1234,stance==='attack'?.5:null);paints++}paintTimes.push((performance.now()-start)/24);
   assert(ctx.getImageData(80,60,160,150).data.some(v=>v>0),'nonempty native preview');looks++;maxBytes=Math.max(maxBytes,wardrobeStore.pixelBytes);assert(maxBytes<=wardrobeStore.budget,'bounded decoded memory');
  }
 }
 wardrobeStore.release('audit');cv.width=cv.height=0;
 // Real combat simulation stays active with the native hero installed.
 S.lv=80;S.st.str=80;S.st.dex=60;S.st.agi=70;S.hp=maxHp();S.auto=false;S.adv=false;gotoField(0,1);const kills=S.kills;
 for(let i=0;i<1200;i++){update(.1);if(i%10===0)draw()}assert(S.kills>kills,'combat still awards kills');
 for(const field of ['class','stance','direction','still'])assert(!document.querySelector('[data-wardrobe="'+field+'"]'),'removed '+field+' selector');wardrobePreview();
 const win=document.querySelector('[data-win=wardrobe]');assert(document.documentElement.scrollWidth<=innerWidth,'no page overflow');assert(win.scrollWidth<=win.clientWidth+2,'no panel overflow');assert($('wardrobeCanvas').getBoundingClientRect().width<=320,'bounded canvas');
 S.cls='Sniper';save();paintTimes.sort((a,b)=>a-b);
 window.wardrobeBrowserResult={status:'pass',looks,paints,maxDecodedAtlasBytes:maxBytes,viewport:[innerWidth,innerHeight],canvasPaintP50ms:paintTimes[Math.floor(paintTimes.length*.5)],canvasPaintP95ms:paintTimes[Math.floor(paintTimes.length*.95)],classSwitchTimings:timings,combatKills:S.kills-kills,webgl:false,rendererStub:true,saveIdsOnly:JSON.stringify(S.appearance).length};return wardrobeBrowserResult;
 }finally{simAdvance=oldSim}
})()
