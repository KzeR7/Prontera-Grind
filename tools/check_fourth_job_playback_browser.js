// Run in the shared review browser. Verify time-dependent pixels, not just buttons.
(async()=>{
 const $=id=>document.getElementById(id),cv=$('scene'),g=cv.getContext('2d'),wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(ok,n)=>{if(!ok)throw Error(n)};
 const scrub=async time=>{$('timeline').value=time;$('timeline').dispatchEvent(new Event('input'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
 const pixels=()=>g.getImageData(0,0,cv.width,cv.height).data;
 const different=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>20)n++;return n};
 [...$('classes').children].find(b=>b.textContent==='Guillotine Cross').click();
 for(let i=0;i<100&&!$('status').textContent.startsWith('Guillotine Cross ·');i++)await wait(20);
 document.querySelector('[data-skill="gc_roll"]').click();
 assert($('pause').getAttribute('aria-pressed')==='false','skill click must resume paused preview');
 await scrub(.035);const frame=cv.dataset.frame,a=pixels();assert(cv.dataset.action==='roll0','Rolling Cutter uses native action');assert(cv.dataset.nativeAction==='88','native katar action id');
 await scrub(.11);assert(frame!==cv.dataset.frame,'scrub must move native body frames');assert(different(a,pixels())>100,'native motion and FX pixels must change');
 document.querySelector('[data-skill="gc_cross"]').click();assert($('pause').getAttribute('aria-pressed')==='false','changing skill after scrub resumes');
 await wait(100);const before=+$('timeline').value,p=pixels();await wait(190);assert(+$('timeline').value>before,'timeline advances automatically');assert(different(p,pixels())>100,'playing animation pixels change');
 const fxCanvas=document.createElement('canvas');fxCanvas.width=400;fxCanvas.height=300;const fx=fxCanvas.getContext('2d'),paint=PGFourthJobVisuals.create(fx);let effects=0;
 for(const skill of FOURTH_REVIEW_SKILLS){
  fx.setTransform(1,0,0,1,0,0);fx.clearRect(0,0,400,300);fx.translate(-585,-250);paint(skill.id,(skill.id==='gc_roll'?.08:.4)*1.65,.6);
  const data=fx.getImageData(0,0,400,300).data;let visible=0;for(let i=3;i<data.length;i+=4)if(data[i]>10)visible++;
  assert(visible>30,'blank actual Canvas FX: '+skill.id);effects++;
 }
 let moving=0;
 for(const button of $('classes').children){
  button.click();for(let i=0;i<100&&!$('status').textContent.startsWith(button.textContent+' ·');i++)await wait(20);
  for(const card of $('skills').children){card.click();await scrub(0);const a=pixels();await scrub(.32);assert(different(a,pixels())>30,'effect remains blank/static: '+card.dataset.skill);moving++;}
 }
 assert(moving===30,'all effects exercised');
 [...$('classes').children].find(b=>b.textContent==='Guillotine Cross').click();document.querySelector('[data-skill="gc_roll"]').click();$('replay').click();
 return {moving,effects,rollingNativeAction:88,selectionResumes:true,scrubMovesBody:true,automaticPlayback:true,viewport:[innerWidth,innerHeight]};
})();
