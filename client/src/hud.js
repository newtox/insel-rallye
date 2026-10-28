import { formatTime } from '../../shared/math.js';
import { ITEMS, characterById } from '../../shared/constants.js';

const ICONS = {
  red: '<path d="M20 44 L28 20 L36 44 L28 40 Z" fill="#fff"/><path d="M24 44 L28 52 L32 44Z" fill="#ffd23f"/>',
  blue: '<path d="M18 40 L28 26 L38 40 L33 40 L28 33 L23 40Z M18 30 L28 16 L38 30 L33 30 L28 23 L23 30Z" fill="#fff"/>',
  green: '<path d="M28 16 C22 26 18 31 18 37 a10 10 0 0 0 20 0 C38 31 34 26 28 16Z" fill="#fff"/>',
  yellow: '<path d="M28 15 L40 20 C40 34 35 42 28 46 C21 42 16 34 16 20Z" fill="#fff"/>',
  rainbow: '<path d="M18 20 h7 v13 a3 3 0 0 0 6 0 v-13 h7 v13 a10 10 0 0 1 -20 0Z" fill="#fff"/><rect x="18" y="20" width="7" height="5" fill="#9aa0a8"/><rect x="31" y="20" width="7" height="5" fill="#9aa0a8"/>'
};

export function itemIcon(item, size = 56) {
  if (!item) return '';
  const c = ITEMS[item];
  const fill = item === 'rainbow' ? 'url(#rb)' : '#' + c.color.toString(16).padStart(6, '0');
  return `<svg viewBox="0 0 56 64" width="${size}" height="${size * 1.14}" aria-label="${c.name}">
    <defs><linearGradient id="rb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5d5d"/><stop offset=".33" stop-color="#ffd23f"/><stop offset=".66" stop-color="#3fbf55"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>
    <path d="M28 4 C12 4 4 16 4 28 C4 42 16 52 28 54 C40 52 52 42 52 28 C52 16 44 4 28 4Z" fill="${fill}" stroke="#12305a" stroke-width="3"/>
    <path d="M24 54 L28 60 L32 54Z" fill="${fill}" stroke="#12305a" stroke-width="2"/>
    ${ICONS[item]}</svg>`;
}

const ordinal = (n) => `${n}.`;

export class Hud {
  constructor(root, { name, character, showName }) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    const ch = characterById(character);
    this.el.innerHTML = `
      <div class="hud-tl">
        <div class="hud-lap"></div>
        <div class="hud-time"></div>
        <div class="hud-laptime"></div>
      </div>
      <div class="hud-tr">
        <div class="hud-item"><div class="hud-item-icon"></div><div class="hud-item-level"></div></div>
        <div class="hud-coins"><span class="coin"></span><b></b></div>
      </div>
      <div class="hud-place"><b></b><span></span></div>
      <div class="hud-speed"><div class="hud-speed-bar"><i></i></div></div>
      <div class="hud-msg"></div>
      <div class="hud-sub"></div>
      ${showName ? `<div class="hud-name" style="--pc:#${ch.kart.toString(16).padStart(6, '0')}">${escapeHtml(name)}</div>` : ''}
    `;
    root.appendChild(this.el);
    this.q = (s) => this.el.querySelector(s);
    this.lap = this.q('.hud-lap');
    this.time = this.q('.hud-time');
    this.lapTime = this.q('.hud-laptime');
    this.itemIcon = this.q('.hud-item-icon');
    this.itemLevel = this.q('.hud-item-level');
    this.itemBox = this.q('.hud-item');
    this.coins = this.q('.hud-coins b');
    this.placeN = this.q('.hud-place b');
    this.placeT = this.q('.hud-place span');
    this.speedBar = this.q('.hud-speed-bar i');
    this.msg = this.q('.hud-msg');
    this.sub = this.q('.hud-sub');
    this.cache = {};
    this.msgTimer = null;
    this.subTimer = null;
  }

  setRect(r) {
    Object.assign(this.el.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
  }

  set(key, el, value, html = false) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    if (html) el.innerHTML = value;
    else el.textContent = value;
  }

  update(s) {
    this.set('lap', this.lap, s.finished ? 'Im Ziel' : `Runde ${Math.max(1, Math.min(s.laps, s.lap))}/${s.laps}`);
    this.set('time', this.time, formatTime(s.time * 1000));
    this.set('laptime', this.lapTime, s.bestLap ? `Beste Runde ${formatTime(s.bestLap * 1000)}` : '');
    const itemKey = s.item ? s.item + s.level : '';
    if (this.cache.item !== itemKey) {
      this.cache.item = itemKey;
      this.itemIcon.innerHTML = itemIcon(s.item, 52);
      this.itemLevel.innerHTML = s.item ? [1, 2, 3].map((n) => `<i class="${n <= s.level ? 'on' : ''}"></i>`).join('') : '';
      this.itemBox.classList.toggle('empty', !s.item);
      this.itemBox.classList.remove('pop');
      void this.itemBox.offsetWidth;
      if (s.item) this.itemBox.classList.add('pop');
    }
    this.set('coins', this.coins, `${s.coins}/10`);
    this.set('place', this.placeN, ordinal(s.place));
    this.set('total', this.placeT, `von ${s.total}`);
    this.speedBar.style.transform = `scaleX(${Math.min(1, s.speed / 48).toFixed(3)})`;
    this.el.classList.toggle('boosting', !!s.boost);
  }

  flash(text, cls = '', dur = 1.4) {
    clearTimeout(this.msgTimer);
    this.msg.className = 'hud-msg show ' + cls;
    this.msg.textContent = text;
    if (dur > 0) this.msgTimer = setTimeout(() => (this.msg.className = 'hud-msg'), dur * 1000);
  }

  subtitle(text, dur = 2) {
    clearTimeout(this.subTimer);
    this.sub.textContent = text;
    this.sub.classList.add('show');
    if (dur > 0) this.subTimer = setTimeout(() => this.sub.classList.remove('show'), dur * 1000);
  }

  hideSub() {
    this.sub.classList.remove('show');
  }

  destroy() {
    clearTimeout(this.msgTimer);
    clearTimeout(this.subTimer);
    this.el.remove();
  }
}

export class Minimap {
  constructor(root, track, pathPts, colorOf) {
    this.el = document.createElement('canvas');
    this.el.className = 'minimap';
    this.size = 180;
    this.el.width = this.el.height = this.size * 2;
    root.appendChild(this.el);
    this.ctx = this.el.getContext('2d');
    this.colorOf = colorOf;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pathPts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const S = this.size * 2;
    const pad = 22;
    const sc = (S - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const ox = (S - (maxX - minX) * sc) / 2;
    const oz = (S - (maxZ - minZ) * sc) / 2;
    this.map = (x, z) => [ox + (x - minX) * sc, oz + (z - minZ) * sc];
    this.bg = document.createElement('canvas');
    this.bg.width = this.bg.height = S;
    const b = this.bg.getContext('2d');
    b.lineJoin = 'round';
    b.beginPath();
    pathPts.forEach(([x, z], i) => {
      const [px, py] = this.map(x, z);
      if (i) b.lineTo(px, py);
      else b.moveTo(px, py);
    });
    b.closePath();
    b.strokeStyle = 'rgba(18,48,90,0.85)';
    b.lineWidth = 18;
    b.stroke();
    b.strokeStyle = '#fff4d6';
    b.lineWidth = 9;
    b.stroke();
    const [sx, sy] = this.map(pathPts[0][0], pathPts[0][1]);
    b.fillStyle = '#ff5d5d';
    b.fillRect(sx - 7, sy - 7, 14, 14);
  }

  setPos(css) {
    Object.assign(this.el.style, css);
  }

  draw(karts, localIds) {
    const c = this.ctx;
    const S = this.size * 2;
    c.clearRect(0, 0, S, S);
    c.drawImage(this.bg, 0, 0);
    const sorted = [...karts].sort((a, b) => (localIds.has(a.id) ? 1 : 0) - (localIds.has(b.id) ? 1 : 0));
    for (const k of sorted) {
      const [x, y] = this.map(k.x, k.z);
      const local = localIds.has(k.id);
      c.beginPath();
      c.arc(x, y, local ? 12 : 8, 0, Math.PI * 2);
      c.fillStyle = this.colorOf(k.id);
      c.fill();
      c.lineWidth = local ? 5 : 3;
      c.strokeStyle = local ? '#ffffff' : '#12305a';
      c.stroke();
    }
  }

  destroy() {
    this.el.remove();
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
