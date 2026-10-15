// Select only reviewed runtime files for the in-game exploration UI.
// The workshop remains the source; no source PNGs, screenshots, tools or vendor extras ship.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const modules=['endgame-scenes.js','journey-state.js','journey-navigation.js','journey-details.js','journey-hero.js','journey-materials.js'];
function build(output){
 const out=path.join(output,'assets/endgame');fs.mkdirSync(path.join(out,'textures'),{recursive:true});
 for(const file of modules){let text=fs.readFileSync(path.join(__dirname,file),'utf8');text=text.replaceAll('/tools/maps/textures/','/assets/endgame/textures/');fs.writeFileSync(path.join(out,file),text);}
 fs.copyFileSync(path.join(__dirname,'vendor/three-r128.min.js'),path.join(out,'three-r128.min.js'));
 fs.copyFileSync(path.join(__dirname,'mob-catalog.json'),path.join(out,'mob-catalog.json'));
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'textures/runtime-manifest.json'),'utf8'));
 fs.copyFileSync(path.join(__dirname,'textures/runtime-manifest.json'),path.join(out,'textures/runtime-manifest.json'));
 for(const record of Object.values(manifest.textures)){
  if(!/^[a-z-]+-[a-f0-9]{12}\.webp$/.test(record.file))throw Error('Invalid delivery image path');
  fs.copyFileSync(path.join(__dirname,'textures',record.file),path.join(out,'textures',record.file));
 }
 let html=fs.readFileSync(path.join(root,'tools/map_journey.html'),'utf8');
 const header='<header><span>HORIZON HAVEN / JOURNEY WORKSHOP</span><a href="/tools/map_scene_review.html">Complete proposal ↗</a></header>';
 if(!html.includes(header))throw Error('Workshop header changed; review the game adapter');
 html=html.replace(header,'<header><span>WORLD ATLAS / ENDGAME EXPLORATION</span><button id="returnGame">Return to game ×</button></header>')
  .replace('Astral Citadel · Journey workshop','World Atlas · Endgame exploration')
  .replace('</style>', '.in-game-embedded body>header{display:none}.in-game-embedded .viewport{height:100vh}@media(max-width:850px){.in-game-embedded .viewport{height:66vh;min-height:390px}}</style>')
  .replace('<a href="/tools/map_scene_review.html">Return to proposal →</a>','<button data-return-game>Return to game →</button>')
  .replace('<a href="/docs/map-concepts/MOB-ART-PLAN.md">Native mob source requirements →</a>','<p>Scenery exploration only. Native mob art and gameplay integration remain pending. Your farming field and saved progression are unchanged.</p>')
  .replaceAll('/tools/maps/vendor/three-r128.min.js','/assets/endgame/three-r128.min.js').replaceAll('/tools/maps/','/assets/endgame/')
  .replace("(function(){'use strict';",`(function(){'use strict';
let character=null;try{character=JSON.parse(decodeURIComponent(location.hash.slice(1)));}catch(_){}
if(parent!==window)document.documentElement.classList.add('in-game-embedded');
function returnGame(){if(parent!==window)parent.postMessage({type:'pg-endgame-close'},location.origin);else location.href='/';}
document.getElementById('returnGame').onclick=returnGame;
document.querySelectorAll('[data-return-game]').forEach(button=>button.onclick=returnGame);
addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();returnGame();}});
`)
  .replace('location.pathname+search','location.pathname+search+location.hash')
  .replace('function loadWorld(){clearMarkers();',"function loadWorld(){if(parent!==window)parent.postMessage({type:'pg-endgame-destination',destination},location.origin);clearMarkers();")
  .replace('hero=PGJourneyHero.create({onStatus:',"hero=PGJourneyHero.create({className:character?.className||'Lord Knight',appearance:character?.appearance||null,onStatus:")
  .replace("'Native Lord Knight · original idle/walk frames'","'Your native '+(character?.className||'Lord Knight')+' · original idle/walk frames'");
 if(/\/tools\/|\/docs\//.test(html))throw Error('Dev-only route leaked into game exploration');
 fs.writeFileSync(path.join(out,'explore.html'),html);
}
if(require.main===module){if(!process.argv[2])throw Error('Pass publish directory');build(path.resolve(process.argv[2]));}
module.exports={build,modules};
