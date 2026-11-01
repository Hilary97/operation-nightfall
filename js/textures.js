import * as THREE from 'three';

// Every texture in the game is painted at runtime on a canvas: no image assets.

function cnv(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function wrapArc(g, s, x, y, r) {
  for (let ox = -s; ox <= s; ox += s) {
    for (let oy = -s; oy <= s; oy += s) {
      const px = x + ox, py = y + oy;
      if (px + r < 0 || px - r > s || py + r < 0 || py - r > s) continue;
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function speckle(g, s, n, cols, r0, r1, a0, a1) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = a0 + Math.random() * (a1 - a0);
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    wrapArc(g, s, Math.random() * s, Math.random() * s, r0 + Math.random() * (r1 - r0));
  }
  g.globalAlpha = 1;
}

function radial(size, stops) {
  const c = cnv(size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return toTex(c, { repeat: false });
}

function puffs(size, n, rgb, alpha = 0.3, spread = 0.22) {
  const c = cnv(size), g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * size * spread;
    const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d;
    const r = size * (0.1 + Math.random() * 0.17);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${alpha})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
  }
  return toTex(c, { repeat: false });
}

function labelTex(lines, opts = {}) {
  const { w = 512, h = 256, bg = '#d6ccb0', fg = '#7a1010', border = '#2a2015', size = 62 } = opts;
  const c = cnv(w, h), g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(60,40,20,${Math.random() * 0.15})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  g.strokeStyle = border;
  g.lineWidth = 14;
  g.strokeRect(7, 7, w - 14, h - 14);
  g.fillStyle = fg;
  g.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.12));
  return toTex(c, { repeat: false });
}

export function createTextures() {
  const T = {};

  { // Ground detail: neutral grey multiplied by terrain vertex colors
    const s = 512, c = cnv(s), g = c.getContext('2d');
    g.fillStyle = '#9b9b90';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 5000, ['#77776a', '#b6b6a4', '#8b8672', '#626157'], 1, 3.5, 0.25, 0.6);
    g.lineWidth = 1;
    for (let i = 0; i < 4500; i++) {
      const x = Math.random() * s, y = Math.random() * s, l = 3 + Math.random() * 8;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      g.strokeStyle = Math.random() < 0.5 ? '#c6c9b0' : '#5c5f4f';
      g.globalAlpha = 0.35;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    g.globalAlpha = 1;
    T.ground = toTex(c);
    T.ground.repeat.set(170, 170);
  }

  { // Concrete
    const s = 512, c = cnv(s), g = c.getContext('2d');
    g.fillStyle = '#8f8d86';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 6000, ['#7a7872', '#a19f97', '#6b6a64', '#b0ada4'], 0.5, 2, 0.3, 0.7);
    speckle(g, s, 40, ['#4a4844', '#5d5a52'], 20, 70, 0.04, 0.12);
    g.strokeStyle = 'rgba(40,38,34,0.5)';
    for (let i = 0; i < 7; i++) {
      let x = Math.random() * s, y = Math.random() * s;
      g.lineWidth = 1 + Math.random();
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 40; y += Math.random() * 30; g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(30,28,25,0.35)';
    for (let y = 0; y < s; y += 128) g.fillRect(0, y, s, 2);
    T.concrete = toTex(c);
  }

  { // Wood planks
    const s = 512, c = cnv(s), g = c.getContext('2d');
    for (let x = 0; x < s; x += 32) {
      const v = 70 + Math.random() * 30;
      g.fillStyle = `rgb(${v + 20},${v - 5},${v - 30})`;
      g.fillRect(x, 0, 32, s);
      g.strokeStyle = 'rgba(30,18,8,0.35)';
      for (let k = 0; k < 6; k++) {
        g.lineWidth = 1;
        g.beginPath();
        const ox = x + 4 + Math.random() * 24;
        g.moveTo(ox, 0);
        g.bezierCurveTo(ox + 6, s * 0.3, ox - 6, s * 0.6, ox + 3, s);
        g.stroke();
      }
      g.fillStyle = 'rgba(15,8,3,0.9)';
      g.fillRect(x, 0, 2, s);
      g.fillStyle = 'rgba(20,20,20,0.8)';
      for (let y = 40; y < s; y += 170) { g.fillRect(x + 8, y, 3, 3); g.fillRect(x + 22, y, 3, 3); }
    }
    speckle(g, s, 400, ['#1a1008'], 1, 3, 0.1, 0.3);
    T.planks = toTex(c);
  }

  { // Corrugated metal
    const s = 512, c = cnv(s), g = c.getContext('2d');
    for (let x = 0; x < s; x++) {
      const v = 95 + Math.sin(x / s * Math.PI * 2 * 24) * 28;
      g.fillStyle = `rgb(${v * 0.85},${v * 0.9},${v * 0.82})`;
      g.fillRect(x, 0, 1, s);
    }
    speckle(g, s, 500, ['#6b3b1d', '#7d4a26', '#4c2c16'], 2, 12, 0.08, 0.35);
    g.fillStyle = 'rgba(20,20,18,0.5)';
    for (let y = 0; y < s; y += 256) g.fillRect(0, y, s, 3);
    T.metal = toTex(c);
  }

  { // Tar paper roof
    const s = 256, c = cnv(s), g = c.getContext('2d');
    g.fillStyle = '#2b2a28';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 2500, ['#3a3835', '#1e1d1b', '#45423d'], 0.5, 1.8, 0.4, 0.8);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (let y = 0; y < s; y += 32) g.fillRect(0, y, s, 2);
    T.roof = toTex(c);
  }

  { // Sandbags
    const s = 256, c = cnv(s), g = c.getContext('2d');
    g.fillStyle = '#4a4232';
    g.fillRect(0, 0, s, s);
    const rowH = 32;
    for (let r = 0; r < s / rowH; r++) {
      const off = (r % 2) * 32;
      for (let x = -64; x < s + 64; x += 64) {
        const bx = x + off, by = r * rowH;
        const gr = g.createLinearGradient(0, by, 0, by + rowH);
        gr.addColorStop(0, '#9c8b66');
        gr.addColorStop(0.5, '#8a7a58');
        gr.addColorStop(1, '#5a4e38');
        g.fillStyle = gr;
        g.beginPath();
        g.roundRect(bx + 2, by + 2, 60, rowH - 4, 12);
        g.fill();
      }
    }
    speckle(g, s, 1500, ['#3c3426', '#b3a27c'], 0.5, 1.5, 0.2, 0.5);
    T.sandbag = toTex(c);
  }

  { // Olive canvas
    const s = 256, c = cnv(s), g = c.getContext('2d');
    g.fillStyle = '#5b5a3c';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
      g.fillRect(i, 0, 1, s);
      g.fillRect(0, i, s, 1);
    }
    speckle(g, s, 30, ['#3d3c27', '#6e6c49'], 10, 40, 0.1, 0.25);
    T.canvas = toTex(c);
  }

  { // Supply crate
    const s = 256, c = cnv(s), g = c.getContext('2d');
    g.fillStyle = '#6a5233';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 42) {
      g.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.15})`;
      g.fillRect(0, y, s, 42);
      g.fillStyle = 'rgba(20,10,4,0.8)';
      g.fillRect(0, y, s, 2);
    }
    g.strokeStyle = '#3e2c18';
    g.lineWidth = 22;
    g.strokeRect(11, 11, s - 22, s - 22);
    g.beginPath();
    g.moveTo(16, 16);
    g.lineTo(s - 16, s - 16);
    g.stroke();
    g.fillStyle = 'rgba(230,220,190,0.55)';
    g.font = 'bold 34px "Courier New", monospace';
    g.textAlign = 'center';
    g.fillText('MUNITION', s / 2, s / 2 + 12);
    T.crate = toTex(c);
  }

  { // Grass blades (alpha)
    const s = 128, c = cnv(s), g = c.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const x = 8 + Math.random() * (s - 16), h = s * (0.45 + Math.random() * 0.5);
      const lean = (Math.random() - 0.5) * 30;
      const v = 120 + Math.random() * 70;
      g.fillStyle = `rgb(${v * 0.75},${v},${v * 0.55})`;
      g.beginPath();
      g.moveTo(x - 3, s);
      g.quadraticCurveTo(x + lean * 0.4, s - h * 0.6, x + lean, s - h);
      g.quadraticCurveTo(x + lean * 0.4 + 2, s - h * 0.6, x + 3, s);
      g.fill();
    }
    T.grass = toTex(c, { repeat: false });
  }

  { // V-2 test paint (black and white quadrants)
    const s = 256, c = cnv(s), g = c.getContext('2d');
    for (let q = 0; q < 4; q++) {
      for (let r = 0; r < 4; r++) {
        g.fillStyle = (q + r) % 2 ? '#e8e6de' : '#151515';
        g.fillRect(q * 64, r * 64, 64, 64);
      }
    }
    speckle(g, s, 300, ['#777'], 1, 3, 0.1, 0.25);
    T.checker = toTex(c);
  }

  { // Allied invasion stripes
    const c = cnv(256, 64), g = c.getContext('2d');
    const cols = ['#4a4c30', '#eeeeee', '#111111', '#eeeeee', '#111111', '#eeeeee', '#4a4c30'];
    cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * (256 / cols.length), 0, 256 / cols.length + 1, 64); });
    T.invasion = toTex(c);
  }

  { // Red/white barrier
    const c = cnv(256, 32), g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e8e2d4' : '#a01818'; g.fillRect(i * 32, 0, 32, 32); }
    T.stripes = toTex(c);
  }

  { // US flag
    const c = cnv(380, 200), g = c.getContext('2d');
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f2efe6' : '#b22234'; g.fillRect(0, i * 200 / 13, 380, 200 / 13 + 1); }
    g.fillStyle = '#3c3b6e';
    g.fillRect(0, 0, 152, 108);
    g.fillStyle = '#fff';
    for (let r = 0; r < 9; r++) for (let k = 0; k < (r % 2 ? 5 : 6); k++) {
      g.beginPath();
      g.arc(13 + k * 25 + (r % 2) * 12.5, 8 + r * 11, 3, 0, 7);
      g.fill();
    }
    T.usflag = toTex(c, { repeat: false });
  }

  { // White allied star
    const s = 128, c = cnv(s), g = c.getContext('2d');
    g.fillStyle = '#ece8dc';
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.47, 0, 7);
    g.lineWidth = 6;
    g.strokeStyle = '#ece8dc';
    g.stroke();
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.17 : s * 0.42, a = -Math.PI / 2 + i * Math.PI / 5;
      g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
    }
    g.fill();
    T.star = toTex(c, { repeat: false });
  }

  { // Medkit
    const s = 128, c = cnv(s), g = c.getContext('2d');
    g.fillStyle = '#d8d2c0';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#b01515';
    g.fillRect(s * 0.38, s * 0.15, s * 0.24, s * 0.7);
    g.fillRect(s * 0.15, s * 0.38, s * 0.7, s * 0.24);
    T.medkit = toTex(c, { repeat: false });
  }

  { // Paper documents
    const s = 128, c = cnv(s), g = c.getContext('2d');
    g.fillStyle = '#e4dcc4';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#5a4a3a';
    for (let y = 18; y < s - 10; y += 9) g.fillRect(12, y, 40 + Math.random() * 64, 2);
    g.fillStyle = '#8a1a1a';
    g.font = 'bold 20px "Courier New"';
    g.fillText('GEHEIM', 26, 14);
    T.paper = toTex(c, { repeat: false });
  }

  T.sign = labelTex(['ACHTUNG!', 'SPERRGEBIET']);
  T.sign2 = labelTex(['ZUTRITT', 'VERBOTEN'], { fg: '#1a1a1a' });

  // Sprite textures
  T.soft = radial(64, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  T.flame = radial(64, [[0, 'rgba(255,250,220,1)'], [0.25, 'rgba(255,200,90,0.9)'], [0.6, 'rgba(255,90,20,0.35)'], [1, 'rgba(120,20,0,0)']]);
  T.glow = radial(128, [[0, 'rgba(255,255,255,1)'], [0.1, 'rgba(255,255,255,0.8)'], [0.3, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]);
  T.smoke = puffs(128, 18, '255,255,255', 0.28);
  T.cloud = puffs(256, 30, '255,255,255', 0.22, 0.28);

  { // Muzzle flash star
    const s = 128, c = cnv(s), g = c.getContext('2d');
    g.translate(s / 2, s / 2);
    for (let i = 0; i < 7; i++) {
      g.rotate((Math.PI * 2) / 7 + Math.random() * 0.3);
      const gr = g.createLinearGradient(0, 0, s * 0.5, 0);
      gr.addColorStop(0, 'rgba(255,240,200,1)');
      gr.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(s * (0.3 + Math.random() * 0.2), 0);
      g.lineTo(0, 6);
      g.fill();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.25);
    gr.addColorStop(0, 'rgba(255,255,240,1)');
    gr.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = gr;
    g.fillRect(-s / 2, -s / 2, s, s);
    T.flash = toTex(c, { repeat: false });
  }

  return T;
}
