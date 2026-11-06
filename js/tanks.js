import * as THREE from 'three';
import { G } from './state.js';
import { H } from './world.js';
import { hasLOS, overlapsCircle, rayBox } from './collision.js';
import { Projectile } from './projectiles.js';
import * as M from './models.js';
import { clamp, lerp, rand, wrapAngle } from './util.js';

const _v = new THREE.Vector3(), _aim = new THREE.Vector3();
const HP = 520;
// Hull half extents (x across, z along) used for hits and blast distance
const HX = 1.75, HZ = 2.95, HTOP = 2.7;

function createTankModel() {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const grey = M.mat('panzergrey', { color: 0x4c504a, roughness: 0.7, metalness: 0.35 });
  const dark = M.mat('track', { color: 0x1b1b1a, roughness: 0.9, metalness: 0.3 });
  const steel = M.mat('gunsteel', { color: 0x23262b, roughness: 0.4, metalness: 0.8 });
  M.part(M.boxG(2.5, 0.9, 5.4), grey, 0, 1.05, 0, root);
  M.part(M.boxG(2.3, 0.55, 3.6), grey, 0, 1.75, -0.3, root);
  M.part(M.boxG(2.4, 0.3, 0.8), grey, 0, 1.25, 2.85, root).rotation.x = -0.5;
  for (const s of [-1, 1]) {
    M.part(M.boxG(0.55, 0.95, 5.8), dark, s * 1.42, 0.55, 0, root);
    M.part(M.boxG(0.7, 0.06, 5.9), grey, s * 1.42, 1.08, 0, root);
    for (let i = 0; i < 8; i++) M.part(M.cylY(0.3, 0.12, 12).rotateZ(Math.PI / 2), steel, s * 1.72, 0.42, -2.3 + i * 0.66, root);
    M.part(M.cylY(0.36, 0.12, 12).rotateZ(Math.PI / 2), steel, s * 1.72, 0.75, 2.75, root);
  }
  const turret = new THREE.Group();
  turret.position.set(0, 2.02, -0.2);
  root.add(turret);
  M.part(M.boxG(1.9, 0.75, 2.4), grey, 0, 0.37, 0, turret);
  M.part(M.boxG(1.3, 0.55, 0.5), grey, 0, 0.32, 1.35, turret);
  M.part(M.cylY(0.33, 0.35, 12), grey, -0.3, 0.9, -0.6, turret);
  for (const s of [-1, 1]) M.part(M.boxG(0.05, 0.6, 2.0), grey, s * 1.15, 0.35, -0.1, turret);
  const barrel = new THREE.Group();
  barrel.position.set(0, 0.35, 1.5);
  turret.add(barrel);
  M.part(M.cylZ(0.075, 3.0, 10), steel, 0, 0, 1.5, barrel);
  M.part(M.cylZ(0.12, 0.3, 10), steel, 0, 0, 3.05, barrel);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 3.3);
  barrel.add(muzzle);
  // Balkenkreuz on the turret sides
  const cross = M.mat('cross', { color: 0xe8e4d8, roughness: 0.8 });
  for (const s of [-1, 1]) {
    M.part(M.boxG(0.02, 0.36, 0.1), cross, s * 0.96, 0.4, 0.3, turret, false);
    M.part(M.boxG(0.02, 0.1, 0.36), cross, s * 0.96, 0.4, 0.3, turret, false);
  }
  M.setShadows(root);
  return { root, turret, barrel, muzzle };
}

// Enemy tank: patrols, turns its turret onto the player and fires high-explosive shells.
// Only explosions hurt it (see mission.explode); bullets spark off the armour.
export class Tank {
  constructor(def) {
    this.def = def;
    this.group = def.group || 'kaserne';
    const m = createTankModel();
    Object.assign(this, m);
    G.scene.add(this.root);
    this.pos = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.lastKnown = new THREE.Vector3();
    this.box = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    this.dead = false;
    this.reset();
  }

  reset() {
    if (this.dead) return;
    const d = this.def;
    this.pos.set(d.x, H(d.x, d.z), d.z);
    this.yaw = d.yaw || 0;
    this.turretYaw = 0;
    this.pitch = 0;
    this.hp = HP;
    this.state = 'patrol';
    this.wp = 0;
    this.waitT = rand(1, 3);
    this.fireT = rand(2, 3);
    this.losT = 0;
    this.canSee = false;
    this.lastSeenT = -99;
    this.speed = 0;
    this.recoil = 0;
    this.updateModel(0);
  }

  update(dt, t) {
    if (this.dead) {
      if (Math.random() < dt * 6) G.fx.emit('bigsmoke', _v.set(this.pos.x, this.pos.y + 2.4, this.pos.z), { spread: 0.6, vel: new THREE.Vector3(0.5, 1.6, 0.2), size: 1.2 });
      return;
    }
    const P = G.player, tp = P.aimPoint;
    this.eye.set(this.pos.x, this.pos.y + 2.6, this.pos.z);
    const dx = tp.x - this.pos.x, dz = tp.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.3 + Math.random() * 0.15;
      const range = this.state === 'combat' ? 170 : P.crouching ? 60 : 95;
      this.canSee = P.alive && dist < range && hasLOS(this.eye, tp);
    }
    if (this.canSee) {
      this.lastKnown.copy(tp);
      this.lastSeenT = t;
      if (this.state !== 'combat') this.alarm();
    }
    if (this.state === 'combat' && t - this.lastSeenT > 12) this.state = 'patrol';

    // Hull: follow the patrol route, hold position while fighting
    let want = 0, face = null;
    if (this.state === 'patrol' && this.def.patrol) {
      const w = this.def.patrol[this.wp];
      const wx = w[0] - this.pos.x, wz = w[1] - this.pos.z;
      if (Math.hypot(wx, wz) < 2.5) {
        this.waitT -= dt;
        if (this.waitT <= 0) { this.wp = (this.wp + 1) % this.def.patrol.length; this.waitT = rand(2, 5); }
      } else {
        face = Math.atan2(wx, wz);
        if (Math.abs(wrapAngle(face - this.yaw)) < 0.4) want = 2.6;
      }
    }
    if (face !== null) this.yaw += clamp(wrapAngle(face - this.yaw), -0.5 * dt, 0.5 * dt);
    this.speed = lerp(this.speed, want, Math.min(1, dt * 1.5));
    if (this.speed > 0.05) {
      const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt, nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
      if (this.blocked(nx, nz)) this.speed = 0;
      else { this.pos.x = nx; this.pos.z = nz; }
    }

    // Turret and gun
    let aimYaw = this.yaw + Math.sin(t * 0.25 + this.def.x) * 0.8, aimPitch = 0;
    if (this.state === 'combat') {
      aimYaw = Math.atan2(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z);
      aimPitch = Math.atan2(this.lastKnown.y - (this.pos.y + 2.4), Math.max(1, dist));
    }
    const err = wrapAngle(aimYaw - (this.yaw + this.turretYaw));
    this.turretYaw += clamp(err, -0.75 * dt, 0.75 * dt);
    this.pitch = lerp(this.pitch, clamp(aimPitch, -0.15, 0.3), Math.min(1, dt * 2));
    this.fireT -= dt;
    if (this.state === 'combat' && this.canSee && Math.abs(err) < 0.06 && this.fireT <= 0) this.fire(dist);
    this.recoil = Math.max(0, this.recoil - dt * 2.5);

    // Push the player out of the hull
    if (!P.inVehicle && P.alive) {
      const px = P.pos.x - this.pos.x, pz = P.pos.z - this.pos.z, pd = Math.hypot(px, pz);
      if (pd < 3.2 && pd > 0.01 && P.pos.y < this.pos.y + HTOP) { P.pos.x = this.pos.x + (px / pd) * 3.2; P.pos.z = this.pos.z + (pz / pd) * 3.2; }
    }
    this.updateModel(dt);
  }

  blocked(x, z) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const o of [2.4, 0, -2.4]) if (overlapsCircle(x + fx * o, z + fz * o, 1.5, this.pos.y, 2.2)) return true;
    for (const v of G.vehicles) if (Math.hypot(v.pos.x - x, v.pos.z - z) < 4.2) return true;
    return false;
  }

  alarm() {
    this.state = 'combat';
    this.fireT = Math.max(this.fireT, rand(1.8, 2.8));
    G.mission.onTankAlert?.(this);
  }

  fire(dist) {
    this.fireT = rand(4.5, 6.5) / G.settings.difficulty;
    this.recoil = 1;
    const from = this.muzzle.getWorldPosition(new THREE.Vector3());
    // Lead-free aim with a miss cone that tightens up close
    const miss = clamp(dist * 0.035, 0.6, 5) * (G.player.moving ? 1.4 : 1) / G.settings.difficulty;
    _aim.copy(this.lastKnown).add(_v.set(rand(-miss, miss), rand(-0.4, 0.8), rand(-miss, miss)));
    const dir = _aim.sub(from).normalize();
    G.projectiles.push(new Projectile(from, dir, { speed: 95, radius: 6, dmg: 110, owner: 'tank', source: this, life: 3, kind: 'shell' }));
    G.audio.shot('cannon', from);
    G.fx.emit('flash', from, { size: 2.2 });
    G.fx.emit('bigsmoke', from, { count: 4, spread: 0.8, speed: 2, up: 0.5 });
    G.flash.flash(from, 0xffa050, 160, 0.12, 40);
    const dp = G.player.pos.distanceTo(from);
    G.player.shake = Math.max(G.player.shake, Math.max(0, 0.6 - dp / 60));
  }

  damage(n) {
    if (this.dead) return;
    this.hp -= n;
    G.fx.emit('spark', _v.set(this.pos.x, this.pos.y + 1.8, this.pos.z), { count: 14, speed: 9, up: 1 });
    G.hud.hitmarker(false, this.hp <= 0);
    if (this.hp <= 0) { this.die(); return; }
    this.lastKnown.copy(G.player.aimPoint);
    this.lastSeenT = G.time;
    if (this.state !== 'combat') this.alarm();
  }

  die() {
    this.dead = true;
    this.speed = 0;
    const scorched = M.mat('tankwreck', { color: 0x1d1b18, roughness: 0.85, metalness: 0.3 });
    this.root.traverse((o) => { if (o.isMesh) o.material = scorched; });
    this.turret.position.y += 0.25;
    this.turret.rotation.z = rand(-0.25, 0.25);
    this.barrel.rotation.x = 0.25;
    const c = new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z);
    G.mission.explode(c, 8, 140, { source: this });
    G.fx.emit('debris', c, { count: 24, speed: 16, up: 2 });
    G.world.fires.push({ pos: new THREE.Vector3(this.pos.x, this.pos.y + 2.4, this.pos.z), size: 1.1, rate: 20, acc: 0, seed: Math.random() * 9, base: 0, big: true });
    G.mission.onTankDestroyed?.(this);
  }

  updateModel() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const hF = H(this.pos.x + fx * 2.6, this.pos.z + fz * 2.6), hB = H(this.pos.x - fx * 2.6, this.pos.z - fz * 2.6);
    const hR = H(this.pos.x + rx * 1.4, this.pos.z + rz * 1.4), hL = H(this.pos.x - rx * 1.4, this.pos.z - rz * 1.4);
    this.pos.y = (hF + hB) / 2;
    this.root.position.copy(this.pos);
    if (!this.dead) {
      this.root.rotation.set(Math.atan2(hB - hF, 5.2), this.yaw, Math.atan2(hR - hL, 2.8));
      this.turret.rotation.y = this.turretYaw;
      this.barrel.rotation.x = -this.pitch;
      this.barrel.position.z = 1.5 - this.recoil * 0.35;
    }
    // World-aligned box around the rotated hull
    const ex = Math.abs(rx) * HX + Math.abs(fx) * HZ, ez = Math.abs(rz) * HX + Math.abs(fz) * HZ;
    const b = this.box;
    b.minX = this.pos.x - ex; b.maxX = this.pos.x + ex;
    b.minZ = this.pos.z - ez; b.maxZ = this.pos.z + ez;
    b.minY = this.pos.y; b.maxY = this.pos.y + HTOP;
  }

  rayHit(o, d, maxT) {
    const h = rayBox(o, d, this.box, maxT);
    return h && h.t < maxT ? { t: h.t } : null;
  }

  distTo(p) {
    const b = this.box;
    const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX), dy = Math.max(b.minY - p.y, 0, p.y - b.maxY), dz = Math.max(b.minZ - p.z, 0, p.z - b.maxZ);
    return Math.hypot(dx, dy, dz);
  }
}

export function spawnTanks(defs) {
  for (const d of defs) G.tanks.push(new Tank(d));
}

export function updateTanks(dt, t) {
  for (const tk of G.tanks) tk.update(dt, t);
}
