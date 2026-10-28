import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RaceSim } from '../shared/race.js';
import { TRACKS } from '../shared/tracks.js';
import { CHARACTER_IDS } from '../shared/constants.js';

function runRace(trackId, vehicle, laps = 2) {
  const players = CHARACTER_IDS.slice(0, 4).map((c, i) => ({ id: 'b' + i, name: c, character: c, vehicle, bot: true }));
  const sim = new RaceSim({ trackId, laps, players, difficulty: 'hard', seed: 42 });
  for (let i = 0; i < 60 * 60 * 6 && !sim.ended; i++) sim.update(1 / 60);
  return sim;
}

for (const t of TRACKS) {
  test(`Bots fahren ${t.name} zu Ende`, () => {
    const sim = runRace(t.id, t.defaultVehicle);
    assert.ok(sim.ended, 'Rennen wurde nicht beendet');
    assert.equal(sim.results.length, 4);
    assert.ok(sim.results.every((r) => r.time != null), 'nicht alle Bots im Ziel');
    assert.ok(sim.results[0].time > 20000, 'Siegerzeit unplausibel kurz');
  });
}

test('Flugzeug und Hovercraft kommen auf der Palmenbucht ins Ziel', () => {
  for (const v of ['plane', 'hover']) {
    const sim = runRace('palmenbucht', v, 1);
    assert.ok(sim.results.every((r) => r.time != null), v);
  }
});

test('Abkürzen neben den Fahnen wird erkannt, normales Durchfahren zählt', async () => {
  const { getTrack } = await import('../shared/trackgen.js');
  const { createKart, updateProgress, EV } = await import('../shared/physics.js');
  const track = getTrack('palmenbucht');
  const g = track.gates[3];
  const place = (k, i, lat) => {
    const p = track.pointAt(i, lat);
    k.x = p.x;
    k.z = p.z;
    k.ev = 0;
    updateProgress(k, track, track.locate(p.x, p.z, i));
  };
  const ok = createKart({ id: 'a', track });
  ok.lap = 1;
  ok.cp = 1;
  place(ok, g.i - 3, 0);
  place(ok, g.i + 2, 0);
  assert.ok(ok.cp & (1 << 3), 'Fahne auf der Strecke nicht gezählt');
  assert.equal(ok.respawnT, 0);
  const cheat = createKart({ id: 'b', track });
  cheat.lap = 1;
  cheat.cp = 1;
  place(cheat, g.i - 3, 0);
  place(cheat, g.i + 2, g.w + 25);
  assert.ok(cheat.ev & EV.MISSED, 'Abkürzung nicht erkannt');
  assert.ok(cheat.respawnT > 0);
  assert.equal(cheat.cp & (1 << 3), 0);
});
