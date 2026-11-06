import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { PAL, helmets, buildEnemyGun, mat, part, boxG, cylY } from './models.js';

// Rigged glTF soldier (Toolbench Low-poly Squad Kit, CC0). Model faces +Z, origin at the feet, 1.8 m tall.

const REQUIRED_CLIPS = [
  'idle', 'idle_rifle', 'idle_sidearm', 'walk_rifle', 'walk_sidearm', 'run_rifle', 'run_sidearm',
  'aim_rifle', 'aim', 'fire_rifle', 'fire', 'hit', 'die',
];

// Bones driven by the upper-body layer; everything else (root, hips, legs) is the locomotion layer.
const UPPER = new Set(['Spine', 'Chest', 'Neck', 'Head', 'Shoulder_L', 'Shoulder_R', 'UpperArm_L', 'UpperArm_R',
  'LowerArm_L', 'LowerArm_R', 'Hand_L', 'Hand_R']);

// Reference speeds (m/s) at which the walk and run clips play at timeScale 1.
const WALK_REF = 1.5;
const RUN_REF = 3.3;

let asset = null;
let loading = null;
const splitCache = new Map();

export function loadSoldierAsset(url = 'assets/models/soldier.glb') {
  if (asset) return Promise.resolve(asset);
  if (!loading) {
    loading = new GLTFLoader().loadAsync(url).then((gltf) => {
      const clips = new Map(gltf.animations.map((c) => [c.name, c]));
      const missing = REQUIRED_CLIPS.filter((n) => !clips.has(n));
      if (missing.length) throw new Error('missing clips: ' + missing.join(', '));
      gltf.scene.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
      });
      asset = { scene: gltf.scene, clips };
      return asset;
    }).catch((e) => {
      loading = null;
      throw new Error(`No se pudo cargar el modelo de soldado (${url}): ${e && e.message ? e.message : e}`);
    });
  }
  return loading;
}

// Aim and fire clips stand in a blade stance: the hips are yawed about -34 degrees and the spine counter-rotates.
// The upper layer has no hips, so fold the hips rotation into the spine to keep the weapon pointing ahead.
const STANCE_CLIPS = new Set(['aim', 'aim_rifle', 'fire', 'fire_rifle']);
function foldHipsIntoSpine(tracks) {
  const hips = tracks.find((t) => t.name === 'Hips.quaternion');
  const i = tracks.findIndex((t) => t.name === 'Spine.quaternion');
  if (!hips || i < 0) return tracks;
  const spine = tracks[i];
  const times = hips.times.length > spine.times.length ? hips.times : spine.times;
  const hi = hips.createInterpolant();
  const si = spine.createInterpolant();
  const qh = new THREE.Quaternion(), qs = new THREE.Quaternion();
  const values = new Float32Array(times.length * 4);
  for (let k = 0; k < times.length; k++) {
    qh.fromArray(hi.evaluate(times[k]));
    qs.fromArray(si.evaluate(times[k]));
    qh.multiply(qs).toArray(values, k * 4);
  }
  const out = tracks.slice();
  out[i] = new THREE.QuaternionKeyframeTrack(spine.name, Array.from(times), values);
  return out;
}

// Upper / lower body copies of a clip, so the aim layer can replace the arms and spine without touching the legs.
function split(name) {
  let s = splitCache.get(name);
  if (!s) {
    const clip = asset.clips.get(name);
    const isUpper = (t) => UPPER.has(t.name.split('.')[0]);
    s = {
      full: clip,
      upper: new THREE.AnimationClip(name + '.upper', clip.duration,
        (STANCE_CLIPS.has(name) ? foldHipsIntoSpine(clip.tracks) : clip.tracks).filter(isUpper)),
      lower: new THREE.AnimationClip(name + '.lower', clip.duration, clip.tracks.filter((t) => !isUpper(t))),
    };
    splitCache.set(name, s);
  }
  return s;
}

// Figure materials: TeamColour = cap, torso, upper arms, thighs; mE7C9A4 = skin; m2A3A44 = goggles;
// m3D4750 = strap, cuffs, boots; m57646E = forearms, shins.
const FACTION_MATS = new Map();
function factionMaterials(faction) {
  let m = FACTION_MATS.get(faction);
  if (!m) {
    const p = PAL[faction];
    const std = (c, roughness) => new THREE.MeshStandardMaterial({ color: c, roughness });
    m = {
      TeamColour: std(p.coat, 0.95),
      mE7C9A4: std(0xc08a68, 0.8),
      m2A3A44: std(0x111111, 0.4),
      m3D4750: std(p.boots, 0.6),
      m57646E: std(p.pants, 0.95),
    };
    FACTION_MATS.set(faction, m);
  }
  return m;
}

function headgear(faction, head) {
  const { STAHL, M1 } = helmets();
  const helm = mat('helm-' + faction, { color: PAL[faction].helmet, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide });
  const g = new THREE.Group();
  g.position.set(0, 0.15, 0.005);
  if (faction === 'officer') {
    part(cylY(0.115, 0.13, 14, 0.145), helm, 0, 0.075, 0, g);
    part(boxG(0.2, 0.015, 0.1), mat('visor', { color: 0x0a0a0a, roughness: 0.3 }), 0, 0.02, 0.1, g);
  } else {
    part(faction === 'allied' ? M1 : STAHL, helm, 0, 0.04, 0, g);
  }
  head.add(g);
}

// Weapon mount: gun +Z (barrel) -> socket +X, gun +Y (up) -> socket -Z, which is how the figure's rifle grip holds it.
const MOUNT_Q = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0)));
const GUN_SCALE = { rifle: 0.85, smg: 1, pistol: 1 };

function buildAnim(model, clipsFor, weapon, phase) {
  const mixer = new THREE.AnimationMixer(model);
  const sidearm = weapon === 'pistol';
  const loops = [];
  const loop = (clip, extra) => {
    const a = mixer.clipAction(clip);
    a.setEffectiveWeight(0).play();
    a.time = phase * clip.duration;
    return { a, ...extra };
  };
  const names = sidearm
    ? { idle: 'idle_sidearm', walk: 'walk_sidearm', run: 'run_sidearm', aim: 'aim', fire: 'fire' }
    : { idle: 'idle_rifle', walk: 'walk_rifle', run: 'run_rifle', aim: 'aim_rifle', fire: 'fire_rifle' };
  for (const k of ['idle', 'walk', 'run']) {
    const s = clipsFor(names[k]);
    loops.push({ k, w: k === 'idle' ? 1 : 0, lower: loop(s.lower), upper: loop(s.upper) });
  }
  const aimAction = loop(clipsFor(names.aim).upper).a;
  const shots = new Map();
  for (const k of ['hit', 'fire']) {
    const clip = clipsFor(k === 'hit' ? 'hit' : names.fire).upper;
    const a = mixer.clipAction(clip);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    shots.set(k, { a, t: -1, dur: Math.min(clip.duration, k === 'hit' ? 0.7 : 0.35) });
  }
  const full = { die: clipsFor('die').full };
  let dead = false;
  let aimW = 0;

  const shoot = (key) => {
    const s = shots.get(key);
    s.a.reset().play();
    s.t = 0;
  };
  const startLoops = () => {
    for (const l of loops) { l.lower.a.setEffectiveWeight(0).play(); l.upper.a.setEffectiveWeight(0).play(); }
    aimAction.setEffectiveWeight(0).play();
  };

  const anim = {
    get dead() { return dead; },
    update(dt, { move = 0, aim = 0 } = {}) {
      if (dead) { mixer.update(dt); return; }
      const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const run = sm(2.0, 2.8, move);
      const idle = 1 - sm(0.05, 0.5, move);
      const target = { idle, walk: Math.max(0, 1 - idle - run), run };
      const k = 1 - Math.exp(-12 * dt);
      aimW += (aim - aimW) * k;
      let env = 0;
      for (const s of shots.values()) {
        if (s.t < 0) continue;
        s.t += dt;
        if (s.t >= s.dur) { s.t = -1; s.a.stop(); continue; }
        s.a.setEffectiveWeight(Math.min(1, s.t / 0.06, (s.dur - s.t) / 0.2));
        env = Math.max(env, s.a.getEffectiveWeight());
      }
      const upperScale = 1 - env;
      for (const l of loops) {
        l.w += (target[l.k] - l.w) * k;
        l.lower.a.setEffectiveWeight(l.w);
        l.upper.a.setEffectiveWeight(l.w * (1 - aimW) * upperScale);
        const ts = l.k === 'walk' ? Math.min(1.7, Math.max(0.6, move / WALK_REF))
          : l.k === 'run' ? Math.min(1.5, Math.max(0.7, move / RUN_REF)) : 1;
        l.lower.a.setEffectiveTimeScale(ts);
        l.upper.a.setEffectiveTimeScale(ts);
      }
      aimAction.setEffectiveWeight(aimW * upperScale);
      mixer.update(dt);
    },
    // Short upper-body one-shots layered over the current pose.
    hit() { if (!dead) shoot('hit'); },
    fire() { if (!dead) shoot('fire'); },
    die() {
      if (dead) return;
      dead = true;
      mixer.stopAllAction();
      const a = mixer.clipAction(full.die);
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.setEffectiveWeight(1).play();
    },
    reset() {
      dead = false;
      aimW = 0;
      mixer.stopAllAction();
      for (const s of shots.values()) s.t = -1;
      for (const l of loops) l.w = l.k === 'idle' ? 1 : 0;
      startLoops();
      for (const l of loops) { l.lower.a.time = l.upper.a.time = phase * l.lower.a.getClip().duration; }
      aimAction.time = phase * aimAction.getClip().duration;
      this.update(0, {});
    },
  };
  return { mixer, anim };
}

export function createSoldier(faction = 'axis', weapon = 'rifle') {
  if (!asset) throw new Error('loadSoldierAsset() must finish before createSoldier()');
  const mats = factionMaterials(faction);
  const model = SkeletonUtils.clone(asset.scene);
  const bones = {};
  model.traverse((o) => {
    if (o.isMesh) {
      o.material = mats[o.material.name] || o.material;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    }
    if (o.name) bones[o.name] = o;
  });

  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  root.add(model);

  const head = bones.Head;
  headgear(faction, head);

  const mount = new THREE.Group();
  mount.quaternion.copy(MOUNT_Q);
  const { gun: geo, len } = buildEnemyGun(weapon);
  geo.scale.setScalar(GUN_SCALE[weapon] || 1);
  geo.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  mount.add(geo);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, len);
  geo.add(muzzle);
  bones.Socket_Hand_R.add(mount);

  if (faction === 'allied') {
    const pack = part(boxG(0.3, 0.34, 0.14), mat('pack-allied', { color: PAL.allied.gear, roughness: 0.75 }), 0, 0, 0, null);
    // Socket_Back is tilted in the bind pose; counter-rotate so the pack sits upright behind the shoulders.
    const holder = new THREE.Group();
    bones.Socket_Back.updateWorldMatrix(true, false);
    holder.quaternion.copy(bones.Socket_Back.getWorldQuaternion(new THREE.Quaternion()).invert());
    pack.position.set(0, -0.06, -0.07);
    holder.add(pack);
    bones.Socket_Back.add(holder);
  }

  const phase = Math.random();
  const { mixer, anim } = buildAnim(model, split, weapon, phase);
  anim.reset();
  return { root, model, mixer, anim, gun: mount, muzzle, head, bones, faction, weapon };
}
