// Select native frames for the review using the same timeline as the effect.
// Atlas delays remain untouched. Cast mode fits the complete clip to each swing,
// as the game's attack animation does; manual mode plays original ACT timing.
'use strict';
const PGFourthJobMotion={
  sample(record,skill,time,direction,follow=true,manual='idle'){
    const elapsed=Math.max(0,Number(time)||0),repeat=skill.repeat||1,spacing=skill.spacing||.5;
    const casting=elapsed<(skill.repeat?repeat*spacing:.85);
    let stance=manual,frame=0;
    if(follow){
      stance=casting?(record.skillActions?.[skill.id]||(['Warlock','Arch Bishop'].includes(skill.from)||skill.type!=='act'?'cast':'attack')):'idle';
    }
    const key=stance+direction,action=record.actions[key]||record.actions['idle'+direction];
    if(follow&&casting){
      const progress=skill.repeat?(elapsed%spacing)/spacing:Math.min(.999,elapsed/.85);
      frame=Math.min(action.frames.length-1,Math.floor(progress*action.frames.length));
    }else frame=Math.floor(elapsed*1000/action.delay)%action.frames.length;
    return {key,frame,action:action.action,source:action.frames[frame],casting};
  }
};
