// Keep the selected V7 Meteor Assault choreography and vector materials.
// Give its outward blade burst a grounded shock front and stronger silhouette.
const ownerMeteorAssault=ANIM.mAss;
ANIM.mAss=t=>{
  const a=t-.24;
  if(a>=0&&a<.9){
    const r=Q(a,.47)*128,amp=E(a,.85);
    ellipse(785,493,r,r*.34,[29,20,40],amp*.85,7);
    ellipse(785,493,r,r*.34,C.violet,amp*.8,2.2);
    for(let j=0;j<7;j++){
      const an=j*TAU/7,x=785+Math.cos(an)*r,y=461+Math.sin(an)*r*.55;
      g.save();g.translate(x,y);g.rotate(an);
      poly([[28,0],[-15,-11],[-5,0],[-15,11]],[28,20,39],amp*.9);g.restore();
    }
    debris(785,491,a-.04,[99,87,113],18,.8);
  }
  ownerMeteorAssault(t);
};
