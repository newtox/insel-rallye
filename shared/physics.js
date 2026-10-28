import { clamp, lerp, wrapAngle } from './math.js';
import { VEHICLES, characterById, GRAVITY, MAX_COINS, SECTORS } from './constants.js';

export const EV = { LAP: 1, PAD: 2, RING: 4, LAND: 8, RESPAWN: 16, MINIBOOST: 32, WALL: 64, SPLASH: 128, FALL: 256, BURN: 512 };
const FULL = (1 << SECTORS) - 1;

export function createKart({ id, vehicle = 'car', character = 'ruffy', track, slot = 0 }) {
  const sp = track.spawnSlot(slot);
  const ch = characterById(character);
  const k = {
    id, vehicle: VEHICLES[vehicle] ? vehicle : 'car', character: ch.id, stats: ch.stats,
    x: sp.x, y: sp.y, z: sp.z, vx: 0, vy: 0, vz: 0, yaw: sp.yaw, pitch: 0, roll: 0, spd: 0,
    grounded: true, airT: 0, drift: 0, driftT: 0, boostT: 0, boostPow: 0, spinT: 0, spinVis: 0, stunT: 0,
    shieldT: 0, magnetT: 0, magnetTarget: null, invulnT: 0, coins: 0, hint: sp.i, s: sp.i, lap: 0, cp: FULL,
    finished: false, respawnT: 0, deepT: 0, safe: sp.i, safeT: 0, wrongT: 0, surf: 'road', submerged: false,
    steerVis: 0, ev: 0, speed: 0, padT: 0, ringT: 0
  };
  if (k.vehicle === 'plane') k.y = sp.y + 1;
  return k;
}

export function kartProgress(k, track) {
  return k.lap * track.n + k.s;
}

export function applyEffect(k, e) {
  switch (e.type) {
    case 'boost':
      if (k.boostT <= 0) k.boostPow = e.pow;
      else k.boostPow = Math.max(k.boostPow, e.pow);
      k.boostT = Math.max(k.boostT, e.t);
      return true;
    case 'shield':
      k.shieldT = Math.max(k.shieldT, e.t);
      return true;
    case 'magnet':
      k.magnetT = e.t;
      k.magnetTarget = e.target;
      return true;
    case 'spin':
    case 'blast':
    case 'stun':
      if (k.shieldT > 0 || k.invulnT > 0 || k.respawnT > 0) return false;
      k.coins = Math.max(0, k.coins - 2);
      k.drift = 0;
      k.boostT = 0;
      k.magnetT = 0;
      if (e.type === 'spin') {
        k.spinT = e.t || 1.1;
        k.vx *= 0.35;
        k.vz *= 0.35;
      } else if (e.type === 'blast') {
        k.spinT = e.t || 1.5;
        k.vx *= 0.15;
        k.vz *= 0.15;
        k.vy = 12;
        k.grounded = false;
      } else {
        k.stunT = e.t || 1.6;
        k.vx *= 0.1;
        k.vz *= 0.1;
        k.vy = 4;
        k.grounded = false;
      }
      k.spd *= 0.4;
      k.invulnT = (e.t || 1.2) + 0.6;
      return true;
    case 'coins':
      k.coins = clamp(k.coins + e.n, 0, MAX_COINS);
      return true;
  }
  return false;
}

function liquidFloor(track, g, vehicle) {
  const w = track.water;
  if (vehicle === 'plane') return { floor: Math.max(g.h, w) + 1, surf: g.h < w ? 'water' : g.surf, liquid: false };
  if (track.liquid === 'ice') {
    if (g.h < w) return { floor: w, surf: 'ice', liquid: false };
    return { floor: g.h, surf: g.surf, liquid: false };
  }
  if (track.liquid === 'lava') {
    if (g.h < w + 0.05) return { floor: w, surf: 'lava', liquid: true };
    return { floor: g.h, surf: g.surf, liquid: false };
  }
  if (vehicle === 'hover') {
    if (g.h < w) return { floor: w, surf: 'water', liquid: false };
    return { floor: g.h, surf: g.surf, liquid: false };
  }
  return { floor: g.h, surf: g.surf, liquid: g.h < w - 0.4 };
}

export function stepKart(k, inp, track, dt, ctx = {}) {
  k.ev = 0;
  const timers = ['boostT', 'spinT', 'stunT', 'shieldT', 'magnetT', 'invulnT', 'padT', 'ringT'];
  for (const t of timers) if (k[t] > 0) k[t] = Math.max(0, k[t] - dt);
  if (k.spinT > 0) k.spinVis += dt * 14;
  else k.spinVis = 0;
  if (k.respawnT > 0) {
    k.respawnT -= dt;
    if (k.respawnT <= 0) respawn(k, track);
    return k;
  }
  if (ctx.frozen) {
    inp = { gas: 0, brake: 0, steer: 0, pitch: 0, drift: false };
  }
  if (k.vehicle === 'plane') stepPlane(k, inp, track, dt, ctx);
  else stepGround(k, inp, track, dt, ctx);
  const nav = track.locate(k.x, k.z, k.hint);
  k.hint = nav.i;
  if (nav.far || nav.dist > nav.w + 160 || k.y < track.def.terrain.seaFloor - 5) {
    startFall(k);
    return k;
  }
  updateProgress(k, track, nav);
  features(k, track, nav);
  const fx = Math.sin(k.yaw);
  const fz = Math.cos(k.yaw);
  const dir = fx * track.txs[nav.i] + fz * track.tzs[nav.i];
  if (dir < -0.35 && k.speed > 4 && !k.finished) k.wrongT += dt;
  else k.wrongT = 0;
  return k;
}

function stepGround(k, inp, track, dt, ctx) {
  const V = VEHICLES[k.vehicle];
  const S = k.stats;
  const control = k.spinT > 0 || k.stunT > 0 ? 0 : 1;
  const nav = track.locate(k.x, k.z, k.hint);
  k.hint = nav.i;
  const g0 = track.groundAt(k.x, k.z, nav);
  const L0 = liquidFloor(track, g0, k.vehicle);
  let surf = L0.surf;
  const submerged = k.vehicle === 'car' && L0.liquid && k.y < track.water - 0.4;
  k.submerged = submerged;
  k.surf = submerged ? 'water' : surf;
  let sf = submerged ? V.surf.water : V.surf[surf] ?? 0.7;
  if (k.vehicle === 'hover' && surf === 'water') sf = V.surf.water;
  const coinMul = 1 + 0.009 * k.coins;
  const boostMul = k.boostT > 0 ? 1 + k.boostPow : 1;
  let steerIn = (inp.steer || 0) * control;
  let magnetMul = 1;
  if (k.magnetT > 0 && ctx.getPos && k.magnetTarget) {
    const tp = ctx.getPos(k.magnetTarget);
    if (tp) {
      const dx = tp.x - k.x;
      const dz = tp.z - k.z;
      const d = Math.hypot(dx, dz);
      if (d < 5) k.magnetT = 0;
      else {
        const want = Math.atan2(dx, dz);
        steerIn = clamp(-wrapAngle(want - k.yaw) * 2.5, -1, 1) * control;
        magnetMul = 1.22;
      }
    } else k.magnetT = 0;
  }
  const top = V.maxSpeed * S.speed * sf * coinMul * boostMul * magnetMul * (ctx.speedMul || 1);
  let fx = Math.sin(k.yaw);
  let fz = Math.cos(k.yaw);
  let rx = -fz;
  let rz = fx;
  let vF = k.vx * fx + k.vz * fz;
  let vR = k.vx * rx + k.vz * rz;
  const gas = (inp.gas || 0) * control;
  const brake = (inp.brake || 0) * control;
  if (k.grounded) {
    if (k.boostT > 0 && vF < top) vF += V.accel * 2.4 * dt;
    if (k.magnetT > 0 && vF < top) vF += V.accel * dt;
    if (gas > 0 && vF < top) vF += V.accel * S.accel * gas * dt * (1 - 0.55 * clamp(vF / top, 0, 1));
    if (vF > top) vF -= Math.min(vF - top, (vF - top) * 2 * dt + 9 * dt);
    if (brake > 0) {
      if (vF > 0.5) vF -= V.brake * brake * dt;
      else vF = Math.max(vF - V.accel * 0.6 * brake * dt, -V.reverse);
    }
    if (!gas && !brake && k.boostT <= 0) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 7 * dt);
    if (!control) vF -= vF * 2.6 * dt;
    if (surf === 'ice') vF -= 0;
  }
  if (inp.drift && !k.drift && Math.abs(steerIn) > 0.3 && vF > 14 && k.grounded && control) {
    k.drift = Math.sign(steerIn);
    k.driftT = 0;
    k.vy = 3.2;
    k.grounded = false;
  }
  let steerEff = steerIn;
  if (k.drift) {
    if (!inp.drift || vF < 9 || !control) {
      if (k.driftT > 1.5) {
        applyEffect(k, { type: 'boost', t: 0.9, pow: 0.32 });
        k.ev |= EV.MINIBOOST;
      } else if (k.driftT > 0.75) {
        applyEffect(k, { type: 'boost', t: 0.5, pow: 0.22 });
        k.ev |= EV.MINIBOOST;
      }
      k.drift = 0;
      k.driftT = 0;
    } else {
      k.driftT += dt;
      steerEff = k.drift * 0.6 + steerIn * 0.5;
    }
  }
  const speedFactor = clamp(Math.abs(vF) / 9, 0, 1) * (1 - 0.22 * clamp(Math.abs(vF) / V.maxSpeed, 0, 1));
  const turnRate = V.turn * S.turn * speedFactor * (k.drift ? 1.3 : 1) * (k.grounded ? 1 : 0.4);
  k.yaw = wrapAngle(k.yaw - steerEff * turnRate * dt * (vF < -0.5 ? -1 : 1));
  k.steerVis = lerp(k.steerVis, steerIn, Math.min(1, dt * 10));
  let grip = k.drift ? V.driftGrip : V.grip;
  if (surf === 'ice') grip *= 0.25;
  if (!k.grounded) grip *= 0.1;
  vR *= Math.exp(-grip * dt);
  fx = Math.sin(k.yaw);
  fz = Math.cos(k.yaw);
  rx = -fz;
  rz = fx;
  k.vx = fx * vF + rx * vR;
  k.vz = fz * vF + rz * vR;
  const nx = k.x + k.vx * dt;
  const nz = k.z + k.vz * dt;
  const nav2 = track.locate(nx, nz, k.hint);
  const g1 = track.groundAt(nx, nz, nav2);
  const L1 = liquidFloor(track, g1, k.vehicle);
  const floor = L1.floor;
  const stepLimit = k.grounded ? 1.4 : 2.2;
  if (floor - k.y > stepLimit) {
    const gr = track.gradient(nx, nz);
    let nxn = -gr.gx;
    let nzn = -gr.gz;
    const l = Math.hypot(nxn, nzn) || 1;
    nxn /= l;
    nzn /= l;
    const vd = k.vx * nxn + k.vz * nzn;
    if (vd < 0) {
      k.vx -= 1.5 * vd * nxn;
      k.vz -= 1.5 * vd * nzn;
    }
    k.vx *= 0.7;
    k.vz *= 0.7;
    k.ev |= EV.WALL;
  } else {
    if (k.grounded) {
      const stepD = Math.hypot(nx - k.x, nz - k.z);
      if (stepD > 0.01) {
        const slope = (floor - k.y) / stepD;
        const along = (k.vx * fx + k.vz * fz) >= 0 ? 1 : -1;
        const pull = GRAVITY * 0.35 * clamp(slope, -1, 1) * along * dt;
        if (pull > 0) {
          k.vx -= fx * pull;
          k.vz -= fz * pull;
        }
      }
    }
    k.x = nx;
    k.z = nz;
  }
  if (k.grounded) {
    const predicted = k.y + k.vy * dt;
    if (predicted > floor + 0.3 && k.vy > 2.5) {
      k.grounded = false;
      k.y = predicted;
      k.airT = 0;
    } else {
      k.vy = clamp((floor - k.y) / dt, -25, 25);
      k.y = floor;
    }
  } else {
    k.vy -= GRAVITY * dt * (k.stunT > 0 ? 0.15 : 1);
    k.y += k.vy * dt;
    k.airT += dt;
    if (k.y <= floor) {
      if (k.airT > 0.25) k.ev |= EV.LAND;
      if (L1.liquid && k.airT > 0.2) k.ev |= EV.SPLASH;
      k.y = floor;
      k.vy = 0;
      k.grounded = true;
      k.airT = 0;
    }
  }
  const sh = track.water;
  if (L1.surf === 'lava' && k.y <= floor + 0.2 && k.invulnT <= 0.5) {
    k.ev |= EV.BURN;
    startFall(k);
    return;
  }
  if (k.vehicle === 'car' && L1.liquid && g1.h < sh - 3 && k.y < sh - 0.8) {
    k.deepT += dt;
    if (k.deepT > 0.6) {
      k.ev |= EV.SPLASH;
      startFall(k);
      return;
    }
  } else k.deepT = 0;
  if (k.grounded && (L1.surf === 'road' || L1.surf === 'curb') && !L1.liquid) {
    k.safeT += dt;
    if (k.safeT > 0.4) {
      k.safe = k.hint;
      k.safeT = 0;
    }
  }
  k.speed = Math.hypot(k.vx, k.vz);
  if (k.grounded) {
    const ahead = track.heightAt(k.x + fx * 1.4, k.z + fz * 1.4);
    const back = track.heightAt(k.x - fx * 1.4, k.z - fz * 1.4);
    const fl = k.vehicle === 'hover' ? Math.max(track.water, ahead) : ahead;
    const bl = k.vehicle === 'hover' ? Math.max(track.water, back) : back;
    k.pitch = lerp(k.pitch, -Math.atan2(fl - bl, 2.8), Math.min(1, dt * 12));
  } else {
    k.pitch = lerp(k.pitch, clamp(-k.vy * 0.03, -0.5, 0.5), Math.min(1, dt * 4));
  }
  k.roll = lerp(k.roll, (k.drift ? k.drift * 0.18 : 0) + steerIn * 0.05 * clamp(vF / 20, 0, 1), Math.min(1, dt * 8));
}

function stepPlane(k, inp, track, dt, ctx) {
  const V = VEHICLES.plane;
  const S = k.stats;
  const control = k.spinT > 0 || k.stunT > 0 ? 0 : 1;
  let steer = (inp.steer || 0) * control;
  let pitchIn = (inp.pitch || 0) * control;
  let magnetMul = 1;
  if (k.magnetT > 0 && ctx.getPos && k.magnetTarget) {
    const tp = ctx.getPos(k.magnetTarget);
    if (tp) {
      const dx = tp.x - k.x;
      const dz = tp.z - k.z;
      if (Math.hypot(dx, dz) < 5) k.magnetT = 0;
      else {
        steer = clamp(-wrapAngle(Math.atan2(dx, dz) - k.yaw) * 2.5, -1, 1) * control;
        pitchIn = clamp((tp.y + 1 - k.y) * 0.15, -1, 1) * control;
        magnetMul = 1.22;
      }
    } else k.magnetT = 0;
  }
  const coinMul = 1 + 0.009 * k.coins;
  const boostMul = k.boostT > 0 ? 1 + k.boostPow : 1;
  let target = V.maxSpeed * S.speed * coinMul * boostMul * magnetMul * (ctx.speedMul || 1);
  if (ctx.frozen) target = 0;
  const brake = (inp.brake || 0) * control;
  if (brake > 0) target *= 0.5;
  if (inp.drift) target *= 0.92;
  if (!control) target *= 0.3;
  const rate = k.spd < target ? (V.accel * S.accel) / V.maxSpeed : 1.4;
  k.spd += (target - k.spd) * Math.min(1, rate * dt);
  const turn = V.turn * S.turn * (inp.drift ? 1.55 : 1) * clamp(k.spd / 10, 0, 1);
  k.yaw = wrapAngle(k.yaw - steer * turn * dt);
  k.steerVis = lerp(k.steerVis, steer, Math.min(1, dt * 6));
  k.roll = lerp(k.roll, steer * 0.75, Math.min(1, dt * 5));
  const wantPitch = pitchIn * 0.62 + (!control ? -0.3 : 0);
  k.pitch = lerp(k.pitch, wantPitch, Math.min(1, dt * 3.2));
  const cp = Math.cos(k.pitch);
  k.vx = Math.sin(k.yaw) * cp * k.spd;
  k.vz = Math.cos(k.yaw) * cp * k.spd;
  k.vy = Math.sin(k.pitch) * k.spd + (k.stunT > 0 ? 2 : 0);
  if (k.boostT > 0 && k.spd < target) k.spd += V.accel * 1.5 * dt;
  k.x += k.vx * dt;
  k.z += k.vz * dt;
  k.y += k.vy * dt;
  const nav = track.locate(k.x, k.z, k.hint);
  const g = track.groundAt(k.x, k.z, nav);
  const L = liquidFloor(track, g, 'plane');
  if (k.y < L.floor) {
    k.y = L.floor;
    if (k.pitch < 0) k.pitch *= 0.4;
    if (!k.grounded) k.ev |= EV.LAND;
    k.grounded = true;
    k.spd *= 1 - 0.6 * dt;
  } else k.grounded = k.y - L.floor < 0.4;
  if (k.y > track.ceiling) {
    k.y = track.ceiling;
    if (k.pitch > 0) k.pitch *= 0.5;
  }
  k.surf = L.surf;
  k.speed = k.spd;
  if (nav.dist < nav.w + 6 && k.y - g.h < 30) {
    k.safeT += dt;
    if (k.safeT > 0.4) {
      k.safe = nav.i;
      k.safeT = 0;
    }
  }
}

function features(k, track, nav) {
  if (k.padT <= 0) {
    for (const p of track.pads) {
      let di = nav.i - p.i;
      if (di < 0) di += track.n;
      if (di >= 0 && di <= p.len && Math.abs(nav.lat - p.lat) < 3.6 && Math.abs(k.y - p.y) < 2.5) {
        applyEffect(k, { type: 'boost', t: 1.1, pow: 0.42 });
        k.padT = 0.5;
        k.ev |= EV.PAD;
        break;
      }
    }
  }
  if (k.ringT <= 0 && track.rings.length) {
    for (const r of track.rings) {
      const dx = k.x - r.x;
      const dy = k.y - r.y;
      const dz = k.z - r.z;
      if (dx * dx + dy * dy + dz * dz < r.r * r.r) {
        applyEffect(k, { type: 'boost', t: 0.9, pow: 0.35 });
        k.ringT = 0.6;
        k.ev |= EV.RING;
        break;
      }
    }
  }
}

export function updateProgress(k, track, nav) {
  const N = track.n;
  const s = nav.i + nav.t;
  const d = s - k.s;
  if (d < -N / 2) {
    if ((k.cp & FULL) === FULL) {
      k.lap++;
      k.cp = 0;
      if (k.lap > (k.maxLap || 0)) {
        k.maxLap = k.lap;
        k.ev |= EV.LAP;
      }
    }
  } else if (d > N / 2) {
    k.lap--;
    k.cp = FULL;
  }
  k.s = s;
  const sector = Math.min(SECTORS - 1, Math.floor((s / N) * SECTORS));
  if (k.lap >= 0 && !(k.lap === 0 && k.cp === FULL)) k.cp |= 1 << sector;
}

export function startFall(k) {
  if (k.respawnT > 0) return;
  k.respawnT = 1.1;
  k.ev |= EV.FALL;
  k.vx = k.vy = k.vz = 0;
  k.spd = 0;
  k.drift = 0;
}

export function respawn(k, track) {
  const i = track.idx(k.safe - 2);
  const p = track.pointAt(i, 0);
  k.x = p.x;
  k.z = p.z;
  k.y = p.y + (k.vehicle === 'plane' ? 3 : 1.2);
  k.yaw = p.yaw;
  k.vx = k.vy = k.vz = 0;
  k.spd = k.vehicle === 'plane' ? 12 : 0;
  k.pitch = 0;
  k.grounded = false;
  k.hint = i;
  k.respawnT = 0;
  k.invulnT = 1.6;
  k.spinT = 0;
  k.stunT = 0;
  k.ev |= EV.RESPAWN;
}

export function collideKarts(k, others) {
  for (const o of others) {
    if (o.id === k.id || o.respawnT > 0 || k.respawnT > 0) continue;
    const dx = k.x - o.x;
    const dz = k.z - o.z;
    const dy = k.y - o.y;
    if (Math.abs(dy) > 2.2) continue;
    const d = Math.hypot(dx, dz);
    const R = 2.4;
    if (d < R && d > 0.0001) {
      const nx = dx / d;
      const nz = dz / d;
      const push = (R - d) * 0.6;
      k.x += nx * push;
      k.z += nz * push;
      const vrel = (k.vx - (o.vx || 0)) * nx + (k.vz - (o.vz || 0)) * nz;
      if (vrel < 0) {
        k.vx -= vrel * nx * 0.8;
        k.vz -= vrel * nz * 0.8;
        if (k.vehicle === 'plane') k.spd *= 0.9;
      }
    }
  }
}

export function kartFlags(k) {
  return (k.drift ? 1 : 0) | (k.boostT > 0 ? 2 : 0) | (k.spinT > 0 ? 4 : 0) | (k.shieldT > 0 ? 8 : 0) | (k.stunT > 0 ? 16 : 0) |
    (k.respawnT > 0 ? 32 : 0) | (k.magnetT > 0 ? 64 : 0) | (k.grounded ? 128 : 0) | (k.submerged ? 256 : 0) | (k.drift && k.driftT > 1.5 ? 512 : k.drift && k.driftT > 0.75 ? 1024 : 0);
}
