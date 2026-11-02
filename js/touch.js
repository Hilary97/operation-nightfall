import { G } from './state.js';

// On-screen controls for phones and tablets. They write into G.input exactly
// like the keyboard and mouse do, so the game logic stays input-agnostic.
const LOOK_SENS = 1.3;
const STICK_R = 62;
const DEADZONE = 0.12;

let root, stickBase, stickKnob, useBtn, aimBtn, crouchBtn, zoomBtn;
let scopedUI = false;
let visible = false;
let stick = null;
const looks = new Map();

function el(tag, cls, parent, text = '') {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  parent.appendChild(e);
  return e;
}

function trackLook(e) { looks.set(e.pointerId, { x: e.clientX, y: e.clientY }); }

function moveLook(e) {
  const p = looks.get(e.pointerId);
  if (!p) return;
  G.input.mouse.dx += (e.clientX - p.x) * LOOK_SENS;
  G.input.mouse.dy += (e.clientY - p.y) * LOOK_SENS;
  p.x = e.clientX;
  p.y = e.clientY;
}

function endLook(e) { looks.delete(e.pointerId); }

function button(cls, label, { down, up, look = false } = {}) {
  const b = el('div', 'tbtn ' + cls, root, label);
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    b.setPointerCapture(e.pointerId);
    b.classList.add('pressed');
    if (look) trackLook(e);
    down?.(e, b);
  });
  if (look) b.addEventListener('pointermove', moveLook);
  const end = (e) => {
    b.classList.remove('pressed');
    if (look) endLook(e);
    up?.(e, b);
  };
  b.addEventListener('pointerup', end);
  b.addEventListener('pointercancel', end);
  return b;
}

const key = (code) => ({
  down: () => { G.input.pressed.add(code); G.input.keys.add(code); },
  up: () => G.input.keys.delete(code),
});

function resetStick() {
  stick = null;
  const a = G.input.axis;
  a.x = a.y = 0;
  a.sprint = false;
  stickBase.classList.remove('on');
}

function releaseAll() {
  const I = G.input;
  resetStick();
  looks.clear();
  I.mouse.left = I.mouse.right = false;
  I.keys.clear();
  aimBtn.classList.remove('active');
  crouchBtn.classList.remove('active');
}

function pause() {
  if (G.state !== 'play') return;
  G.state = 'paused';
  releaseAll();
  G.hud.showScreen('pause');
}

function moveStick(e) {
  if (!stick || e.pointerId !== stick.id) return;
  const dx = e.clientX - stick.x, dy = e.clientY - stick.y;
  const d = Math.hypot(dx, dy);
  const k = Math.min(1, d / STICK_R);
  const ux = d ? dx / d : 0, uy = d ? dy / d : 0;
  stickKnob.style.transform = `translate(${ux * k * STICK_R}px, ${uy * k * STICK_R}px)`;
  const m = k < DEADZONE ? 0 : (k - DEADZONE) / (1 - DEADZONE);
  const a = G.input.axis;
  a.x = ux * m;
  a.y = -uy * m;
  a.sprint = k > 0.97 && a.y > 0.75;
}

export function initTouch() {
  const I = G.input;
  document.body.classList.add('touch');
  root = el('div', 'hidden', document.body);
  root.id = 'touch-ui';

  const lookZone = el('div', 't-look-zone', root);
  lookZone.addEventListener('pointerdown', (e) => { e.preventDefault(); lookZone.setPointerCapture(e.pointerId); trackLook(e); });
  lookZone.addEventListener('pointermove', moveLook);
  lookZone.addEventListener('pointerup', endLook);
  lookZone.addEventListener('pointercancel', endLook);

  const stickZone = el('div', 't-stick-zone', root);
  stickBase = el('div', 't-stick', root);
  stickKnob = el('div', 't-knob', stickBase);
  stickZone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (stick) return;
    stickZone.setPointerCapture(e.pointerId);
    stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
    stickBase.style.left = e.clientX + 'px';
    stickBase.style.top = e.clientY + 'px';
    stickKnob.style.transform = 'translate(0px, 0px)';
    stickBase.classList.add('on');
  });
  stickZone.addEventListener('pointermove', moveStick);
  const endStick = (e) => { if (stick && e.pointerId === stick.id) resetStick(); };
  stickZone.addEventListener('pointerup', endStick);
  stickZone.addEventListener('pointercancel', endStick);

  button('t-fire combat', 'FUEGO', {
    look: true,
    down: () => { I.mouse.left = true; I.mouse.clicked = true; },
    up: () => { I.mouse.left = false; },
  });
  aimBtn = button('t-aim combat', 'MIRA', {
    down: (e, b) => { I.mouse.right = !I.mouse.right; b.classList.toggle('active', I.mouse.right); },
  });
  button('t-reload combat', 'RECARGA', key('KeyR'));
  button('t-jump combat', 'SALTO', key('Space'));
  crouchBtn = button('t-crouch combat', 'AGACHAR', {
    down: (e, b) => {
      if (I.keys.has('KeyC')) I.keys.delete('KeyC'); else I.keys.add('KeyC');
      b.classList.toggle('active', I.keys.has('KeyC'));
    },
  });
  // Shown only behind a scope: steps the magnification (the player reads it as a wheel tick)
  zoomBtn = button('t-zoom combat hidden', 'ZOOM', { down: () => { I.mouse.wheel += 1; } });
  button('t-nade combat', 'GRANADA', key('KeyG'));
  button('t-knife combat', 'CUCHILLO', key('KeyV'));
  useBtn = button('t-use', 'USAR', key('KeyE'));
  button('t-pause', '❚❚', { down: pause });

  const weapon = document.getElementById('weapon');
  weapon.addEventListener('pointerdown', (e) => { e.preventDefault(); I.mouse.wheel += 1; });

  const skip = document.querySelector('#cine .skip');
  skip.textContent = 'TOCA AQUÍ PARA SALTAR';
  skip.classList.add('tappable');
  skip.addEventListener('pointerdown', (e) => { e.preventDefault(); if (G.state === 'intro') G.intro.skip(); });
  document.querySelector('.awaken-text').textContent = 'Toca para abrir los ojos';

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
}

export function updateTouch() {
  const show = G.state === 'play' && G.player.alive;
  if (show !== visible) {
    visible = show;
    root.classList.toggle('hidden', !show);
    if (!show) releaseAll();
  }
  if (!show) return;
  root.classList.toggle('veh', !!G.player.inVehicle);
  // While aiming, FIRE moves under the left thumb so the right thumb is free to look
  root.classList.toggle('aiming', G.input.mouse.right && !G.player.inVehicle);
  // The scope overlay is part of the HUD layer, which sits above these controls;
  // while scoped, lift the controls above it so FIRE and leaving the scope stay reachable.
  const scoped = G.player.scopeK > 0.5;
  if (scoped !== scopedUI) {
    scopedUI = scoped;
    root.classList.toggle('scoped', scoped);
    aimBtn.textContent = scoped ? 'SALIR' : 'MIRA';
  }
  zoomBtn.classList.toggle('hidden', !(scoped && G.player.w.zooms));
  useBtn.classList.toggle('dim', !G.hud._prompt);
}

// Fullscreen and landscape lock must run inside a user gesture.
export function enterFullscreen() {
  const d = document.documentElement;
  const p = d.requestFullscreen?.({ navigationUI: 'hide' });
  if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
}
