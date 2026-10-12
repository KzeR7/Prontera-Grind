(async()=>{
 const assert=(ok,message)=>{if(!ok)throw Error(message)},tick=()=>new Promise(r=>setTimeout(r,20));
 const ready=async()=>{const start=performance.now();while(wardrobeState.loading||!wardrobeState.look){if(performance.now()-start>20000)throw Error('Wardrobe failed: '+wardrobeState.status);await tick()}};
 assert(window.__wardrobeRendererStub===true,'This UI test expects the explicitly marked WebGL stub');
 const oldSim=simAdvance;simAdvance=()=>{};const user='wardrobe-local-check';currentUser=user;S=fresh();S.cls='Lord Knight';S.hair=17;S.eq.weapon.wt='sword';S.q=['kill','loot','boss'].map(newQuest);$('loginOverlay').style.display='none';tabs.splice(0);tabs.push('wardrobe');ui();await ready();
 const change=(k,v)=>{const el=document.querySelector('[data-wardrobe="'+k+'"]');assert(el,'control '+k);if(el.type==='checkbox')el.checked=v;else el.value=String(v);el.dispatchEvent(new Event('change',{bubbles:true}))};
 const action=k=>document.querySelector('[data-wardrobe-action="'+k+'"]').click();
 change('sex','f');await ready();change('head',42);await ready();change('color',8);await ready();change('halo',false);assert(S.appearance===null&&S.hair===17,'preview must not save');action('cancel');await ready();assert(wardrobeState.draft.sex==='m','cancel restores saved gender');
 change('sex','f');await ready();change('head',42);await ready();change('color',8);await ready();change('glasses',false);action('apply');assert(S.sex==='f'&&S.appearance.heads.f===42&&S.appearance.colors.f===8&&!S.appearance.glasses,'apply saves selected IDs');assert(S.hair===17,'legacy hair survives');assert(JSON.parse(localStorage.getItem('pg_save3_'+user)).appearance.heads.f===42,'actual local save');
 for(let i=0;i<100&&!wardrobeEquipped;i++){draw();await tick()}assert(wardrobeEquipped&&heroSpr.userData.wardrobe,'game uses layered hero');
 const sk=heroSpr.userData.wardrobe;captureWardrobeFrame(heroSpr,5,false,1,1000);assert(sk.paint==='attack5:0','first swing frame');captureWardrobeFrame(heroSpr,5,false,.001,100000);assert(sk.paint==='attack5:8','one complete swing');assert(captureWardrobeFrame(heroSpr,5,false,.001,200000)===false,'unchanged frame avoids upload');
 change('stance','attack');wardrobeState.start=performance.now()-10000;wardrobePreview();assert(wardrobeState.paint.endsWith(',8]'),'preview attack holds last frame');
 // A failed appearance never changes the saved look or replaces the visible ready sprite.
 const before=JSON.stringify(S.appearance),shown=wardrobeState.look.key,fetcher=wardrobeStore.fetcher;wardrobeStore.fetcher=async()=>{throw Error('simulated offline')};change('head',4);await tick();while(wardrobeState.loading)await tick();assert(wardrobeState.status.includes('could not load'),'failure reported');assert(JSON.stringify(S.appearance)===before&&wardrobeState.look.key===shown,'failure preserves saved/visible look');assert($('wardrobeApply').disabled,'failed new choice cannot apply');wardrobeStore.fetcher=fetcher;action('retry');await ready();
 // All saved options decode in this browser. Repeated frames read the same resident atlases.
 const cv=document.createElement('canvas');cv.width=320;cv.height=280;const ctx=cv.getContext('2d');let looks=0,maxBytes=0;
 for(const sex of ['m','f'])for(const head of PGWardrobe.HAIRS[sex])for(let color=0;color<9;color++){
  const a=PGWardrobe.defaults(sex);a.heads[sex]=head;a.colors[sex]=color;const look=await wardrobeStore.select('audit',a);assert(look,'ready look');PGWardrobe.draw(ctx,look,'idle',0);assert(ctx.getImageData(120,100,80,110).data.some(v=>v>0),'nonempty native preview');looks++;maxBytes=Math.max(maxBytes,wardrobeStore.pixelBytes);assert(maxBytes<=wardrobeStore.budget,'bounded decoded memory');
 }
 wardrobeStore.release('audit');cv.width=cv.height=0;
 // A close while loading must allow the next opening and discard the unsaved draft.
 change('sex','m');openTab('wardrobe');openTab('wardrobe');await ready();assert(wardrobeState.draft.sex==='f'&&wardrobeState.draft.heads.f===42,'reopen restores saved choice');
 change('stance','walk');change('direction',7);change('still',true);wardrobePreview();
 const controls=[...document.querySelectorAll('.wardrobe button,.wardrobe select,.wardrobe input')],win=document.querySelector('[data-win=wardrobe]');assert(controls.every(el=>el.getBoundingClientRect().width>0),'all controls laid out');assert(document.documentElement.scrollWidth<=innerWidth,'no page overflow');assert(win.scrollWidth<=win.clientWidth+2,'no panel overflow');assert($('wardrobeCanvas').getBoundingClientRect().width<=320,'canvas size bounded');
 simAdvance=oldSim;
 window.wardrobeBrowserResult={status:'pass',looks,maxDecodedAtlasBytes:maxBytes,viewport:[innerWidth,innerHeight],webgl:false,rendererStub:true,saveIdsOnly:JSON.stringify(S.appearance).length,applied:JSON.parse(JSON.stringify(S.appearance))};return wardrobeBrowserResult;
})()
