'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const state = { mask: 15, view: 'SE', animated: !reduced.matches, mirrored: false };
  let request = 0;
  const names = ['Angel Halo', 'Classic Glasses', 'Archangel Wings', 'Vanguard Armor'];
  function render() {
    const version = ++request;
    const selected = names.filter((_, i) => state.mask & (1 << i));
    document.querySelectorAll('[data-bit]').forEach(b => b.setAttribute('aria-pressed', !!(state.mask & +b.dataset.bit)));
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === state.view));
    $('motion').setAttribute('aria-pressed', state.animated);
    $('motion').textContent = state.animated ? 'Animation on' : 'Still frame';
    $('mirror').setAttribute('aria-pressed', state.mirrored);
    $('pieceCount').textContent = `${selected.length} / 4 pieces`;
    $('lookName').textContent = state.mask === 15 ? 'Complete collection' : state.mask ? 'Your combination' : 'Original Lord Knight';
    $('status').textContent = 'Loading look…';
    $('retry').hidden = true;
    // Never leave the old look displayed under a new selection's label.
    $('hero').hidden = true;
    const file = window.COSMETIC_SKINS.sets[state.mask].files[state.view];
    const url = 'art/' + (state.animated ? file : file.replace('.png', '-still.png'));
    const loader = new Image();
    loader.onload = () => {
      if (version !== request) return;
      const hero = $('hero');
      hero.src = url;
      hero.classList.toggle('mirrored', state.mirrored);
      hero.alt = `Male Lord Knight · ${state.view} · ${selected.join(', ') || 'original appearance'}`;
      hero.dataset.mask = state.mask;
      hero.dataset.view = state.view;
      hero.hidden = false;
      $('status').textContent = `${state.view === 'attack' ? 'Attack pose' : 'Walking pose'} · ${state.animated ? 'animated' : 'frame 1'}${state.mirrored ? ' · mirrored' : ''}`;
    };
    loader.onerror = () => {
      if (version !== request) return;
      $('status').textContent = 'This look could not load. Please retry.';
      $('retry').hidden = false;
    };
    loader.src = url;
  }
  document.querySelectorAll('[data-bit]').forEach(b => b.addEventListener('click', () => { state.mask ^= +b.dataset.bit; render(); }));
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { state.view = b.dataset.view; render(); }));
  $('all').onclick = () => { state.mask = 15; render(); };
  $('none').onclick = () => { state.mask = 0; render(); };
  $('motion').onclick = () => { state.animated = !state.animated; render(); };
  $('mirror').onclick = () => { state.mirrored = !state.mirrored; render(); };
  $('retry').onclick = render;
  reduced.addEventListener('change', event => { if (event.matches) { state.animated = false; render(); } });
  render();
})();
