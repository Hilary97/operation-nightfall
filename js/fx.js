import * as THREE from 'three';
import { rand, lerp } from './util.js';

const TYPES = {
  fire: { tex: 'flame', add: true, life: [0.45, 0.9], size: [1.3, 0.35], alpha: [1, 0], c0: 0xffc060, c1: 0xff3810, grav: -2.5, drag: 1.5 },
  smoke: { tex: 'smoke', add: false, life: [3, 5.5], size: [1.5, 6], alpha: [0.45, 0], c0: 0x2a2826, c1: 0x6a6660, grav: -0.6, drag: 0.4, fadeIn: 0.12 },
  bigsmoke: { tex: 'smoke', add: false, life: [6, 10], size: [4, 16], alpha: [0.5, 0], c0: 0x1c1a18, c1: 0x4a4744, grav: -0.8, drag: 0.2, fadeIn: 0.1 },
  dust: { tex: 'smoke', add: false, life: [0.6, 1.1], size: [0.3, 1.6], alpha: [0.6, 0], c0: 0x8a7a60, c1: 0x6a6050, grav: 1, drag: 3 },
  blood: { tex: 'soft', add: false, life: [0.35, 0.6], size: [0.25, 0.6], alpha: [0.95, 0], c0: 0x6a0808, c1: 0x300404, grav: 6, drag: 2 },
  spark: { tex: 'soft', add: true, life: [0.2, 0.5], size: [0.12, 0.03], alpha: [1, 0], c0: 0xffe0a0, c1: 0xff7020, grav: 9.8, drag: 0.5 },
  flash: { tex: 'flash', add: true, life: [0.05, 0.07], size: [1, 1.3], alpha: [1, 0.2], c0: 0xffe6b0, c1: 0xff9040, grav: 0, drag: 0 },
  boom: { tex: 'flame', add: true, life: [0.25, 0.4], size: [6, 14], alpha: [1, 0], c0: 0xfff0c0, c1: 0xff5010, grav: 0, drag: 0 },
  debris: { tex: 'soft', add: false, life: [0.8, 1.6], size: [0.2, 0.15], alpha: [1, 1], c0: 0x1a1612, c1: 0x1a1612, grav: 14, drag: 0.3 },
  flare: { tex: 'glow', add: true, life: [0.5, 0.9], size: [3, 1], alpha: [1, 0], c0: 0xb0ff90, c1: 0x30a020, grav: -0.5, drag: 1, nofog: true },
  ember: { tex: 'soft', add: true, life: [1, 2.2], size: [0.1, 0.04], alpha: [1, 0], c0: 0xffb050, c1: 0xff4010, grav: -1.5, drag: 0.6 },
};

export class Particles {
  constructor(scene, T, max = 900) {
    this.T = T;
    this.pool = [];
    this.live = [];
    for (let i = 0; i < max; i++) {
      const m = new THREE.SpriteMaterial({ map: T.soft, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.visible = false;
      scene.add(s);
      this.pool.push({ s, m, v: new THREE.Vector3(), c0: new THREE.Color(), c1: new THREE.Color() });
    }
  }

  emit(type, pos, { vel = null, count = 1, spread = 0, speed = 0, size = 1, life = 1, up = 0 } = {}) {
    const cfg = TYPES[type];
    for (let i = 0; i < count; i++) {
      const p = this.pool.pop();
      if (!p) return;
      p.cfg = cfg;
      p.m.map = this.T[cfg.tex];
      p.m.blending = cfg.add ? THREE.AdditiveBlending : THREE.NormalBlending;
      p.m.fog = !cfg.nofog;
      p.s.position.set(pos.x + rand(-spread, spread), pos.y + rand(-spread, spread) * 0.5, pos.z + rand(-spread, spread));
      if (vel) p.v.copy(vel); else p.v.set(0, 0, 0);
      if (speed) p.v.add(new THREE.Vector3(rand(-1, 1), rand(-0.3, 1) + up, rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1)));
      p.life = p.max = rand(cfg.life[0], cfg.life[1]) * life;
      const k = size * rand(0.75, 1.25);
      p.s0 = cfg.size[0] * k;
      p.s1 = cfg.size[1] * k;
      p.c0.setHex(cfg.c0);
      p.c1.setHex(cfg.c1);
      p.m.rotation = rand(0, Math.PI * 2);
      p.rs = rand(-1, 1) * 0.8;
      p.s.visible = true;
      p.s.scale.set(p.s0, p.s0, 1);
      this.live.push(p);
    }
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        this.pool.push(p);
        continue;
      }
      const cfg = p.cfg, k = 1 - p.life / p.max;
      p.v.y -= cfg.grav * dt;
      p.v.multiplyScalar(Math.max(0, 1 - cfg.drag * dt));
      p.s.position.addScaledVector(p.v, dt);
      const sz = lerp(p.s0, p.s1, k);
      p.s.scale.set(sz, sz, 1);
      let a = lerp(cfg.alpha[0], cfg.alpha[1], k);
      if (cfg.fadeIn && k < cfg.fadeIn) a *= k / cfg.fadeIn;
      p.m.opacity = a;
      p.m.color.copy(p.c0).lerp(p.c1, k);
      p.m.rotation += p.rs * dt;
    }
  }

  clear() {
    for (const p of this.live) { p.s.visible = false; this.pool.push(p); }
    this.live.length = 0;
  }
}

// Bullet tracers: short glowing streaks that travel along the shot path.
export class Tracers {
  constructor(scene, max = 48) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0, 0.5);
    this.pool = [];
    this.live = [];
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.pool.push({ m, a: new THREE.Vector3(), d: new THREE.Vector3(), len: 0, age: 0 });
    }
  }

  add(from, to, color = 0xffd08a, speed = 380) {
    const p = this.pool.pop();
    if (!p) return;
    p.a.copy(from);
    p.d.subVectors(to, from);
    p.len = p.d.length();
    if (p.len < 0.5) { this.pool.push(p); return; }
    p.d.divideScalar(p.len);
    p.age = 0;
    p.speed = speed;
    p.m.material.color.setHex(color);
    p.m.visible = true;
    this.live.push(p);
  }

  update(dt) {
    const tmp = new THREE.Vector3();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      const head = Math.min(p.age * p.speed, p.len), tail = Math.max(0, head - 7);
      if (tail >= p.len - 0.01) {
        p.m.visible = false;
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        this.pool.push(p);
        continue;
      }
      p.m.position.copy(p.a).addScaledVector(p.d, tail);
      tmp.copy(p.a).addScaledVector(p.d, head);
      p.m.lookAt(tmp);
      p.m.scale.set(0.025, 0.025, Math.max(0.01, head - tail));
    }
  }
}

// Fixed pool of point lights for muzzle flashes and explosions. The light count
// never changes, so shaders are never recompiled mid-game.
export class FlashPool {
  constructor(scene, n = 3) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 30, 2);
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 1, peak: 0 });
    }
    this.i = 0;
  }

  flash(pos, color, intensity, dur, distance = 30) {
    const e = this.lights[this.i];
    this.i = (this.i + 1) % this.lights.length;
    e.l.position.copy(pos);
    e.l.color.setHex(color);
    e.l.distance = distance;
    e.peak = intensity;
    e.dur = dur;
    e.t = dur;
    e.l.intensity = intensity;
  }

  update(dt) {
    for (const e of this.lights) {
      if (e.t <= 0) { e.l.intensity = 0; continue; }
      e.t -= dt;
      e.l.intensity = e.peak * Math.max(0, e.t / e.dur);
    }
  }
}

export const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.055 },
    uVignette: { value: 0.8 },
    uDamage: { value: 0 },
    uBlur: { value: 0 },
    uFlash: { value: 0 },
    uSepia: { value: 0.25 },
    uAberr: { value: 1 },
    uFade: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uDamage, uBlur, uFlash, uSepia, uAberr, uFade;
    uniform vec2 uRes;
    varying vec2 vUv;
    float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      vec3 col;
      if (uBlur > 0.01) {
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 0.5236;
          float rr = uBlur * 0.014 * (0.5 + 0.5 * mod(float(i), 2.0));
          acc += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * rr).rgb;
        }
        col = acc / 12.0;
        vec3 ghost = texture2D(tDiffuse, uv + vec2(uBlur * 0.025 * sin(uTime * 1.3), 0.0)).rgb;
        col = mix(col, ghost, 0.35 * uBlur);
      } else {
        float ab = uAberr * 0.0022 * (0.3 + r2 * 4.0);
        col.r = texture2D(tDiffuse, uv + c * ab).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - c * ab).b;
      }
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lum) * vec3(1.08, 0.97, 0.8), uSepia);
      col = (col - 0.5) * 1.07 + 0.5;
      col *= 1.0 - uVignette * smoothstep(0.12, 0.8, r2 * 1.7);
      col = mix(col, vec3(0.42, 0.0, 0.0), uDamage * smoothstep(0.03, 0.42, r2));
      col += (rnd(uv * uRes * 0.5 + fract(uTime * 7.3) * 100.0) - 0.5) * uGrain;
      float frame = floor(uTime * 18.0);
      float sc = step(0.982, rnd(vec2(frame, 3.0)));
      float sx = rnd(vec2(frame, 7.0));
      col += sc * 0.1 * smoothstep(0.0015, 0.0, abs(uv.x - sx));
      col *= 0.988 + 0.012 * sin(uTime * 47.0);
      col = mix(col, vec3(1.0), uFlash);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

// Additive volumetric cone used for searchlights.
export function beamMaterial(color = 0xfff3d0, opacity = 0.22) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      varying float vD; varying vec3 vN; varying vec3 vV;
      void main() {
        vD = clamp(position.z / 60.0, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity;
      varying float vD; varying vec3 vN; varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
        float a = (1.0 - vD) * (1.0 - vD) * edge * uOpacity;
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
  });
}
