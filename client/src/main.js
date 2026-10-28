import * as THREE from 'three';
import { TRACKS, trackById, THEMES } from '../../shared/tracks.js';
import { CHARACTERS, characterById, VEHICLES, DIFFICULTIES, BOT_NAMES, MAX_PLAYERS } from '../../shared/constants.js';
import { formatTime } from '../../shared/math.js';
import { getTrack } from '../../shared/trackgen.js';
import { Game, preloadWorld } from './game.js';
import { LocalSession, OnlineSession } from './session.js';
import { NetClient, api, isServed, normalizeServer } from './net.js';
import { AudioEngine } from './audio.js';
import { pollInput, endFrame, joinPresses, menuNav, padAxisEdge, anyPadEdge, anyPadActivity, DEVICE_NAMES } from './input.js';
import { portrait } from './render/portraits.js';
import { escapeHtml as esc } from './hud.js';

const $ = (s, el = document) => el.querySelector(s);
const ui = $('#ui');
const hudRoot = $('#hud');
const canvas = $('#view');

function load(key, def) {
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(key) || '{}') };
  } catch {
    return { ...def };
  }
}
function save(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

const profile = load('ir.profile', { name: '', character: 'ruffy', vehicle: 'car' });
const account = load('ir.account', { token: null, name: null, server: null });
const settings = load('ir.settings', { quality: 'high', invertPlane: false, server: '' });
const saveProfile = () => save('ir.profile', profile);
const saveAccount = () => save('ir.account', account);
const saveSettings = () => save('ir.settings', settings);

const audio = new AudioEngine();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
function applyQuality() {
  renderer.setPixelRatio(settings.quality === 'low' ? Math.min(1, devicePixelRatio) * 0.75 : Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight, false);
}
applyQuality();
addEventListener('resize', applyQuality);

let screen = 'title';
let game = null;
let attract = null;
let net = null;
let serverCfg = null;
let room = null;
let myId = null;
let lastResults = null;
let localState = null;
let pauseOpen = false;

function serverBase() {
  if (settings.server) return normalizeServer(settings.server);
  return isServed() ? location.origin : '';
}

function toast(text, ms = 2600) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), ms);
}

function setScreen(name, html) {
  screen = name;
  pauseOpen = false;
  ui.innerHTML = html;
  document.body.classList.toggle('in-race', name === 'race');
  const first = ui.querySelector('[autofocus]');
  if (first) first.focus({ preventScroll: true });
}

function charImg(id, veh = 'car', cls = '') {
  const src = portrait(id, veh, 'head');
  return src ? `<img class="${cls}" src="${src}" alt="${esc(characterById(id).name)}">` : '';
}

function startAttract() {
  if (attract || game) return;
  const tr = TRACKS[(Math.random() * TRACKS.length) | 0];
  const players = CHARACTERS.slice(0, 6).map((c, i) => ({ id: 'a' + i, name: c.name, character: c.id, vehicle: tr.defaultVehicle, bot: true }));
  const session = new LocalSession({ trackId: tr.id, laps: 99, items: true, difficulty: 'hard', players, attract: true });
  attract = new Game({ renderer, session, audio, attract: true, hudRoot: null });
  for (let i = 0; i < 150; i++) attract.frame(1 / 30, true);
}

function stopAttract() {
  if (!attract) return;
  attract.dispose();
  attract = null;
}

function endGame() {
  if (game) {
    game.dispose();
    game = null;
  }
  hudRoot.innerHTML = '';
}

function topRightAccount() {
  const base = serverBase();
  if (!base) return '';
  if (account.token && account.name) {
    return `<div class="account-chip">${charImg(profile.character)}<span>${esc(account.name)}</span><button class="btn small sand" data-act="logout">Abmelden</button></div>`;
  }
  return `<button class="btn small sand" data-act="account">Anmelden / Registrieren</button>`;
}

function showTitle() {
  endGame();
  startAttract();
  audio.playSong('menu');
  setScreen('title', `
    <div class="screen title-layout">
      <div class="title-top">
        <div>
          <h1 class="logo big"><span>Insel</span><span>Rallye</span></h1>
          <nav class="title-menu">
            <button class="btn big coral" data-act="local" autofocus><svg class="btn-ico" viewBox="0 0 32 32"><rect x="3" y="8" width="26" height="16" rx="5" fill="#fff" stroke="#12305a" stroke-width="3"/><circle cx="11" cy="16" r="3" fill="#12305a"/><circle cx="22" cy="14" r="2" fill="#12305a"/><circle cx="24" cy="18" r="2" fill="#12305a"/></svg>Lokal spielen<span class="key">1–4 Spieler</span></button>
            <button class="btn big lagoon" data-act="online"><svg class="btn-ico" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#fff" stroke="#12305a" stroke-width="3"/><path d="M4 16h24M16 4c-6 7-6 17 0 24M16 4c6 7 6 17 0 24" stroke="#12305a" stroke-width="2.5" fill="none"/></svg>Online spielen<span class="key">Code &amp; Einladung</span></button>
            <button class="btn big" data-act="records">Bestzeiten</button>
            <div class="row">
              <button class="btn sand grow" data-act="controls">Steuerung</button>
              <button class="btn sand grow" data-act="settings">Einstellungen</button>
            </div>
          </nav>
        </div>
        <div class="row">${topRightAccount()}</div>
      </div>
      <div class="title-hint">Controller einstecken und A drücken – oder einfach mit der Maus klicken.</div>
    </div>`);
}

const LOCAL_DEFAULT = { trackId: TRACKS[0].id, laps: 3, cpus: 4, difficulty: 'normal', items: true };

function showLocal() {
  startAttract();
  audio.playSong('menu');
  const saved = load('ir.local', LOCAL_DEFAULT);
  localState = localState || { slots: [], ...saved };
  setScreen('local', `
    <div class="screen dim">
      <div class="wide two-col">
        <section class="panel">
          <div class="topbar"><h2>Wer fährt mit?</h2><button class="btn small sand" data-act="title" data-back>Zurück</button></div>
          <div class="slots" id="slots"></div>
        </section>
        <section class="panel">
          <h2 id="racePanel">Rennen</h2>
          <div class="tracks" id="tracks"></div>
          <div class="track-desc" id="trackDesc"></div>
          <div id="raceSettings"></div>
          <div class="row" style="margin-top:16px"><button class="btn big coral grow" data-act="startLocal">Rennen starten</button></div>
        </section>
      </div>
    </div>`);
  renderTracks($('#tracks'), localState.trackId, (id) => {
    localState.trackId = id;
    saveLocalSettings();
    renderLocalSettings();
  });
  renderLocalSettings();
  renderSlots();
}

function saveLocalSettings() {
  const { trackId, laps, cpus, difficulty, items } = localState;
  save('ir.local', { trackId, laps, cpus, difficulty, items });
}

function seg(name, options, value) {
  return `<div class="seg" data-seg="${name}">${options.map(([v, label]) => `<button type="button" data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
}

function renderLocalSettings() {
  const st = localState;
  const humans = Math.max(1, st.slots.length);
  const maxCpu = MAX_PLAYERS - humans;
  if (st.cpus > maxCpu) st.cpus = maxCpu;
  $('#trackDesc').textContent = trackById(st.trackId).desc;
  $('#raceSettings').innerHTML = `
    <div class="setting-row"><span>Runden</span>${seg('laps', [[1, '1'], [2, '2'], [3, '3'], [5, '5']], st.laps)}</div>
    <div class="setting-row"><span>Computer-Fahrer</span>${seg('cpus', Array.from({ length: maxCpu + 1 }, (_, i) => [i, String(i)]), st.cpus)}</div>
    <div class="setting-row"><span>Stärke</span>${seg('difficulty', Object.entries(DIFFICULTIES).map(([k, d]) => [k, d.name]), st.difficulty)}</div>
    <div class="setting-row"><span>Ballons &amp; Items</span>${seg('items', [['true', 'An'], ['false', 'Aus']], String(st.items))}</div>`;
  $('#raceSettings').querySelectorAll('[data-seg]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const k = el.dataset.seg;
      const v = b.dataset.v;
      st[k] = k === 'difficulty' ? v : k === 'items' ? v === 'true' : Number(v);
      audio.sfx('click');
      saveLocalSettings();
      renderLocalSettings();
      const again = $(`#raceSettings [data-seg="${k}"] [data-v="${v}"]`);
      if (again) again.focus({ preventScroll: true });
    });
  });
}

function nextFreeChar(exclude) {
  return CHARACTERS.find((c) => !exclude.includes(c.id))?.id || CHARACTERS[0].id;
}

function addSlot(device) {
  const st = localState;
  if (st.slots.length >= 4) return;
  const taken = st.slots.map((s) => s.character);
  const pref = st.slots.length === 0 ? profile.character : nextFreeChar(taken);
  st.slots.push({ device, character: taken.includes(pref) ? nextFreeChar(taken) : pref, vehicle: st.slots.length === 0 ? profile.vehicle : trackById(st.trackId).defaultVehicle, ready: false });
  audio.sfx('join');
  renderSlots();
  renderLocalSettings();
}

function renderSlots() {
  const el = $('#slots');
  if (!el) return;
  const st = localState;
  let html = '';
  for (let i = 0; i < 4; i++) {
    const s = st.slots[i];
    if (!s) {
      html += `<div class="slot"><div class="pname">Spieler ${i + 1}</div><div class="hint">${i === 0 ? 'Drücke <span class="kbd">Leertaste</span>, <span class="kbd">Enter</span><br>oder <span class="kbd">A</span> am Controller' : 'Zum Beitreten <span class="kbd">A</span> am Controller<br>oder freie Tastaturseite'}</div>${i === st.slots.length ? `<button class="btn small sand" data-act="addMouse">Mit Tastatur beitreten</button>` : ''}</div>`;
      continue;
    }
    const ch = characterById(s.character);
    html += `<div class="slot joined ${s.ready ? 'ready' : ''}" data-slot="${i}">
      <div class="pname">${i === 0 && profile.name ? esc(profile.name) : `Spieler ${i + 1}`}</div>
      <div class="dev">${DEVICE_NAMES[s.device] || s.device}</div>
      <div class="picker"><button class="arrow" data-slotact="prev" aria-label="Vorherige Figur">‹</button>${charImg(s.character, s.vehicle, 'portrait')}<button class="arrow" data-slotact="next" aria-label="Nächste Figur">›</button></div>
      <div><b>${ch.name}</b> <span class="muted">${ch.animal}</span></div>
      <div class="vrow">${Object.values(VEHICLES).map((v) => `<button data-slotact="veh" data-v="${v.id}" class="${s.vehicle === v.id ? 'on' : ''}">${v.name}</button>`).join('')}</div>
      <div class="row"><button class="btn small ${s.ready ? 'leaf' : 'sand'}" data-slotact="ready">${s.ready ? 'Bereit!' : 'Bereit?'}</button><button class="btn small sand" data-slotact="remove">Entfernen</button></div>
      <div class="hint">${s.ready ? 'Rechts Strecke wählen, Bestätigen startet' : '◀ ▶ Figur · ▲ ▼ Fahrzeug · Bestätigen = bereit'}</div>
    </div>`;
  }
  el.innerHTML = html;
}

function slotAction(i, act, v) {
  const st = localState;
  const s = st.slots[i];
  if (!s) return;
  const idx = CHARACTERS.findIndex((c) => c.id === s.character);
  if (act === 'prev' || act === 'next') {
    s.character = CHARACTERS[(idx + (act === 'next' ? 1 : -1) + CHARACTERS.length) % CHARACTERS.length].id;
    s.ready = false;
  } else if (act === 'veh') {
    s.vehicle = v;
    s.ready = false;
  } else if (act === 'vehNext' || act === 'vehPrev') {
    const ids = Object.keys(VEHICLES);
    s.vehicle = ids[(ids.indexOf(s.vehicle) + (act === 'vehNext' ? 1 : -1) + ids.length) % ids.length];
    s.ready = false;
  } else if (act === 'ready') s.ready = !s.ready;
  else if (act === 'remove') st.slots.splice(i, 1);
  if (i === 0 && st.slots[0]) {
    profile.character = st.slots[0].character;
    profile.vehicle = st.slots[0].vehicle;
    saveProfile();
  }
  audio.sfx('click');
  renderSlots();
  renderLocalSettings();
  if (act === 'ready' && s.ready) {
    padFocus(true);
    const startBtn = $('[data-act=startLocal]');
    if (startBtn) startBtn.focus({ preventScroll: true });
  }
}

function localTick() {
  const st = localState;
  const taken = st.slots.map((s) => s.device);
  for (const dev of joinPresses(taken)) {
    if (st.slots.length >= 4) break;
    addSlot(dev);
    return;
  }
  const panel = $('#racePanel') ? $('#racePanel').closest('.panel') : null;
  st.slots.forEach((s, i) => {
    const n = menuNav(s.device === 'kball' ? 'kb1' : s.device);
    if (s.ready && panel) {
      const dir = n.left ? 'left' : n.right ? 'right' : n.up ? 'up' : n.down ? 'down' : null;
      if (dir) {
        padFocus(true);
        spatialMove(dir, panel);
      } else if (n.confirm) {
        const f = document.activeElement;
        if (f && panel.contains(f)) f.click();
        else $('[data-act=startLocal]').click();
      } else if (n.back) slotAction(i, 'ready');
      return;
    }
    if (n.left) slotAction(i, 'prev');
    else if (n.right) slotAction(i, 'next');
    else if (n.up) slotAction(i, 'vehPrev');
    else if (n.down) slotAction(i, 'vehNext');
    else if (n.confirm) slotAction(i, 'ready');
    else if (n.back) slotAction(i, s.ready ? 'ready' : 'remove');
  });
}

function startLocalRace() {
  const st = localState;
  if (!st.slots.length) addSlot('kball');
  const kbSlots = st.slots.filter((s) => s.device.startsWith('kb'));
  if (kbSlots.length === 1) kbSlots[0].device = 'kball';
  const def = trackById(st.trackId);
  const players = st.slots.map((s, i) => ({ id: 'p' + (i + 1), name: i === 0 && profile.name ? profile.name : `Spieler ${i + 1}`, character: s.character, vehicle: s.vehicle, bot: false, local: true }));
  const taken = new Set(players.map((p) => p.character));
  const pool = CHARACTERS.filter((c) => !taken.has(c.id)).map((c) => c.id);
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < st.cpus; i++) players.push({ id: 'cpu' + i, name: names[i], character: pool[i % pool.length] || CHARACTERS[i].id, vehicle: def.defaultVehicle, bot: true });
  const session = new LocalSession({ trackId: st.trackId, laps: st.laps, items: st.items, difficulty: st.difficulty, players });
  st.slots.forEach((s) => (s.ready = false));
  startGame(session, st.slots.map((s) => ({ device: s.device })), 'local');
}

function startGame(session, locals, mode) {
  stopAttract();
  endGame();
  setScreen('race', '');
  game = new Game({
    renderer, session, locals, audio, settings, hudRoot,
    onResults: (d) => showResults(d, mode),
    onPause: () => openPause(mode)
  });
  game.mode = mode;
}

function openPause(mode) {
  if (pauseOpen || screen !== 'race' || !game) return;
  pauseOpen = true;
  if (mode === 'local') game.setPaused(true);
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.id = 'pause';
  wrap.innerHTML = `<div class="pause-menu panel"><h2>Pause</h2>
    <button class="btn big leaf" data-act="resume" autofocus>Weiterfahren</button>
    ${mode === 'local' ? '<button class="btn big" data-act="restart">Neu starten</button><button class="btn big sand" data-act="quitLocal">Zum Menü</button>' : '<button class="btn big sand" data-act="leaveRoom">Raum verlassen</button>'}
  </div>`;
  ui.appendChild(wrap);
  wrap.querySelector('[autofocus]').focus();
}

function closePause() {
  endFrame();
  const p = $('#pause');
  if (p) p.remove();
  pauseOpen = false;
  if (game) game.setPaused(false);
}

function vehicleName(v) {
  return VEHICLES[v]?.name || v;
}

function showResults(d, mode) {
  lastResults = { d, mode };
  const myIds = game ? new Set(game.session.localIds) : new Set();
  endGame();
  startAttract();
  audio.playSong('menu');
  const tr = trackById(d.trackId);
  const online = mode === 'online';
  const rows = d.results.map((r) => `<tr class="rrow ${myIds.has(r.id) ? 'me' : ''}">
      <td>${r.place}.</td>
      <td>${charImg(r.character, r.vehicle)}</td>
      <td>${esc(r.name)}<div class="muted">${vehicleName(r.vehicle)}</div></td>
      <td class="num">${r.time != null ? formatTime(r.time) : 'nicht im Ziel'}</td>
      <td class="num">${r.bestLap != null ? formatTime(r.bestLap) : '–'}</td>
      <td class="num">+${r.points}</td>
      ${online ? `<td class="num">${r.total ?? '–'}</td>` : ''}
    </tr>`).join('');
  setScreen('results', `
    <div class="screen dim"><div class="center-col" style="width:min(820px,100%)">
      <section class="panel">
        <div class="topbar"><h2>Ergebnis – ${esc(tr.name)}</h2><span class="muted">${d.laps} ${d.laps === 1 ? 'Runde' : 'Runden'}</span></div>
        <table class="results"><thead><tr><th>Platz</th><th></th><th>Fahrer</th><th class="num">Zeit</th><th class="num">Beste Runde</th><th class="num">Punkte</th>${online ? '<th class="num">Gesamt</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
        <div class="row" style="margin-top:14px">
          ${online ? '<button class="btn big coral grow" data-act="backLobby" autofocus>Zur Lobby</button>' : `
            <button class="btn big coral grow" data-act="again" autofocus>Nochmal</button>
            <button class="btn big lagoon grow" data-act="nextTrack">Nächste Strecke</button>
            <button class="btn big sand" data-act="local">Einstellungen</button>`}
        </div>
      </section>
    </div></div>`);
}

function renderTracks(el, selected, onPick, disabled = false) {
  el.innerHTML = TRACKS.map((t) => `<button type="button" class="track-card ${t.id === selected ? 'on' : ''}" data-track="${t.id}" ${disabled ? 'disabled' : ''}><canvas width="160" height="120"></canvas><span class="tname">${esc(t.name)}</span><span class="tveh">${vehicleName(t.defaultVehicle)}</span></button>`).join('');
  el.querySelectorAll('.track-card').forEach((card) => {
    drawTrackThumb(card.querySelector('canvas'), card.dataset.track);
    if (!disabled)
      card.addEventListener('click', () => {
        el.querySelectorAll('.track-card').forEach((c) => c.classList.toggle('on', c === card));
        audio.sfx('click');
        onPick(card.dataset.track);
      });
  });
}

const thumbCache = new Map();
function drawTrackThumb(cv, id) {
  const x = cv.getContext('2d');
  if (thumbCache.has(id)) {
    x.drawImage(thumbCache.get(id), 0, 0);
    return;
  }
  const def = trackById(id);
  const th = THEMES[def.theme];
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const g = x.createLinearGradient(0, 0, 0, 120);
  g.addColorStop(0, hex(th.liquid));
  g.addColorStop(1, hex(th.liquidDeep));
  x.fillStyle = g;
  x.fillRect(0, 0, 160, 120);
  const pts = def.points;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[1]);
    maxZ = Math.max(maxZ, p[1]);
  }
  const sc = Math.min(130 / (maxX - minX), 90 / (maxZ - minZ));
  const ox = (160 - (maxX - minX) * sc) / 2;
  const oz = (120 - (maxZ - minZ) * sc) / 2;
  const P = (p) => [ox + (p[0] - minX) * sc, oz + (p[1] - minZ) * sc];
  const path = () => {
    x.beginPath();
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = P(pts[i]);
      const b = P(pts[(i + 1) % n]);
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (i === 0) x.moveTo(m[0], m[1]);
      else x.quadraticCurveTo(a[0], a[1], m[0], m[1]);
    }
    const a = P(pts[0]);
    const b = P(pts[1]);
    x.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    x.closePath();
  };
  x.lineJoin = 'round';
  path();
  x.strokeStyle = hex(th.grass);
  x.lineWidth = 26;
  x.stroke();
  x.strokeStyle = '#12305a';
  x.lineWidth = 11;
  x.stroke();
  x.strokeStyle = hex(th.road === 0x6b6f78 ? 0xfff4d6 : th.sand);
  x.lineWidth = 6;
  x.stroke();
  const s = P(pts[0]);
  x.fillStyle = '#ff5d5d';
  x.fillRect(s[0] - 5, s[1] - 5, 10, 10);
  const copy = document.createElement('canvas');
  copy.width = 160;
  copy.height = 120;
  copy.getContext('2d').drawImage(cv, 0, 0);
  thumbCache.set(id, copy);
}

async function fetchConfig(base) {
  serverCfg = await api(base, '/config');
  return serverCfg;
}

async function ensureConnected() {
  const base = serverBase();
  if (!base) throw new Error('Keine Server-Adresse eingetragen.');
  if (net && net.base === base && net.ws && net.ws.readyState === 1) return net;
  if (net) net.close();
  await fetchConfig(base);
  const token = account.token && account.server === base ? account.token : null;
  net = new NetClient(base);
  const welcome = await net.connect({ name: profile.name || 'Gast', character: profile.character, vehicle: profile.vehicle, token });
  myId = welcome.id;
  if (token && !welcome.account) {
    account.token = null;
    account.name = null;
    saveAccount();
  }
  bindNet(net);
  return net;
}

function bindNet(n) {
  n.on('joined', () => {});
  n.on('room', (m) => {
    room = m;
    if (screen === 'lobby') updateLobby();
    else if (screen === 'online') showLobby();
  });
  n.on('rooms', (m) => renderRoomList(m.rooms));
  n.on('error', (m) => {
    toast(m.text);
    const err = $('#onlineError');
    if (err) err.textContent = m.text;
  });
  n.on('kicked', () => {
    room = null;
    toast('Du wurdest aus dem Raum entfernt.');
    showOnline();
  });
  n.on('left', () => {
    room = null;
  });
  n.on('chat', (m) => addChat(m));
  n.on('prepare', (m) => {
    if (screen === 'race') return;
    stopAttract();
    setScreen('loading', `<div class="screen"><div class="loading"><div class="spinner"></div>${esc(trackById(m.trackId).name)} wird geladen…</div></div>`);
    setTimeout(() => {
      preloadWorld(m.trackId);
      n.send({ t: 'loaded' });
    }, 50);
  });
  n.on('race', (m) => {
    const session = new OnlineSession(n, m.info, myId, !!m.spectate);
    startGame(session, [{ device: 'kball' }], 'online');
    if (m.spectate) toast('Rennen läuft – du schaust zu und bist beim nächsten dabei.');
  });
  n.on('disconnect', () => {
    toast('Verbindung zum Server verloren.');
    room = null;
    net = null;
    if (screen !== 'title') showTitle();
  });
}

async function showOnline() {
  startAttract();
  audio.playSong('menu');
  setScreen('online', `<div class="screen dim"><div class="loading"><div class="spinner"></div>Verbinde mit dem Server…</div></div>`);
  try {
    await ensureConnected();
  } catch (err) {
    return showServerSetup(err.message);
  }
  if (room) return showLobby();
  const guest = !(account.token && account.name);
  const needAccount = serverCfg && serverCfg.requireAccount && guest;
  setScreen('online', `
    <div class="screen dim">
      <div class="wide two-col">
        <section class="panel">
          <div class="topbar"><h2>Dein Fahrer</h2><button class="btn small sand" data-act="title" data-back>Zurück</button></div>
          ${guest ? `<label class="field">Name<input class="input" id="nameInput" maxlength="16" placeholder="Gast" value="${esc(profile.name)}"></label>` : `<p>Angemeldet als <b>${esc(account.name)}</b> – Rundenzeiten landen in der Bestenliste.</p>`}
          ${loadoutHtml()}
        </section>
        <section class="panel">
          <h2>Mitspielen</h2>
          ${needAccount ? `<p>Dieser Server ist nur für angemeldete Fahrer.</p><button class="btn big coral" data-act="account">Anmelden / Registrieren</button>` : `
          <div class="row"><button class="btn big coral grow" data-act="createRoom">Raum erstellen</button></div>
          <label class="check" style="margin-top:10px"><input type="checkbox" id="publicRoom"> In der Raumliste anzeigen</label>
          <h3>Mit Code beitreten</h3>
          <div class="row"><input class="input code grow" id="codeInput" maxlength="5" placeholder="ABCDE" style="flex:1;min-width:140px"><button class="btn lagoon" data-act="joinCode">Beitreten</button></div>
          <p class="error" id="onlineError"></p>
          <h3>Offene Räume</h3>
          <div class="room-list" id="roomList"><div class="empty-note">Gerade keine offenen Räume. Erstell einen und schick den Link herum.</div></div>`}
          ${guest && !needAccount && serverCfg && serverCfg.registration !== 'closed' ? '<p class="muted" style="margin-top:12px">Mit Account landen deine Zeiten in der Bestenliste. <a href="#" data-act="account">Anmelden</a></p>' : ''}
        </section>
      </div>
    </div>`);
  bindLoadout();
  const ni = $('#nameInput');
  if (ni)
    ni.addEventListener('change', () => {
      profile.name = ni.value.trim().slice(0, 16);
      saveProfile();
      net.send({ t: 'profile', name: profile.name || 'Gast', character: profile.character, vehicle: profile.vehicle });
    });
  const ci = $('#codeInput');
  if (ci) ci.addEventListener('keydown', (e) => e.key === 'Enter' && joinByCode());
  net.send({ t: 'rooms' });
  clearInterval(showOnline.timer);
  showOnline.timer = setInterval(() => (screen === 'online' && net ? net.send({ t: 'rooms' }) : clearInterval(showOnline.timer)), 3000);
  const want = new URLSearchParams(location.search).get('room');
  if (want) {
    history.replaceState(null, '', location.pathname);
    net.send({ t: 'join', code: want.toUpperCase() });
  }
}

function renderRoomList(rooms) {
  const el = $('#roomList');
  if (!el) return;
  if (!rooms.length) {
    el.innerHTML = '<div class="empty-note">Gerade keine offenen Räume. Erstell einen und schick den Link herum.</div>';
    return;
  }
  el.innerHTML = rooms.map((r) => `<div class="room-item"><span class="grow">${esc(r.host)}s Raum · ${r.players}/${MAX_PLAYERS} · ${esc(trackById(r.track).name)}${r.state !== 'lobby' ? ' · fährt gerade' : ''}</span><button class="btn small lagoon" data-act="joinRoom" data-code="${r.code}">Beitreten</button></div>`).join('');
}

function joinByCode() {
  const code = ($('#codeInput')?.value || '').trim().toUpperCase();
  if (code.length !== 5) {
    $('#onlineError').textContent = 'Der Code hat 5 Zeichen.';
    return;
  }
  net.send({ t: 'join', code });
}

function showServerSetup(msg) {
  setScreen('online', `
    <div class="screen dim"><div class="center-col">
      <section class="panel">
        <div class="topbar"><h2>Server verbinden</h2><button class="btn small sand" data-act="title" data-back>Zurück</button></div>
        <p>${esc(msg || '')}</p>
        <p class="muted">Trag die Adresse deines Insel-Rallye-Servers ein, z.&nbsp;B. <b>rallye.example.de</b> oder im Heimnetz <b>192.168.0.20:3000</b>.</p>
        <label class="field">Server-Adresse<input class="input" id="serverInput" value="${esc(settings.server || (isServed() ? location.origin : ''))}" placeholder="192.168.0.20:3000" autofocus></label>
        <div class="row"><button class="btn big lagoon grow" data-act="saveServer">Verbinden</button></div>
      </section>
    </div></div>`);
  $('#serverInput').addEventListener('keydown', (e) => e.key === 'Enter' && saveServerAndConnect());
}

function saveServerAndConnect() {
  const v = $('#serverInput').value.trim();
  settings.server = isServed() && normalizeServer(v) === location.origin ? '' : v;
  saveSettings();
  showOnline();
}

function loadoutHtml(selChar = profile.character, selVeh = profile.vehicle) {
  const ch = characterById(selChar);
  const st = ch.stats;
  const bar = (v) => `<i style="--v:${Math.round(((v - 0.85) / 0.3) * 100)}%"></i>`;
  return `
    <h3>Figur</h3>
    <div class="chars" id="charGrid">${CHARACTERS.map((c) => `<button type="button" class="char ${c.id === selChar ? 'on' : ''}" data-char="${c.id}">${charImg(c.id)}${esc(c.name)}</button>`).join('')}</div>
    <div class="stats"><span>Tempo</span>${bar(st.speed)}<span>Beschleunigung</span>${bar(st.accel)}<span>Lenkung</span>${bar(st.turn)}</div>
    <h3>Fahrzeug</h3>
    <div class="vehicles" id="vehGrid">${Object.values(VEHICLES).map((v) => `<button type="button" class="veh ${v.id === selVeh ? 'on' : ''}" data-veh="${v.id}"><img src="${portrait(selChar, v.id, 'full')}" alt="">${v.name}</button>`).join('')}</div>`;
}

function bindLoadout(onChange) {
  const grid = $('#charGrid');
  if (!grid) return;
  const holder = grid.parentElement;
  holder.addEventListener('click', (e) => {
    const c = e.target.closest('[data-char]');
    const v = e.target.closest('[data-veh]');
    if (!c && !v) return;
    if (c) profile.character = c.dataset.char;
    if (v) profile.vehicle = v.dataset.veh;
    saveProfile();
    audio.sfx('click');
    const start = holder.querySelector('#charGrid').previousElementSibling;
    const tmp = document.createElement('div');
    tmp.innerHTML = loadoutHtml();
    let node = start;
    const toRemove = [];
    while (node) {
      toRemove.push(node);
      if (node.id === 'vehGrid') break;
      node = node.nextElementSibling;
    }
    const after = node ? node.nextSibling : null;
    toRemove.forEach((n) => n.remove());
    [...tmp.childNodes].forEach((n) => holder.insertBefore(n, after));
    if (net) net.send({ t: room ? 'loadout' : 'profile', name: profile.name || 'Gast', character: profile.character, vehicle: profile.vehicle });
    onChange && onChange();
  });
}

function showLobby() {
  if (!room) return showOnline();
  startAttract();
  audio.playSong('menu');
  const link = inviteLink();
  setScreen('lobby', `
    <div class="screen dim">
      <div class="wide two-col">
        <section class="panel">
          <div class="topbar">
            <div><div class="muted">Raum-Code</div><div class="code-box">${room.code}</div></div>
            <div class="row"><button class="btn small lagoon" data-act="copyLink">Einladungslink kopieren</button><button class="btn small sand" data-act="copyCode">Code kopieren</button></div>
          </div>
          <p class="muted" style="word-break:break-all">${esc(link)}</p>
          <h3>Fahrer</h3>
          <ul class="members" id="members"></ul>
          <h3>Chat</h3>
          <div class="chat"><div class="chat-log" id="chatLog"></div><div class="row"><input class="input grow" id="chatInput" maxlength="200" placeholder="Nachricht…" style="flex:1"><button class="btn small sand" data-act="sendChat">Senden</button></div></div>
        </section>
        <section class="panel">
          <div class="topbar"><h2>Rennen</h2><button class="btn small sand" data-act="leaveRoom" data-back>Raum verlassen</button></div>
          <div class="tracks" id="tracks"></div>
          <div class="track-desc" id="trackDesc"></div>
          <div id="roomSettings"></div>
          <div class="row" style="margin-top:14px" id="lobbyActions"></div>
          <details style="margin-top:14px"><summary style="font-weight:900;cursor:pointer">Figur &amp; Fahrzeug</summary><div id="lobbyLoadout">${loadoutHtml()}</div></details>
        </section>
      </div>
    </div>`);
  bindLoadout();
  $('#chatInput').addEventListener('keydown', (e) => e.key === 'Enter' && sendChat());
  for (const m of chatBuffer) appendChatLine(m);
  updateLobby();
}

function inviteLink() {
  const base = serverBase() || location.origin;
  return `${base}/?room=${room.code}`;
}

const chatBuffer = [];
function addChat(m) {
  chatBuffer.push(m);
  if (chatBuffer.length > 60) chatBuffer.shift();
  appendChatLine(m);
}
function appendChatLine(m) {
  const log = $('#chatLog');
  if (!log) return;
  const div = document.createElement('div');
  if (m.system) {
    div.className = 'sys';
    div.textContent = m.text;
  } else {
    const b = document.createElement('b');
    b.textContent = m.name + ': ';
    div.appendChild(b);
    div.appendChild(document.createTextNode(m.text));
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}
function sendChat() {
  const i = $('#chatInput');
  if (!i || !i.value.trim()) return;
  net.send({ t: 'chat', text: i.value });
  i.value = '';
}

function updateLobby() {
  if (!room || screen !== 'lobby') return;
  const isHost = room.host === myId;
  const me = room.members.find((m) => m.id === myId);
  $('#members').innerHTML = room.members.map((m) => `<li class="member">${charImg(m.character, m.vehicle)}
    <div><div class="mname">${esc(m.name)}${m.id === room.host ? ' 👑' : ''}</div><div class="msub">${vehicleName(m.vehicle)}${m.account ? ' · Account' : ' · Gast'}${m.ping ? ` · ${m.ping} ms` : ''}</div></div>
    <span class="tag ${m.ready ? 'ready' : ''}">${m.racing ? 'fährt' : m.id === room.host ? 'Host' : m.ready ? 'bereit' : 'wartet'}</span>
    <span class="pts">${m.points} P</span>
    ${isHost && m.id !== myId ? `<button class="kick" data-act="kick" data-id="${m.id}" title="Aus dem Raum werfen" aria-label="${esc(m.name)} entfernen">✕</button>` : ''}</li>`).join('');
  const s = room.settings;
  const tracksEl = $('#tracks');
  if (tracksEl.dataset.sel !== s.trackId + isHost) {
    tracksEl.dataset.sel = s.trackId + isHost;
    renderTracks(tracksEl, s.trackId, (id) => net.send({ t: 'settings', settings: { trackId: id } }), !isHost);
  }
  $('#trackDesc').textContent = trackById(s.trackId).desc;
  const humans = room.members.length;
  const maxBots = Math.max(0, MAX_PLAYERS - humans);
  $('#roomSettings').innerHTML = `
    <div class="setting-row"><span>Runden</span>${seg('laps', [[1, '1'], [2, '2'], [3, '3'], [5, '5']], s.laps)}</div>
    <div class="setting-row"><span>Computer-Fahrer</span>${seg('bots', Array.from({ length: maxBots + 1 }, (_, i) => [i, String(i)]), Math.min(s.bots, maxBots))}</div>
    <div class="setting-row"><span>Stärke</span>${seg('difficulty', Object.entries(DIFFICULTIES).map(([k, d]) => [k, d.name]), s.difficulty)}</div>
    <div class="setting-row"><span>Ballons &amp; Items</span>${seg('items', [['true', 'An'], ['false', 'Aus']], String(s.items))}</div>
    <div class="setting-row"><span>Fahrzeug</span>${seg('vehicleMode', [['free', 'Freie Wahl'], ['track', 'Strecke gibt vor']], s.vehicleMode)}</div>
    <div class="setting-row"><span>Raumliste</span>${seg('public', [['true', 'Sichtbar'], ['false', 'Nur mit Code']], String(room.public))}</div>`;
  if (!isHost) $('#roomSettings').querySelectorAll('button').forEach((b) => (b.disabled = true));
  else
    $('#roomSettings').querySelectorAll('[data-seg]').forEach((el) =>
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const k = el.dataset.seg;
        let v = b.dataset.v;
        if (k === 'laps' || k === 'bots') v = Number(v);
        if (k === 'items' || k === 'public') v = v === 'true';
        audio.sfx('click');
        net.send({ t: 'settings', settings: { [k]: v } });
      })
    );
  const notReady = room.members.filter((m) => !m.ready).length;
  $('#lobbyActions').innerHTML = isHost
    ? `<button class="btn big coral grow" data-act="startOnline" ${room.state !== 'lobby' ? 'disabled' : ''}>${room.state !== 'lobby' ? 'Rennen läuft…' : notReady ? `Starten (${notReady} noch nicht bereit)` : 'Rennen starten'}</button>${room.state !== 'lobby' ? '<button class="btn sand" data-act="abortRace">Rennen abbrechen</button>' : ''}`
    : `<button class="btn big ${me && me.ready ? 'leaf' : 'coral'} grow" data-act="toggleReady" ${room.state !== 'lobby' ? 'disabled' : ''}>${me && me.ready ? 'Bereit! (zurücknehmen)' : 'Ich bin bereit'}</button>`;
}

function showRecords() {
  startAttract();
  const base = serverBase();
  const st = showRecords.state || (showRecords.state = { trackId: TRACKS[0].id, vehicle: '', kind: 'lap', source: base ? 'server' : 'local' });
  setScreen('records', `
    <div class="screen dim"><div class="center-col" style="width:min(820px,100%)">
      <section class="panel">
        <div class="topbar"><h2>Bestzeiten</h2><button class="btn small sand" data-act="title" data-back>Zurück</button></div>
        <div class="tracks" id="tracks"></div>
        <div class="setting-row" style="margin-top:12px"><span>Wertung</span>${seg('kind', [['lap', 'Beste Runde'], ['race', 'Rennen (3 Runden)']], st.kind)}</div>
        <div class="setting-row"><span>Fahrzeug</span>${seg('vehicle', [['', 'Alle'], ['car', 'Kart'], ['hover', 'Hovercraft'], ['plane', 'Flugzeug']], st.vehicle)}</div>
        ${base ? `<div class="setting-row"><span>Quelle</span>${seg('source', [['server', 'Server'], ['local', 'Dieses Gerät']], st.source)}</div>` : ''}
        <div id="board" style="margin-top:10px"></div>
      </section>
    </div></div>`);
  renderTracks($('#tracks'), st.trackId, (id) => {
    st.trackId = id;
    loadBoard();
  });
  ui.querySelectorAll('[data-seg]').forEach((el) =>
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      st[el.dataset.seg] = b.dataset.v;
      el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      loadBoard();
    })
  );
  loadBoard();
}

async function loadBoard() {
  const st = showRecords.state;
  const el = $('#board');
  if (!el) return;
  let entries = [];
  if (st.source === 'server') {
    el.innerHTML = '<p class="muted">Lade…</p>';
    try {
      const d = await api(serverBase(), `/leaderboard?track=${st.trackId}&vehicle=${st.vehicle}&kind=${st.kind}`);
      entries = d.entries.map((e) => ({ name: e.username, character: e.character, vehicle: e.vehicle, time: e.time }));
    } catch (err) {
      el.innerHTML = `<p class="error">${esc(err.message)}</p>`;
      return;
    }
  } else {
    const rec = load('ir.records', {});
    for (const [key, v] of Object.entries(rec)) {
      const [track, vehicle] = key.split(':');
      if (track !== st.trackId || (st.vehicle && vehicle !== st.vehicle)) continue;
      const r = v[st.kind];
      if (r) entries.push({ ...r, vehicle });
    }
    entries.sort((a, b) => a.time - b.time);
  }
  if (!entries.length) {
    el.innerHTML = `<p class="empty-note">Noch keine Zeiten auf dieser Strecke. ${st.source === 'server' ? 'Fahr mit Account ein Online-Rennen, um hier zu landen.' : 'Fahr ein lokales Rennen, um die erste Zeit zu setzen.'}</p>`;
    return;
  }
  el.innerHTML = `<table class="results"><tbody>${entries.map((e, i) => `<tr class="rrow"><td>${i + 1}.</td><td>${charImg(e.character || 'ruffy', e.vehicle)}</td><td>${esc(e.name || '?')}<div class="muted">${vehicleName(e.vehicle)}</div></td><td class="num">${formatTime(e.time)}</td></tr>`).join('')}</tbody></table>`;
}

function modal(html, cls = '') {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.id = 'modal';
  wrap.innerHTML = `<div class="modal panel ${cls}">${html}</div>`;
  wrap.addEventListener('click', (e) => e.target === wrap && closeModal());
  ui.appendChild(wrap);
  const f = wrap.querySelector('[autofocus]') || wrap.querySelector('input, button');
  if (f) f.focus();
  return wrap;
}
function closeModal() {
  const m = $('#modal');
  if (m) m.remove();
}

function showControls() {
  modal(`<div class="topbar"><h2>Steuerung</h2><button class="btn small sand" data-act="closeModal" data-back autofocus>Schließen</button></div>
    <div class="controls-grid">
      <div><h3>Tastatur links</h3><dl><dt>W / S</dt><dd>Gas / Bremse</dd><dt>A / D</dt><dd>Lenken</dd><dt>Leertaste</dt><dd>Driften (gedrückt halten)</dd><dt>E oder Q</dt><dd>Item benutzen</dd><dt>Esc</dt><dd>Pause</dd></dl></div>
      <div><h3>Tastatur rechts</h3><dl><dt>↑ / ↓</dt><dd>Gas / Bremse</dd><dt>← / →</dt><dd>Lenken</dd><dt>Rechte Shift</dt><dd>Driften</dd><dt>Enter</dt><dd>Item benutzen</dd></dl></div>
      <div><h3>Controller</h3><dl><dt>A</dt><dd>Gas</dd><dt>B</dt><dd>Bremse</dd><dt>Stick / Steuerkreuz</dt><dd>Lenken</dd><dt>R / RT</dt><dd>Driften</dd><dt>X, L, LT</dt><dd>Item</dd><dt>Start</dt><dd>Pause</dd></dl></div>
      <div><h3>Flugzeug</h3><dl><dt>W / ↑ / Stick hoch</dt><dd>Steigen</dd><dt>S / ↓ / Stick runter</dt><dd>Sinken</dd><dt>Drift-Taste</dt><dd>Enge Kurve</dd></dl><p class="muted">Gas gibt das Flugzeug selbst. In den Einstellungen lässt sich die Höhensteuerung umdrehen.</p></div>
    </div>
    <h3>Tipps</h3>
    <p>Gas genau beim „1“ des Countdowns gedrückt halten gibt einen Start-Turbo. Lange driften lädt einen Mini-Turbo auf – erst blaue, dann orange Funken. Den gleichen Ballon nochmal einsammeln verbessert dein Item bis Stufe 3. Münzen machen dich ein kleines bisschen schneller, Treffer kosten zwei davon.</p>`, 'wide-modal');
}

function showSettings() {
  modal(`<div class="topbar"><h2>Einstellungen</h2><button class="btn small sand" data-act="closeModal" data-back>Schließen</button></div>
    <label class="field">Dein Name (lokal und als Gast online)<input class="input" id="setName" maxlength="16" value="${esc(profile.name)}" placeholder="Spieler 1"></label>
    <label class="field">Musik<input type="range" id="setMusic" min="0" max="1" step="0.05" value="${audio.musicVol}"></label>
    <label class="field">Effekte<input type="range" id="setSfx" min="0" max="1" step="0.05" value="${audio.sfxVol}"></label>
    <label class="field">Motoren<input type="range" id="setEngine" min="0" max="1" step="0.05" value="${audio.engineVol}"></label>
    <div class="setting-row"><span>Grafik</span>${seg('quality', [['high', 'Schön'], ['low', 'Schnell']], settings.quality)}</div>
    <div class="setting-row"><span>Flugzeug-Höhe</span>${seg('invertPlane', [['false', 'Normal'], ['true', 'Umgedreht']], String(settings.invertPlane))}</div>
    <label class="field">Server-Adresse ${isServed() ? '<span class="muted">(leer = dieser Server)</span>' : ''}<input class="input" id="setServer" value="${esc(settings.server)}" placeholder="${isServed() ? esc(location.host) : '192.168.0.20:3000'}"></label>
    ${isServed() ? '<p class="muted">Kein Internet? <a href="offline.html" download>Offline-Version herunterladen</a> – eine einzelne Datei für Splitscreen ohne Server.</p>' : ''}`);
  $('#setName').addEventListener('change', (e) => {
    profile.name = e.target.value.trim().slice(0, 16);
    saveProfile();
  });
  $('#setMusic').addEventListener('input', (e) => audio.setMusic(Number(e.target.value)));
  $('#setSfx').addEventListener('input', (e) => audio.setSfx(Number(e.target.value)));
  $('#setEngine').addEventListener('input', (e) => audio.setEngine(Number(e.target.value)));
  $('#setServer').addEventListener('change', (e) => {
    settings.server = e.target.value.trim();
    saveSettings();
    if (net) {
      net.close();
      net = null;
      room = null;
    }
  });
  $('#modal').querySelectorAll('[data-seg]').forEach((el) =>
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const k = el.dataset.seg;
      settings[k] = k === 'invertPlane' ? b.dataset.v === 'true' : b.dataset.v;
      el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      saveSettings();
      if (k === 'quality') applyQuality();
    })
  );
}

async function showAccount(tab = 'login') {
  const base = serverBase();
  if (!base) return showServerSetup('Für Accounts brauchst du einen Server.');
  try {
    if (!serverCfg) await fetchConfig(base);
  } catch (err) {
    return toast(err.message);
  }
  const canRegister = serverCfg.registration !== 'closed';
  modal(`<div class="topbar"><h2>${tab === 'login' ? 'Anmelden' : 'Registrieren'}</h2><button class="btn small sand" data-act="closeModal" data-back>Schließen</button></div>
    <form id="accForm">
      <label class="field">Name<input class="input" name="username" maxlength="16" autocomplete="username" required autofocus></label>
      <label class="field">Passwort<input class="input" name="password" type="password" minlength="6" autocomplete="${tab === 'login' ? 'current-password' : 'new-password'}" required></label>
      ${tab === 'register' && serverCfg.registration === 'invite' ? '<label class="field">Einladungscode<input class="input code" name="invite" maxlength="12" required></label>' : ''}
      <p class="error" id="accError"></p>
      <div class="row"><button class="btn big coral grow" type="submit">${tab === 'login' ? 'Anmelden' : 'Account erstellen'}</button></div>
    </form>
    ${canRegister ? `<p class="muted" style="margin-top:12px">${tab === 'login' ? 'Noch kein Account? <a href="#" data-act="toRegister">Registrieren</a>' : 'Schon registriert? <a href="#" data-act="toLogin">Anmelden</a>'}</p>` : ''}`);
  $('#accForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.character = profile.character;
    try {
      const d = await api(base, tab === 'login' ? '/login' : '/register', { method: 'POST', body });
      account.token = d.token;
      account.name = d.user.name;
      account.server = base;
      if (d.user.character) profile.character = d.user.character;
      saveAccount();
      saveProfile();
      closeModal();
      toast(tab === 'login' ? `Willkommen zurück, ${d.user.name}!` : `Account ${d.user.name} angelegt.`);
      if (net) {
        net.close();
        net = null;
        room = null;
      }
      refreshCurrent();
    } catch (err) {
      $('#accError').textContent = err.message;
    }
  });
}

async function logout() {
  const base = serverBase();
  try {
    if (account.token) await api(base, '/logout', { method: 'POST', token: account.token });
  } catch {}
  account.token = null;
  account.name = null;
  saveAccount();
  if (net) {
    net.close();
    net = null;
    room = null;
  }
  toast('Abgemeldet.');
  refreshCurrent();
}

function refreshCurrent() {
  if (screen === 'title') showTitle();
  else if (screen === 'online') showOnline();
}

const actions = {
  title: () => {
    if (screen === 'lobby' && net) net.send({ t: 'leave' });
    showTitle();
  },
  local: () => showLocal(),
  online: () => showOnline(),
  records: () => showRecords(),
  controls: () => showControls(),
  settings: () => showSettings(),
  account: () => showAccount('login'),
  toRegister: () => showAccount('register'),
  toLogin: () => showAccount('login'),
  logout: () => logout(),
  closeModal: () => closeModal(),
  addMouse: () => {
    const taken = localState.slots.map((s) => s.device);
    const dev = !taken.includes('kb1') ? 'kb1' : !taken.includes('kb2') ? 'kb2' : null;
    if (dev) addSlot(dev);
    else toast('Beide Tastaturseiten sind schon belegt – nimm einen Controller.');
  },
  startLocal: () => startLocalRace(),
  again: () => {
    if (!localState) return showLocal();
    startLocalRace();
  },
  nextTrack: () => {
    const i = TRACKS.findIndex((t) => t.id === localState.trackId);
    localState.trackId = TRACKS[(i + 1) % TRACKS.length].id;
    saveLocalSettings();
    startLocalRace();
  },
  resume: () => closePause(),
  restart: () => {
    closePause();
    startLocalRace();
  },
  quitLocal: () => {
    closePause();
    showLocal();
  },
  leaveRoom: () => {
    closePause();
    if (net) net.send({ t: 'leave' });
    room = null;
    chatBuffer.length = 0;
    showOnline();
  },
  createRoom: () => net.send({ t: 'create', public: !!$('#publicRoom')?.checked }),
  joinCode: () => joinByCode(),
  joinRoom: (el) => net.send({ t: 'join', code: el.dataset.code }),
  saveServer: () => saveServerAndConnect(),
  copyLink: () => copy(inviteLink(), 'Einladungslink kopiert.'),
  copyCode: () => copy(room.code, 'Code kopiert.'),
  sendChat: () => sendChat(),
  kick: (el) => net.send({ t: 'kick', id: el.dataset.id }),
  toggleReady: () => {
    const me = room.members.find((m) => m.id === myId);
    net.send({ t: 'ready', ready: !(me && me.ready) });
  },
  startOnline: () => net.send({ t: 'start' }),
  abortRace: () => net.send({ t: 'abort' }),
  backLobby: () => (room ? showLobby() : showOnline())
};

async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    prompt('Zum Kopieren:', text);
  }
}

ui.addEventListener('click', (e) => {
  const slotBtn = e.target.closest('[data-slotact]');
  if (slotBtn) {
    const slot = slotBtn.closest('[data-slot]');
    slotAction(Number(slot.dataset.slot), slotBtn.dataset.slotact, slotBtn.dataset.v);
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  e.preventDefault();
  const fn = actions[el.dataset.act];
  if (fn) {
    audio.sfx('click');
    fn(el);
  }
});

function padFocus(on) {
  document.body.classList.toggle('pad-nav', on);
}
addEventListener('mousemove', () => padFocus(false));

function focusables(scope) {
  const root = scope || $('#modal') || $('#pause') || ui;
  return [...root.querySelectorAll('button:not([disabled]), input, a[data-act], [tabindex="0"]')].filter((el) => el.offsetParent !== null);
}

function spatialMove(dir, scope) {
  const list = focusables(scope);
  if (!list.length) return;
  const cur = document.activeElement;
  if (!list.includes(cur)) {
    list[0].focus();
    return;
  }
  const r0 = cur.getBoundingClientRect();
  const cx = r0.left + r0.width / 2;
  const cy = r0.top + r0.height / 2;
  let best = null;
  for (const el of list) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    const ok = dir === 'up' ? dy < -4 : dir === 'down' ? dy > 4 : dir === 'left' ? dx < -4 : dx > 4;
    if (!ok) continue;
    const main = dir === 'up' || dir === 'down' ? Math.abs(dy) : Math.abs(dx);
    const cross = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    const score = main + cross * 2.2;
    if (!best || score < best.score) best = { el, score };
  }
  if (best) {
    best.el.focus();
    best.el.scrollIntoView({ block: 'nearest' });
  }
}

function menuGamepad() {
  if (screen === 'local' && !$('#modal')) return;
  if (screen === 'race' && !pauseOpen) return;
  if (anyPadActivity()) padFocus(true);
  const dir = padAxisEdge();
  if (dir) spatialMove(dir);
  if (anyPadEdge(0)) {
    const f = document.activeElement;
    const list = focusables();
    if (f && list.includes(f)) f.click();
    else if (list.length) list[0].focus();
  }
  if (anyPadEdge(1)) {
    const back = ($('#modal') || $('#pause') || ui).querySelector('[data-back]');
    if ($('#pause')) closePause();
    else if (back) back.click();
  }
}

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('#modal')) closeModal();
    else if (pauseOpen) closePause();
  }
  if (screen === 'race' && game && !game.locals.length && !pauseOpen) {
    if (e.key === 'ArrowRight') game.cycleSpectator(1);
    if (e.key === 'ArrowLeft') game.cycleSpectator(-1);
    if (e.key === 'Escape') openPause(game.mode);
  }
});

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  pollInput();
  if (screen === 'local') localTick();
  menuGamepad();
  if (game) game.frame(dt);
  else if (attract) attract.frame(dt);
  else {
    renderer.setClearColor(0x19b6c9);
    renderer.clear();
  }
  endFrame();
  requestAnimationFrame(loop);
}

document.addEventListener('visibilitychange', () => {
  last = performance.now();
});

showTitle();
requestAnimationFrame(loop);
if (new URLSearchParams(location.search).get('room')) showOnline();

window.__insel = { getTrack, get game() { return game; }, get screen() { return screen; } };
