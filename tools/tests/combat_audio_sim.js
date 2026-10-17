const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const events={},voices=[];let ctx;
class AudioContext{
 constructor(){ctx=this;this.state='suspended';this.currentTime=1;this.destination={};}
 resume(){this.state='running';return Promise.resolve();}
 createOscillator(){const v={frequency:{setValueAtTime(n){v.frequencyStart=n},exponentialRampToValueAtTime(){}},connect(){},disconnect(){v.disconnected=true},start(){},stop(){}};voices.push(v);return v;}
 createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
}
const document={hidden:false,addEventListener:(name,cb)=>events[name]=cb},window={AudioContext};
vm.runInNewContext(fs.readFileSync('assets/combat-audio.js','utf8'),{window,document});
const audio=window.CombatAudio;
audio.hit(false);assert.equal(voices.length,0,'no audio before interaction');events.pointerdown();
audio.hit(false);assert.equal(voices.length,1);audio.hit(false);assert.equal(voices.length,1,'rapid AoE bounded');
ctx.currentTime+=.04;audio.hit(true);assert.equal(voices.length,2,'crit takes priority');assert.notEqual(voices[0].frequencyStart,voices[1].frequencyStart);
ctx.currentTime+=1;audio.hit(false,false);assert.equal(voices.length,2,'saved off switch');document.hidden=true;audio.hit(false);assert.equal(voices.length,2,'hidden tab is quiet');
voices[0].onended();assert.equal(voices[0].disconnected,true);
console.log('PASS combat audio: interaction unlock, ordinary/critical distinction, throttle, off, hidden tab, cleanup');
