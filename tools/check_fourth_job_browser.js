// Run on Updates/fourth-jobs/review.html with coderabbit-agent-browser eval.
(async()=>{
  const $=id=>document.getElementById(id),check=(ok,message)=>{if(!ok)throw Error(message)},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function ready(label){for(let i=0;i<100;i++){if($('status').textContent.startsWith(label)&&!$('status').textContent.includes('Loading'))return;await sleep(20)}throw Error('Sprite did not load: '+label+'; '+$('status').textContent)}
  const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('change'))};
  const classes=[...$('classes').children];check(classes.length===6,'class buttons');let routes=0,skills=0;
  for(const button of classes){
    button.click();await ready(button.textContent);
    check($('skills').children.length===5,'five skill cards');
    for(const sex of ['m','f']){
      change('sex',sex);await ready(button.textContent+' · '+(sex==='m'?'Male':'Female'));
      for(const stance of ['idle','walk','attack','cast'])for(let d=0;d<8;d++){
        change('stance',stance);change('direction',String(d));
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const cv=$('scene'),ctx=cv.getContext('2d'),sc=cv.width/960,ground=cv.height*.73;
        const pixels=ctx.getImageData(Math.floor(cv.width*.26-60*sc),Math.floor(ground-210*sc),Math.max(1,Math.floor(120*sc)),Math.max(1,Math.floor(190*sc))).data;
        let visible=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>100)visible++;
        check(visible>10,'blank native sprite '+button.textContent+' '+sex+' '+stance+d);routes++;
      }
    }
    for(const skill of $('skills').children){skill.click();$('timeline').value='.4';$('timeline').dispatchEvent(new Event('input'));await sleep(20);check($('pause').getAttribute('aria-pressed')==='true','scrubbing pauses');skills++}
  }
  check(routes===384&&skills===30,'route coverage');
  check(document.documentElement.scrollWidth<=innerWidth,'horizontal overflow');
  $('aura').click();check(!$('aura').checked,'aura off');$('aura').click();
  $('replay').click();await sleep(30);check(+$('timeline').value<.1,'replay resets');
  check($('pause').getAttribute('aria-pressed')==='false','replay resumes');$('pause').click();check($('pause').getAttribute('aria-pressed')==='true','pause');$('pause').click();check($('pause').getAttribute('aria-pressed')==='false','resume');
  $('classes').firstElementChild.click();change('sex','m');change('stance','idle');change('direction','0');await ready('Rune Knight · Male');
  document.querySelector('[data-skill="rk_burst"]').click();$('timeline').value='.55';$('timeline').dispatchEvent(new Event('input'));await sleep(30);
  $('replay').click();
  return {routes,skills,viewport:[innerWidth,innerHeight],overflow:false,status:$('status').textContent};
})();
