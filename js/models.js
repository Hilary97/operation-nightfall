import * as THREE from 'three';
import { lerp } from './util.js';

const G_CACHE = new Map();
export function boxG(w, h, d) {
  const k = `b${w}|${h}|${d}`;
  let g = G_CACHE.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); G_CACHE.set(k, g); }
  return g;
}

// Cylinder whose axis lies along Z.
export function cylZ(r, len, seg = 10) {
  const k = `cz${r}|${len}|${seg}`;
  let g = G_CACHE.get(k);
  if (!g) { g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateX(Math.PI / 2); G_CACHE.set(k, g); }
  return g;
}

export function cylY(r, len, seg = 10, r2 = r) {
  const k = `cy${r}|${len}|${seg}|${r2}`;
  let g = G_CACHE.get(k);
  if (!g) { g = new THREE.CylinderGeometry(r2, r, len, seg); G_CACHE.set(k, g); }
  return g;
}

// Box with UVs scaled to world size so tiling textures keep a constant density.
export function scaledBox(w, h, d, tile = 2) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
    }
  }
  return geo;
}

// Triangular prism along X (roofs, tents). Width = base, h = peak height.
export function prismGeo(len, width, h) {
  const g = new THREE.CylinderGeometry(1, 1, len, 3, 1);
  g.rotateZ(Math.PI / 2);
  g.rotateX(-Math.PI / 2);
  g.scale(1, h / 1.5, width / 2 / 0.866);
  g.translate(0, (h / 1.5) * 0.5, 0);
  return g;
}

const M_CACHE = new Map();
export function mat(key, params) {
  let m = M_CACHE.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial(params); M_CACHE.set(key, m); }
  return m;
}

export function part(geo, material, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  if (parent) parent.add(m);
  return m;
}

// Box stretched between two points (in the parent's local space).
export function beam(a, b, w, h, material, parent) {
  const m = new THREE.Mesh(boxG(w, h, 1), material);
  m.position.copy(a).lerp(b, 0.5);
  m.scale.z = a.distanceTo(b);
  m.lookAt(b);
  if (parent) parent.add(m);
  return m;
}

export function setShadows(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
}

const PAL = {
  axis: { coat: 0x585e4c, pants: 0x4b4f42, helmet: 0x484e42, gear: 0x2a221a, boots: 0x161310 },
  officer: { coat: 0x4c5048, pants: 0x2b2c28, helmet: 0x2d302b, gear: 0x231c15, boots: 0x0d0d0d },
  allied: { coat: 0x726a46, pants: 0x63603f, helmet: 0x4e5335, gear: 0x8c7b55, boots: 0x3b2a1b },
};

let STAHL = null, M1 = null;
function helmets() {
  if (STAHL) return;
  STAHL = new THREE.LatheGeometry(
    [[0.001, 0.16], [0.07, 0.155], [0.12, 0.13], [0.15, 0.085], [0.16, 0.035], [0.168, 0.0], [0.19, -0.045], [0.186, -0.055]].map(([x, y]) => new THREE.Vector2(x, y)), 18);
  M1 = new THREE.LatheGeometry(
    [[0.001, 0.15], [0.09, 0.14], [0.145, 0.09], [0.163, 0.02], [0.168, -0.02], [0.185, -0.03], [0.183, -0.04]].map(([x, y]) => new THREE.Vector2(x, y)), 18);
}

export function createSoldier(faction = 'axis', weapon = 'rifle') {
  helmets();
  const p = PAL[faction];
  const coat = mat('coat-' + faction, { color: p.coat, roughness: 0.95 });
  const pants = mat('pants-' + faction, { color: p.pants, roughness: 0.95 });
  const helm = mat('helm-' + faction, { color: p.helmet, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide });
  const gear = mat('gear-' + faction, { color: p.gear, roughness: 0.75 });
  const boots = mat('boots-' + faction, { color: p.boots, roughness: 0.55 });
  const skin = mat('skin', { color: 0xc08a68, roughness: 0.8 });
  const dark = mat('eyes', { color: 0x111111 });
  const wood = mat('gunwood', { color: 0x5a3b22, roughness: 0.55 });
  const steel = mat('gunsteel', { color: 0x23262b, roughness: 0.4, metalness: 0.8 });

  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);

  const legs = [];
  for (const s of [-1, 1]) {
    const L = new THREE.Group();
    L.position.x = s * 0.11;
    hips.add(L);
    part(boxG(0.17, 0.5, 0.2), pants, 0, -0.25, 0, L);
    const K = new THREE.Group();
    K.position.y = -0.5;
    L.add(K);
    part(boxG(0.15, 0.36, 0.17), faction === 'allied' ? pants : boots, 0, -0.18, 0, K);
    part(boxG(0.16, 0.1, 0.28), boots, 0, -0.4, 0.05, K);
    legs.push({ L, K });
  }

  const torso = new THREE.Group();
  hips.add(torso);
  part(boxG(0.44, 0.58, 0.26), coat, 0, 0.29, 0, torso);
  if (faction !== 'allied') part(boxG(0.47, 0.2, 0.29), coat, 0, -0.06, 0, torso);
  part(boxG(0.47, 0.06, 0.3), gear, 0, 0.05, 0, torso);
  for (const x of [-0.13, 0, 0.13]) part(boxG(0.1, 0.1, 0.06), gear, x, 0.11, 0.16, torso);
  part(boxG(0.05, 0.52, 0.29), gear, -0.11, 0.33, 0, torso);
  part(boxG(0.05, 0.52, 0.29), gear, 0.11, 0.33, 0, torso);
  if (faction === 'allied') part(boxG(0.34, 0.36, 0.16), gear, 0, 0.32, -0.2, torso);
  else {
    part(boxG(0.16, 0.14, 0.08), gear, 0.2, 0.0, -0.12, torso);
    part(cylY(0.05, 0.16, 8), steel, -0.24, 0.02, -0.08, torso);
  }

  const head = new THREE.Group();
  head.position.y = 0.6;
  torso.add(head);
  part(boxG(0.1, 0.08, 0.1), skin, 0, 0.02, 0, head);
  part(boxG(0.2, 0.24, 0.22), skin, 0, 0.17, 0.01, head);
  part(boxG(0.035, 0.022, 0.01), dark, -0.05, 0.19, 0.122, head, false);
  part(boxG(0.035, 0.022, 0.01), dark, 0.05, 0.19, 0.122, head, false);
  if (faction === 'officer') {
    part(cylY(0.115, 0.07, 14, 0.145), helm, 0, 0.32, 0, head);
    part(boxG(0.2, 0.015, 0.1), mat('visor', { color: 0x0a0a0a, roughness: 0.3 }), 0, 0.29, 0.13, head);
  } else {
    part(faction === 'allied' ? M1 : STAHL, helm, 0, 0.24, 0, head);
  }

  const arms = [];
  for (const s of [-1, 1]) {
    const S = new THREE.Group();
    S.position.set(s * 0.28, 0.52, 0);
    torso.add(S);
    part(boxG(0.12, 0.32, 0.13), coat, 0, -0.15, 0, S);
    const E = new THREE.Group();
    E.position.y = -0.3;
    S.add(E);
    part(boxG(0.11, 0.28, 0.12), coat, 0, -0.14, 0, E);
    part(boxG(0.09, 0.1, 0.1), skin, 0, -0.31, 0, E);
    arms.push({ S, E });
  }

  const gun = new THREE.Group();
  gun.position.set(0.06, 0.34, 0.22);
  torso.add(gun);
  let len;
  if (weapon === 'rifle') {
    part(boxG(0.05, 0.08, 0.82), wood, 0, 0, 0.1, gun);
    part(cylZ(0.013, 0.32, 6), steel, 0, 0.03, 0.62, gun);
    part(boxG(0.03, 0.03, 0.06), steel, 0.03, 0.04, 0.0, gun);
    len = 0.78;
  } else if (weapon === 'smg') {
    part(boxG(0.045, 0.07, 0.36), steel, 0, 0, 0.12, gun);
    part(boxG(0.03, 0.2, 0.04), steel, 0, -0.13, 0.14, gun);
    part(cylZ(0.014, 0.16, 6), steel, 0, 0.01, 0.37, gun);
    part(boxG(0.015, 0.015, 0.25), steel, 0, 0.0, -0.15, gun);
    len = 0.45;
  } else {
    part(boxG(0.03, 0.05, 0.16), steel, 0, 0, 0.08, gun);
    part(boxG(0.03, 0.09, 0.04), steel, 0, -0.06, 0.01, gun);
    len = 0.17;
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, len);
  gun.add(muzzle);

  return { root, hips, legs, torso, head, arms, gun, muzzle, phase: Math.random() * 6, weapon };
}

// Procedural animation: walk cycle plus a blend between low-ready and aiming.
export function poseSoldier(s, dt, { move = 0, aim = 0, t = 0 }) {
  s.phase += dt * Math.min(move, 4) * 3.4;
  const amp = Math.min(1, move / 1.4);
  const sw = Math.sin(s.phase) * 0.6 * amp;
  s.legs[0].L.rotation.x = sw;
  s.legs[1].L.rotation.x = -sw;
  s.legs[0].K.rotation.x = Math.max(0, -Math.sin(s.phase)) * 0.9 * amp;
  s.legs[1].K.rotation.x = Math.max(0, Math.sin(s.phase)) * 0.9 * amp;
  s.hips.position.y = 0.95 - Math.abs(Math.sin(s.phase)) * 0.035 * amp;
  const [L, R] = s.arms;
  const pistol = s.weapon === 'pistol';
  L.S.rotation.set(lerp(pistol ? 0.05 : -0.7, -1.35, aim), 0, lerp(pistol ? 0.08 : 0.35, 0.45, aim));
  L.E.rotation.x = lerp(pistol ? -0.1 : -0.6, -0.15, aim);
  R.S.rotation.set(lerp(-0.3, pistol ? -1.45 : -0.55, aim), 0, lerp(-0.15, pistol ? -0.15 : -0.3, aim));
  R.E.rotation.x = lerp(-1.1, pistol ? -0.1 : -1.2, aim);
  s.gun.rotation.x = lerp(0.55, 0, aim);
  s.gun.position.y = lerp(0.24, 0.34, aim);
  if (pistol) s.gun.position.set(lerp(0.2, 0.12, aim), lerp(0.05, 0.38, aim), lerp(0.08, 0.5, aim));
  s.torso.rotation.x = Math.sin(t * 1.5 + s.phase) * 0.015;
}

// ---------------- Vehicles ----------------
function wheelSet(root, positions, r, w, rubber, hub) {
  const wheels = [];
  const geo = new THREE.CylinderGeometry(r, r, w, 16);
  geo.rotateZ(Math.PI / 2);
  for (const [x, y, z, front] of positions) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    root.add(g);
    const m = part(geo, rubber, 0, 0, 0, g);
    part(cylY(r * 0.5, w + 0.02, 8), hub, 0, 0, 0, m).rotation.z = Math.PI / 2;
    wheels.push({ g, m, front });
  }
  return wheels;
}

export function createKubel() {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = mat('kubel', { color: 0x6d6a52, roughness: 0.7, metalness: 0.25 });
  const dark = mat('tire', { color: 0x141414, roughness: 0.9 });
  const steel = mat('gunsteel', { color: 0x23262b, roughness: 0.4, metalness: 0.8 });
  const seat = mat('seat', { color: 0x3b2b1e, roughness: 0.8 });
  part(boxG(1.6, 0.55, 3.7), body, 0, 0.78, 0, root);
  part(boxG(1.55, 0.3, 1.1), body, 0, 1.1, 1.25, root).rotation.x = 0.12;
  part(boxG(1.5, 0.35, 0.9), body, 0, 1.05, -1.35, root);
  for (const x of [-0.38, 0.38]) {
    part(boxG(0.55, 0.15, 0.5), seat, x, 1.1, 0.25, root);
    part(boxG(0.55, 0.5, 0.12), seat, x, 1.35, 0.0, root);
  }
  part(boxG(1.2, 0.15, 0.5), seat, 0, 1.1, -0.6, root);
  part(boxG(1.52, 0.04, 0.04), steel, 0, 1.62, 0.78, root);
  for (const x of [-0.74, 0.74]) part(boxG(0.04, 0.5, 0.04), steel, x, 1.38, 0.78, root);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.45), new THREE.MeshStandardMaterial({ color: 0x9ab0c0, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.5 }));
  glass.position.set(0, 1.38, 0.78);
  root.add(glass);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 6, 16), steel);
  sw.position.set(-0.38, 1.35, 0.55);
  sw.rotation.x = -0.9;
  root.add(sw);
  const spare = part(cylY(0.34, 0.2, 14), dark, 0, 1.32, 1.4, root);
  spare.rotation.x = 1.45;
  for (const x of [-0.55, 0.55]) {
    const h = part(cylZ(0.09, 0.1, 10), steel, x, 1.05, 1.85, root);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0x332a10 }));
    lens.position.set(0, 0, 0.051);
    h.add(lens);
  }
  const wheels = wheelSet(root, [[-0.82, 0.4, 1.25, true], [0.82, 0.4, 1.25, true], [-0.82, 0.4, -1.25, false], [0.82, 0.4, -1.25, false]], 0.4, 0.26, dark, body);
  return { root, wheels };
}

export function createJeep() {
  const root = new THREE.Group();
  const body = mat('jeep', { color: 0x4b5230, roughness: 0.75, metalness: 0.2 });
  const dark = mat('tire', { color: 0x141414, roughness: 0.9 });
  part(boxG(1.5, 0.6, 3.2), body, 0, 0.8, 0, root);
  part(boxG(1.45, 0.25, 1.1), body, 0, 1.15, 1.0, root);
  part(boxG(1.4, 0.55, 0.05), body, 0, 1.5, 0.45, root);
  const star = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshStandardMaterial({ map: null, transparent: true, roughness: 0.8 }));
  star.position.set(0, 1.28, 1.0);
  star.rotation.x = -Math.PI / 2;
  star.name = 'star';
  root.add(star);
  wheelSet(root, [[-0.78, 0.4, 1.1], [0.78, 0.4, 1.1], [-0.78, 0.4, -1.1], [0.78, 0.4, -1.1]], 0.4, 0.28, dark, body);
  setShadows(root);
  return root;
}

export function createTruck(canvasTex) {
  const root = new THREE.Group();
  const body = mat('truck', { color: 0x4f5144, roughness: 0.75, metalness: 0.2 });
  const dark = mat('tire', { color: 0x141414, roughness: 0.9 });
  const cover = new THREE.MeshStandardMaterial({ map: canvasTex, color: 0x9a9a80, roughness: 1, side: THREE.DoubleSide });
  part(boxG(2.1, 0.4, 6.2), dark, 0, 0.75, 0, root);
  part(boxG(2.1, 1.3, 1.8), body, 0, 1.6, 2.1, root);
  part(boxG(1.9, 0.8, 1.0), body, 0, 1.3, 3.3, root);
  part(boxG(2.2, 0.8, 3.8), body, 0, 1.35, -0.8, root);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.8, 14, 1, true, -Math.PI / 2, Math.PI), cover);
  c.rotation.x = Math.PI / 2;
  c.rotation.z = Math.PI / 2;
  c.scale.set(1, 1, 0.8);
  c.position.set(0, 1.75, -0.8);
  root.add(c);
  wheelSet(root, [[-1.0, 0.5, 2.4], [1.0, 0.5, 2.4], [-1.0, 0.5, -1.4], [1.0, 0.5, -1.4], [-1.0, 0.5, -2.4], [1.0, 0.5, -2.4]], 0.5, 0.3, dark, body);
  setShadows(root);
  return root;
}

// ---------------- Aircraft & rocket ----------------
export function createC47(stripeTex) {
  const root = new THREE.Group();
  const od = mat('c47', { color: 0x4a4c34, roughness: 0.6, metalness: 0.3 });
  const grey = mat('c47b', { color: 0x6c6e66, roughness: 0.6, metalness: 0.3 });
  const stripes = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.7 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.0, 17, 16), od);
  fus.rotation.x = Math.PI / 2;
  root.add(fus);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), od);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 8.5;
  root.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.0, 4, 14), od);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -10.5;
  root.add(tail);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(29, 0.35, 3.6), stripes);
  wing.position.set(0, -0.6, 2);
  root.add(wing);
  part(boxG(9, 0.2, 2), od, 0, 0.3, -11, root);
  part(boxG(0.2, 3.2, 2.4), od, 0, 1.8, -11.2, root);
  const props = [];
  for (const x of [-5.2, 5.2]) {
    part(cylZ(0.8, 4, 12), grey, x, -0.5, 3, root);
    const prop = new THREE.Group();
    prop.position.set(x, -0.5, 5.1);
    root.add(prop);
    part(boxG(3.6, 0.25, 0.08), mat('prop', { color: 0x111111 }), 0, 0, 0, prop);
    part(boxG(0.25, 3.6, 0.08), mat('prop', { color: 0x111111 }), 0, 0, 0, prop);
    props.push(prop);
  }
  setShadows(root);
  return { root, props };
}

export function createRocket(checkerTex) {
  const pts = [[0, 14], [0.22, 13.2], [0.5, 11.8], [0.76, 9.6], [0.83, 7], [0.82, 3], [0.72, 0.8], [0.55, 0]].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 24);
  const root = new THREE.Group();
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.5, metalness: 0.2 }));
  root.add(body);
  const finMat = mat('fin', { color: 0x161616, roughness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(boxG(0.08, 2.6, 1.3), finMat);
    const a = (i * Math.PI) / 2;
    f.position.set(Math.sin(a) * 1.25, 1.3, Math.cos(a) * 1.25);
    f.rotation.y = a;
    root.add(f);
  }
  setShadows(root);
  return root;
}

// ---------------- Vegetation geometry ----------------
export function pineGeometries(mergeGeometries) {
  const trunk = new THREE.CylinderGeometry(0.16, 0.28, 4, 6);
  trunk.translate(0, 2, 0);
  const cones = [[2.3, 3.2, 3.2], [1.8, 2.9, 4.9], [1.2, 2.5, 6.4], [0.6, 1.6, 7.7]].map(([r, h, y]) => {
    const c = new THREE.ConeGeometry(r, h, 7);
    c.translate(0, y, 0);
    return c;
  });
  return { trunk, foliage: mergeGeometries(cones) };
}
