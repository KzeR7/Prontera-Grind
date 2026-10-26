const {createGame}=require('/home/vercel-sandbox/workspace/repos/github.com/kingz0007/prontera-grind/tools/tests/helpers/game');
const g=createGame();
console.log(JSON.stringify(g.ev(`(()=>{
 S=fresh();S.cls='Assassin Cross';S.lv=150;
 const random=Math.random;Math.random=()=>1;
 const rolls=[{name:'Ascended Abyss',sec:3,quality:ABYSS_ASCENDED_QUALITY},{name:'Nightmare+',sec:5,quality:1}].map(p=>({...p,agi:rollAffix('agi',{...p,tier:4,slot:'leg',mp:9}).v,aspd:rollAffix('aspd',{...p,tier:4,slot:'leg',mp:9}).v}));Math.random=random;
 const cards=CARD_CATALOG.filter(c=>c.stat==='aspd'&&c.nightmare).map(c=>({name:c.n,value:cardEffects({...c,stars:3})[0].v,fit:c.fit}));
 const gear=[['weapon','weapon','dagger'],['off','off','dagger'],['leg','leg'],['armor','armor'],['acc1','acc'],['acc2','acc']];
 for(const [key,slot,wt] of gear){const it={slot,wt,aff:[],cards:[]};for(const k of ['agi','aspd'])if(affixPool(wt==='dagger'?{slot:'weapon',wt}:it).includes(k))it.aff.push({k,v:k==='agi'?69:41});S.eq[key]=it;}
 const best=CARD_CATALOG.filter(c=>c.stat==='aspd').sort((a,b)=>b.v-a.v)[0];for(const k of ['armor','leg'])S.eq[k].cards=[{...newCard(best),stars:3}];
 const builds=[1,30,60,90,120].map(agi=>{S.st.agi=agi;return {baseAgi:agi,totalAgi:st('agi'),equipmentAspd:bon('aspd'),interval:aspd(),attacksPerSecond:1/aspd()}});
 return {rolls,cards,builds,masteryAspdCap:CARD_REWARD_CAPS.aspdPct,masteryAgiCap:CARD_REWARD_CAPS.agi};
})()`),null,2));g.close();
