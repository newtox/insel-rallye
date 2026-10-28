export const VERSION = '1.0.0';

export const CHARACTERS = [
  { id: 'ruffy', name: 'Ruffy', animal: 'Waschbär', color: 0x8a8f99, accent: 0x2b2d33, kart: 0x3b82f6, ears: 'round', face: 'mask', stats: { speed: 1.0, accel: 1.0, turn: 1.0 } },
  { id: 'flinka', name: 'Flinka', animal: 'Fuchs', color: 0xf07a2a, accent: 0xfff3e6, kart: 0xef4444, ears: 'pointy', face: 'snout', stats: { speed: 0.97, accel: 1.1, turn: 1.08 } },
  { id: 'pingo', name: 'Pingo', animal: 'Pinguin', color: 0x1f2937, accent: 0xf8fafc, kart: 0x22d3ee, ears: 'none', face: 'beak', stats: { speed: 1.02, accel: 0.96, turn: 1.0 } },
  { id: 'quaki', name: 'Quaki', animal: 'Frosch', color: 0x4ade80, accent: 0xecfccb, kart: 0xa3e635, ears: 'none', face: 'frog', stats: { speed: 0.96, accel: 1.12, turn: 1.1 } },
  { id: 'bambu', name: 'Bambu', animal: 'Panda', color: 0xf5f5f4, accent: 0x111111, kart: 0x10b981, ears: 'round', face: 'panda', stats: { speed: 1.04, accel: 0.92, turn: 0.95 } },
  { id: 'hoppla', name: 'Hoppla', animal: 'Hase', color: 0xfbcfe8, accent: 0xffffff, kart: 0xec4899, ears: 'long', face: 'bunny', stats: { speed: 0.98, accel: 1.06, turn: 1.04 } },
  { id: 'mauzi', name: 'Mauzi', animal: 'Katze', color: 0xfacc15, accent: 0xfff7d6, kart: 0x8b5cf6, ears: 'pointy', face: 'cat', stats: { speed: 1.0, accel: 1.02, turn: 1.03 } },
  { id: 'brummi', name: 'Brummi', animal: 'Bär', color: 0x92582f, accent: 0xd6a77a, kart: 0xf59e0b, ears: 'round', face: 'snout', stats: { speed: 1.05, accel: 0.9, turn: 0.93 } }
];

export const CHARACTER_IDS = CHARACTERS.map((c) => c.id);
export const characterById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

export const VEHICLES = {
  car: { id: 'car', name: 'Kart', maxSpeed: 36, accel: 24, brake: 48, reverse: 12, turn: 2.2, grip: 9, driftGrip: 2.4, surf: { road: 1, curb: 0.97, grass: 0.58, sand: 0.72, snow: 0.62, rock: 0.6, ice: 0.95, water: 0.5 } },
  hover: { id: 'hover', name: 'Hovercraft', maxSpeed: 34, accel: 21, brake: 30, reverse: 10, turn: 2.5, grip: 2.7, driftGrip: 1.3, surf: { road: 1, curb: 1, grass: 0.8, sand: 0.9, snow: 0.85, rock: 0.78, ice: 1.02, water: 1.07 } },
  plane: { id: 'plane', name: 'Flugzeug', maxSpeed: 37, accel: 16, brake: 30, reverse: 0, turn: 1.75, grip: 4, driftGrip: 2, surf: {} }
};
export const VEHICLE_IDS = Object.keys(VEHICLES);

export const ITEMS = {
  red: { id: 'red', name: 'Rakete', color: 0xef4444, levels: ['Rakete', 'Zielsuch-Rakete', '3 Zielsuch-Raketen'] },
  blue: { id: 'blue', name: 'Turbo', color: 0x3b82f6, levels: ['Turbo', 'Super-Turbo', 'Mega-Turbo'] },
  green: { id: 'green', name: 'Falle', color: 0x22c55e, levels: ['Ölfleck', 'Blasenfalle', 'Mine'] },
  yellow: { id: 'yellow', name: 'Schild', color: 0xfacc15, levels: ['Schild', 'Langes Schild', 'Super-Schild'] },
  rainbow: { id: 'rainbow', name: 'Magnet', color: 0xd946ef, levels: ['Magnet', 'Starker Magnet', 'Super-Magnet'] }
};
export const ITEM_IDS = Object.keys(ITEMS);

export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
export const MAX_PLAYERS = 8;
export const MAX_COINS = 10;
export const WATER_LEVEL = 0;
export const GRAVITY = 32;
export const COUNTDOWN_MS = 3600;

export const BOT_NAMES = ['Kiki', 'Bodo', 'Lumi', 'Tobi', 'Nala', 'Fips', 'Juna', 'Rocco', 'Mika', 'Zoe'];
export const DIFFICULTIES = {
  easy: { name: 'Leicht', speed: 0.86, items: 0.5, skill: 0.6 },
  normal: { name: 'Mittel', speed: 0.94, items: 0.8, skill: 0.82 },
  hard: { name: 'Schwer', speed: 1.0, items: 1, skill: 1 }
};

export const PLACE_LABEL = (p) => `${p}.`;
