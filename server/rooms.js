import crypto from 'node:crypto';
import { RaceSim } from '../shared/race.js';
import { TRACKS, trackById } from '../shared/tracks.js';
import { CHARACTER_IDS, VEHICLE_IDS, MAX_PLAYERS, BOT_NAMES, DIFFICULTIES } from '../shared/constants.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TICK = 1 / 30;

export function cleanName(name) {
  return String(name || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}

export class RoomManager {
  constructor({ store, config, log = console }) {
    this.store = store;
    this.config = config;
    this.log = log;
    this.rooms = new Map();
    this.clients = new Set();
    this.seq = 0;
    this.timer = setInterval(() => this.tick(), TICK * 1000);
    this.pingTimer = setInterval(() => this.heartbeat(), 15000);
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.pingTimer);
  }

  stats() {
    return { rooms: this.rooms.size, clients: this.clients.size };
  }

  connect(ws, ip) {
    const c = {
      id: 'p' + (++this.seq).toString(36) + crypto.randomBytes(2).toString('hex'),
      ws, ip, name: 'Gast', character: 'ruffy', vehicle: 'car', user: null, room: null, ready: false,
      hello: false, alive: true, rtt: 0, winStart: Date.now(), winCount: 0, lastChat: 0
    };
    this.clients.add(c);
    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      const now = Date.now();
      if (now - c.winStart > 1000) {
        c.winStart = now;
        c.winCount = 0;
      }
      if (++c.winCount > 150) {
        if (c.winCount > 400) ws.close(1008, 'flood');
        return;
      }
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;
      try {
        this.handle(c, msg);
      } catch (err) {
        this.log.error('handler error', err);
      }
    });
    ws.on('pong', () => (c.alive = true));
    ws.on('close', () => this.disconnect(c));
    ws.on('error', () => {});
  }

  heartbeat() {
    for (const c of this.clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      try {
        c.ws.ping();
      } catch {}
    }
  }

  send(c, msg) {
    if (c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  error(c, code, text) {
    this.send(c, { t: 'error', code, text });
  }

  disconnect(c) {
    this.clients.delete(c);
    if (c.room) this.leaveRoom(c);
  }

  handle(c, m) {
    if (m.t === 'hello') return this.onHello(c, m);
    if (!c.hello) return;
    switch (m.t) {
      case 'ping':
        this.send(c, { t: 'pong', t0: m.t0 });
        if (Number.isFinite(m.rtt)) c.rtt = Math.max(0, Math.min(9999, Math.round(m.rtt)));
        return;
      case 'profile':
        if (m.name && !c.user) c.name = this.guestName(m.name);
        if (CHARACTER_IDS.includes(m.character)) c.character = m.character;
        if (VEHICLE_IDS.includes(m.vehicle)) c.vehicle = m.vehicle;
        if (c.user && CHARACTER_IDS.includes(m.character)) this.store.setCharacter(c.user.id, m.character);
        if (c.room) this.broadcastRoom(c.room);
        return;
      case 'rooms':
        return this.send(c, { t: 'rooms', rooms: this.publicRooms() });
      case 'create':
        return this.createRoom(c, !!m.public);
      case 'join':
        return this.joinRoom(c, String(m.code || '').trim().toUpperCase());
      case 'leave':
        if (c.room) this.leaveRoom(c);
        return this.send(c, { t: 'left' });
    }
    const room = c.room;
    if (!room) return;
    switch (m.t) {
      case 'loadout':
        if (CHARACTER_IDS.includes(m.character)) c.character = m.character;
        if (VEHICLE_IDS.includes(m.vehicle)) c.vehicle = m.vehicle;
        return this.broadcastRoom(room);
      case 'ready':
        if (room.state !== 'lobby') return;
        c.ready = !!m.ready;
        return this.broadcastRoom(room);
      case 'settings':
        if (room.hostId !== c.id || room.state !== 'lobby') return;
        this.applySettings(room, m.settings || {});
        return this.broadcastRoom(room);
      case 'start':
        if (room.hostId !== c.id) return;
        return this.startRace(room);
      case 'loaded':
        if (room.state === 'loading' && room.participants.has(c.id)) {
          room.loaded.add(c.id);
          if ([...room.participants].every((id) => room.loaded.has(id) || !room.members.has(id))) this.beginRace(room);
        }
        return;
      case 'st':
        if (room.state === 'race' && room.sim && room.participants.has(c.id)) room.sim.setHumanState(c.id, m);
        return;
      case 'use':
        if (room.state === 'race' && room.sim && room.participants.has(c.id)) room.sim.useItem(c.id);
        return;
      case 'chat': {
        const text = String(m.text || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
        const now = Date.now();
        if (!text || now - c.lastChat < 600) return;
        c.lastChat = now;
        return this.broadcast(room, { t: 'chat', id: c.id, name: c.name, text });
      }
      case 'kick': {
        if (room.hostId !== c.id || m.id === c.id) return;
        const target = room.members.get(m.id);
        if (target) {
          this.send(target, { t: 'kicked' });
          this.leaveRoom(target);
        }
        return;
      }
      case 'abort':
        if (room.hostId === c.id && (room.state === 'race' || room.state === 'loading')) {
          if (room.sim && !room.sim.ended) room.sim.end();
          else this.toLobby(room);
        }
        return;
    }
  }

  guestName(name) {
    let n = cleanName(name) || 'Gast';
    if (this.store && this.store.userByName(n)) n = (n.slice(0, 11) + ' (G)').slice(0, 16);
    return n;
  }

  onHello(c, m) {
    let user = null;
    if (m.token && this.store) user = this.store.userByToken(m.token);
    if (this.config.requireAccount && !user) {
      this.error(c, 'auth_required', 'Auf diesem Server brauchst du einen Account.');
      return;
    }
    c.user = user;
    c.name = user ? user.username : this.guestName(m.name);
    if (CHARACTER_IDS.includes(m.character)) c.character = m.character;
    else if (user && CHARACTER_IDS.includes(user.character)) c.character = user.character;
    if (VEHICLE_IDS.includes(m.vehicle)) c.vehicle = m.vehicle;
    c.hello = true;
    this.send(c, { t: 'welcome', id: c.id, name: c.name, account: user ? { name: user.username } : null });
  }

  publicRooms() {
    const out = [];
    for (const r of this.rooms.values()) {
      if (!r.public) continue;
      const host = r.members.get(r.hostId);
      out.push({ code: r.code, host: host ? host.name : '?', players: r.members.size, state: r.state, track: r.settings.trackId });
    }
    return out.slice(0, 30);
  }

  makeCode() {
    for (let tries = 0; tries < 1000; tries++) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('no code');
  }

  createRoom(c, isPublic) {
    if (c.room) this.leaveRoom(c);
    if (this.rooms.size >= this.config.maxRooms) return this.error(c, 'full', 'Der Server hat zu viele Räume.');
    const room = {
      code: this.makeCode(), public: isPublic, hostId: c.id, members: new Map(), state: 'lobby',
      settings: { trackId: TRACKS[0].id, laps: 3, items: true, difficulty: 'normal', vehicleMode: 'free', bots: 3 },
      sim: null, participants: new Set(), loaded: new Set(), points: new Map(), raceNo: 0, events: [], loadTimer: null, created: Date.now()
    };
    this.rooms.set(room.code, room);
    this.addMember(room, c);
  }

  joinRoom(c, code) {
    const room = this.rooms.get(code);
    if (!room) return this.error(c, 'not_found', 'Diesen Raum gibt es nicht (mehr).');
    if (room.members.has(c.id)) return this.broadcastRoom(room);
    if (room.members.size >= MAX_PLAYERS) return this.error(c, 'full', 'Der Raum ist voll.');
    if (c.room) this.leaveRoom(c);
    this.addMember(room, c);
  }

  addMember(room, c) {
    c.room = room;
    c.ready = false;
    room.members.set(c.id, c);
    if (!room.points.has(c.id)) room.points.set(c.id, 0);
    this.send(c, { t: 'joined', code: room.code });
    this.broadcastRoom(room);
    this.broadcast(room, { t: 'chat', system: true, text: `${c.name} ist beigetreten.` });
    if ((room.state === 'race' || room.state === 'loading') && room.sim) {
      this.send(c, { t: 'race', info: room.sim.info(), spectate: true });
    }
  }

  leaveRoom(c) {
    const room = c.room;
    if (!room) return;
    room.members.delete(c.id);
    c.room = null;
    c.ready = false;
    if (room.sim && room.participants.has(c.id)) room.sim.removePlayer(c.id);
    room.participants.delete(c.id);
    if (room.members.size === 0) {
      clearTimeout(room.loadTimer);
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostId === c.id) room.hostId = room.members.keys().next().value;
    this.broadcast(room, { t: 'chat', system: true, text: `${c.name} hat den Raum verlassen.` });
    if (room.state === 'loading' && [...room.participants].every((id) => room.loaded.has(id))) this.beginRace(room);
    this.broadcastRoom(room);
  }

  applySettings(room, s) {
    const st = room.settings;
    if (TRACKS.some((t) => t.id === s.trackId)) st.trackId = s.trackId;
    if (Number.isInteger(s.laps)) st.laps = Math.max(1, Math.min(9, s.laps));
    if (typeof s.items === 'boolean') st.items = s.items;
    if (DIFFICULTIES[s.difficulty]) st.difficulty = s.difficulty;
    if (s.vehicleMode === 'free' || s.vehicleMode === 'track') st.vehicleMode = s.vehicleMode;
    if (Number.isInteger(s.bots)) st.bots = Math.max(0, Math.min(MAX_PLAYERS - 1, s.bots));
    if (typeof s.public === 'boolean') room.public = s.public;
  }

  roomState(room) {
    return {
      t: 'room', code: room.code, public: room.public, host: room.hostId, state: room.state, settings: room.settings, raceNo: room.raceNo,
      members: [...room.members.values()].map((m) => ({
        id: m.id, name: m.name, character: m.character, vehicle: m.vehicle, ready: m.ready || m.id === room.hostId,
        account: !!m.user, points: room.points.get(m.id) || 0, ping: m.rtt, racing: room.participants.has(m.id) && room.state !== 'lobby'
      }))
    };
  }

  broadcastRoom(room) {
    this.broadcast(room, this.roomState(room));
  }

  broadcast(room, msg) {
    const data = JSON.stringify(msg);
    for (const m of room.members.values()) this.send(m, data);
  }

  startRace(room) {
    if (room.state !== 'lobby') return;
    const notReady = [...room.members.values()].filter((m) => m.id !== room.hostId && !m.ready);
    if (notReady.length) {
      const host = room.members.get(room.hostId);
      return this.error(host, 'not_ready', `Noch nicht bereit: ${notReady.map((m) => m.name).join(', ')}`);
    }
    room.state = 'loading';
    room.participants = new Set(room.members.keys());
    room.loaded = new Set();
    this.broadcast(room, { t: 'prepare', trackId: room.settings.trackId });
    this.broadcastRoom(room);
    clearTimeout(room.loadTimer);
    room.loadTimer = setTimeout(() => this.beginRace(room), 12000);
  }

  beginRace(room) {
    if (room.state !== 'loading') return;
    clearTimeout(room.loadTimer);
    for (const id of [...room.participants]) if (!room.members.has(id)) room.participants.delete(id);
    if (!room.participants.size) return this.toLobby(room);
    const st = room.settings;
    const def = trackById(st.trackId);
    const humans = [...room.participants].map((id) => room.members.get(id));
    const players = humans.map((m) => ({
      id: m.id, name: m.name, character: m.character, bot: false, userId: m.user ? m.user.id : null,
      vehicle: st.vehicleMode === 'track' ? def.defaultVehicle : m.vehicle
    }));
    const botCount = Math.max(0, Math.min(st.bots, MAX_PLAYERS - humans.length));
    const taken = new Set(humans.map((h) => h.character));
    const free = CHARACTER_IDS.filter((ch) => !taken.has(ch));
    const pool = free.length ? free : CHARACTER_IDS;
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < botCount; i++) {
      players.push({ id: 'bot' + i, name: names[i % names.length] + ' (CPU)', character: pool[i % pool.length], vehicle: def.defaultVehicle, bot: true });
    }
    room.events = [];
    room.sim = new RaceSim({
      trackId: st.trackId, laps: st.laps, items: st.items, difficulty: st.difficulty, players, seed: crypto.randomInt(1e9),
      emit: (type, d) => room.events.push([type, d])
    });
    room.state = 'race';
    room.raceNo++;
    const info = room.sim.info();
    for (const m of room.members.values()) this.send(m, { t: 'race', info, spectate: !room.participants.has(m.id) });
    this.broadcastRoom(room);
  }

  toLobby(room) {
    room.state = 'lobby';
    room.sim = null;
    room.participants = new Set();
    for (const m of room.members.values()) m.ready = false;
    this.broadcastRoom(room);
  }

  tick() {
    for (const room of this.rooms.values()) {
      if (room.state !== 'race' || !room.sim) continue;
      const sim = room.sim;
      sim.update(TICK / 2);
      sim.update(TICK / 2);
      const ev = room.events;
      room.events = [];
      this.broadcast(room, { t: 'snap', s: sim.snapshot(), ev });
      if (sim.ended) this.finishRace(room, sim);
    }
  }

  finishRace(room, sim) {
    const results = sim.results || [];
    const humans = results.filter((r) => !r.bot).length;
    for (const r of results) {
      if (room.points.has(r.id)) room.points.set(r.id, room.points.get(r.id) + r.points);
      if (r.userId && this.store && (r.bestLap != null || r.time != null)) {
        try {
          this.store.recordResult(r.userId, sim.trackId, r.vehicle, r.bestLap, r.time, sim.laps, r.place === 1 && humans > 1);
        } catch (err) {
          this.log.error('record error', err);
        }
      }
    }
    const withTotals = results.map((r) => ({ ...r, total: room.points.get(r.id) ?? null }));
    this.broadcast(room, { t: 'results', trackId: sim.trackId, laps: sim.laps, results: withTotals });
    this.toLobby(room);
  }
}
