import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 39000 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
let proc;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'insel-rallye-'));
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir },
    stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server startet nicht');
});

after(() => {
  proc.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function post(p, body, token) {
  const r = await fetch(BASE + '/api' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}

function client(hello) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const c = { ws, msgs: [], send: (m) => ws.send(JSON.stringify(m)) };
    c.next = (type, ms = 3000) =>
      new Promise((res, rej) => {
        const found = c.msgs.find((m) => m.t === type && !m._seen);
        if (found) {
          found._seen = true;
          return res(found);
        }
        const timer = setTimeout(() => rej(new Error('Timeout: ' + type)), ms);
        c.waiters.push({ type, res: (m) => (clearTimeout(timer), res(m)) });
      });
    c.waiters = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      const w = c.waiters.findIndex((x) => x.type === m.t);
      if (w >= 0) {
        m._seen = true;
        c.waiters.splice(w, 1)[0].res(m);
      }
      c.msgs.push(m);
    });
    ws.on('open', () => {
      c.send({ t: 'hello', ...hello });
      resolve(c);
    });
    ws.on('error', reject);
  });
}

test('Registrierung, Login und Bestenliste', async () => {
  const reg = await post('/register', { username: 'Testfahrer', password: 'geheim123' });
  assert.equal(reg.status, 200);
  assert.ok(reg.data.token);
  const dup = await post('/register', { username: 'testfahrer', password: 'geheim123' });
  assert.equal(dup.status, 409);
  const bad = await post('/login', { username: 'Testfahrer', password: 'falsch!!' });
  assert.equal(bad.status, 401);
  const ok = await post('/login', { username: 'Testfahrer', password: 'geheim123' });
  assert.equal(ok.status, 200);
  const board = await fetch(BASE + '/api/leaderboard?track=palmenbucht').then((r) => r.json());
  assert.deepEqual(board.entries, []);
});

test('Raum erstellen, per Code beitreten und Rennen starten', async () => {
  const a = await client({ name: 'Host', character: 'ruffy', vehicle: 'car' });
  const b = await client({ name: 'Gast', character: 'quaki', vehicle: 'hover' });
  await a.next('welcome');
  await b.next('welcome');
  a.send({ t: 'create', public: true });
  const { code } = await a.next('joined');
  assert.match(code, /^[A-Z0-9]{5}$/);
  b.send({ t: 'join', code });
  await b.next('joined');
  a.send({ t: 'settings', settings: { bots: 2, laps: 1 } });
  b.send({ t: 'ready', ready: true });
  await new Promise((r) => setTimeout(r, 150));
  a.send({ t: 'start' });
  await a.next('prepare');
  a.send({ t: 'loaded' });
  b.send({ t: 'loaded' });
  const race = await a.next('race');
  assert.equal(race.info.players.length, 4);
  const snap = await a.next('snap');
  assert.equal(snap.s.k.length, 2);
  a.ws.close();
  b.ws.close();
});
