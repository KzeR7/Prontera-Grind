/* Native class fitting and game adapter. Appearance never changes combat equipment/stats. */
const wardrobeStore=new PGWardrobe.Store();
const wardrobeState={owner:null,cls:'Lord Knight',draft:null,look:null,status:'',loading:false,seq:0,stance:'idle',direction:0,still:false,start:0,paint:'',canvas:null};
let wardrobeEquipped=null,wardrobeRequested='',wardrobeFailure='';
function wardrobeOwner(){if(wardrobeState.owner===S)return;wardrobeStore.release('preview');wardrobeStore.release('hero');wardrobeState.owner=S;wardrobeState.cls=Object.hasOwn(PGWardrobe.CLASSES,S.cls)?S.cls:'Lord Knight';wardrobeState.canvas=null;wardrobeState.paint='';wardrobeState.draft=null;wardrobeState.look=null;wardrobeState.loading=false;wardrobeState.seq++;wardrobeEquipped=null;wardrobeRequested='';wardrobeFailure=''}
function wardrobePanel(){wardrobeOwner();if(!wardrobeState.draft){wardrobeState.draft=PGWardrobe.normalize(S.appearance)||PGWardrobe.defaults(S.sex);wardrobeState.status='';wardrobeState.look=null}
 const a=wardrobeState.draft,sex=a.sex,cls=wardrobeState.cls,option=(v,label,current)=>`<option value="${v}"${v===current?' selected':''}>${label}</option>`;
 return `<div class="wardrobe"><div class="hd">${cls} fitting</div><small>Preview any supported class. Your saved cosmetics follow you through Lord Knight, the Acolyte tree and the Merchant tree.</small>
 <div class="wardrobe-fitting"><div class="wardrobe-stage"><canvas id="wardrobeCanvas" width="320" height="280" role="img" aria-label="Animated ${cls} wardrobe preview"></canvas></div><div class="wardrobe-controls">
 <div class="wardrobe-fields"><label>Class<select data-wardrobe="class">${Object.keys(PGWardrobe.CLASSES).map(c=>option(c,c,cls)).join('')}</select></label><label>Character<select data-wardrobe="sex">${option('m','Male',sex)+option('f','Female',sex)}</select></label>
 <label>Hairstyle<select data-wardrobe="head">${PGWardrobe.HAIRS[sex].map(h=>option(h,'Style '+h,a.heads[sex])).join('')}</select></label>
 <label>Hair color<select data-wardrobe="color">${Array.from({length:9},(_,i)=>option(i,'Color '+(i+1),a.colors[sex])).join('')}</select></label></div>
 <fieldset class="wardrobe-accessories"><legend>Accessories</legend>${['halo','glasses','wings'].map(k=>`<label><input type="checkbox" data-wardrobe="${k}"${a[k]?' checked':''}> ${k==='halo'?'Angel halo':k==='glasses'?'Glasses':'Archangel wings'}</label>`).join('')}</fieldset>
 <div class="wardrobe-fields"><label>Preview action<select data-wardrobe="stance">${['idle','walk','attack'].map(k=>option(k,k==='idle'?'Idle':k==='walk'?'Walk':'Attack',wardrobeState.stance)).join('')}</select></label>
 <label>Facing<select data-wardrobe="direction">${['South','Southwest','West','Northwest','North','Northeast','East','Southeast'].map((n,i)=>option(i,n,wardrobeState.direction)).join('')}</select></label></div>
 <div class="row"><label><input type="checkbox" data-wardrobe="still"${wardrobeState.still?' checked':''}> Still frame</label><button data-wardrobe-action="play">Play again</button></div>
 <p id="wardrobeStatus" class="wardrobe-status" role="status" aria-live="polite"></p><div class="row"><button data-wardrobe-action="apply" id="wardrobeApply">Apply look</button><button data-wardrobe-action="cancel">Cancel changes</button><button data-wardrobe-action="retry">Retry loading</button></div>
 <button class="full" data-wardrobe-action="original">Use original class appearance</button><small>Cosmetics are free for this fitting test. Weapons and armor stats stay with your equipped gear. Recovered client palettes can differ from the earlier studio, especially newer styles. Some colors repeat.</small></div></div></div>`;
}
V.wardrobe=wardrobePanel;
function wardrobeStatus(){const el=$('wardrobeStatus');if(el)el.textContent=wardrobeState.loading?'Loading appearance…':wardrobeState.status||'Ready to try on. Apply saves your choice.';const button=$('wardrobeApply');if(button)button.disabled=wardrobeState.loading||!wardrobeState.look||wardrobeState.look.key!==PGWardrobe.key(wardrobeState.draft,wardrobeState.cls)}
function wardrobeLoad(){const a=PGWardrobe.normalize(wardrobeState.draft);if(!a)return;const owner=S,seq=++wardrobeState.seq;wardrobeState.loading=true;wardrobeStatus();
 wardrobeStore.select('preview',a,wardrobeState.cls).then(look=>{if(!look||seq!==wardrobeState.seq||S!==owner||!tabs.includes('wardrobe'))return;wardrobeState.look=look;wardrobeState.loading=false;wardrobeState.paint='';wardrobeState.start=performance.now();wardrobeState.status='';wardrobeStatus();wardrobePreview()}).catch(()=>{if(seq!==wardrobeState.seq||S!==owner)return;wardrobeState.loading=false;wardrobeState.status='This appearance could not load. Your saved look is unchanged. Try again.';wardrobeStatus()})}
function wardrobeSync(){wardrobeOwner();if(!tabs.includes('wardrobe')){if(wardrobeState.draft){wardrobeState.seq++;wardrobeStore.release('preview');wardrobeState.draft=null;wardrobeState.look=null;wardrobeState.loading=false;wardrobeState.canvas=null}return}
 const cv=$('wardrobeCanvas');if(cv!==wardrobeState.canvas){wardrobeState.canvas=cv;wardrobeState.paint='';if(!wardrobeState.look&&!wardrobeState.loading)wardrobeLoad()}wardrobeStatus();wardrobePreview()}
function wardrobePreview(){const st=wardrobeState,cv=$('wardrobeCanvas');if(!cv||!st.look||!st.draft)return;const still=st.still||matchMedia('(prefers-reduced-motion: reduce)').matches,ms=still?0:performance.now()-st.start;
 const view=st.look.base.metadata.actions[st.stance+st.direction],progress=st.stance==='attack'?Math.min(1,ms/(view.frames.length*view.delay)):null,i=PGWardrobe.frameIndex(view,ms,progress),paint=JSON.stringify([st.look.key,st.draft.halo,st.draft.glasses,st.draft.wings,st.stance,st.direction,i]);
 if(st.paint===paint&&st.canvas===cv)return;st.canvas=cv;st.paint=paint;PGWardrobe.draw(cv.getContext('2d'),{...st.look,selection:st.draft},st.stance,st.direction,ms,progress)}
function wardrobeChange(field,value){const st=wardrobeState;if(!st.draft)return;let asset=false;
 if(field==='class'){if(!Object.hasOwn(PGWardrobe.CLASSES,value))return;st.cls=value;asset=true}else if(field==='sex'){st.draft.sex=value==='f'?'f':'m';asset=true}else if(field==='head'){st.draft.heads[st.draft.sex]=+value;asset=true}else if(field==='color'){st.draft.colors[st.draft.sex]=+value;asset=true}
 else if(['halo','glasses','wings'].includes(field))st.draft[field]=!!value;
 else if(field==='stance')st.stance=['idle','walk','attack'].includes(value)?value:'idle';else if(field==='direction')st.direction=Math.max(0,Math.min(7,+value||0));else if(field==='still')st.still=!!value;
 st.draft=PGWardrobe.normalize(st.draft);st.start=performance.now();st.paint='';st.status='';if(asset)wardrobeLoad();renderWin();wardrobeSync();
}
function wardrobeAction(action){const st=wardrobeState;if(!st.draft)return;
 if(action==='retry'){wardrobeLoad();return}if(action==='play'){st.start=performance.now();st.paint='';wardrobePreview();return}
 if(action==='cancel'){st.draft=PGWardrobe.normalize(S.appearance)||PGWardrobe.defaults(S.sex);wardrobeLoad();renderWin();return}
 if(action==='original'){S.appearance=null;wardrobeEquipped=null;wardrobeRequested='';wardrobeFailure='';wardrobeStore.release('hero');heroKey='';st.status='Original class appearance restored.';save();ui();return}
 if(action==='apply'){
  if(st.loading||!st.look||st.look.key!==PGWardrobe.key(st.draft,st.cls))return;
  S.appearance=PGWardrobe.normalize(st.draft);S.sex=S.appearance.sex;wardrobeRequested='';wardrobeFailure='';heroKey='';st.status=Object.hasOwn(PGWardrobe.CLASSES,S.cls)?'Look applied.':'Look saved for supported classes.';save();ui();
 }
}
$('wins').addEventListener('change',e=>{const el=e.target;if(el.dataset.wardrobe)wardrobeChange(el.dataset.wardrobe,el.type==='checkbox'?el.checked:el.value)});
$('wins').addEventListener('click',e=>{const el=e.target.closest('[data-wardrobe-action]');if(el&&!el.disabled)wardrobeAction(el.dataset.wardrobeAction)});
// Only an explicitly saved native appearance selects this path. Old saves keep their art/hair IDs.
function wardrobeHero(opt){wardrobeOwner();const a=PGWardrobe.normalize(S&&S.appearance);if(!a||!Object.hasOwn(PGWardrobe.CLASSES,opt.cls)){wardrobeEquipped=null;wardrobeRequested='';wardrobeStore.release('hero');return null}
 const k=JSON.stringify([opt.cls,a]);if(wardrobeRequested!==k){wardrobeRequested=k;const owner=S;wardrobeStore.select('hero',a,opt.cls).then(look=>{if(look&&S===owner&&wardrobeRequested===k){wardrobeEquipped=look;heroKey='';wardrobeFailure=''}}).catch(()=>{if(S===owner&&wardrobeRequested===k){wardrobeFailure='Saved appearance could not load. Open Wardrobe and retry.';log(wardrobeFailure,'r0')}})}
 return wardrobeEquipped&&wardrobeEquipped.cls===opt.cls?wardrobeEquipped:null;
}
function mkWardrobeHero(look){const cv=document.createElement('canvas');cv.width=320;cv.height=280;const tex=new THREE.CanvasTexture(cv);tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;
 const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,alphaTest:.12}));const old=window.CLASS_SKINS.classes[look.cls][look.selection.sex],px=SKIN_H/(old.height||90);
 spr.scale.set(320*px,280*px,1);spr.center.set(.5,1-200/280);spr.userData.wardrobe={look,cv,tex,paint:'',route:'',start:0};return spr}
function captureWardrobeFrame(spr,dir,run,attack,now=performance.now()){const sk=spr.userData.wardrobe,stance=attack>0?'attack':run?'walk':'idle';// Game-facing indices already follow RO S,SW,W,NW,N,NE,E,SE.
 const route=stance+dir;if(route!==sk.route){sk.route=route;sk.start=now}const v=sk.look.base.metadata.actions[route],progress=attack>0?Math.max(0,Math.min(1,1-attack)):null,ms=now-sk.start,i=PGWardrobe.frameIndex(v,ms,progress),paint=route+':'+i;
 if(sk.paint===paint)return false;PGWardrobe.draw(sk.cv.getContext('2d'),sk.look,stance,dir,ms,progress);sk.paint=paint;sk.tex.needsUpdate=true;return true}
function wardrobePortrait(cv,cls){if(!wardrobeEquipped||wardrobeEquipped.cls!==cls||!PGWardrobe.normalize(S.appearance)){cv._wardrobePaint='';return false}
 const look=wardrobeEquipped,view=look.base.metadata.actions.idle0,ms=performance.now(),i=PGWardrobe.frameIndex(view,ms,null),key=JSON.stringify([look.key,look.selection,i,cv.width,cv.height]);if(cv._wardrobePaint===key)return true;
 const temp=wardrobePortrait.canvas||(wardrobePortrait.canvas=document.createElement('canvas'));if(temp.width!==320||temp.height!==280){temp.width=320;temp.height=280}PGWardrobe.draw(temp.getContext('2d'),look,'idle',0,ms);const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(temp,97,72,126,134,0,0,cv.width,cv.height);cv._wardrobePaint=key;return true}
