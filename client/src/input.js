const keys = new Set();
const pressed = new Set();

window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && document.body.classList.contains('in-race')) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

export const LAYOUTS = {
  kb1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], drift: ['Space'], item: ['KeyE', 'KeyQ'], pause: ['Escape'], join: ['Space'] },
  kb2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], drift: ['ShiftRight', 'ControlRight'], item: ['Enter', 'NumpadEnter'], pause: ['Escape'], join: ['Enter'] }
};
LAYOUTS.kball = Object.fromEntries(Object.keys(LAYOUTS.kb1).map((k) => [k, [...LAYOUTS.kb1[k], ...LAYOUTS.kb2[k]]]));

export const DEVICE_NAMES = { kb1: 'Tastatur (WASD)', kb2: 'Tastatur (Pfeile)', kball: 'Tastatur', pad0: 'Controller 1', pad1: 'Controller 2', pad2: 'Controller 3', pad3: 'Controller 4' };

const anyKey = (list) => list.some((c) => keys.has(c));
const anyPressed = (list) => list.some((c) => pressed.has(c));

let padPrev = [];
let padNow = [];

export function pollInput() {
  padPrev = padNow;
  padNow = [];
  const raw = navigator.getGamepads ? [...navigator.getGamepads()] : [];
  const pads = raw.filter((p) => p && p.connected && p.buttons.length >= 4).sort((a, b) => a.index - b.index);
  for (let i = 0; i < 4; i++) {
    const p = pads[i];
    if (!p) {
      padNow[i] = null;
      continue;
    }
    const buttons = [...p.buttons].map((b) => b.pressed || b.value > 0.5);
    const axes = [...p.axes];
    if (p.mapping !== 'standard' && axes.length > 7 && !buttons[12] && !buttons[13] && !buttons[14] && !buttons[15]) {
      buttons[14] = axes[6] < -0.5;
      buttons[15] = axes[6] > 0.5;
      buttons[12] = axes[7] < -0.5;
      buttons[13] = axes[7] > 0.5;
    }
    padNow[i] = { buttons, axes };
  }
}

export function endFrame() {
  pressed.clear();
}

function padBtn(i, b) {
  return !!(padNow[i] && padNow[i].buttons[b]);
}
function padEdge(i, b) {
  return padBtn(i, b) && !(padPrev[i] && padPrev[i].buttons[b]);
}

const dead = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);

export function readDevice(dev, opts = {}) {
  const inv = opts.invertPlane ? -1 : 1;
  if (dev.startsWith('kb')) {
    const L = LAYOUTS[dev] || LAYOUTS.kball;
    const up = anyKey(L.up) ? 1 : 0;
    const down = anyKey(L.down) ? 1 : 0;
    return {
      gas: up, brake: down, steer: (anyKey(L.right) ? 1 : 0) - (anyKey(L.left) ? 1 : 0), pitch: (up - down) * inv,
      drift: anyKey(L.drift), item: anyPressed(L.item), pause: anyPressed(L.pause)
    };
  }
  const i = Number(dev.slice(3));
  const p = padNow[i];
  if (!p) return { gas: 0, brake: 0, steer: 0, pitch: 0, drift: false, item: false, pause: false };
  const ax = dead(p.axes[0] || 0);
  const ay = dead(p.axes[1] || 0);
  const dpadX = (padBtn(i, 15) ? 1 : 0) - (padBtn(i, 14) ? 1 : 0);
  const dpadY = (padBtn(i, 12) ? 1 : 0) - (padBtn(i, 13) ? 1 : 0);
  return {
    gas: padBtn(i, 0) ? 1 : 0,
    brake: padBtn(i, 1) ? 1 : 0,
    steer: Math.max(-1, Math.min(1, ax + dpadX)),
    pitch: Math.max(-1, Math.min(1, -ay + dpadY)) * inv,
    drift: padBtn(i, 5) || padBtn(i, 7),
    item: padEdge(i, 2) || padEdge(i, 4) || padEdge(i, 6) || padEdge(i, 3),
    pause: padEdge(i, 9)
  };
}

export function menuNav(dev) {
  if (dev.startsWith('kb')) {
    const L = LAYOUTS[dev];
    return {
      left: anyPressed(L.left), right: anyPressed(L.right), up: anyPressed(L.up), down: anyPressed(L.down),
      confirm: anyPressed(L.join), back: anyPressed(dev === 'kb1' ? ['KeyQ', 'Escape'] : ['Backspace'])
    };
  }
  const i = Number(dev.slice(3));
  const ax = padNow[i] ? padNow[i].axes[0] || 0 : 0;
  const ay = padNow[i] ? padNow[i].axes[1] || 0 : 0;
  const pax = padPrev[i] ? padPrev[i].axes[0] || 0 : 0;
  const pay = padPrev[i] ? padPrev[i].axes[1] || 0 : 0;
  return {
    left: padEdge(i, 14) || (ax < -0.6 && pax >= -0.6), right: padEdge(i, 15) || (ax > 0.6 && pax <= 0.6),
    up: padEdge(i, 12) || (ay < -0.6 && pay >= -0.6), down: padEdge(i, 13) || (ay > 0.6 && pay <= 0.6),
    confirm: padEdge(i, 0), back: padEdge(i, 1)
  };
}

export function joinPresses(taken) {
  const out = [];
  if (!taken.includes('kb1') && !taken.includes('kball') && anyPressed(LAYOUTS.kb1.join)) out.push('kb1');
  if (!taken.includes('kb2') && !taken.includes('kball') && anyPressed(LAYOUTS.kb2.join)) out.push('kb2');
  for (let i = 0; i < 4; i++) if (!taken.includes('pad' + i) && (padEdge(i, 0) || padEdge(i, 9))) out.push('pad' + i);
  return out;
}

export function anyPadActivity() {
  for (let i = 0; i < 4; i++) {
    const p = padNow[i];
    if (!p) continue;
    if (p.buttons.some((b, k) => b && !(padPrev[i] && padPrev[i].buttons[k]))) return true;
  }
  return false;
}

export function anyPadEdge(btn) {
  for (let i = 0; i < 4; i++) if (padEdge(i, btn)) return true;
  return false;
}

export function padAxisEdge() {
  for (let i = 0; i < 4; i++) {
    const n = menuNav('pad' + i);
    if (n.up) return 'up';
    if (n.down) return 'down';
    if (n.left) return 'left';
    if (n.right) return 'right';
  }
  return null;
}
