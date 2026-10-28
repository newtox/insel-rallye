import * as THREE from 'three';
import { characterById, ITEMS } from '../../../shared/constants.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  return matCache.get(key);
}

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

const G = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  sphereLo: new THREE.SphereGeometry(1, 8, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 10),
  torus: new THREE.TorusGeometry(1, 0.12, 8, 24)
};

function scaled(geo, material, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = mesh(geo, material, x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}

export function createHead(ch) {
  const head = new THREE.Group();
  const skin = mat(ch.color);
  const acc = mat(ch.accent);
  const white = mat(0xffffff);
  const black = mat(0x111111);
  head.add(scaled(G.sphere, skin, 0.62, 0.58, 0.6));
  const eyeY = ch.face === 'frog' ? 0.42 : 0.12;
  const eyeZ = ch.face === 'frog' ? 0.3 : 0.5;
  const eyeR = ch.face === 'frog' ? 0.22 : 0.16;
  for (const s of [-1, 1]) {
    if (ch.face === 'frog') head.add(scaled(G.sphere, skin, 0.26, 0.26, 0.26, s * 0.25, 0.4, 0.28));
    head.add(scaled(G.sphere, white, eyeR, eyeR * 1.15, eyeR * 0.8, s * 0.22, eyeY, eyeZ));
    head.add(scaled(G.sphereLo, black, eyeR * 0.5, eyeR * 0.6, eyeR * 0.4, s * 0.22, eyeY + 0.01, eyeZ + eyeR * 0.6));
  }
  if (ch.face === 'mask') {
    head.add(scaled(G.sphere, acc, 0.5, 0.17, 0.3, 0, 0.12, 0.38));
    for (const s of [-1, 1]) {
      head.add(scaled(G.sphere, white, 0.15, 0.17, 0.12, s * 0.22, 0.12, 0.6));
      head.add(scaled(G.sphereLo, black, 0.075, 0.09, 0.06, s * 0.22, 0.13, 0.7));
    }
    head.add(scaled(G.sphere, mat(0xd8dce3), 0.26, 0.2, 0.3, 0, -0.14, 0.45));
    head.add(scaled(G.sphereLo, black, 0.08, 0.07, 0.07, 0, -0.08, 0.72));
  }
  if (ch.face === 'panda') {
    for (const s of [-1, 1]) head.add(scaled(G.sphere, acc, 0.2, 0.24, 0.12, s * 0.22, 0.1, 0.46));
    for (const s of [-1, 1]) {
      head.add(scaled(G.sphere, white, 0.11, 0.13, 0.08, s * 0.22, 0.12, 0.56));
      head.add(scaled(G.sphereLo, black, 0.06, 0.07, 0.05, s * 0.22, 0.12, 0.63));
    }
    head.add(scaled(G.sphereLo, black, 0.09, 0.07, 0.07, 0, -0.12, 0.6));
  }
  if (ch.face === 'snout' || ch.face === 'cat' || ch.face === 'bunny') {
    const len = ch.face === 'snout' ? 0.42 : 0.22;
    head.add(scaled(G.sphere, acc, 0.24, 0.2, len, 0, -0.16, 0.42));
    head.add(scaled(G.sphereLo, ch.face === 'bunny' ? mat(0xff7aa8) : black, 0.08, 0.07, 0.07, 0, -0.1, 0.42 + len * 0.95));
  }
  if (ch.face === 'beak') {
    const beak = scaled(G.cone, mat(0xffa21f), 0.16, 0.4, 0.16, 0, -0.1, 0.68);
    beak.rotation.x = Math.PI / 2;
    head.add(beak);
    head.add(scaled(G.sphere, acc, 0.45, 0.42, 0.25, 0, -0.08, 0.38));
    for (const s of [-1, 1]) {
      head.add(scaled(G.sphere, white, 0.13, 0.15, 0.1, s * 0.2, 0.1, 0.56));
      head.add(scaled(G.sphereLo, black, 0.065, 0.075, 0.05, s * 0.2, 0.11, 0.64));
    }
  }
  if (ch.face === 'frog') {
    head.add(scaled(G.sphere, mat(0xd2455a), 0.32, 0.05, 0.2, 0, -0.18, 0.5));
  }
  if (ch.ears === 'round') {
    for (const s of [-1, 1]) head.add(scaled(G.sphere, ch.face === 'panda' ? acc : skin, 0.22, 0.22, 0.12, s * 0.44, 0.46, -0.05));
  }
  if (ch.ears === 'pointy') {
    for (const s of [-1, 1]) {
      const e = scaled(G.cone, skin, 0.2, 0.42, 0.12, s * 0.36, 0.62, -0.05);
      e.rotation.z = -s * 0.35;
      head.add(e);
      const inner = scaled(G.cone, acc, 0.11, 0.26, 0.05, s * 0.355, 0.6, 0.02);
      inner.rotation.z = -s * 0.35;
      head.add(inner);
    }
  }
  if (ch.ears === 'long') {
    for (const s of [-1, 1]) {
      const e = scaled(G.sphere, skin, 0.13, 0.55, 0.09, s * 0.2, 0.95, -0.08);
      e.rotation.z = -s * 0.18;
      head.add(e);
      const inner = scaled(G.sphere, mat(0xff9cc2), 0.07, 0.42, 0.05, s * 0.2, 0.95, -0.01);
      inner.rotation.z = -s * 0.18;
      head.add(inner);
    }
  }
  return head;
}

export function createDriver(ch) {
  const d = new THREE.Group();
  d.add(scaled(G.cyl, mat(ch.accent === 0xffffff || ch.accent === 0xf8fafc ? ch.color : ch.accent), 0.42, 0.75, 0.38, 0, 0, 0));
  for (const s of [-1, 1]) {
    const arm = scaled(G.cyl, mat(ch.color), 0.12, 0.6, 0.12, s * 0.45, 0.05, 0.3);
    arm.rotation.x = 1.2;
    d.add(arm);
  }
  const head = createHead(ch);
  head.position.set(0, 0.85, 0.05);
  d.add(head);
  d.userData.head = head;
  return d;
}

function wheel(r = 0.45, w = 0.42) {
  const g = new THREE.Group();
  const t = scaled(G.cyl, mat(0x1e1e24), r, w, r);
  t.rotation.z = Math.PI / 2;
  g.add(t);
  const hub = scaled(G.cylLo, mat(0xd8d8d8), r * 0.45, w + 0.04, r * 0.45);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  return g;
}

function flames(parent, positions) {
  const list = [];
  for (const [x, y, z] of positions) {
    const f = scaled(G.cone, mat(0xffa21f, { emissive: 0xff6a00, transparent: true, opacity: 0.9 }), 0.22, 1, 0.22, x, y, z);
    f.rotation.x = -Math.PI / 2;
    f.visible = false;
    parent.add(f);
    list.push(f);
  }
  return list;
}

export function createKartModel(characterId, vehicle) {
  const ch = characterById(characterId);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const col = mat(ch.kart);
  const dark = mat(0x2a2a33);
  const parts = { wheels: [], front: [], spin: [], flames: [] };
  if (vehicle === 'plane') {
    const fus = scaled(G.cyl, col, 0.55, 3.6, 0.55, 0, 1.05, 0);
    fus.rotation.x = Math.PI / 2;
    body.add(fus);
    const nose = scaled(G.cone, mat(0xf1f1f1), 0.55, 0.7, 0.55, 0, 1.05, 2.15);
    nose.rotation.x = Math.PI / 2;
    body.add(nose);
    const tail = scaled(G.cone, col, 0.55, 1.1, 0.55, 0, 1.05, -2.3);
    tail.rotation.x = -Math.PI / 2;
    body.add(tail);
    body.add(scaled(G.box, mat(0xffffff), 5.6, 0.12, 1.1, 0, 0.75, 0.6));
    body.add(scaled(G.box, col, 5.2, 0.12, 1.0, 0, 2.0, 0.7));
    for (const s of [-1, 1]) body.add(scaled(G.box, dark, 0.08, 1.2, 0.08, s * 2.1, 1.38, 0.7));
    body.add(scaled(G.box, mat(0xffffff), 2.2, 0.1, 0.7, 0, 1.15, -2.55));
    body.add(scaled(G.box, col, 0.1, 0.9, 0.7, 0, 1.55, -2.55));
    const prop = new THREE.Group();
    prop.position.set(0, 1.05, 2.55);
    prop.add(scaled(G.box, dark, 2.4, 0.22, 0.06));
    prop.add(scaled(G.box, dark, 0.22, 2.4, 0.06));
    body.add(prop);
    parts.spin.push({ obj: prop, axis: 'z', rate: 40 });
    for (const s of [-1, 1]) {
      const w = wheel(0.3, 0.2);
      w.position.set(s * 0.8, 0.3, 0.9);
      body.add(w);
      parts.wheels.push(w);
      body.add(scaled(G.box, dark, 0.06, 0.6, 0.06, s * 0.7, 0.55, 0.9));
    }
    parts.flames = flames(body, [[0, 1.05, -3.1]]);
    const drv = createDriver(ch);
    drv.position.set(0, 1.6, -0.2);
    drv.scale.setScalar(0.9);
    body.add(drv);
    parts.driver = drv;
  } else if (vehicle === 'hover') {
    body.add(scaled(G.sphere, col, 1.25, 0.5, 1.85, 0, 0.85, 0));
    const skirt = scaled(G.cyl, dark, 1.35, 0.4, 1.35, 0, 0.45, 0);
    skirt.scale.z = 1.95;
    body.add(skirt);
    body.add(scaled(G.box, mat(0xffffff), 1.6, 0.1, 0.5, 0, 1.15, 1.2));
    const ring = scaled(G.torus, dark, 0.75, 0.75, 0.75, 0, 1.55, -1.75);
    body.add(ring);
    const fan = new THREE.Group();
    fan.position.set(0, 1.55, -1.75);
    fan.add(scaled(G.box, mat(0xd8d8d8), 1.3, 0.18, 0.05));
    fan.add(scaled(G.box, mat(0xd8d8d8), 0.18, 1.3, 0.05));
    body.add(fan);
    parts.spin.push({ obj: fan, axis: 'z', rate: 30 });
    for (const s of [-1, 1]) body.add(scaled(G.box, dark, 0.1, 0.9, 0.1, s * 0.7, 1.2, -1.6));
    parts.flames = flames(body, [[-0.5, 0.9, -2.0], [0.5, 0.9, -2.0]]);
    const drv = createDriver(ch);
    drv.position.set(0, 1.5, -0.2);
    body.add(drv);
    parts.driver = drv;
  } else {
    body.add(scaled(G.box, col, 2.0, 0.5, 2.9, 0, 0.6, 0));
    body.add(scaled(G.box, col, 1.5, 0.38, 1.0, 0, 0.55, 1.75));
    body.add(scaled(G.box, mat(0xffffff), 1.6, 0.06, 0.6, 0, 0.88, 1.3));
    body.add(scaled(G.box, dark, 1.3, 0.95, 0.28, 0, 1.15, -0.85));
    body.add(scaled(G.box, col, 2.3, 0.12, 0.6, 0, 1.55, -1.55));
    for (const s of [-1, 1]) body.add(scaled(G.box, dark, 0.1, 0.5, 0.1, s * 0.8, 1.25, -1.55));
    for (const s of [-1, 1]) {
      const pipe = scaled(G.cylLo, mat(0x9aa0a8), 0.13, 0.6, 0.13, s * 0.45, 0.7, -1.6);
      pipe.rotation.x = Math.PI / 2;
      body.add(pipe);
    }
    for (const [x, z, front] of [[-1.08, 1.05, true], [1.08, 1.05, true], [-1.1, -1.0, false], [1.1, -1.0, false]]) {
      const w = wheel(front ? 0.42 : 0.5, front ? 0.38 : 0.5);
      w.position.set(x, front ? 0.42 : 0.5, z);
      body.add(w);
      parts.wheels.push(w);
      if (front) parts.front.push(w);
    }
    parts.flames = flames(body, [[-0.45, 0.7, -2.05], [0.45, 0.7, -2.05]]);
    const drv = createDriver(ch);
    drv.position.set(0, 1.25, -0.25);
    body.add(drv);
    parts.driver = drv;
  }
  const shield = new THREE.Mesh(G.sphere, new THREE.MeshLambertMaterial({ color: 0xffe14d, transparent: true, opacity: 0.32, emissive: 0x6b5a00, depthWrite: false }));
  shield.scale.setScalar(2.6);
  shield.position.y = 1.1;
  shield.visible = false;
  root.add(shield);
  const bubble = new THREE.Mesh(G.sphere, new THREE.MeshLambertMaterial({ color: 0x5eead4, transparent: true, opacity: 0.35, depthWrite: false }));
  bubble.scale.setScalar(2.4);
  bubble.position.y = 1.1;
  bubble.visible = false;
  root.add(bubble);
  root.userData = { body, parts, shield, bubble, vehicle, character: ch.id, wheelRot: 0 };
  return root;
}

export function animateKart(model, s, dt, t) {
  const u = model.userData;
  const { parts, body } = u;
  const speed = s.speed || 0;
  u.wheelRot += speed * dt * 2.2;
  for (const w of parts.wheels) w.rotation.x = u.wheelRot;
  for (const w of parts.front) w.rotation.y = -(s.steer || 0) * 0.45;
  for (const sp of parts.spin) sp.obj.rotation[sp.axis] += dt * (sp.rate * (0.3 + Math.min(1, speed / 30)));
  const flags = s.flags || 0;
  const boosting = !!(flags & 2);
  for (const f of parts.flames) {
    f.visible = boosting;
    if (boosting) f.scale.set(0.24, 0.9 + Math.random() * 0.8, 0.24);
  }
  u.shield.visible = !!(flags & 8);
  if (u.shield.visible) u.shield.rotation.y = t * 2;
  u.bubble.visible = !!(flags & 16);
  const spin = flags & 4 ? t * 14 : 0;
  body.rotation.y = spin;
  const hoverBob = u.vehicle === 'hover' ? Math.sin(t * 6 + model.id) * 0.08 : 0;
  body.position.y = hoverBob;
  if (u.vehicle !== 'plane' && flags & 1) body.rotation.y += (s.steer || 0) * 0.25 + (s.roll || 0) * 1.5;
  if (parts.driver && parts.driver.userData.head) parts.driver.userData.head.rotation.y = -(s.steer || 0) * 0.35;
  model.visible = !(flags & 32);
}

export function createBalloon(color) {
  const g = new THREE.Group();
  const c = ITEMS[color]?.color ?? 0xffffff;
  const m = color === 'rainbow' ? new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true }) : mat(c, { emissive: c, emissiveIntensity: 0.15 });
  let geo = G.sphere;
  if (color === 'rainbow') {
    geo = G.sphere.clone();
    const pos = geo.attributes.position;
    const cols = [];
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      tmp.setHSL((pos.getY(i) + 1) / 2.4, 0.9, 0.55);
      cols.push(tmp.r, tmp.g, tmp.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  }
  const ball = new THREE.Mesh(geo, m);
  ball.scale.set(1.0, 1.18, 1.0);
  g.add(ball);
  const knot = scaled(G.cone, m, 0.18, 0.25, 0.18, 0, -1.25, 0);
  knot.rotation.x = Math.PI;
  g.add(knot);
  const string = scaled(G.cylLo, mat(0xffffff), 0.02, 1.2, 0.02, 0, -1.9, 0);
  g.add(string);
  const shine = scaled(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }), 0.18, 0.28, 0.1, -0.38, 0.45, 0.78);
  g.add(shine);
  return g;
}

export function createCoin() {
  const g = new THREE.Group();
  const c = scaled(G.cyl, mat(0xffd23f, { emissive: 0x8a6400, emissiveIntensity: 0.6 }), 0.6, 0.16, 0.6);
  c.rotation.x = Math.PI / 2;
  g.add(c);
  const inner = scaled(G.cylLo, mat(0xffb000), 0.36, 0.2, 0.36);
  inner.rotation.x = Math.PI / 2;
  g.add(inner);
  return g;
}

export function createMissile() {
  const g = new THREE.Group();
  const body = scaled(G.cyl, mat(0xef4444), 0.28, 1.6, 0.28);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const tip = scaled(G.cone, mat(0xffffff), 0.28, 0.6, 0.28, 0, 0, 1.1);
  tip.rotation.x = Math.PI / 2;
  g.add(tip);
  for (let i = 0; i < 4; i++) {
    const fin = scaled(G.box, mat(0xffd23f), 0.04, 0.5, 0.5, 0, 0, -0.65);
    fin.rotation.z = (i * Math.PI) / 2;
    fin.geometry = G.box;
    const holder = new THREE.Group();
    holder.rotation.z = (i * Math.PI) / 2;
    fin.position.set(0, 0.3, -0.65);
    fin.rotation.z = 0;
    holder.add(fin);
    g.add(holder);
  }
  const fl = scaled(G.cone, mat(0xffa21f, { emissive: 0xff6a00 }), 0.24, 1.0, 0.24, 0, 0, -1.3);
  fl.rotation.x = -Math.PI / 2;
  g.add(fl);
  g.userData.flame = fl;
  return g;
}

export function createTrap(kind) {
  const g = new THREE.Group();
  if (kind === 'oil') {
    const p = scaled(G.cyl, new THREE.MeshLambertMaterial({ color: 0x161616, emissive: 0x0a0a20 }), 1.9, 0.06, 1.5, 0, 0.03, 0);
    g.add(p);
    g.add(scaled(G.cyl, mat(0x3b3b6b), 0.6, 0.07, 0.4, 0.5, 0.05, 0.2));
  } else if (kind === 'bubble') {
    g.add(scaled(G.sphere, new THREE.MeshLambertMaterial({ color: 0x5eead4, transparent: true, opacity: 0.5, emissive: 0x0f5f55, depthWrite: false }), 1.4, 1.4, 1.4));
    g.add(scaled(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }), 0.25, 0.35, 0.1, -0.5, 0.5, 1.2));
  } else {
    g.add(scaled(G.sphere, mat(0x2a2a33), 0.7, 0.7, 0.7, 0, 0.6, 0));
    for (let i = 0; i < 6; i++) {
      const sp = scaled(G.cone, mat(0x9aa0a8), 0.14, 0.4, 0.14, 0, 0.6, 0);
      const a = (i / 6) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 0.75, 0.6, Math.sin(a) * 0.75);
      sp.rotation.z = -Math.cos(a) * Math.PI / 2;
      sp.rotation.x = Math.sin(a) * Math.PI / 2;
      g.add(sp);
    }
    const light = scaled(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0.18, 0.18, 0.18, 0, 1.35, 0);
    g.add(light);
    g.userData.light = light;
  }
  g.userData.kind = kind;
  return g;
}

export function createBlobShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.5)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

export function createNameTag(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d');
  x.font = '900 34px "Trebuchet MS", "Segoe UI", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 8;
  x.strokeStyle = '#12305a';
  x.strokeText(text, 128, 34);
  x.fillStyle = color;
  x.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(5, 1.25, 1);
  s.renderOrder = 10;
  return s;
}
