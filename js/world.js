import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from './state.js';
import { fbm, smooth, lerp, polyDist, rand, clamp } from './util.js';
import { beamMaterial } from './fx.js';
import * as M from './models.js';
import { createSoldier } from './soldiers.js';

// ---------------- Layout (meters; -Z is north) ----------------
export const BASE = { minX: -70, maxX: 70, minZ: -55, maxZ: 55 };
export const WAKE = new THREE.Vector3(-165, 0, 192);
export const WRECK = new THREE.Vector3(-138, 0, 160);
export const ALLIED = new THREE.Vector3(250, 0, 330);
export const ROAD = [[0, 58], [0, 92], [28, 130], [78, 162], [128, 200], [168, 248], [212, 292], [246, 318]];
export const TRAIL = [[-135, 152], [-120, 126], [-108, 100], [-98, 75], [-88, 50], [-80, 28], [-73, 17]];
export const ROADBLOCK = new THREE.Vector3(128, 0, 200);
export const BOUND = 405;

function rawLow(x, z) { return (fbm(x * 0.005 + 11.3, z * 0.005 + 7.1) - 0.5) * 42; }
function rawHi(x, z) { return (fbm(x * 0.035 + 3.7, z * 0.035 + 9.2) - 0.5) * 5; }
const ALLIED_Y = rawLow(ALLIED.x, ALLIED.z);

export function baseDist(x, z) {
  const dx = Math.max(BASE.minX - x, 0, x - BASE.maxX), dz = Math.max(BASE.minZ - z, 0, z - BASE.maxZ);
  return Math.hypot(dx, dz);
}

export function H(x, z) {
  let low = rawLow(x, z), hi = rawHi(x, z);
  const e = Math.max(Math.abs(x), Math.abs(z));
  low += smooth(330, 440, e) * 45;
  const dr = Math.min(polyDist(ROAD, x, z), polyDist(TRAIL, x, z) + 2);
  hi *= smooth(2, 10, dr);
  const db = baseDist(x, z);
  low = lerp(0, low, smooth(2, 60, db));
  hi *= smooth(0, 20, db);
  const da = Math.hypot(x - ALLIED.x, z - ALLIED.z);
  low = lerp(ALLIED_Y, low, smooth(25, 70, da));
  hi *= smooth(15, 40, da);
  return low + hi;
}
G.H = H;

// ---------------- Helpers ----------------
let MATS;
const _allyAnim = { move: 0, aim: 0, d2: 0 };
function addBlock(w, h, d, material, x, y, z, { ry = 0, collide = true, cast = true, tile = 2, flags = {} } = {}) {
  const m = new THREE.Mesh(M.scaledBox(w, h, d, tile), material);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = ry;
  m.castShadow = cast;
  m.receiveShadow = true;
  G.scene.add(m);
  if (collide) {
    const sw = Math.abs(Math.sin(ry)) > 0.5;
    const hx = (sw ? d : w) / 2, hz = (sw ? w : d) / 2;
    G.grid.add({ minX: x - hx, maxX: x + hx, minY: y, maxY: y + h, minZ: z - hz, maxZ: z + hz, ...flags });
  }
  return m;
}

function addCollider(minX, maxX, minY, maxY, minZ, maxZ, flags = {}) {
  return G.grid.add({ minX, maxX, minY, maxY, minZ, maxZ, ...flags });
}

function addMesh(geo, material, x, y, z, { cast = true, ry = 0 } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = cast;
  m.receiveShadow = true;
  G.scene.add(m);
  return m;
}

function roof(len, width, h, x, y, z, ry = 0) {
  const geo = M.prismGeo(len, width, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 3, uv.getY(i) * 2);
  return addMesh(geo, MATS.roof, x, y, z, { ry });
}

function crate(x, z, s = 1.2, y = null, ry = 0) {
  const yy = y ?? H(x, z);
  return addBlock(s, s, s, MATS.crate, x, yy, z, { ry, tile: s });
}

function sandbags(cx, cz, r, a0, a1, n, layers = 2) {
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / Math.max(1, n - 1);
    const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
    const y = H(x, z);
    const m = addMesh(M.scaledBox(1.3, 0.45 * layers, 0.6, 1), MATS.sandbag, x, y + 0.225 * layers, z, { ry: a + Math.PI / 2 });
    m.rotation.y = a + Math.PI / 2;
    addCollider(x - 0.55, x + 0.55, y, y + 0.45 * layers, z - 0.55, z + 0.55);
  }
}

// ---------------- Build ----------------
export function buildWorld(T) {
  const scene = G.scene;
  const W = { searchlights: [], fires: [], lamps: [], barrelSpots: [], flare: null, flaresOn: false, blink: [] };
  G.world = W;

  MATS = {
    concrete: new THREE.MeshStandardMaterial({ map: T.concrete, bumpMap: T.concrete, bumpScale: 0.6, roughness: 0.95 }),
    planks: new THREE.MeshStandardMaterial({ map: T.planks, bumpMap: T.planks, bumpScale: 0.5, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ map: T.metal, bumpMap: T.metal, bumpScale: 1, roughness: 0.6, metalness: 0.45, side: THREE.DoubleSide }),
    roof: new THREE.MeshStandardMaterial({ map: T.roof, roughness: 0.95 }),
    sandbag: new THREE.MeshStandardMaterial({ map: T.sandbag, bumpMap: T.sandbag, bumpScale: 1.5, roughness: 1 }),
    canvas: new THREE.MeshStandardMaterial({ map: T.canvas, roughness: 1, side: THREE.DoubleSide }),
    crate: new THREE.MeshStandardMaterial({ map: T.crate, bumpMap: T.crate, bumpScale: 0.6, roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x2a2c2a, roughness: 0.5, metalness: 0.7 }),
    wire: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.6 }),
    windowGlow: new THREE.MeshStandardMaterial({ color: 0x1a1208, emissive: 0xffa040, emissiveIntensity: 1.6 }),
    scorched: new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.8, metalness: 0.3, side: THREE.DoubleSide }),
    od: new THREE.MeshStandardMaterial({ color: 0x47492f, roughness: 0.65, metalness: 0.3, side: THREE.DoubleSide }),
  };
  W.mats = MATS;

  // --- Atmosphere ---
  const fogCol = new THREE.Color(0x26304a);
  scene.fog = new THREE.FogExp2(fogCol, 0.0082);
  scene.background = fogCol;

  const hemi = new THREE.HemisphereLight(0x7d90b8, 0x2c2e22, 2.1);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xb8caff, 2.8);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 450;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.05;
  scene.add(moon, moon.target);
  W.moon = moon;
  W.moonDir = new THREE.Vector3(-0.45, 0.72, -0.53).normalize();

  // Sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x03060f) },
      mid: { value: new THREE.Color(0x111a2c) },
      horizon: { value: fogCol.clone() },
      glowDir: { value: new THREE.Vector3(0.7, 0.02, 0.7).normalize() },
      glowCol: { value: new THREE.Color(0x5a3a26) },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, horizon, glowCol, glowDir; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = mix(horizon, mid, smoothstep(-0.02, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.85, h));
      float g = pow(max(dot(normalize(vDir), glowDir), 0.0), 5.0); c += glowCol * g * (1.0 - smoothstep(0.0, 0.45, h)); gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);
  W.sky = sky;
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 2200; i++) {
    const u = Math.random() * Math.PI * 2, v = Math.acos(rand(0.08, 1));
    sp.push(Math.sin(v) * Math.cos(u) * 1300, Math.cos(v) * 1300, Math.sin(v) * Math.sin(u) * 1300);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
  sky.add(stars);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0x9fb4ff, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  moonGlow.scale.set(380, 380, 1);
  moonGlow.position.copy(W.moonDir).multiplyScalar(1250);
  sky.add(moonGlow);
  const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xffffff, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  moonDisc.scale.set(70, 70, 1);
  moonDisc.position.copy(moonGlow.position);
  sky.add(moonDisc);
  for (let i = 0; i < 26; i++) {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.cloud, color: 0x3a4458, fog: false, transparent: true, opacity: 0.55, depthWrite: false }));
    const a = Math.random() * Math.PI * 2, r = rand(300, 1000);
    c.position.set(Math.cos(a) * r, rand(260, 520), Math.sin(a) * r);
    const s = rand(260, 520);
    c.scale.set(s, s * 0.45, 1);
    sky.add(c);
  }

  // --- Terrain ---
  const size = 900, seg = 240;
  const tg = new THREE.PlaneGeometry(size, size, seg, seg);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(0x384224), cB = new THREE.Color(0x4f502c), cDirt = new THREE.Color(0x56452f);
  const cRoad = new THREE.Color(0x695a45), cBase = new THREE.Color(0x58544b), cBurnt = new THREE.Color(0x1d1a16), cRock = new THREE.Color(0x5a5850);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = H(x, z);
    pos.setY(i, y);
    c.copy(cA).lerp(cB, fbm(x * 0.04, z * 0.04));
    c.lerp(cDirt, smooth(0.55, 0.75, fbm(x * 0.02 + 40, z * 0.02)) * 0.7);
    const slope = Math.hypot(H(x + 1, z) - H(x - 1, z), H(x, z + 1) - H(x, z - 1)) / 2;
    c.lerp(cRock, smooth(0.45, 0.9, slope));
    const dr = polyDist(ROAD, x, z);
    c.lerp(cRoad, smooth(5, 2.5, dr) * (0.8 + 0.2 * fbm(x * 0.3, z * 0.3)));
    c.lerp(cDirt, smooth(2.6, 1, polyDist(TRAIL, x, z)) * 0.85);
    c.lerp(cBase, smooth(3, 0, baseDist(x, z)) * 0.9);
    c.lerp(cBurnt, smooth(16, 4, Math.hypot(x - WRECK.x, z - WRECK.z)));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: T.ground, vertexColors: true, roughness: 1 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  const reserved = (x, z, pad = 0) =>
    baseDist(x, z) < 16 + pad || polyDist(ROAD, x, z) < 7 + pad || polyDist(TRAIL, x, z) < 3 + pad ||
    Math.hypot(x - ALLIED.x, z - ALLIED.z) < 48 + pad || Math.hypot(x - WRECK.x, z - WRECK.z) < 13 + pad ||
    Math.hypot(x - WAKE.x, z - WAKE.z) < 3 + pad || Math.hypot(x - ROADBLOCK.x, z - ROADBLOCK.z) < 14 + pad;

  // --- Forest ---
  const pine = M.pineGeometries(mergeGeometries);
  const folMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 1 });
  const spots = [];
  spots.push([WAKE.x + 4, WAKE.z - 4.5, 1.3]);
  let guard = 0;
  while (spots.length < 2100 && guard++ < 60000) {
    const x = rand(-430, 430), z = rand(-430, 430);
    if (reserved(x, z)) continue;
    const dens = fbm(x * 0.012 + 5, z * 0.012 + 9);
    const nearPath = Math.min(polyDist(TRAIL, x, z), Math.hypot(x - WRECK.x, z - WRECK.z)) < 60;
    if (dens < (nearPath ? 0.3 : 0.42) && Math.max(Math.abs(x), Math.abs(z)) < 340) continue;
    spots.push([x, z, rand(0.8, 1.55)]);
  }
  const fol = new THREE.InstancedMesh(pine.foliage, folMat, spots.length);
  const trk = new THREE.InstancedMesh(pine.trunk, trunkMat, spots.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  const tc = new THREE.Color();
  spots.forEach(([x, z, s], i) => {
    const y = H(x, z) - 0.2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28);
    mtx.compose(pv.set(x, y, z), q, sv.set(s, s * rand(0.9, 1.2), s));
    fol.setMatrixAt(i, mtx);
    trk.setMatrixAt(i, mtx);
    tc.setHSL(rand(0.24, 0.33), rand(0.3, 0.5), rand(0.055, 0.1));
    fol.setColorAt(i, tc);
    addCollider(x - 0.3 * s, x + 0.3 * s, y, y + 9 * s, z - 0.3 * s, z + 0.3 * s);
    addCollider(x - 1.1 * s, x + 1.1 * s, y + 1.5 * s, y + 7 * s, z - 1.1 * s, z + 1.1 * s, { move: false, shoot: false });
  });
  fol.castShadow = trk.castShadow = true;
  fol.receiveShadow = true;
  scene.add(fol, trk);
  W.treeSpots = spots;

  // Bushes and rocks
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);
  bushGeo.scale(1, 0.6, 1);
  const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ color: 0x2e3a1e, roughness: 1, flatShading: true }), 700);
  for (let i = 0; i < 700; i++) {
    let x, z, n = 0;
    do { x = rand(-400, 400); z = rand(-400, 400); } while (reserved(x, z, -2) && n++ < 20);
    const s = rand(0.5, 1.4);
    mtx.compose(pv.set(x, H(x, z) + 0.2 * s, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6)), sv.set(s, s, s));
    bushes.setMatrixAt(i, mtx);
  }
  bushes.castShadow = true;
  scene.add(bushes);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) rp.setXYZ(i, rp.getX(i) * rand(0.8, 1.2), rp.getY(i) * rand(0.6, 1), rp.getZ(i) * rand(0.8, 1.2));
  rockGeo.computeVertexNormals();
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x5c5a54, roughness: 0.95, flatShading: true }), 220);
  for (let i = 0; i < 220; i++) {
    let x, z, n = 0;
    do { x = rand(-410, 410); z = rand(-410, 410); } while (reserved(x, z) && n++ < 20);
    const s = rand(0.4, 2.2), y = H(x, z);
    mtx.compose(pv.set(x, y, z), q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 6), rand(0, 3))), sv.set(s, s, s));
    rocks.setMatrixAt(i, mtx);
    if (s > 1) addCollider(x - s * 0.8, x + s * 0.8, y - 1, y + s * 0.8, z - s * 0.8, z + s * 0.8);
  }
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);

  // Grass tufts
  if (G.settings.quality !== 'low') {
    const gg1 = new THREE.PlaneGeometry(1.2, 0.7);
    gg1.translate(0, 0.35, 0);
    const gg2 = gg1.clone().rotateY(Math.PI / 2);
    const grassGeo = mergeGeometries([gg1, gg2]);
    const grassMat = new THREE.MeshStandardMaterial({ map: T.grass, alphaTest: 0.45, side: THREE.DoubleSide, color: 0x7d845a, roughness: 1 });
    const N = 16000;
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, N);
    let k = 0;
    while (k < N) {
      const x = rand(-260, 300), z = rand(-120, 380);
      if (baseDist(x, z) < 2 || polyDist(ROAD, x, z) < 3) continue;
      const s = rand(0.6, 1.4);
      mtx.compose(pv.set(x, H(x, z) - 0.05, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6)), sv.set(s, s, s));
      grass.setMatrixAt(k, mtx);
      tc.setHSL(rand(0.17, 0.25), 0.35, rand(0.35, 0.55));
      grass.setColorAt(k, tc);
      k++;
    }
    scene.add(grass);
  }

  buildBase(T, W);
  buildWreck(T, W);
  buildTrailAndRoad(T, W);
  buildAllied(T, W);

  // --- Per-frame world animation ---
  W.update = (dt, t, camPos) => {
    for (const a of W.alliedSoldiers) {
      const d2 = a.root.position.distanceToSquared(camPos);
      if (d2 < 120 * 120) { _allyAnim.d2 = d2; a.anim.update(dt, _allyAnim); }
    }
    sky.position.copy(camPos);
    moon.position.copy(camPos).addScaledVector(W.moonDir, 200);
    moon.target.position.copy(camPos);
    for (const s of W.searchlights) {
      const a = s.base + Math.sin(t * 0.32 + s.phase) * 1.1;
      s.target.set(s.pos.x + Math.sin(a) * s.reach, 0, s.pos.z + Math.cos(a) * s.reach);
      s.target.y = H(s.target.x, s.target.z);
      s.spot.target.position.copy(s.target);
      s.beam.lookAt(s.target);
      const on = !s.guard || !s.guard.dead;
      s.spot.intensity = on ? 900 : 0;
      s.beam.visible = on;
    }
    for (const f of W.fires) {
      if (f.light) f.light.intensity = f.base * (0.75 + Math.sin(t * 13 + f.seed) * 0.12 + Math.sin(t * 29 + f.seed * 2) * 0.1 + Math.random() * 0.1);
      if (Math.abs(f.pos.x - camPos.x) > 260 || Math.abs(f.pos.z - camPos.z) > 260) continue;
      f.acc += dt * f.rate;
      while (f.acc > 1) {
        f.acc -= 1;
        G.fx.emit('fire', f.pos, { spread: f.size * 0.5, vel: new THREE.Vector3(0, 1.5, 0), size: f.size });
        if (Math.random() < 0.25) G.fx.emit(f.big ? 'bigsmoke' : 'smoke', f.pos.clone().add(new THREE.Vector3(0, f.size, 0)), { spread: f.size * 0.4, vel: new THREE.Vector3(0.6, 1.2, 0.2), size: f.size * 0.8 });
        if (Math.random() < 0.08) G.fx.emit('ember', f.pos, { spread: f.size * 0.4, speed: 2, up: 2 });
      }
    }
    for (const b of W.blink) b.material.opacity = Math.sin(t * 3) > 0.3 ? 1 : 0.1;
    if (W.flaresOn) updateFlare(W, dt, t);
  };

  return W;
}

// ---------------- Enemy base ----------------
function buildBase(T, W) {
  const { concrete, planks, metal, crate: crateMat, wire, darkMetal } = MATS;
  const wallH = 3.4, th = 0.7;
  const wallX = (x0, x1, z) => {
    addBlock(x1 - x0, wallH, th, concrete, (x0 + x1) / 2, 0, z, { tile: 3 });
    for (let x = x0; x <= x1; x += 8) addBlock(0.9, wallH + 0.5, 0.9, concrete, x, 0, z, { tile: 3 });
    for (const dy of [0.2, 0.45, 0.7]) addMesh(M.boxG(x1 - x0, 0.03, 0.03), wire, (x0 + x1) / 2, wallH + dy, z, { cast: false });
  };
  const wallZ = (z0, z1, x) => {
    addBlock(th, wallH, z1 - z0, concrete, x, 0, (z0 + z1) / 2, { tile: 3 });
    for (let z = z0; z <= z1; z += 8) addBlock(0.9, wallH + 0.5, 0.9, concrete, x, 0, z, { tile: 3 });
    for (const dy of [0.2, 0.45, 0.7]) addMesh(M.boxG(0.03, 0.03, z1 - z0), wire, x, wallH + dy, (z0 + z1) / 2, { cast: false });
  };
  wallX(BASE.minX, BASE.maxX, BASE.minZ);
  wallX(BASE.minX, -6.5, BASE.maxZ);
  wallX(6.5, BASE.maxX, BASE.maxZ);
  wallZ(BASE.minZ, 12, BASE.minX);
  wallZ(22, BASE.maxZ, BASE.minX);
  wallZ(BASE.minZ, BASE.maxZ, BASE.maxX);

  // Bombed breach rubble on the west wall
  const rubbleGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 14; i++) {
    const x = BASE.minX + rand(-4, 4), z = rand(12, 22);
    const s = rand(0.3, 0.9);
    const m = addMesh(rubbleGeo, concrete, x, H(x, z) + s * 0.3, z);
    m.scale.setScalar(s);
    m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  }
  const broken = addMesh(M.scaledBox(0.7, 2.2, 4, 3), concrete, BASE.minX - 1.6, 0.6, 13.5);
  broken.rotation.z = 1.1;

  // Gate
  for (const x of [-6.8, 6.8]) addBlock(1.3, 4.4, 1.3, concrete, x, 0, BASE.maxZ, { tile: 2 });
  const boom = addMesh(new THREE.BoxGeometry(0.18, 0.18, 6.5), new THREE.MeshStandardMaterial({ map: T.stripes, roughness: 0.7 }), -5.6, 4.3, BASE.maxZ + 0.9);
  boom.rotation.x = -1.25;
  boom.rotation.y = Math.PI / 2;
  addBlock(2.6, 2.6, 2.6, planks, 10, 0, 50, { tile: 2 });
  roof(3.2, 3.2, 0.9, 10, 2.6, 50);

  // Hangar with the secret rocket
  const hr = 13, hz0 = -51, hz1 = -25;
  const hgeo = new THREE.CylinderGeometry(hr, hr, hz1 - hz0, 28, 1, true, Math.PI / 2, Math.PI);
  hgeo.rotateX(Math.PI / 2);
  const huv = hgeo.attributes.uv;
  for (let i = 0; i < huv.count; i++) huv.setXY(i, huv.getX(i) * 10, huv.getY(i) * 6);
  addMesh(hgeo, metal, 0, 0, (hz0 + hz1) / 2);
  const back = new THREE.Mesh(new THREE.CircleGeometry(hr, 28, 0, Math.PI), concrete);
  back.position.set(0, 0, hz0);
  back.receiveShadow = true;
  G.scene.add(back);
  addCollider(-hr - 0.6, -hr + 1.2, 0, 7, hz0, hz1);
  addCollider(hr - 1.2, hr + 0.6, 0, 7, hz0, hz1);
  addCollider(-hr, hr, 0, hr, hz0 - 0.6, hz0 + 0.2);
  addCollider(-hr, hr, 9, hr + 0.5, hz0, hz1, { move: false });
  const rocket = M.createRocket(T.checker);
  rocket.rotation.x = Math.PI / 2;
  rocket.position.set(0, 2.1, -45);
  G.scene.add(rocket);
  addBlock(1.8, 1.2, 13, darkMetal, 0, 0, -38.5, { tile: 2 });
  for (const z of [-43, -34]) for (const x of [-1, 1]) {
    const w = addMesh(M.cylY(0.5, 0.35, 12), MATS.wire, x * 1.05, 0.5, z);
    w.rotation.z = Math.PI / 2;
  }
  for (const [x, z] of [[-9, -46], [-9, -43.6], [-7.8, -46], [9, -30], [9.4, -32.2]]) crate(x, z);
  crate(-9, -46, 1.2, 1.2);
  addBlock(4, 0.9, 1.2, MATS.wood, 8, 0, -45, { tile: 1 });
  for (const z of [-44, -33]) {
    const lamp = new THREE.PointLight(0xffc27a, 40, 32, 1.6);
    lamp.position.set(0, 10.5, z);
    G.scene.add(lamp);
    const shade = addMesh(new THREE.ConeGeometry(0.6, 0.5, 12, 1, true), darkMetal, 0, 11, z);
    shade.material = MATS.darkMetal;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe6b0 }));
    bulb.position.set(0, 10.7, z);
    G.scene.add(bulb);
  }

  // Barracks
  for (const bz of [-12.5, 17.5]) {
    const bx = -47.5;
    addBlock(24, 3.2, 9, planks, bx, 0, bz, { tile: 3 });
    roof(25, 10, 2.4, bx, 3.2, bz);
    addBlock(0.8, 2, 0.8, MATS.concrete, bx + 8, 4.2, bz - 1, { collide: false });
    for (let i = 0; i < 5; i++) {
      for (const side of [-1, 1]) {
        const w = addMesh(new THREE.PlaneGeometry(1.1, 0.8), MATS.windowGlow, bx - 9.5 + i * 4.6, 1.9, bz + side * 4.52, { cast: false });
        if (side < 0) w.rotation.y = Math.PI;
      }
    }
    addMesh(M.boxG(1.3, 2.2, 0.1), MATS.wood, bx + 11.95 > 0 ? bx : bx + 12.05, 1.1, bz, { cast: false }).rotation.y = Math.PI / 2;
  }

  // Command bunker
  addBlock(18, 4.2, 22, concrete, 45, 0, -3, { tile: 3 });
  addBlock(19.5, 0.9, 23.5, concrete, 45, 4.2, -3, { tile: 3 });
  for (let z = -12; z <= 6; z += 6) addMesh(M.boxG(0.1, 0.3, 2.2), new THREE.MeshBasicMaterial({ color: 0x050505 }), 35.96, 2.8, z, { cast: false });
  const door = addMesh(M.boxG(0.12, 2.4, 1.6), darkMetal, 35.95, 1.2, -3);
  door.castShadow = false;
  addBlock(1.8, 0.85, 1, MATS.wood, 33.6, 0, -5.5, { tile: 1 });
  sandbags(34, -3, 4.5, -2.3, -0.9, 4);
  sandbags(34, -3, 4.5, 0.9, 2.3, 4);
  // Radio mast
  addMesh(M.cylY(0.12, 22, 6), darkMetal, 50, 15, -10);
  const blink = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.T.glow, color: 0xff2010, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  blink.position.set(50, 26.2, -10);
  blink.scale.set(2.5, 2.5, 1);
  G.scene.add(blink);
  W.blink.push(blink);

  // Watchtowers with searchlights
  const towers = [[-63, -48, Math.PI * 0.25], [63, -48, -Math.PI * 0.25], [-63, 48, Math.PI * 0.75], [63, 48, -Math.PI * 0.75]];
  W.towers = [];
  for (const [tx, tz, outward] of towers) {
    const h = 6;
    for (const [lx, lz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) addBlock(0.25, h, 0.25, MATS.wood, tx + lx, 0, tz + lz, { tile: 1 });
    addBlock(3.6, 0.25, 3.6, planks, tx, h, tz, { tile: 2 });
    for (const [rx, rz, rw, rd] of [[0, -1.75, 3.6, 0.1], [0, 1.75, 3.6, 0.1], [-1.75, 0, 0.1, 3.6], [1.75, 0, 0.1, 3.6]]) addBlock(rw, 1.05, rd, planks, tx + rx, h + 0.25, tz + rz, { tile: 1 });
    const cap = addMesh(new THREE.ConeGeometry(2.9, 1.4, 4), MATS.roof, tx, h + 3.5, tz);
    cap.rotation.y = Math.PI / 4;
    for (const [px, pz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) addMesh(M.boxG(0.12, 2.6, 0.12), MATS.wood, tx + px, h + 1.55, tz + pz);
    for (let r = 0.5; r < h; r += 0.5) addMesh(M.boxG(0.6, 0.05, 0.05), MATS.wood, tx, r, tz + 1.65, { cast: false });
    // Searchlight
    const dir = Math.atan2(-tx, -tz) + (Math.random() - 0.5) * 0.4;
    const lp = new THREE.Vector3(tx + Math.sin(dir) * 1.4, h + 1.6, tz + Math.cos(dir) * 1.4);
    addMesh(M.cylZ(0.35, 0.6, 12), darkMetal, lp.x, lp.y, lp.z);
    const spot = new THREE.SpotLight(0xfff1d0, 900, 130, 0.17, 0.5, 1.4);
    spot.position.copy(lp);
    G.scene.add(spot, spot.target);
    const len = 60;
    const cone = new THREE.ConeGeometry(Math.tan(0.17) * len, len, 24, 1, true);
    cone.translate(0, -len / 2, 0);
    cone.rotateX(-Math.PI / 2);
    const beamMesh = new THREE.Mesh(cone, beamMaterial());
    beamMesh.position.copy(lp);
    G.scene.add(beamMesh);
    W.searchlights.push({ spot, beam: beamMesh, pos: lp, base: tx < 0 ? outward + Math.PI : outward, phase: Math.random() * 6, reach: 34, target: new THREE.Vector3(), guard: null });
    W.towers.push({ x: tx, z: tz, h });
  }

  // Lamp posts
  for (const [x, z] of [[-20, 30], [18, -12], [40, 30]]) {
    addBlock(0.2, 6, 0.2, darkMetal, x, 0, z, { tile: 1 });
    addMesh(M.boxG(1.2, 0.1, 0.1), darkMetal, x + 0.5, 6, z);
    const l = new THREE.PointLight(0xffc070, 26, 30, 1.5);
    l.position.set(x + 1, 5.7, z);
    G.scene.add(l);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
    bulb.position.copy(l.position);
    G.scene.add(bulb);
  }

  // Motor pool
  for (const [x, z] of [[34, 34], [62, 34], [34, 47], [62, 47]]) addBlock(0.2, 4, 0.2, MATS.wood, x, 0, z, { tile: 1 });
  const shelter = addMesh(new THREE.PlaneGeometry(30, 15), MATS.canvas, 48, 4, 40.5);
  shelter.rotation.x = -Math.PI / 2 + 0.06;
  for (const z of [32, 46]) {
    const t = M.createTruck(T.canvas);
    t.position.set(58, 0, z);
    t.rotation.y = -Math.PI / 2;
    G.scene.add(t);
    addCollider(54.5, 61.5, 0, 3, z - 1.2, z + 1.2);
  }

  // Sandbag nests, crates, burning barrel
  sandbags(-12, 47, 3, Math.PI * 0.6, Math.PI * 1.4, 5);
  sandbags(12, 47, 3, Math.PI * 0.6, Math.PI * 1.4, 5);
  sandbags(0, -17, 4, -0.9, 0.9, 6);
  for (const [x, z] of [[-26, -2], [-26.5, 0.3], [25, 18], [26.2, 18], [25.6, 18], [-8, 22], [14, 6], [-35, 40], [-34, 41.3], [52, 18]]) crate(x, z);
  crate(25.6, 18, 1.2, 1.2);
  addMesh(M.cylY(0.35, 1, 12), MATS.darkMetal, -18, 0.5, 2);
  addCollider(-18.4, -17.6, 0, 1, 1.6, 2.4);
  W.fires.push({ pos: new THREE.Vector3(-18, 1.1, 2), size: 0.5, rate: 18, acc: 0, seed: 1, base: 18, light: addFireLight(-18, 2, 2, 18) });

  // Explosive fuel drums (spawned as entities later)
  W.barrelSpots.push([-25, -30], [18, -28], [28, 12], [-55, 2], [33.5, 50], [34.8, 51.3], [33.2, 51.8], [-9, -40]);
}

function addFireLight(x, y, z, intensity, dist = 26) {
  const l = new THREE.PointLight(0xff8a3a, intensity, dist, 1.6);
  l.position.set(x, y, z);
  G.scene.add(l);
  return l;
}

// ---------------- Crash site ----------------
function buildWreck(T, W) {
  const wx = WRECK.x, wz = WRECK.z, wy = H(wx, wz);
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.3, 8, 16, 1, true, 0.4, Math.PI * 1.6), MATS.od);
  fus.rotation.set(Math.PI / 2 - 0.12, 0.4, 0.5);
  fus.position.set(wx, wy + 0.9, wz);
  fus.castShadow = fus.receiveShadow = true;
  G.scene.add(fus);
  addCollider(wx - 2.6, wx + 2.6, wy, wy + 2.5, wz - 3.6, wz + 3.6);
  const wing = addMesh(new THREE.BoxGeometry(10, 0.3, 3.2), new THREE.MeshStandardMaterial({ map: T.invasion, roughness: 0.8 }), wx + 7, wy + 0.5, wz + 4);
  wing.rotation.set(0.15, -0.6, 0.12);
  addCollider(wx + 3, wx + 11, wy, wy + 1.2, wz + 1, wz + 7);
  const tail = new THREE.Group();
  M.part(M.boxG(0.2, 3.2, 2.4), MATS.od, 0, 1.6, 0, tail);
  M.part(M.boxG(6, 0.2, 1.8), MATS.od, 0, 0.4, 0.4, tail);
  tail.position.set(wx - 14, H(wx - 14, wz - 6), wz - 6);
  tail.rotation.set(0.3, 1.1, -0.4);
  M.setShadows(tail);
  G.scene.add(tail);
  addCollider(wx - 17, wx - 11, tail.position.y, tail.position.y + 3, wz - 8, wz - 4);
  const eng = addMesh(M.cylZ(0.8, 3.4, 12), MATS.scorched, wx + 4, wy + 0.6, wz - 5);
  eng.rotation.y = 0.8;
  addCollider(wx + 2.6, wx + 5.4, wy, wy + 1.4, wz - 6.4, wz - 3.6);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * 6.28, r = rand(3, 16);
    const x = wx + Math.cos(a) * r, z = wz + Math.sin(a) * r;
    const d = addMesh(M.boxG(rand(0.2, 1.4), rand(0.05, 0.3), rand(0.3, 1.6)), Math.random() < 0.5 ? MATS.od : MATS.scorched, x, H(x, z) + 0.1, z);
    d.rotation.set(rand(-0.4, 0.4), rand(0, 6), rand(-0.4, 0.4));
  }
  W.fires.push({ pos: new THREE.Vector3(wx, wy + 1.2, wz), size: 1.4, rate: 28, acc: 0, seed: 2, base: 55, big: true, light: addFireLight(wx, wy + 2.5, wz, 55, 40) });
  W.fires.push({ pos: new THREE.Vector3(wx + 6, wy + 0.8, wz + 4), size: 0.9, rate: 18, acc: 0, seed: 3, base: 0 });
  W.fires.push({ pos: new THREE.Vector3(wx + 4, wy + 0.9, wz - 5), size: 0.8, rate: 14, acc: 0, seed: 4, base: 30, light: addFireLight(wx + 4, wy + 1.8, wz - 5, 30) });

  // The player's parachute caught in the pine next to the wake point
  const tx = WAKE.x + 4, tz = WAKE.z - 4.5, ty = H(tx, tz);
  const silk = new THREE.MeshStandardMaterial({ color: 0xb9b4a0, roughness: 0.9, side: THREE.DoubleSide });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), silk);
  canopy.scale.set(1, 0.45, 1);
  canopy.rotation.set(0.5, 0, 0.35);
  canopy.position.set(tx, ty + 9.5, tz);
  canopy.castShadow = true;
  G.scene.add(canopy);
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x6a6658, roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const top = new THREE.Vector3(tx + Math.cos(a) * 2.4, ty + 8.6, tz + Math.sin(a) * 2.4);
    const bot = new THREE.Vector3(tx - 0.5, ty + 2.2, tz + 0.6);
    G.scene.add(M.beam(top, bot, 0.015, 0.015, cordMat));
  }
}

// ---------------- Trail sign, telegraph poles, roadblock ----------------
function buildTrailAndRoad(T, W) {
  const sx = -95, sz = 70, sy = H(sx, sz);
  addBlock(0.18, 2.6, 0.18, MATS.wood, sx, sy, sz, { tile: 1 });
  const board = addMesh(new THREE.BoxGeometry(1.6, 0.8, 0.05), [MATS.wood, MATS.wood, MATS.wood, MATS.wood, new THREE.MeshStandardMaterial({ map: T.sign, roughness: 0.9 }), MATS.wood], sx, sy + 2.1, sz);
  board.rotation.y = -2.2;
  const board2 = addMesh(new THREE.BoxGeometry(1.4, 0.7, 0.05), [MATS.wood, MATS.wood, MATS.wood, MATS.wood, new THREE.MeshStandardMaterial({ map: T.sign2, roughness: 0.9 }), MATS.wood], sx, sy + 1.3, sz);
  board2.rotation.y = -2.0;
  W.signPos = new THREE.Vector3(sx, sy, sz);

  // Telegraph poles along the road
  const poles = [];
  for (let i = 0; i < ROAD.length - 1; i++) {
    const [ax, az] = ROAD[i], [bx, bz] = ROAD[i + 1];
    const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 28);
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let k = 0; k <= n; k++) {
      const t = k / Math.max(1, n);
      const x = ax + (bx - ax) * t + nx * 5.5, z = az + (bz - az) * t + nz * 5.5;
      if (baseDist(x, z) < 4) continue;
      const y = H(x, z);
      addBlock(0.24, 7, 0.24, MATS.wood, x, y, z, { tile: 1 });
      addMesh(M.boxG(1.6, 0.12, 0.12), MATS.wood, x, y + 6.6, z, { ry: Math.atan2(bx - ax, bz - az) + Math.PI / 2 });
      poles.push(new THREE.Vector3(x, y + 6.6, z));
    }
  }
  for (let i = 0; i < poles.length - 1; i++) {
    if (poles[i].distanceTo(poles[i + 1]) > 45) continue;
    G.scene.add(M.beam(poles[i], poles[i + 1], 0.02, 0.02, MATS.wire));
  }

  // Roadblock
  const rx = ROADBLOCK.x, rz = ROADBLOCK.z;
  sandbags(rx - 4, rz + 6, 3, Math.PI * 0.2, Math.PI * 0.9, 4);
  sandbags(rx + 5, rz - 5, 3, -Math.PI * 0.3, Math.PI * 0.4, 4);
  const k = M.createKubel();
  M.setShadows(k.root);
  k.root.position.set(rx + 7, H(rx + 7, rz + 4), rz + 4);
  k.root.rotation.y = 2.3;
  G.scene.add(k.root);
  addCollider(rx + 5.5, rx + 8.5, H(rx + 7, rz + 4), H(rx + 7, rz + 4) + 1.6, rz + 2.5, rz + 5.5);
  crate(rx - 6, rz - 3);
  crate(rx - 6.2, rz - 1.7);
  W.fires.push({ pos: new THREE.Vector3(rx - 2, H(rx - 2, rz + 2) + 0.5, rz + 2), size: 0.45, rate: 14, acc: 0, seed: 5, base: 0 });
}

// ---------------- Allied HQ ----------------
function buildAllied(T, W) {
  const ax = ALLIED.x, az = ALLIED.z;
  for (const [dx, dz, ry] of [[-12, -8, 0], [-12, 6, 0], [10, -10, Math.PI / 2], [12, 8, Math.PI / 2]]) {
    const x = ax + dx, z = az + dz, y = H(x, z);
    const tent = addMesh(M.prismGeo(7, 4.5, 2.6), MATS.canvas, x, y, z, { ry });
    tent.material = MATS.canvas;
    const sw = ry !== 0;
    addCollider(x - (sw ? 2.2 : 3.5), x + (sw ? 2.2 : 3.5), y, y + 2.6, z - (sw ? 3.5 : 2.2), z + (sw ? 3.5 : 2.2));
  }
  sandbags(ax, az, 24, 0, Math.PI * 2 - 0.6, 40);
  const py = H(ax, az);
  addBlock(0.15, 9, 0.15, MATS.darkMetal, ax + 2, py, az - 2, { tile: 1 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3, 12, 4), new THREE.MeshStandardMaterial({ map: T.usflag, side: THREE.DoubleSide, roughness: 0.9 }));
  flag.position.set(ax + 3.25, py + 8.2, az - 2);
  G.scene.add(flag);
  W.flag = flag;
  const jeep = M.createJeep();
  jeep.getObjectByName('star').material.map = T.star;
  jeep.position.set(ax - 4, py, az + 12);
  jeep.rotation.y = 0.6;
  G.scene.add(jeep);
  addCollider(ax - 6, ax - 2, py, py + 1.6, az + 10, az + 14);
  crate(ax + 4, az + 4);
  crate(ax + 5.3, az + 4.2);
  W.fires.push({ pos: new THREE.Vector3(ax - 2, py + 0.3, az + 2), size: 0.6, rate: 16, acc: 0, seed: 6, base: 28, light: addFireLight(ax - 2, py + 1.5, az + 2, 28) });
  W.alliedSoldiers = [];
  for (const [dx, dz, ry] of [[-3.5, 1, 1.2], [-0.5, 3.8, 3], [1, 0, -1.6], [6, 16, 3.5], [-8, -16, 0.2]]) {
    const s = createSoldier('allied', 'rifle');
    s.root.position.set(ax + dx, H(ax + dx, az + dz), az + dz);
    s.root.rotation.y = ry;
    s.anim.update(0);
    G.scene.add(s.root);
    W.alliedSoldiers.push(s);
  }
  // Signal flare (only active on the return leg)
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0x9dff80, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  fl.scale.set(14, 14, 1);
  fl.visible = false;
  G.scene.add(fl);
  const fll = new THREE.PointLight(0x7dff60, 0, 260, 1);
  G.scene.add(fll);
  W.flare = { sprite: fl, light: fll, t: 99, vy: 0 };
}

function updateFlare(W, dt, t) {
  const f = W.flare;
  f.t += dt;
  if (f.t > 9) {
    f.t = 0;
    f.sprite.position.set(ALLIED.x + rand(-5, 5), H(ALLIED.x, ALLIED.z) + 2, ALLIED.z + rand(-5, 5));
    f.vy = 42;
    f.sprite.visible = true;
  }
  if (!f.sprite.visible) return;
  f.vy = Math.max(-2.5, f.vy - 14 * dt);
  f.sprite.position.y += f.vy * dt;
  f.sprite.position.x += dt * 1.5;
  f.light.position.copy(f.sprite.position);
  const life = clamp(1 - (f.t - 3) / 6, 0, 1);
  f.light.intensity = 260 * life * (0.85 + Math.random() * 0.15);
  f.sprite.material.opacity = life;
  if (Math.random() < 0.6) G.fx.emit('flare', f.sprite.position, { spread: 0.4, size: 1.5 });
  if (life <= 0) f.sprite.visible = false;
}
