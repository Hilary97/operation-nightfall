import * as THREE from 'three';
import { G } from './state.js';
import { H, BOUND } from './world.js';
import { resolveCircle, raycast } from './collision.js';
import { Grenade } from './entities.js';
import * as M from './models.js';
import { clamp, lerp, rand, wrapAngle } from './util.js';

// spread: hip-fire cone, adsSpread: cone through the sights, adsFov: camera FOV when fully aimed.
const WDEF = [
  { id: 'pistol', name: 'M1911', magSize: 7, reserve: 35, maxReserve: 70, rate: 0.17, auto: false, dmg: 38, spread: 0.012, adsSpread: 0.0025, kick: 0.024, reload: 1.5, sound: 'pistol', noise: 45, range: 140, adsFov: 55 },
  { id: 'smg', name: 'Thompson M1A1', magSize: 30, reserve: 0, maxReserve: 240, rate: 0.088, auto: true, dmg: 25, spread: 0.03, adsSpread: 0.0055, kick: 0.013, reload: 2.3, sound: 'smg', noise: 65, range: 160, adsFov: 52 },
  { id: 'rifle', name: 'Kar98k ZF39', magSize: 5, reserve: 0, maxReserve: 50, rate: 1.15, auto: false, dmg: 125, spread: 0.03, adsSpread: 0.0003, kick: 0.06, reload: 2.8, sound: 'kar', noise: 90, range: 320, adsFov: 15, scope: true },
];
const HIP_FOV = 75;

const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3(), _o = new THREE.Vector3(), _hit = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

// ---------------- First-person weapon models ----------------
class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0x8090b0, 0x2a2618, 1.6));
    const d = new THREE.DirectionalLight(0xc0d0ff, 1.4);
    d.position.set(-1, 2, 1);
    this.scene.add(d);
    this.flashLight = new THREE.PointLight(0xffa050, 0, 3, 2);
    this.flashLight.position.set(0.1, -0.05, -0.6);
    this.scene.add(this.flashLight);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.guns = [this.buildPistol(), this.buildThompson(), this.buildRifle()];
    for (const g of this.guns) { g.visible = false; this.root.add(g); }
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.T.flash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flash.visible = false;
    this.root.add(this.flash);
    this.knife = this.buildKnife();
    this.knife.visible = false;
    this.camera.add(this.knife);
    this.scene.add(this.camera);
    this.kick = 0;
    this.sway = new THREE.Vector2();
    this.flashT = 0;
  }

  hands(g, gripPos, forePos) {
    const skin = M.mat('vmskin', { color: 0xb07a58, roughness: 0.7 });
    const sleeve = M.mat('vmsleeve', { color: 0x5f5a3c, roughness: 0.95 });
    const rh = new THREE.Vector3(...gripPos), lh = new THREE.Vector3(...forePos);
    M.part(M.boxG(0.06, 0.09, 0.1), skin, rh.x, rh.y, rh.z, g, false);
    M.part(M.boxG(0.06, 0.07, 0.11), skin, lh.x, lh.y, lh.z, g, false);
    M.beam(rh.clone().add(new THREE.Vector3(0, -0.02, 0.05)), new THREE.Vector3(0.13, -0.3, 0.2), 0.085, 0.085, sleeve, g);
    M.beam(lh.clone().add(new THREE.Vector3(0, -0.02, 0.05)), new THREE.Vector3(-0.2, -0.32, 0.1), 0.085, 0.085, sleeve, g);
  }

  // Sights are built around a sight line at local y = SIGHT; the ADS offset puts
  // that line (the dots, for the pistol) exactly on the screen centre, the bullet path.
  sightDot() {
    return M.mat('vmsightdot', { color: 0xf2ecd8, emissive: 0xfff2c8, emissiveIntensity: 1.1, roughness: 0.4 });
  }

  buildPistol() {
    const g = new THREE.Group();
    const steel = M.mat('vmsteel', { color: 0x2a2d32, roughness: 0.35, metalness: 0.85 });
    const grip = M.mat('vmgrip', { color: 0x4a2e1a, roughness: 0.6 });
    const dot = this.sightDot();
    const SIGHT = 0.059;
    M.part(M.boxG(0.034, 0.038, 0.21), steel, 0, 0.03, -0.06, g, false);
    M.part(M.boxG(0.03, 0.025, 0.17), steel, 0, 0.0, -0.05, g, false);
    M.part(M.boxG(0.03, 0.1, 0.05), grip, 0, -0.045, 0.02, g, false).rotation.x = 0.25;
    // Rear notch: two blades whose tops sit on the sight line, with a dot on each
    for (const s of [-1, 1]) {
      M.part(M.boxG(0.009, 0.01, 0.008), steel, s * 0.008, SIGHT - 0.005, 0.036, g, false);
      M.part(M.boxG(0.0022, 0.0022, 0.001), dot, s * 0.0052, SIGHT - 0.0045, 0.0405, g, false);
    }
    // Front post, its top on the sight line, with a dot facing the shooter
    M.part(M.boxG(0.0045, 0.01, 0.007), steel, 0, SIGHT - 0.005, -0.155, g, false);
    M.part(M.boxG(0.0024, 0.0024, 0.001), dot, 0, SIGHT - 0.0045, -0.151, g, false);
    g.userData = { hip: new THREE.Vector3(0.17, -0.17, -0.38), ads: new THREE.Vector3(0, -(SIGHT - 0.0045), -0.31), muzzle: new THREE.Vector3(0, 0.03, -0.18) };
    this.hands(g, [0, -0.05, 0.03], [-0.02, -0.06, 0.0]);
    return g;
  }

  buildThompson() {
    const g = new THREE.Group();
    const steel = M.mat('vmsteel', { color: 0x2a2d32, roughness: 0.35, metalness: 0.85 });
    const wood = M.mat('vmwood', { color: 0x6a4024, roughness: 0.5 });
    M.part(M.boxG(0.05, 0.06, 0.32), steel, 0, 0.0, -0.1, g, false);
    M.part(M.cylZ(0.017, 0.26, 10), steel, 0, 0.0, -0.38, g, false);
    for (let i = 0; i < 6; i++) M.part(M.cylZ(0.024, 0.008, 10), steel, 0, 0, -0.32 - i * 0.025, g, false);
    M.part(M.boxG(0.045, 0.08, 0.28), wood, 0, -0.02, 0.18, g, false);
    M.part(M.boxG(0.035, 0.09, 0.045), wood, 0, -0.07, 0.02, g, false).rotation.x = 0.3;
    M.part(M.boxG(0.035, 0.08, 0.04), wood, 0, -0.06, -0.24, g, false);
    M.part(M.boxG(0.028, 0.17, 0.04), steel, 0, -0.11, -0.12, g, false);
    const SIGHT = 0.062;
    // Rear peep: an aperture ring on a raised base, flanked by protective ears
    M.part(M.boxG(0.014, 0.02, 0.012), steel, 0, 0.04, 0.03, g, false);
    M.part(new THREE.TorusGeometry(0.0085, 0.0018, 8, 24), steel, 0, SIGHT, 0.03, g, false);
    for (const s of [-1, 1]) M.part(M.boxG(0.004, 0.032, 0.016), steel, s * 0.0165, 0.056, 0.03, g, false);
    // Front blade on the barrel, its tip on the sight line
    M.part(M.boxG(0.012, 0.012, 0.02), steel, 0, 0.022, -0.49, g, false);
    M.part(M.boxG(0.0035, 0.034, 0.006), steel, 0, SIGHT - 0.017, -0.49, g, false);
    M.part(M.boxG(0.0025, 0.0025, 0.001), this.sightDot(), 0, SIGHT - 0.0025, -0.4865, g, false);
    g.userData = { hip: new THREE.Vector3(0.16, -0.18, -0.4), ads: new THREE.Vector3(0, -SIGHT, -0.24), muzzle: new THREE.Vector3(0, 0.0, -0.53) };
    this.hands(g, [0, -0.07, 0.03], [0, -0.07, -0.24]);
    return g;
  }

  buildRifle() {
    const g = new THREE.Group();
    const steel = M.mat('vmsteel', { color: 0x2a2d32, roughness: 0.35, metalness: 0.85 });
    const wood = M.mat('vmwood', { color: 0x6a4024, roughness: 0.5 });
    M.part(M.boxG(0.05, 0.07, 0.95), wood, 0, -0.02, -0.18, g, false);
    M.part(M.boxG(0.045, 0.1, 0.25), wood, 0, -0.04, 0.38, g, false);
    M.part(M.cylZ(0.012, 0.75, 8), steel, 0, 0.025, -0.42, g, false);
    M.part(M.boxG(0.03, 0.035, 0.22), steel, 0, 0.03, 0.02, g, false);
    M.part(new THREE.SphereGeometry(0.015, 8, 6), steel, 0.05, 0.03, 0.08, g, false);
    M.part(M.boxG(0.004, 0.012, 0.004), steel, 0, 0.046, -0.78, g, false);
    // ZF39 telescopic sight: tube, objective and ocular bells, mounts and lenses
    const SIGHT = 0.085;
    const glass = M.mat('vmglass', { color: 0x1a2a3a, emissive: 0x2a4a70, emissiveIntensity: 0.35, roughness: 0.05, metalness: 0.6 });
    M.part(M.cylZ(0.014, 0.22, 14), steel, 0, SIGHT, 0, g, false);
    M.part(M.cylZ(0.021, 0.07, 16), steel, 0, SIGHT, -0.13, g, false);
    M.part(M.cylZ(0.018, 0.05, 16), steel, 0, SIGHT, 0.13, g, false);
    for (const z of [-0.06, 0.08]) {
      M.part(M.boxG(0.012, 0.03, 0.012), steel, 0, 0.06, z, g, false);
      M.part(new THREE.TorusGeometry(0.0155, 0.003, 6, 18), steel, 0, SIGHT, z, g, false);
    }
    M.part(M.cylZ(0.006, 0.02, 8), steel, 0, SIGHT + 0.018, 0.02, g, false).rotation.x = Math.PI / 2;
    M.part(new THREE.CircleGeometry(0.019, 18), glass, 0, SIGHT, -0.1655, g, false).rotation.y = Math.PI;
    M.part(new THREE.CircleGeometry(0.016, 18), glass, 0, SIGHT, 0.1556, g, false);
    g.userData = { hip: new THREE.Vector3(0.15, -0.17, -0.42), ads: new THREE.Vector3(0, -SIGHT, -0.12), muzzle: new THREE.Vector3(0, 0.025, -0.8) };
    this.hands(g, [0, -0.06, 0.12], [0, -0.06, -0.3]);
    return g;
  }

  buildKnife() {
    const g = new THREE.Group();
    M.part(M.boxG(0.02, 0.03, 0.2), M.mat('blade', { color: 0x9aa0a6, roughness: 0.2, metalness: 1 }), 0, 0, -0.12, g, false);
    M.part(M.boxG(0.03, 0.035, 0.1), M.mat('vmgrip', { color: 0x4a2e1a, roughness: 0.6 }), 0, 0, 0.03, g, false);
    M.part(M.boxG(0.07, 0.09, 0.1), M.mat('vmskin', { color: 0xb07a58, roughness: 0.7 }), 0, -0.01, 0.05, g, false);
    g.position.set(0.2, -0.2, -0.4);
    return g;
  }

  show(i) {
    this.guns.forEach((g, k) => { g.visible = k === i; });
    this.cur = this.guns[i];
  }

  fire() {
    this.kick = 1;
    this.flashT = 0.05;
    const u = this.cur.userData;
    this.flash.position.copy(this.cur.position).add(u.muzzle.clone().applyEuler(this.cur.rotation));
    this.flash.material.rotation = Math.random() * 6;
    const s = rand(0.18, 0.28);
    this.flash.scale.set(s, s, 1);
    this.flash.visible = true;
    this.flashLight.intensity = 6;
  }

  update(dt, P) {
    const g = this.cur;
    if (!g) return;
    const u = g.userData;
    this.kick = Math.max(0, this.kick - dt * 9);
    this.flashT -= dt;
    if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
    const base = _o.copy(u.hip).lerp(u.ads, P.ads);
    const vfov = lerp(55, 46, P.ads);
    if (Math.abs(this.camera.fov - vfov) > 0.05) { this.camera.fov = vfov; this.camera.updateProjectionMatrix(); }
    const bobAmt = P.onGround ? Math.min(1, P.hSpeed / 5) * (1 - P.ads * 0.85) : 0;
    const bx = Math.sin(P.bob) * 0.012 * bobAmt, by = -Math.abs(Math.cos(P.bob)) * 0.012 * bobAmt;
    this.sway.lerp(new THREE.Vector2(clamp(-G.input.mouse.dx * 0.0004, -0.03, 0.03), clamp(G.input.mouse.dy * 0.0004, -0.03, 0.03)), Math.min(1, dt * 10));
    const sprint = P.sprinting ? 1 : 0;
    this.sprintK = lerp(this.sprintK || 0, sprint, Math.min(1, dt * 8));
    const reloadK = P.reloadT > 0 ? Math.sin((1 - P.reloadT / P.w.reload) * Math.PI) : 0;
    const switchK = P.switchT > 0 ? P.switchT / 0.35 : 0;
    const throwK = P.throwT > 0 ? Math.sin((1 - P.throwT / 0.6) * Math.PI) : 0;
    g.position.set(
      base.x + bx + this.sway.x * (1 - P.ads * 0.7) - this.sprintK * 0.05,
      base.y + by + this.sway.y * (1 - P.ads * 0.7) - reloadK * 0.12 - switchK * 0.3 - throwK * 0.25 - this.sprintK * 0.04,
      base.z + this.kick * (P.w.id === 'rifle' ? 0.09 : 0.045));
    g.rotation.set(this.kick * (P.w.id === 'rifle' ? 0.16 : 0.08) - reloadK * 0.7 + this.sprintK * -0.35, this.sprintK * 0.6, reloadK * 0.5 + this.sprintK * 0.25);
    const mk = P.meleeT > 0 ? Math.sin((1 - P.meleeT / 0.45) * Math.PI) : 0;
    this.knife.visible = mk > 0.01;
    this.knife.position.set(0.18 - mk * 0.18, -0.2 + mk * 0.05, -0.4 - mk * 0.35);
    this.knife.rotation.set(0, mk * 0.4, 0);
    // Once the eye is behind the scope the overlay takes over from the 3D model
    g.visible = mk < 0.05 && P.scopeK < 0.6;
  }
}

// ---------------- Player ----------------
export class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.aimPoint = new THREE.Vector3();
    this.aimSway = new THREE.Vector2();
    this.yaw = 0;
    this.pitch = 0;
    this.vm = new ViewModel();
    this.weapons = WDEF.map((d, i) => ({ ...d, owned: i === 0, mag: i === 0 ? d.magSize : 0, reserve: d.reserve }));
    this.cur = 0;
    this.vm.show(0);
    this.grenades = 2;
    this.hasCompass = false;
    this.camPos = new THREE.Vector3();
    this.reset(0, 0, 0);
  }

  reset(x, z, yaw) {
    this.pos.set(x, H(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.hp = 100;
    this.alive = true;
    this.crouch = 0;
    this.onGround = true;
    this.inVehicle = null;
    this.ads = 0;
    this.scopeK = 0;
    this.swayAmp = 0;
    this.aimSway.set(0, 0);
    this.breath = 1;
    this.breathOut = false;
    this.holdingBreath = false;
    this.fireCd = 0;
    this.reloadT = 0;
    this.switchT = 0;
    this.throwT = 0;
    this.meleeT = 0;
    this.lastHit = -99;
    this.hitFlash = 0;
    this.shake = 0;
    this.bob = 0;
    this.stepAcc = 0;
    this.hSpeed = 0;
    this.kickPitch = 0;
    this.deathT = 0;
    this.locked = 0;
    this.wakeT = 0;
    this.camYawOff = 0;
    this.heartT = 0;
    this.roll = 0;
    this.sprinting = false;
  }

  respawn(x, z, yaw) {
    if (this.inVehicle) { this.inVehicle.occupied = false; this.inVehicle = null; G.audio.stopLoop('engine'); }
    this.reset(x, z, yaw);
    for (const w of this.weapons) if (w.owned) { w.mag = w.magSize; w.reserve = Math.max(w.reserve, w.magSize * 3); }
    this.grenades = Math.max(this.grenades, 2);
    this.vm.show(this.cur);
  }

  get w() { return this.weapons[this.cur]; }
  get crouching() { return this.crouch > 0.5; }
  get moving() { return this.hSpeed > 1.5; }

  giveWeapon(i, ammo) {
    const w = this.weapons[i];
    if (!w.owned) { w.owned = true; w.mag = w.magSize; }
    w.reserve = Math.min(w.maxReserve, w.reserve + ammo);
    this.switchTo(i);
  }

  addAmmo(frac) {
    for (const w of this.weapons) if (w.owned) w.reserve = Math.min(w.maxReserve, w.reserve + Math.ceil(w.maxReserve * frac * 0.5));
  }

  heal(n) { this.hp = Math.min(100, this.hp + n); }

  switchTo(i) {
    if (i === this.cur || !this.weapons[i].owned || this.reloadT > 0) return;
    this.cur = i;
    this.switchT = 0.35;
    this.vm.show(i);
    G.audio.reload(1);
  }

  damage(amount, from, explosion = false) {
    if (!this.alive || G.state !== 'play') return;
    if (this.inVehicle) amount *= 0.6;
    this.hp -= amount;
    this.lastHit = G.time;
    this.hitFlash = Math.min(1, this.hitFlash + 0.35 + amount / 60);
    this.shake = Math.max(this.shake, explosion ? 1 : 0.18);
    G.audio.hurt();
    if (from) G.hud.damageFrom(Math.atan2(from.x - this.pos.x, -(from.z - this.pos.z)) * 180 / Math.PI + this.yaw * 180 / Math.PI);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deathT = 0;
      if (this.inVehicle) { this.inVehicle.occupied = false; G.audio.stopLoop('engine'); }
      G.mission.playerDied();
    }
  }

  // ---- per frame ----
  update(dt, t) {
    const I = G.input, K = I.keys, Pr = I.pressed;
    // Sensitivity follows the zoom, so the same mouse move covers the same screen distance
    const sens = 0.0022 * G.settings.sens * Math.pow(Math.min(1, G.camera.fov / HIP_FOV), 0.85);

    if (!this.alive) { this.updateDeath(dt); return; }
    this.vm.root.visible = !this.inVehicle && this.wakeT <= 0;

    // Wake-up sequence: lying on the ground, slowly getting up
    if (this.wakeT > 0) {
      this.wakeT = Math.max(0, this.wakeT - dt);
      const k = 1 - this.wakeT / 7;
      this.pitch = lerp(1.15, 0.05, smoothK(k));
      this.roll = lerp(0.5, 0, smoothK(k));
      this.yaw += I.mouse.dx * -sens * 0.25;
      this.updateCamera(dt, t, lerp(0.25, 1.7, smoothK(clamp((k - 0.35) / 0.65, 0, 1))));
      this.aimPoint.set(this.pos.x, this.pos.y + 1, this.pos.z);
      if (this.wakeT === 0) G.mission.endWake();
      return;
    }

    if (this.inVehicle) { this.updateVehicle(dt, t, sens); return; }

    this.yaw -= I.mouse.dx * sens;
    this.pitch = clamp(this.pitch - I.mouse.dy * sens, -1.45, 1.45);

    // Movement
    const ax = I.axis;
    const fwd = clamp((K.has('KeyW') ? 1 : 0) - (K.has('KeyS') ? 1 : 0) + ax.y, -1, 1);
    const str = clamp((K.has('KeyD') ? 1 : 0) - (K.has('KeyA') ? 1 : 0) + ax.x, -1, 1);
    const wantCrouch = K.has('KeyC') || K.has('ControlLeft');
    this.crouch = lerp(this.crouch, wantCrouch ? 1 : 0, Math.min(1, dt * 10));
    this.sprinting = (K.has('ShiftLeft') || ax.sprint) && fwd > 0 && !this.crouching && this.ads < 0.3 && this.reloadT <= 0;
    const speed = this.sprinting ? 7.6 : this.crouching ? 2.3 : this.ads > 0.5 ? 2.8 : 4.4;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * fwd + cy * str, wz = -cy * fwd - sy * str;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const accel = this.onGround ? 11 : 2;
    this.vel.x = lerp(this.vel.x, wx * speed, Math.min(1, accel * dt));
    this.vel.z = lerp(this.vel.z, wz * speed, Math.min(1, accel * dt));
    if (Pr.has('Space') && this.onGround) { this.vel.y = 7; this.onGround = false; }
    this.vel.y -= 22 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    resolveCircle(this.pos, 0.38, this.pos.y, 1.7);
    for (const v of G.vehicles) {
      const dx = this.pos.x - v.pos.x, dz = this.pos.z - v.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.9 && d > 0.01) { this.pos.x = v.pos.x + (dx / d) * 1.9; this.pos.z = v.pos.z + (dz / d) * 1.9; }
    }
    this.pos.x = clamp(this.pos.x, -BOUND, BOUND);
    this.pos.z = clamp(this.pos.z, -BOUND, BOUND);
    const gy = H(this.pos.x, this.pos.z);
    if (this.pos.y <= gy) {
      if (!this.onGround && this.vel.y < -6) G.audio.step(0.4);
      this.pos.y = gy;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.pos.y > gy + 0.3) this.onGround = false;
    this.hSpeed = Math.hypot(this.vel.x, this.vel.z);

    // Footsteps & head bob
    if (this.onGround && this.hSpeed > 0.5) {
      this.bob += dt * this.hSpeed * 1.7;
      this.stepAcc += this.hSpeed * dt;
      if (this.stepAcc > (this.sprinting ? 2.6 : 2.1)) {
        this.stepAcc = 0;
        G.audio.step(this.crouching ? 0.07 : this.sprinting ? 0.24 : 0.15);
        if (this.sprinting) G.mission.noise(this.pos, 9);
      }
    }

    // Weapon state
    this.ads = lerp(this.ads, I.mouse.right && !this.sprinting && this.reloadT <= 0 ? 1 : 0, Math.min(1, dt * 12));
    this.scopeK = this.w.scope ? clamp((this.ads - 0.75) / 0.2, 0, 1) : 0;
    this.updateBreath(dt, K);
    this.updateAimSway(dt, t);
    this.fireCd -= dt;
    this.switchT = Math.max(0, this.switchT - dt);
    this.throwT = Math.max(0, this.throwT - dt);
    this.meleeT = Math.max(0, this.meleeT - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload();
    }
    if (Pr.has('Digit1')) this.switchTo(0);
    if (Pr.has('Digit2')) this.switchTo(1);
    if (Pr.has('Digit3')) this.switchTo(2);
    if (Pr.has('Digit4')) this.switchTo(3);
    if (I.mouse.wheel) {
      const owned = this.weapons.map((w, i) => (w.owned ? i : -1)).filter((i) => i >= 0);
      const k = owned.indexOf(this.cur);
      this.switchTo(owned[(k + (I.mouse.wheel > 0 ? 1 : owned.length - 1)) % owned.length]);
    }
    if (Pr.has('KeyR')) this.startReload();
    const busy = this.switchT > 0 || this.reloadT > 0 || this.throwT > 0 || this.meleeT > 0 || this.sprinting;
    if (!busy && this.fireCd <= 0 && (this.w.auto ? I.mouse.left : I.mouse.clicked)) this.fire();
    if (Pr.has('KeyG') && this.grenades > 0 && this.throwT <= 0) this.throwGrenade();
    if ((Pr.has('KeyV') || Pr.has('KeyF')) && this.meleeT <= 0) this.melee();
    if (Pr.has('KeyE')) this.interact();

    // Health regen
    if (G.time - this.lastHit > 5 && this.hp < 100) this.hp = Math.min(100, this.hp + 7 * dt);
    if (this.hp < 35) {
      this.heartT -= dt;
      if (this.heartT <= 0) { G.audio.heartbeat(0.5); this.heartT = 0.9; }
    }

    this.aimPoint.set(this.pos.x, this.pos.y + (this.crouching ? 0.85 : 1.3), this.pos.z);
    this.updateCamera(dt, t, lerp(1.7, 1.05, this.crouch));
    this.updatePrompt();
  }

  updateCamera(dt, t, eyeH) {
    const cam = G.camera;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 1.2);
    this.kickPitch = lerp(this.kickPitch, 0, Math.min(1, dt * 10));
    const bobAmt = this.onGround ? Math.min(1, this.hSpeed / 5) * (1 - this.ads * 0.8) : 0;
    const s = this.shake * this.shake;
    cam.position.set(
      this.pos.x + Math.cos(this.yaw) * Math.sin(this.bob) * 0.03 * bobAmt + rand(-1, 1) * s * 0.15,
      this.pos.y + eyeH + Math.sin(this.bob * 2) * 0.045 * bobAmt + rand(-1, 1) * s * 0.15,
      this.pos.z - Math.sin(this.yaw) * Math.sin(this.bob) * 0.03 * bobAmt + rand(-1, 1) * s * 0.15);
    _e.set(this.pitch + this.kickPitch + this.aimSway.y, this.yaw + this.aimSway.x, this.roll + rand(-1, 1) * s * 0.03);
    cam.quaternion.setFromEuler(_e);
    const fov = lerp(this.sprinting ? 80 : HIP_FOV, this.w.adsFov, this.ads);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 14)); cam.updateProjectionMatrix(); }
    this.vm.update(dt, this);
  }

  // Scoped only: Shift holds the breath for a few seconds; running out leaves you shaky.
  updateBreath(dt, K) {
    const scoped = this.scopeK > 0.9;
    this.holdingBreath = scoped && !this.breathOut && (K.has('ShiftLeft') || K.has('ShiftRight'));
    if (this.holdingBreath) {
      this.breath = Math.max(0, this.breath - dt / 4.5);
      if (this.breath === 0) { this.breathOut = true; this.holdingBreath = false; G.audio.heartbeat(0.4); }
    } else {
      this.breath = Math.min(1, this.breath + dt / (this.breathOut ? 3.5 : 2.2));
      if (this.breathOut && this.breath > 0.6) this.breathOut = false;
    }
  }

  // Slow figure-eight drift while aiming; it rotates the camera, so the shot follows it.
  updateAimSway(dt, t) {
    let amp = (this.w.scope ? 0.0065 : 0.0016) * this.ads;
    amp *= (this.crouching ? 0.5 : 1) * (this.moving ? 2.2 : 1) * (G.touch ? 0.5 : 1);
    amp *= this.holdingBreath ? 0.07 : this.breathOut ? 1.8 : 1;
    this.swayAmp = lerp(this.swayAmp, amp, Math.min(1, dt * 5));
    const a = this.swayAmp;
    this.aimSway.set(
      (Math.sin(t * 0.83) * 0.7 + Math.sin(t * 1.91 + 0.4) * 0.3) * a,
      (Math.sin(t * 1.66 + 1.3) * 0.45 + Math.sin(t * 2.3) * 0.2) * a);
  }

  updatePrompt() {
    if (this.inVehicle) return;
    let best = null, bd = 2.4;
    for (const it of G.items) {
      if (it.taken || it.hidden || it.auto) continue;
      const d = Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    this.target = best;
    let veh = null;
    for (const v of G.vehicles) if (Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z) < 3.4) veh = v;
    this.vehTarget = best ? null : veh;
    G.hud.prompt(best ? `[E] ${best.label}` : veh ? '[E] Conducir el Kübelwagen' : null);
  }

  interact() {
    if (this.target) { this.target.take(); return; }
    if (this.vehTarget) this.enterVehicle(this.vehTarget);
  }

  enterVehicle(v) {
    this.inVehicle = v;
    v.occupied = true;
    this.vm.root.visible = false;
    this.camYawOff = 0;
    G.audio.startEngine();
    G.hud.prompt('[E] Salir del vehículo   ·   W/S acelerar   ·   A/D girar   ·   Espacio frenar');
  }

  exitVehicle() {
    const v = this.inVehicle;
    if (Math.abs(v.speed) > 4) return;
    const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
    this.pos.set(v.pos.x - rx * 2.2, v.pos.y, v.pos.z - rz * 2.2);
    resolveCircle(this.pos, 0.38, this.pos.y, 1.7);
    this.pos.y = H(this.pos.x, this.pos.z);
    v.occupied = false;
    this.inVehicle = null;
    this.yaw = v.yaw + Math.PI;
    this.pitch = 0;
    this.vm.root.visible = true;
    G.audio.stopLoop('engine');
    G.hud.prompt(null);
  }

  updateVehicle(dt, t, sens) {
    const v = this.inVehicle, I = G.input;
    if (I.pressed.has('KeyE')) { this.exitVehicle(); if (!this.inVehicle) return; }
    this.camYawOff = clamp(this.camYawOff - I.mouse.dx * sens, -2.5, 2.5);
    if (Math.abs(I.mouse.dx) < 0.5) this.camYawOff = lerp(this.camYawOff, 0, Math.min(1, dt * 0.8));
    this.pos.copy(v.pos);
    this.aimPoint.set(v.pos.x, v.pos.y + 1.4, v.pos.z);
    this.hSpeed = Math.abs(v.speed);
    const a = v.yaw + this.camYawOff;
    const cam = G.camera;
    const want = _o.set(v.pos.x - Math.sin(a) * 7.5, v.pos.y + 3.3, v.pos.z - Math.cos(a) * 7.5);
    const minY = H(want.x, want.z) + 0.8;
    if (want.y < minY) want.y = minY;
    this.camPos.lerp(want, Math.min(1, dt * 6));
    if (this.camPos.distanceTo(want) > 20) this.camPos.copy(want);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 1.2);
    const s = this.shake * this.shake * 0.2;
    cam.position.copy(this.camPos).add(new THREE.Vector3(rand(-s, s), rand(-s, s), rand(-s, s)));
    cam.lookAt(v.pos.x + Math.sin(v.yaw) * 3, v.pos.y + 1.4, v.pos.z + Math.cos(v.yaw) * 3);
    _dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.yaw = Math.atan2(-_dir.x, -_dir.z);
    if (Math.abs(cam.fov - 72) > 0.1) { cam.fov = 72; cam.updateProjectionMatrix(); }
    if (G.time - this.lastHit > 5 && this.hp < 100) this.hp = Math.min(100, this.hp + 7 * dt);
  }

  updateDeath(dt) {
    this.deathT += dt;
    const k = Math.min(1, this.deathT / 1.2);
    const cam = G.camera;
    cam.position.y = lerp(cam.position.y, H(cam.position.x, cam.position.z) + 0.35, Math.min(1, dt * 3));
    _e.set(this.pitch * (1 - k) + 0.3 * k, this.yaw, 1.3 * k * k);
    cam.quaternion.setFromEuler(_e);
    this.vm.root.visible = false;
    this.hitFlash = 1;
  }

  // ---- combat ----
  fire() {
    const w = this.w;
    if (w.mag <= 0) {
      G.audio.click();
      this.fireCd = 0.3;
      if (w.reserve > 0) this.startReload();
      return;
    }
    w.mag--;
    this.fireCd = w.rate;
    G.stats.shots++;
    const cam = G.camera;
    let spread = lerp(w.spread, w.adsSpread, this.ads);
    if (this.moving) spread *= 1.8;
    if (this.crouching) spread *= 0.7;
    if (!this.onGround) spread *= 3;
    _dir.set(rand(-1, 1) * spread, rand(-1, 1) * spread, -1).normalize().applyQuaternion(cam.quaternion);
    const o = cam.position;
    let best = w.range, target = null, head = false;
    for (const e of G.enemies) {
      const h = e.rayHit(o, _dir, best);
      if (h) { best = h.t; target = e; head = h.head; }
    }
    let barrel = null;
    for (const b of G.barrels) {
      const h = b.rayHit(o, _dir, best);
      if (h) { best = h.t; barrel = b; target = null; }
    }
    const wh = raycast(o, _dir, best);
    if (wh) { best = wh.t; target = null; barrel = null; }
    _hit.copy(o).addScaledVector(_dir, best);

    if (target) {
      const falloff = clamp(1.15 - best / w.range, 0.55, 1);
      target.damage(w.dmg * (head ? 3.2 : 1) * falloff, head);
      G.stats.hits++;
      G.hud.hitmarker(head, target.dead);
      G.audio.hitmarker(head);
      G.fx.emit('blood', _hit, { count: head ? 8 : 5, speed: 2.5, up: 0.5 });
    } else if (barrel) {
      barrel.damage(w.dmg);
      G.fx.emit('spark', _hit, { count: 6, speed: 5 });
    } else if (wh) {
      G.fx.emit('dust', _hit, { count: 4, speed: 1.8, up: 1 });
      if (wh.kind === 'box') G.fx.emit('spark', _hit, { count: 3, speed: 4 });
      G.audio.impact(_hit);
    }

    if (w.id !== 'pistol' || Math.random() < 0.4) {
      const start = _o.set(0.18, -0.15, -0.6).applyQuaternion(cam.quaternion).add(o);
      G.tracers.add(start, _hit, 0xffe0a0, 420);
    }
    this.vm.fire();
    G.audio.shot(w.sound, null);
    G.flash.flash(o, 0xffaa55, 30, 0.07, 22);
    G.mission.noise(this.pos, w.noise);
    const kick = w.kick * (1 - this.ads * 0.35) * (this.crouching ? 0.75 : 1);
    this.pitch = clamp(this.pitch + kick * 0.55, -1.45, 1.45);
    this.yaw += rand(-1, 1) * kick * 0.25;
    this.kickPitch += kick * 0.7;
    if (w.id === 'rifle') setTimeout(() => G.audio.bolt(), 380);
    if (w.mag === 0 && w.reserve > 0) setTimeout(() => this.startReload(), 250);
  }

  startReload() {
    const w = this.w;
    if (this.reloadT > 0 || w.mag >= w.magSize || w.reserve <= 0 || this.switchT > 0) return;
    this.reloadT = w.reload;
    G.audio.reload(0);
    setTimeout(() => G.audio.reload(1), w.reload * 600);
  }

  finishReload() {
    const w = this.w;
    const n = Math.min(w.magSize - w.mag, w.reserve);
    w.mag += n;
    w.reserve -= n;
    this.reloadT = 0;
  }

  throwGrenade() {
    this.grenades--;
    this.throwT = 0.6;
    G.audio.pin();
    const cam = G.camera;
    setTimeout(() => {
      if (!this.alive) return;
      _dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const from = cam.position.clone().addScaledVector(_dir, 0.6);
      const vel = _dir.clone().multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0)).add(new THREE.Vector3(this.vel.x, 0, this.vel.z));
      G.grenades.push(new Grenade(from, vel));
    }, 250);
  }

  melee() {
    this.meleeT = 0.45;
    G.audio.knife();
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 2.3 && (dx * fx + dz * fz) / d > 0.55 && Math.abs(e.pos.y - this.pos.y) < 1.5) {
        const unaware = e.state !== 'combat';
        e.damage(unaware ? 999 : 60, false);
        G.hud.hitmarker(false, e.dead);
        G.fx.emit('blood', new THREE.Vector3(e.pos.x, e.pos.y + 1.3, e.pos.z), { count: 6, speed: 2 });
        if (unaware) G.hud.notice('BAJA SILENCIOSA', '');
        break;
      }
    }
  }
}

function smoothK(k) {
  return k * k * (3 - 2 * k);
}

export { wrapAngle, UP };
