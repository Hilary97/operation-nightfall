import * as THREE from 'three';
import { G } from './state.js';
import { createSoldier } from './soldiers.js';
import { hasLOS, resolveCircle, raySphere, rayCyl } from './collision.js';
import { clamp, lerp, rand, wrapAngle } from './util.js';
import { H, ROADBLOCK } from './world.js';

const WEAPONS = {
  rifle: { sound: 'kar', dmg: 19, burst: [1, 1], gap: [1.7, 2.7], rof: 0, range: 110, acc: 1 },
  smg: { sound: 'mp40', dmg: 8, burst: [3, 6], gap: [1.1, 1.9], rof: 0.11, range: 60, acc: 0.75 },
  pistol: { sound: 'pistol', dmg: 11, burst: [1, 2], gap: [0.9, 1.5], rof: 0.4, range: 40, acc: 0.85 },
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class Enemy {
  constructor(def) {
    this.def = def;
    this.group = def.group || 'base';
    this.kind = def.kind || 'rifle';
    const wpn = this.kind === 'officer' ? 'pistol' : this.kind;
    this.wname = wpn;
    this.w = WEAPONS[wpn];
    this.s = createSoldier(this.kind === 'officer' ? 'officer' : 'axis', wpn);
    G.scene.add(this.s.root);
    this.elev = def.elev || 0;
    this.static = !!def.static;
    this.patrol = def.patrol || null;
    this.pos = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.lastKnown = new THREE.Vector3();
    this.reset();
  }

  reset() {
    const d = this.def;
    this.pos.set(d.x, H(d.x, d.z) + this.elev, d.z);
    this.yaw = d.yaw || 0;
    this.hp = this.kind === 'officer' ? 140 : 100;
    this.dead = false;
    this.state = 'patrol';
    this.alert = 0;
    this.hasLast = false;
    this.lastSeenT = -99;
    this.canSee = false;
    this.losT = Math.random() * 0.3;
    this.fireT = 0;
    this.burstLeft = 0;
    this.wp = 0;
    this.waitT = rand(0, 2);
    this.aim = 0;
    this.move = 0;
    this.stuckT = 0;
    this.avoidT = 0;
    this.sideT = 0;
    this.side = 1;
    this.strafe = false;
    this.reactT = 0;
    this.searchT = 0;
    this.deathT = 0;
    this.s.root.rotation.set(0, 0, 0);
    this.s.anim.reset();
    this.updateModel(0, 0);
  }

  setLast(p) {
    this.lastKnown.copy(p);
    this.hasLast = true;
  }

  update(dt, t) {
    if (this.dead) { this.deathAnim(dt); return; }
    const P = G.player;
    const tp = P.aimPoint;
    this.eye.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
    const dx = tp.x - this.pos.x, dz = tp.z - this.pos.z, dist = Math.hypot(dx, dz);

    // Perception (throttled line-of-sight checks)
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.16 + Math.random() * 0.12;
      this.canSee = false;
      if (P.alive && dist < 170) {
        const combat = this.state === 'combat';
        let range = combat ? 150 : this.elev > 0 ? 90 : 62;
        if (P.crouching && !combat) range *= 0.6;
        if (P.inVehicle) range *= 1.4;
        if (dist < range) {
          const dot = (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / (dist || 1);
          if ((combat || dot > 0.3 || dist < 4) && hasLOS(this.eye, tp)) this.canSee = true;
        }
      }
    }

    if (this.canSee) {
      this.setLast(tp);
      this.lastSeenT = t;
      if (this.state !== 'combat') {
        const rate = (this.state === 'search' ? 2.4 : 1) * (1.5 - dist / 90) * (P.crouching ? 0.55 : 1) + (dist < 10 ? 2.5 : 0);
        this.alert += Math.max(0.3, rate) * dt;
        if (this.alert >= 1) this.enterCombat();
        else if (this.state === 'patrol') this.state = 'suspicious';
      }
    } else if (this.state === 'suspicious') {
      this.alert -= dt * 0.25;
      if (this.alert <= 0) { this.alert = 0; this.state = 'patrol'; }
    }
    if (this.state === 'combat' && t - this.lastSeenT > 7) { this.state = 'search'; this.searchT = 14; }

    let moveTo = null, speed = 0, face = null;
    this.aim = lerp(this.aim, this.state === 'combat' || this.state === 'search' ? 1 : 0, Math.min(1, dt * 4));

    switch (this.state) {
      case 'patrol':
        if (this.patrol && !this.static) {
          const w = this.patrol[this.wp];
          if (Math.hypot(w[0] - this.pos.x, w[1] - this.pos.z) < 1.2) {
            this.waitT -= dt;
            if (this.waitT <= 0) { this.wp = (this.wp + 1) % this.patrol.length; this.waitT = rand(1, 4); }
          } else { moveTo = w; speed = 1.5; }
        } else {
          face = (this.def.yaw || 0) + Math.sin(t * 0.3 + this.def.x) * 0.9;
        }
        break;
      case 'suspicious':
        face = Math.atan2(dx, dz);
        break;
      case 'combat':
        face = Math.atan2(dx, dz);
        if (this.canSee) {
          this.reactT -= dt;
          if (this.reactT <= 0) this.shootLogic(dt, dist, tp);
          if (!this.static) {
            this.sideT -= dt;
            if (this.sideT <= 0) { this.sideT = rand(1.2, 3); this.side = Math.random() < 0.5 ? -1 : 1; this.strafe = Math.random() < 0.55; }
            if (dist > this.w.range * 0.8) { moveTo = [tp.x, tp.z]; speed = 3.3; }
            else if (this.strafe) {
              moveTo = [this.pos.x + Math.cos(this.yaw) * this.side * 3, this.pos.z - Math.sin(this.yaw) * this.side * 3];
              speed = 1.9;
            }
          }
        } else if (!this.static && this.hasLast) { moveTo = [this.lastKnown.x, this.lastKnown.z]; speed = 3.5; }
        break;
      case 'search':
        if (this.hasLast && !this.static && Math.hypot(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z) > 2) {
          moveTo = [this.lastKnown.x, this.lastKnown.z];
          speed = 2.8;
        } else face = this.yaw + dt * 1.4;
        this.searchT -= dt;
        if (this.searchT <= 0) { this.state = 'patrol'; this.alert = 0.3; }
        break;
    }

    if (moveTo) {
      const mx = moveTo[0] - this.pos.x, mz = moveTo[1] - this.pos.z, md = Math.hypot(mx, mz);
      if (md > 0.3) {
        let vx = mx / md, vz = mz / md;
        if (this.avoidT > 0) {
          this.avoidT -= dt;
          const a = this.avoidDir * 1.25, c = Math.cos(a), s = Math.sin(a);
          const nx = vx * c - vz * s;
          vz = vx * s + vz * c;
          vx = nx;
        }
        const ox = this.pos.x, oz = this.pos.z;
        this.pos.x += vx * speed * dt;
        this.pos.z += vz * speed * dt;
        resolveCircle(this.pos, 0.4, this.pos.y, 1.8);
        const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
        if (moved < speed * dt * 0.35) {
          this.stuckT += dt;
          if (this.stuckT > 0.4) { this.avoidT = 1.3; this.avoidDir = Math.random() < 0.5 ? -1 : 1; this.stuckT = 0; }
        } else this.stuckT = 0;
        this.move = moved / Math.max(dt, 1e-4);
        if (face === null) face = Math.atan2(vx, vz);
        this.pos.y = H(this.pos.x, this.pos.z) + this.elev;
      } else this.move = lerp(this.move, 0, Math.min(1, dt * 8));
    } else this.move = lerp(this.move, 0, Math.min(1, dt * 8));

    if (face !== null) this.yaw += wrapAngle(face - this.yaw) * Math.min(1, dt * 6);
    this.updateModel(dt, t);
  }

  shootLogic(dt, dist, tp) {
    this.fireT -= dt;
    if (this.fireT > 0 || dist > this.w.range * 1.5) return;
    if (this.burstLeft <= 0) this.burstLeft = Math.round(rand(this.w.burst[0], this.w.burst[1]));
    this.fire(dist, tp);
    this.s.anim.fire();
    this.burstLeft--;
    this.fireT = this.burstLeft > 0 ? this.w.rof : rand(this.w.gap[0], this.w.gap[1]);
  }

  fire(dist, tp) {
    const P = G.player;
    const muzzle = this.s.muzzle.getWorldPosition(_v);
    let chance = clamp(0.6 - dist * 0.006, 0.1, 0.6) * this.w.acc;
    if (P.moving) chance *= 0.7;
    if (P.crouching) chance *= 0.8;
    if (P.inVehicle) chance *= 0.8;
    chance *= G.settings.difficulty;
    const hit = Math.random() < chance;
    const end = _v2.copy(tp);
    if (!hit) {
      end.x += rand(-1.6, 1.6);
      end.y += rand(-0.9, 1.3);
      end.z += rand(-1.6, 1.6);
    }
    // Stop the visible streak a few meters short of the player's camera
    const len = end.distanceTo(muzzle);
    if (len > 4) {
      end.sub(muzzle).multiplyScalar((len - 3) / len).add(muzzle);
      G.tracers.add(muzzle, end, 0xffb060);
    }
    G.audio.shot(this.w.sound, muzzle);
    G.fx.emit('flash', muzzle, { size: 0.55 });
    if (dist < 70) G.flash.flash(muzzle, 0xffa050, 12, 0.06, 18);
    if (hit) P.damage(this.w.dmg * rand(0.8, 1.2) * (0.6 + G.settings.difficulty * 0.4), this.pos);
    else if (dist < 45) {
      G.audio.whiz();
      const gx = tp.x + rand(-2.5, 2.5), gz = tp.z + rand(-2.5, 2.5);
      G.fx.emit('dust', new THREE.Vector3(gx, H(gx, gz) + 0.1, gz), { count: 3, speed: 1.5, up: 1 });
    }
  }

  damage(amount, head) {
    if (this.dead) return;
    this.hp -= amount;
    if (this.hp <= 0) { this.die(head); return; }
    this.s.anim.hit();
    if (this.state !== 'combat') {
      this.setLast(G.player.aimPoint);
      this.enterCombat();
      this.reactT = rand(0.3, 0.6);
    }
  }

  enterCombat() {
    if (this.state === 'combat') return;
    this.state = 'combat';
    this.alert = 1;
    this.reactT = rand(0.55, 0.95);
    this.fireT = 0;
    G.mission.onEnemyAlert(this);
  }

  die(head) {
    this.dead = true;
    this.deathT = 0;
    this.s.anim.die();
    G.audio.thud(this.pos);
    G.mission.onEnemyKilled(this, head);
  }

  deathAnim(dt) {
    if (this.deathT >= 3) return;
    this.deathT += dt;
    this.s.anim.update(dt);
  }

  updateModel(dt) {
    const r = this.s.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
    this.s.anim.update(dt, { move: this.move, aim: this.aim });
  }

  rayHit(o, d, maxT) {
    if (this.dead) return null;
    let best = null;
    const th = raySphere(o, d, this.pos.x + Math.sin(this.yaw) * 0.02, this.pos.y + 1.7, this.pos.z + Math.cos(this.yaw) * 0.02, 0.17);
    if (th !== null && th < maxT) best = { t: th, head: true };
    const tb = rayCyl(o, d, this.pos.x, this.pos.z, 0.32, this.pos.y + 0.05, this.pos.y + 1.52);
    if (tb !== null && tb < (best ? best.t : maxT)) best = { t: tb, head: false };
    return best;
  }
}

// ---------------- Spawn table ----------------
const DEFS = [
  // Watchtower riflemen (linked to searchlights by index)
  { x: -63, z: -48, elev: 6.25, static: true, kind: 'rifle', yaw: -2.4, tower: 0 },
  { x: 63, z: -48, elev: 6.25, static: true, kind: 'rifle', yaw: 2.4, tower: 1 },
  { x: -63, z: 48, elev: 6.25, static: true, kind: 'rifle', yaw: -0.8, tower: 2 },
  { x: 63, z: 48, elev: 6.25, static: true, kind: 'rifle', yaw: 0.8, tower: 3 },
  // Gate
  { x: -4, z: 50, static: true, kind: 'rifle', yaw: 0 },
  { x: 4, z: 50, static: true, kind: 'smg', yaw: 0.2 },
  // Patrols
  { x: -60, z: -40, kind: 'smg', patrol: [[-60, -40], [-60, 40]] },
  { x: 60, z: -40, kind: 'rifle', patrol: [[60, -40], [60, 20]] },
  { x: -40, z: -21, kind: 'rifle', patrol: [[-40, -21], [40, -21]] },
  { x: -30, z: -25, kind: 'smg', patrol: [[-30, -25], [-30, 30], [-15, 30], [-15, -25]] },
  { x: -10, z: 10, kind: 'rifle', patrol: [[-10, 10], [20, 10], [20, 35], [-10, 35]] },
  { x: 30, z: 22, kind: 'smg', patrol: [[30, 22], [66, 22], [66, 52], [30, 52]] },
  // Idle
  { x: -6, z: -38, kind: 'smg', yaw: 1.6, static: false },
  { x: 6, z: -30, kind: 'rifle', yaw: -2.6 },
  { x: 10, z: -44, kind: 'rifle', yaw: -1.6 },
  { x: -32, z: -5, kind: 'rifle', yaw: 1.2 },
  { x: -16, z: 3.5, kind: 'smg', yaw: -1.3 },
  // Command bunker
  { x: 31, z: -6, kind: 'officer', yaw: -1.6 },
  { x: 31, z: 0, kind: 'smg', yaw: -1.5 },
  // Forest patrol drawn by the crash smoke
  { x: -90, z: 46, kind: 'rifle', group: 'forest', patrol: [[-90, 46], [-107, 98], [-126, 138], [-107, 98]] },
  { x: -88, z: 42, kind: 'smg', group: 'forest', patrol: [[-88, 42], [-105, 96], [-123, 134], [-105, 96]] },
  // Roadblock
  { x: ROADBLOCK.x - 2, z: ROADBLOCK.z - 1, static: true, kind: 'rifle', group: 'road', yaw: -2.4 },
  { x: ROADBLOCK.x + 3, z: ROADBLOCK.z + 1, static: true, kind: 'smg', group: 'road', yaw: -2.2 },
  { x: ROADBLOCK.x - 5, z: ROADBLOCK.z + 4, kind: 'rifle', group: 'road', yaw: 0.8, patrol: [[ROADBLOCK.x - 5, ROADBLOCK.z + 4], [ROADBLOCK.x + 6, ROADBLOCK.z - 6]] },
  { x: ROADBLOCK.x + 1, z: ROADBLOCK.z - 6, static: true, kind: 'smg', group: 'road', yaw: 0.9 },
];

export function spawnEnemies() {
  for (const d of DEFS) {
    const e = new Enemy(d);
    if (d.tower !== undefined && G.world.searchlights[d.tower]) G.world.searchlights[d.tower].guard = e;
    G.enemies.push(e);
  }
}

export function updateEnemies(dt, t) {
  for (const e of G.enemies) e.update(dt, t);
}
