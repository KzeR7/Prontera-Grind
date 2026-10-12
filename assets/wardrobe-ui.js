/* Shared character customization and game adapter. Appearance never changes combat equipment/stats. */
const wardrobeStore=new PGWardrobe.Store();
const wardrobeState={owner:null,cls:'',sex:'',draft:null,look:null,status:'',loading:false,seq:0,stance:'idle',direction:0,still:false,start:0,paint:'',canvas:null};
let wardrobeEquipped=null,wardrobeRequested='',wardrobeFailure='';
let wardrobeClassLook=null,wardrobeClassRequest='';
function wardrobeOwner(){if(wardrobeState.owner===S)return;wardrobeStore.release('preview');wardrobeStore.release('hero');wardrobeStore.release('portrait');wardrobeClassLook=null;wardrobeClassRequest='';wardrobeState.owner=S;wardrobeState.canvas=null;wardrobeState.paint='';wardrobeState.draft=null;wardrobeState.look=null;wardrobeState.loading=false;wardrobeState.seq++;wardrobeEquipped=null;wardrobeRequested='';wardrobeFailure=''}
function wardrobeAppearance(){return PGWardrobe.normalize(S.appearance)||PGWardrobe.defaults(S.sex)}
function wardrobeSupported(cls){return Object.hasOwn(PGWardrobe.CLASSES,cls)}
function wardrobePanel(){wardrobeOwner();if(wardrobeState.cls!==S.cls||wardrobeState.sex!==S.sex){wardrobeState.cls=S.cls;wardrobeState.sex=S.sex;wardrobeState.seq++;wardrobeStore.release('preview');wardrobeState.look=null;wardrobeState.loading=false;wardrobeState.draft=null;wardrobeState.canvas=null}
 if(!wardrobeSupported(S.cls))return '<div class="hd">Wardrobe</div><p>Hair and costume customization is available for the Swordsman, Thief and Archer class trees. Your saved choices will follow you when you return to a supported class.</p>'; if(!wardrobeState.draft){wardrobeState.draft=wardrobeAppearance();wardrobeState.status='';wardrobeState.look=null}
 const a=wardrobeState.draft,sex=a.sex,option=(v,label,current)=>`<option value="${v}"${v===current?' selected':''}>${label}</option>`;
 return `<div class="wardrobe"><div class="hd">${S.cls==='Swordman'?'Swordsman':S.cls} Wardrobe</div><small>Choose your hairstyle, hair color and costume accessories. Your look follows you across supported classes.</small>
 <div class="wardrobe-fitting"><div class="wardrobe-stage"><canvas id="wardrobeCanvas" width="320" height="280" role="img" aria-label="Animated ${S.cls} wardrobe preview"></canvas></div><div class="wardrobe-controls">
 <div class="wardrobe-fields">
 <label>Hairstyle<select data-wardrobe="head">${PGWardrobe.HAIRS[sex].map(h=>option(h,'Style '+h,a.heads[sex])).join('')}</select></label>
 <label>Hair color<select data-wardrobe="color">${Array.from({length:9},(_,i)=>option(i,'Color '+(i+1),a.colors[sex])).join('')}</select></label></div>
 <fieldset class="wardrobe-accessories"><legend>Costume accessories</legend>${['halo','glasses','wings'].map(k=>`<label><input type="checkbox" data-wardrobe="${k}"${a[k]?' checked':''}> ${k==='halo'?'Angel halo':k==='glasses'?'Glasses':'Archangel wings'}</label>`).join('')}</fieldset>
 <div class="wardrobe-fields"><label>Preview action<select data-wardrobe="stance">${['idle','walk','attack'].map(k=>option(k,k==='idle'?'Idle':k==='walk'?'Walk':'Attack',wardrobeState.stance)).join('')}</select></label>
 <label>Facing<select data-wardrobe="direction">${['South','Southwest','West','Northwest','North','Northeast','East','Southeast'].map((n,i)=>option(i,n,wardrobeState.direction)).join('')}</select></label></div>
 <div class="row"><label><input type="checkbox" data-wardrobe="still"${wardrobeState.still?' checked':''}> Still frame</label><button data-wardrobe-action="play">Play again</button></div>
 <p id="wardrobeStatus" class="wardrobe-status" role="status" aria-live="polite"></p><div class="row"><button data-wardrobe-action="apply" id="wardrobeApply">Apply look</button><button data-wardrobe-action="cancel">Cancel changes</button><button data-wardrobe-action="retry">Retry loading</button></div>
 <button class="full" data-wardrobe-action="original">Reset hair and costume</button><small>Cosmetics are free. Some hair colors repeat. Change character gender in Settings.</small></div></div></div>`;
}
V.wardrobe=wardrobePanel;
function wardrobeStatus(){const el=$('wardrobeStatus');if(el)el.textContent=wardrobeState.loading?'Loading appearance…':wardrobeState.status||'Ready to try on. Apply saves your choice.';const button=$('wardrobeApply');if(button)button.disabled=wardrobeState.loading||!wardrobeState.look||(wardrobeState.look.cls!==S.cls||PGWardrobe.key(wardrobeState.look.selection)!==PGWardrobe.key(wardrobeState.draft))}
function wardrobeLoad(){const a=PGWardrobe.normalize(wardrobeState.draft);if(!a)return;const owner=S,cls=S.cls,seq=++wardrobeState.seq;wardrobeState.loading=true;wardrobeStatus();
 wardrobeStore.select('preview',a,cls).then(look=>{if(!look||seq!==wardrobeState.seq||S!==owner||S.cls!==cls||!tabs.includes('wardrobe'))return;wardrobeState.look=look;wardrobeState.loading=false;wardrobeState.paint='';wardrobeState.start=performance.now();wardrobeState.status='';wardrobeStatus();wardrobePreview()}).catch(()=>{if(seq!==wardrobeState.seq||S!==owner||S.cls!==cls)return;wardrobeState.loading=false;wardrobeState.status='This appearance could not load. Your saved look is unchanged. Try again.';wardrobeStatus()})}
function wardrobeSync(){wardrobeOwner();if(!tabs.includes('job')){wardrobeStore.release('portrait');wardrobeClassLook=null;wardrobeClassRequest=''}if(!tabs.includes('wardrobe')||!wardrobeSupported(S.cls)){if(wardrobeState.draft){wardrobeState.seq++;wardrobeStore.release('preview');wardrobeState.draft=null;wardrobeState.look=null;wardrobeState.loading=false;wardrobeState.canvas=null}return}
 const cv=$('wardrobeCanvas');if(cv!==wardrobeState.canvas){wardrobeState.canvas=cv;wardrobeState.paint='';if(!wardrobeState.look&&!wardrobeState.loading)wardrobeLoad()}wardrobeStatus();wardrobePreview()}
function wardrobePreview(){const st=wardrobeState,cv=$('wardrobeCanvas');if(!cv||!st.look||!st.draft)return;const still=st.still||matchMedia('(prefers-reduced-motion: reduce)').matches,ms=still?0:performance.now()-st.start;
 const view=st.look.base.metadata.actions[st.stance+st.direction],progress=st.stance==='attack'?Math.min(1,ms/(view.frames.length*view.delay)):null,i=PGWardrobe.frameIndex(view,ms,progress),paint=JSON.stringify([st.look.key,st.draft.halo,st.draft.glasses,st.draft.wings,st.stance,st.direction,i]);
 if(st.paint===paint&&st.canvas===cv)return;st.canvas=cv;st.paint=paint;PGWardrobe.draw(cv.getContext('2d'),{...st.look,selection:st.draft},st.stance,st.direction,ms,progress)}
function wardrobeChange(field,value){const st=wardrobeState;if(!st.draft)return;let asset=false;
 if(field==='sex'){st.draft.sex=value==='f'?'f':'m';asset=true}else if(field==='head'){st.draft.heads[st.draft.sex]=+value;asset=true}else if(field==='color'){st.draft.colors[st.draft.sex]=+value;asset=true}
 else if(['halo','glasses','wings'].includes(field))st.draft[field]=!!value;
 else if(field==='stance')st.stance=['idle','walk','attack'].includes(value)?value:'idle';else if(field==='direction')st.direction=Math.max(0,Math.min(7,+value||0));else if(field==='still')st.still=!!value;
 st.draft=PGWardrobe.normalize(st.draft);st.start=performance.now();st.paint='';st.status='';if(asset)wardrobeLoad();renderWin();wardrobeSync();
}
function wardrobeAction(action){const st=wardrobeState;if(!st.draft)return;
 if(action==='retry'){wardrobeRequested='';wardrobeFailure='';wardrobeLoad();return}if(action==='play'){st.start=performance.now();st.paint='';wardrobePreview();return}
 if(action==='cancel'){st.draft=wardrobeAppearance();wardrobeLoad();renderWin();return}
 if(action==='original'){S.appearance=null;wardrobeEquipped=null;wardrobeRequested='';wardrobeFailure='';wardrobeStore.release('hero');heroKey='';st.draft=wardrobeAppearance();st.status='Default hair and costume restored.';wardrobeLoad();save();ui();return}
 if(action==='apply'){
  if(st.loading||!st.look||st.look.cls!==S.cls||PGWardrobe.key(st.look.selection)!==PGWardrobe.key(st.draft))return;
  S.appearance=PGWardrobe.normalize(st.draft);S.sex=S.appearance.sex;wardrobeRequested='';wardrobeFailure='';heroKey='';st.status='Look applied.';save();ui();
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
 const route=stance+dir;if(route!==sk.route){sk.route=route;sk.start=now}const v=sk.look.base.metadata.actions[route],progress=attack>0?Math.max(0,Math.min(1,1-attack)):null,ms=now-sk.start,i=PGWardrobe.frameIndex(v,ms,progress),paint=route+':'+i;
 if(sk.paint===paint)return false;PGWardrobe.draw(sk.cv.getContext('2d'),sk.look,stance,dir,ms,progress);sk.paint=paint;sk.tex.needsUpdate=true;return true}
function wardrobePortrait(cv,cls){
 if(!wardrobeSupported(cls)){cv._wardrobePaint='';return false}
 let look=wardrobeEquipped&&wardrobeEquipped.cls===cls?wardrobeEquipped:null;
 if(cls!==S.cls&&tabs.includes('job')){
  const a=wardrobeAppearance(),key=JSON.stringify([cls,a]);
  if(key!==wardrobeClassRequest){wardrobeClassRequest=key;const owner=S;wardrobeStore.select('portrait',a,cls).then(next=>{if(next&&S===owner&&wardrobeClassRequest===key){wardrobeClassLook=next;drawClassPreview()}}).catch(()=>{})}
  look=wardrobeClassLook&&wardrobeClassLook.cls===cls?wardrobeClassLook:null;
 }
 if(!look){cv._wardrobePaint='';return false}
 const view=look.base.metadata.actions.idle0,ms=performance.now(),i=PGWardrobe.frameIndex(view,ms,null),key=JSON.stringify([look.key,look.selection,i,cv.width,cv.height]);if(cv._wardrobePaint===key)return true;
 const temp=wardrobePortrait.canvas||(wardrobePortrait.canvas=document.createElement('canvas'));if(temp.width!==320||temp.height!==280){temp.width=320;temp.height=280}PGWardrobe.draw(temp.getContext('2d'),look,'idle',0,ms);const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(temp,97,72,126,134,0,0,cv.width,cv.height);cv._wardrobePaint=key;return true}
