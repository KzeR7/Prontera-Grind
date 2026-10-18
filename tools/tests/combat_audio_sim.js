const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const code=fs.readFileSync('assets/combat-audio.js','utf8');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
function harness({fail=false}={}){
 const events={},voices=[],requests=[];let ctx,broken=fail;
 class AudioContext{
  constructor(){ctx=this;this.state='suspended';this.currentTime=1;this.destination={};}
  resume(){this.state='running';return Promise.resolve();}
  decodeAudioData(file){return Promise.resolve({file});}
  createBufferSource(){const v={connect(g){v.gain=g.gain},disconnect(){v.disconnected=true},start(time){v.started=time}};voices.push(v);return v;}
  createGain(){return {gain:{},connect(){},disconnect(){}};}
 }
 const document={hidden:false,addEventListener:(name,cb)=>events[name]=cb},window={AudioContext};
 vm.runInNewContext(code,{window,document,fetch:async url=>{requests.push(url);if(broken)throw Error('offline');return {ok:true,arrayBuffer:async()=>url}}});
 return {events,voices,requests,document,window,audio:window.CombatAudio,get ctx(){return ctx},recover(){broken=false}};
}
(async()=>{
 const h=harness(),{audio,voices}=h;
 audio.hit(false);assert.equal(voices.length,0,'no audio before interaction');assert.equal(h.requests.length,0);
 h.events.pointerdown();audio.hit(false);await flush();assert.equal(voices.length,0,'loading must not replay a stale contact');
 assert.equal(h.requests.length,16,'each unique recording is fetched once');h.events.keydown();assert.equal(h.requests.length,16);
 const expected={sword:'sword',dagger:'sword',spear:'spear',axe:'axe',mace:'mace',katar:'mace',staff:'rod',bow:'arrow',fist:'fist1',unknown:'fist1'};
 for(const [weapon,file]of Object.entries(expected)){
  h.ctx.currentTime+=1;audio.hit(false,true,weapon);const normal=voices.at(-1);assert.equal(normal.buffer.file,`assets/audio/hits/_hit_${file}.wav`);
  const count=voices.length;audio.hit(false,true,weapon);assert.equal(voices.length,count,'rapid AoE bounded');
  h.ctx.currentTime+=.04;audio.hit(true,true,weapon);assert.equal(voices.length,count+1,'crit takes priority');
  assert.equal(voices.at(-1).buffer,normal.buffer,'RO crit uses the same weapon contact recording');
  for(const v of voices.slice(-2))v.onended();
 }
 h.ctx.currentTime+=1;let count=voices.length;
 audio.hit(false,false);assert.equal(voices.length,count,'saved off switch');h.document.hidden=true;audio.hit(false);assert.equal(voices.length,count,'hidden tab is quiet');h.document.hidden=false;
 h.ctx.state='suspended';audio.hit(false);assert.equal(voices.length,count,'suspended context is quiet');h.events.keydown();
 for(let i=0;i<20;i++){h.ctx.currentTime+=1;audio.hit(true)}
 assert.equal(voices.length,count+4,'bounded active sources even if completion callbacks stall');
 voices.at(-1).onended();assert.equal(voices.at(-1).disconnected,true);h.ctx.currentTime+=1;audio.hit(true);assert.equal(voices.length,count+5,'completed voices free capacity');
 const motions={sword:'sword',dagger:'short_sword',spear:'spear',axe:'axe',mace:'mace',katar:'katar',staff:'rod',bow:'bow1',fist:'fist',unknown:'fist'};
 for(const [weapon,file]of Object.entries(motions)){
  audio.attack(true,weapon);assert.equal(voices.at(-1).buffer.file,`assets/audio/attacks/attack_${file}.wav`);
  assert.equal(voices.at(-1).started,h.ctx.currentTime);voices.at(-1).onended();
 }
 count=voices.length;audio.attack(false);assert.equal(voices.length,count);
 h.document.hidden=true;audio.attack();assert.equal(voices.length,count);h.document.hidden=false;
 const crowded=harness();crowded.events.pointerdown();await flush();
 for(let i=0;i<20;i++){crowded.ctx.currentTime+=1;crowded.audio.hit(true,true,'fist','pet');crowded.audio.hit(true,true,'sword','skill')}
 assert.equal(crowded.voices.length,4,'pet/skill channels are bounded');
 crowded.audio.attack(true,'katar');crowded.audio.hit(false,true,'katar');
 assert.equal(crowded.voices.length,6,'background hits cannot suppress attack motion or player contact');
 assert.equal(crowded.voices.at(-2).buffer.file,'assets/audio/attacks/attack_katar.wav');
 assert.ok(crowded.voices.at(-1).gain.value>crowded.voices[0].gain.value,'player contact louder than pet');
 for(let i=0;i<20;i++)crowded.audio.attack();assert.equal(crowded.voices.length,13,'attack voices bounded separately');
 const retry=harness({fail:true});retry.events.pointerdown();await flush();retry.audio.hit(false);await flush();assert.equal(retry.voices.length,0,'failed fetch is silent');retry.recover();retry.events.keydown();await flush();retry.audio.hit(false);assert.equal(retry.voices.length,1,'failed fetch retries');
 vm.runInNewContext(code,{window:{},document:{addEventListener:(name,cb)=>cb()}});
 for(const folder of ['hits','attacks']){
 const manifest=JSON.parse(fs.readFileSync(`assets/audio/${folder}/manifest.json`));
 for(const asset of manifest.assets){const bytes=fs.readFileSync(`assets/audio/${folder}/`+asset.file);assert.equal(bytes.length,asset.bytes);assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WAVE');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256)}
 }
 console.log('PASS combat audio: native WAV hashes, all weapon/crit mappings, unlock, decode cache, stale-contact drop, throttling, voice limit, off/hidden/suspended, retry and cleanup');
})().catch(error=>{console.error(error);process.exitCode=1});
