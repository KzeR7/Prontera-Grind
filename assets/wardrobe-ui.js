/* Shared character customization and game adapter. Appearance never changes combat equipment/stats. */
const wardrobeStore=new PGWardrobe.Store();
const wardrobeState={owner:null,cls:'',sex:'',draft:null,look:null,status:'',loading:false,seq:0,start:0,paint:'',canvas:null};
let wardrobeEquipped=null,wardrobeRequested='',wardrobeFailure='';
let wardrobeClassLook=null,wardrobeClassRequest='';
function wardrobeOwner(){if(wardrobeState.owner===S)return;wardrobeStore.release('preview');wardrobeStore.release('hero');wardrobeStore.release('portrait');wardrobeClassLook=null;wardrobeClassRequest='';wardrobeState.owner=S;wardrobeState.canvas=null;wardrobeState.paint='';wardrobeState.draft=null;wardrobeState.look=null;wardrobeState.loading=false;wardrobeState.seq++;wardrobeEquipped=null;wardrobeRequested='';wardrobeFailure=''}
function wardrobeAppearance(){return PGWardrobe.normalize(S.appearance)||PGWardrobe.defaults(S.sex)}
function wardrobeSupported(cls){return Object.hasOwn(PGWardrobe.CLASSES,cls)}
function wardrobePending(cls){return wardrobeSupported(cls)&&!wardrobeFailure}
function wardrobePanel(){wardrobeOwner();if(wardrobeState.cls!==S.cls||wardrobeState.sex!==S.sex){wardrobeState.cls=S.cls;wardrobeState.sex=S.sex;wardrobeState.seq++;wardrobeStore.release('preview');wardrobeState.look=null;wardrobeState.loading=false;wardrobeState.draft=null;wardrobeState.canvas=null}
 if(!wardrobeState.draft){wardrobeState.draft=wardrobeAppearance();wardrobeState.status='';wardrobeState.look=null}
 const a=wardrobeState.draft,sex=a.sex,cls=wardrobeState.cls,option=(v,label,current)=>`<option value="${v}"${v===current?' selected':''}>${label}</option>`;
 const name=cls==='Swordman'?'Swordsman':cls;
 return `<div class="wardrobe"><div class="wardrobe-intro"><div class="hd">Your look</div><small>Make it yours. Your hair and accessories follow you when you change jobs.</small></div>
 <div class="wardrobe-fitting"><div class="wardrobe-stage"><span class="wardrobe-class">${name}</span><canvas id="wardrobeCanvas" width="320" height="280" role="img" aria-label="${name} appearance preview"></canvas></div><div class="wardrobe-controls">
 <section class="wardrobe-section"><h3>Hair</h3><div class="wardrobe-fields">
 <label>Hairstyle<select data-wardrobe="head">${PGWardrobe.HAIRS[sex].map((h,i)=>option(h,'Style '+(i+1),a.heads[sex])).join('')}</select></label>
 <label>Color<select data-wardrobe="color">${Array.from({length:9},(_,i)=>option(i,'Color '+(i+1),a.colors[sex])).join('')}</select></label></div></section>
 <section class="wardrobe-section"><h3>Accessories</h3><div class="wardrobe-fields">${Object.entries(PGWardrobe.ACCESSORIES).map(([field,slot])=>`<label>${slot.label}<select data-wardrobe="${field}">${Object.entries(slot.items).map(([id,label])=>option(id,label,a[field])).join('')}</select></label>`).join('')}</div></section>
 <small class="wardrobe-note">Some hair colors repeat. Change gender in Settings.</small></div></div>
 <div class="wardrobe-footer"><p id="wardrobeStatus" class="wardrobe-status" role="status" aria-live="polite"></p><div class="wardrobe-actions"><button data-wardrobe-action="apply" id="wardrobeApply" class="wardrobe-apply">Apply look</button><button data-wardrobe-action="cancel">Cancel changes</button><button data-wardrobe-action="retry" id="wardrobeRetry" hidden>Try again</button></div><button data-wardrobe-action="original" class="wardrobe-reset">Reset look</button></div></div>`;
}
V.wardrobe=wardrobePanel;
function wardrobeStatus(){const el=$('wardrobeStatus');if(el)el.textContent=wardrobeState.loading?'Loading appearance…':wardrobeState.status||'Preview your changes, then apply your look.';const retry=$('wardrobeRetry');if(retry)retry.hidden=!wardrobeState.status.includes('could not load');const button=$('wardrobeApply');if(button)button.disabled=wardrobeState.loading||!wardrobeState.look||(wardrobeState.look.cls!==S.cls||wardrobeState.draft.sex!==S.sex||(PGWardrobe.selectionKey(wardrobeState.look.selection)!==PGWardrobe.selectionKey(wardrobeState.draft)||wardrobeState.look.selection.outfit!==wardrobeState.draft.outfit))}
function wardrobeLoad(){const a=PGWardrobe.normalize(wardrobeState.draft);if(!a)return;const owner=S,cls=wardrobeState.cls,activeCls=S.cls,seq=++wardrobeState.seq;wardrobeState.loading=true;wardrobeStatus();
 wardrobeStore.select('preview',a,cls).then(look=>{if(!look||seq!==wardrobeState.seq||S!==owner||S.cls!==activeCls||wardrobeState.cls!==cls||!tabs.includes('wardrobe'))return;wardrobeState.look=look;wardrobeState.loading=false;wardrobeState.paint='';wardrobeState.start=performance.now();wardrobeState.status='';wardrobeStatus();wardrobePreview()}).catch(()=>{if(seq!==wardrobeState.seq||S!==owner||S.cls!==activeCls||wardrobeState.cls!==cls)return;wardrobeState.loading=false;wardrobeState.status='This appearance could not load. Your saved look is unchanged. Try again.';wardrobeStatus()})}
function wardrobeSync(){wardrobeOwner();if(!tabs.includes('job')){wardrobeStore.release('portrait');wardrobeClassLook=null;wardrobeClassRequest=''}if(!tabs.includes('wardrobe')){if(wardrobeState.draft){wardrobeState.seq++;wardrobeStore.release('preview');wardrobeState.draft=null;wardrobeState.look=null;wardrobeState.loading=false;wardrobeState.canvas=null}return}
 const cv=$('wardrobeCanvas');if(cv!==wardrobeState.canvas){wardrobeState.canvas=cv;wardrobeState.paint='';if(!wardrobeState.look&&!wardrobeState.loading)wardrobeLoad()}wardrobeStatus();wardrobePreview()}
function wardrobePreview(){const st=wardrobeState,cv=$('wardrobeCanvas');if(!cv||!st.look||!st.draft||st.look.cls!==S.cls)return;const ms=matchMedia('(prefers-reduced-motion: reduce)').matches?0:performance.now()-st.start;
 const view=st.look.base.metadata.actions.idle0,i=PGWardrobe.animationKey(st.look,'idle',0,ms),paint=JSON.stringify([st.look.key,st.draft,i]);
 if(st.paint===paint&&st.canvas===cv)return;st.canvas=cv;st.paint=paint;
 const source=wardrobePreview.source||(wardrobePreview.source=document.createElement('canvas'));source.width=320;source.height=280;
 PGWardrobe.draw(source.getContext('2d'),{...st.look,selection:st.draft},'idle',0,ms,null);
 // Frame around the loaded appearance; attachment coordinates remain native.
 const layers=[...view.frames.flat(),...st.look.hair.metadata.actions.idle0.frames.flat(),...st.look.pieces.flatMap(p=>p.metadata.actions.idle0.frames.flat())];
 const x=Math.min(...layers.map(p=>p[4])),y=Math.min(...layers.map(p=>p[5])),w=Math.max(...layers.map(p=>p[4]+p[2]))-x,h=Math.max(...layers.map(p=>p[5]+p[3]))-y,scale=Math.min(250/w,195/h),ctx=cv.getContext('2d');
 ctx.clearRect(0,0,320,280);ctx.imageSmoothingEnabled=false;ctx.drawImage(source,x,y,w,h,(320-w*scale)/2,60+(195-h*scale)/2,w*scale,h*scale)}
function wardrobeChange(field,value){const st=wardrobeState;if(!st.draft)return;let asset=false;
 if(field==='head'){st.draft.heads[st.draft.sex]=+value;asset=true}else if(field==='color'){st.draft.colors[st.draft.sex]=+value;asset=true}
 else if(['halo','glasses','wings'].includes(field)){const slot={halo:'headwear',glasses:'facewear',wings:'backwear'}[field];st.draft[slot]=value?field:'none';asset=true}
 else if(Object.hasOwn(PGWardrobe.ACCESSORIES,field)){st.draft[field]=value;asset=true}
 else if(field==='outfit'){st.draft.outfit=value;asset=true}else return;
 st.draft=PGWardrobe.normalize(st.draft);st.start=performance.now();st.paint='';st.status='';if(asset)wardrobeLoad();renderWin();wardrobeSync();
}
function wardrobeAction(action){const st=wardrobeState;if(!st.draft)return;
 if(action==='retry'){wardrobeRequested='';wardrobeFailure='';wardrobeLoad();return}
 if(action==='cancel'){st.draft=wardrobeAppearance();wardrobeLoad();renderWin();return}
 if(action==='original'){S.appearance=null;wardrobeEquipped=null;wardrobeRequested='';wardrobeFailure='';wardrobeStore.release('hero');heroKey='';st.draft=wardrobeAppearance();st.status='Default hair and costume restored.';wardrobeLoad();save();ui();return}
 if(action==='apply'){
  if(st.loading||!st.look||st.look.cls!==S.cls||st.draft.sex!==S.sex||(PGWardrobe.selectionKey(st.look.selection)!==PGWardrobe.selectionKey(st.draft)||st.look.selection.outfit!==st.draft.outfit))return;
  S.appearance=PGWardrobe.normalize(st.draft);wardrobeRequested='';wardrobeFailure='';heroKey='';st.status='Look applied.';save();ui();
 }
}
$('wins').addEventListener('change',e=>{const el=e.target;if(el.dataset.wardrobe)wardrobeChange(el.dataset.wardrobe,el.type==='checkbox'?el.checked:el.value)});
$('wins').addEventListener('click',e=>{const el=e.target.closest('[data-wardrobe-action]');if(el&&!el.disabled)wardrobeAction(el.dataset.wardrobeAction)});
// Supported classes use native sprites by default; appearance IDs customize the shared layers.
function wardrobeHero(opt){wardrobeOwner();const a=wardrobeAppearance();if(!wardrobeSupported(opt.cls)){wardrobeEquipped=null;wardrobeRequested='';wardrobeStore.release('hero');return null}
 const k=JSON.stringify([opt.cls,a]);if(wardrobeRequested!==k){wardrobeRequested=k;const owner=S;wardrobeStore.select('hero',a,opt.cls).then(look=>{if(look&&S===owner&&wardrobeRequested===k){wardrobeEquipped=look;heroKey='';wardrobeFailure=''}}).catch(()=>{if(S===owner&&wardrobeRequested===k){wardrobeFailure='Saved appearance could not load. Open Wardrobe and retry.';log(wardrobeFailure,'r0')}})}
 return wardrobeEquipped&&wardrobeEquipped.cls===opt.cls?wardrobeEquipped:null;
}
function mkWardrobeHero(look){const cv=document.createElement('canvas');cv.width=320;cv.height=280;const tex=new THREE.CanvasTexture(cv);tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;
 const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,alphaTest:.12}));const px=SKIN_H/look.base.figureHeight;
 spr.scale.set(320*px,280*px,1);spr.center.set(.5,1-200/280);spr.userData.wardrobe={look,cv,tex,paint:'',route:'',start:0};return spr}
function captureWardrobeFrame(spr,dir,run,attack,now=performance.now()){const sk=spr.userData.wardrobe,stance=attack>0?'attack':run?'walk':'idle';// Game-facing indices already follow RO S,SW,W,NW,N,NE,E,SE.
 const route=stance+dir;if(route!==sk.route){sk.route=route;sk.start=now}const v=sk.look.base.metadata.actions[route],progress=attack>0?Math.max(0,Math.min(1,1-attack)):null,ms=now-sk.start,i=PGWardrobe.animationKey(sk.look,stance,dir,ms,progress,now),glow=milestone(REFINE_GLOWS,S?.eq?.weapon?.r||0),paint=route+':'+i+(glow?':refine'+glow.at+':'+Math.floor(now/33):'');
 if(sk.paint===paint)return false;
 if(sk.trailRoute!==route||sk.trailTier!==glow?.at){sk.refineTrails=[];sk.trailRoute=route;sk.trailTier=glow?.at}
 let weaponIndex=0;const effect=glow?(ctx,image,p,phase)=>{const trail=sk.refineTrails[weaponIndex]||(sk.refineTrails[weaponIndex]={points:[],progress:null});drawNativeWeaponGlow(ctx,image,p,phase,glow,trail,progress,now);if(phase==='after')weaponIndex++}:null;
 PGWardrobe.draw(sk.cv.getContext('2d'),sk.look,stance,dir,ms,progress,now,effect);sk.paint=paint;sk.tex.needsUpdate=true;return true}
function wardrobePortrait(cv,cls){
 if(!wardrobeSupported(cls)){cv._wardrobePaint='';return false}
 let look=wardrobeEquipped&&wardrobeEquipped.cls===cls?wardrobeEquipped:null;
 if(cls!==S.cls&&tabs.includes('job')){
  const a=wardrobeAppearance(),key=JSON.stringify([cls,a]);
  if(key!==wardrobeClassRequest){wardrobeClassRequest=key;const owner=S;wardrobeStore.select('portrait',a,cls).then(next=>{if(next&&S===owner&&wardrobeClassRequest===key){wardrobeClassLook=next;drawClassPreview()}}).catch(()=>{})}
  look=wardrobeClassLook&&wardrobeClassLook.cls===cls?wardrobeClassLook:null;
 }
 if(!look){cv._wardrobePaint='';return false}
 const view=look.base.metadata.actions.idle0,ms=performance.now(),i=PGWardrobe.animationKey(look,'idle',0,ms),key=JSON.stringify([look.key,look.selection,i,cv.width,cv.height]);if(cv._wardrobePaint===key)return true;
 const temp=wardrobePortrait.canvas||(wardrobePortrait.canvas=document.createElement('canvas'));if(temp.width!==320||temp.height!==280){temp.width=320;temp.height=280}PGWardrobe.draw(temp.getContext('2d'),look,'idle',0,ms);const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(temp,97,72,126,134,0,0,cv.width,cv.height);cv._wardrobePaint=key;return true}
