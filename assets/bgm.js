(function () {
  'use strict';
  const BGM = {
    tracks: {},
    enabled: true,
    volume: 0.05,
    muted: false,
    mode: 'map',
    shuffle: false,
    manualIndex: 0,
    currentMap: null,
    indices: {},
    playingMap: null,
    currentTrack: null,
    audio: null,
    ytPlayer: null,
    ytReady: false,
    ytPlayerReady: false,
    ytContainer: null,
    ytPendingVideo: null,
    initDone: false,
    init: function () {
      if (this.initDone) return;
      this.initDone = true;
      this.tracks = (window.BGM_TRACKS && typeof window.BGM_TRACKS === 'object') ? window.BGM_TRACKS : {};
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.addEventListener('ended', () => { this.next(); });
      this.audio.addEventListener('error', () => { this.next(); });
      this.loadPrefs();
      if (!window.YT || !window.YT.Player) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      } else {
        this.ytReady = true;
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') try { prev(); } catch (e) {}
        this.ytReady = true;
        this._createYtPlayer();
      };
      if (window.YT && window.YT.Player) { this.ytReady = true; this._createYtPlayer(); }
    },
    loadPrefs: function () {
      try {
        if (typeof S !== 'undefined' && S && S.bgm && typeof S.bgm === 'object') {
          this.enabled = S.bgm.enabled !== false && !S.bgm.muted;
          if (typeof S.bgm.volume === 'number' && isFinite(S.bgm.volume)) this.volume = Math.max(0, Math.min(1, S.bgm.volume));
          this.muted = false;
        }
      } catch (e) {}
    },
    savePrefs: function () {
      try {
        if (typeof S !== 'undefined' && S) {
          if (!S.bgm || typeof S.bgm !== 'object') S.bgm = {};
          S.bgm.enabled = this.enabled;
          S.bgm.volume = this.volume;
          S.bgm.muted = this.muted;
          if (typeof save === 'function') save();
        }
      } catch (e) {}
    },
    _createYtPlayer: function () {
      if (this.ytPlayer || !this.ytReady) return;
      this.ytContainer = document.createElement('div');
      this.ytContainer.id = 'bgm-yt';
      this.ytContainer.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;';
      document.body.appendChild(this.ytContainer);
      try {
        this.ytPlayer = new YT.Player(this.ytContainer, {
          height: '1', width: '1',
          playerVars: { autoplay: 0, controls: 0, playsinline: 1, rel: 0 },
          events: {
            onReady: () => {
              this.ytPlayerReady = true;
              this._applyVolume();
              if (this.ytPendingVideo) {
                const v = this.ytPendingVideo;
                this.ytPendingVideo = null;
                this._ytLoad(v);
              }
            },
            onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) this.next(); }
          }
        });
      } catch (e) { this.ytPlayer = null; }
    },
    _ytLoad: function (vid) {
      if (!this.ytPlayer || typeof this.ytPlayer.loadVideoById !== 'function') return;
      try { this.ytPlayer.loadVideoById(vid); this.ytPlayer.playVideo(); } catch (e) {}
    },
    _applyVolume: function () {
      try {
        if (this.audio) this.audio.volume = this.muted ? 0 : this.volume;
        if (this.ytPlayer && typeof this.ytPlayer.setVolume === 'function') {
          this.ytPlayer.setVolume(this.muted ? 0 : Math.round(this.volume * 100));
          if (this.muted && typeof this.ytPlayer.mute === 'function') this.ytPlayer.mute();
          else if (typeof this.ytPlayer.unMute === 'function') this.ytPlayer.unMute();
        }
      } catch (e) {}
    },
    listFor: function (mp) {
      const t = this.tracks || {};
      if (mp !== null && mp !== undefined && Array.isArray(t[mp]) && t[mp].length) return t[mp];
      if (Array.isArray(t.default)) return t.default;
      return [];
    },
    allTracks: function () {
      const out = [];
      const t = this.tracks || {};
      Object.keys(t).forEach((k) => {
        if (k === 'default') return;
        const arr = t[k];
        if (!Array.isArray(arr)) return;
        arr.forEach((tr) => { out.push({ map: k, track: tr }); });
      });
      // de-dupe by title+id
      const seen = new Set();
      return out.filter((x) => {
        const key = (x.track.title || '') + '|' + (x.track.id || x.track.src || '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    playAllIndex: function (i) {
      const list = this.allTracks();
      if (!list.length) return;
      if (!this.enabled) { this.enabled = true; this.savePrefs(); }
      i = ((i % list.length) + list.length) % list.length;
      this.manualIndex = i;
      this.mode = 'manual';
      this.currentTrack = list[i].track;
      this.stopMedia();
      this._applyVolume();
      const tr = list[i].track;
      const isYt = tr && (tr.type === 'youtube' || tr.type === 'yt' || tr.youtube || tr.videoId || (tr.id && !tr.src && !tr.url && !tr.file));
      if (isYt) {
        let vid = tr.id || tr.videoId || tr.youtube || tr.url || tr.src;
        if (typeof vid === 'string') {
          const m = vid.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
          if (m) vid = m[1];
        }
        if (this.ytPlayerReady && this.ytPlayer && typeof this.ytPlayer.loadVideoById === 'function') {
          try { this.ytPlayer.loadVideoById(vid); this.ytPlayer.playVideo(); } catch (e) {}
        } else { this.ytPendingVideo = vid; }
      } else {
        const src = tr.src || tr.url || tr.file;
        if (!src) return;
        this.audio.src = src;
        const p = this.audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      this.savePrefs();
      this.renderUI();
    },
    setAutoMode: function () {
      this.mode = 'map';
      this.shuffle = false;
      this.playingMap = null;
      this.savePrefs();
      this.sync(this.currentMap);
      this.renderUI();
    },
    sync: function (mp) {
      this.init();
      this.loadPrefs();
      this._applyVolume();
      this.currentMap = document.body.classList.contains('social-open') ? 'social' : (mp === undefined ? this.currentMap : mp);
      if (!this.enabled) { this.stopMedia(); this.playingMap = this.currentMap; this.currentTrack = null; this.renderUI(); return; }
      if (this.mode !== 'map') { this.playingMap = this.currentMap; this.renderUI(); return; }
      const list = this.listFor(this.currentMap);
      if (!list.length) { this.stopMedia(); this.playingMap = this.currentMap; this.currentTrack = null; this.renderUI(); return; }
      if (this.playingMap === this.currentMap && this.currentTrack) { this.renderUI(); return; }
      if (this.indices[this.currentMap] === undefined) this.indices[this.currentMap] = 0;
      this.playingMap = this.currentMap;
      this.playIndex(this.indices[this.currentMap]);
      this.renderUI();
    },
    playLogin: function () {
      this.init();
      this.currentMap = 'login';
      this.playingMap = null;
      this.indices.login = 0;
      this.sync('login');
    },
    playIndex: function (i) {
      const mp = this.currentMap;
      const list = this.listFor(mp);
      if (!list.length) return;
      i = ((i % list.length) + list.length) % list.length;
      this.indices[mp] = i;
      const track = list[i];
      this.currentTrack = track;
      this.stopMedia();
      this._applyVolume();
      const isYt = track && (track.type === 'youtube' || track.type === 'yt' || track.youtube || track.videoId || track.id && !track.src && !track.url && !track.file);
      if (isYt) {
        let vid = track.id || track.videoId || track.youtube || track.url || track.src;
        if (typeof vid === 'string') {
          const m = vid.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
          if (m) vid = m[1];
        }
        if (this.ytPlayerReady && this.ytPlayer && typeof this.ytPlayer.loadVideoById === 'function') {
          try { this.ytPlayer.loadVideoById(vid); this.ytPlayer.playVideo(); } catch (e) {}
        } else {
          this.ytPendingVideo = vid;
        }
      } else {
        const src = track.src || track.url || track.file;
        if (!src) return;
        this.audio.src = src;
        const p = this.audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      this.renderUI();
    },
    stopMedia: function () {
      this.ytPendingVideo = null;
      try { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } catch (e) {}
      try { if (this.ytPlayer && typeof this.ytPlayer.stopVideo === 'function') this.ytPlayer.stopVideo(); } catch (e) {}
    },
    stop: function () { this.stopMedia(); this.currentTrack = null; },
    toggleShuffle: function () { this.init(); this.shuffle = !this.shuffle; if (this.shuffle) this.next(); this.renderUI(); },
    next: function () {
      if (!this.enabled) return;
      if (this.shuffle) {
        const list = this.allTracks(), current = list.findIndex(x => x.track === this.currentTrack);
        const choices = list.map((_, i) => i).filter(i => i !== current);
        if (choices.length) this.playAllIndex(choices[Math.floor(Math.random() * choices.length)]);
        return;
      }
      if (this.mode === 'manual') {
        this.playAllIndex(this.manualIndex + 1);
        return;
      }
      const mp = this.currentMap;
      const list = this.listFor(mp);
      if (!list.length) return;
      const i = (this.indices[mp] || 0) + 1;
      this.indices[mp] = i;
      this.playIndex(i);
      this.renderUI();
    },
    prev: function () {
      if (!this.enabled) return;
      if (this.mode === 'manual') {
        this.playAllIndex(this.manualIndex - 1);
        return;
      }
      const mp = this.currentMap;
      const list = this.listFor(mp);
      if (!list.length) return;
      const i = (this.indices[mp] || 0) - 1;
      this.indices[mp] = i;
      this.playIndex(i);
      this.renderUI();
    },
    setEnabled: function (v) {
      this.enabled = !!v;
      this.muted = false;
      this._applyVolume();
      this.savePrefs();
      if (!this.enabled) { this.stopMedia(); this.currentTrack = null; }
      else if (this.mode === 'manual') this.playAllIndex(this.manualIndex);
      else this.sync(this.currentMap);
      this.renderUI();
    },
    setMuted: function (v) { this.muted = !!v; this._applyVolume(); this.savePrefs(); this.renderUI(); },
    setVolume: function (v) { this.volume = Math.max(0, Math.min(1, Number(v))); this._applyVolume(); this.savePrefs(); this.renderUI(); },
    currentTitle: function () {
      return this.currentTrack ? (this.currentTrack.title || this.currentTrack.name || 'Track') : 'No track';
    },
    // ---- PC-only floating player widget (built into #bgmPlayer) ----
    expanded: false,
    _widgetBuilt: false,
    togglePanel: function (force) {
      this.expanded = (force === undefined) ? !this.expanded : !!force;
      this.renderUI();
    },
    _widgetClick: function (e) {
      const el = (e.target && e.target.closest) ? e.target.closest('[data-bgm],[data-bgm-i]') : null;
      if (!el) return;
      if (el.hasAttribute('data-bgm-i')) {
        this.playAllIndex(Number(el.getAttribute('data-bgm-i')) || 0);
        return;
      }
      switch (el.getAttribute('data-bgm')) {
        case 'expand': this.togglePanel(); break;
        case 'prev': this.prev(); break;
        case 'next': this.next(); break;
        case 'shuffle': this.toggleShuffle(); break;
        case 'power': this.setEnabled(!this.enabled); break;
        case 'auto': this.setAutoMode(); break;
      }
    },
    renderUI: function () {
      const root = document.getElementById('bgmPlayer');
      if (!root) return;
      if (!this._widgetBuilt) {
        this._widgetBuilt = true;
        root.hidden = false;
        root.innerHTML =
          '<div class="bgm-player-bar">' +
            '<button type="button" class="bgm-ib" data-bgm="expand" aria-expanded="false" aria-controls="bgmPlayerBody" title="Show every track">▾</button>' +
            '<span class="bgm-ico" aria-hidden="true">♫</span>' +
            '<b class="bgm-now">Map BGM</b><small class="bgm-mode">map</small>' +
            '<button type="button" class="bgm-ib" data-bgm="prev" title="Previous track" aria-label="Previous track">⏮</button>' +
            '<button type="button" class="bgm-ib" data-bgm="next" title="Next track" aria-label="Next track">⏭</button>' +
            '<button type="button" class="bgm-ib" data-bgm="shuffle" title="Shuffle tracks" aria-label="Shuffle tracks" aria-pressed="false">⤨</button>' +
            '<button type="button" class="bgm-ib" data-bgm="power" title="Turn BGM on or off" aria-pressed="true">⏻</button>' +
          '</div>' +
          '<div class="bgm-player-body" id="bgmPlayerBody" hidden>' +
            '<button type="button" class="bgm-row bgm-auto" data-bgm="auto">● Auto · map BGM</button>' +
            '<ul class="bgm-list"></ul>' +
            '<div class="bgm-vol"><label>Volume <input type="range" min="0" max="100" step="5" class="bgm-vol-range" aria-label="BGM volume"></label></div>' +
          '</div>';
        root.addEventListener('click', (e) => this._widgetClick(e));
        const vr = root.querySelector('.bgm-vol-range');
        if (vr) vr.addEventListener('input', () => { this.setVolume(vr.value / 100); });
      }
      const bar = root.querySelector('.bgm-player-bar');
      const body = root.querySelector('#bgmPlayerBody');
      const chev = root.querySelector('[data-bgm=expand]');
      const now = root.querySelector('.bgm-now');
      const modeTag = root.querySelector('.bgm-mode');
      const shuffleBtn = root.querySelector('[data-bgm=shuffle]');
      const powerBtn = root.querySelector('[data-bgm=power]');
      const autoRow = root.querySelector('.bgm-auto');
      const list = root.querySelector('.bgm-list');
      const vr = root.querySelector('.bgm-vol-range');
      if (body) body.hidden = !this.expanded;
      if (chev) {
        chev.textContent = this.expanded ? '▴' : '▾';
        chev.setAttribute('aria-expanded', String(!!this.expanded));
        chev.title = this.expanded ? 'Minimize player' : 'Show every track';
      }
      if (now) {
        now.textContent = !this.enabled ? 'BGM off'
          : (this.currentTrack ? this.currentTitle() : (this.mode === 'map' ? 'Map BGM' : 'No track'));
      }
      if (modeTag) {
        modeTag.textContent = this.mode === 'map' ? 'map' : 'picked';
        modeTag.title = this.mode === 'map' ? 'Following the map you are in' : 'Hand-picked track';
      }
      if (shuffleBtn) shuffleBtn.setAttribute('aria-pressed', String(this.shuffle));
      if (powerBtn) {
        powerBtn.setAttribute('aria-pressed', String(!!this.enabled));
        powerBtn.style.opacity = this.enabled ? '1' : '.45';
      }
      if (autoRow) autoRow.classList.toggle('on', this.mode === 'map');
      if (vr) vr.value = String(Math.round(this.volume * 100));
      if (list) {
        const all = this.allTracks();
        list.innerHTML = all.map((x, i) =>
          '<li><button type="button" class="bgm-row' +
          (this.mode === 'manual' && i === this.manualIndex ? ' on' : '') +
          '" data-bgm-i="' + i + '">♪ ' + String(x.track.title || x.track.name || 'Track') + '</button></li>'
        ).join('');
      }
      if (bar) bar.title = this.mode === 'map' ? 'Map BGM is playing · press ▾ to pick any track' : 'Playing a hand-picked track';
    }
  };
  window.BGM = BGM;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { BGM.renderUI(); });
  } else {
    BGM.renderUI();
  }
})();