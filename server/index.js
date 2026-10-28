import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { openDb } from './db.js';
import { RoomManager, cleanName } from './rooms.js';
import { TRACK_IDS } from '../shared/tracks.js';
import { CHARACTER_IDS, VEHICLE_IDS, VERSION } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const env = process.env;

const config = {
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  dataDir: path.resolve(ROOT, env.DATA_DIR || 'data'),
  webDir: path.resolve(ROOT, env.WEB_DIR || 'dist/web'),
  registration: ['open', 'invite', 'closed'].includes(env.REGISTRATION) ? env.REGISTRATION : 'open',
  requireAccount: /^(1|true|yes)$/i.test(env.REQUIRE_ACCOUNT || ''),
  trustProxy: /^(1|true|yes)$/i.test(env.TRUST_PROXY || ''),
  maxRooms: Number(env.MAX_ROOMS || 50),
  serverName: env.SERVER_NAME || 'Insel Rallye'
};

const store = openDb(config.dataDir);
const rooms = new RoomManager({ store, config });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

const attempts = new Map();
function rateLimited(ip, bucket, max, windowMs) {
  const key = bucket + ':' + ip;
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  attempts.set(key, list);
  return list.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of attempts) if (!list.some((t) => now - t < 3600000)) attempts.delete(k);
}, 600000).unref();

function clientIp(req) {
  if (config.trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '?';
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 16384) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function publicConfig() {
  return { name: config.serverName, version: VERSION, registration: config.registration, requireAccount: config.requireAccount };
}

async function api(req, res, url) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const ip = clientIp(req);
  const route = url.pathname.slice(4);
  if (req.method === 'GET' && route === '/config') return json(res, 200, publicConfig());
  if (req.method === 'GET' && route === '/health') return json(res, 200, { ok: true, ...rooms.stats() });
  if (req.method === 'GET' && route === '/me') {
    const user = store.userByToken(bearer(req));
    if (!user) return json(res, 401, { error: 'Nicht eingeloggt.' });
    return json(res, 200, { user: { name: user.username, character: user.character, ...store.stats(user.id) } });
  }
  if (req.method === 'GET' && route === '/leaderboard') {
    const track = url.searchParams.get('track');
    const vehicle = url.searchParams.get('vehicle') || '';
    const kind = url.searchParams.get('kind') === 'race' ? 'race' : 'lap';
    if (!TRACK_IDS.includes(track) || (vehicle && !VEHICLE_IDS.includes(vehicle))) return json(res, 400, { error: 'Ungültige Anfrage.' });
    return json(res, 200, { track, vehicle, kind, entries: store.leaderboard(track, vehicle, kind) });
  }
  if (req.method !== 'POST') return json(res, 404, { error: 'Nicht gefunden.' });
  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 413, { error: 'Zu groß.' });
  }
  if (route === '/register') {
    if (rateLimited(ip, 'register', 5, 3600000)) return json(res, 429, { error: 'Zu viele Versuche, bitte später erneut.' });
    if (config.registration === 'closed') return json(res, 403, { error: 'Registrierung ist auf diesem Server geschlossen.' });
    const username = cleanName(body.username);
    const password = String(body.password || '');
    const character = CHARACTER_IDS.includes(body.character) ? body.character : 'ruffy';
    if (!/^[A-Za-z0-9_\-äöüÄÖÜß]{3,16}$/.test(username)) return json(res, 400, { error: 'Name: 3–16 Zeichen, nur Buchstaben, Zahlen, _ und -.' });
    if (password.length < 6 || password.length > 200) return json(res, 400, { error: 'Passwort: mindestens 6 Zeichen.' });
    if (store.userByName(username)) return json(res, 409, { error: 'Dieser Name ist schon vergeben.' });
    if (config.registration === 'invite' && !store.useInvite(body.invite)) return json(res, 403, { error: 'Einladungscode ungültig oder aufgebraucht.' });
    const user = await store.createUser(username, password, character);
    const token = store.createSession(user.id);
    return json(res, 200, { token, user: { name: user.username, character: user.character, races: 0, wins: 0 } });
  }
  if (route === '/login') {
    if (rateLimited(ip, 'login', 12, 900000)) return json(res, 429, { error: 'Zu viele Versuche, bitte warte ein paar Minuten.' });
    const user = store.userByName(String(body.username || '').trim());
    const ok = user && (await store.verify(String(body.password || ''), user.pass));
    if (!ok) return json(res, 401, { error: 'Name oder Passwort falsch.' });
    const token = store.createSession(user.id);
    return json(res, 200, { token, user: { name: user.username, character: user.character, ...store.stats(user.id) } });
  }
  if (route === '/logout') {
    const token = bearer(req);
    if (token) store.deleteSession(token);
    return json(res, 200, { ok: true });
  }
  if (route === '/password') {
    const user = store.userByToken(bearer(req));
    if (!user) return json(res, 401, { error: 'Nicht eingeloggt.' });
    const full = store.userByName(user.username);
    if (!(await store.verify(String(body.old || ''), full.pass))) return json(res, 401, { error: 'Altes Passwort falsch.' });
    const pw = String(body.password || '');
    if (pw.length < 6 || pw.length > 200) return json(res, 400, { error: 'Passwort: mindestens 6 Zeichen.' });
    await store.setPassword(user.id, pw);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'Nicht gefunden.' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(config.webDir, rel));
  if (!file.startsWith(config.webDir)) {
    res.writeHead(403);
    return res.end();
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (path.extname(rel)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Nicht gefunden');
      }
      return sendFile(res, path.join(config.webDir, 'index.html'));
    }
    sendFile(res, file);
  });
}

function sendFile(res, file) {
  const ext = path.extname(file);
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': /\.[0-9a-f]{8}\.(js|css)$/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  };
  if (file.endsWith('offline.html')) headers['Content-Disposition'] = 'attachment; filename="insel-rallye-offline.html"';
  const stream = fs.createReadStream(file);
  stream.on('error', () => {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Client fehlt – bitte zuerst "npm run build" ausführen.');
  });
  res.writeHead(200, headers);
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch((err) => {
      console.error(err);
      json(res, 500, { error: 'Serverfehler.' });
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  serveStatic(req, res, url);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });
wss.on('connection', (ws, req) => rooms.connect(ws, clientIp(req)));

server.listen(config.port, config.host, () => {
  console.log(`${config.serverName} ${VERSION} läuft auf http://${config.host}:${config.port}`);
  console.log(`Registrierung: ${config.registration}, Account Pflicht: ${config.requireAccount ? 'ja' : 'nein'}, Daten: ${config.dataDir}`);
  if (!fs.existsSync(path.join(config.webDir, 'index.html'))) console.warn('Hinweis: dist/web fehlt – "npm run build" ausführen.');
});

function shutdown() {
  rooms.stop();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
