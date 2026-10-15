// Comparison package: real capture integrity, source consistency and actual board DOM.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'docs/map-concepts/scenery-review');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(manifest.schemaVersion,3);assert.equal(manifest.layouts.length,8);
assert.equal(manifest.sceneSourceSha256,sha(fs.readFileSync(path.join(root,'tools/maps/endgame-scenes.js'))),'Rebuild captures/manifest after changing scene source');
assert.equal(manifest.viewerSourceSha256,sha(fs.readFileSync(path.join(root,'tools/map_scene_preview.html'))),'Review captures must match viewer source');
const route=fs.readFileSync(path.join(dir,manifest.route.image));assert.equal(sha(route),manifest.route.sha256);assert.equal(route.length,manifest.route.bytes);
const seen=new Set();
for(const layout of manifest.layouts){
 const b=fs.readFileSync(path.join(dir,layout.image));assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(sha(b),layout.sha256);assert.equal(b.length,layout.bytes);assert.equal(b.readUInt32BE(16),layout.width);assert.equal(b.readUInt32BE(20),layout.height);
 assert.equal(layout.footprint,layout.destination==='astral'?(layout.stage===10?'bridge-terminus':'bridge'):(layout.stage===10?'circle':'natural-field'));assert.equal(layout.features.length,4);seen.add(layout.destination+':'+layout.stage);
}
assert.equal(seen.size,8);
for(const surface of manifest.surfaces){const b=fs.readFileSync(path.join(root,'tools/maps/textures',surface.file));assert.equal(sha(b),surface.sha256);assert.match(surface.kind,/not native sprite art/);}
const journeyDir=path.join(root,'docs/map-concepts/journey-review'),journey=JSON.parse(fs.readFileSync(path.join(journeyDir,'manifest.json'),'utf8'));
assert.equal(journey.captures.length,4);assert.equal(journey.installedMobs,0);
for(const [file,hash] of Object.entries(journey.sources))assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,'Rebuild journey captures after changing '+file);
for(const capture of journey.captures){const b=fs.readFileSync(path.join(journeyDir,capture.image));assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(sha(b),capture.sha256);assert.equal(b.length,capture.bytes);assert.equal(b.readUInt32BE(16),capture.width);assert.equal(b.readUInt32BE(20),capture.height);}
assert.deepEqual(journey.errors,[]);assert.deepEqual(journey.failed,[]);
const html=fs.readFileSync(path.join(root,'tools/map_scene_review.html'),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function board(fail=false){
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'http://preview.test/'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.fetch=async url=>({ok:!fail,json:async()=>manifest,text:async()=>fs.readFileSync(path.join(root,url),'utf8')});
 w.eval(inline);return dom;
}
(async()=>{
 const dom=board();await new Promise(resolve=>setImmediate(resolve));const d=dom.window.document;
 assert.equal(d.querySelectorAll('.card').length,8);assert.equal(d.querySelector('.journey .actions a').getAttribute('href'),'/tools/map_journey.html');assert.match(d.querySelector('.journey img').src,/journey-walk.png/);assert.match(d.querySelector('.route-hero img').src,/astral-route.png/);assert.equal(d.querySelectorAll('.card.boss').length,2);
 for(const key of ['astral','thor'])assert.equal(d.getElementById(key).querySelectorAll('.card').length,4);
 const links=[...d.querySelectorAll('.card .actions a:first-child')].map(a=>new URL(a.href));
 assert.equal(links.filter(u=>u.searchParams.get('stage')==='10').length,2);
 d.getElementById('read').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(d.getElementById('proposal').open,true);
 assert.match(d.getElementById('document').textContent,/Full Detailed Proposal/);d.getElementById('close').click();assert.equal(d.getElementById('proposal').open,false);
 dom.window.close();const failed=board(true);await new Promise(resolve=>setImmediate(resolve));assert.match(failed.window.document.querySelector('.error').textContent,/could not load/);failed.window.close();
 console.log('Scenery review: whole-route capture checksum, eight local capture checksums/dimensions, source/material consistency, distinct boss metadata, eight-card DOM, direct studio links, proposal dialog and manifest failure pass.');
})().catch(e=>{console.error(e);process.exitCode=1});
