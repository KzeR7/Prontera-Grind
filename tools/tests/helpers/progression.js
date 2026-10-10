// Source fragments for the older isolated VM suites. Full integration lives in progression_sim.
module.exports=function fragments(src,kind){
 const line=start=>{const i=src.indexOf(start);if(i<0)throw Error(start);return src.slice(i,src.indexOf('\n',i));};
 const block=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<i)throw Error(a);return src.slice(i,j)};
 if(kind==='cards')return line('const PROGRESSION_VERSION=')+'\n'+block('const CARD_STATS_BY_MAP=', 'const CARD_CATALOG=');
 if(kind==='effects')return line('const cardEffects=');
 if(kind==='affixes')return block('const affixPool=', 'function genGear(');
 if(kind==='newCard')return line('const newCard=');
 if(kind==='leech')return block('let leechWindow=', '// Physical skill training');
 throw Error(kind);
};
