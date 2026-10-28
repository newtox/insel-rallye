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
