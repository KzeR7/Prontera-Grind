/* Native RO weapon contacts, shared by normal/critical damage. See research/combat-audio.md. */
(function () {
  'use strict';
  const files = {
    sword: '_hit_sword.wav', dagger: '_hit_sword.wav', spear: '_hit_spear.wav',
    axe: '_hit_axe.wav', mace: '_hit_mace.wav', katar: '_hit_mace.wav',
    staff: '_hit_rod.wav', bow: '_hit_arrow.wav', fist: '_hit_fist1.wav'
  };
  const buffers = new Map(), loading = new Set();
  let context, lastHit = -Infinity, voices = 0;
  function load(file) {
    if (buffers.has(file) || loading.has(file)) return;
    loading.add(file);
    fetch('assets/audio/hits/' + file)
      .then(response => {
        if (!response.ok) throw new Error('Hit sound unavailable');
        return response.arrayBuffer();
      })
      .then(data => context.decodeAudioData(data))
      .then(buffer => buffers.set(file, buffer))
      .catch(() => {}) // A later interaction/contact retries failed downloads.
      .finally(() => loading.delete(file));
  }
  function unlock() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      context ||= new AudioContext();
      if (context.state === 'suspended') context.resume().catch(() => {});
      for (const file of new Set(Object.values(files))) load(file);
    } catch (_) { /* Audio is optional on unsupported browsers. */ }
  }
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  window.CombatAudio = {
    hit(critical, enabled = true, weapon = 'fist') {
      if (!enabled || !context || context.state !== 'running' || document.hidden) return;
      const file = Object.hasOwn(files, weapon) ? files[weapon] : files.fist;
      const buffer = buffers.get(file);
      // Drop a contact while loading: playing it later would detach it from damage.
      if (!buffer) { load(file); return; }
      const now = context.currentTime;
      // Bound overlapping AoE and repeated contacts; critical hits have priority.
      if (voices >= 12 || now - lastHit < (critical ? .035 : .075)) return;
      lastHit = now;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = .3;
      source.connect(gain); gain.connect(context.destination);
      voices++;
      source.onended = () => { voices--; source.disconnect(); gain.disconnect(); };
      source.start(now);
    }
  };
})();
