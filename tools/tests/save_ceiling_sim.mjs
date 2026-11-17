import { checkSaveBlob, SAVE_BYTES_MAX } from '../../functions/_lib/validate.js';
const mk = n => { const S={lv:150,inv:[]}; let i=0;
  while (JSON.stringify(S).length < n) S.inv.push({id:i,name:'Item'+i,tier:2,slot:'armor',val:12,affix:[],cards:[],sec:0,lvl:1,quality:1}), i++;
  return JSON.stringify(S); };
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  ok   '+n)}catch(e){fail++;console.log('  FAIL '+n+' -> '+e.message)}};
t('300 KB ceiling is exported as 307200', ()=>{ if(SAVE_BYTES_MAX!==307200) throw Error(String(SAVE_BYTES_MAX)); });
t('a synthetic 288 KB blob is accepted (not a worst-account bound)', ()=>{ checkSaveBlob(mk(288*1024)); });
t('a 415 KB save is refused with 413', ()=>{
  try { checkSaveBlob(mk(415*1024)); throw Error('was accepted!'); }
  catch(e){ if(e.status!==413) throw Error('status '+e.status+' not 413'); }
});
t('the refusal happens BEFORE the parse', ()=>{
  // a blob that is this long but NOT valid JSON must still fail with 413, not "not valid JSON"
  const junk = 'x'.repeat(400*1024);
  try { checkSaveBlob(junk); throw Error('was accepted!'); }
  catch(e){ if(e.status!==413) throw Error('status '+e.status+' - it parsed first'); }
});
t('an oversized save costs almost no CPU to refuse', ()=>{
  const big = mk(415*1024);
  const a=process.cpuUsage(); for(let i=0;i<50;i++){ try{checkSaveBlob(big)}catch{} } const b=process.cpuUsage(a);
  const ms=(b.user+b.system)/1000/50;
  if(ms>0.05) throw Error(ms.toFixed(4)+' ms per refusal');
  console.log('       ('+ms.toFixed(4)+' ms per refusal vs ~2 ms to parse it)');
});
console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
