import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { G } from './state.js';
import { createTextures } from './textures.js';
import { AudioEngine } from './audio.js';
import { Particles, Tracers, FlashPool, FilmShader } from './fx.js';
import { Grid } from './collision.js';
import { buildWorld, WAKE, BASE, H } from './world.js';
import { spawnItems, spawnBarrels, spawnVehicles, updateEntities } from './entities.js';
import { spawnEnemies, updateEnemies } from './enemies.js';
import { mission } from './mission.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { Intro } from './intro.js';
import { initTouch, updateTouch, enterFullscreen } from './touch.js';

const $ = (id) => document.getElementById(id);
const loadBar = $('load-bar');
const setLoad = (p, txt) => { loadBar.style.width = p + '%'; $('load-text').textContent = txt; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  document.getElementById('app').appendChild(renderer.domElement);
  G.renderer = renderer;

  setLoad(10, 'Painting textures…');
  await nextFrame();
  G.T = createTextures();
  G.audio = new AudioEngine();
  G.hud = new HUD();
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 3000);
  G.camera.rotation.order = 'YXZ';
  G.grid = new Grid(8);
  G.fx = new Particles(G.scene, G.T, 900);
  G.tracers = new Tracers(G.scene);
  G.flash = new FlashPool(G.scene, 3);

  setLoad(30, 'Raising the terrain and planting the forest…');
  await nextFrame();
  buildWorld(G.T);
  setLoad(65, 'Deploying the garrison…');
  await nextFrame();
  G.player = new Player();
  G.player.reset(WAKE.x, WAKE.z, 0);
  spawnItems();
  spawnBarrels();
  spawnVehicles();
  spawnEnemies();
  setLoad(85, 'Compiling shaders…');
  await nextFrame();

  // Post-processing chain: scene -> first-person weapon -> bloom -> tone map -> film look
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(G.scene, G.camera);
  composer.addPass(renderPass);
  const vmPass = new RenderPass(G.player.vm.scene, G.player.vm.camera);
  vmPass.clear = false;
  vmPass.clearDepth = true;
  composer.addPass(vmPass);
  vmPass.enabled = false;
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.55, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const post = new ShaderPass(FilmShader);
  composer.addPass(post);
  G.composer = composer;
  G.renderPass = renderPass;
  G.vmPass = vmPass;
  G.bloom = bloom;
  G.post = post;
  post.uniforms.uRes.value.set(innerWidth, innerHeight);

  G.intro = new Intro(G.T);
  renderer.compile(G.scene, G.camera);
  renderer.compile(G.intro.cabin, G.intro.camera);

  addEventListener('resize', onResize);
  bindInput();
  bindUI();
  if (G.touch) initTouch();
  setLoad(100, 'Ready');
  await nextFrame();
  $('loading').classList.add('hidden');
  G.state = 'menu';
  G.hud.showScreen('menu');
  last = performance.now();
  requestAnimationFrame(loop);

  if (G.debug) debugStart(new URLSearchParams(location.search).get('debug'));
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  G.renderer.setSize(w, h);
  G.composer.setSize(w, h);
  for (const c of [G.camera, G.player.vm.camera, G.intro.camera]) { c.aspect = w / h; c.updateProjectionMatrix(); }
  G.post.uniforms.uRes.value.set(w, h);
}

function applyQuality() {
  const q = G.settings.quality;
  const pr = G.touch ? { low: 1, medium: 1.25, high: 1.5 } : { low: 0.75, medium: 1, high: 1.5 };
  G.renderer.setPixelRatio(Math.min(devicePixelRatio, pr[q]));
  G.bloom.enabled = q !== 'low';
  const size = q === 'high' ? 2048 : 1024;
  const sh = G.world.moon.shadow;
  if (sh.mapSize.x !== size) {
    sh.mapSize.set(size, size);
    if (sh.map) { sh.map.dispose(); sh.map = null; }
  }
  onResize();
}

// ---------------- Input ----------------
function bindInput() {
  const I = G.input;
  addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    if (!I.keys.has(e.code)) I.pressed.add(e.code);
    I.keys.add(e.code);
    if (G.state === 'intro' && (e.code === 'Enter' || e.code === 'Space')) G.intro.skip();
  });
  addEventListener('keyup', (e) => I.keys.delete(e.code));
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) { I.mouse.dx += e.movementX; I.mouse.dy += e.movementY; }
  });
  addEventListener('mousedown', (e) => {
    if (!document.pointerLockElement && !G.debug) return;
    if (e.button === 0) { I.mouse.left = true; I.mouse.clicked = true; }
    if (e.button === 2) I.mouse.right = true;
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) I.mouse.left = false;
    if (e.button === 2) I.mouse.right = false;
  });
  addEventListener('wheel', (e) => { if (document.pointerLockElement) I.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('blur', () => { I.keys.clear(); I.mouse.left = I.mouse.right = false; });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && G.state === 'play') {
      G.state = 'paused';
      G.input.keys.clear();
      G.input.mouse.left = G.input.mouse.right = false;
      G.hud.showScreen('pause');
    }
  });
}

function lock() {
  const el = G.renderer.domElement;
  const p = el.requestPointerLock?.({ unadjustedMovement: true });
  if (p && p.catch) p.catch(() => el.requestPointerLock());
}

// ---------------- UI ----------------
function bindUI() {
  $('opt-quality').value = G.settings.quality;
  $('btn-start').onclick = () => {
    if (G.touch) enterFullscreen();
    G.settings.quality = $('opt-quality').value;
    G.settings.difficulty = parseFloat($('opt-difficulty').value);
    G.settings.sens = parseFloat($('opt-sens').value);
    applyQuality();
    G.audio.init();
    startIntro();
  };
  $('btn-resume').onclick = () => {
    G.audio.init();
    if (G.touch) { G.state = 'play'; G.hud.hideScreens(); return; }
    lock();
  };
  $('opt-sens-pause').oninput = (e) => { G.settings.sens = parseFloat(e.target.value); $('opt-sens').value = e.target.value; };
  $('btn-retry').onclick = () => {
    mission.respawn();
    G.hud.hideScreens();
    G.state = 'play';
    lock();
  };
  $('awaken').onclick = () => { G.audio.init(); beginGameplay(); };
  $('btn-again').onclick = () => location.reload();
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement && G.state === 'paused') { G.state = 'play'; G.hud.hideScreens(); }
  });
}

function startIntro() {
  G.hud.hideScreens();
  G.hud.fade(1, 0);
  G.state = 'intro';
  G.renderPass.scene = G.intro.cabin;
  G.renderPass.camera = G.intro.camera;
  G.vmPass.enabled = false;
  G.intro.onDone = () => {
    G.renderPass.scene = G.scene;
    G.renderPass.camera = G.camera;
    G.post.uniforms.uBlur.value = 0;
    G.state = 'awaken';
    setTimeout(() => G.hud.showScreen('awaken'), 600);
  };
}

function beginGameplay() {
  G.hud.hideScreens();
  G.renderPass.scene = G.scene;
  G.renderPass.camera = G.camera;
  G.vmPass.enabled = true;
  const P = G.player;
  P.reset(WAKE.x, WAKE.z, -0.6);
  P.wakeT = 7;
  G.post.uniforms.uBlur.value = 1.4;
  G.hud.fade(0, 3500);
  G.hud.show(true);
  mission.startWake();
  G.audio.tinnitus(7);
  G.audio.startWind(0.16);
  G.audio.heartbeat(0.7);
  setTimeout(() => G.audio.heartbeat(0.5), 1100);
  setTimeout(() => G.hud.subtitle('...Ugh... my head... Where... where am I?', 5), 1500);
  G.stats.startTime = performance.now();
  G.state = 'play';
  lock();
}

// ---------------- Loop ----------------
let last = 0;
const menuCam = { a: 0.6 };

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.time += dt;
  const t = G.time;
  if (G.touch) updateTouch();
  const post = G.post.uniforms;
  post.uTime.value = t;

  if (G.state === 'menu') {
    menuCam.a += dt * 0.04;
    G.camera.position.set(Math.cos(menuCam.a) * 125, 38 + Math.sin(t * 0.2) * 3, Math.sin(menuCam.a) * 125);
    G.camera.lookAt(0, 4, -5);
    G.world.update(dt, t, G.camera.position);
    G.fx.update(dt);
  } else if (G.state === 'intro') {
    G.intro.update(dt);
    G.renderPass.scene = G.intro.scene;
    G.hud.tick(dt);
  } else if (G.state === 'play') {
    const P = G.player;
    P.update(dt, t);
    updateEnemies(dt, t);
    updateEntities(dt, t);
    mission.update(dt);
    searchlightDetection();
    G.world.update(dt, t, G.camera.position);
    G.fx.update(dt);
    G.tracers.update(dt);
    G.flash.update(dt);
    G.hud.update(dt);
    G.audio.setListener(G.camera.position.x, G.camera.position.y, G.camera.position.z, P.yaw);
    post.uBlur.value = P.wakeT > 0 ? Math.max(0, post.uBlur.value - dt * 0.2) : Math.max(0, post.uBlur.value - dt);
    post.uDamage.value = Math.max(P.hitFlash * 0.9, P.hp < 40 ? (1 - P.hp / 40) * 0.55 : 0);
    post.uFlash.value = Math.max(0, post.uFlash.value - dt * 2);
  } else if (G.state === 'dead') {
    G.player.update(dt, t);
    updateEnemies(dt, t);
    G.world.update(dt, t, G.camera.position);
    G.fx.update(dt);
    G.tracers.update(dt);
    G.flash.update(dt);
    post.uDamage.value = 0.8;
  } else if (G.state === 'victory') {
    G.world.update(dt, t, G.camera.position);
    G.fx.update(dt);
  }

  if (G.state !== 'play' && G.state !== 'intro') G.hud.tick(dt);
  const I = G.input;
  I.pressed.clear();
  I.mouse.dx = I.mouse.dy = 0;
  I.mouse.wheel = 0;
  I.mouse.clicked = false;
  G.composer.render(dt);
}

// Being caught in a live searchlight beam alerts its tower guard.
let slT = 0;
function searchlightDetection() {
  slT -= 1 / 60;
  if (slT > 0) return;
  slT = 0.25;
  const P = G.player;
  if (!P.alive) return;
  for (const s of G.world.searchlights) {
    if (!s.guard || s.guard.dead) continue;
    if (Math.hypot(P.pos.x - s.target.x, P.pos.z - s.target.z) < 5.5) {
      const g = s.guard;
      if (g.state !== 'combat') {
        g.setLast(P.aimPoint);
        g.alert = 1;
        g.enterCombat();
        G.hud.notice('SPOTTED', 'Stay out of the searchlights');
      }
    }
  }
}

// ?debug=play skips the intro and pointer lock for automated smoke tests.
function debugStart(mode) {
  G.audio.init();
  if (mode === 'intro') { startIntro(); return; }
  if (mode === 'menu') return;
  G.hud.hideScreens();
  G.vmPass.enabled = true;
  const P = G.player;
  const spots = { play: [WAKE.x, WAKE.z, -0.6], base: [-80, 18, -1.5], gate: [0, 75, 0] };
  const s = spots[mode] || spots.play;
  P.reset(s[0], s[1], s[2]);
  P.giveWeapon(1, 120);
  G.hud.show(true);
  G.hud.showCompass(true);
  mission.phase = 'explore';
  G.hud.setObjective('Debug');
  G.state = 'play';
}

window.G = G;
init().catch((e) => {
  console.error(e);
  $('load-text').textContent = 'Error: ' + e.message;
});

export { BASE, H };
