import * as THREE from 'three';
import { G } from './state.js';
import { raycast } from './collision.js';
import * as M from './models.js';
import { clamp } from './util.js';

const _p = new THREE.Vector3(), _t = new THREE.Vector3();

function projectileModel(kind) {
  const g = new THREE.Group();
  if (kind === 'shell') {
    M.part(M.cylZ(0.05, 0.3, 8), M.mat('shell', { color: 0x2b2a24, roughness: 0.5, metalness: 0.7 }), 0, 0, 0, g, false);
  } else {
    const od = M.mat('rocketbody', { color: 0x4b5030, roughness: 0.6, metalness: 0.3 });
    M.part(M.cylZ(0.03, 0.42, 10), od, 0, 0, 0, g, false);
    M.part(new THREE.ConeGeometry(0.03, 0.12, 10).rotateX(Math.PI / 2), od, 0, 0, 0.27, g, false);
    for (const r of [0, Math.PI / 2]) M.part(M.boxG(0.12, 0.004, 0.08), od, 0, 0, -0.2, g, false).rotation.z = r;
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.T.glow, color: kind === 'shell' ? 0xffd890 : 0xff9040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(kind === 'shell' ? 1.6 : 1.1, kind === 'shell' ? 1.6 : 1.1, 1);
  glow.position.z = -0.25;
  g.add(glow);
  return g;
}

// Bazooka rockets and tank shells: straight flight, explode on the first thing they hit.
export class Projectile {
  constructor(pos, dir, { speed = 70, radius = 7, dmg = 260, owner = 'player', source = null, life = 5, kind = 'rocket' } = {}) {
    this.pos = pos.clone();
    this.dir = dir.clone().normalize();
    this.speed = speed;
    this.radius = radius;
    this.dmg = dmg;
    this.owner = owner;
    this.source = source;
    this.life = life;
    this.kind = kind;
    this.dead = false;
    this.trailT = 0;
    this.mesh = projectileModel(kind);
    this.mesh.position.copy(this.pos);
    this.mesh.lookAt(_t.copy(this.pos).add(this.dir));
    G.scene.add(this.mesh);
  }

  update(dt) {
    this.life -= dt;
    let t = this.speed * dt, hit = false;
    const wh = raycast(this.pos, this.dir, t);
    if (wh) { t = wh.t; hit = true; }
    for (const tk of G.tanks) {
      if (tk === this.source) continue;
      const h = tk.rayHit(this.pos, this.dir, t);
      if (h) { t = h.t; hit = true; }
    }
    if (this.owner === 'player') {
      for (const e of G.enemies) {
        const h = e.rayHit(this.pos, this.dir, t);
        if (h) { t = h.t; hit = true; }
      }
    } else if (G.player.alive) {
      // Shells burst when they pass close to the player
      const a = G.player.aimPoint;
      const along = clamp(_p.subVectors(a, this.pos).dot(this.dir), 0, t);
      _p.copy(this.pos).addScaledVector(this.dir, along);
      if (_p.distanceTo(a) < 1.3) { t = along; hit = true; }
    }
    this.pos.addScaledVector(this.dir, t);
    this.mesh.position.copy(this.pos);
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = this.kind === 'shell' ? 0.06 : 0.02;
      G.fx.emit('smoke', this.pos, { spread: 0.1, size: this.kind === 'shell' ? 0.35 : 0.6 });
    }
    if (hit || this.life <= 0) this.explode();
  }

  explode() {
    this.dead = true;
    G.scene.remove(this.mesh);
    const at = this.pos.clone().addScaledVector(this.dir, -0.3);
    G.mission.explode(at, this.radius, this.dmg, { antiTank: true, source: this.source });
  }
}

export function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    G.projectiles[i].update(dt);
    if (G.projectiles[i].dead) G.projectiles.splice(i, 1);
  }
}
