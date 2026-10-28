/* ============================================================================
   assets/ui/mobile.js — decides when the page runs the phone layout and owns
   the three phone-only controls (fullscreen, field-only mode, quest sheet).

   Loaded from <head> so `html.pg-mobile` is on the document before the first
   paint; the buttons are wired on DOMContentLoaded because they live in <body>.
   assets/ui/mobile.css holds every visual rule and is scoped to that class, so
   a desktop browser keeps the desk layout unchanged.

   The decision, in order:
     1. an explicit choice in Display → Phone layout wins ('on' / 'off');
     2. otherwise a touch device whose short side is <= 900px is a phone;
     3. a narrow desktop window with a mouse is NOT a phone - it keeps the desk
        layout, which already has its own 700px/740px rules.
   The layout is re-decided on resize and orientation change, so rotating a
   tablet or dragging a window across a breakpoint just works.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var KEY_PHONE = 'pg_phone_layout';   // 'auto' | 'on' | 'off'
  var KEY_FOCUS = 'pg_field_only';     // '1' | '0'
  var PHONE_SHORT_SIDE = 900;

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (_) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  // ?phone=1 / ?phone=0 forces the layout for one visit (a desk browser can review the
  // phone screen, and a phone can drop back to the desk arrangement if a layout ever
  // fights it). It is not stored: the URL wins for this page load only.
  var forced = null;
  try {
    var q = String(window.location.search || '');
    if (/[?&]phone=1\b/.test(q)) forced = 'on';
    else if (/[?&]phone=0\b/.test(q)) forced = 'off';
  } catch (_) {}
  var phonePref = forced || read(KEY_PHONE, 'auto');
  var fieldOnly = read(KEY_FOCUS, '0') === '1';
  var current = null;                   // the class state last applied

  function media(q) {
    try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (_) { return false; }
  }

  /* A touch device, not a small desktop window. maxTouchPoints covers the
     tablets that report a fine pointer for a stylus, and the coarse pointer
     query covers phones that do not expose maxTouchPoints. */
  function looksLikeTouchDevice() {
    var touch = (navigator.maxTouchPoints || 0) > 0 || (navigator.msMaxTouchPoints || 0) > 0;
    return touch || media('(pointer:coarse)') || media('(any-pointer:coarse)');
  }
  function shortSide() {
    return Math.min(window.innerWidth || 0, window.innerHeight || 0);
  }
  function wantsPhoneLayout() {
    if (phonePref === 'on') return true;
    if (phonePref === 'off') return false;
    return looksLikeTouchDevice() && shortSide() <= PHONE_SHORT_SIDE;
  }

  function apply() {
    var on = wantsPhoneLayout();
    root.classList.toggle('pg-mobile', on);
    root.classList.toggle('pg-focus', on && fieldOnly);
    var state = on ? (fieldOnly ? 'focus' : 'phone') : 'desk';
    if (state !== current) {
      current = state;
      // The renderer measures #view on its own resize event; this one is for
      // the game's own helpers that cache the dock position.
      try {
        window.dispatchEvent(new CustomEvent('pg-mobile-change', { detail: { layout: state } }));
      } catch (_) {
        try { var e = document.createEvent('Event'); e.initEvent('pg-mobile-change', true, true); window.dispatchEvent(e); } catch (__) {}
      }
    }
    syncButtons();
  }

  function isMobile() { return root.classList.contains('pg-mobile'); }

  /* ── Fullscreen ────────────────────────────────────────────────────────
     Real fullscreen hides browser chrome, which is the whole point on a phone.
     When the API refuses (iOS Safari on iPhone, an iframe without
     allowfullscreen) we say so once instead of pretending it worked. */
  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }
  function toggleFullscreen() {
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    var ex = document.exitFullscreen || document.webkitExitFullscreen;
    var done;
    try {
      if (fullscreenElement()) { done = ex.call(document); }
      else if (req) {
        done = req.call(el, { navigationUI: 'hide' });
        // Rotate into the wide layout where the platform allows a lock. A
        // refusal is normal (iOS), so it is swallowed on purpose.
        if (done && typeof done.then === 'function') {
          done.then(lockLandscape).catch(function () {});
        } else {
          lockLandscape();
        }
      } else { done = null; }
    } catch (_) { done = null; }
    if (!done) notice('Fullscreen is unavailable in this browser. Add the page to your home screen for a chrome-free game.');
    syncButtons();
  }
  function lockLandscape() {
    try {
      var so = screen.orientation;
      if (so && typeof so.lock === 'function') {
        var p = so.lock('landscape');
        if (p && p.catch) p.catch(function () {});
      }
    } catch (_) {}
  }
  function notice(text) {
    if (typeof window.log === 'function') { try { window.log(text); return; } catch (_) {} }
    var bar = document.getElementById('pgNotice');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pgNotice';
      bar.setAttribute('role', 'status');
      bar.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 96px);' +
        'transform:translateX(-50%);z-index:200;max-width:calc(100vw - 24px);padding:9px 13px;border-radius:9px;' +
        'background:#101b16;color:#f0e6cf;border:1px solid #7d8f74;font:11px/1.4 "Trebuchet MS",Verdana,sans-serif;' +
        'box-shadow:0 10px 26px #0008;text-align:center';
      document.body.appendChild(bar);
    }
    bar.textContent = text;
    bar.hidden = false;
    clearTimeout(notice.t);
    notice.t = setTimeout(function () { if (bar) bar.hidden = true; }, 4200);
  }

  /* ── Field-only mode ───────────────────────────────────────────────────
     One tap drops every floating panel so the fight has the screen. It is a
     device-local preference: it changes no save and no account state. */
  function setFieldOnly(on) {
    fieldOnly = !!on;
    write(KEY_FOCUS, fieldOnly ? '1' : '0');
    // The sheet and its scrim are hidden by .pg-focus, so an open sheet would
    // leave a scrim over the field with no way to reach the close button.
    if (fieldOnly) setRail(false);
    apply();
  }
  function toggleFieldOnly() { setFieldOnly(!fieldOnly); }

  /* ── Quest sheet ───────────────────────────────────────────────────────
     #sideRail holds the quest tracker and the "more destinations" list. On a
     phone it is closed until the ❖ Quests chip (or the dock's More button)
     asks for it, and it closes on the scrim, on a tab, or on Escape. */
  function setRail(open) {
    root.classList.toggle('pg-rail-open', !!open);
    var rail = document.getElementById('sideRail');
    if (rail) rail.classList.toggle('pg-open', !!open);
    var scrim = document.getElementById('pgScrim');
    if (scrim) scrim.hidden = !open;
    var chip = document.getElementById('pgQuests');
    if (chip) chip.setAttribute('aria-expanded', String(!!open));
    if (open) {
      // renderQ() is the game's own redraw; ask it for current quest state so
      // the sheet opens with live progress instead of the last render.
      if (typeof window.renderQ === 'function') { try { window.renderQ(); } catch (_) {} }
      if (rail) rail.classList.add('pg-open');
    }
  }
  function toggleRail() { setRail(!root.classList.contains('pg-rail-open')); }

  function syncButtons() {
    var fs = document.getElementById('fsBtn');
    if (fs) {
      var on = !!fullscreenElement();
      fs.setAttribute('aria-pressed', String(on));
      fs.title = on ? 'Leave fullscreen' : 'Fullscreen (landscape on a phone)';
      fs.textContent = on ? '⤢' : '⛶';
    }
    var focus = document.getElementById('pgFocusBtn');
    if (focus) {
      focus.setAttribute('aria-pressed', String(fieldOnly));
      focus.title = fieldOnly ? 'Show field panels' : 'Hide field panels (field only)';
      focus.textContent = fieldOnly ? '◉' : '◎';
    }
  }

  var wired = false;
  function wire() {
    if (wired) return;                 // DOMContentLoaded and load can both fire
    wired = true;
    var fs = document.getElementById('fsBtn');
    if (fs) fs.addEventListener('click', function (e) { e.preventDefault(); toggleFullscreen(); });

    var focus = document.getElementById('pgFocusBtn');
    if (focus) focus.addEventListener('click', function (e) { e.preventDefault(); toggleFieldOnly(); });

    var chip = document.getElementById('pgQuests');
    if (chip) {
      chip.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toggleRail(); });
      // The chip floats over the field, whose own pointer handlers rotate the
      // camera; a tap on the chip must not also drag the world.
      chip.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    }

    var scrim = document.getElementById('pgScrim');
    if (scrim) {
      scrim.addEventListener('click', function () { setRail(false); });
      scrim.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    }

    // The dock's More button opens the destinations menu, which lives inside the
    // rail. Mirror that state onto the rail so the sheet can host it without :has().
    watchMore();
    watchPanels();

    // The dock's More button opens the same rail; any tab tap closes the sheet
    // so the panel the player asked for is visible on a small screen.
    var closeOnNav = function (e) {
      var b = e.target.closest && e.target.closest('[data-t],.eclipse-more');
      if (b) setRail(false);
    };
    var dock = document.getElementById('dock');
    if (dock) dock.addEventListener('click', closeOnNav, true);
    var sideMenu = document.getElementById('sideMenu');
    if (sideMenu) sideMenu.addEventListener('click', closeOnNav, true);

    // The game's own Escape handler closes panels; close the sheet first so a
    // single Escape does the most local thing.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('pg-rail-open')) {
        setRail(false);
        e.stopPropagation();
      }
    }, true);

    document.addEventListener('fullscreenchange', syncButtons);
    document.addEventListener('webkitfullscreenchange', syncButtons);

    syncButtons();
    startQuestDot();
  }

  /* A panel window (#wins) covers the field, and the world chat floats over the
     field - so on a phone the two end up on top of each other (the chat's tab
     strip landed on a map card). Mirror "a panel is open" onto <html> and let
     the stylesheet stand the chat down while it is. */
  function watchPanels() {
    var wins = document.getElementById('wins');
    if (!wins || typeof MutationObserver !== 'function') return;
    var open = false;
    var sync = function () {
      var next = wins.style.display !== 'none' && !!wins.querySelector('.wp');
      if (next === open) return;
      open = next;
      root.classList.toggle('pg-panel', open);
    };
    new MutationObserver(sync).observe(wins, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'class'] });
    sync();
  }

  /* #sideMenu.eclipse-more-open is the game's own "destinations are open" state.
     Observing it keeps the rail's visibility in sync without importing the
     game's variables, and without depending on :has() support. */
  function watchMore() {
    var menu = document.getElementById('sideMenu'), rail = document.getElementById('sideRail');
    if (!menu || !rail || typeof MutationObserver !== 'function') return;
    var sync = function () { rail.classList.toggle('pg-more', menu.classList.contains('eclipse-more-open')); };
    new MutationObserver(sync).observe(menu, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  /* The chip is the only visible quest entry on a phone, so it carries the same
     "something can be claimed" reminder the tracker used to show inline. */
  var questTimer = 0;
  function startQuestDot() {
    if (questTimer) return;
    questTimer = setInterval(function () {
      var dot = document.getElementById('pgQuestDot');
      if (!dot) return;
      var claimable = false;
      try { if (typeof S !== 'undefined' && S && Array.isArray(S.q)) claimable = S.q.some(function (q) { return q && q.prog >= q.goal; }); } catch (_) {}
      dot.hidden = !claimable;
    }, 2500);
  }

  function onViewportChange() {
    apply();
    // #wrap is sized in dvh; older iOS needs the number, not the unit.
    if (window.visualViewport && window.visualViewport.height) {
      root.style.setProperty('--pg-vh', window.visualViewport.height + 'px');
    }
  }

  apply();
  onViewportChange();
  window.addEventListener('resize', onViewportChange, { passive: true });
  window.addEventListener('orientationchange', function () { setTimeout(onViewportChange, 120); });
  if (window.matchMedia) {
    var cq = window.matchMedia('(pointer:coarse)');
    if (cq.addEventListener) cq.addEventListener('change', onViewportChange);
    else if (cq.addListener) cq.addListener(onViewportChange);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
    // A page restored from the back/forward cache can finish loading before this
    // runs; `load` is the second chance and the guard keeps wiring once.
    window.addEventListener('load', wire);
  } else wire();

  /* The Display panel and tests use this surface; it is deliberately small. */
  window.PGMobile = {
    isMobile: isMobile,
    apply: apply,
    setPhoneLayout: function (mode) {
      phonePref = (mode === 'on' || mode === 'off') ? mode : 'auto';
      write(KEY_PHONE, phonePref);
      apply();
    },
    getPhoneLayout: function () { return phonePref; },
    toggleFullscreen: toggleFullscreen,
    toggleFieldOnly: toggleFieldOnly,
    setFieldOnly: setFieldOnly,
    fieldOnly: function () { return fieldOnly; },
    openRail: function () { setRail(true); },
    closeRail: function () { setRail(false); },
    railOpen: function () { return root.classList.contains('pg-rail-open'); }
  };
})();
