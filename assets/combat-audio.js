/* Native RO attack motions and contacts. See research/combat-audio.md. */
(function () {
  'use strict';
  const hits = {
    sword: '_hit_sword.wav', dagger: '_hit_sword.wav', spear: '_hit_spear.wav',
    axe: '_hit_axe.wav', mace: '_hit_mace.wav', katar: '_hit_mace.wav',
    staff: '_hit_rod.wav', bow: '_hit_arrow.wav', fist: '_hit_fist1.wav'
  };
  const attacks = {
    sword: 'attack_sword.wav', dagger: 'attack_short_sword.wav', spear: 'attack_spear.wav',
    axe: 'attack_axe.wav', mace: 'attack_mace.wav', katar: 'attack_katar.wav',
    staff: 'attack_rod.wav', bow: 'attack_bow1.wav', fist: 'attack_fist.wav'
  };
  // Each channel has its own budget: pets/AoE cannot suppress the player's swing or contact.
  const channels = {
    attack: {limit:8, gap:0, volume:.3}, normal: {limit:4, gap:.035, volume:.3},
    skill: {limit:3, gap:.075, volume:.18}, pet: {limit:1, gap:.12, volume:.1}
  };
  for (const channel of Object.values(channels)) { channel.last = -Infinity; channel.voices = 0; }
  const buffers = new Map(), loading = new Set();
  let context;
  function load(file) {
    if (buffers.has(file) || loading.has(file)) return;
    loading.add(file);
    fetch('assets/audio/' + file)
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
      for (const [folder, files] of [['hits', hits], ['attacks', attacks]])
        for (const file of new Set(Object.values(files))) load(folder + '/' + file);
    } catch (_) { /* Audio is optional on unsupported browsers. */ }
  }
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  function play(files, folder, weapon, enabled, kind, critical = false) {
    if (!enabled || !context || context.state !== 'running' || document.hidden) return;
    const file = folder + '/' + (Object.hasOwn(files, weapon) ? files[weapon] : files.fist);
    const buffer = buffers.get(file);
    // Drop sounds while loading: replaying them later would detach them from the animation.
    if (!buffer) { load(file); return; }
    const now = context.currentTime, channel = channels[kind];
    if (channel.voices >= channel.limit || now - channel.last < (critical ? .035 : channel.gap)) return;
    channel.last = now;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = channel.volume;
    source.connect(gain); gain.connect(context.destination);
    channel.voices++;
    source.onended = () => { channel.voices--; source.disconnect(); gain.disconnect(); };
    source.start(now);
  }
  window.CombatAudio = {
    attack(enabled = true, weapon = 'fist') {
      play(attacks, 'attacks', weapon, enabled, 'attack');
    },
    hit(critical, enabled = true, weapon = 'fist', kind = 'normal') {
      play(hits, 'hits', weapon, enabled, kind === 'pet' ? 'pet' : kind === 'skill' ? 'skill' : 'normal', critical);
    }
  };
})();
