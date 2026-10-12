'use strict';
(() => {
  const data=window.CLASS_WEAPON_AUDIT;
  const $=id=>document.getElementById(id);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const state={cls:'Lord Knight',weapon:'sword',hair:40,direction:'SE',animated:!reduced.matches,mirrored:false};
  const title=s=>s[0].toUpperCase()+s.slice(1);
  const cases=new Map(data.cases.map(c=>[c.key,c]));
  const buttons=new Map();
  let generation=0;
  const option=(text,value)=>new Option(text,value);
  for(const cls of data.catalog.classes){
    $('classSelect').add(option(cls.name,cls.name));
    const b=document.createElement('button');
    b.type='button';
    const name=document.createElement('b');name.textContent=cls.name;
    const coverage=document.createElement('small');
    const rows=data.cases.filter(c=>c.class===cls.name),passed=rows.filter(c=>c.status==='pass').length;
    coverage.textContent=`${passed}/${rows.length} looks checked`;
    b.append(name,coverage);b.setAttribute('aria-pressed','false');
    b.addEventListener('click',()=>chooseClass(cls.name));
    $('classes').append(b);buttons.set(cls.name,b);
  }
  for(const hair of data.catalog.hairs)$('hairSelect').add(option(`Style ${hair.id}`,String(hair.id)));
  const routes=data.catalog.classes.reduce((n,c)=>n+c.weapons.length*2,0);
  $('coverage').textContent=`${data.catalog.classes.length} classes · both genders`;
  $('routeCount').textContent=`${routes} class / gender / weapon combinations`;
  $('auditSummary').textContent=`${data.summary.pass} / ${data.cases.length} cached looks passed the asset checks. These checks establish source coverage and visible weapon pixels; the preview lets you inspect the fit.`;
  function chooseClass(name){
    const cls=data.catalog.classes.find(c=>c.name===name);
    if(!cls)return;
    state.cls=name;
    if(!cls.weapons.includes(state.weapon))state.weapon=cls.weapons[0];
    $('weaponSelect').replaceChildren(...cls.weapons.map(w=>option(title(w),w)));
    render();
  }
  function render(){
    const ticket=++generation;
    const cls=data.catalog.classes.find(c=>c.name===state.cls);
    $('classSelect').value=state.cls;$('weaponSelect').value=state.weapon;$('hairSelect').value=String(state.hair);
    $('selectionTitle').textContent=state.cls;
    $('selectionMeta').textContent=`${title(state.weapon)} · Style ${state.hair}`;
    for(const [name,b] of buttons)b.setAttribute('aria-pressed',name===state.cls);
    document.querySelectorAll('[data-direction]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.direction===state.direction));
    $('motion').setAttribute('aria-pressed',state.animated);$('motion').textContent=state.animated?'Animation on':'Still frame';
    $('mirror').setAttribute('aria-pressed',state.mirrored);
    for(const [sex,id] of [['m','male'],['f','female']]){
      const img=$(id),status=$(id+'Status'),frames=$(id+'Frames');
      img.hidden=true;img.dataset.ready='false';status.classList.remove('error');status.textContent='Loading look…';frames.textContent='';
      const key=`${cls.job}-${sex}-${state.weapon}-${state.hair}-${state.direction}`;
      const rec=cases.get(key);
      if(!rec||rec.status!=='pass'){
        status.textContent='This combination has not passed the source checks.';status.classList.add('error');continue;
      }
      const filename=state.animated?rec.file:rec.file.replace('.png','-still.png');
      const url=window.CLASS_WEAPON_IMAGES?window.CLASS_WEAPON_IMAGES[filename]:'art/'+filename;
      const image=new Image();
      image.onload=()=>{
        if(ticket!==generation)return;
        img.src=url;img.alt=`${title(id)} ${state.cls}, ${state.weapon}, hair style ${state.hair}, ${state.direction} attack`;
        img.classList.toggle('mirrored',state.mirrored);img.dataset.key=key;img.dataset.ready='true';img.hidden=false;
        frames.textContent=`${rec.frames} native frames`;
        status.textContent=`${state.animated?'Native attack animation':'First frame'} · ${state.direction}${state.mirrored?' · mirrored':''}`;
      };
      image.onerror=()=>{
        if(ticket!==generation)return;
        status.textContent='Image could not load. Use Reload look to retry.';status.classList.add('error');
      };
      if(url)image.src=url;else image.onerror();
    }
  }
  $('classSelect').addEventListener('change',()=>chooseClass($('classSelect').value));
  $('weaponSelect').addEventListener('change',()=>{state.weapon=$('weaponSelect').value;render();});
  $('hairSelect').addEventListener('change',()=>{state.hair=+$('hairSelect').value;render();});
  document.querySelectorAll('[data-direction]').forEach(b=>b.addEventListener('click',()=>{state.direction=b.dataset.direction;render();}));
  $('motion').addEventListener('click',()=>{state.animated=!state.animated;render();});
  $('mirror').addEventListener('click',()=>{state.mirrored=!state.mirrored;render();});
  $('retry').addEventListener('click',render);
  reduced.addEventListener('change',e=>{if(e.matches){state.animated=false;render();}});
  chooseClass(state.cls);
})();
