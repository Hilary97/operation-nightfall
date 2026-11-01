import { G } from './state.js';
import { clamp } from './util.js';

// Axis-aligned boxes stored in a uniform spatial hash.
// Box flags: move=false (does not block movement), shoot=false (bullets pass),
// los=false (does not block sight).
let QID = 1;

export class Grid {
  constructor(cell = 8) {
    this.cell = cell;
    this.cells = new Map();
  }

  add(b) {
    b._q = 0;
    const c = this.cell;
    for (let i = Math.floor(b.minX / c); i <= Math.floor(b.maxX / c); i++) {
      for (let j = Math.floor(b.minZ / c); j <= Math.floor(b.maxZ / c); j++) {
        const k = i * 100000 + j;
        let a = this.cells.get(k);
        if (!a) this.cells.set(k, (a = []));
        a.push(b);
      }
    }
    return b;
  }

  _gather(i0, i1, j0, j1, out) {
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const a = this.cells.get(i * 100000 + j);
        if (!a) continue;
        for (let n = 0; n < a.length; n++) {
          const b = a[n];
          if (b._q === QID || b.dead) continue;
          b._q = QID;
          out.push(b);
        }
      }
    }
  }

  query(x, z, r, out = []) {
    out.length = 0;
    QID++;
    const c = this.cell;
    this._gather(Math.floor((x - r) / c), Math.floor((x + r) / c), Math.floor((z - r) / c), Math.floor((z + r) / c), out);
    return out;
  }

  queryRay(ox, oz, dx, dz, len, out = []) {
    out.length = 0;
    QID++;
    const c = this.cell, step = c * 0.5;
    let last = null;
    for (let t = 0; ; t += step) {
      const tt = Math.min(t, len);
      const i = Math.floor((ox + dx * tt) / c), j = Math.floor((oz + dz * tt) / c);
      const k = i * 100000 + j;
      if (k !== last) {
        this._gather(i - 1, i + 1, j - 1, j + 1, out);
        last = k;
      }
      if (tt >= len) break;
    }
    return out;
  }
}

export function rayBox(o, d, b, maxT) {
  let tmin = 0, tmax = maxT, axis = -1;
  const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z];
  const MN = [b.minX, b.minY, b.minZ], MX = [b.maxX, b.maxY, b.maxZ];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(D[a]) < 1e-9) {
      if (O[a] < MN[a] || O[a] > MX[a]) return null;
    } else {
      let t1 = (MN[a] - O[a]) / D[a], t2 = (MX[a] - O[a]) / D[a];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) { tmin = t1; axis = a; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return { t: tmin, axis };
}

export function terrainRay(o, d, maxT, step = 1) {
  const H = G.H;
  if (o.y < H(o.x, o.z)) return 0;
  let prev = 0;
  for (let t = step; ; t += step) {
    const tt = Math.min(t, maxT);
    if (o.y + d.y * tt < H(o.x + d.x * tt, o.z + d.z * tt)) {
      let a = prev, b = tt;
      for (let k = 0; k < 6; k++) {
        const m = (a + b) / 2;
        if (o.y + d.y * m < H(o.x + d.x * m, o.z + d.z * m)) b = m;
        else a = m;
      }
      return b;
    }
    prev = tt;
    if (tt >= maxT) return null;
  }
}

const _cand = [];
export function raycast(o, d, maxT, { terrain = true, mode = 'shoot' } = {}) {
  let best = maxT, hit = null;
  const cand = G.grid.queryRay(o.x, o.z, d.x, d.z, maxT, _cand);
  for (let i = 0; i < cand.length; i++) {
    const b = cand[i];
    if (mode === 'shoot' && b.shoot === false) continue;
    if (mode === 'los' && b.los === false) continue;
    const r = rayBox(o, d, b, best);
    if (r && r.t < best) {
      best = r.t;
      hit = { t: r.t, axis: r.axis, box: b, kind: 'box' };
    }
  }
  if (terrain) {
    const t = terrainRay(o, d, best, mode === 'los' ? 2 : 1);
    if (t !== null && t < best) hit = { t, kind: 'terrain' };
  }
  return hit;
}

export function hasLOS(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.3) return true;
  return !raycast(a, { x: dx / len, y: dy / len, z: dz / len }, len - 0.25, { mode: 'los' });
}

const _q = [];
export function resolveCircle(p, r, feetY, height) {
  let hit = false;
  const cand = G.grid.query(p.x, p.z, r + 1, _q);
  for (let i = 0; i < cand.length; i++) {
    const b = cand[i];
    if (b.move === false) continue;
    if (b.maxY <= feetY + 0.45 || b.minY >= feetY + height) continue;
    const cx = clamp(p.x, b.minX, b.maxX), cz = clamp(p.z, b.minZ, b.maxZ);
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      p.x += (dx / d) * (r - d);
      p.z += (dz / d) * (r - d);
    } else {
      const l = p.x - b.minX, rr = b.maxX - p.x, f = p.z - b.minZ, bk = b.maxZ - p.z;
      const m = Math.min(l, rr, f, bk);
      if (m === l) p.x = b.minX - r;
      else if (m === rr) p.x = b.maxX + r;
      else if (m === f) p.z = b.minZ - r;
      else p.z = b.maxZ + r;
    }
  }
  return hit;
}

export function overlapsCircle(x, z, r, feetY, height) {
  const cand = G.grid.query(x, z, r + 1, _q);
  for (let i = 0; i < cand.length; i++) {
    const b = cand[i];
    if (b.move === false) continue;
    if (b.maxY <= feetY + 0.6 || b.minY >= feetY + height) continue;
    const cx = clamp(x, b.minX, b.maxX), cz = clamp(z, b.minZ, b.maxZ);
    if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
  }
  return false;
}

export function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - c;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : null;
}

export function rayCyl(o, d, cx, cz, r, y0, y1) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return null;
  const b = ox * d.x + oz * d.z;
  const c = ox * ox + oz * oz - r * r;
  const h = b * b - a * c;
  if (h < 0) return null;
  const t = (-b - Math.sqrt(h)) / a;
  if (t < 0) return null;
  const y = o.y + d.y * t;
  return y < y0 || y > y1 ? null : t;
}
