(async()=>{
 const assert=(ok,message)=>{if(!ok)throw Error(message)},tick=()=>new Promise(r=>setTimeout(r,20));
 const ready=async()=>{const start=performance.now();while(wardrobeState.loading||!wardrobeState.look||PGWardrobe.selectionKey(wardrobeState.look.selection)!==PGWardrobe.selectionKey(wardrobeState.draft)){if(performance.now()-start>20000)throw Error(wardrobeState.status||'Wardrobe timeout');await tick()}};
 assert(window.__wardrobeRendererStub,'Browser UI check requires the marked renderer stub');
 const advance=simAdvance;simAdvance=()=>{};
 try{
 currentUser='wardrobe-collection-local';S=fresh();S.cls='Novice';S.q=['kill','loot','boss'].map(newQuest);$('loginOverlay').style.display='none';tabs.splice(0);tabs.push('wardrobe');ui();await ready();
 const change=(field,value)=>{const el=document.querySelector('[data-wardrobe="'+field+'"]');assert(el,'missing '+field);el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}))};
 const action=name=>document.querySelector('[data-wardrobe-action="'+name+'"]').click();
 const gear=JSON.stringify(S.eq);let paints=0,peak=0;
 for(const sex of ['m','f']){
  ACT.sex(sex);await ready();
  const labels=[...document.querySelector('[data-wardrobe="head"]').options].map(o=>o.textContent);assert(labels.every((s,i)=>s==='Style '+(i+1))&&labels.length===20,'consecutive hairstyles');
  assert([...document.querySelector('[data-wardrobe="color"]').options].every((o,i)=>o.textContent==='Color '+(i+1)),'consecutive colors');
  assert(!document.querySelector('[data-wardrobe="outfit"]'),'no progression-class costumes');
  for(const [field,items] of Object.entries(PGWardrobe.ACCESSORIES)){
   assert(document.querySelector('[data-wardrobe="'+field+'"]').options.length===Object.keys(items.items).length,'all pieces plus None');
   for(const item of Object.keys(items.items).filter(k=>k!=='none')){
    change(field,item);assert($('wardrobeApply').disabled,'pending selection disabled');await ready();
    const cv=document.createElement('canvas');cv.width=320;cv.height=280;
    for(const stance of ['idle','walk','attack'])for(let d=0;d<8;d++){PGWardrobe.draw(cv.getContext('2d'),wardrobeState.look,stance,d,9999);paints++}
    peak=Math.max(peak,wardrobeStore.pixelBytes);
   }
   change(field,'none');await ready();
  }
  change('headwear','catEars');change('facewear','sunglasses');change('mouthwear','flower');change('backwear','evilScythe');await ready();action('apply');
  assert(wardrobeState.look.pieces.length===4,'four simultaneous pieces');
  assert(S.appearance.mouthwear==='flower','applied independent slots');
  assert(JSON.parse(localStorage.getItem('pg_save3_'+currentUser)).appearance.mouthwear==='flower','actual saved selection');
  assert(S.cls==='Novice'&&JSON.stringify(S.eq)===gear,'cosmetics retain job and gear');
 }
 const saved=JSON.stringify(S.appearance);change('mouthwear','leaf');action('cancel');await ready();assert(JSON.stringify(wardrobeState.draft)===saved,'cancel restores all slots');
 for(const field of Object.keys(PGWardrobe.ACCESSORIES))change(field,'none');await ready();action('apply');assert(wardrobeState.look.pieces.length===0,'None clears every slot');
 for(const el of document.querySelectorAll('.wardrobe select,.wardrobe button,.wardrobe canvas')){if(el.hidden)continue;const b=el.getBoundingClientRect();assert(b.left>=0&&b.right<=innerWidth+1,'control fits viewport: '+el.outerHTML.slice(0,70))}
 assert(peak<=wardrobeStore.budget,'bounded cache');return {status:'pass',viewport:[innerWidth,innerHeight],accessories:41,genders:2,views:paints,peakDecodedBytes:peak,renderer:'marked WebGL stub'};
 }finally{simAdvance=advance}
})()
