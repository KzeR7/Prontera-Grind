/* Wardrobe for the expanded roster: native bodies of its own, hair and accessories shared with the
   shipped packs. Built by tools/make_expanded_wardrobe.py (see its header for the method). */
(function(root){
'use strict';
const CLASSES={Crusader:14,Paladin:4015,'Royal Guard':4066,Sage:16,Scholar:4017,Sorcerer:4067,Alchemist:18,Biochemist:4019,Geneticist:4071,
 Monk:15,Champion:4016,Sura:4070,Rogue:17,Stalker:4018,'Shadow Chaser':4072,'Bard & Dancer':19,'Minstrel & Gypsy':4020,'Maestro & Wanderer':4068,
 Ninja:25,Gunslinger:24,'Kagerou & Oboro':4211,Rebellion:4215};
const BASE='assets/wardrobe/expanded/v1/',SITTING='../../../social/sitting/';
const fit=(l,dx,dy)=>[l[0],l[1],l[2],l[3],Math.max(0,Math.min(320-l[2],l[4]+dx)),Math.max(0,Math.min(280-l[3],l[5]+dy)),l[6],l[7]];
// Move one route of the reference job onto another job's head attach points. The client pins a
// head, and everything worn on it, at (body attach point - head attach point + own offset); only
// the body attach point is job-specific, so the difference between the two jobs is the whole move.
function reroute(ref,refCount,refAnchor,anchors,delay,clock){
 const moved=(pose,a,b)=>pose.map(l=>fit(l,a[0]-b[0],a[1]-b[1])),n=anchors.length,m=refAnchor.length;
 if(clock==='independent'||ref.frames.length!==refCount)return {delay:clock==='independent'?ref.delay:delay,frames:ref.frames.map(p=>moved(p,anchors[0],refAnchor[0]))};
 const frames=[];for(let i=0;i<n;i++){const r=n===m?i:Math.round(i*(m-1)/Math.max(1,n-1));frames.push(moved(ref.frames[r],anchors[i],refAnchor[r]))}
 return {delay,frames};
}
class Store extends PGWardrobe.Store{
 constructor(options={}){super({base:BASE,...options,classes:CLASSES});this.sitting=this.stances.includes('sit');this.derived=new WeakMap()}
 // Bodies come from this pack; hair and accessory atlases are the shipped ones, read in place.
 async init(){if(this.catalog)return this.catalog;const own=await super.init();
  if(typeof own.shared!=='string'||!/^(\.\.\/)+[a-z0-9]+\/$/.test(own.shared)||!own.tracks||!own.reference||!Number.isInteger(own.referenceJob)){this.catalog=null;throw Error('Invalid expanded wardrobe catalog')}
  const shared=this.sitting?SITTING:own.shared;let other;
  try{other=JSON.parse(new TextDecoder().decode(await this.bytes(shared+'catalog.json',512*1024)))}catch(e){this.catalog=null;throw e}
  if(other.version!==2||!other.assets){this.catalog=null;throw Error('Invalid wardrobe catalog')}
  const assets={...own.assets};
  for(const [id,r] of Object.entries(other.assets))if(/^(hair|piece)-/.test(id)){
   if(!/^poses-[a-f0-9]{20}\.json$/.test(r.meta)||!/^atlas-[a-f0-9]{20}\.png$/.test(r.image))continue;
   assets[id]={...r,meta:shared+r.meta,image:shared+r.image};
  }
  this.catalog={...own,assets};return this.catalog;
 }
 // A body atlas carries standing and sitting poses; each store keeps only the stances it draws.
 async metadata(rec){const value=await super.metadata(rec);for(const name of Object.keys(value.actions))if(!name.includes(':')&&!this.stances.includes(name.replace(/\d$/,'')))delete value.actions[name];return value}
 // Hair and accessory atlases only know the shipped jobs. Hand the shared loader this job's routes,
 // derived from the reference job's, under the "<job>:<stance><dir>" names it selects by.
 async asset(id,ids){const r=await super.asset(id,ids);if(id.startsWith('base-'))return r;
  const head=/^base-(\d+)-([mf])$/.exec(ids[0]);if(!head)throw Error('Appearance is unavailable');const job=+head[1],sex=head[2];
  let jobs=this.derived.get(r.metadata);if(!jobs){jobs=new Map();this.derived.set(r.metadata,jobs)}
  const key=job+sex;if(jobs.has(key))return {...r,metadata:jobs.get(key)};
  const c=this.catalog,track=c.tracks[sex]&&c.tracks[sex][job],reference=c.reference[sex];if(!track||!reference)throw Error('Appearance is unavailable');
  const actions={};
  for(const stance of this.stances)for(let d=0;d<8;d++){const name=stance+d,ref=r.metadata.actions[c.referenceJob+':'+name];
   if(!ref||!track[name]||!reference[name])throw Error('Mismatched animation layers');
   actions[job+':'+name]=reroute(ref,reference[name].length,reference[name],track[name].a,track[name].d,r.metadata.clock);
  }
  const metadata={clock:r.metadata.clock,actions};jobs.set(key,metadata);return {...r,metadata};
 }
}
root.PGExpandedJobs={CLASSES,Store,reroute};
})(globalThis);
