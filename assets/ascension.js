/* Load the reviewed scenery into the game's existing Three scene. */
(function(){'use strict';
let loading=null,materials=null;
function script(name,global){if(window[global])return Promise.resolve();return new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=name;tag.onload=()=>window[global]?resolve():reject(Error('Missing scenery module'));tag.onerror=()=>{tag.remove();reject(Error('Scenery download failed'))};document.head.append(tag);});}
async function ready(){
 if(!loading)loading=(async()=>{
  await script('assets/endgame/endgame-scenes.js','PGEndgameScenes');
  await script('assets/astral-scenery.js?v=156','PGAstralScenery');
  await script('assets/endgame/journey-materials.js','PGJourneyMaterials');
  let manifest=null;try{const response=await fetch('assets/endgame/textures/runtime-manifest.json');if(response.ok)manifest=await response.json();}catch(_){}
  materials=PGJourneyMaterials.create(manifest,url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url;}));
 })().catch(error=>{loading=null;throw error;});
 return loading;
}
window.PGAscension=Object.freeze({async build(map,stage){if(![10,11].includes(map)||!Number.isInteger(stage)||stage<1||stage>5)throw new RangeError('Invalid Ascension field');await ready();const kind=map===10?'astral':'thor';const surfaces=(await materials.ensure(kind)).images;const options={surfaces,createCanvas:()=>document.createElement('canvas')};return map===10?PGAstralScenery.build(stage,options):PGEndgameScenes.build(kind,[1,1,4,7,10][stage-1],options);}});
})();
