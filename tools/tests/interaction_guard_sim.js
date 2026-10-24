// Browser interaction guard, on the real page (jsdom).
//   node tools/tests/interaction_guard_sim.js
//
// Owner request (2026-10-24): the game page must behave like a game window, not a document.
//   * a left-button drag over the field or a panel must not paint a text selection;
//   * a right-click must not open the browser menu ("Save image as…", "Inspect", "Reload")
//     on the field, the tabs or any panel;
//   * sprites and item icons must not start a native image drag.
// Text fields are the deliberate exception, so account names, the equipment search and the
// auto-sell name list keep selection and the paste menu.
//
// This boots index.html through the shared harness, so the listeners and the stylesheet under
// test are the shipped ones, not a copy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGame } = require('./helpers/game');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const g = createGame(html);
const doc = g.window.document;
const ev = g.ev;

let passed = 0;
const test = (name, fn) => { fn(); console.log('ok ' + name); passed++; };

// Dispatch the event a browser would send and report whether the page cancelled it.
// dispatchEvent() returns false exactly when preventDefault() was called on a cancelable event.
const cancelled = (el, type) => !el.dispatchEvent(new g.window.MouseEvent(type, { bubbles: true, cancelable: true }));

try {
  // The field, the dock, a window panel and its own equipment search are the shipped elements.
  ev("tabs.push('equip','bag');renderWin();");
  const panel = doc.querySelector('[data-win="bag"]');
  const equipPanel = doc.querySelector('[data-win="equip"]');
  const dockTab = doc.querySelector('#dock [data-t]');
  const loginArt = doc.querySelector('.eclipse-login-art img');
  assert.ok(doc.querySelector('#view canvas'), 'the field canvas is on the page');
  assert.ok(doc.getElementById('eclipseCombat'), 'the auto-combat bar is on the page');
  assert.ok(panel && equipPanel, 'window panels render');
  const search = equipPanel.querySelector('[data-eclipse-search]');
  assert.ok(panel.querySelector('.title'), 'a window title renders');
  assert.ok(search, 'the equipment search field renders');
  assert.ok(dockTab, 'a dock tab renders');
  assert.ok(loginArt, 'a shipped image is on the page');

  test('a right-click opens no browser menu on the field, a tab, a panel or the login card', () => {
    for (const [what, el] of [
      ['field canvas', doc.querySelector('#view canvas')],
      ['auto-combat bar', doc.getElementById('eclipseCombat')],
      ['dock tab', dockTab],
      ['window panel', panel],
      ['window title', panel.querySelector('.title')],
      ['equipment panel', equipPanel],
      ['login card', doc.querySelector('.login-card')],
      ['remember-user checkbox', doc.getElementById('rememberUser')],
      ['page body', doc.body],
    ]) {
      assert.ok(el, what + ' is on the page');
      assert.equal(cancelled(el, 'contextmenu'), true, what + ' must not open the browser menu');
    }
  });

  test('right-click on a shipped sprite/icon image offers no "Save image as…"', () => {
    const icon = doc.querySelector('.eclipse-login-art img:last-of-type');
    assert.ok(icon, 'the equipment icon image is on the page');
    assert.equal(cancelled(loginArt, 'contextmenu'), true, 'character art');
    assert.equal(cancelled(icon, 'contextmenu'), true, 'item icon');
    const sprite = doc.createElement('img');
    sprite.className = 'mob-sprite-img';
    sprite.src = 'assets/mobs/v1/1002-0.png';
    doc.getElementById('mobSpriteLayer').appendChild(sprite);
    assert.equal(cancelled(sprite, 'contextmenu'), true, 'monster sprite layer');
    sprite.remove();
    const select = doc.createElement('select');
    select.append(doc.createElement('option'));
    doc.body.appendChild(select);
    assert.equal(cancelled(select, 'contextmenu'), true, 'a game select is not a text field');
    select.remove();
  });

  test('text fields keep their menu so names and searches can still be pasted', () => {
    for (const [what, el] of [
      ['account name', doc.getElementById('username')],
      ['password', doc.getElementById('password')],
      ['equipment search', search],
    ]) {
      assert.ok(el, what + ' exists');
      assert.equal(cancelled(el, 'contextmenu'), false, what + ' keeps the paste menu');
    }
    const textarea = doc.createElement('textarea');
    const editable = doc.createElement('div');
    const number = doc.createElement('input');
    number.type = 'number';
    editable.setAttribute('contenteditable', 'true');
    doc.body.append(textarea, editable, number);
    assert.equal(cancelled(textarea, 'contextmenu'), false, 'auto-sell name list');
    assert.equal(cancelled(editable, 'contextmenu'), false, 'contenteditable text');
    assert.equal(cancelled(number, 'contextmenu'), false, 'ore quantity field');
    textarea.remove();
    editable.remove();
    number.remove();
  });

  test('a left drag cannot start a native image drag', () => {
    assert.equal(cancelled(loginArt, 'dragstart'), true, 'character art does not start a drag');
    assert.equal(cancelled(panel, 'dragstart'), true, 'the HUD does not start a drag');
    assert.equal(cancelled(doc.getElementById('username'), 'dragstart'), false, 'text inside a field may still be dragged');
  });

  test('the shipped stylesheet disables selection everywhere and restores it in text fields', () => {
    const css = [...doc.querySelectorAll('style')].map(s => s.textContent || '').join('\n');
    const rule = selector => (css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')) || [])[1] || '';
    const all = rule('*,*::before,*::after');
    assert.match(all, /-webkit-user-select:none/, 'no WebKit selection highlight');
    assert.match(all, /(?:^|;)user-select:none/, 'no standard selection highlight');
    assert.match(all, /-webkit-touch-callout:none/, 'no long-press callout sheet on a phone');
    const fields = rule('input,textarea,[contenteditable=""],[contenteditable="true"]');
    assert.match(fields, /-webkit-user-select:text/, 'text fields keep WebKit selection');
    assert.match(fields, /(?:^|;)user-select:text/, 'text fields keep standard selection');
    assert.match(css, /img,canvas\{-webkit-user-drag:none/, 'images and the canvas are not draggable');
  });

  test('the guard is device-local: it changes no save and no account state', () => {
    const before = ev('JSON.stringify(S)');
    cancelled(doc.body, 'contextmenu');
    cancelled(doc.body, 'dragstart');
    assert.equal(ev('JSON.stringify(S)'), before, 'the save is untouched');
    assert.equal(ev('currentUser'), 'skill-test', 'the session is untouched');
  });

  console.log('interaction guard: ' + passed + '/' + passed + ' passed');
} catch (error) {
  console.error('FAIL interaction guard: ' + (error && error.stack || error));
  process.exitCode = 1;
} finally {
  g.close();
}
