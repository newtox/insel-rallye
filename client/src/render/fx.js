import * as THREE from 'three';

const PRESETS = {
  dust: { colors: [0xd9c7a0, 0xc2b089], size: [0.35, 0.7], life: [0.4, 0.8], speed: 2.5, up: 2, grav: -1, grow: 1.6 },
  grass: { colors: [0x5cc94a, 0x3fa83a], size: [0.25, 0.45], life: [0.3, 0.6], speed: 4, up: 4, grav: 12, grow: 0.5 },
  snow: { colors: [0xffffff, 0xe6f0ff], size: [0.3, 0.6], life: [0.4, 0.8], speed: 3, up: 3, grav: 4, grow: 1.2 },
  splash: { colors: [0xffffff, 0x9fe3ff], size: [0.3, 0.6], life: [0.5, 0.9], speed: 6, up: 9, grav: 22, grow: 0.8 },
  boost: { colors: [0xffd23f, 0xff8a00, 0xff5d5d], size: [0.3, 0.55], life: [0.15, 0.3], speed: 1.5, up: 0.5, grav: 0, grow: 0.3 },
  boom: { colors: [0xffd23f, 0xff8a00, 0xff3b1f, 0x4a4a4a], size: [0.8, 1.8], life: [0.5, 1.1], speed: 14, up: 8, grav: 6, grow: 1.8 },
  sparkle: { colors: [0xffffff, 0xffe14d, 0x9be7ff], size: [0.25, 0.5], life: [0.4, 0.8], speed: 7, up: 5, grav: 6, grow: 0.2 },
  driftBlue: { colors: [0x5ec8ff, 0xffffff], size: [0.18, 0.32], life: [0.15, 0.3], speed: 3, up: 3, grav: 10, grow: 0.2 },
  driftOrange: { colors: [0xff8a00, 0xffd23f], size: [0.2, 0.36], life: [0.15, 0.3], speed: 3.5, up: 3.5, grav: 10, grow: 0.2 },
  smoke: { colors: [0x555555, 0x777777], size: [0.6, 1.1], life: [0.6, 1.2], speed: 1.5, up: 3, grav: -2, grow: 2 },
  lava: { colors: [0xff5a1f, 0xffd23f, 0x333333], size: [0.4, 0.9], life: [0.5, 1], speed: 5, up: 8, grav: 14, grow: 1 }
};

export class Particles {
  constructor(scene, max = 420) {
    this.geo = new THREE.IcosahedronGeometry(1, 0);
    this.mats = new Map();
    this.pool = [];
    this.active = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(this.geo, this.mat(0xffffff));
      m.visible = false;
      this.group.add(m);
      this.pool.push({ m, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, grow: 1, grav: 0 });
    }
  }

  mat(color) {
    if (!this.mats.has(color)) this.mats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
    return this.mats.get(color);
  }

  emit(type, x, y, z, count = 6, vel = null) {
    const P = PRESETS[type];
    if (!P) return;
    for (let i = 0; i < count; i++) {
      const p = this.pool.pop();
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const s = P.speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * s + (vel ? vel.x : 0);
      p.vz = Math.sin(a) * s + (vel ? vel.z : 0);
      p.vy = P.up * (0.5 + Math.random() * 0.8) + (vel ? vel.y || 0 : 0);
      p.max = p.life = P.life[0] + Math.random() * (P.life[1] - P.life[0]);
      p.size = P.size[0] + Math.random() * (P.size[1] - P.size[0]);
      p.grow = P.grow;
      p.grav = P.grav;
      p.m.material = this.mat(P.colors[(Math.random() * P.colors.length) | 0]);
      p.m.position.set(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.6);
      p.m.scale.setScalar(p.size);
      p.m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      p.m.visible = true;
      this.active.push(p);
    }
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.m.visible = false;
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
        this.pool.push(p);
        continue;
      }
      p.vy -= p.grav * dt;
      p.m.position.x += p.vx * dt;
      p.m.position.y += p.vy * dt;
      p.m.position.z += p.vz * dt;
      const k = p.life / p.max;
      p.m.scale.setScalar(p.size * (1 + (1 - k) * p.grow) * Math.min(1, k * 3));
    }
  }

  clear() {
    for (const p of this.active) {
      p.m.visible = false;
      this.pool.push(p);
    }
    this.active = [];
  }
}
