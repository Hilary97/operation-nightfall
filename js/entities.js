import * as THREE from 'three';
import { G } from './state.js';
import { H, WAKE, WRECK, BOUND } from './world.js';
import * as M from './models.js';
import { overlapsCircle, rayCyl } from './collision.js';
import { clamp, lerp, rand } from './util.js';
import { updateProjectiles } from './projectiles.js';

const _v = new THREE.Vector3();

// ---------------- Items ----------------
export class Item {
  constructor(type, x, z, { y = null, label = '', auto = false, onTake, model, hidden = false } = {}) {
    this.type = type;
    this.label = label;
    this.auto = auto;
    this.onTake = onTake;
    this.taken = false;
    this.hidden = hidden;
    this.pos = new THREE.Vector3(x, y ?? H(x, z) + 0.05, z);
    this.root = new THREE.Group();
    this.root.position.copy(this.pos);
    if (model) this.root.add(model);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.T.glow, color: 0xffd080, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(1.4, 1.4, 1);
    glow.position.y = 0.3;
    this.glow = glow;
    this.root.add(glow);
    this.root.visible = !hidden;
    M.setShadows(this.root, true, false);
    G.scene.add(this.root);
  }

  take() {
    if (this.taken) return;
    this.taken = true;
    this.root.visible = false;
    G.audio.pickup();
    this.onTake?.(this);
  }
}

function itemModel(type) {
  const g = new THREE.Group();
  const T = G.T;
  const steel = M.mat('gunsteel', { color: 0x23262b, roughness: 0.4, metalness: 0.8 });
  const wood = M.mat('gunwood', { color: 0x5a3b22, roughness: 0.55 });
  switch (type) {
    case 'compass': {
      M.part(M.cylY(0.07, 0.03, 16), M.mat('brass', { color: 0xb08a40, metalness: 0.9, roughness: 0.3 }), 0, 0.02, 0, g);
      break;
    }
    case 'thompson': {
      M.part(M.scaledBox(1.1, 0.6, 0.7, 1.2), new THREE.MeshStandardMaterial({ map: T.crate, roughness: 0.9 }), 0, 0.3, 0, g);
      const gun = new THREE.Group();
      M.part(M.boxG(0.06, 0.07, 0.5), steel, 0, 0, 0, gun);
      M.part(M.boxG(0.05, 0.1, 0.3), wood, 0, -0.01, -0.38, gun);
      M.part(M.boxG(0.035, 0.18, 0.04), steel, 0, -0.1, 0.08, gun);
      gun.position.set(0, 0.66, 0);
      gun.rotation.set(0, 0.5, Math.PI / 2);
      g.add(gun);
      break;
    }
    case 'sniper': {
      M.part(M.scaledBox(1.1, 0.6, 0.7, 1.2), new THREE.MeshStandardMaterial({ map: T.crate, roughness: 0.9 }), 0, 0.3, 0, g);
      const gun = new THREE.Group();
      M.part(M.boxG(0.05, 0.07, 1.1), wood, 0, 0, 0, gun);
      M.part(M.cylZ(0.012, 0.4, 6), steel, 0, 0.03, -0.7, gun);
      M.part(M.cylZ(0.014, 0.32, 10), steel, 0, 0.08, -0.05, gun);
      M.part(M.cylZ(0.022, 0.09, 10), steel, 0, 0.08, -0.25, gun);
      gun.position.set(0, 0.7, 0);
      gun.rotation.set(0, -0.35, 0);
      g.add(gun);
      break;
    }
    case 'rifle': {
      const gun = new THREE.Group();
      M.part(M.boxG(0.05, 0.08, 1.1), wood, 0, 0, 0, gun);
      M.part(M.cylZ(0.012, 0.3, 6), steel, 0, 0.03, 0.65, gun);
      gun.position.y = 0.06;
      gun.rotation.set(0, 0.8, Math.PI / 2);
      g.add(gun);
      break;
    }
    case 'medkit':
      M.part(M.boxG(0.45, 0.22, 0.32), new THREE.MeshStandardMaterial({ map: T.medkit, roughness: 0.8 }), 0, 0.11, 0, g);
      break;
    case 'ammo':
      M.part(M.boxG(0.5, 0.28, 0.25), M.mat('ammobox', { color: 0x4a4c30, roughness: 0.7, metalness: 0.3 }), 0, 0.14, 0, g);
      break;
    case 'grenades':
      M.part(M.boxG(0.5, 0.25, 0.35), M.mat('nadebox', { color: 0x3a3c28, roughness: 0.8 }), 0, 0.12, 0, g);
      for (const x of [-0.12, 0.12]) M.part(new THREE.SphereGeometry(0.06, 8, 6), M.mat('nade', { color: 0x3d4428, roughness: 0.7 }), x, 0.3, 0, g);
      break;
    case 'intel': {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshStandardMaterial({ map: T.paper, roughness: 0.9 }));
      p.rotation.x = -Math.PI / 2;
      p.position.y = 0.01;
      g.add(p);
      break;
    }
    default:
  }
  return g;
}

export function addItem(type, x, z, opts = {}) {
  const it = new Item(type, x, z, { model: itemModel(type), ...opts });
  G.items.push(it);
  return it;
}

export function spawnItems() {
  const P = () => G.player;
  addItem('compass', WAKE.x + 1.6, WAKE.z + 1.2, {
    label: 'Recoger la brújula',
    onTake: () => { P().hasCompass = true; G.hud.showCompass(true); G.hud.notice('BRÚJULA', 'Al menos ahora sabes dónde está el norte'); },
  });
  addItem('thompson', WRECK.x + 6, WRECK.z - 9, {
    label: 'Tomar la Thompson M1A1 de la caja de suministros',
    onTake: () => { P().giveWeapon(1, 90); G.mission.onThompson(); },
  });
  addItem('sniper', WRECK.x + 9, WRECK.z - 9, {
    label: 'Tomar el fusil de francotirador Springfield M1903A4',
    onTake: () => { P().giveWeapon(3, 15); G.hud.notice('SPRINGFIELD M1903A4', 'Mira telescópica 8×–12× — rueda del ratón para cambiar el aumento'); },
  });
  addItem('rifle', -60.5, -45.5, { label: 'Tomar el fusil Kar98k', onTake: () => P().giveWeapon(2, 20) });
  for (const [x, z] of [[-34, 9], [12, -47], [52, 16], [-24, 40]]) {
    addItem('medkit', x, z, { auto: true, label: 'Botiquín', onTake: () => { P().heal(50); G.hud.killfeed('+50 de salud'); } });
  }
  for (const [x, z] of [[-30, -3], [9, -33], [44, 40], [-50, 30], [WRECK.x - 4, WRECK.z + 5]]) {
    addItem('ammo', x, z, { auto: true, label: 'Munición', onTake: () => { P().addAmmo(0.5); G.hud.killfeed('Munición recogida'); } });
  }
  for (const [x, z] of [[16, 47], [-50, -32], [WRECK.x + 2, WRECK.z + 8]]) {
    addItem('grenades', x, z, { auto: true, label: 'Granadas', onTake: () => { P().grenades = Math.min(6, P().grenades + 2); G.hud.killfeed('+2 granadas'); } });
  }
  G.intel = addItem('intel', 33.6, -5.5, { y: 0.87, label: 'Tomar los documentos secretos', hidden: true, onTake: () => G.mission.takeIntel() });
}

// Dropped by enemies
export function dropLoot(pos) {
  const r = Math.random();
  if (r < 0.55) addItem('ammo', pos.x + rand(-0.5, 0.5), pos.z + rand(-0.5, 0.5), { auto: true, onTake: () => { G.player.addAmmo(0.25); G.hud.killfeed('Munición recogida'); } });
  else if (r < 0.7) addItem('medkit', pos.x, pos.z, { auto: true, onTake: () => { G.player.heal(35); G.hud.killfeed('+35 de salud'); } });
  else if (r < 0.8) addItem('grenades', pos.x, pos.z, { auto: true, onTake: () => { G.player.grenades = Math.min(6, G.player.grenades + 1); G.hud.killfeed('+1 granada'); } });
}

// ---------------- Explosive barrels ----------------
export class Barrel {
  constructor(x, z) {
    const y = H(x, z);
    this.pos = new THREE.Vector3(x, y, z);
    this.hp = 25;
    this.dead = false;
    const m = new THREE.Mesh(M.cylY(0.36, 1.05, 14), M.mat('fuel', { color: 0x7a1c14, roughness: 0.5, metalness: 0.5 }));
    m.position.set(x, y + 0.525, z);
    m.castShadow = m.receiveShadow = true;
    const band = new THREE.Mesh(M.cylY(0.37, 0.08, 14), M.mat('band', { color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 }));
    band.position.y = 0.2;
    m.add(band);
    G.scene.add(m);
    this.mesh = m;
    this.box = G.grid.add({ minX: x - 0.36, maxX: x + 0.36, minY: y, maxY: y + 1.05, minZ: z - 0.36, maxZ: z + 0.36 });
  }

  rayHit(o, d, maxT) {
    if (this.dead) return null;
    const t = rayCyl(o, d, this.pos.x, this.pos.z, 0.38, this.pos.y, this.pos.y + 1.05);
    return t !== null && t < maxT ? { t } : null;
  }

  damage(n) {
    if (this.dead) return;
    this.hp -= n;
    if (this.hp <= 0) this.explode();
  }

  explode() {
    this.dead = true;
    this.box.dead = true;
    this.mesh.visible = false;
    G.mission.explode(_v.copy(this.pos).setY(this.pos.y + 0.6), 8, 160);
    G.world.fires.push({ pos: this.pos.clone().setY(this.pos.y + 0.2), size: 0.7, rate: 12, acc: 0, seed: Math.random() * 9, base: 0, ttl: 14 });
  }
}

export function spawnBarrels() {
  for (const [x, z] of G.world.barrelSpots) G.barrels.push(new Barrel(x, z));
}

// ---------------- Grenades ----------------
export class Grenade {
  constructor(pos, vel) {
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.fuse = 3;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.mat('nade', { color: 0x3d4428, roughness: 0.7 }));
    m.castShadow = true;
    G.scene.add(m);
    this.mesh = m;
    this.dead = false;
  }

  update(dt) {
    this.fuse -= dt;
    this.vel.y -= 18 * dt;
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (overlapsCircle(nx, nz, 0.1, this.pos.y - 0.5, 1)) {
      this.vel.x *= -0.4;
      this.vel.z *= -0.4;
      G.audio.bounce(this.pos);
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    this.pos.y += this.vel.y * dt;
    const gy = H(this.pos.x, this.pos.z) + 0.07;
    if (this.pos.y < gy) {
      this.pos.y = gy;
      if (Math.abs(this.vel.y) > 2) G.audio.bounce(this.pos);
      this.vel.y = -this.vel.y * 0.3;
      this.vel.x *= 0.6;
      this.vel.z *= 0.6;
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += dt * 8;
    if (this.fuse <= 0) {
      this.dead = true;
      G.scene.remove(this.mesh);
      G.mission.explode(this.pos.clone().setY(this.pos.y + 0.3), 9, 200);
    }
  }
}

// ---------------- Drivable Kübelwagen ----------------
export class Vehicle {
  constructor(x, z, yaw) {
    const k = M.createKubel();
    M.setShadows(k.root);
    this.root = k.root;
    this.wheels = k.wheels;
    G.scene.add(this.root);
    this.home = { x, z, yaw };
    this.pos = new THREE.Vector3(x, H(x, z), z);
    this.yaw = yaw;
    this.speed = 0;
    this.steer = 0;
    this.occupied = false;
    this.update(0);
  }

  blocked(x, z) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const o of [1.3, 0, -1.3]) {
      if (overlapsCircle(x + fx * o, z + fz * o, 0.95, this.pos.y, 1.8)) return true;
    }
    for (const tk of G.tanks) if (Math.hypot(tk.pos.x - x, tk.pos.z - z) < 4.2) return true;
    return false;
  }

  update(dt) {
    const K = G.input.keys;
    if (this.occupied) {
      const ax = G.input.axis;
      const fwd = clamp((K.has('KeyW') ? 1 : 0) - (K.has('KeyS') ? 1 : 0) + ax.y, -1, 1);
      const st = clamp((K.has('KeyA') ? 1 : 0) - (K.has('KeyD') ? 1 : 0) - ax.x, -1, 1);
      if (fwd > 0) this.speed += (this.speed < 0 ? 20 : 9) * dt;
      else if (fwd < 0) this.speed -= (this.speed > 0 ? 20 : 6) * dt;
      else this.speed *= 1 - 0.9 * dt;
      if (K.has('Space')) this.speed *= 1 - 4 * dt;
      this.speed = clamp(this.speed, -7, 24);
      this.steer = lerp(this.steer, st * 0.55, Math.min(1, dt * 5));
      G.audio.setEngine(this.speed);
    } else {
      this.speed *= 1 - 3 * dt;
      this.steer = lerp(this.steer, 0, Math.min(1, dt * 3));
    }
    this.yaw += this.steer * this.speed * dt * 0.2;
    const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
    if (dt > 0 && Math.abs(this.speed) > 0.05) {
      if (this.blocked(nx, nz) || Math.max(Math.abs(nx), Math.abs(nz)) > BOUND) {
        if (Math.abs(this.speed) > 7 && this.occupied) { G.audio.crash(); G.player.shake = 0.7; }
        this.speed *= -0.25;
      } else {
        this.pos.x = nx;
        this.pos.z = nz;
      }
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const hF = H(this.pos.x + fx * 1.3, this.pos.z + fz * 1.3), hB = H(this.pos.x - fx * 1.3, this.pos.z - fz * 1.3);
    const hR = H(this.pos.x + rx * 0.8, this.pos.z + rz * 0.8), hL = H(this.pos.x - rx * 0.8, this.pos.z - rz * 0.8);
    this.pos.y = (hF + hB) / 2;
    this.root.position.copy(this.pos);
    this.root.rotation.set(Math.atan2(hB - hF, 2.6), this.yaw, Math.atan2(hR - hL, 1.6));
    for (const w of this.wheels) {
      w.m.rotation.x += (this.speed * dt) / 0.4;
      if (w.front) w.g.rotation.y = this.steer;
    }
    if (this.occupied && Math.abs(this.speed) > 5) {
      for (const e of G.enemies) {
        if (!e.dead && Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < 2.1 && Math.abs(e.pos.y - this.pos.y) < 2) {
          e.damage(500, false);
          G.player.shake = 0.3;
        }
      }
    }
  }
}

export function spawnVehicles() {
  G.vehicles.push(new Vehicle(40, 40, -Math.PI / 2));
}

export function updateEntities(dt, t) {
  const P = G.player;
  for (const it of G.items) {
    if (it.taken || it.hidden) continue;
    it.glow.material.opacity = 0.25 + Math.sin(t * 3 + it.pos.x) * 0.12;
    it.root.rotation.y += dt * 0.5;
    if (it.auto && P.alive && !P.inVehicle && Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z) < 1.3) {
      if (it.type === 'medkit' && P.hp >= 100) continue;
      it.take();
    }
  }
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    G.grenades[i].update(dt);
    if (G.grenades[i].dead) G.grenades.splice(i, 1);
  }
  updateProjectiles(dt);
  for (const v of G.vehicles) v.update(dt);
  for (let i = G.world.fires.length - 1; i >= 0; i--) {
    const f = G.world.fires[i];
    if (f.ttl !== undefined) {
      f.ttl -= dt;
      if (f.ttl <= 0) G.world.fires.splice(i, 1);
    }
  }
}
