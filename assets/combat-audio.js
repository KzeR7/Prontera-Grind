/* Original synthesized hit cues; RO weapon-hit references: research/combat-audio.md. */
(function () {
  'use strict';
  let context, lastHit = -Infinity;
  function unlock() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      context ||= new AudioContext();
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch (_) { /* Audio is optional on unsupported browsers. */ }
  }
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  window.CombatAudio = {
    hit(critical, enabled = true) {
      if (!enabled || !context || context.state !== 'running' || document.hidden) return;
      const now = context.currentTime;
      // Bound overlapping AoE and repeated contacts; critical hits have priority.
      if (now - lastHit < (critical ? .035 : .075)) return;
      lastHit = now;
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = critical ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(critical ? 1100 : 230, now);
      oscillator.frequency.exponentialRampToValueAtTime(critical ? 140 : 55, now + .08);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(critical ? .12 : .07, now + .004);
      gain.gain.exponentialRampToValueAtTime(.0001, now + (critical ? .18 : .1));
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(now); oscillator.stop(now + .2);
    }
  };
})();
