const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

const SONGS = {
  menu: {
    bpm: 118,
    lead: [72, null, 76, 79, 81, null, 79, 76, 74, null, 72, 74, 76, null, null, null, 72, null, 76, 79, 84, null, 81, 79, 77, 76, 74, 72, 74, null, null, null],
    bass: [48, 55, 52, 55, 53, 57, 53, 57, 50, 57, 53, 57, 55, 59, 55, 59]
  },
  race: {
    bpm: 148,
    lead: [79, 81, 84, null, 81, 79, 76, null, 79, null, 76, 74, 72, null, 74, 76, 77, 76, 74, null, 72, 74, 76, null, 79, null, 81, 79, 76, null, null, null],
    bass: [48, 48, 55, 55, 53, 53, 57, 57, 50, 50, 57, 57, 55, 55, 59, 59]
  }
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    let s = {};
    try {
      s = JSON.parse(localStorage.getItem('ir.audio') || '{}');
    } catch {}
    this.musicVol = s.music ?? 0.5;
    this.sfxVol = s.sfx ?? 0.8;
    this.engineVol = s.engine ?? 0.4;
    this.engines = new Map();
    this.song = null;
    this.songTimer = null;
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  save() {
    try {
      localStorage.setItem('ir.audio', JSON.stringify({ music: this.musicVol, sfx: this.sfxVol, engine: this.engineVol }));
    } catch {}
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVol * 0.35;
    this.musicBus.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.pendingSong) this.playSong(this.pendingSong);
  }

  setMusic(v) {
    this.musicVol = v;
    if (this.musicBus) this.musicBus.gain.value = v * 0.35;
    this.save();
  }

  setEngine(v) {
    this.engineVol = v;
    this.save();
  }

  setSfx(v) {
    this.sfxVol = v;
    if (this.sfxBus) this.sfxBus.gain.value = v;
    this.save();
  }

  tone(freq, dur, { type = 'square', vol = 0.2, at = 0, slide = 0, bus } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.3, freq = 1200, q = 0.8, type = 'lowpass', sweep = 0, at = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  sfx(name, vol = 1) {
    if (!this.ctx) return;
    switch (name) {
      case 'count':
        this.tone(440, 0.25, { type: 'square', vol: 0.18 * vol });
        break;
      case 'go':
        this.tone(880, 0.5, { type: 'square', vol: 0.2 * vol });
        this.tone(1320, 0.5, { type: 'triangle', vol: 0.12 * vol });
        break;
      case 'balloon':
        [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(76 + n), 0.12, { type: 'triangle', vol: 0.16 * vol, at: i * 0.05 }));
        break;
      case 'levelup':
        [0, 4, 7, 12, 16].forEach((n, i) => this.tone(NOTE(79 + n), 0.12, { type: 'square', vol: 0.1 * vol, at: i * 0.045 }));
        break;
      case 'coin':
        this.tone(NOTE(88), 0.08, { type: 'square', vol: 0.1 * vol });
        this.tone(NOTE(95), 0.18, { type: 'square', vol: 0.1 * vol, at: 0.07 });
        break;
      case 'boost':
        this.noise(0.6, { vol: 0.35 * vol, freq: 400, type: 'bandpass', q: 1.5, sweep: 6 });
        break;
      case 'pad':
        this.noise(0.4, { vol: 0.25 * vol, freq: 600, type: 'bandpass', q: 2, sweep: 4 });
        this.tone(NOTE(84), 0.2, { type: 'triangle', vol: 0.08 * vol, slide: 2 });
        break;
      case 'miniboost':
        this.noise(0.35, { vol: 0.22 * vol, freq: 800, type: 'bandpass', q: 2, sweep: 3 });
        break;
      case 'missile':
        this.noise(0.5, { vol: 0.3 * vol, freq: 2000, type: 'highpass', q: 0.7, sweep: 0.3 });
        break;
      case 'boom':
        this.noise(0.9, { vol: 0.55 * vol, freq: 900, type: 'lowpass', q: 0.7, sweep: 0.15 });
        this.tone(90, 0.5, { type: 'sine', vol: 0.4 * vol, slide: 0.4 });
        break;
      case 'hit':
        this.tone(300, 0.4, { type: 'sawtooth', vol: 0.15 * vol, slide: 0.3 });
        break;
      case 'shield':
        this.tone(NOTE(72), 0.5, { type: 'sine', vol: 0.18 * vol, slide: 2 });
        break;
      case 'drop':
        this.tone(220, 0.15, { type: 'square', vol: 0.12 * vol, slide: 0.6 });
        break;
      case 'magnet':
        this.tone(200, 0.6, { type: 'sawtooth', vol: 0.08 * vol, slide: 3 });
        break;
      case 'splash':
        this.noise(0.6, { vol: 0.35 * vol, freq: 3000, type: 'lowpass', sweep: 0.2 });
        break;
      case 'land':
        this.noise(0.15, { vol: 0.2 * vol, freq: 300 });
        break;
      case 'wall':
        this.noise(0.12, { vol: 0.25 * vol, freq: 500 });
        this.tone(120, 0.1, { type: 'square', vol: 0.1 * vol });
        break;
      case 'ring':
        this.tone(NOTE(84), 0.15, { type: 'sine', vol: 0.15 * vol });
        this.tone(NOTE(91), 0.25, { type: 'sine', vol: 0.15 * vol, at: 0.08 });
        break;
      case 'lap':
        [0, 7, 12].forEach((n, i) => this.tone(NOTE(72 + n), 0.15, { type: 'square', vol: 0.12 * vol, at: i * 0.1 }));
        break;
      case 'finallap':
        [0, 4, 7, 12, 7, 12].forEach((n, i) => this.tone(NOTE(76 + n), 0.12, { type: 'square', vol: 0.12 * vol, at: i * 0.08 }));
        break;
      case 'finish':
        [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(NOTE(72 + n), 0.25, { type: 'square', vol: 0.12 * vol, at: i * 0.09 }));
        break;
      case 'click':
        this.tone(NOTE(84), 0.05, { type: 'square', vol: 0.06 * vol });
        break;
      case 'join':
        this.tone(NOTE(79), 0.08, { type: 'square', vol: 0.1 * vol });
        this.tone(NOTE(86), 0.14, { type: 'square', vol: 0.1 * vol, at: 0.07 });
        break;
      case 'fall':
        this.tone(600, 0.8, { type: 'triangle', vol: 0.15 * vol, slide: 0.2 });
        break;
      case 'wrong':
        this.tone(200, 0.2, { type: 'square', vol: 0.1 * vol });
        break;
    }
  }

  engine(id, vehicle) {
    if (!this.ctx) return null;
    if (this.engines.has(id)) return this.engines.get(id);
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    o1.type = vehicle === 'plane' ? 'sawtooth' : 'sawtooth';
    o2.type = 'triangle';
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300;
    f.Q.value = 0.4;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    o1.start();
    o2.start();
    const e = { o1, o2, f, g, vehicle };
    this.engines.set(id, e);
    return e;
  }

  updateEngine(id, vehicle, speed, boosting, vol) {
    const e = this.engine(id, vehicle);
    if (!e) return;
    const t = this.ctx.currentTime;
    const base = vehicle === 'plane' ? 70 : vehicle === 'hover' ? 55 : 45;
    const f = base + speed * (vehicle === 'plane' ? 2.2 : 3.1) + (boosting ? 40 : 0);
    e.o1.frequency.setTargetAtTime(f, t, 0.05);
    e.o2.frequency.setTargetAtTime(f * (vehicle === 'hover' ? 1.5 : 0.5), t, 0.05);
    e.f.frequency.setTargetAtTime(220 + speed * 14, t, 0.05);
    e.g.gain.setTargetAtTime(vol * this.engineVol * this.engineVol * (0.012 + Math.min(1, speed / 40) * 0.012), t, 0.08);
  }

  stopEngines() {
    for (const e of this.engines.values()) {
      try {
        e.g.gain.value = 0;
        e.o1.stop();
        e.o2.stop();
        e.g.disconnect();
      } catch {}
    }
    this.engines.clear();
  }

  playSong(name) {
    if (!this.ctx) {
      this.pendingSong = name;
      return;
    }
    if (this.song === name) return;
    this.stopSong();
    this.song = name;
    const s = SONGS[name];
    if (!s) return;
    const step = 60 / s.bpm / 2;
    let next = this.ctx.currentTime + 0.1;
    let i = 0;
    const sched = () => {
      while (next < this.ctx.currentTime + 0.3) {
        const lead = s.lead[i % s.lead.length];
        if (lead) this.tone(NOTE(lead), step * 0.9, { type: 'square', vol: 0.09, at: next - this.ctx.currentTime, bus: this.musicBus });
        if (i % 2 === 0) {
          const b = s.bass[(i / 2) % s.bass.length];
          this.tone(NOTE(b - 12), step * 1.6, { type: 'triangle', vol: 0.22, at: next - this.ctx.currentTime, bus: this.musicBus });
        }
        if (i % 4 === 2) this.noise(0.05, { vol: 0.05, freq: 7000, type: 'highpass', at: next - this.ctx.currentTime });
        next += step;
        i++;
      }
    };
    sched();
    this.songTimer = setInterval(sched, 100);
  }

  stopSong() {
    clearInterval(this.songTimer);
    this.songTimer = null;
    this.song = null;
    this.pendingSong = null;
  }
}
