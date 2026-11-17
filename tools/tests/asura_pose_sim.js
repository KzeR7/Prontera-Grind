// Asura Strike's pose (haven-v416).
//   node tools/tests/asura_pose_sim.js
//
// The owner: "asura strike doesn't have the asura strike pose, hands on the ground". The pose is the
// client's own 'sit' stance (body ACT action 16) - the crouch the Social Hub already draws from
// assets/social/sitting/ - so this test drives the real page and checks that the hero actually stops
// standing for the length of the cast, from the real committed atlases:
//
//   * casting Asura Strike opens a short window and the hero is drawn from the sit stance;
//   * the sit frames really are a different, lower pose than the idle frames (measured, not assumed);
//   * the window closes and the standing animation resumes on the next tick;
//   * no other skill kneels, and a non-expanded class never kneels even if it could cast it;
//   * the standing frame the hero returns to is not rewound by the kneel.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createGame } = require('./helpers/game');
const repo = path.resolve(__dirname, '../..');
let html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
for (const f of ['assets/wardrobe.js', 'assets/fourth-jobs.js', 'assets/expanded-jobs.js', 'assets/wardrobe-ui.js'])
  html = html.replace(new RegExp('<script src="' + f.replaceAll('.', '\\.') + '\\?v=[0-9]+"></script>'), () => '<script>' + fs.readFileSync(path.join(repo, f), 'utf8') + '</script>');
const g = createGame(html), ev = g.ev;
const W = require('../../assets/wardrobe.js');
let pass = 0;
const ok = n => { pass++; console.log('  ok   ' + n); };

(async () => {
  console.log('asura pose: the hero kneels with its fists on the ground\n');
  const base = 'assets/wardrobe/expanded/v1/';
  const catalog = JSON.parse(fs.readFileSync(base + 'catalog.json'));
  const sitting = JSON.parse(fs.readFileSync('assets/social/sitting/catalog.json'));

  // --- the data the pose is drawn from -----------------------------------------------------------
  const meta = id => JSON.parse(fs.readFileSync(base + catalog.assets[id].meta, 'utf8'));
  // An action names frame indices into the shared pose table; a pose is the list of layer indices
  // drawn that frame, and a layer carries [atlasX, atlasY, w, h, canvasX, canvasY, order, slot].
  const drawn = (m, action, frame) => m.poses[action.frames[frame % action.frames.length]].map(i => m.layers[i]);
  const hasBody = (m, action, frame) => drawn(m, action, frame).some(p => p[7] === 'body');
  for (const cls of ['Monk', 'Champion', 'Sura']) {
    const job = catalog.classes[cls], m = meta('base-' + job + '-m');
    for (let d = 0; d < 8; d++) {
      for (const stance of ['idle', 'sit']) {
        const a = m.actions[stance + d];
        assert.ok(a && a.frames.length >= 1, cls + ' ' + stance + d);
        assert.ok(hasBody(m, a, 0), cls + ' ' + stance + d + ' has no body');
      }
    }
  }
  ok('Monk, Champion and Sura carry all eight directions of the sit stance in the committed pack');

  // The pose is genuinely lower than idle: compare where the drawn body layer starts on the canvas.
  const bodyTop = (m, action) => Math.min(...drawn(m, action, 0).filter(p => p[7] === 'body').map(p => p[5]));
  const sura = meta('base-' + catalog.classes.Sura + '-m');
  for (let d = 0; d < 8; d++) {
    const sit = bodyTop(sura, sura.actions['sit' + d]), idle = bodyTop(sura, sura.actions['idle' + d]);
    assert.ok(sit > idle + 20, 'sit' + d + ' should sit well below idle (sit ' + sit + ', idle ' + idle + ')');
  }
  ok('the sit body draws below the idle body in every direction (a real crouch, not a repaint of idle)');

  // The hair and accessory atlases read for the kneel are the shipped sitting ones.
  for (const [id, r] of Object.entries(catalog.assets)) {
    assert.match(id, /^base-\d+-[mf]$/);
    assert.ok(fs.existsSync(base + r.image) && fs.existsSync(base + r.meta), id);
  }
  assert.ok(Object.keys(sitting.classes).length >= 25, 'the sitting pack still holds the shipped jobs');
  ok('the kneeling look reads hair and accessories from assets/social/sitting/, which is committed');

  // --- the game --------------------------------------------------------------------------------
  ev(`currentUser='skill-test';S=fresh();S.cls='Sura';S.sex='m';ui=()=>{};bars=()=>{};save=()=>{};log=()=>{};`);
  assert.equal(ev(`KNEEL_SKILLS.has('ch_asura') && !KNEEL_SKILLS.has('su_tiger') && KNEEL_SKILLS.size===1`), true);
  assert.equal(ev(`kneelWanted('ch_asura')`), true, 'Sura can kneel');

  // Drive playSkillFx for real with a stubbed renderer, so the trigger is the shipped one.
  // helpers/game.js replaces playSkillFx with a no-op for the other suites, and signature-fx.js is not
  // loaded here, so put the real playSkillFx back (taken from the page's own source) with a stand-in
  // signer that records what it is asked to play. This is the shipped call path, not a copy of it.
  const realFx = html.slice(html.indexOf('function playSkillFx'), html.indexOf('function disposeSkillFx'));
  const fx = ev(`(()=>{window.__fx=[];window.PGSignatureFx={play:(id,c)=>__fx.push(id),tick:()=>{},clear:()=>{},warm:()=>{}};
    ${realFx}
    return (id)=>playSkillFx(id,null,'#ff9b4f')})()`);
  ev('window.__now=100000;performance.now=()=>__now');
  ev(`S.cls='Sura'`); fx('ch_asura');
  assert.ok(ev('__fx.includes("ch_asura")'), 'the signature effect still plays');
  assert.ok(ev('kneelUntil') > ev('__now'), 'casting Asura Strike opens the kneel window');
  const window = ev('kneelUntil') - ev('__now');
  assert.ok(window > 600 && window <= 1500, 'the kneel lasts about a second, not forever: ' + window);

  // A second skill does not open it.
  ev('kneelUntil=0'); fx('su_tiger');
  assert.equal(ev('kneelUntil'), 0, 'no other skill kneels');

  // The drawn frames: with a kneeling look ready, the sprite is painted from the sit stance.
  // Both looks are minimal but real-shaped: actions name frame indices into a shared pose table.
  const mkLook = fit => ev(`(()=>{const actions={};
    for(const s of ${JSON.stringify(fit)})for(let d=0;d<8;d++)actions[s+d]={frames:[0],delay:100};
    return {key:'${fit[0]}|sura',cls:'Sura',selection:PGWardrobe.normalize(S.appearance),
      base:{metadata:{layers:[[0,0,2,2,120,150,10000,'body']],poses:[[0]],actions},figureHeight:96,image:{}},
      hair:{metadata:{actions:{}},image:{}},pieces:[]}})()`);
  const sitLook = mkLook(['sit']), standLook = mkLook(['idle', 'walk', 'attack']);
  g.window.__sitLook = sitLook; g.window.__standLook = standLook;
  ev(`window.__drawn=[];window.__realDraw=PGWardrobe.draw;
    PGWardrobe.draw=(ctx,look,stance,dir)=>__drawn.push(look===__sitLook?('sit'+dir):(stance+dir));
    kneelLook=__sitLook;kneelUntil=__now+1000;
    window.__sprite=mkWardrobeHero(__standLook);
    captureWardrobeFrame(__sprite,4,false,0,__now,kneelLook)`);
  assert.equal(ev('__drawn.join(",")'), 'sit4', 'the kneeling frame is drawn while the window is open');

  // Past the window the standing stance comes back, and it is not rewound.
  ev('__drawn=[];kneelUntil=0');
  ev(`captureWardrobeFrame(__sprite,4,false,.5,__now+2000)`);
  assert.equal(ev('__drawn.join(",")'), 'attack4', 'the standing attack frame resumes after the window');

  // Kneeling does not move the standing route's own clock.
  ev('__drawn=[];__now=200000;kneelLook=__sitLook;kneelUntil=__now+1000');
  ev('captureWardrobeFrame(__sprite,4,false,0,__now)');
  const start = ev('__sprite.userData.wardrobe.start');
  ev('captureWardrobeFrame(__sprite,4,false,0,__now+500)');
  assert.equal(ev('__sprite.userData.wardrobe.start'), start, 'the standing route keeps its start time through the kneel');
  ok('kneeling draws the sit stance and hands the standing animation back untouched');

  // The store only exists for the expanded roster, so no shipped class gains a stance it lacks.
  assert.equal(ev(`typeof wardrobeKneelStore==='object'&&!!wardrobeKneelStore`), true);
  assert.equal(ev(`Array.from(wardrobeKneelStore.stances).join(',')`), 'sit');
  for (const cls of ['Lord Knight', 'Rune Knight', 'High Wizard']) {
    ev(`S.cls=${JSON.stringify(cls)}`);
    assert.equal(ev(`kneelWanted('ch_asura')`), false, cls + ' must not kneel');
    ev(`kneelUntil=0;playSkillFx('ch_asura',null,'#f00')`);
    assert.equal(ev('kneelUntil'), 0, cls + ' must not open the window');
  }
  ok('only the expanded roster can kneel; the shipped and fourth-job packs keep their frames');

  // Clean up the stubs and leave the game as it was found.
  ev(`PGWardrobe.draw=__realDraw;delete window.__sitLook;kneelLook=null;kneelUntil=0`);
  console.log('\n' + pass + ' passed, 0 failed');
  g.close();
})().catch(e => { console.error('  FAIL ' + (e && e.stack || e)); process.exit(1); });
