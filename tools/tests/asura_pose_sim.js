// Asura Strike: the real cast/field draw hook uses the one-hand-down wardrobe route, never sit.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createGame } = require('./helpers/game');
const repo = path.resolve(__dirname, '../..');
let html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
for (const f of ['assets/wardrobe.js', 'assets/fourth-jobs.js', 'assets/expanded-jobs.js', 'assets/wardrobe-ui.js'])
  html = html.replace(new RegExp('<script src="' + f.replaceAll('.', '\\.') + '\\?v=[0-9]+"></script>'), () => '<script>' + fs.readFileSync(path.join(repo, f), 'utf8') + '</script>');
const g = createGame(html), ev = g.ev;
try {
  // The harness stubs playSkillFx for combat sims. Wire the actual function back in.
  const realFx = html.slice(html.indexOf('function playSkillFx'), html.indexOf('function disposeSkillFx'));
  const fx = ev(`(()=>{window.__fx=[];window.PGSignatureFx={play:(id,c)=>__fx.push(id),tick:()=>{},clear:()=>{},warm:()=>{}};
    ${realFx}
    return (id)=>playSkillFx(id,null,'#ff9b4f')})()`);
  ev(`S.cls='Sura';S.sex='m';window.__now=100000;performance.now=()=>__now;
    window.__sprite=mkWardrobeHero({cls:'Sura',base:{figureHeight:96,metadata:{actions:Object.fromEntries(
      ['idle','walk','attack','asura'].flatMap(s=>Array.from({length:8},(_,d)=>[s+d,{frames:[[]],delay:100}])))}},pieces:[]});
    heroSpr=__sprite;ensureHero=()=>{};mob={x:pl.x+1,z:pl.z};window.__drawn=[];
    PGWardrobe.draw=(ctx,look,stance,dir)=>__drawn.push(stance+dir);
    draw()`);
  assert.match(ev('__drawn.at(-1)'), /^idle[0-7]$/);
  const direction = ev('__drawn.at(-1).at(-1)'), start = ev('__sprite.userData.wardrobe.start');
  fx('ch_asura');
  assert.ok(ev('__fx.includes("ch_asura")'), 'the signature effect still plays');
  ev('draw()');
  assert.equal(ev('__drawn.at(-1)'), 'asura' + direction, 'the field renderer uses Asura in the current facing');
  ev('__now+=500;draw()');
  assert.equal(ev('__sprite.userData.wardrobe.start'), start, 'the normal route is not restarted by Asura');
  assert.equal(ev('asuraPoseActive(__now)'), true, 'the impact holds long enough to see');
  ev('az+=Math.PI/2;draw()');
  assert.match(ev('__drawn.at(-1)'), /^asura[0-7]$/);
  assert.notEqual(ev('__drawn.at(-1)'), 'asura' + direction, 'turning the camera repaints the pose');
  ev('__now+=600;draw()');
  assert.match(ev('__drawn.at(-1)'), /^idle[0-7]$/, 'the normal route resumes when the pose expires');
  console.log('  ok   Asura Strike draws the current-facing impact, holds it, and resumes standing');

  fx('su_tiger');
  assert.equal(ev('asuraPoseActive(__now)'), false, 'unrelated skills do not trigger Asura');
  for (const cls of ['Monk', 'Champion', 'Sura', 'Lord Knight', 'Rune Knight', 'Sorcerer']) {
    ev(`S.cls=${JSON.stringify(cls)};asuraPose=null`); fx('ch_asura');
    assert.equal(ev('asuraPoseActive(__now)'), ['Monk', 'Champion', 'Sura'].includes(cls), cls);
  }
  ev(`S.cls='Sura'`); fx('ch_asura');
  ev('S={...S}');
  assert.equal(ev('asuraPoseActive(__now)'), false, 'a new account state does not inherit the cast pose');
  fx('ch_asura');
  ev(`S.cls='Champion'`);
  assert.equal(ev('asuraPoseActive(__now)'), false, 'changing job cancels the old pose');
  ev(`delete __sprite.userData.wardrobe.look.base.metadata.actions.asura4;
    captureWardrobeFrame(__sprite,4,false,.5,__now,true)`);
  assert.equal(ev('__drawn.at(-1)'), 'attack4', 'a missing Asura asset falls back to the normal attack, never sit');
  console.log('  ok   only the Monk line uses the pose and missing data falls back to attack');
} finally {
  g.close();
}
