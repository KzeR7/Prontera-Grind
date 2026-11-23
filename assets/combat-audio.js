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
  function ensureContext() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context ||= new AudioContext();
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context;
    } catch (_) {
      return null;
    }
  }
  function unlock() {
    const ctx = ensureContext();
    if (!ctx) return;
    try {
      for (const [folder, files] of [['hits', hits], ['attacks', attacks]])
        for (const file of new Set(Object.values(files))) load(folder + '/' + file);
    } catch (_) { /* Audio is optional on unsupported browsers. */ }
  }
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  // Synthesize classic Ragnarok Online Hollgrehenn Blacksmith forge sounds:
  // 1) Anvil hammer strikes ("ting! ting! ting!") during the 1.0s forging suspense
  // 2) Crystalline ascending chime fanfare on Success
  // 3) Metallic fracture + anvil thud + furnace steam on Failure
  let noiseBuf = null;
  function getNoiseBuffer(ctx) {
    if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
    const len = Math.floor(ctx.sampleRate * 0.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 0x51f3a9d7;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 0x80000000) - 1;
    }
    noiseBuf = buf;
    return buf;
  }
  function scheduleAnvilTing(ctx, at, baseFreq, volume) {
    // High-pitched steel-on-anvil partials (RO blacksmith hammer chime)
    const ratios = [1, 1.502, 2.248];
    const gains = [1, 0.52, 0.28];
    for (let i = 0; i < ratios.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(baseFreq * ratios[i], at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(volume * gains[i], at + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + (i === 0 ? 0.24 : 0.16));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.26);
    }
    // Crisp metallic contact transient
    const nSrc = ctx.createBufferSource();
    const hp = ctx.createBiquadFilter();
    const nGain = ctx.createGain();
    nSrc.buffer = getNoiseBuffer(ctx);
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2800, at);
    nGain.gain.setValueAtTime(volume * 0.55, at);
    nGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.032);
    nSrc.connect(hp);
    hp.connect(nGain);
    nGain.connect(ctx.destination);
    nSrc.start(at);
    nSrc.stop(at + 0.04);
  }
  const FORGE_WAVS = [
    'refine/bs_refine_1.wav',
    'refine/bs_refine_2.wav',
    'refine/bs_refine_success.wav',
    'refine/bs_refine_failed.wav'
  ];
  function preloadForge() {
    const ctx = ensureContext();
    if (!ctx) return;
    for (const f of FORGE_WAVS) load(f);
  }
  function playForgeBuffer(ctx, file, startAt, volume, playbackRate = 1) {
    const buf = buffers.get(file);
    if (!buf) { load(file); return false; }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    if (playbackRate !== 1 && src.playbackRate) src.playbackRate.value = playbackRate;
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch (_) {} };
    src.start(startAt);
    return true;
  }
  function playForgeStart(enabled = true, isStar = false) {
    window.CombatAudio.lastForgeEvent = { kind: 'start', isStar: Boolean(isStar), enabled: Boolean(enabled), at: Date.now() };
    if (!enabled || document.hidden) return;
    const ctx = ensureContext();
    if (!ctx) return;
    preloadForge();
    try {
      const now = ctx.currentTime;
      const rate = isStar ? 1.05 : 1.0;
      const played1 = playForgeBuffer(ctx, 'refine/bs_refine_1.wav', now + 0.04, 0.52, rate);
      const played2 = playForgeBuffer(ctx, 'refine/bs_refine_2.wav', now + 0.44, 0.56, rate);
      if (!played1 || !played2) {
        const base = isStar ? 2093 : 1975.5;
        if (!played1) scheduleAnvilTing(ctx, now + 0.04, base, 0.22);
        if (!played2) scheduleAnvilTing(ctx, now + 0.44, base * 1.04, 0.25);
      }
    } catch (_) {}
  }
  function playForgeResult(succeeded, enabled = true, isStar = false) {
    window.CombatAudio.lastForgeEvent = { kind: succeeded ? 'success' : 'failure', isStar: Boolean(isStar), enabled: Boolean(enabled), at: Date.now() };
    if (!enabled || document.hidden) return;
    const ctx = ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const wavFile = succeeded ? 'refine/bs_refine_success.wav' : 'refine/bs_refine_failed.wav';
      if (playForgeBuffer(ctx, wavFile, now, succeeded ? 0.55 : 0.58, isStar && succeeded ? 1.04 : 1.0)) {
        return;
      }
      if (succeeded) {
        const notes = isStar ? [1174.66, 1479.98, 1760.0, 2349.32] : [1046.5, 1318.51, 1567.98, 2093.0];
        notes.forEach((freq, idx) => {
          const t0 = now + idx * 0.068;
          const dur = idx === notes.length - 1 ? 0.72 : 0.26;
          for (const [mult, amp, type] of [[1, 0.22, 'triangle'], [2, 0.11, 'sine'], [3.01, 0.05, 'sine']]) {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq * mult, t0);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(amp, t0 + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            osc.connect(g);
            g.connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + dur + 0.02);
          }
        });
      } else {
        for (const [f0, f1, amp] of [[466.16, 138.59, 0.24], [311.13, 98.0, 0.20]]) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f0, now);
          osc.frequency.exponentialRampToValueAtTime(f1, now + 0.34);
          g.gain.setValueAtTime(amp, now);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.40);
        }
        const nSrc = ctx.createBufferSource();
        const bp = ctx.createBiquadFilter();
        const nGain = ctx.createGain();
        nSrc.buffer = getNoiseBuffer(ctx);
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1450, now);
        bp.frequency.exponentialRampToValueAtTime(340, now + 0.42);
        bp.Q.setValueAtTime(1.4, now);
        nGain.gain.setValueAtTime(0.28, now);
        nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
        nSrc.connect(bp);
        bp.connect(nGain);
        nGain.connect(ctx.destination);
        nSrc.start(now);
        nSrc.stop(now + 0.46);
      }
    } catch (_) {}
  }
  function play(files, folder, weapon, enabled, kind, critical = false) {
    // The main-field simulation may continue behind the plaza. Its combat sounds must not
    // bleed into the Social Hub; leaving the hub removes this gate and restores them.
    if (!enabled || document.body?.classList?.contains('social-open') || !context || context.state !== 'running' || document.hidden) return;
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
    lastForgeEvent: null,
    attack(enabled = true, weapon = 'fist') {
      play(attacks, 'attacks', weapon, enabled, 'attack');
    },
    hit(critical, enabled = true, weapon = 'fist', kind = 'normal') {
      play(hits, 'hits', weapon, enabled, kind === 'pet' ? 'pet' : kind === 'skill' ? 'skill' : 'normal', critical);
    },
    preloadForge() {
      preloadForge();
    },
    forgeStart(enabled = true, isStar = false) {
      playForgeStart(enabled, isStar);
    },
    forgeResult(succeeded, enabled = true, isStar = false) {
      playForgeResult(succeeded, enabled, isStar);
    }
  };
})();
