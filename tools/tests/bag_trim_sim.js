const { createGame } = require('./helpers/game');
const g = createGame(), ev = g.ev;
let pass=0, fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  ok   '+n)}catch(e){fail++;console.log('  FAIL '+n+' -> '+e.message)}};

t('a bag of 3123 items (Demonz-sized) is trimmed to BAGMAX', ()=>{
  const r = ev(`(()=>{
    S=load();
    S.inv=[]; S.zeny=0; S.cards=[]; S.gmReceipts=[];
    for(let i=0;i<3123;i++){ S.inv.push({id:i,name:'Item'+i,tier:2,slot:'armor',wt:'armor',val:12,aff:[],slots:1,cards:[],sec:0,lvl:1,quality:1}); }
    const before=S.inv.length;
    lsPut(saveKey(),JSON.stringify(S));
    S=load();
    return [before, S.inv.length, BAGMAX, S.bagOverflowCount];
  })()`);
  const [before, after, max, cnt] = r;
  if(before!==3123) throw Error('setup had '+before);
  if(after!==max) throw Error('kept '+after+' expected '+max);
  if(after+cnt!==before) throw Error('kept '+after+' + counted '+cnt+' != '+before+' - ITEMS WENT MISSING');
});

t('the trimmed items are PAID for, not merely deleted', ()=>{
  const r = ev(`(()=>{
    S=load();
    if(!(S.zeny>0)) return 'no payout: '+S.zeny;
    if(!(S.bagOverflowPaid>0)) return 'no recorded payout';
    return 'paid '+S.bagOverflowPaid+' zeny for '+S.bagOverflowCount+' items';
  })()`);
  if(typeof r === 'string' && r.startsWith('no')) throw Error(r);
  console.log('       '+r);
});

t('a bag AT the cap is left completely alone', ()=>{
  const r = ev(`(()=>{
    S=load(); S.inv=[]; S.bagOverflowCount=0; S.bagOverflowPaid=0;
    for(let i=0;i<BAGMAX;i++) S.inv.push({id:i,name:'I'+i,tier:2,slot:'armor',wt:'armor',val:9,aff:[],slots:1,cards:[],sec:0,lvl:1,quality:1});
    lsPut(saveKey(),JSON.stringify(S)); S=load();
    return [S.inv.length, S.bagOverflowCount||0, S.bagOverflowPaid||0];
  })()`);
  if(r[0]!==r[1]-0 && r[0]!==1000) {} // keep explicit
  if(r[0]!==1000) throw Error('kept '+r[0]);
  if(r[1]!==0) throw Error('trimmed an at-cap bag');
  if(r[2]!==0) throw Error('paid for an at-cap bag');
});

t('an UNDER-cap bag is untouched', ()=>{
  const r = ev(`(()=>{
    S=load(); S.inv=[]; S.bagOverflowCount=0;
    for(let i=0;i<42;i++) S.inv.push({id:i,name:'I'+i,tier:2,slot:'armor',wt:'armor',val:9,aff:[],slots:1,cards:[],sec:0,lvl:1,quality:1});
    lsPut(saveKey(),JSON.stringify(S)); S=load();
    return S.inv.length;
  })()`);
  if(r!==42) throw Error('kept '+r);
});

t('the kept items are the FIRST BAGMAX, in order', ()=>{
  const r = ev(`(()=>{
    S=load(); S.inv=[];
    for(let i=0;i<1200;i++) S.inv.push({id:i,name:'I'+i,tier:2,slot:'armor',wt:'armor',val:1,aff:[],slots:1,cards:[],sec:0,lvl:1,quality:1});
    lsPut(saveKey(),JSON.stringify(S)); S=load();
    return [S.inv[0].id, S.inv[S.inv.length-1].id, S.inv.length];
  })()`);
  if(r[2]!==1000) throw Error('kept '+r[2]);
  if(r[0]!==0) throw Error('first item is id '+r[0]);
  if(r[1]!==999) throw Error('last item is id '+r[1]);
});

console.log('\n'+pass+' passed, '+fail+' failed');
g.close(); process.exit(fail?1:0);
