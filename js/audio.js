import { clamp } from './util.js';

// Fully synthesized sound: noise bursts, oscillators and a generated reverb.
const SHOTS = {
  pistol: { v: 0.65, f: 3200, d: 0.22, th: 150, max: 230 },
  smg: { v: 0.55, f: 2600, d: 0.17, th: 115, max: 260 },
  rifle: { v: 0.95, f: 2100, d: 0.5, th: 85, max: 480 },
  kar: { v: 0.9, f: 1900, d: 0.5, th: 80, max: 480 },
  mp40: { v: 0.5, f: 2300, d: 0.17, th: 105, max: 260 },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.L = { x: 0, y: 0, z: 0, yaw: 0 };
    this.loops = {};
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.mus = ctx.createGain();
    this.mus.gain.value = 0.32;
    this.mus.connect(this.master);
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(3.2, 2.4);
    const vg = ctx.createGain();
    vg.gain.value = 0.55;
    this.verb.connect(vg);
    vg.connect(this.master);

    const len = ctx.sampleRate * 2;
    const nb = ctx.createBuffer(1, len, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    const bb = ctx.createBuffer(1, len, ctx.sampleRate), bd = bb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      bd[i] = last * 3.5;
    }
    this.brownBuf = bb;
  }

  get t() { return this.ctx.currentTime; }

  impulse(dur, decay) {
    const r = this.ctx.sampleRate, len = r * dur, b = this.ctx.createBuffer(2, len, r);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  setListener(x, y, z, yaw) {
    this.L.x = x; this.L.y = y; this.L.z = z; this.L.yaw = yaw;
  }

  spatial(pos, maxD) {
    if (!pos) return { g: 1, p: 0, d: 0 };
    const dx = pos.x - this.L.x, dy = (pos.y ?? this.L.y) - this.L.y, dz = pos.z - this.L.z;
    const d = Math.hypot(dx, dy, dz);
    let g = clamp(1 - d / maxD, 0, 1);
    g *= g;
    const rx = Math.cos(this.L.yaw), rz = -Math.sin(this.L.yaw);
    const p = d > 0.01 ? clamp((dx * rx + dz * rz) / d, -1, 1) * 0.8 : 0;
    return { g, p, d };
  }

  out(gain, pan = 0, rev = 0.25, dur = 3) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (p.pan) p.pan.value = pan;
    g.connect(p);
    p.connect(this.sfx);
    let s = null;
    if (rev > 0) {
      s = ctx.createGain();
      s.gain.value = rev;
      p.connect(s);
      s.connect(this.verb);
    }
    setTimeout(() => { p.disconnect(); if (s) s.disconnect(); }, dur * 1000);
    return g;
  }

  noiseSrc(brown = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this.brownBuf : this.noiseBuf;
    s.loop = true;
    return s;
  }

  burst({ out, t, dur, freq, freqEnd, type = 'lowpass', q = 0.7, vol = 1, brown = false, attack = 0.002 }) {
    const ctx = this.ctx;
    const n = this.noiseSrc(brown);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f);
    f.connect(g);
    g.connect(out);
    n.start(t, Math.random() * 1.5);
    n.stop(t + dur + 0.05);
  }

  tone({ out, t, dur, freq, freqEnd, type = 'sine', vol = 1, attack = 0.005 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------- one-shots ----------
  shot(kind, pos) {
    if (!this.ctx) return;
    const C = SHOTS[kind] || SHOTS.pistol;
    const s = this.spatial(pos, C.max);
    if (s.g < 0.002) return;
    const far = s.d / C.max, t = this.t;
    const out = this.out(C.v * Math.max(s.g, pos ? 0.05 : 1), s.p, 0.25 + far * 0.7, 4);
    this.burst({ out, t, dur: C.d, freq: C.f * (1 - far * 0.85) + 150, freqEnd: 180, vol: 1 });
    this.burst({ out, t, dur: 0.035, freq: 5000, type: 'highpass', vol: 0.6 * (1 - far) });
    this.tone({ out, t, dur: 0.2, freq: C.th, freqEnd: 30, vol: 0.9 * (1 - far * 0.7) });
  }

  explosion(pos, big = 1) {
    if (!this.ctx) return;
    const s = this.spatial(pos, 900);
    if (s.g < 0.001) return;
    const far = s.d / 900, t = this.t;
    const out = this.out(1.3 * big * Math.max(s.g, 0.04), s.p, 0.6 + far, 6);
    this.burst({ out, t, dur: 2.8, freq: 1100 * (1 - far * 0.7), freqEnd: 50, brown: true, vol: 1.4 });
    this.burst({ out, t, dur: 0.6, freq: 3500 * (1 - far * 0.8) + 200, freqEnd: 200, vol: 0.8 });
    this.tone({ out, t, dur: 1.4, freq: 70, freqEnd: 22, vol: 1 });
  }

  flak(near = 0.5) {
    if (!this.ctx) return;
    const t = this.t;
    const out = this.out(0.35 + near * 0.8, (Math.random() - 0.5) * 1.6, 0.8, 5);
    this.burst({ out, t, dur: 1.4, freq: 700 + near * 900, freqEnd: 60, brown: true, vol: 1.3 });
    this.tone({ out, t, dur: 0.8, freq: 55, freqEnd: 25, vol: 0.8 });
  }

  step(vol = 0.18) {
    if (!this.ctx) return;
    const t = this.t, out = this.out(vol, (Math.random() - 0.5) * 0.2, 0.02, 1);
    this.burst({ out, t, dur: 0.09, freq: 500 + Math.random() * 600, freqEnd: 120, vol: 1 });
  }

  click() {
    if (!this.ctx) return;
    const t = this.t, out = this.out(0.3, 0, 0.05, 1);
    this.burst({ out, t, dur: 0.03, freq: 4000, type: 'bandpass', q: 3, vol: 1 });
  }

  reload(stage = 0) {
    if (!this.ctx) return;
    const t = this.t, out = this.out(0.35, 0.2, 0.1, 1);
    this.burst({ out, t, dur: 0.05, freq: stage ? 2500 : 1600, type: 'bandpass', q: 4, vol: 1 });
    this.burst({ out, t: t + 0.06, dur: 0.04, freq: stage ? 3500 : 2200, type: 'bandpass', q: 5, vol: 0.8 });
  }

  bolt() {
    if (!this.ctx) return;
    const t = this.t, out = this.out(0.35, 0.2, 0.1, 1);
    this.burst({ out, t, dur: 0.06, freq: 1800, type: 'bandpass', q: 4, vol: 1 });
    this.burst({ out, t: t + 0.18, dur: 0.06, freq: 2600, type: 'bandpass', q: 4, vol: 1 });
  }

  hitmarker(head) {
    if (!this.ctx) return;
    const t = this.t, out = this.out(0.18, 0, 0, 1);
    this.tone({ out, t, dur: 0.06, freq: head ? 2400 : 1500, vol: 1 });
  }

  whiz() {
    if (!this.ctx) return;
    const t = this.t, out = this.out(0.25, (Math.random() - 0.5) * 1.6, 0.1, 1);
    this.burst({ out, t, dur: 0.16, freq: 3500, freqEnd: 700, type: 'bandpass', q: 6, vol: 1 });
  }

  impact(pos) {
    if (!this.ctx) return;
    const s = this.spatial(pos, 60);
    if (s.g < 0.01) return;
    const t = this.t, out = this.out(0.3 * s.g, s.p, 0.1, 1);
    this.burst({ out, t, dur: 0.07, freq: 1800, freqEnd: 300, vol: 1 });
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.t, out = this.out(0.5, 0, 0.05, 1);
    this.tone({ out, t, dur: 0.2, freq: 90, freqEnd: 40, vol: 1 });
    this.burst({ out, t, dur: 0.12, freq: 900, freqEnd: 200, vol: 0.7 });
  }

  thud(pos) {
    if (!this.ctx) return;
    const s = this.spatial(pos, 50);
    if (s.g < 0.01) return;
    const t = this.t, out = this.out(0.5 * s.g, s.p, 0.1, 1);
    this.tone({ out, t, dur: 0.25, freq: 70, freqEnd: 35, vol: 1 });
    this.burst({ out, t, dur: 0.2, freq: 400, freqEnd: 80, vol: 0.8 });
  }

  knife() {
    if (!this.ctx) return;
    const t = this.t, out = this.out(0.3, 0.2, 0.05, 1);
    this.burst({ out, t, dur: 0.18, freq: 1500, freqEnd: 6000, type: 'bandpass', q: 2, vol: 1 });
  }

  pickup() {
    if (!this.ctx) return;
    const t = this.t, out = this.out(0.25, 0, 0.1, 1);
    this.burst({ out, t, dur: 0.05, freq: 2000, type: 'bandpass', q: 3, vol: 1 });
    this.burst({ out, t: t + 0.08, dur: 0.06, freq: 3000, type: 'bandpass', q: 3, vol: 1 });
  }

  pin() {
    if (!this.ctx) return;
    const t = this.t, out = this.out(0.3, 0.3, 0.05, 1);
    this.tone({ out, t, dur: 0.15, freq: 3200, freqEnd: 2600, type: 'triangle', vol: 0.6 });
  }

  bounce(pos) {
    if (!this.ctx) return;
    const s = this.spatial(pos, 40);
    if (s.g < 0.01) return;
    const t = this.t, out = this.out(0.3 * s.g, s.p, 0.05, 1);
    this.burst({ out, t, dur: 0.06, freq: 1200, type: 'bandpass', q: 3, vol: 1 });
  }

  crash() {
    if (!this.ctx) return;
    const t = this.t, out = this.out(0.8, 0, 0.3, 3);
    this.burst({ out, t, dur: 0.6, freq: 2500, freqEnd: 200, vol: 1 });
    this.tone({ out, t, dur: 0.4, freq: 80, freqEnd: 30, vol: 1 });
  }

  heartbeat(vol = 0.6) {
    if (!this.ctx) return;
    const t = this.t, out = this.out(vol, 0, 0, 2);
    this.tone({ out, t, dur: 0.16, freq: 60, freqEnd: 38, vol: 1 });
    this.tone({ out, t: t + 0.22, dur: 0.14, freq: 55, freqEnd: 36, vol: 0.7 });
  }

  tinnitus(dur = 6) {
    if (!this.ctx) return;
    const t = this.t, out = this.out(0.08, 0, 0, dur + 1);
    this.tone({ out, t, dur, freq: 3900, vol: 1, attack: 0.05 });
  }

  radio() {
    if (!this.ctx) return;
    const t = this.t, out = this.out(0.12, 0, 0, 1);
    this.burst({ out, t, dur: 0.25, freq: 1800, type: 'bandpass', q: 1, vol: 1 });
  }

  bell() {
    if (!this.ctx) return;
    const t = this.t, out = this.out(0.25, 0, 0.3, 2);
    for (let i = 0; i < 6; i++) this.tone({ out, t: t + i * 0.12, dur: 0.1, freq: 1100, type: 'square', vol: 0.4 });
  }

  fanfare() {
    if (!this.ctx) return;
    const out = this.out(0.35, 0, 0.6, 8);
    const notes = [[392, 0, 0.3], [523, 0.3, 0.3], [659, 0.6, 0.3], [784, 0.9, 0.9], [659, 1.85, 0.3], [784, 2.2, 1.6]];
    for (const [f, dt, d] of notes) {
      const t = this.t + dt;
      for (const det of [0, 3]) this.tone({ out, t, dur: d, freq: f + det, type: 'sawtooth', vol: 0.25, attack: 0.04 });
      this.tone({ out, t, dur: d, freq: f / 2, type: 'triangle', vol: 0.4, attack: 0.04 });
    }
  }

  // ---------- loops ----------
  stopLoop(name, fade = 0.5) {
    const l = this.loops[name];
    if (!l || !this.ctx) return;
    if (l.timer) clearInterval(l.timer);
    const t = this.t;
    l.gain.gain.cancelScheduledValues(t);
    l.gain.gain.setValueAtTime(l.gain.gain.value, t);
    l.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => { l.nodes.forEach((n) => { try { n.stop(); } catch (e) { /* already stopped */ } }); l.gain.disconnect(); }, fade * 1000 + 100);
    delete this.loops[name];
  }

  startPlaneEngine() {
    if (!this.ctx || this.loops.plane) return;
    const ctx = this.ctx, t = this.t;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 2);
    gain.connect(this.sfx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.connect(gain);
    const nodes = [];
    for (const f of [62, 64.5, 124]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f > 100 ? 0.15 : 0.35;
      o.connect(g);
      g.connect(lp);
      o.start();
      nodes.push(o);
    }
    const n = this.noiseSrc(true);
    const ng = ctx.createGain();
    ng.gain.value = 0.9;
    n.connect(ng);
    ng.connect(lp);
    n.start();
    nodes.push(n);
    this.loops.plane = { gain, nodes };
  }

  startWind(vol = 0.18) {
    if (!this.ctx || this.loops.wind) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    gain.connect(this.sfx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.6;
    bp.connect(gain);
    const n = this.noiseSrc(true);
    n.connect(bp);
    n.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lg = ctx.createGain();
    lg.gain.value = 220;
    lfo.connect(lg);
    lg.connect(bp.frequency);
    lfo.start();
    this.loops.wind = { gain, nodes: [n, lfo] };
  }

  setLoopVolume(name, v, time = 0.3) {
    const l = this.loops[name];
    if (!l) return;
    l.gain.gain.setTargetAtTime(v, this.t, time);
  }

  startSiren() {
    if (!this.ctx || this.loops.siren) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    gain.connect(this.sfx);
    const s = ctx.createGain();
    s.gain.value = 0.4;
    gain.connect(s);
    s.connect(this.verb);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 600;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.22;
    const lg = ctx.createGain();
    lg.gain.value = 170;
    lfo.connect(lg);
    lg.connect(o.frequency);
    o.connect(gain);
    o.start();
    lfo.start();
    this.loops.siren = { gain, nodes: [o, lfo] };
  }

  startEngine() {
    if (!this.ctx || this.loops.engine) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    gain.connect(this.sfx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    lp.connect(gain);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 40;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 20;
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    o.connect(lp);
    o2.connect(g2);
    g2.connect(lp);
    o.start();
    o2.start();
    this.loops.engine = { gain, nodes: [o, o2], o, o2 };
  }

  setEngine(speed) {
    const l = this.loops.engine;
    if (!l) return;
    const f = 38 + Math.abs(speed) * 4.2;
    l.o.frequency.setTargetAtTime(f, this.t, 0.1);
    l.o2.frequency.setTargetAtTime(f / 2, this.t, 0.1);
  }

  startMusic() {
    if (!this.ctx || this.loops.music) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, this.t);
    gain.gain.linearRampToValueAtTime(0.5, this.t + 6);
    gain.connect(this.mus);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 2;
    lp.connect(gain);
    const s = ctx.createGain();
    s.gain.value = 0.6;
    gain.connect(s);
    s.connect(this.verb);
    const chords = [[73.4, 110, 146.8], [58.3, 87.3, 116.5], [65.4, 98, 130.8], [55, 82.4, 110]];
    const oscs = [];
    for (let i = 0; i < 3; i++) {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = chords[0][i];
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = 0.12;
        o.connect(g);
        g.connect(lp);
        o.start();
        oscs.push({ o, i });
      }
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lg = ctx.createGain();
    lg.gain.value = 200;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();
    let ci = 0;
    const timer = setInterval(() => {
      ci = (ci + 1) % chords.length;
      for (const { o, i } of oscs) o.frequency.setTargetAtTime(chords[ci][i], this.t, 1.2);
    }, 9000);
    this.loops.music = { gain, nodes: [...oscs.map((x) => x.o), lfo], timer };
  }
}
