// Evaluate on the served studio or compact export with coderabbit-agent-browser eval.
(async()=>{
 const data=window.HAIR_CATALOG,compact=!!window.HAIR_COMPACT,failures=[];
 const rows=window.HAIR_AUDIT.cases.filter(r=>!compact||window.HAIR_IMAGES[r.file]);
 const set=(id,value)=>{const e=document.getElementById(id);e.value=String(value);e.dispatchEvent(new Event('change'))};
 const ready=()=>new Promise((resolve,reject)=>{const began=Date.now();function poll(){if(['male','female'].every(id=>document.getElementById(id).dataset.ready==='true'))return resolve();if(Date.now()-began>15000)return reject(Error('UI look timed out'));setTimeout(poll,10)}poll()});
 if(document.getElementById('motion').getAttribute('aria-pressed')!=='true')document.getElementById('motion').click();
 if(document.getElementById('mirror').getAttribute('aria-pressed')==='true')document.getElementById('mirror').click();
 let loaded=0;
 for(let start=0;start<rows.length;start+=6){
  await Promise.all(rows.slice(start,start+6).map(row=>new Promise((resolve,reject)=>{const im=new Image(),timer=setTimeout(()=>reject(Error(row.key+' timed out')),15000);im.onload=()=>{clearTimeout(timer);if(im.naturalWidth!==320)failures.push(row.key);loaded++;resolve()};im.onerror=()=>{clearTimeout(timer);failures.push(row.key);resolve()};im.src=window.HAIR_IMAGES?.[row.file] || 'art/'+row.file})));
 }
 document.getElementById('sampleLook').click();await ready();let choices=0;
 for(const stance of Object.keys(data.stances)){
  set('stanceSelect',stance);await ready();
  for(let i=0;i<(compact?1:20);i++)for(let p=0;p<(compact?1:9);p++){
   set('maleHair',data.hairs.m[i]);set('femaleHair',data.hairs.f[i]);set('malePalette',p);set('femalePalette',p);await ready();
   for(const [sex,id] of [['m','male'],['f','female']]){
    const im=document.getElementById(id),expected=`4008-${sex}-sword-${data.hairs[sex][i]}-${p}-SE${stance==='attack'?'':'-'+stance}`;
    if(im.dataset.key!==expected || im.naturalWidth!==320)failures.push(expected);
    if(compact&&!im.src.startsWith('data:'))failures.push('Unexpected network source '+expected);
   }choices+=2;
  }
 }
 document.getElementById('mirror').click();await ready();if(!document.getElementById('male').classList.contains('mirrored'))failures.push('mirror');
 document.getElementById('motion').click();await ready();if(!(document.getElementById('female').src.endsWith('-still.png') || (compact && document.getElementById('motion').textContent==='Still frame')))failures.push('still');
 const result={compact,loaded,stanceStyleColorChoices:choices,failures,overflow:document.documentElement.scrollWidth>innerWidth};
 if(failures.length || result.overflow)throw Error(JSON.stringify(result));
 return result;
})()
