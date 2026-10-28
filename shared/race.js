import { getTrack } from './trackgen.js';
import { createKart, stepKart, applyEffect, collideKarts, kartFlags, kartProgress, respawn, startFall, EV } from './physics.js';
import { botInput, createBotBrain } from './ai.js';
import { mulberry32, clamp, wrapAngle, round2 } from './math.js';
import { POINTS, COUNTDOWN_MS, DIFFICULTIES, MAX_COINS } from './constants.js';

const BALLOON_R = 3.4;
const COIN_R = 2.6;
const KART_R = 2.4;

export class RaceSim {
  constructor({ trackId, laps = 3, players, items = true, difficulty = 'normal', seed = 1, emit = () => {}, attract = false }) {
    this.track = getTrack(trackId);
    this.trackId = this.track.id;
    this.laps = clamp(laps | 0, 1, 9);
    this.items = items;
    this.diff = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
    this.rnd = mulberry32(seed);
    this.emit = emit;
    this.attract = attract;
    this.t = 0;
    this.goAt = attract ? 0 : COUNTDOWN_MS / 1000;
    this.phase = attract ? 'race' : 'countdown';
    this.entries = new Map();
    this.nextId = 1;
    this.projectiles = [];
    this.traps = [];
    this.spawnQueue = [];
    this.finishOrder = [];
    this.firstHumanFinish = null;
    this.ended = false;
    const ordered = [...players.filter((p) => p.bot), ...players.filter((p) => !p.bot)];
    ordered.forEach((p, slot) => {
      const kart = createKart({ id: p.id, vehicle: p.vehicle, character: p.character, track: this.track, slot });
      const e = {
        id: p.id, name: p.name, character: kart.character, vehicle: kart.vehicle, bot: !!p.bot, kart, slot,
        item: null, level: 0, itemHold: 0, botWait: 1, finished: false, finishTime: null, lapTimes: [], lastLapAt: 0,
        prev: { x: kart.x, y: kart.y, z: kart.z }, shieldUntil: 0, gone: false, hasState: !!p.bot, userId: p.userId || null
      };
      if (e.bot) {
        e.brain = createBotBrain(mulberry32(seed + slot * 977), this.diff.skill);
        e.startBoost = this.rnd() < this.diff.skill * 0.7;
      }
      this.entries.set(p.id, e);
    });
    this.balloons = this.track.balloons.map((b) => ({ ...b, active: items, respawnAt: 0 }));
    this.coins = this.track.coins.map((c) => ({ ...c, active: true, respawnAt: 0 }));
  }

  get raceTime() {
    return Math.max(0, this.t - this.goAt);
  }

  info() {
    return {
      trackId: this.trackId, laps: this.laps, items: this.items, goIn: Math.max(0, this.goAt - this.t),
      players: [...this.entries.values()].map((e) => ({ id: e.id, name: e.name, character: e.character, vehicle: e.vehicle, bot: e.bot, slot: e.slot })),
      balloons: this.balloons.filter((b) => !b.active).map((b) => b.id),
      coins: this.coins.filter((c) => !c.active).map((c) => c.id),
      traps: this.traps.map((t) => ({ id: t.id, kind: t.kind, x: round2(t.x), y: round2(t.y), z: round2(t.z) }))
    };
  }

  getPos = (id) => {
    const e = this.entries.get(id);
    return e && !e.gone ? e.kart : null;
  };

  kartList() {
    const out = [];
    for (const e of this.entries.values()) if (!e.gone && e.hasState) out.push(e.kart);
    return out;
  }

  ranking() {
    const list = [...this.entries.values()].filter((e) => !e.gone);
    list.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return kartProgress(b.kart, this.track) - kartProgress(a.kart, this.track);
    });
    return list.map((e) => e.id);
  }

  setHumanState(id, st) {
    const e = this.entries.get(id);
    if (!e || e.bot || e.gone) return;
    const k = e.kart;
    if (e.hasState) {
      e.prev.x = k.x;
      e.prev.y = k.y;
      e.prev.z = k.z;
    }
    k.x = +st.x || 0;
    k.y = +st.y || 0;
    k.z = +st.z || 0;
    if (!e.hasState) {
      e.prev.x = k.x;
      e.prev.y = k.y;
      e.prev.z = k.z;
    }
    e.hasState = true;
    e.lastStateAt = this.t;
    k.yaw = +st.yaw || 0;
    k.pitch = +st.pitch || 0;
    k.roll = +st.roll || 0;
    k.vx = +st.vx || 0;
    k.vy = +st.vy || 0;
    k.vz = +st.vz || 0;
    k.speed = +st.sp || 0;
    k.flags = st.f | 0;
    k.coins = clamp(st.c | 0, 0, MAX_COINS);
    k.respawnT = k.flags & 32 ? 1 : 0;
    k.shieldT = k.flags & 8 ? 1 : 0;
    k.invulnT = st.inv ? 1 : 0;
    const lap = st.lap | 0;
    if (Number.isFinite(+st.s)) k.s = clamp(+st.s, 0, this.track.n);
    const best = e.maxLap || 0;
    if (lap > best && lap <= this.laps + 1) {
      if (this.phase === 'race' && lap >= 2 && best >= 1) {
        const lt = this.raceTime - e.lastLapAt;
        if (lt >= this.track.length / 50) e.lapTimes.push(lt);
      }
      e.lastLapAt = this.raceTime;
      e.maxLap = lap;
    }
    k.lap = clamp(lap, -1, this.laps + 1);
    if (!e.finished && this.phase === 'race' && k.lap > this.laps && (e.maxLap || 0) > this.laps && this.raceTime >= (this.track.length / 50) * this.laps) {
      let t = this.raceTime;
      if (Number.isFinite(+st.ft) && Math.abs(+st.ft / 1000 - t) < 3) t = +st.ft / 1000;
      this.finish(e, t);
    }
  }

  removePlayer(id) {
    const e = this.entries.get(id);
    if (!e) return;
    e.gone = true;
    this.emit('left', { id });
  }

  useItem(id) {
    const e = this.entries.get(id);
    if (!e || !e.item || e.gone || this.phase !== 'race') return;
    if (e.kart.respawnT > 0) return;
    const item = e.item;
    const lvl = e.level;
    e.item = null;
    e.level = 0;
    e.itemHold = 0;
    this.emit('item', { target: id, item: null, level: 0 });
    this.emit('used', { id, item, level: lvl });
    const k = e.kart;
    switch (item) {
      case 'red':
        if (lvl === 3) for (let n = 0; n < 3; n++) this.spawnQueue.push({ at: this.t + n * 0.28, owner: id, homing: true });
        else this.spawnMissile(e, lvl === 2);
        break;
      case 'blue':
        this.effect(e, { type: 'boost', t: [0, 1.5, 2.3, 3.3][lvl], pow: [0, 0.48, 0.56, 0.66][lvl] });
        break;
      case 'green': {
        const kind = ['', 'oil', 'bubble', 'mine'][lvl];
        const fx = Math.sin(k.yaw);
        const fz = Math.cos(k.yaw);
        const x = k.x - fx * 4;
        const z = k.z - fz * 4;
        const g = this.track.groundAt(x, z);
        const y = Math.max(g.h, this.track.water) + (kind === 'bubble' ? 1.2 : 0.05);
        const trap = { id: 't' + this.nextId++, kind, x, y, z, owner: id, armT: 0.8, life: 60 };
        this.traps.push(trap);
        if (this.traps.length > 30) {
          const old = this.traps.shift();
          this.emit('trapGone', { id: old.id });
        }
        this.emit('trap', { id: trap.id, kind, x: round2(x), y: round2(y), z: round2(z) });
        break;
      }
      case 'yellow': {
        const t = [0, 4, 7, 10][lvl];
        e.shieldUntil = this.t + t;
        this.effect(e, { type: 'shield', t });
        break;
      }
      case 'rainbow': {
        const rank = this.ranking();
        const idx = rank.indexOf(id);
        const target = idx > 0 ? rank[idx - 1] : null;
        if (target) this.effect(e, { type: 'magnet', t: [0, 2.6, 3.6, 4.8][lvl], target });
        else this.effect(e, { type: 'boost', t: 1.2, pow: 0.4 });
        break;
      }
    }
  }

  effect(e, eff) {
    if (e.bot) applyEffect(e.kart, eff);
    this.emit('effect', { target: e.id, ...eff });
  }

  spawnMissile(e, homing) {
    const k = e.kart;
    const fx = Math.sin(k.yaw);
    const fz = Math.cos(k.yaw);
    let target = null;
    if (homing) {
      const rank = this.ranking();
      const idx = rank.indexOf(e.id);
      let best = null;
      for (const o of this.entries.values()) {
        if (o.id === e.id || o.gone || !o.hasState) continue;
        const dx = o.kart.x - k.x;
        const dz = o.kart.z - k.z;
        const d = Math.hypot(dx, dz);
        const dot = (dx * fx + dz * fz) / (d || 1);
        if (dot > 0.2 && d < 220 && (!best || d < best.d)) best = { d, id: o.id };
      }
      target = best ? best.id : idx > 0 ? rank[idx - 1] : null;
    }
    const p = {
      id: 'm' + this.nextId++, owner: e.id, x: k.x + fx * 3, y: k.y + 1, z: k.z + fz * 3, yaw: k.yaw,
      spd: Math.max(70, k.speed + 30), homing: !!target, target, life: 4.5, age: 0, hint: k.hint
    };
    this.projectiles.push(p);
  }

  hit(e, type, by) {
    if (e.gone) return false;
    const k = e.kart;
    const shielded = (e.bot ? k.shieldT > 0 : (k.flags & 8) || this.t < e.shieldUntil) || k.invulnT > 0;
    if (shielded) {
      this.emit('blocked', { target: e.id });
      return false;
    }
    if (e.bot) applyEffect(k, { type, t: type === 'stun' ? 1.6 : type === 'blast' ? 1.5 : 1.1 });
    this.emit('hit', { target: e.id, type, by });
    return true;
  }

  finish(e, t) {
    e.finished = true;
    e.finishTime = t;
    this.finishOrder.push(e.id);
    if (!e.bot && this.firstHumanFinish == null) this.firstHumanFinish = this.t;
    this.emit('finish', { id: e.id, time: Math.round(t * 1000), place: this.finishOrder.length });
  }

  update(dt) {
    if (this.ended) return;
    this.t += dt;
    if (this.phase === 'countdown' && this.t >= this.goAt) {
      this.phase = 'race';
      this.emit('go', {});
      for (const e of this.entries.values()) if (e.bot && e.startBoost) applyEffect(e.kart, { type: 'boost', t: 0.9, pow: 0.4 });
    }
    const frozen = this.phase === 'countdown';
    const karts = this.kartList();
    const humanBest = this.humanBestProgress();
    for (const e of this.entries.values()) {
      if (!e.bot || e.gone) continue;
      const k = e.kart;
      e.prev.x = k.x;
      e.prev.y = k.y;
      e.prev.z = k.z;
      const env = { frozen, balloons: this.balloons, wantBalloon: this.items && (!e.item || e.level < 3) };
      const inp = botInput(k, e.brain, this.track, dt, env);
      if (inp.needRescue) {
        e.brain.totalStuck = 0;
        startFall(k);
      }
      let speedMul = this.diff.speed;
      if (humanBest != null && !this.attract) {
        const diff = (kartProgress(k, this.track) - humanBest) / this.track.n;
        speedMul *= clamp(1 - diff * 0.18, 0.9, 1.07);
      }
      const prevLap = k.lap;
      stepKart(k, inp, this.track, dt, { frozen, getPos: this.getPos, speedMul });
      collideKarts(k, karts);
      if (k.ev & EV.LAP) {
        if (prevLap >= 1) {
          e.lapTimes.push(this.raceTime - e.lastLapAt);
        }
        e.lastLapAt = this.raceTime;
        if (!e.finished && k.lap > this.laps && !this.attract) this.finish(e, this.raceTime);
        if (this.attract && k.lap > 50) k.lap = 1;
      }
      if (this.items && e.item && this.phase === 'race') this.botItems(e, dt);
    }
    if (this.phase === 'race') {
      this.updatePickups();
      this.updateSpawnQueue();
      this.updateProjectiles(dt);
      this.updateTraps(dt);
      this.checkEnd();
    }
  }

  humanBestProgress() {
    let best = null;
    for (const e of this.entries.values()) {
      if (e.bot || e.gone || !e.hasState) continue;
      const p = kartProgress(e.kart, this.track);
      if (best == null || p > best) best = p;
    }
    return best;
  }

  botItems(e, dt) {
    e.itemHold += dt;
    if (e.itemHold < e.botWait) return;
    const k = e.kart;
    const fx = Math.sin(k.yaw);
    const fz = Math.cos(k.yaw);
    let use = false;
    const others = [...this.entries.values()].filter((o) => o !== e && !o.gone && o.hasState);
    switch (e.item) {
      case 'red':
        if (e.level >= 2) use = true;
        else
          use = others.some((o) => {
            const dx = o.kart.x - k.x;
            const dz = o.kart.z - k.z;
            const d = Math.hypot(dx, dz);
            return d < 75 && (dx * fx + dz * fz) / d > 0.93;
          }) || e.itemHold > 9;
        break;
      case 'blue':
        use = Math.abs(this.track.curvatureAhead(k.hint, 30)) < 0.35 && k.grounded;
        break;
      case 'green':
        use = others.some((o) => {
          const dx = o.kart.x - k.x;
          const dz = o.kart.z - k.z;
          const d = Math.hypot(dx, dz);
          return d < 45 && (dx * fx + dz * fz) / d < -0.6;
        }) || e.itemHold > 7;
        break;
      case 'yellow':
        use = this.projectiles.some((p) => p.owner !== e.id && Math.hypot(p.x - k.x, p.z - k.z) < 40) || e.itemHold > 12;
        break;
      case 'rainbow':
        use = this.ranking().indexOf(e.id) > 0;
        break;
    }
    if (use && this.rnd() < 0.5 + this.diff.items * 0.5) this.useItem(e.id);
  }

  updatePickups() {
    const t = this.t;
    for (const b of this.balloons) {
      if (!b.active && this.items && t >= b.respawnAt) {
        b.active = true;
        this.emit('respawnPickup', { id: b.id });
      }
    }
    for (const c of this.coins) {
      if (!c.active && t >= c.respawnAt) {
        c.active = true;
        this.emit('respawnPickup', { id: c.id });
      }
    }
    for (const e of this.entries.values()) {
      if (e.gone || !e.hasState) continue;
      const k = e.kart;
      if (k.respawnT > 0) continue;
      if (this.items) {
        for (const b of this.balloons) {
          if (!b.active) continue;
          if (segDist(e.prev, k, b) < BALLOON_R) {
            b.active = false;
            b.respawnAt = t + 3;
            if (e.item === b.color) e.level = Math.min(3, e.level + 1);
            else {
              e.item = b.color;
              e.level = 1;
            }
            e.itemHold = 0;
            e.botWait = 0.6 + this.rnd() * (3.2 / Math.max(0.3, this.diff.items));
            this.emit('pickup', { kind: 'balloon', id: b.id, by: e.id });
            this.emit('item', { target: e.id, item: e.item, level: e.level });
          }
        }
      }
      for (const c of this.coins) {
        if (!c.active) continue;
        if (segDist(e.prev, k, c) < COIN_R) {
          c.active = false;
          c.respawnAt = t + 9;
          if (e.bot) k.coins = Math.min(MAX_COINS, k.coins + 1);
          this.emit('pickup', { kind: 'coin', id: c.id, by: e.id });
        }
      }
    }
  }

  updateSpawnQueue() {
    if (!this.spawnQueue.length) return;
    const keep = [];
    for (const s of this.spawnQueue) {
      if (this.t >= s.at) {
        const e = this.entries.get(s.owner);
        if (e && !e.gone) this.spawnMissile(e, s.homing);
      } else keep.push(s);
    }
    this.spawnQueue = keep;
  }

  updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      p.age += dt;
      p.life -= dt;
      let dead = p.life <= 0;
      if (!dead && p.homing && p.age > 0.2) {
        const tk = this.getPos(p.target);
        if (tk) {
          const want = Math.atan2(tk.x - p.x, tk.z - p.z);
          const d = wrapAngle(want - p.yaw);
          p.yaw = wrapAngle(p.yaw + clamp(d, -3 * dt, 3 * dt));
          p.y += clamp(tk.y + 0.8 - p.y, -14 * dt, 14 * dt);
        }
      }
      if (!dead) {
        p.x += Math.sin(p.yaw) * p.spd * dt;
        p.z += Math.cos(p.yaw) * p.spd * dt;
        const nav = this.track.locate(p.x, p.z, p.hint);
        p.hint = nav.i;
        if (nav.far) dead = true;
        else {
          const g = this.track.groundAt(p.x, p.z, nav);
          const floor = Math.max(g.h, this.track.water);
          if (floor > p.y + 2.2) dead = true;
          else if (p.y < floor + 1) p.y = floor + 1;
          else if (!p.homing) p.y += (floor + 1 - p.y) * Math.min(1, dt * 3);
        }
      }
      if (!dead) {
        for (const e of this.entries.values()) {
          if (e.gone || !e.hasState || (e.id === p.owner && p.age < 0.6)) continue;
          const k = e.kart;
          if (k.respawnT > 0) continue;
          const dx = k.x - p.x;
          const dy = k.y + 0.6 - p.y;
          const dz = k.z - p.z;
          if (dx * dx + dy * dy + dz * dz < 2.8 * 2.8) {
            this.hit(e, 'blast', p.owner);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (let i = 0; i < this.traps.length; i++) {
          const tr = this.traps[i];
          if (Math.hypot(tr.x - p.x, tr.z - p.z) < 2 && Math.abs(tr.y - p.y) < 2.5) {
            this.traps.splice(i, 1);
            this.emit('trapGone', { id: tr.id, boom: true });
            dead = true;
            break;
          }
        }
      }
      if (dead) this.emit('boom', { x: round2(p.x), y: round2(p.y), z: round2(p.z) });
      else keep.push(p);
    }
    this.projectiles = keep;
  }

  updateTraps(dt) {
    const keep = [];
    for (const tr of this.traps) {
      tr.armT -= dt;
      tr.life -= dt;
      let gone = tr.life <= 0;
      if (!gone) {
        for (const e of this.entries.values()) {
          if (e.gone || !e.hasState) continue;
          if (e.id === tr.owner && tr.armT > 0) continue;
          const k = e.kart;
          if (k.respawnT > 0) continue;
          if (segDist(e.prev, k, tr) < 2.7 && Math.abs(k.y - tr.y) < 3) {
            const type = tr.kind === 'oil' ? 'spin' : tr.kind === 'bubble' ? 'stun' : 'blast';
            this.hit(e, type, tr.owner);
            gone = true;
            break;
          }
        }
      }
      if (gone) this.emit('trapGone', { id: tr.id, boom: tr.kind === 'mine' });
      else keep.push(tr);
    }
    this.traps = keep;
  }

  checkEnd() {
    if (this.attract) return;
    const all = [...this.entries.values()].filter((e) => !e.gone);
    const humans = all.filter((e) => !e.bot);
    let end = false;
    const activeHumans = humans.filter((e) => e.hasState && this.t - (e.lastStateAt || 0) < 15);
    if (humans.length) {
      if (activeHumans.every((e) => e.finished) && (activeHumans.length || this.raceTime > 20)) end = true;
      else if (this.firstHumanFinish != null && this.t - this.firstHumanFinish > 30) end = true;
    } else if (all.length === 0 || all.every((e) => e.finished)) end = true;
    if (this.raceTime > 60 * 4 * this.laps) end = true;
    if (end) this.end();
  }

  end() {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'done';
    const rank = this.ranking();
    const results = rank.map((id, idx) => {
      const e = this.entries.get(id);
      const best = e.lapTimes.length ? Math.min(...e.lapTimes) : null;
      return {
        id, name: e.name, character: e.character, vehicle: e.vehicle, bot: e.bot, userId: e.userId, place: idx + 1,
        time: e.finished ? Math.round(e.finishTime * 1000) : null, bestLap: best != null ? Math.round(best * 1000) : null,
        points: e.finished || idx < 8 ? POINTS[idx] || 0 : 0
      };
    });
    this.results = results;
    this.emit('results', { trackId: this.trackId, laps: this.laps, results });
  }

  snapshot() {
    const k = [];
    for (const e of this.entries.values()) {
      if (e.gone || !e.hasState) continue;
      const a = e.kart;
      k.push([e.id, round2(a.x), round2(a.y), round2(a.z), round2(a.yaw), round2(a.pitch), round2(a.roll), round2(a.speed), e.bot ? kartFlags(a) : a.flags | 0, a.lap, a.coins | 0, round2(a.steerVis || 0)]);
    }
    const p = this.projectiles.map((q) => [q.id, round2(q.x), round2(q.y), round2(q.z), round2(q.yaw)]);
    return { T: Math.round(this.t * 1000) / 1000, t: round2(this.raceTime), ph: this.phase, k, p, r: this.ranking() };
  }
}

function segDist(a, b, p) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (l2 > 1e-6) t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / l2, 0, 1);
  if (l2 > 400) t = 1;
  const cx = a.x + dx * t - p.x;
  const cy = a.y + dy * t - p.y;
  const cz = a.z + dz * t - p.z;
  return Math.sqrt(cx * cx + cy * cy * 0.5 + cz * cz);
}

export { respawn };
