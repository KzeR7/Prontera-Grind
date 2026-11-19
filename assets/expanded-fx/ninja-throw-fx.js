/* Standalone review concepts using the user-supplied weapon images.
   See expanded-fx-research.md for references and artistic departures. */
(function(root){
'use strict';
const ids=new Set(['nj_kunai','nj_huuma','ko_huuma']);
// User-supplied shuriken artwork, preserved as transparent image.
const sprite=typeof Image==='function'?new Image():null;if(sprite)sprite.src='assets/expanded-fx/user-shuriken.png';
const kunaiImage=typeof Image==='function'?new Image():null;if(kunaiImage)kunaiImage.src='assets/expanded-fx/user-kunai-horizontal.png';
const TAU=Math.PI*2,clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-Math.pow(1-clamp(x),3);
const rand=i=>{let v=Math.sin(i*127.37+19.83)*43758.5453;return v-Math.floor(v)};
function straightPosition(start,end,p){return {x:start[0]+(end[0]-start[0])*p,y:start[1]+(end[1]-start[1])*p}}
function draw(g,id,t,project){
 if(!ids.has(id))return false;
 if(t<0||t>=2.4)return true;
 const caster=project(-1.65,1.25,0),target=project(1.65,1.2,0),floor=project(1.65,0,0),top=project(1.65,3.05,0);
 const u=Math.max(1,Math.abs(floor[1]-top[1])/3.05), kunai=id==='nj_kunai',storm=id==='ko_huuma';
 const fade=clamp((2.35-t)/.4),col=kunai?'#d5e9ff':storm?'#ff7377':'#ff6666',accent=kunai?'#7197e8':storm?'#c92432':'#bb1a2c';
 const mix=(a,b,q)=>a+(b-a)*q;
 const position=(p,lane=0)=>{const point=straightPosition(caster,target,p);if(!kunai)point.y+=lane*u*.18;return point};
 const throwAngle=Math.atan2(target[1]-caster[1],target[0]-caster[0]);
 function stroke(points,color,width,alpha,blur=0){if(alpha<=0||points.length<2)return;g.save();g.globalAlpha*=alpha;g.strokeStyle=color;g.lineWidth=Math.max(.6,width);g.lineCap='round';g.lineJoin='round';g.shadowBlur=blur;g.shadowColor=color;g.beginPath();g.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)g.lineTo(points[i].x,points[i].y);g.stroke();g.restore()}
 function halo(x,y,r,color,alpha){if(alpha<=0||r<=0)return;g.save();g.globalAlpha*=alpha;const fill=g.createRadialGradient(x,y,0,x,y,r);fill.addColorStop(0,'#ffffff');fill.addColorStop(.12,color);fill.addColorStop(1,'transparent');g.fillStyle=fill;g.beginPath();g.arc(x,y,r,0,TAU);g.fill();g.restore()}
 function ring(x,y,r,flat,alpha,width,color=col,start=0,end=TAU){if(r<=0||alpha<=0)return;g.save();g.globalAlpha*=alpha;g.strokeStyle=color;g.lineWidth=Math.max(.7,width);g.shadowColor=color;g.shadowBlur=u*.14;g.beginPath();g.ellipse(x,y,r,r*flat,0,start,end);g.stroke();g.restore()}
 function kunaiBlade(x,y,angle,size,opacity=1){
  g.save();g.translate(x,y);g.rotate(angle);g.globalAlpha*=opacity;g.shadowColor=accent;g.shadowBlur=size*.17;
  if(kunaiImage&&kunaiImage.complete&&kunaiImage.naturalWidth){g.imageSmoothingEnabled=true;g.drawImage(kunaiImage,-size*.65,-size*.2,size*1.3,size*.4)}
  g.restore();
 }
 function wheel(x,y,rotation,size,opacity=1){
  g.save();g.translate(x,y);g.rotate(rotation);g.globalAlpha*=opacity;g.shadowColor=accent;g.shadowBlur=size*.18;
  // User-supplied shuriken artwork, scaled and rotated.
  if(sprite&&sprite.complete&&sprite.naturalWidth){g.imageSmoothingEnabled=false;g.drawImage(sprite,-size*.63,-size*.63,size*1.26,size*1.26)}
  g.restore();
 }
 function impact(start,index){const age=t-start;if(age<0||age>1.2)return;const v=clamp(age/1.2),cx=target[0],cy=target[1],power=Math.exp(-age*7);
  halo(cx,cy,u*(kunai?2.15:2.6),col,power*.95);for(let j=0;j<3;j++){let wave=clamp((age-j*.08)/.55);if(wave>0&&wave<1)ring(cx,cy,u*(.25+ease(wave)*(1.2+j*.35)),.8,(1-wave)*.75,u*(.05-j*.01),j===1?'#ffffff':col)}if(kunai){for(let ray=0;ray<12;ray++){let ang=ray*TAU/12+index*.19,len=u*(1.1+rand(ray+index*23)*.8)*ease(age*14),inner=u*.12;stroke([{x:cx+Math.cos(ang)*inner,y:cy+Math.sin(ang)*inner},{x:cx+Math.cos(ang)*len,y:cy+Math.sin(ang)*len}],ray%3?'#dcecf0':'#ffffff',u*(ray%3?.028:.055),Math.exp(-age*5),0)}}ring(floor[0],floor[1],u*(.2+ease(age*2)*(kunai?1.25:2)),.3,(1-v)*.8,u*.04);
  for(let n=0;n<3;n++){let angle=(n-1)*.6+(kunai?-.3:.3),len=u*(kunai?1.05:1.55)*ease(age*8),half=(1-v)*len;let dx=Math.cos(angle)*half,dy=Math.sin(angle)*half;stroke([{x:cx-dx,y:cy-dy},{x:cx+dx,y:cy+dy}],n===1?'#ffffff':col,u*(n===1?.045:.095),(1-v)*.9,u*.2)}
  for(let i=0;i<(kunai?18:32);i++){let angle=rand(i+index*49)*TAU,r=u*(.3+rand(i+20)*1.8)*ease(v*1.8),px=cx+Math.cos(angle)*r,py=cy+Math.sin(angle)*r*.65+v*v*u*.24,prev={x:px-Math.cos(angle)*u*.17,y:py-Math.sin(angle)*u*.11};stroke([prev,{x:px,y:py}],i%3?'#ffffff':col,u*(.015+rand(i+70)*.025),(1-v)*.85,u*.09)}
 }
 g.save();g.globalAlpha=fade;
 // A brief directional release at the caster, followed by tangible projectiles.
 const release=Math.exp(-t*8);halo(caster[0],caster[1],u*.9,col,release*.65);ring(caster[0],caster[1],u*(.25+ease(t*5)*.75),1,(1-clamp(t/.45))*.6,u*.025);
 if(kunai){
  for(let i=0;i<3;i++){const start=.12+i*.13,flight=.48,age=t-start,p=age/flight,lane=i-1;if(p<0||p>1)continue;
   const path=[];for(let n=9;n>=0;n--){let z=clamp(p-n*.035);path.push(position(z,lane))}stroke(path,accent,u*.12,.55,u*.06);stroke(path,col,u*.035,.95,0);stroke(path,'#ffffff',u*.012,1,0);
   for(let j=3;j>=1;j--){let q=clamp(p-j*.065),pt=position(q,lane);kunaiBlade(pt.x,pt.y,throwAngle,u*1.45,.12*(4-j))}
   let pt=position(p,lane);halo(pt.x,pt.y,u*.42,col,.28);kunaiBlade(pt.x,pt.y,throwAngle,u*1.5);
  }
  // Separate from the in-flight condition: impacts must continue after arrival.
  for(let i=0;i<3;i++)impact(.60+i*.13,i);
 }else{
  const count=storm?3:1;
  for(let i=0;i<count;i++){let start=.12+i*.12,age=t-start;if(age<0||age>1.45)continue;
   // A boomerang trajectory: sweep through the target, hold for a cutting beat,
   // then return with a smaller silhouette; the storm orbits in staggered lanes.
   let p=age<.65?ease(age/.65):age<.92?1:1-ease((age-.92)/.53), lane=storm?(i-1)*.8:0, pt=position(p,lane),size=u*(storm?2.05:2.55)*(age>.92?.8:1),spin=age*17+i*TAU/3;
   const path=[];for(let n=12;n>=0;n--){let aa=Math.max(0,age-n*.026),pp=aa<.65?ease(aa/.65):aa<.92?1:1-ease((aa-.92)/.53);path.push(position(pp,lane))}stroke(path,accent,u*.38,.26,u*.28);stroke(path,col,u*.12,.62,u*.16);stroke(path,'#ffffff',u*.028,.8,u*.08);
   for(let j=3;j>=1;j--){let aa=Math.max(0,age-j*.042),pp=aa<.65?ease(aa/.65):aa<.92?1:1-ease((aa-.92)/.53),ghost=position(pp,lane);wheel(ghost.x,ghost.y,spin-j*.7,size,.1*(4-j))}
   halo(pt.x,pt.y,size*.9,col,.30);ring(pt.x,pt.y,size*.56,.8,.65,u*.03,col,spin,spin+4.1);wheel(pt.x,pt.y,spin,size);
  }
  for(let i=0;i<count;i++)impact(.77+i*.12,i);
  // Rotating cutting crescents persist around the impact for a moment.
  let k=clamp((t-.75)/1.1);if(t>.75&&k<1)for(let i=0;i<3;i++)ring(target[0],target[1],u*(.65+i*.4)*(1+k*.35),.65,(1-k)*.65,u*.045,col,t*5+i*2,t*5+i*2+1.75);
 }
 g.restore();return true;
}
root.PGNinjaThrowFx={has:id=>ids.has(id),ids:()=>[...ids],straightPosition,draw};
})(globalThis);
