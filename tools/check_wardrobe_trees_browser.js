(async()=>{
 const assert=(ok,message)=>{if(!ok)throw Error(message)},tick=()=>new Promise(r=>setTimeout(r,20));
 const ready=async()=>{const start=performance.now();while(wardrobeState.loading||!wardrobeState.look){if(performance.now()-start>20000)throw Error(wardrobeState.status);await tick()}};
 assert(window.__wardrobeRendererStub,'UI-only renderer stub required');
 const oldSim=simAdvance;simAdvance=()=>{};
 try{
 currentUser='wardrobe-tree-local-check';S=fresh();S.cls='Acolyte';S.q=['kill','loot','boss'].map(newQuest);$('loginOverlay').style.display='none';tabs.splice(0);tabs.push('wardrobe');ui();await ready();
 const change=(k,v)=>{const el=document.querySelector('[data-wardrobe="'+k+'"]');el.value=String(v);el.dispatchEvent(new Event('change',{bubbles:true}))};
 const dock=[...document.querySelectorAll('#dock > [data-t]')].map(el=>el.dataset.t);assert(dock.indexOf('wardrobe')===dock.indexOf('set')-1,'Wardrobe immediately left of Settings');
 for(const field of ['class','sex','stance','direction','still'])assert(!document.querySelector('[data-wardrobe="'+field+'"]'),'no '+field+' selector');
 assert(!document.querySelector('[data-wardrobe-action="play"]'),'no replay control');
 let views=0,maxBytes=0;
 for(const cls of Object.keys(PGWardrobe.CLASSES))for(const sex of ['m','f']){
  S.cls=cls;S.sex=sex;if(S.appearance)S.appearance.sex=sex;ui();await ready();assert(wardrobeState.look.cls===cls,'correct preview class');
  change('head',42);change('color',8);await ready();
  for(const stance of ['idle','walk','attack'])for(let d=0;d<8;d++){
   PGWardrobe.draw($('wardrobeCanvas').getContext('2d'),wardrobeState.look,stance,d,1234,stance==='attack'?.5:null);
   assert($('wardrobeCanvas').getContext('2d').getImageData(100,80,120,140).data.some(v=>v>0),'visible native sprite');views++;
  }
  S.cls=cls;document.querySelector('[data-wardrobe-action=apply]').click();
  for(let i=0;i<500;i++){draw();if(wardrobeEquipped&&wardrobeEquipped.cls===cls&&heroSpr.userData.wardrobe?.look.cls===cls)break;await tick()}
  assert(heroSpr.userData.wardrobe?.look.cls===cls,'field adapter class');
  assert(S.appearance.heads[sex]===42&&S.appearance.colors[sex]===8,'saved cosmetics');
  maxBytes=Math.max(maxBytes,wardrobeStore.pixelBytes);assert(maxBytes<=wardrobeStore.budget,'memory budget');
 }
 const win=document.querySelector('[data-win=wardrobe]');assert(document.documentElement.scrollWidth<=innerWidth,'no page overflow');assert(win.scrollWidth<=win.clientWidth+2,'no panel overflow');
 return {status:'pass',classes:Object.keys(PGWardrobe.CLASSES).length,views,maxDecodedAtlasBytes:maxBytes,viewport:[innerWidth,innerHeight],rendererStub:true};
 }finally{simAdvance=oldSim}
})()
