import * as THREE from 'three';
import { getTrack } from '../../shared/trackgen.js';
import { createKart, stepKart, applyEffect, collideKarts, kartFlags, EV } from '../../shared/physics.js';
import { botInput, createBotBrain } from '../../shared/ai.js';
import { characterById } from '../../shared/constants.js';
import { clamp, lerp, wrapAngle } from '../../shared/math.js';
import { buildWorld } from './render/world.js';
import { createKartModel, animateKart, createMissile, createTrap, createBlobShadow, createNameTag } from './render/models.js';
import { Particles } from './render/fx.js';
import { Hud, Minimap } from './hud.js';
import { readDevice } from './input.js';

const worldCache = new Map();
function getWorld(track) {
  if (!worldCache.has(track.id)) {
    if (worldCache.size > 2) worldCache.delete(worldCache.keys().next().value);
    worldCache.set(track.id, buildWorld(track));
  }
  return worldCache.get(track.id);
}

export function preloadWorld(trackId) {
  getWorld(getTrack(trackId));
}

function viewports(n) {
  if (n <= 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
  if (n === 2) return [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }];
  return [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }];
}

function hexColor(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

export class Game {
  constructor({ renderer, session, locals = [], audio, settings = {}, hudRoot, onResults, onPause, attract = false }) {
    this.renderer = renderer;
    this.session = session;
    this.audio = audio;
    this.settings = settings;
    this.onResults = onResults || (() => {});
    this.onPause = onPause || (() => {});
    this.attract = attract;
    this.info = session.info;
    this.track = getTrack(this.info.trackId);
    this.laps = this.info.laps;
    this.t = 0;
    this.paused = false;
    this.ended = false;
    this.players = new Map(this.info.players.map((p) => [p.id, p]));
    this.scene = new THREE.Scene();
    const th = this.track.theme;
    this.scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    this.scene.background = new THREE.Color(th.skyBottom);
    this.scene.add(new THREE.HemisphereLight(th.hemiSky, th.hemiGround, 1.6));
    const sun = new THREE.DirectionalLight(th.sun, 1.9);
    sun.position.set(300, 500, -400);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, th.ambient * 0.6));
    this.world = getWorld(this.track);
    this.scene.add(this.world.group);
    for (const m of this.world.balloons.values()) m.visible = this.info.items !== false;
    for (const m of this.world.coins.values()) m.visible = true;
    for (const id of this.info.balloons || []) this.setPickup(id, false);
    for (const id of this.info.coins || []) this.setPickup(id, false);
    this.fx = new Particles(this.scene);
    this.models = new Map();
    this.traps = new Map();
    this.missiles = new Map();
    for (const tr of this.info.traps || []) this.addTrap(tr);
    this.hudRoot = hudRoot;
    this.localIds = new Set(session.localIds);
    this.locals = [];
    const vps = viewports(Math.max(1, session.localIds.length));
    session.localIds.forEach((id, i) => {
      const p = this.players.get(id);
      const kart = createKart({ id, vehicle: p.vehicle, character: p.character, track: this.track, slot: p.slot });
      const cam = new THREE.PerspectiveCamera(68, 1, 0.3, 3400);
      const L = {
        id, kart, cam, vp: vps[i], device: (locals[i] && locals[i].device) || 'kball', name: p.name,
        hud: hudRoot ? new Hud(hudRoot, { name: p.name, character: p.character, showName: session.localIds.length > 1 }) : null,
        camYaw: kart.yaw, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), shake: 0,
        item: null, level: 0, lapTimes: [], lastLapAt: 0, finished: false, finishTime: null, place: 0,
        gasDownAt: null, brain: null, lastCount: null, wrongShown: false, sendExtra: null
      };
      L.hud && L.hud.setRect(L.vp);
      this.snapCamera(L);
      this.locals.push(L);
    });
    if (!this.locals.length) {
      const cam = new THREE.PerspectiveCamera(60, 1, 0.3, 3400);
      this.spectator = { cam, target: null, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), angle: 0, switchT: 0, vp: { x: 0, y: 0, w: 1, h: 1 }, idx: 0 };
    }
    if (this.locals.length === 3) {
      this.overview = { cam: new THREE.PerspectiveCamera(55, 1, 0.3, 3400), vp: vps[3] };
    }
    if (hudRoot) {
      this.minimap = new Minimap(hudRoot, this.track, this.world.pathPts, (id) => {
        const p = this.players.get(id);
        return p ? hexColor(characterById(p.character).kart) : '#fff';
      });
      if (this.locals.length >= 2) this.minimap.setPos({ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '15vmin', height: '15vmin' });
      if (this.locals.length === 3) this.minimap.setPos({ left: '75%', top: '75%', transform: 'translate(-50%,-50%)', width: '22vmin', height: '22vmin' });
      if (!this.locals.length && !attract) {
        this.specLabel = document.createElement('div');
        this.specLabel.className = 'spectate-label';
        hudRoot.appendChild(this.specLabel);
      }
    }
    this.othersCache = new Map();
    session.onEvent = (t, d) => this.onEvent(t, d);
    this.getPos = (id) => {
      const L = this.locals.find((l) => l.id === id);
      if (L) return L.kart;
      return this.othersCache.get(id) || null;
    };
    this.prevPhase = session.phase();
    this.resultsTimer = null;
    if (!attract) audio && audio.playSong('race');
  }

  setPickup(id, visible) {
    const m = this.world.balloons.get(id) || this.world.coins.get(id);
    if (m) m.visible = visible;
    return m;
  }

  model(id) {
    if (this.models.has(id)) return this.models.get(id);
    const p = this.players.get(id);
    if (!p) return null;
    const m = createKartModel(p.character, p.vehicle);
    const shadow = createBlobShadow();
    this.scene.add(m);
    this.scene.add(shadow);
    let tag = null;
    if (!this.attract && (!this.localIds.has(id) || this.locals.length > 1)) {
      tag = createNameTag(p.name.replace(' (CPU)', ''), p.bot ? '#fff4d6' : '#ffd23f');
      this.scene.add(tag);
    }
    const entry = { m, shadow, tag };
    this.models.set(id, entry);
    return entry;
  }

  removeModel(id) {
    const e = this.models.get(id);
    if (!e) return;
    this.scene.remove(e.m, e.shadow);
    if (e.tag) this.scene.remove(e.tag);
    this.models.delete(id);
  }

  addTrap(tr) {
    const m = createTrap(tr.kind);
    m.position.set(tr.x, tr.y - (tr.kind === 'bubble' ? 0 : 0), tr.z);
    this.scene.add(m);
    this.traps.set(tr.id, m);
  }

  nearestLocalDist(x, y, z) {
    let best = Infinity;
    for (const L of this.locals) best = Math.min(best, Math.hypot(L.kart.x - x, L.kart.y - y, L.kart.z - z));
    if (!this.locals.length && this.spectator) best = this.spectator.camPos.distanceTo(new THREE.Vector3(x, y, z)) - 10;
    return best;
  }

  sfxAt(name, x, y, z) {
    if (!this.audio || this.attract) return;
    const d = this.nearestLocalDist(x, y, z);
    if (d > 120) return;
    this.audio.sfx(name, clamp(1 - d / 120, 0.1, 1));
  }

  posOf(id) {
    const L = this.locals.find((l) => l.id === id);
    if (L) return L.kart;
    return this.othersCache.get(id);
  }

  onEvent(type, d) {
    const L = d && d.target ? this.locals.find((l) => l.id === d.target) : null;
    switch (type) {
      case 'go':
        break;
      case 'pickup': {
        const m = this.setPickup(d.id, false);
        if (m) this.fx.emit('sparkle', m.position.x, m.position.y, m.position.z, d.kind === 'coin' ? 5 : 10);
        const by = this.locals.find((l) => l.id === d.by);
        if (by) {
          if (d.kind === 'coin') {
            applyEffect(by.kart, { type: 'coins', n: 1 });
            this.audio && this.audio.sfx('coin');
          } else this.audio && this.audio.sfx('balloon');
        }
        break;
      }
      case 'respawnPickup':
        this.setPickup(d.id, true);
        break;
      case 'item':
        if (L) {
          if (d.item && d.level > 1 && L.item === d.item) this.audio && this.audio.sfx('levelup');
          L.item = d.item;
          L.level = d.level;
        }
        break;
      case 'used': {
        const p = this.posOf(d.id);
        if (!p) break;
        const local = this.localIds.has(d.id);
        const snd = { red: 'missile', blue: 'boost', green: 'drop', yellow: 'shield', rainbow: 'magnet' }[d.item];
        if (local && this.audio) this.audio.sfx(snd);
        else this.sfxAt(snd, p.x, p.y, p.z);
        break;
      }
      case 'effect':
        if (L) applyEffect(L.kart, d);
        break;
      case 'hit': {
        const p = this.posOf(d.target);
        if (L) {
          applyEffect(L.kart, { type: d.type, t: d.type === 'stun' ? 1.6 : d.type === 'blast' ? 1.5 : 1.1 });
          L.shake = d.type === 'blast' ? 0.6 : 0.3;
          this.audio && this.audio.sfx('hit');
          const byName = this.players.get(d.by)?.name;
          if (L.hud && byName && d.by !== L.id) L.hud.subtitle(`Getroffen von ${byName.replace(' (CPU)', '')}`, 2);
        }
        const byL = this.locals.find((l) => l.id === d.by);
        if (byL && byL.hud && d.by !== d.target) byL.hud.subtitle(`Treffer! ${this.players.get(d.target)?.name.replace(' (CPU)', '') || ''}`, 1.8);
        if (p && d.type === 'spin') this.fx.emit('smoke', p.x, p.y + 0.5, p.z, 6);
        break;
      }
      case 'blocked': {
        const p = this.posOf(d.target);
        if (p) this.fx.emit('sparkle', p.x, p.y + 1, p.z, 8);
        if (L && this.audio) this.audio.sfx('shield');
        break;
      }
      case 'boom':
        this.fx.emit('boom', d.x, d.y, d.z, 18);
        this.fx.emit('smoke', d.x, d.y, d.z, 6);
        this.sfxAt('boom', d.x, d.y, d.z);
        for (const l of this.locals) if (Math.hypot(l.kart.x - d.x, l.kart.z - d.z) < 25) l.shake = Math.max(l.shake, 0.25);
        break;
      case 'trap':
        this.addTrap(d);
        break;
      case 'trapGone': {
        const m = this.traps.get(d.id);
        if (m) {
          if (d.boom) {
            this.fx.emit('boom', m.position.x, m.position.y + 0.5, m.position.z, 14);
            this.sfxAt('boom', m.position.x, m.position.y, m.position.z);
          } else this.fx.emit('splash', m.position.x, m.position.y + 0.3, m.position.z, 8);
          this.scene.remove(m);
          this.traps.delete(d.id);
        }
        break;
      }
      case 'finish': {
        const name = this.players.get(d.id)?.name || '?';
        for (const l of this.locals) if (l.id !== d.id && l.hud && d.place === 1 && !l.finished) l.hud.subtitle(`${name.replace(' (CPU)', '')} gewinnt!`, 2.5);
        break;
      }
      case 'left':
        this.removeModel(d.id);
        this.players.delete(d.id);
        break;
      case 'results':
        if (this.ended) break;
        this.ended = true;
        this.resultsTimer = setTimeout(() => this.onResults(d), this.locals.some((l) => l.finished) ? 2200 : 600);
        break;
    }
  }

  snapCamera(L) {
    const k = L.kart;
    L.camYaw = k.yaw;
    const fx = Math.sin(k.yaw);
    const fz = Math.cos(k.yaw);
    L.camPos.set(k.x - fx * 8, k.y + 3.4, k.z - fz * 8);
    L.camLook.set(k.x + fx * 5, k.y + 1.2, k.z + fz * 5);
  }

  updateCamera(L, dt) {
    const k = L.kart;
    const plane = k.vehicle === 'plane';
    L.camYaw = lerp(L.camYaw, L.camYaw + wrapAngle(k.yaw - L.camYaw), 1 - Math.exp(-dt * (plane ? 4 : 6)));
    const fx = Math.sin(L.camYaw);
    const fz = Math.cos(L.camYaw);
    const dist = plane ? 10 : 7.6;
    const boost = k.boostT > 0 ? 1 : 0;
    const back = dist + boost * 1.2;
    const pitch = plane ? k.pitch * 0.6 : 0;
    const want = new THREE.Vector3(k.x - fx * back * Math.cos(pitch), k.y + (plane ? 3.2 : 3.1) - Math.sin(pitch) * back, k.z - fz * back * Math.cos(pitch));
    const g = this.track.heightAt(want.x, want.z);
    want.y = Math.max(want.y, Math.max(g, this.track.water) + 1.4);
    if (k.respawnT > 0) return;
    L.camPos.lerp(want, 1 - Math.exp(-dt * 9));
    const look = new THREE.Vector3(k.x + fx * 5, k.y + 1.3 + (plane ? Math.sin(k.pitch) * 5 : 0), k.z + fz * 5);
    L.camLook.lerp(look, 1 - Math.exp(-dt * 14));
    L.cam.position.copy(L.camPos);
    if (L.shake > 0) {
      L.shake = Math.max(0, L.shake - dt);
      L.cam.position.x += (Math.random() - 0.5) * L.shake * 1.5;
      L.cam.position.y += (Math.random() - 0.5) * L.shake * 1.5;
    }
    L.cam.lookAt(L.camLook);
    if (plane) L.cam.rotateZ(-k.roll * 0.35);
    const fov = 68 + boost * 10 + Math.min(1, k.speed / 40) * 6;
    L.cam.fov = lerp(L.cam.fov, fov, 1 - Math.exp(-dt * 5));
    L.cam.updateProjectionMatrix();
  }

  updateSpectator(dt, karts) {
    const S = this.spectator;
    if (!karts.length) return;
    const rank = this.session.ranking();
    S.switchT -= dt;
    if (this.attract) {
      if (!S.target || S.switchT <= 0 || !karts.find((k) => k.id === S.target)) {
        S.target = karts[(Math.random() * karts.length) | 0].id;
        S.switchT = 7;
        S.angle = Math.random() * Math.PI * 2;
        S.snap = true;
      }
    } else if (!S.target || !karts.find((k) => k.id === S.target)) {
      S.target = rank[S.idx % Math.max(1, rank.length)] || karts[0].id;
    }
    const k = karts.find((x) => x.id === S.target) || karts[0];
    S.angle += dt * (this.attract ? 0.12 : 0);
    const yaw = this.attract ? k.yaw + Math.PI * 0.75 + Math.sin(S.angle) * 0.9 : k.yaw;
    const dist = this.attract ? 13 : 9;
    const want = new THREE.Vector3(k.x - Math.sin(yaw) * dist, k.y + (this.attract ? 4.5 : 3.6), k.z - Math.cos(yaw) * dist);
    want.y = Math.max(want.y, Math.max(this.track.heightAt(want.x, want.z), this.track.water) + 1.5);
    if (S.snap) {
      S.camPos.copy(want);
      S.camLook.set(k.x, k.y + 1.2, k.z);
      S.snap = false;
    }
    S.camPos.lerp(want, 1 - Math.exp(-dt * 3));
    S.camLook.lerp(new THREE.Vector3(k.x, k.y + 1.2, k.z), 1 - Math.exp(-dt * 8));
    S.cam.position.copy(S.camPos);
    S.cam.lookAt(S.camLook);
    if (this.specLabel) {
      const p = this.players.get(k.id);
      this.specLabel.textContent = `Zuschauen: ${p ? p.name : ''} · Pfeiltasten wechseln`;
    }
  }

  cycleSpectator(dir) {
    if (!this.spectator) return;
    this.spectator.idx = Math.max(0, this.spectator.idx + dir);
    this.spectator.target = null;
  }

  setPaused(p) {
    this.paused = p;
  }

  frame(dt, skipRender = false) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const S = this.session;
    if (this.paused) {
      this.render();
      return;
    }
    const phase = S.phase();
    const goIn = S.goIn();
    const raceTime = S.raceTime();
    const frozen = phase === 'countdown';
    if (this.prevPhase === 'countdown' && phase !== 'countdown') this.onGo();
    this.prevPhase = phase;
    const others = S.others(this.localIds);
    this.othersCache.clear();
    for (const o of others) this.othersCache.set(o.id, o);
    const allKarts = [...others, ...this.locals.map((l) => l.kart)];
    for (const L of this.locals) {
      let inp = readDevice(L.device, this.settings);
      if (inp.pause && !this.attract) this.onPause();
      if (frozen) {
        if (inp.gas && L.gasDownAt == null) L.gasDownAt = goIn;
        if (!inp.gas) L.gasDownAt = null;
        const c = Math.ceil(goIn);
        if (goIn < 3.2 && c !== L.lastCount && c > 0) {
          L.lastCount = c;
          L.hud && L.hud.flash(String(c), 'count', 0.9);
          if (L === this.locals[0] && this.audio) this.audio.sfx('count');
        }
      }
      if (L.finished) {
        if (!L.brain) L.brain = createBotBrain(Math.random, 0.75);
        inp = { ...botInput(L.kart, L.brain, this.track, dt, {}), item: false };
      }
      if (inp.item && phase === 'race' && L.item && !L.finished) S.useItem(L.id);
      const n = Math.max(1, Math.ceil(dt / (1 / 60)));
      const h = dt / n;
      let ev = 0;
      for (let i = 0; i < n; i++) {
        stepKart(L.kart, inp, this.track, h, { frozen, getPos: this.getPos });
        ev |= L.kart.ev;
        collideKarts(L.kart, allKarts);
      }
      this.kartEvents(L, ev, raceTime);
      S.sendState(L.id, L.kart, L.sendExtra);
      L.sendExtra = null;
      const k = L.kart;
      if (!L.finished && k.wrongT > 1.2) {
        if (!L.wrongShown) {
          L.wrongShown = true;
          L.hud && L.hud.flash('Falsche Richtung!', 'warn', 0);
          this.audio && this.audio.sfx('wrong');
        }
      } else if (L.wrongShown) {
        L.wrongShown = false;
        L.hud && L.hud.flash('', '', 0.01);
      }
    }
    S.update(dt);
    if (skipRender) return;
    this.updateVisuals(dt, others, phase, raceTime);
    this.render();
  }

  onGo() {
    for (const L of this.locals) {
      L.hud && L.hud.flash('Los!', 'go', 0.9);
      if (L.gasDownAt != null && L.gasDownAt < 0.5 && L.gasDownAt > 0) {
        applyEffect(L.kart, { type: 'boost', t: 1.1, pow: 0.5 });
        L.hud && L.hud.subtitle('Perfekter Start!', 1.6);
        this.audio && this.audio.sfx('boost');
      }
    }
    if (this.audio && this.locals.length) this.audio.sfx('go');
  }

  kartEvents(L, ev, raceTime) {
    const k = L.kart;
    const a = this.audio;
    const primary = L === this.locals[0] || this.locals.length === 1;
    const vol = primary ? 1 : 0.7;
    if (ev & EV.PAD) {
      a && a.sfx('pad', vol);
      this.fx.emit('boost', k.x, k.y + 0.5, k.z, 8);
    }
    if (ev & EV.RING) {
      a && a.sfx('ring', vol);
      this.fx.emit('sparkle', k.x, k.y + 1, k.z, 12);
    }
    if (ev & EV.MINIBOOST) a && a.sfx('miniboost', vol);
    if (ev & EV.LAND) {
      a && a.sfx('land', vol * 0.6);
      this.fx.emit(k.surf === 'snow' ? 'snow' : 'dust', k.x, k.y, k.z, 6);
    }
    if (ev & EV.WALL) a && a.sfx('wall', vol * 0.5);
    if (ev & EV.SPLASH) {
      a && a.sfx('splash', vol);
      this.fx.emit('splash', k.x, k.y + 0.3, k.z, 16);
    }
    if (ev & EV.BURN) {
      this.fx.emit('lava', k.x, k.y + 0.3, k.z, 16);
    }
    if (ev & EV.FALL) {
      a && a.sfx('fall', vol);
      L.hud && L.hud.subtitle('Zurück auf die Strecke…', 1.2);
    }
    if (ev & EV.RESPAWN) this.snapCamera(L);
    if (ev & EV.LAP) {
      if (k.lap >= 2) L.lapTimes.push(raceTime - L.lastLapAt);
      L.lastLapAt = raceTime;
      if (k.lap > this.laps && !L.finished) {
        L.finished = true;
        L.finishTime = raceTime;
        L.sendExtra = { ft: Math.round(raceTime * 1000) };
        const rank = this.session.ranking().filter((id) => id !== L.id);
        let place = 1;
        for (const id of rank) {
          const o = this.othersCache.get(id);
          const lo = this.locals.find((l) => l.id === id);
          if ((o && o.lap > this.laps) || (lo && lo.finished && lo.finishTime <= raceTime)) place++;
        }
        L.place = place;
        L.hud && L.hud.flash(place === 1 ? 'Sieg!' : `Ziel! ${place}. Platz`, 'finish', 0);
        a && a.sfx('finish', vol);
        this.saveLocalRecord(L);
      } else if (k.lap === this.laps && this.laps > 1) {
        L.hud && L.hud.flash('Letzte Runde!', 'lap', 1.6);
        a && a.sfx('finallap', vol);
      } else if (k.lap > 1) {
        L.hud && L.hud.flash(`Runde ${k.lap}`, 'lap', 1.2);
        a && a.sfx('lap', vol);
      }
    }
  }

  saveLocalRecord(L) {
    if (!this.session.offline) return;
    try {
      const key = 'ir.records';
      const rec = JSON.parse(localStorage.getItem(key) || '{}');
      const id = `${this.track.id}:${L.kart.vehicle}`;
      const cur = rec[id] || {};
      const best = L.lapTimes.length ? Math.min(...L.lapTimes) : null;
      if (best != null && (!cur.lap || best * 1000 < cur.lap.time)) cur.lap = { time: Math.round(best * 1000), name: L.name, character: L.kart.character };
      if (this.laps === 3 && (!cur.race || L.finishTime * 1000 < cur.race.time)) cur.race = { time: Math.round(L.finishTime * 1000), name: L.name, character: L.kart.character };
      rec[id] = cur;
      localStorage.setItem(key, JSON.stringify(rec));
    } catch {}
  }

  updateVisuals(dt, others, phase, raceTime) {
    const t = this.t;
    const seen = new Set();
    const states = [];
    for (const L of this.locals) {
      const k = L.kart;
      states.push({ id: L.id, x: k.x, y: k.y, z: k.z, yaw: k.yaw, pitch: k.pitch, roll: k.roll, speed: k.speed, flags: kartFlags(k), steer: k.steerVis, surf: k.surf, grounded: k.grounded, drift: k.drift, driftT: k.driftT, vx: k.vx, vz: k.vz, local: true });
    }
    for (const o of others) states.push(o);
    for (const s of states) {
      const e = this.model(s.id);
      if (!e) continue;
      seen.add(s.id);
      const { m, shadow, tag } = e;
      m.position.set(s.x, s.y, s.z);
      m.rotation.order = 'YXZ';
      const isPlane = (this.players.get(s.id) || {}).vehicle === 'plane';
      m.rotation.set(isPlane ? -(s.pitch || 0) : s.pitch || 0, s.yaw, s.roll || 0);
      animateKart(m, s, dt, t);
      const gh = Math.max(this.track.heightAt(s.x, s.z), this.track.liquid === 'lava' ? -99 : this.track.water);
      shadow.position.set(s.x, gh + 0.08, s.z);
      shadow.rotation.z = s.yaw;
      const air = Math.max(0, s.y - gh);
      shadow.material.opacity = clamp(1 - air / 25, 0.15, 1);
      shadow.visible = m.visible;
      if (tag) {
        tag.position.set(s.x, s.y + 4.6, s.z);
        tag.visible = m.visible;
      }
      const flags = s.flags || 0;
      if (flags & 2 && Math.random() < 0.6) {
        const bx = s.x - Math.sin(s.yaw) * 2.2;
        const bz = s.z - Math.cos(s.yaw) * 2.2;
        this.fx.emit('boost', bx, s.y + 0.6, bz, 1);
      }
      if (s.speed > 12 && flags & 128 && Math.random() < 0.35) {
        const p = this.players.get(s.id);
        const veh = p ? p.vehicle : 'car';
        if (veh !== 'plane') {
          const surf = s.surf;
          if (flags & 256 || (veh === 'hover' && surf === 'water')) this.fx.emit('splash', s.x - Math.sin(s.yaw) * 2, s.y + 0.2, s.z - Math.cos(s.yaw) * 2, 1);
          else if (surf === 'grass') this.fx.emit('grass', s.x - Math.sin(s.yaw) * 1.8, s.y, s.z - Math.cos(s.yaw) * 1.8, 1);
          else if (surf === 'sand' || surf === 'rock') this.fx.emit('dust', s.x - Math.sin(s.yaw) * 1.8, s.y, s.z - Math.cos(s.yaw) * 1.8, 1);
          else if (surf === 'snow' || surf === 'ice') this.fx.emit('snow', s.x - Math.sin(s.yaw) * 1.8, s.y, s.z - Math.cos(s.yaw) * 1.8, 1);
        }
      }
      if (flags & 1) {
        const lvl = flags & 512 ? 'driftOrange' : flags & 1024 ? 'driftBlue' : null;
        if (lvl && Math.random() < 0.7) {
          const rx = -Math.cos(s.yaw);
          const rz = Math.sin(s.yaw);
          for (const side of [-1, 1]) this.fx.emit(lvl, s.x - Math.sin(s.yaw) * 1.3 + rx * side * 1.1, s.y + 0.2, s.z - Math.cos(s.yaw) * 1.3 + rz * side * 1.1, 1);
        }
      }
    }
    for (const id of [...this.models.keys()]) if (!seen.has(id)) this.removeModel(id);
    const projs = this.session.projectiles();
    const pseen = new Set();
    for (const p of projs) {
      let m = this.missiles.get(p.id);
      if (!m) {
        m = createMissile();
        this.scene.add(m);
        this.missiles.set(p.id, m);
      }
      pseen.add(p.id);
      m.position.set(p.x, p.y, p.z);
      m.rotation.y = p.yaw;
      m.userData.flame.scale.set(0.24, 0.8 + Math.random() * 0.6, 0.24);
      if (Math.random() < 0.5) this.fx.emit('smoke', p.x - Math.sin(p.yaw) * 1.5, p.y, p.z - Math.cos(p.yaw) * 1.5, 1);
    }
    for (const [id, m] of this.missiles) {
      if (!pseen.has(id)) {
        this.scene.remove(m);
        this.missiles.delete(id);
      }
    }
    for (const m of this.traps.values()) {
      if (m.userData.light) m.userData.light.visible = Math.sin(t * 10) > 0;
      if (m.userData.kind === 'bubble') m.position.y += Math.sin(t * 3) * 0.003;
    }
    this.world.update(t);
    this.fx.update(dt);
    const rank = this.session.ranking();
    const total = rank.length;
    for (const L of this.locals) {
      this.updateCamera(L, dt);
      if (!L.hud) continue;
      const k = L.kart;
      const place = L.finished && L.place ? L.place : rank.indexOf(L.id) + 1 || total;
      L.hud.update({
        lap: k.lap, laps: this.laps, finished: L.finished, time: L.finished ? L.finishTime : phase === 'countdown' ? 0 : raceTime,
        bestLap: L.lapTimes.length ? Math.min(...L.lapTimes) : null, place, total, item: L.item, level: L.level, coins: k.coins, speed: k.speed, boost: k.boostT > 0
      });
      if (this.audio && !this.attract) this.audio.updateEngine(L.id, k.vehicle, k.respawnT > 0 ? 0 : k.speed, k.boostT > 0, 1 / this.locals.length);
    }
    if (this.spectator) this.updateSpectator(dt, states);
    if (this.overview) {
      const c = this.track.center;
      const a = t * 0.05;
      this.overview.cam.position.set(c.x + Math.cos(a) * 320, 230, c.z + Math.sin(a) * 320);
      this.overview.cam.lookAt(c.x, 0, c.z);
    }
    if (this.minimap) this.minimap.draw(states, this.localIds);
  }

  render() {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const views = this.locals.length ? this.locals.map((l) => ({ cam: l.cam, vp: l.vp, id: l.id })) : [{ cam: this.spectator.cam, vp: this.spectator.vp }];
    if (this.overview) views.push(this.overview);
    r.setScissorTest(true);
    for (const v of views) {
      const own = v.id ? this.models.get(v.id) : null;
      const tagWas = own && own.tag ? own.tag.visible : false;
      if (own && own.tag) own.tag.visible = false;
      const x = Math.floor(v.vp.x * size.x);
      const w = Math.floor(v.vp.w * size.x);
      const h = Math.floor(v.vp.h * size.y);
      const y = Math.floor((1 - v.vp.y - v.vp.h) * size.y);
      r.setViewport(x, y, w, h);
      r.setScissor(x, y, w, h);
      v.cam.aspect = w / Math.max(1, h);
      v.cam.updateProjectionMatrix();
      r.render(this.scene, v.cam);
      if (own && own.tag) own.tag.visible = tagWas;
    }
    r.setScissorTest(false);
  }

  dispose() {
    clearTimeout(this.resultsTimer);
    this.session.leave();
    this.scene.remove(this.world.group);
    for (const L of this.locals) L.hud && L.hud.destroy();
    this.minimap && this.minimap.destroy();
    this.specLabel && this.specLabel.remove();
    this.fx.clear();
    if (this.audio && !this.attract) this.audio.stopEngines();
    for (const m of this.world.balloons.values()) m.visible = true;
    for (const m of this.world.coins.values()) m.visible = true;
  }
}

