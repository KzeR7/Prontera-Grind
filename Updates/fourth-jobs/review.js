'use strict';
(async()=>{
  const $=id=>document.getElementById(id),canvas=$('scene'),g=canvas.getContext('2d'),paint=PGAfterglowAnimations.create(g);
  let catalog,selected='Rune Knight',look=null,active='rk_charge',paused=matchMedia('(prefers-reduced-motion: reduce)').matches,age=0,last=0,request=0;
  const images=new Map();
  function pause(value){paused=value;$('pause').textContent=value?'Play':'Pause';$('pause').setAttribute('aria-pressed',String(value))}
  pause(paused);
  try{const response=await fetch('native/catalog.json');if(!response.ok)throw Error('Catalog request failed');catalog=await response.json()}catch(error){$('status').textContent='Native sprites could not load. Reload to retry.';return}
  async function select(){
    const serial=++request,key=catalog.classes[selected]+'-'+$('sex').value,record=catalog.looks[key];look=null;$('status').textContent='Loading '+selected+'…';
    try{
      let img=images.get(key);
      if(!img){img=new Image();img.src='native/'+record.image;await img.decode();if(serial!==request)return;
        if(img.naturalWidth!==record.width||img.naturalHeight!==record.height)throw Error('Invalid atlas dimensions');
        images.set(key,img);while(images.size>2)images.delete(images.keys().next().value);
      }
      if(serial!==request)return;look={record,img};$('status').textContent=selected+' · '+($('sex').value==='m'?'Male':'Female')+' · native action set';
    }catch(error){if(serial===request)$('status').textContent='Sprite could not load. Change body or class to retry.'}
  }
  function skills(){
    $('skills').replaceChildren();
    for(const skill of FOURTH_REVIEW_SKILLS.filter(s=>s.from===selected)){
      const button=document.createElement('button');button.className='skill';button.dataset.skill=skill.id;button.setAttribute('aria-pressed',String(active===skill.id));
      const name=document.createElement('strong');name.textContent=skill.n;const meta=document.createElement('small');meta.textContent=skill.cd+'s cooldown · '+(skill.type==='act'?(skill.repeat?skill.repeat+' spins / slot':skill.hits+' hit'+(skill.hits===1?'':'s')):skill.type==='buff'?'Auto buff':'Auto heal');const text=document.createElement('span');text.textContent=skill.text;button.append(name,meta,text);
      button.onclick=()=>{active=skill.id;age=0;$('follow').checked=true;pause(false);skills()};$('skills').append(button);
    }
  }
  for(const name of Object.keys(catalog.classes)){
    const button=document.createElement('button');button.textContent=name;button.setAttribute('aria-pressed',String(selected===name));
    button.onclick=()=>{selected=name;active=FOURTH_REVIEW_SKILLS.find(s=>s.from===name).id;age=0;pause(false);for(const b of $('classes').children)b.setAttribute('aria-pressed',String(b===button));skills();select()};$('classes').append(button);
  }
  $('sex').onchange=select;$('stance').onchange=()=>{$('follow').checked=false;age=0;pause(false)};$('direction').onchange=()=>{age=0};$('follow').onchange=()=>{age=0;pause(false)};
  $('pause').onclick=()=>pause(!paused);$('replay').onclick=()=>{age=0;pause(false)};$('timeline').oninput=()=>{pause(true);age=+$('timeline').value};skills();await select();
  function frame(now){
    const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(!paused){age=(age+dt)%2.8}
    const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio||1);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
    g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);g.fillStyle='#141f2a';g.fillRect(0,0,w,h);
    const scale=w/960,ground=h*.73,hero=w*.26,target=w*.73;
    g.strokeStyle='#2a3a45';g.lineWidth=1;g.beginPath();g.moveTo(0,ground+18*scale);g.lineTo(w,ground+18*scale);g.stroke();
    g.save();g.translate(target,ground);g.scale(scale,scale);g.strokeStyle='#506270';g.lineWidth=3;g.beginPath();g.ellipse(0,-38,19,36,0,0,Math.PI*2);g.stroke();g.beginPath();g.moveTo(-27,0);g.lineTo(27,0);g.stroke();g.restore();
    const current=FOURTH_REVIEW_SKILLS.find(s=>s.id===active);
    const melee=current.type==='act'&&!current.rng&&current.shape!=='single'&&current.shape!=='line'||current.dash||current.id==='gc_cross';
    const actor=$('follow').checked&&melee?target-80*scale:hero;
    if($('aura').checked)PGFourthJobVisuals.aura(g,actor,ground,age,'#dfc582',scale*1.5);
    if(look){
      const sample=PGFourthJobMotion.sample(look.record,current,age,+$('direction').value,$('follow').checked,$('stance').value),f=sample.source,size=2*scale;
      g.imageSmoothingEnabled=false;g.drawImage(look.img,f[0],f[1],f[2],f[3],actor+(f[4]-160)*size,ground+(f[5]-200)*size,f[2]*size,f[3]*size);
      canvas.dataset.action=sample.key;canvas.dataset.frame=sample.frame;canvas.dataset.nativeAction=sample.action;
    }
    const skill=FOURTH_REVIEW_SKILLS.find(s=>s.id===active),at=skill.type!=='act'||skill.shape==='radial'?actor:target;
    g.save();g.translate(at-785*scale,ground-500*scale);g.scale(scale,scale);if(active!=='gc_roll'||age<1)paint(active,(active==='gc_roll'?age%.2:age)*1.65,w<760?.6:1);g.restore();
    $('timeline').value=age;$('caption').textContent=selected+' · '+skill.n;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
