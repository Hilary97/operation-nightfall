import * as THREE from 'three';
import { G } from './state.js';
import { Particles } from './fx.js';
import * as M from './models.js';
import { createSoldier } from './soldiers.js';
import { rand, lerp, clamp } from './util.js';

const SEAT_Y = -1.4;
const STAND_Y = -1.0;
const smoothstep = (x) => x * x * (3 - 2 * x);

// The figure has no sit clip: after the mixer update, blend the leg bones towards a seated pose.
// Each entry is the absolute local Euler (XYZ) rotation of the bone; w = 1 is fully seated.
const SIT_POSE = { UpperLeg_L: [-1.45, 0, Math.PI], UpperLeg_R: [-1.45, 0, Math.PI], LowerLeg_L: [-1.5, 0, 0], LowerLeg_R: [-1.5, 0, 0] };
const _t = new THREE.Quaternion(), _e = new THREE.Euler();
function applySeat(bones, w) {
  if (w <= 0) return;
  for (const name in SIT_POSE) {
    const b = bones[name];
    _t.setFromEuler(_e.set(...SIT_POSE[name]));
    b.quaternion.slerp(_t, w);
  }
}

// Opening cinematic: inside a C-47 over Normandy, flak, the plane is hit,
// the player is thrown out and falls through the clouds.
export class Intro {
  constructor(T) {
    this.T = T;
    this.t = 0;
    this.done = false;
    this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 4000);
    this.buildCabin();
    this.buildFall();
    this.scene = this.cabin;
    this.events = this.timeline();
    this.ei = 0;
    this.flakT = 99;
    this.shake = 0.04;
    this.roll = 0;
  }

  buildCabin() {
    const s = (this.cabin = new THREE.Scene());
    s.background = new THREE.Color(0x020203);
    s.fog = new THREE.Fog(0x050505, 6, 22);
    const T = this.T;
    const hull = new THREE.MeshStandardMaterial({ map: T.metal, color: 0x6a6c50, roughness: 0.7, metalness: 0.35, side: THREE.BackSide });
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 16, 28, 1, true), hull);
    fus.rotation.x = Math.PI / 2;
    fus.receiveShadow = true;
    s.add(fus);
    const floor = new THREE.Mesh(M.scaledBox(2.8, 0.1, 16, 1), new THREE.MeshStandardMaterial({ map: T.planks, roughness: 0.9 }));
    floor.position.y = -1.0;
    floor.receiveShadow = true;
    s.add(floor);
    const rib = new THREE.MeshStandardMaterial({ color: 0x3e4030, roughness: 0.6, metalness: 0.5 });
    for (let z = -7.5; z <= 7.5; z += 1.25) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.66, 0.05, 6, 28), rib);
      r.position.z = z;
      s.add(r);
    }
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x4a4434, roughness: 0.9 });
    for (const x of [-1.2, 1.2]) {
      const b = new THREE.Mesh(M.boxG(0.45, 0.06, 11), benchMat);
      b.position.set(x, -0.5, -0.5);
      b.receiveShadow = b.castShadow = true;
      s.add(b);
    }
    const cable = new THREE.Mesh(M.cylZ(0.015, 15, 6), rib);
    cable.position.set(0.3, 1.25, 0);
    s.add(cable);

    // Paratroopers seated facing the aisle
    this.troops = [];
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1, z = -4.6 + Math.floor(i / 2) * 1.9 + (side > 0 ? 0.6 : 0);
      const tr = createSoldier('allied', 'rifle');
      tr.root.position.set(side * 1.2, SEAT_Y, z);
      tr.root.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      s.add(tr.root);
      this.troops.push({ tr, side, z, seed: Math.random() * 9, seat: 1, nod: rand(-0.1, 0.25), turn: rand(-0.4, 0.4) });
    }

    // Windows and jump door
    this.windowMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x2a3a5a, emissiveIntensity: 0.6 });
    for (let z = -6; z <= 5; z += 1.6) {
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.CircleGeometry(0.17, 14), this.windowMat);
        w.position.set(side * 1.64, 0.45, z);
        w.rotation.y = -side * Math.PI / 2;
        s.add(w);
      }
    }
    this.doorMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x18233a, emissiveIntensity: 1 });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.8), this.doorMat);
    door.position.set(-1.62, 0.0, 6.2);
    door.rotation.y = Math.PI / 2;
    s.add(door);

    // Lights: dim red jump light, warm cockpit spill, flak flashes
    this.jumpLight = new THREE.PointLight(0xff2010, 24, 14, 2);
    this.jumpLight.position.set(-1.1, 1.0, 5.6);
    s.add(this.jumpLight);
    this.jumpBulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0x551008 }));
    this.jumpBulb.position.copy(this.jumpLight.position);
    s.add(this.jumpBulb);
    const front = new THREE.PointLight(0xffb070, 16, 14, 2);
    front.position.set(0, 1.0, -7);
    front.castShadow = true;
    s.add(front);
    s.add(new THREE.AmbientLight(0x3a4058, 1.8));
    this.flakLights = [-1, 1].map((side) => {
      const l = new THREE.PointLight(0xffa860, 0, 12, 2);
      l.position.set(side * 1.3, 0.6, 0);
      s.add(l);
      return l;
    });
    this.fireLight = new THREE.PointLight(0xff6020, 0, 10, 2);
    this.fireLight.position.set(1.3, 0.2, 1.5);
    s.add(this.fireLight);
    this.cabinFx = new Particles(s, this.T, 260);
  }

  buildFall() {
    const s = (this.fall = new THREE.Scene());
    const fogCol = new THREE.Color(0x10141f);
    s.background = fogCol;
    s.fog = new THREE.Fog(fogCol, 60, 700);
    s.add(new THREE.HemisphereLight(0x6070a0, 0x101010, 1.2));
    const moon = new THREE.DirectionalLight(0xb0c0ff, 1.5);
    moon.position.set(-1, 2, -1);
    s.add(moon);
    this.clouds = [];
    for (let i = 0; i < 70; i++) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.T.cloud, color: 0x5a6276, transparent: true, opacity: 0.75, depthWrite: false }));
      c.position.set(rand(-90, 90), rand(-650, 40), rand(-90, 90));
      const sc = rand(50, 120);
      c.scale.set(sc, sc * 0.6, 1);
      s.add(c);
      this.clouds.push(c);
    }
    const p = M.createC47(this.T.invasion);
    this.plane = p;
    p.root.position.set(14, 45, -30);
    s.add(p.root);
    this.planeFire = new THREE.PointLight(0xff7020, 300, 120, 1.5);
    s.add(this.planeFire);
    this.fallFx = new Particles(s, this.T, 400);
    this.flakSprites = [];
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.T.flame, color: 0xffb070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      s.add(f);
      this.flakSprites.push({ f, t: 0 });
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x0c100a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -900;
    s.add(ground);
  }

  timeline() {
    const H = G.hud, A = G.audio;
    return [
      [0, () => { H.cinema(true); H.fade(0, 2500); A.startPlaneEngine(); A.startWind(0.05); H.caption('NORMANDÍA, FRANCIA<br><small>6 de junio de 1944 — 01:14 horas</small>'); }],
      [4.5, () => H.caption('OPERACIÓN NIGHTFALL<br><small>101.ª División Aerotransportada · Equipo de exploradores</small>')],
      [8.5, () => { H.caption(null); H.subtitle('SGTO. HOLLIS: ¡Atención! Veinte minutos para la zona de salto. Revisen su equipo — ¡y el de su compañero!', 5); }],
      [13.5, () => { this.flakT = 0.3; H.subtitle('SDO. MILLER: Sargento... ¿eso es fuego antiaéreo?', 3); }],
      [17, () => { H.subtitle('SGTO. HOLLIS: ¡De pie! ¡Engánchense! ¡Saltamos antes!', 3.5); this.standUp = true; A.bell(); }],
      [21, () => this.hit(1)],
      [21.3, () => H.subtitle('PILOTO: ¡Nos dieron! ¡Perdimos el motor dos! ¡Salten — SALTEN!', 3.5)],
      [24.5, () => this.hit(2)],
      [25.2, () => this.toFall()],
      [33.5, () => { H.fade(1, 600); A.thud(null); A.heartbeat(0.9); }],
      [35, () => { A.stopLoop('wind', 1); this.finish(); }],
    ];
  }

  hit(n) {
    const A = G.audio;
    A.explosion(null, n === 2 ? 1.4 : 1);
    G.post.uniforms.uFlash.value = n === 2 ? 1 : 0.6;
    this.shake = n === 2 ? 0.5 : 0.25;
    this.roll = n === 2 ? 0.5 : 0.22;
    this.fireLight.intensity = 25;
    this.burning = true;
    this.cabinFx.emit('spark', new THREE.Vector3(1.4, 0.2, 1.5), { count: 40, speed: 6 });
    if (n === 2) A.setLoopVolume('plane', 0.2, 0.5);
  }

  toFall() {
    this.scene = this.fall;
    this.fallT = 0;
    G.audio.stopLoop('plane', 1.5);
    G.audio.setLoopVolume('wind', 0.7, 0.4);
    G.post.uniforms.uFlash.value = 1;
    this.camera.position.set(0, 0, 0);
    this.camera.fov = 80;
    this.camera.updateProjectionMatrix();
  }

  finish() {
    this.done = true;
    G.hud.cinema(false);
    G.hud.caption(null);
    this.onDone?.();
  }

  skip() {
    if (this.done) return;
    G.audio.stopLoop('plane', 0.3);
    G.audio.stopLoop('wind', 0.3);
    G.hud.fade(1, 200);
    this.finish();
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    while (this.ei < this.events.length && this.t >= this.events[this.ei][0]) this.events[this.ei++][1]();
    const P = G.post.uniforms;
    P.uFlash.value = Math.max(0, P.uFlash.value - dt * 1.6);
    if (this.scene === this.cabin) this.updateCabin(dt);
    else this.updateFall(dt);
  }

  updateCabin(dt) {
    const t = this.t, cam = this.camera;
    this.shake = lerp(this.shake, this.flakT < 50 ? 0.08 : 0.03, dt * 0.8);
    this.flakT -= dt;
    if (this.flakT <= 0) {
      this.flakT = rand(0.35, 1.3);
      const near = Math.random();
      G.audio.flak(near);
      const l = this.flakLights[Math.random() < 0.5 ? 0 : 1];
      l.position.z = rand(-5, 5);
      l.intensity = 20 + near * 60;
      this.windowMat.emissive.setHex(0xffa040);
      this.windowMat.emissiveIntensity = 2 + near * 4;
      this.doorMat.emissive.setHex(0xff9040);
      this.doorMat.emissiveIntensity = 2 + near * 3;
      this.shake = Math.max(this.shake, 0.06 + near * 0.15);
    }
    for (const l of this.flakLights) l.intensity = Math.max(0, l.intensity - dt * 160);
    this.windowMat.emissiveIntensity = Math.max(0.5, this.windowMat.emissiveIntensity - dt * 9);
    if (this.windowMat.emissiveIntensity <= 0.55) this.windowMat.emissive.setHex(0x2a3a5a);
    this.doorMat.emissiveIntensity = Math.max(1, this.doorMat.emissiveIntensity - dt * 8);
    if (this.doorMat.emissiveIntensity <= 1.05) this.doorMat.emissive.setHex(0x18233a);
    const blink = this.burning ? (Math.sin(t * 25) > 0 ? 1 : 0.2) : 1;
    this.jumpLight.intensity = 24 * blink;
    this.jumpBulb.material.color.setHex(blink > 0.5 ? 0xff3010 : 0x551008);
    if (this.burning) {
      this.fireLight.intensity = 18 + Math.random() * 10;
      this.cabinFx.emit('fire', new THREE.Vector3(1.45, rand(-0.2, 0.6), 1.5 + rand(-0.3, 0.3)), { size: 0.5, vel: new THREE.Vector3(-0.5, 0.8, 0) });
      if (Math.random() < 0.3) this.cabinFx.emit('smoke', new THREE.Vector3(1.3, 0.6, 1.5), { size: 0.4, vel: new THREE.Vector3(-0.3, 0.5, 0.6) });
      if (Math.random() < 0.15) this.cabinFx.emit('spark', new THREE.Vector3(1.45, 0.3, 1.5), { count: 3, speed: 4 });
    }
    this.cabinFx.update(dt);
    for (const tp of this.troops) {
      const { tr, side, z, seed } = tp;
      if (this.standUp) {
        tp.seat = Math.max(0, tp.seat - dt / 1.4);
        tr.root.position.y = lerp(tr.root.position.y, STAND_Y, dt * 2);
        tr.root.rotation.y = lerp(tr.root.rotation.y, Math.PI, dt * 1.5);
        tr.root.position.x = lerp(tr.root.position.x, side * 0.45, dt * 1.2);
      }
      tr.anim.update(dt);
      applySeat(tr.bones, smoothstep(tp.seat));
      tr.bones.Head.rotation.x += tp.nod * tp.seat;
      tr.bones.Head.rotation.y += tp.turn * tp.seat;
      tr.root.position.z = z + Math.sin(t * 2 + seed) * 0.01;
      tr.bones.Head.rotation.z += Math.sin(t * 3 + seed) * this.shake * 0.4;
    }
    this.roll = lerp(this.roll, 0, dt * 0.25);
    const s = this.shake;
    const thrown = clamp((this.t - 24.5) / 0.7, 0, 1);
    cam.position.set(0.15 + rand(-1, 1) * s * 0.06 - thrown * 1.2, 0.35 + rand(-1, 1) * s * 0.06, -6.3 + thrown * 11);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-0.06 + Math.sin(t * 0.7) * 0.02 + thrown * 0.4, Math.PI + Math.sin(t * 0.4) * 0.06 + thrown * 1.4, Math.sin(t * 0.9) * 0.03 + this.roll + thrown * 1.2);
  }

  updateFall(dt) {
    this.fallT += dt;
    const ft = this.fallT, cam = this.camera;
    const vy = Math.min(55, 10 + ft * 18);
    cam.position.y -= vy * dt;
    for (const c of this.clouds) if (c.position.y > cam.position.y + 80) c.position.y -= 700;
    const p = this.plane.root;
    p.position.y -= 22 * dt;
    p.position.x += 18 * dt;
    p.position.z -= 30 * dt;
    p.rotation.z += dt * 0.5;
    p.rotation.x = 0.3;
    for (const pr of this.plane.props) pr.rotation.z += dt * 6;
    const eng = new THREE.Vector3(5.2, -0.5, 3).applyMatrix4(p.matrixWorld);
    this.planeFire.position.copy(eng);
    this.planeFire.intensity = 300 * (0.8 + Math.random() * 0.3);
    this.fallFx.emit('fire', eng, { spread: 1, size: 4, vel: new THREE.Vector3(0, 18, 25) });
    if (Math.random() < 0.6) this.fallFx.emit('bigsmoke', eng, { spread: 1.5, size: 2.5, vel: new THREE.Vector3(0, 15, 25) });
    this.fallFx.update(dt);
    for (const fs of this.flakSprites) {
      fs.t -= dt;
      if (fs.t <= 0 && Math.random() < dt * 1.5) {
        fs.t = 0.5;
        fs.f.position.set(cam.position.x + rand(-150, 150), cam.position.y + rand(-60, 120), cam.position.z + rand(-200, -60));
        fs.f.scale.setScalar(rand(20, 40));
        G.audio.flak(0.3);
      }
      fs.f.material.opacity = Math.max(0, fs.t * 2);
    }
    const look = new THREE.Vector3().copy(p.position);
    const tumble = Math.min(1, ft / 4);
    const down = new THREE.Vector3(cam.position.x + Math.sin(ft * 1.7) * 20, cam.position.y - 100, cam.position.z + Math.cos(ft * 1.3) * 20);
    look.lerp(down, tumble);
    cam.lookAt(look);
    cam.rotateZ(Math.sin(ft * 2.2) * 0.4 * tumble + ft * 0.3);
    G.post.uniforms.uBlur.value = Math.max(0, (ft - 6) * 0.35);
  }
}
