import { catmullRom, smoothstep, lerp, makeNoise2D, fbm, hashString, mulberry32 } from './math.js';
import { trackById, THEMES } from './tracks.js';
import { WATER_LEVEL } from './constants.js';

const SPACING = 2;
const CELL = 24;
const FAR = Object.freeze({ far: true, i: 0, t: 0, dist: Infinity, lat: Infinity, y: -12, w: 1 });
const cache = new Map();

export function getTrack(id) {
  if (!cache.has(id)) cache.set(id, new Track(trackById(id)));
  return cache.get(id);
}

class Track {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.theme = THEMES[def.theme];
    this.themeId = def.theme;
    this.liquid = def.liquid;
    this.water = WATER_LEVEL;
    this.width = def.width;
    this.noise = makeNoise2D(hashString(def.id));
    this._sample();
    this._buildGrid();
    this._buildBaseField();
    this._features();
    this._decor = null;
  }

  _sample() {
    const P = this.def.points;
    const n = P.length;
    const dense = [];
    const SUB = 64;
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n];
      const p1 = P[i];
      const p2 = P[(i + 1) % n];
      const p3 = P[(i + 2) % n];
      const w1 = p1[3] ?? this.def.width;
      const w2 = p2[3] ?? this.def.width;
      for (let j = 0; j < SUB; j++) {
        const t = j / SUB;
        dense.push([
          catmullRom(p0[0], p1[0], p2[0], p3[0], t),
          catmullRom(p0[1], p1[1], p2[1], p3[1], t),
          catmullRom(p0[2], p1[2], p2[2], p3[2], t),
          lerp(w1, w2, t)
        ]);
      }
    }
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1];
      const b = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = cum[dense.length];
    const N = Math.round(total / SPACING);
    this.n = N;
    this.length = total;
    this.spacing = total / N;
    this.xs = new Float32Array(N);
    this.zs = new Float32Array(N);
    this.ys = new Float32Array(N);
    this.ws = new Float32Array(N);
    this.txs = new Float32Array(N);
    this.tzs = new Float32Array(N);
    let seg = 0;
    for (let k = 0; k < N; k++) {
      const target = (k * total) / N;
      while (cum[seg + 1] < target) seg++;
      const a = dense[seg];
      const b = dense[(seg + 1) % dense.length];
      const t = (target - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      this.xs[k] = lerp(a[0], b[0], t);
      this.zs[k] = lerp(a[1], b[1], t);
      this.ys[k] = lerp(a[2], b[2], t);
      this.ws[k] = lerp(a[3], b[3], t);
    }
    this.ramps = [];
    for (const r of this.def.ramps || []) {
      const i0 = Math.round(r.u * N) % N;
      const L = Math.max(2, Math.ceil(r.len / this.spacing));
      for (let j = 0; j <= L; j++) this.ys[(i0 + j) % N] += r.h * (j / L);
      this.ramps.push({ i: i0, len: L, h: r.h });
    }
    for (let k = 0; k < N; k++) {
      const a = (k - 1 + N) % N;
      const b = (k + 1) % N;
      let dx = this.xs[b] - this.xs[a];
      let dz = this.zs[b] - this.zs[a];
      const l = Math.hypot(dx, dz) || 1;
      this.txs[k] = dx / l;
      this.tzs[k] = dz / l;
    }
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, maxY = -Infinity;
    for (let k = 0; k < N; k++) {
      minX = Math.min(minX, this.xs[k]);
      maxX = Math.max(maxX, this.xs[k]);
      minZ = Math.min(minZ, this.zs[k]);
      maxZ = Math.max(maxZ, this.zs[k]);
      maxY = Math.max(maxY, this.ys[k]);
    }
    const m = this.def.terrain.island[1] + 30;
    this.bounds = { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m };
    this.center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
    this.ceiling = maxY + 60;
  }

  _buildGrid() {
    this.grid = new Map();
    for (let i = 0; i < this.n; i++) {
      const j = (i + 1) % this.n;
      const keys = new Set([this._key(this.xs[i], this.zs[i]), this._key(this.xs[j], this.zs[j])]);
      for (const k of keys) {
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(i);
      }
    }
  }

  _buildBaseField() {
    const C = 12;
    const b = this.bounds;
    const W = Math.ceil((b.maxX - b.minX) / C) + 2;
    const H = Math.ceil((b.maxZ - b.minZ) / C) + 2;
    const f = new Float32Array(W * H);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const x = b.minX + i * C;
        const z = b.minZ + j * C;
        let sw = 0;
        let sy = 0;
        for (let k = 0; k < this.n; k += 3) {
          const dx = this.xs[k] - x;
          const dz = this.zs[k] - z;
          const q = dx * dx + dz * dz + 300;
          const w = 1 / (q * q);
          sw += w;
          sy += w * this.ys[k];
        }
        f[j * W + i] = sy / sw;
      }
    }
    this.baseField = { f, W, H, C };
  }

  baseAt(x, z) {
    const { f, W, H, C } = this.baseField;
    const fx = Math.min(W - 1.001, Math.max(0, (x - this.bounds.minX) / C));
    const fz = Math.min(H - 1.001, Math.max(0, (z - this.bounds.minZ) / C));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const a = f[j * W + i];
    const b2 = f[j * W + i + 1];
    const c = f[(j + 1) * W + i];
    const d = f[(j + 1) * W + i + 1];
    return lerp(lerp(a, b2, u), lerp(c, d, u), v);
  }

  _key(x, z) {
    return ((Math.floor(x / CELL) + 2048) << 12) | (Math.floor(z / CELL) + 2048);
  }

  _evalSeg(i, x, z) {
    const N = this.n;
    i = ((i % N) + N) % N;
    const j = (i + 1) % N;
    const px = this.xs[i];
    const pz = this.zs[i];
    let dx = this.xs[j] - px;
    let dz = this.zs[j] - pz;
    const len2 = dx * dx + dz * dz || 1e-6;
    let t = ((x - px) * dx + (z - pz) * dz) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = px + dx * t;
    const cz = pz + dz * t;
    const dist = Math.hypot(x - cx, z - cz);
    const l = Math.sqrt(len2);
    const side = (x - px) * (-dz / l) + (z - pz) * (dx / l);
    return { far: false, i, t, dist, lat: side < 0 ? -dist : dist, y: lerp(this.ys[i], this.ys[j], t), w: lerp(this.ws[i], this.ws[j], t) };
  }

  _scan(x, z, from, count) {
    let best = null;
    for (let k = 0; k < count; k++) {
      const r = this._evalSeg(from + k, x, z);
      if (!best || r.dist < best.dist) best = r;
    }
    return best;
  }

  _gridSearch(x, z, maxR = 6) {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let best = null;
    const seen = new Set();
    for (let r = 0; r <= maxR; r++) {
      for (let gx = cx - r; gx <= cx + r; gx++) {
        for (let gz = cz - r; gz <= cz + r; gz++) {
          if (Math.max(Math.abs(gx - cx), Math.abs(gz - cz)) !== r) continue;
          const list = this.grid.get(((gx + 2048) << 12) | (gz + 2048));
          if (!list) continue;
          for (const i of list) {
            if (seen.has(i)) continue;
            seen.add(i);
            const e = this._evalSeg(i, x, z);
            if (!best || e.dist < best.dist) best = e;
          }
        }
      }
      if (best && best.dist <= r * CELL) return best;
    }
    return best;
  }

  locate(x, z, hint = -1) {
    let best = null;
    if (hint >= 0) best = this._scan(x, z, hint - 8, 26);
    if (!best || best.dist > best.w * 2.2 + 10) {
      const g = this._gridSearch(x, z);
      if (g && (!best || g.dist < best.dist)) best = g;
    }
    return best || FAR;
  }

  natural(x, z, d, roadY) {
    const T = this.def.terrain;
    const coast = (this.noise(x * 0.008 + 50, z * 0.008 - 20) - 0.5) * 40;
    const far = smoothstep(T.island[0], T.island[1], d + coast);
    const hm = smoothstep(this.width + 3, this.width + 45, d);
    const n = fbm(this.noise, x * T.scale, z * T.scale, 4);
    const hill = hm * T.hills * Math.pow(n, 1.5) * 1.8 * (1 - far);
    const base = lerp(roadY, this.baseAt(x, z), smoothstep(this.width + 2, this.width + 40, d));
    return lerp(base + T.base, T.seaFloor, far) + hill;
  }

  groundAt(x, z, nav) {
    if (!nav) nav = this.locate(x, z);
    if (nav.far) return { h: this.def.terrain.seaFloor, surf: 'sand', nav, d: Infinity };
    const w = nav.w;
    const d = Math.abs(nav.lat);
    if (d <= w) return { h: nav.y, surf: 'road', nav, d };
    if (d <= w + 1.6) return { h: nav.y, surf: 'curb', nav, d };
    const nat = this.natural(x, z, d, nav.y);
    const e = smoothstep(w + 1.6, w + 1.6 + this.def.terrain.shoulder, d);
    const h = lerp(nav.y, nat, e);
    let surf;
    if (h < this.water + 0.7) surf = this.themeId === 'snow' ? 'snow' : 'sand';
    else if (this.themeId === 'snow') surf = 'snow';
    else if (this.themeId === 'volcano') surf = 'rock';
    else surf = 'grass';
    return { h, surf, nav, d };
  }

  heightAt(x, z) {
    return this.groundAt(x, z).h;
  }

  gradient(x, z) {
    const e = 0.6;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return { gx: hx / (2 * e), gz: hz / (2 * e) };
  }

  idx(i) {
    const N = this.n;
    return ((Math.round(i) % N) + N) % N;
  }

  pointAt(i, lat = 0) {
    i = this.idx(i);
    const tx = this.txs[i];
    const tz = this.tzs[i];
    return { x: this.xs[i] - tz * lat, y: this.ys[i], z: this.zs[i] + tx * lat, yaw: Math.atan2(tx, tz) };
  }

  yawAt(i) {
    i = this.idx(i);
    return Math.atan2(this.txs[i], this.tzs[i]);
  }

  curvatureAhead(i, span = 20) {
    const a = this.yawAt(i);
    const b = this.yawAt(i + span);
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  spawnSlot(k) {
    const row = Math.floor(k / 2);
    const side = k % 2 === 0 ? -1 : 1;
    const i = this.idx(this.n - 6 - row * 5);
    const lat = side * this.ws[i] * 0.4;
    const p = this.pointAt(i, lat);
    return { x: p.x, y: p.y + 0.2, z: p.z, yaw: p.yaw, i };
  }

  _features() {
    const N = this.n;
    const def = this.def;
    this.pads = (def.pads || []).map((p, k) => {
      const i = this.idx(p.u * N);
      const lat = p.lat * this.ws[i];
      const pt = this.pointAt(i + 2, lat);
      return { id: k, i, len: 4, lat, x: pt.x, y: this.ys[this.idx(i + 2)], z: pt.z, yaw: pt.yaw };
    });
    let bid = 0;
    this.balloons = [];
    for (const g of def.balloons || []) {
      const i = this.idx(g.u * N);
      const lats = g.colors.length === 1 ? [0] : g.colors.map((_, k) => (k / (g.colors.length - 1) - 0.5) * 1.15);
      g.colors.forEach((color, k) => {
        const lat = lats[k] * this.ws[i];
        const pt = this.pointAt(i, lat);
        this.balloons.push({ id: 'b' + bid++, color, i, lat: lats[k], x: pt.x, y: this.ys[i] + 1.9, z: pt.z });
      });
    }
    let cid = 0;
    this.coins = [];
    for (const c of def.coins || []) {
      const i0 = this.idx(c.u * N);
      for (let k = 0; k < c.n; k++) {
        const i = this.idx(i0 + k * 3);
        const pt = this.pointAt(i, c.lat * this.ws[i]);
        this.coins.push({ id: 'c' + cid++, i, x: pt.x, y: this.ys[i] + 1.1, z: pt.z });
      }
    }
    this.rings = (def.rings || []).map((r, k) => {
      const i = this.idx(r.u * N);
      const pt = this.pointAt(i, r.lat * this.ws[i]);
      return { id: k, i, x: pt.x, y: this.ys[i] + r.h, z: pt.z, yaw: pt.yaw, r: 6 };
    });
  }

  getDecor() {
    if (this._decor) return this._decor;
    const rnd = mulberry32(hashString(this.id + ':decor'));
    const out = [];
    const b = this.bounds;
    for (const [type, count] of Object.entries(this.def.decor || {})) {
      let placed = 0;
      let tries = 0;
      while (placed < count && tries < count * 40) {
        tries++;
        const x = b.minX + rnd() * (b.maxX - b.minX);
        const z = b.minZ + rnd() * (b.maxZ - b.minZ);
        const g = this.groundAt(x, z);
        if (g.d < this.width + (type === 'lily' ? 4 : 8)) continue;
        if (type === 'lily') {
          if (g.h > this.water - 0.6 || this.liquid !== 'water') continue;
          out.push({ type, x, y: this.water + 0.03, z, s: 0.8 + rnd() * 0.8, r: rnd() * Math.PI * 2 });
          placed++;
          continue;
        }
        if (g.h < this.water + 0.5) continue;
        if (type === 'palm' && g.d > this.width + 70) continue;
        if (type === 'pine' && g.d > this.width + 90) continue;
        out.push({ type, x, y: g.h, z, s: 0.7 + rnd() * 0.8, r: rnd() * Math.PI * 2 });
        placed++;
      }
    }
    this._decor = out;
    return out;
  }
}
