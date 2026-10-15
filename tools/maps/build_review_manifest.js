// Publish the whole-route capture and eight local browser captures into the dev-only comparison proposal.
// Run after check_endgame_scenery_browser.js. Does not change the game build.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const THREE=require('./vendor/three-r128.min.js');
const api=require('./endgame-scenes.js')(THREE);
const root=path.resolve(__dirname,'../..');
const from=path.resolve(process.argv[2]||path.join(root,'tools/preview/endgame-captures'));
const to=path.join(root,'docs/map-concepts/scenery-review');
const descriptions={
 astral:[
  'The arrival section of one long floating bridge. Thin suspended stonework, ruined edge pillars and open space replace detached square platforms.',
  'The same uninterrupted bridge passing ruined gate pylons and crumbling edge masonry. This is a zone along the route, not a cathedral fighting room.',
  'A long celestial approach with luminous edge inlay, a nearby armillary and the sanctuary ahead. The paving remains connected from arrival to the boss.',
  'The bridge flares into a pointed end sanctuary with a flat ceremonial seal and broken celestial gate. The approach stays attached; this is not a separate round island.'
 ],
 thor:[
  'An exposed shelf beside an irregular molten fissure. Scattered short basalt outcrops and cooled spill tongues replace continuous walls and paired lava stripes.',
  'A large asymmetric magma basin with twin lava falls and crusted islands on one side, opposed by a sheared basalt cliff on the other.',
  'An active caldera approach framed by two volcanic vents, molten spills, obsidian ribs and more severe floor damage. Not another waterfall-gallery layout.',
  'A circular obsidian dais in a broad lava lake, encircled by a fractured basalt crown, with a giant volcanic caldera behind it. No rectangular causeway floor.'
 ]
};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report=JSON.parse(fs.readFileSync(path.join(from,'report.json'),'utf8'));
for(const file of ['tools/maps/endgame-scenes.js','tools/map_scene_preview.html']){
 if(!report.captureSources||report.captureSources[file]!==sha(fs.readFileSync(path.join(root,file))))throw new Error('Captures are stale; rerun the browser checker before publishing: '+file);
}
if(report.errors.length||report.failedRequests.length)throw new Error('Cannot publish a failed browser review');
const layouts=[];fs.mkdirSync(to,{recursive:true});
for(const destination of ['astral','thor'])for(const stage of [1,4,7,10]){
 const group=api.groupFor(stage),image=`${destination}-${stage}.png`;
 const input=path.join(from,`${destination}-${stage}-desktop.png`),b=fs.readFileSync(input);
 if(b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Not a PNG: '+input);
 fs.copyFileSync(input,path.join(to,image));
 layouts.push({destination,stage,title:api.TITLES[destination][group],footprint:destination==='astral'?(stage===10?'bridge-terminus':'bridge'):(stage===10?'circle':'natural-field'),features:api.FEATURES[destination][group],description:descriptions[destination][group],image,width:b.readUInt32BE(16),height:b.readUInt32BE(20),bytes:b.length,sha256:sha(b)});
}
const surfaceFiles=['weathered-stone.png','molten-basalt.png','astral-void.png'].map(name=>{const b=fs.readFileSync(path.join(__dirname,'textures',name));return{file:name,bytes:b.length,sha256:sha(b),kind:'Original AI-generated environment material; not native sprite art'};});
const routeBytes=fs.readFileSync(path.join(from,'astral-route-desktop.png'));fs.writeFileSync(path.join(to,'astral-route.png'),routeBytes);
const route={image:'astral-route.png',bytes:routeBytes.length,sha256:sha(routeBytes),width:routeBytes.readUInt32BE(16),height:routeBytes.readUInt32BE(20)};
const manifest={route,schemaVersion:3,status:'Actual scenery proposal captures; no enemies or combat',renderer:'Chromium WebGL 2 / ANGLE SwiftShader; not physical-device performance proof',sceneSourceSha256:sha(fs.readFileSync(path.join(__dirname,'endgame-scenes.js'))),viewerSourceSha256:sha(fs.readFileSync(path.join(root,'tools/map_scene_preview.html'))),surfaces:surfaceFiles,layouts};
fs.writeFileSync(path.join(to,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Updated the whole-bridge capture, eight local scenery captures and the source/material/checksum manifest.');
