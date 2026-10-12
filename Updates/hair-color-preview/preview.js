'use strict';
(() => {
  const data=window.HAIR_CATALOG, audit=window.HAIR_AUDIT || {cases:[]};
  const $=id=>document.getElementById(id), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const state={cls:'Lord Knight',weapon:'sword',direction:'SE',stance:'idle',hair:{m:data.hairs.m[0],f:data.hairs.f[0]},
    palette:{m:0,f:0},animated:!reduced.matches,mirrored:false};
  const records=new Map(audit.cases.map(row=>[row.key,row]));
  let generation=0;
  const option=(label,value)=>new Option(label,String(value));
  for(const cls of data.classes) $('classSelect').add(option(cls.name,cls.name));
  for(const [stance,config] of Object.entries(data.stances)) $('stanceSelect').add(option(config.label,stance));
  const swatches={m:[],f:[]};
  for(const [sex,id] of [['m','male'],['f','female']]){
    for(const hair of data.hairs[sex]){
      $(id+'Hair').add(option(`Style ${hair}`,hair));
      const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',`Select ${id} hair style ${hair}`);
      const img=document.createElement('img');img.width=160;img.height=140;img.loading='lazy';img.alt='';
      const sample={...state,animated:false,hair:{...state.hair,[sex]:hair},palette:{m:0,f:0}};
      const source=HairModel.source(data,sample,sex,records,window.HAIR_IMAGES);
      // Gallery never creates a burst of requests to the external renderer.
      if(source.local)img.src=source.src;
      const label=document.createElement('span');label.textContent=`Style ${hair}`;
      button.append(img,label);button.addEventListener('click',()=>{state.hair[sex]=hair;render();});
      $(id+'Gallery').append(button);
    }
    for(const palette of data.palettes[sex]){
      $(id+'Palette').add(option(palette.label,palette.id));
      const button=document.createElement('button');button.type='button';button.textContent=String(palette.id);
      button.setAttribute('aria-label',`${id} ${palette.label}`);button.title=palette.label;
      if(palette.swatch)button.style.setProperty('--swatch',palette.swatch);
      button.addEventListener('click',()=>{state.palette[sex]=palette.id;render();});
      $(id+'Swatches').append(button);swatches[sex].push([palette.id,button]);
    }
    $(id+'Hair').addEventListener('change',()=>{state.hair[sex]=+$(id+'Hair').value;render();});
    $(id+'Palette').addEventListener('change',()=>{state.palette[sex]=+$(id+'Palette').value;render();});
  }
  const passed=audit.cases.filter(r=>r.status==='pass').length;
  const local=window.HAIR_IMAGES?audit.cases.filter(r=>r.status==='pass'&&window.HAIR_IMAGES[r.file]).length:passed;
  $('auditSummary').textContent=`81,000 selectable looks across idle, walking and attack. ${passed.toLocaleString()} source looks audited; ${local.toLocaleString()} animations saved in this copy. Audits check timing, bounds and native weapon visibility. Ordinary idle/walk can stow weapons. Other combinations need internet access.`;
  function chooseClass(name){
    const cls=data.classes.find(c=>c.name===name);if(!cls)return;
    state.cls=name;if(!cls.weapons.includes(state.weapon))state.weapon=cls.weapons[0];
    $('weaponSelect').replaceChildren(...cls.weapons.map(w=>option(w[0].toUpperCase()+w.slice(1),w)));
    render();
  }
  function render(){
    const ticket=++generation;
    $('classSelect').value=state.cls;$('weaponSelect').value=state.weapon;
    $('stanceSelect').value=state.stance;
    $('selectionTitle').textContent=state.cls;$('selectionMeta').textContent=`${data.stances[state.stance].label} · ${state.weapon} · ${state.direction}`;
    $('motion').textContent=state.animated?'Animation on':'Still frame';$('motion').setAttribute('aria-pressed',state.animated);
    $('mirror').setAttribute('aria-pressed',state.mirrored);
    document.querySelectorAll('[data-direction]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.direction===state.direction));
    for(const [sex,id] of [['m','male'],['f','female']]){
      $(id+'Hair').value=String(state.hair[sex]);$(id+'Palette').value=String(state.palette[sex]);
      $(id+'Choice').textContent=`Style ${state.hair[sex]} · Palette ${state.palette[sex]}`;
      for(const [palette,button] of swatches[sex])button.setAttribute('aria-pressed',palette===state.palette[sex]);
      const img=$(id),status=$(id+'Status'),source=HairModel.source(data,state,sex,records,window.HAIR_IMAGES);
      img.hidden=true;img.dataset.ready='false';img.dataset.key=source.key;status.classList.remove('error');
      status.textContent=source.local?'Loading saved look…':'Loading from the sprite provider…';
      $(id+'Source').href=source.url;
      const loader=new Image();let settled=false;
      const timeout=setTimeout(()=>fail(),45000);
      function fail(){
        if(settled)return;settled=true;clearTimeout(timeout);
        if(ticket!==generation)return;
        status.classList.add('error');status.textContent=source.local?'Saved image could not load. Reload to retry.':'Provider unavailable. Reload to retry, or choose Show saved samples.';
      }
      loader.onload=()=>{
        if(settled)return;settled=true;clearTimeout(timeout);
        if(ticket!==generation)return;
        if(!loader.naturalWidth){status.classList.add('error');status.textContent='Empty image. Reload to retry.';return;}
        // Display the already-loaded element. Assigning its URL to a second img
        // can trigger another request and advertise readiness before pixels exist.
        loader.id=id;loader.width=320;loader.height=280;
        loader.alt=`${id} ${state.cls}, style ${source.hair}, palette ${source.palette}, ${state.weapon}, ${state.direction} ${state.stance}`;
        loader.classList.toggle('mirrored',state.mirrored);loader.dataset.key=source.key;loader.dataset.ready='true';loader.hidden=false;
        img.replaceWith(loader);
        status.textContent=`${source.local?'Saved & audited':'Online render · not yet audited'} · ${data.stances[state.stance].label} · ${state.animated?'native motion':'still'}${state.mirrored?' · mirrored':''}`;
      };
      loader.onerror=fail;loader.src=source.src;
    }
  }
  $('classSelect').addEventListener('change',()=>chooseClass($('classSelect').value));
  $('weaponSelect').addEventListener('change',()=>{state.weapon=$('weaponSelect').value;render();});
  $('stanceSelect').addEventListener('change',()=>{state.stance=$('stanceSelect').value;render();});
  document.querySelectorAll('[data-direction]').forEach(b=>b.addEventListener('click',()=>{state.direction=b.dataset.direction;render();}));
  $('motion').addEventListener('click',()=>{state.animated=!state.animated;render();});
  $('mirror').addEventListener('click',()=>{state.mirrored=!state.mirrored;render();});
  $('retry').addEventListener('click',render);
  $('sampleLook').addEventListener('click',()=>{state.weapon='sword';state.direction='SE';state.hair={m:data.hairs.m[0],f:data.hairs.f[0]};state.palette={m:0,f:0};chooseClass('Lord Knight');});
  reduced.addEventListener('change',e=>{if(e.matches){state.animated=false;render();}});
  chooseClass(state.cls);
})();
