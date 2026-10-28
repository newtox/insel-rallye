import { clamp, lerp, wrapAngle } from './math.js';

export function createBotBrain(rnd, skill) {
  return { rnd, skill, lane: (rnd() - 0.5) * 0.8, laneTarget: 0, laneT: 0, stuckT: 0, reverseT: 0, driftHold: false, wobble: rnd() * 10, totalStuck: 0 };
}

export function botInput(k, b, track, dt, env = {}) {
  const spd = Math.max(k.speed, 6);
  const look = (k.vehicle === 'plane' ? 14 : 8) + spd * 0.42;
  const ahead = Math.max(3, Math.round(look / track.spacing));
  b.laneT -= dt;
  if (b.laneT <= 0) {
    b.laneT = 1.2 + b.rnd() * 2.8;
    b.laneTarget = (b.rnd() - 0.5) * 1.1;
    if (env.wantBalloon && env.balloons) {
      let best = null;
      for (const bl of env.balloons) {
        if (!bl.active) continue;
        let di = bl.i - k.hint;
        if (di < 0) di += track.n;
        if (di > 8 && di < 45 && (!best || di < best.di)) best = { di, lat: bl.lat };
      }
      if (best && b.rnd() < 0.75) b.laneTarget = clamp(best.lat, -0.7, 0.7);
    }
  }
  b.lane = lerp(b.lane, b.laneTarget, Math.min(1, dt * 1.3));
  const i = track.idx(k.hint + ahead);
  const w = track.ws[i];
  const p = track.pointAt(i, b.lane * w * 0.8);
  const want = Math.atan2(p.x - k.x, p.z - k.z);
  const diff = wrapAngle(want - k.yaw);
  b.wobble += dt * 1.7;
  let steer = clamp(-diff * 2.6, -1, 1) + Math.sin(b.wobble) * (1 - b.skill) * 0.25;
  steer = clamp(steer, -1, 1);
  let gas = 1;
  let brake = 0;
  let drift = false;
  let pitch = 0;
  const curv = Math.abs(track.curvatureAhead(k.hint + Math.round(ahead * 0.4), 24));
  if (k.vehicle === 'plane') {
    let targetY = track.ys[i] + 5;
    if (track.rings.length) {
      let best = null;
      for (const r of track.rings) {
        let di = r.i - k.hint;
        if (di < 0) di += track.n;
        if (di > 2 && di < 40 && (!best || di < best.di)) best = { di, r };
      }
      if (best) {
        targetY = best.r.y;
        const rw = Math.atan2(best.r.x - k.x, best.r.z - k.z);
        const rd = wrapAngle(rw - k.yaw);
        if (Math.abs(rd) < 0.6 && b.skill > 0.7) steer = clamp(-rd * 2.6, -1, 1);
      }
    }
    const ground = track.heightAt(k.x + Math.sin(k.yaw) * 18, k.z + Math.cos(k.yaw) * 18);
    targetY = Math.max(targetY, ground + 4, track.water + 3);
    pitch = clamp((targetY - k.y) * 0.13, -1, 1);
    if (curv > 1.1 && b.skill > 0.6) drift = true;
  } else {
    if (curv > 1.0 && k.speed > 26 + 6 * b.skill) gas = 0.3;
    if (Math.abs(diff) > 1.1 && k.speed > 12) {
      gas = 0;
      brake = 0.7;
    }
    if (b.skill > 0.65) {
      if (!b.driftHold && curv > 0.6 && k.speed > 22 && Math.abs(steer) > 0.35) b.driftHold = true;
      if (b.driftHold && (curv < 0.22 || k.speed < 12)) b.driftHold = false;
      drift = b.driftHold;
    }
  }
  if (k.vehicle !== 'plane') {
    if (k.speed < 2.5 && gas > 0 && !env.frozen && k.respawnT <= 0) {
      b.stuckT += dt;
      b.totalStuck += dt;
      if (b.stuckT > 1.1) {
        b.reverseT = 0.9;
        b.stuckT = 0;
      }
    } else {
      b.stuckT = 0;
      if (k.speed > 8) b.totalStuck = 0;
    }
    if (b.reverseT > 0) {
      b.reverseT -= dt;
      gas = 0;
      brake = 1;
      steer = -steer;
      drift = false;
    }
  }
  if (k.wrongT > 1.2) {
    steer = diff > 0 ? -1 : 1;
  }
  return { gas, brake, steer, pitch, drift, needRescue: b.totalStuck > 5 };
}
