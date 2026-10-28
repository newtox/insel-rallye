import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createBalloon, createCoin, mat } from './models.js';
import { fbm, mulberry32, hashString, clamp, smoothstep } from '../../../shared/math.js';

function hex(c) {
  return '#' + c.toString(16).padStart(6, '0');
}

function colored(geo, color) {
  geo = geo.index ? geo.toNonIndexed() : geo.clone();
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}

function part(geo, color, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0 } = {}) {
  const g = colored(geo, color);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  return g;
}

function decorGeometry(type, theme) {
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 7);
  const cone = new THREE.ConeGeometry(1, 1, 7);
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const dode = new THREE.DodecahedronGeometry(1, 0);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sph = new THREE.SphereGeometry(1, 8, 6);
  const parts = [];
  switch (type) {
    case 'palm': {
      let x = 0;
      for (let i = 0; i < 5; i++) {
        parts.push(part(cyl, i % 2 ? 0x9c6b3c : 0x8a5a30, { x, y: 1 + i * 1.9, sx: 0.42 - i * 0.04, sy: 2, sz: 0.42 - i * 0.04, rz: -0.06 }));
        x += 0.12;
      }
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        parts.push(part(cone, k % 2 ? 0x2f9e44 : 0x3fbf55, { x: x + Math.cos(a) * 1.6, y: 9.6, z: Math.sin(a) * 1.6, sx: 0.9, sy: 3.4, sz: 0.25, rz: Math.cos(a) * 1.9, rx: -Math.sin(a) * 1.9, ry: 0 }));
      }
      parts.push(part(sph, 0x6b4a2a, { x: x + 0.3, y: 9.2, sx: 0.35, sy: 0.35, sz: 0.35 }));
      break;
    }
    case 'pine':
      parts.push(part(cyl, 0x6b4a2a, { y: 1, sx: 0.4, sy: 2, sz: 0.4 }));
      for (let i = 0; i < 3; i++) {
        parts.push(part(cone, 0x1f6b45, { y: 3 + i * 2.1, sx: 3 - i * 0.8, sy: 3, sz: 3 - i * 0.8 }));
        parts.push(part(cone, 0xffffff, { y: 3.9 + i * 2.1, sx: 1.6 - i * 0.4, sy: 1.2, sz: 1.6 - i * 0.4 }));
      }
      break;
    case 'rock':
      parts.push(part(dode, theme.rock, { y: 0.6, sx: 2.2, sy: 1.5, sz: 1.8 }));
      parts.push(part(dode, theme.rock, { x: 1.5, y: 0.3, z: 0.6, sx: 1.1, sy: 0.9, sz: 1.0 }));
      break;
    case 'bush':
      parts.push(part(ico, 0x2f9e44, { y: 0.8, sx: 1.8, sy: 1.3, sz: 1.6 }));
      parts.push(part(ico, 0x3fbf55, { x: 1, y: 0.6, z: 0.4, sx: 1.2, sy: 1, sz: 1.1 }));
      parts.push(part(sph, 0xff5d8f, { x: 0.4, y: 1.9, z: 0.8, sx: 0.22, sy: 0.22, sz: 0.22 }));
      break;
    case 'deadtree':
      parts.push(part(cyl, 0x2b2220, { y: 2.5, sx: 0.35, sy: 5, sz: 0.35 }));
      parts.push(part(cyl, 0x2b2220, { x: 0.9, y: 4.2, sx: 0.18, sy: 2.2, sz: 0.18, rz: -0.8 }));
      parts.push(part(cyl, 0x2b2220, { x: -0.7, y: 3.4, sx: 0.16, sy: 1.8, sz: 0.16, rz: 0.9 }));
      break;
    case 'crystal':
      parts.push(part(new THREE.OctahedronGeometry(1, 0), 0xff7a3d, { y: 1.8, sx: 0.9, sy: 2.4, sz: 0.9 }));
      parts.push(part(new THREE.OctahedronGeometry(1, 0), 0xffb703, { x: 0.9, y: 1, sx: 0.5, sy: 1.4, sz: 0.5, rz: -0.4 }));
      break;
    case 'lily':
      parts.push(part(cyl, 0x3fa34d, { sx: 1.2, sy: 0.06, sz: 1.2 }));
      parts.push(part(sph, 0xff8fc0, { x: 0.3, y: 0.2, sx: 0.3, sy: 0.25, sz: 0.3 }));
      break;
    case 'snowman':
      parts.push(part(sph, 0xffffff, { y: 1.1, sx: 1.2, sy: 1.1, sz: 1.2 }));
      parts.push(part(sph, 0xffffff, { y: 2.6, sx: 0.85, sy: 0.8, sz: 0.85 }));
      parts.push(part(sph, 0xffffff, { y: 3.7, sx: 0.6, sy: 0.6, sz: 0.6 }));
      parts.push(part(cone, 0xff7a1a, { y: 3.7, z: 0.75, sx: 0.12, sy: 0.6, sz: 0.12, rx: Math.PI / 2 }));
      parts.push(part(cyl, 0x222222, { y: 4.4, sx: 0.45, sy: 0.6, sz: 0.45 }));
      break;
    case 'pillar':
      parts.push(part(box, 0xc9a27a, { y: 0.3, sx: 2.4, sy: 0.6, sz: 2.4 }));
      parts.push(part(cyl, 0xe0c49a, { y: 4.5, sx: 0.85, sy: 8, sz: 0.85 }));
      parts.push(part(box, 0xc9a27a, { y: 8.8, sx: 2.2, sy: 0.6, sz: 2.2 }));
      break;
    case 'ruin':
      parts.push(part(box, 0xc9a27a, { y: 2, sx: 6, sy: 4, sz: 1.2 }));
      parts.push(part(box, 0xb48a6a, { x: -2, y: 4.8, sx: 2, sy: 1.6, sz: 1.2 }));
      parts.push(part(box, 0xc9a27a, { x: 3.4, y: 1.2, z: 2, sx: 1.2, sy: 2.4, sz: 4 }));
      parts.push(part(box, 0x6a9a44, { x: 0, y: 4.05, sx: 6.2, sy: 0.2, sz: 1.4 }));
      break;
    default:
      parts.push(part(ico, 0xff00ff, {}));
  }
  return mergeGeometries(parts);
}

function makeTexture(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 4;
  return t;
}

function roadTexture(theme, themeId) {
  return makeTexture(128, 256, (x, w, h) => {
    x.fillStyle = hex(theme.road);
    x.fillRect(0, 0, w, h);
    const rnd = mulberry32(5);
    for (let i = 0; i < 1400; i++) {
      x.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + rnd() * 0.06})`;
      x.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    x.fillStyle = hex(theme.roadLine);
    if (themeId === 'lagoon' || themeId === 'temple') {
      x.globalAlpha = 0.35;
      for (let i = 0; i < 8; i++) x.fillRect(0, i * 32, w, 3);
      x.globalAlpha = 1;
    } else {
      x.fillRect(5, 0, 4, h);
      x.fillRect(w - 9, 0, 4, h);
      x.fillRect(w / 2 - 2, 20, 4, 90);
      x.fillRect(w / 2 - 2, 148, 4, 90);
    }
  });
}

export function buildWorld(track) {
  const theme = track.theme;
  const group = new THREE.Group();
  const rnd = mulberry32(hashString(track.id + ':world'));
  const b = track.bounds;
  const res = 3.2;
  const W = Math.ceil((b.maxX - b.minX) / res) + 1;
  const H = Math.ceil((b.maxZ - b.minZ) / res) + 1;
  const pos = new Float32Array(W * H * 3);
  const col = new Float32Array(W * H * 3);
  const cGrass = new THREE.Color(theme.grass);
  const cGrass2 = new THREE.Color(theme.grass2);
  const cSand = new THREE.Color(theme.sand);
  const cRock = new THREE.Color(theme.rock);
  const cHigh = new THREE.Color(theme.high);
  const tmp = new THREE.Color();
  const heights = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = b.minX + i * res;
      const z = b.minZ + j * res;
      const g = track.groundAt(x, z);
      let h = g.h;
      if (g.d < g.nav.w + 1.8) h -= 0.4;
      heights[j * W + i] = h;
      const k = (j * W + i) * 3;
      pos[k] = x;
      pos[k + 1] = h;
      pos[k + 2] = z;
    }
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const idx = j * W + i;
      const h = heights[idx];
      const hx = heights[j * W + Math.min(W - 1, i + 1)] - heights[j * W + Math.max(0, i - 1)];
      const hz = heights[Math.min(H - 1, j + 1) * W + i] - heights[Math.max(0, j - 1) * W + i];
      const slope = Math.hypot(hx, hz) / (2 * res);
      const x = pos[idx * 3];
      const z = pos[idx * 3 + 2];
      const n = fbm(track.noise, x * 0.05, z * 0.05, 2);
      tmp.copy(cGrass).lerp(cGrass2, smoothstep(0.35, 0.65, n));
      const sandAmt = 1 - smoothstep(track.water + 0.4, track.water + 1.8, h);
      tmp.lerp(cSand, sandAmt);
      tmp.lerp(cRock, smoothstep(0.55, 1.1, slope) * 0.9);
      tmp.lerp(cHigh, smoothstep(26, 40, h));
      if (h < track.water - 0.5) tmp.lerp(cSand, 0.6).multiplyScalar(0.85);
      col[idx * 3] = tmp.r;
      col[idx * 3 + 1] = tmp.g;
      col[idx * 3 + 2] = tmp.b;
    }
  }
  const idxArr = [];
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const a = j * W + i;
      const b2 = a + 1;
      const c = a + W;
      const d = c + 1;
      if ((i + j) % 2) idxArr.push(a, c, b2, b2, c, d);
      else idxArr.push(a, c, d, a, d, b2);
    }
  }
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tgeo.setIndex(idxArr);
  tgeo.computeVertexNormals();
  const terrain = new THREE.Mesh(tgeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  group.add(terrain);

  const N = track.n;
  const rp = [];
  const ruv = [];
  const cp = [];
  const cuv = [];
  const ri = [];
  let vacc = 0;
  for (let k = 0; k <= N; k++) {
    const i = k % N;
    const x = track.xs[i];
    const z = track.zs[i];
    const y = track.ys[i] + 0.06;
    const w = track.ws[i];
    const rx = -track.tzs[i];
    const rz = track.txs[i];
    rp.push(x - rx * w, y, z - rz * w, x + rx * w, y, z + rz * w);
    ruv.push(0, vacc, 1, vacc);
    const w2 = w + 1.6;
    cp.push(x - rx * w2, y - 0.02, z - rz * w2, x - rx * w, y + 0.03, z - rz * w, x + rx * w, y + 0.03, z + rz * w, x + rx * w2, y - 0.02, z + rz * w2);
    cuv.push(0, vacc / 3, 1, vacc / 3, 0, vacc / 3, 1, vacc / 3);
    if (k < N) {
      const a = k * 2;
      ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    vacc += track.spacing / 16;
  }
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rgeo.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
  rgeo.setIndex(ri);
  rgeo.computeVertexNormals();
  const roadTex = roadTexture(theme, track.themeId);
  const road = new THREE.Mesh(rgeo, new THREE.MeshLambertMaterial({ map: roadTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  group.add(road);
  const ci = [];
  for (let k = 0; k < N; k++) {
    const a = k * 4;
    ci.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
    ci.push(a + 2, a + 3, a + 6, a + 3, a + 7, a + 6);
  }
  const cgeo = new THREE.BufferGeometry();
  cgeo.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
  cgeo.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2));
  cgeo.setIndex(ci);
  cgeo.computeVertexNormals();
  const curbTex = makeTexture(8, 32, (x, w, h) => {
    x.fillStyle = hex(theme.curbA);
    x.fillRect(0, 0, w, h / 2);
    x.fillStyle = hex(theme.curbB);
    x.fillRect(0, h / 2, w, h / 2);
  });
  curbTex.magFilter = THREE.NearestFilter;
  const curbs = new THREE.Mesh(cgeo, new THREE.MeshLambertMaterial({ map: curbTex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  group.add(curbs);

  for (const r of track.ramps) {
    const top = track.idx(r.i + r.len);
    const p = track.pointAt(top, 0);
    const w = track.ws[top];
    const face = new THREE.Mesh(new THREE.BoxGeometry(w * 2, r.h, 0.6), mat(0xffd23f));
    const yaw = track.yawAt(top);
    face.position.set(p.x + Math.sin(yaw) * 0.4, track.ys[top] - r.h / 2 + 0.05, p.z + Math.cos(yaw) * 0.4);
    face.rotation.y = yaw;
    group.add(face);
    const stripes = makeTexture(64, 16, (x, w2, h2) => {
      for (let i = 0; i < 8; i++) {
        x.fillStyle = i % 2 ? '#ffd23f' : '#12305a';
        x.beginPath();
        x.moveTo(i * 8, 0);
        x.lineTo(i * 8 + 8, 0);
        x.lineTo(i * 8, h2);
        x.lineTo(i * 8 - 8, h2);
        x.fill();
      }
    });
    stripes.repeat.set(3, 1);
    const ri0 = track.idx(r.i + r.len - 3);
    const pp = track.pointAt(ri0, 0);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, 1.4), new THREE.MeshLambertMaterial({ map: stripes, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    const slope = Math.atan2(r.h, r.len);
    strip.position.set(pp.x, (track.ys[ri0] + track.ys[top]) / 2 + 0.14, pp.z);
    strip.rotation.order = 'YXZ';
    strip.rotation.y = yaw;
    strip.rotation.x = -Math.PI / 2 - slope;
    group.add(strip);
  }

  const startP = track.pointAt(0, 0);
  const startYaw = track.yawAt(0);
  const checker = makeTexture(64, 16, (x, w, h) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) {
      x.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      x.fillRect(i * 4, j * 4, 4, 4);
    }
  });
  checker.magFilter = THREE.NearestFilter;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(track.ws[0] * 2, 2.5), new THREE.MeshLambertMaterial({ map: checker, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  line.rotation.order = 'YXZ';
  line.rotation.y = startYaw;
  line.rotation.x = -Math.PI / 2;
  line.position.set(startP.x, track.ys[0] + 0.1, startP.z);
  group.add(line);
  const arch = new THREE.Group();
  const aw = track.ws[0] + 2.6;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 9, 10), mat(0xffd23f));
    post.position.set(s * aw, 4.5, 0);
    arch.add(post);
  }
  const bannerTex = makeTexture(512, 64, (x, w, h) => {
    x.fillStyle = '#ff5d5d';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff4d6';
    x.font = '900 40px "Trebuchet MS", "Segoe UI", sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('INSEL RALLYE  ★  START / ZIEL  ★  INSEL RALLYE', w / 2, h / 2 + 2);
  }, false);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(aw * 2 + 1.5, 1.8, 0.4), [mat(0xff5d5d), mat(0xff5d5d), mat(0xff5d5d), mat(0xff5d5d), new THREE.MeshLambertMaterial({ map: bannerTex }), new THREE.MeshLambertMaterial({ map: bannerTex })]);
  banner.position.y = 9;
  arch.add(banner);
  arch.position.set(startP.x, track.ys[0], startP.z);
  arch.rotation.y = startYaw;
  group.add(arch);

  const flagTex = makeTexture(32, 20, (x) => {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) {
      x.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      x.fillRect(i * 4, j * 4, 4, 4);
    }
  }, false);
  flagTex.magFilter = THREE.NearestFilter;
  const flagMat = new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide });
  const poleGeo = new THREE.CylinderGeometry(0.16, 0.2, 7, 6);
  const flagGeo = new THREE.PlaneGeometry(3, 1.9, 4, 1);
  flagGeo.translate(1.5, 0, 0);
  const flags = [];
  for (const g of track.gates) {
    if (g.k === 0) continue;
    for (const side of [-1, 1]) {
      const p = track.pointAt(g.i, side * (g.w + 4));
      const pole = new THREE.Mesh(poleGeo, mat(0xffffff));
      const gh = track.heightAt(p.x, p.z);
      pole.position.set(p.x, gh + 3.5, p.z);
      group.add(pole);
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(p.x, gh + 6, p.z);
      flag.rotation.y = g.yaw + (side > 0 ? 0 : Math.PI);
      flag.userData.phase = g.k * 0.7 + side;
      group.add(flag);
      flags.push(flag);
    }
  }

  const padTex = makeTexture(64, 64, (x, w, h) => {
    x.fillStyle = '#ff8a00';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffe14d';
    for (let k = 0; k < 2; k++) {
      x.beginPath();
      x.moveTo(8, 22 + k * 32);
      x.lineTo(32, 6 + k * 32);
      x.lineTo(56, 22 + k * 32);
      x.lineTo(56, 32 + k * 32);
      x.lineTo(32, 16 + k * 32);
      x.lineTo(8, 32 + k * 32);
      x.fill();
    }
  });
  padTex.repeat.set(1, 2);
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  for (const p of track.pads) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 9), padMat);
    m.rotation.order = 'YXZ';
    m.rotation.y = p.yaw + Math.PI;
    m.rotation.x = -Math.PI / 2;
    const i2 = track.idx(p.i + 2);
    const slope = Math.atan2(track.ys[track.idx(i2 + 1)] - track.ys[track.idx(i2 - 1)], 2 * track.spacing);
    m.rotation.x -= -slope;
    m.position.set(p.x, p.y + 0.12, p.z);
    group.add(m);
  }

  const rings = [];
  for (const r of track.rings) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r.r - 0.5, 0.45, 8, 28), mat(0xffd23f, { emissive: 0xffa000, emissiveIntensity: 0.4 }));
    m.position.set(r.x, r.y, r.z);
    m.rotation.y = r.yaw;
    group.add(m);
    rings.push(m);
  }

  const balloons = new Map();
  for (const bl of track.balloons) {
    const m = createBalloon(bl.color);
    m.position.set(bl.x, bl.y, bl.z);
    m.userData.baseY = bl.y;
    m.userData.phase = rnd() * 6;
    group.add(m);
    balloons.set(bl.id, m);
  }
  const coins = new Map();
  for (const c of track.coins) {
    const m = createCoin();
    m.position.set(c.x, c.y, c.z);
    m.userData.phase = rnd() * 6;
    group.add(m);
    coins.set(c.id, m);
  }

  const decor = track.getDecor();
  const byType = new Map();
  for (const d of decor) {
    if (!byType.has(d.type)) byType.set(d.type, []);
    byType.get(d.type).push(d);
  }
  const dmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3();
  const pv = new THREE.Vector3();
  for (const [type, list] of byType) {
    const geo = decorGeometry(type, theme);
    const inst = new THREE.InstancedMesh(geo, dmat, list.length);
    list.forEach((d, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.r);
      sv.setScalar(d.s);
      pv.set(d.x, d.y - 0.2, d.z);
      m4.compose(pv, q, sv);
      inst.setMatrixAt(i, m4);
    });
    group.add(inst);
  }

  const liquidColor = theme.liquid;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 1.15;
  const wseg = 70;
  const wgeo = new THREE.PlaneGeometry(span, span, wseg, wseg);
  wgeo.rotateX(-Math.PI / 2);
  const isLava = track.liquid === 'lava';
  const isIce = track.liquid === 'ice';
  const wmat = new THREE.MeshLambertMaterial({
    color: liquidColor, flatShading: true, transparent: !isLava, opacity: isIce ? 0.92 : 0.82,
    emissive: isLava ? 0xff3b00 : 0x000000, emissiveIntensity: isLava ? 0.7 : 0
  });
  const water = new THREE.Mesh(wgeo, wmat);
  water.position.set(track.center.x, track.water, track.center.z);
  group.add(water);
  const base = wgeo.attributes.position.array.slice();
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ color: theme.liquidDeep, emissive: isLava ? 0x801800 : 0 }));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(track.center.x, track.water - 0.6, track.center.z);
  group.add(ocean);

  const skyGeo = new THREE.SphereGeometry(2600, 24, 16);
  const sc = [];
  const top = new THREE.Color(theme.skyTop);
  const bot = new THREE.Color(theme.skyBottom);
  const sp = skyGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const t = clamp(sp.getY(i) / 2600, 0, 1);
    tmp.copy(bot).lerp(top, Math.pow(t, 0.6));
    sc.push(tmp.r, tmp.g, tmp.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  group.add(sky);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(80, 24), new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false, transparent: true, opacity: 0.9 }));
  sun.position.set(track.center.x + 900, 900, track.center.z - 1600);
  sun.lookAt(track.center.x, 0, track.center.z);
  group.add(sun);

  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x666666, fog: false });
  const cgeoParts = [];
  for (let k = 0; k < 5; k++) cgeoParts.push(part(new THREE.IcosahedronGeometry(1, 1), 0xffffff, { x: k * 9 - 18, y: Math.sin(k) * 3, z: rnd() * 6, sx: 10 - Math.abs(k - 2) * 2, sy: 7 - Math.abs(k - 2) * 1.5, sz: 8 }));
  const cloudGeo = mergeGeometries(cgeoParts);
  for (let k = 0; k < 18; k++) {
    const c = new THREE.Mesh(cloudGeo, cloudMat);
    const a = rnd() * Math.PI * 2;
    const r = 500 + rnd() * 900;
    c.position.set(track.center.x + Math.cos(a) * r, 150 + rnd() * 160, track.center.z + Math.sin(a) * r);
    c.scale.setScalar(1 + rnd() * 1.6);
    c.rotation.y = rnd() * 6;
    clouds.add(c);
  }
  group.add(clouds);

  const pathPts = [];
  for (let i = 0; i < N; i += 4) pathPts.push([track.xs[i], track.zs[i]]);

  function update(t) {
    const arr = wgeo.attributes.position.array;
    const amp = isIce ? 0 : isLava ? 0.25 : 0.18;
    if (amp > 0) {
      for (let i = 0; i < arr.length; i += 3) {
        const x = base[i];
        const z = base[i + 2];
        arr[i + 1] = Math.sin(x * 0.08 + t * 1.3) * amp + Math.cos(z * 0.07 + t * 1.1) * amp;
      }
      wgeo.attributes.position.needsUpdate = true;
      wgeo.computeVertexNormals();
    }
    for (const m of balloons.values()) {
      if (!m.visible) continue;
      m.position.y = m.userData.baseY + Math.sin(t * 2 + m.userData.phase) * 0.3;
      m.rotation.y = t * 0.8 + m.userData.phase;
    }
    for (const m of coins.values()) if (m.visible) m.rotation.y = t * 3 + m.userData.phase;
    for (const r of rings) r.rotation.z = t * 0.6;
    for (const f of flags) f.rotation.z = Math.sin(t * 4 + f.userData.phase) * 0.12;
    padTex.offset.y = -t * 1.5;
    clouds.rotation.y = t * 0.004;
    if (isLava) wmat.emissiveIntensity = 0.6 + Math.sin(t * 2) * 0.12;
  }

  return { group, balloons, coins, update, theme, pathPts, rings };
}
