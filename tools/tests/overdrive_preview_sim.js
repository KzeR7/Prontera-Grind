// Execute the real proposal controls against the real renderer with lightweight DOM/Canvas hosts.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'tools/skill-fx-proposals/prismatic-overdrive.html'),'utf8');
const dom=new JSDOM(html,{url:'http://preview.test/',runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom,{document}=window;
function context(){const stack=[];const g={globalAlpha:1,globalCompositeOperation:'source-over',save(){stack.push(this.globalAlpha)},restore(){assert(stack.length);this.globalAlpha=stack.pop()},setTransform(){},clearRect(){},fillRect(){},fill(){},stroke(){},fillText(){},drawImage(){},createLinearGradient(){return {addColorStop(){}}},createRadialGradient(){return {addColorStop(){}}}};for(const n of ['translate','rotate','scale','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse'])g[n]=(...a)=>assert(a.every(Number.isFinite),n);for(const n of ['beginPath','closePath','clip'])g[n]=()=>{};return g}
window.HTMLCanvasElement.prototype.getContext=function(){return this._g||(this._g=context())};
Object.defineProperties(document.getElementById('stage'),{clientWidth:{value:1000},clientHeight:{value:650}});
window.matchMedia=()=>({matches:false});window.ResizeObserver=class{constructor(fn){this.fn=fn}observe(){}};window.requestAnimationFrame=()=>0;window.devicePixelRatio=1;
window.fetch=async url=>({ok:true,text:async()=>url==='/index.html'?fs.readFileSync(path.join(root,'index.html'),'utf8'):''});
window.PGWardrobe={defaults:()=>({}),Store:class{async select(client,look,from){return {base:{figureHeight:90},from}}},draw(){}};
window.PGPetSprites={Store:class{constructor(){this.catalog={assets:{'1002-idle':true}}}async init(){}async request(){return {figureHeight:70}}},draw(){}};
const modules=['assets/afterglow-animations.js','assets/skill-overdrive.js','assets/skill-afterglow.js'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];window.eval(modules+'\n'+script+'\nwindow.__OD=PGSkillOverdrive;');
const wait=()=>new Promise(r=>setTimeout(r,0));
(async()=>{
  for(let i=0;i<20&&!window.overdriveReview?.state.native;i++)await wait();
  assert(window.overdriveReview,'review API did not initialise');assert.equal(window.overdriveReview.state.count,111);assert.equal(window.overdriveReview.state.specs,111);assert.equal(window.overdriveReview.state.native,true);
  assert.equal(document.querySelectorAll('.skill-row').length,111,'library must show every effect');
  for(const id of window.__OD.catalog.map(f=>f.id)){
    await window.overdriveReview.select(id);window.overdriveReview.seek(500);
    assert.equal(window.overdriveReview.state.id,id);assert.equal(document.getElementById('stageName').textContent,window.__OD.catalog.find(f=>f.id===id).name);
    assert(document.getElementById('signature').textContent.length>30,id+' missing signature copy');
  }
  const search=document.getElementById('search');search.value='comet';search.dispatchEvent(new window.Event('input'));assert.equal(document.querySelectorAll('.skill-row').length,1);search.value='';search.dispatchEvent(new window.Event('input'));
  const cls=document.getElementById('classFilter');cls.value='Warlock';cls.dispatchEvent(new window.Event('change'));assert.equal(document.querySelectorAll('.skill-row').length,6);cls.value='';cls.dispatchEvent(new window.Event('change'));
  const tier=document.getElementById('tierFilter');tier.value='asc';tier.dispatchEvent(new window.Event('change'));assert.equal(document.querySelectorAll('.skill-row').length,6);tier.value='';tier.dispatchEvent(new window.Event('change'));
  await window.overdriveReview.select('ab_epiclesis');window.overdriveReview.setMode(false);assert.equal(window.overdriveReview.state.overdrive,false);assert.equal(document.getElementById('compareNote').hidden,false);window.overdriveReview.setMode(true);assert.equal(document.getElementById('compareNote').hidden,true);
  const timeline=document.getElementById('timeline');timeline.value='1375';timeline.dispatchEvent(new window.Event('input'));assert.equal(window.overdriveReview.state.elapsed,1375);assert.equal(window.overdriveReview.state.paused,true);
  document.getElementById('quality').value='0.6';document.getElementById('quality').dispatchEvent(new window.Event('change'));assert(document.getElementById('detailReadout').textContent.includes('0.60'));
  const backdrop=document.getElementById('backdrop');assert.equal(backdrop.value,'map','real Prontera field is the default blend-check backdrop');
  window.overdriveReview.setBackdrop('studio');assert.equal(window.overdriveReview.state.backdrop,'studio');assert.equal(document.getElementById('stage').classList.contains('map-mode'),false);
  backdrop.value='map';backdrop.dispatchEvent(new window.Event('change'));assert.equal(window.overdriveReview.state.backdrop,'map');assert.equal(document.getElementById('stage').classList.contains('map-mode'),true);
  assert(html.includes("/tools/skill-fx-proposals/prontera-field.webp"));assert(fs.statSync(path.join(root,'tools/skill-fx-proposals/prontera-field.webp')).size>10000,'real game-field capture must ship with the proposal');
  await window.overdriveReview.select('sonic');window.overdriveReview.seek(350);
  assert.equal(window.overdriveReview.state.sharedFx,false);assert.equal(document.getElementById('compare').disabled,false,'redesigned Sonic Blow needs working A/B');
  assert.equal(document.getElementById('compareText').textContent,'NEW');assert.equal(document.getElementById('modeTag').textContent,'OVERDRIVE');assert.equal(document.getElementById('compareNote').hidden,true);
  assert(document.getElementById('signature').textContent.includes('neon-orchid'));
  window.overdriveReview.setMode(false);assert.equal(window.overdriveReview.state.overdrive,false);assert.equal(document.getElementById('compareText').textContent,'OLD');assert.equal(document.getElementById('modeTag').textContent,'LEGACY');
  window.overdriveReview.setMode(true);assert.equal(window.overdriveReview.state.overdrive,true);document.getElementById('compare').click();assert.equal(window.overdriveReview.state.overdrive,false,'Sonic A/B button must toggle');window.overdriveReview.setMode(true);
  await window.overdriveReview.select('vdust');assert.equal(document.getElementById('compare').disabled,false);assert.equal(document.getElementById('patternTag').textContent,'CROSSCUT','approved Cross Slash remains available for normal A/B');
  const sources=[...document.querySelectorAll('.source-links a')];assert.deepEqual(sources.map(a=>a.getAttribute('href')),['https://www.dropbox.com/scl/fi/5rhci4wub5qvmwxndm5hi/skill-fx-demo-1.mp4?rlkey=htiy0z12cjcsiwzzq3uji34eg&st=q7cur590&dl=0','https://www.dropbox.com/scl/fi/8gr050hb9x1gj6vmrc2tk/skill-fx-demo.mp4?rlkey=eeali7ldkk6uzntnupfm0omeq&st=h6xyj5qq&dl=0'],'both supplied reference links stay preserved');assert(sources.every(a=>a.target==='_blank'&&a.rel.includes('noopener')));assert(document.querySelector('.source-note').textContent.includes('no visual analysis is claimed'),'inaccessible video frames need an honest source note');
  const server=fs.readFileSync(path.join(root,'tools/preview_server.py'),'utf8');assert(server.includes("'/overdrive': 'tools/skill-fx-proposals/prismatic-overdrive.html'"));
  console.log('Overdrive proposal: real controls and rendering initialise; 111 library rows and selectable skills, filters, meaningful Sonic Current/Overdrive A/B, fallback notice, timeline, detail control, Prontera/Studio backdrop and direct preview route passed (DOM + Canvas operations).');
})().catch(e=>{console.error(e);process.exitCode=1});
