(async()=>{
 const $=id=>document.getElementById(id),work=spriteWorkshop;
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const select=async(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('change',{bubbles:true}));await work.loader.queue;await Promise.resolve();check($('retry').hidden,$('status').textContent);};
 await select('sex','f');await select('hair','2');await select('palette','8');
 check(work.loader.current.record.sex==='f'&&work.loader.current.record.palette===8,'female selection');
 await select('sex','m');await select('hair','42');await select('palette','8');
 await select('sex','f');check($('hair').value==='2'&&$('palette').value==='8','independent gender memory');
 await select('stance','attack');await select('direction','S');
 $('still').checked=false;$('mirror').checked=false;$('replay').click();
 await new Promise(r=>setTimeout(r,1100));
 check($('frame-label').textContent==='Frame 9 / 9','attack must clamp at final frame');
 await new Promise(r=>setTimeout(r,300));check($('frame-label').textContent==='Frame 9 / 9','attack must not loop');
 $('still').checked=true;$('still').dispatchEvent(new Event('change'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 check($('frame-label').textContent==='Frame 1 / 9','still frame');
 const previous=work.loader.current,fetcher=work.loader.fetcher;
 work.loader.fetcher=async()=>{throw Error('Synthetic offline check');};
 $('palette').value='7';await work.load();
 check(work.loader.current===previous&&!$('retry').hidden,'failure preserves previous look and offers retry');
 work.loader.fetcher=fetcher;$('retry').click();await work.loader.queue;
 check(work.loader.current.record.palette===7,'retry success');
 const width=document.documentElement.clientWidth;
 check(document.documentElement.scrollWidth<=width,'horizontal overflow');
 for(const id of ['character','sex','hair','palette','stance','direction']){const r=$(id).getBoundingClientRect();check(r.left>=0&&r.right<=width+.5,'control outside viewport: '+id);}
 const remote=performance.getEntriesByType('resource').filter(r=>new URL(r.name).origin!==location.origin);
 check(!remote.length,'external browser requests');
 return {status:'pass',width,stats:work.loader.stats(),remoteRequests:remote.length,genderMemory:true,attackClamp:true,still:true,retry:true};
})()
