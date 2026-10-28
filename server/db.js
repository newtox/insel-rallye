import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const scrypt = promisify(crypto.scrypt);

export function openDb(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'insel-rallye.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass TEXT NOT NULL,
      character TEXT NOT NULL DEFAULT 'ruffy',
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS records (
      user_id INTEGER NOT NULL,
      track TEXT NOT NULL,
      vehicle TEXT NOT NULL,
      best_lap INTEGER,
      best_race INTEGER,
      races INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, track, vehicle)
    );
    CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      uses_left INTEGER NOT NULL,
      created INTEGER NOT NULL
    );
  `);
  return new Store(db);
}

class Store {
  constructor(db) {
    this.db = db;
    this.q = {
      userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
      userById: db.prepare('SELECT id, username, character, created FROM users WHERE id = ?'),
      insertUser: db.prepare('INSERT INTO users (username, pass, character, created) VALUES (?, ?, ?, ?)'),
      setChar: db.prepare('UPDATE users SET character = ? WHERE id = ?'),
      setPass: db.prepare('UPDATE users SET pass = ? WHERE id = ?'),
      insertSession: db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)'),
      session: db.prepare('SELECT user_id, expires FROM sessions WHERE token = ?'),
      deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
      purgeSessions: db.prepare('DELETE FROM sessions WHERE expires < ?'),
      record: db.prepare('SELECT * FROM records WHERE user_id = ? AND track = ? AND vehicle = ?'),
      insertRecord: db.prepare('INSERT INTO records (user_id, track, vehicle, best_lap, best_race, races, wins) VALUES (?, ?, ?, ?, ?, 1, ?)'),
      updateRecord: db.prepare('UPDATE records SET best_lap = ?, best_race = ?, races = races + 1, wins = wins + ? WHERE user_id = ? AND track = ? AND vehicle = ?'),
      boardLap: db.prepare(`SELECT u.username, u.character, r.vehicle, r.best_lap AS time FROM records r JOIN users u ON u.id = r.user_id
        WHERE r.track = ? AND (? = '' OR r.vehicle = ?) AND r.best_lap IS NOT NULL ORDER BY r.best_lap ASC LIMIT 15`),
      boardRace: db.prepare(`SELECT u.username, u.character, r.vehicle, r.best_race AS time FROM records r JOIN users u ON u.id = r.user_id
        WHERE r.track = ? AND (? = '' OR r.vehicle = ?) AND r.best_race IS NOT NULL ORDER BY r.best_race ASC LIMIT 15`),
      userStats: db.prepare('SELECT COALESCE(SUM(races),0) AS races, COALESCE(SUM(wins),0) AS wins FROM records WHERE user_id = ?'),
      invite: db.prepare('SELECT * FROM invites WHERE code = ?'),
      insertInvite: db.prepare('INSERT INTO invites (code, uses_left, created) VALUES (?, ?, ?)'),
      useInvite: db.prepare('UPDATE invites SET uses_left = uses_left - 1 WHERE code = ? AND uses_left > 0'),
      listInvites: db.prepare('SELECT * FROM invites ORDER BY created DESC'),
      deleteInvite: db.prepare('DELETE FROM invites WHERE code = ?'),
      listUsers: db.prepare('SELECT id, username, character, created FROM users ORDER BY id'),
      deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
      deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
      deleteUserRecords: db.prepare('DELETE FROM records WHERE user_id = ?')
    };
    this.q.purgeSessions.run(Date.now());
  }

  async hash(password) {
    const salt = crypto.randomBytes(16);
    const key = await scrypt(password, salt, 64);
    return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
  }

  async verify(password, stored) {
    const [, saltHex, keyHex] = String(stored).split('$');
    if (!saltHex || !keyHex) return false;
    const key = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
    const ref = Buffer.from(keyHex, 'hex');
    return ref.length === key.length && crypto.timingSafeEqual(ref, key);
  }

  async createUser(username, password, character) {
    const hash = await this.hash(password);
    const info = this.q.insertUser.run(username, hash, character, Date.now());
    return this.userById(Number(info.lastInsertRowid));
  }

  userByName(name) {
    return this.q.userByName.get(name);
  }

  userById(id) {
    return this.q.userById.get(id);
  }

  setCharacter(id, character) {
    this.q.setChar.run(character, id);
  }

  async setPassword(id, password) {
    this.q.setPass.run(await this.hash(password), id);
  }

  createSession(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    this.q.insertSession.run(token, userId, Date.now() + 1000 * 60 * 60 * 24 * 30);
    return token;
  }

  userByToken(token) {
    if (!token || typeof token !== 'string' || token.length > 128) return null;
    const s = this.q.session.get(token);
    if (!s) return null;
    if (s.expires < Date.now()) {
      this.q.deleteSession.run(token);
      return null;
    }
    return this.userById(s.user_id) || null;
  }

  deleteSession(token) {
    this.q.deleteSession.run(token);
  }

  recordResult(userId, track, vehicle, bestLap, raceTime, laps, won) {
    const cur = this.q.record.get(userId, track, vehicle);
    const race = laps === 3 ? raceTime : null;
    if (!cur) {
      this.q.insertRecord.run(userId, track, vehicle, bestLap, race, won ? 1 : 0);
      return;
    }
    const nl = bestLap != null && (cur.best_lap == null || bestLap < cur.best_lap) ? bestLap : cur.best_lap;
    const nr = race != null && (cur.best_race == null || race < cur.best_race) ? race : cur.best_race;
    this.q.updateRecord.run(nl, nr, won ? 1 : 0, userId, track, vehicle);
  }

  leaderboard(track, vehicle = '', kind = 'lap') {
    const st = kind === 'race' ? this.q.boardRace : this.q.boardLap;
    return st.all(track, vehicle, vehicle);
  }

  stats(userId) {
    return this.q.userStats.get(userId);
  }

  createInvite(uses = 1) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += alphabet[crypto.randomInt(alphabet.length)];
    this.q.insertInvite.run(code, uses, Date.now());
    return code;
  }

  useInvite(code) {
    if (!code || typeof code !== 'string') return false;
    const info = this.q.useInvite.run(code.trim().toUpperCase());
    return info.changes > 0;
  }

  listInvites() {
    return this.q.listInvites.all();
  }

  deleteInvite(code) {
    this.q.deleteInvite.run(code);
  }

  listUsers() {
    return this.q.listUsers.all();
  }

  deleteUser(id) {
    this.q.deleteUserSessions.run(id);
    this.q.deleteUserRecords.run(id);
    this.q.deleteUser.run(id);
  }
}
