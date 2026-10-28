import { RaceSim } from '../../shared/race.js';
import { kartFlags } from '../../shared/physics.js';

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function kartMessage(k, extra = {}) {
  return {
    x: +k.x.toFixed(2), y: +k.y.toFixed(2), z: +k.z.toFixed(2), yaw: +k.yaw.toFixed(3), pitch: +k.pitch.toFixed(3), roll: +k.roll.toFixed(3),
    vx: +k.vx.toFixed(2), vy: +k.vy.toFixed(2), vz: +k.vz.toFixed(2), sp: +k.speed.toFixed(1), f: kartFlags(k), c: k.coins, lap: k.lap,
    s: +k.s.toFixed(2), inv: k.invulnT > 0 ? 1 : 0, ...extra
  };
}

export class LocalSession {
  constructor({ trackId, laps, items, difficulty, players, attract = false }) {
    this.queue = [];
    this.sim = new RaceSim({ trackId, laps, items, difficulty, players, attract, seed: (Math.random() * 1e9) | 0, emit: (t, d) => this.queue.push([t, d]) });
    this.info = this.sim.info();
    this.localIds = players.filter((p) => p.local).map((p) => p.id);
    this.spectate = this.localIds.length === 0;
    this.onEvent = () => {};
    this.offline = true;
  }

  update(dt) {
    this.sim.update(dt);
    this.flush();
  }

  flush() {
    if (!this.queue.length) return;
    const q = this.queue;
    this.queue = [];
    for (const [t, d] of q) this.onEvent(t, d);
  }

  sendState(id, k, extra) {
    this.sim.setHumanState(id, kartMessage(k, extra));
  }

  useItem(id) {
    this.sim.useItem(id);
  }

  others(exclude) {
    const out = [];
    for (const e of this.sim.entries.values()) {
      if (e.gone || !e.hasState || exclude.has(e.id)) continue;
      const k = e.kart;
      out.push({ id: e.id, x: k.x, y: k.y, z: k.z, yaw: k.yaw, pitch: k.pitch, roll: k.roll, speed: k.speed, flags: e.bot ? kartFlags(k) : k.flags | 0, lap: k.lap, coins: k.coins, steer: k.steerVis || 0, vx: k.vx, vz: k.vz, vy: k.vy, surf: k.surf });
    }
    return out;
  }

  projectiles() {
    return this.sim.projectiles;
  }

  ranking() {
    return this.sim.ranking();
  }

  phase() {
    return this.sim.phase;
  }

  goIn() {
    return Math.max(0, this.sim.goAt - this.sim.t);
  }

  raceTime() {
    return this.sim.raceTime;
  }

  leave() {}
}

export class OnlineSession {
  constructor(net, info, myId, spectate) {
    this.net = net;
    this.info = info;
    this.myId = myId;
    this.spectate = spectate;
    this.localIds = spectate ? [] : [myId];
    this.snaps = [];
    this.offset = null;
    this.onEvent = () => {};
    this.lastSend = 0;
    this.goAtLocal = performance.now() / 1000 + (info.goIn || 0);
    this.latest = null;
    this.offline = false;
    this.offs = [
      net.on('snap', (m) => this.onSnap(m)),
      net.on('results', (m) => this.onEvent('results', m))
    ];
  }

  onSnap(m) {
    const now = performance.now() / 1000;
    const s = m.s;
    const est = s.T - now;
    if (this.offset == null || est > this.offset) this.offset = est;
    else this.offset += (est - this.offset) * 0.02;
    const map = new Map();
    for (const a of s.k) map.set(a[0], a);
    const pmap = new Map();
    for (const p of s.p) pmap.set(p[0], p);
    const snap = { T: s.T, t: s.t, ph: s.ph, k: map, p: pmap, r: s.r };
    if (this.latest && this.latest.ph === 'countdown' && s.ph === 'race') this.goAtLocal = now;
    if (s.ph === 'countdown') this.goAtLocal = now + Math.max(0, (this.info.goIn || 3.6) - (s.T || 0));
    this.snaps.push(snap);
    if (this.snaps.length > 40) this.snaps.shift();
    this.latest = snap;
    for (const [t, d] of m.ev || []) if (t !== 'results') this.onEvent(t, d);
  }

  update() {}

  sendState(id, k, extra) {
    const now = performance.now();
    if (now - this.lastSend < 33 && !extra) return;
    this.lastSend = now;
    this.net.send({ t: 'st', ...kartMessage(k, extra) });
  }

  useItem() {
    this.net.send({ t: 'use' });
  }

  renderTime() {
    return performance.now() / 1000 + (this.offset || 0) - 0.1;
  }

  bracket(rt) {
    const S = this.snaps;
    if (!S.length) return null;
    if (rt <= S[0].T) return [S[0], S[0], 0];
    for (let i = S.length - 1; i > 0; i--) {
      if (S[i - 1].T <= rt) {
        const a = S[i - 1];
        const b = S[i];
        if (rt >= b.T) return [b, b, 0];
        return [a, b, (rt - a.T) / Math.max(1e-4, b.T - a.T)];
      }
    }
    return [S[S.length - 1], S[S.length - 1], 0];
  }

  others(exclude) {
    const br = this.bracket(this.renderTime());
    if (!br) return [];
    const [a, b, t] = br;
    const out = [];
    for (const [id, B] of b.k) {
      if (exclude.has(id)) continue;
      const A = a.k.get(id) || B;
      out.push({
        id, x: A[1] + (B[1] - A[1]) * t, y: A[2] + (B[2] - A[2]) * t, z: A[3] + (B[3] - A[3]) * t, yaw: lerpAngle(A[4], B[4], t),
        pitch: A[5] + (B[5] - A[5]) * t, roll: A[6] + (B[6] - A[6]) * t, speed: B[7], flags: B[8], lap: B[9], coins: B[10], steer: B[11],
        vx: (B[1] - A[1]) / Math.max(0.016, b.T - a.T), vz: (B[3] - A[3]) / Math.max(0.016, b.T - a.T), vy: 0
      });
    }
    return out;
  }

  projectiles() {
    const br = this.bracket(this.renderTime());
    if (!br) return [];
    const [a, b, t] = br;
    const out = [];
    for (const [id, B] of b.p) {
      const A = a.p.get(id) || B;
      out.push({ id, x: A[1] + (B[1] - A[1]) * t, y: A[2] + (B[2] - A[2]) * t, z: A[3] + (B[3] - A[3]) * t, yaw: lerpAngle(A[4], B[4], t) });
    }
    return out;
  }

  ranking() {
    return this.latest ? this.latest.r : this.info.players.map((p) => p.id);
  }

  phase() {
    if (this.latest) return this.latest.ph;
    return this.goIn() > 0 ? 'countdown' : 'race';
  }

  goIn() {
    return Math.max(0, this.goAtLocal - performance.now() / 1000);
  }

  raceTime() {
    return Math.max(0, performance.now() / 1000 - this.goAtLocal);
  }

  leave() {
    for (const off of this.offs) off();
  }
}
