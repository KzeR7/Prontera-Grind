// Smoke test for Updates/damage-floats-proposal/index.html
// Run:  cd Updates/damage-floats-proposal && npm i jsdom && node smoke_test.js
// (jsdom has no Web Animations API, so Element.animate is stubbed before the page runs.)
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('/home/user/Prontera-Grind/Updates/damage-floats-proposal/index.html', 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: undefined,
  url: 'http://localhost/Updates/damage-floats-proposal/index.html',
  beforeParse(window) {
    window.Element.prototype.animate = function (keys, opts) {
      if (!Array.isArray(keys) || !keys.length) errors.push('animate called without keyframes');
      for (const k of keys) if (k.offset != null && (k.offset < 0 || k.offset > 1)) errors.push('bad offset ' + k.offset);
      const offsets = keys.map(k => k.offset).filter(o => o != null);
      for (let i = 1; i < offsets.length; i++) if (offsets[i] < offsets[i - 1]) errors.push('offsets not monotonic: ' + offsets);
      return { onfinish: null, cancel() {}, finished: Promise.resolve() };
    };
    window.addEventListener('error', e => errors.push('page error: ' + e.message));
  }
});
const { window } = dom;
const { document } = window;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const t = (name, fn) => {
  let r;
  try { r = fn(); } catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; return; }
  if (r && typeof r.then === 'function') {
    pass_pending++;
    r.then(() => { console.log('  ok   ' + name); pass++; pass_pending--; check(); })
     .catch(e => { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; pass_pending--; check(); });
  } else { console.log('  ok   ' + name); pass++; }
};
let pass_pending = 0;
function check() { if (pass_pending === 0 && finished) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); } }
let finished = false;

(async () => {
  t('page booted without errors', () => { if (errors.length) throw new Error(errors.join('; ')); });
  t('compare view builds 4 strips', () => {
    const n = document.querySelectorAll('.strip').length;
    if (n !== 4) throw new Error('expected 4 strips, got ' + n);
  });
  await sleep(120);
  t('initial preset fired floats into every strip', () => {
    if (document.querySelectorAll('.pf').length < 4) throw new Error('no floats after load volley');
  });
  await sleep(150);
  t('full volley appends floats in every option', () => {
    window.document.querySelector('#fireVolley').click();
    return sleep(120).then(() => {
    for (const s of document.querySelectorAll('.strip')) {
      if (!s.querySelector('.pf')) throw new Error('strip ' + s.dataset.opt + ' got no floats');
    }
    }); 
  });
  t('crit bursts render an SVG star in A and B, flash+sparks in C', () => {
    document.querySelectorAll('[data-role="crit"]')[0].click();
    const a = document.querySelector('.strip[data-opt="a"]');
    const b = document.querySelector('.strip[data-opt="b"]');
    const c = document.querySelector('.strip[data-opt="c"]');
    if (!a.querySelector('.pf .burst svg')) throw new Error('no burst svg in A');
    if (!b.querySelector('.pf .burst svg')) throw new Error('no burst svg in B');
    if (b.querySelector('.pf .tag')) throw new Error('CRIT chip must be gone from B (owner request)');
    if (!c.querySelector('.pf .spark') && !c.querySelector('.pf .flash')) throw new Error('no sparks/flash in C');
  });
  t('pop-up type: sway/front/stack spawn holders and fire cleanly', () => {
    const sel = document.getElementById('spawn');
    if (!sel) throw new Error('no spawn select');
    for (const mode of ['sway','front','stack']) {
      sel.value = mode; sel.dispatchEvent(new window.Event('change'));
    }
    const s = document.querySelector('.strip[data-opt="b"]');
    if (!s.querySelector('.pfh')) throw new Error('no spawn holder for non-scatter modes');
  });
  t('big crit 1.2M fires and the frame is sized from the number', () => {
    document.querySelectorAll('[data-role="bigcrit"]')[0].click();
    const b = document.querySelector('.strip[data-opt="b"]');
    const f = Array.from(b.querySelectorAll('.pf')).find(x => x.textContent.indexOf('1,240,000') >= 0);
    if (!f) throw new Error('big crit float missing');
    const bw = parseFloat(f.querySelector('.burst').style.width);
    if (!(bw > 100)) throw new Error('burst not stretched for 7 digits, width=' + bw);
  });
  t('skill-crit button fires a distinct role everywhere', () => {
    document.querySelectorAll('[data-role="skillcrit"]')[0].click();
    for (const s of document.querySelectorAll('.strip')) {
      if (!s.querySelector('.pf')) throw new Error('strip ' + s.dataset.opt + ' got no skillcrit float');
    }
    const c = document.querySelector('.strip[data-opt="c"]');
    if (!c.querySelector('.pf .ring') && !c.querySelector('.pf .spark')) throw new Error('C skillcrit lacks ring/sparks');
  });
  t('single-option tab rebuilds to one strip', () => {
    document.querySelector('[data-tab="b"]').click();
    if (document.querySelectorAll('.strip').length !== 1) throw new Error('focus tab did not reduce to 1 strip');
    if (!document.querySelector('.strip[data-opt="b"]')) throw new Error('wrong strip shown');
  });
  t('presets update sliders and fire', () => {
    document.querySelector('[data-preset="juice"]').click();
    if (document.getElementById('sCrit').value !== '40') throw new Error('juice preset crit size not applied, got ' + document.getElementById('sCrit').value);
    document.querySelector('[data-preset="current"]').click();
    if (document.getElementById('sCrit').value !== '21') throw new Error('current preset crit size not 21');
    document.querySelector('[data-preset="balanced"]').click();
  });
  t('fade style switch fires without errors', () => {
    const sel = document.getElementById('fadeStyle');
    sel.value = 'arc'; sel.dispatchEvent(new window.Event('change'));
    sel.value = 'hold'; sel.dispatchEvent(new window.Event('change'));
  });
  t('DoT merge demo runs', async () => {
    await sleep(2600); // volley tail includes the dot at 2400ms
    const any = document.querySelectorAll('.pf').length;
    if (!any) throw new Error('no floats alive at dot time');
  });
  await sleep(100);
  t('no runtime errors accumulated', () => { if (errors.length) throw new Error(errors.join('; ')); });
  finished = true;
  check();
})();
