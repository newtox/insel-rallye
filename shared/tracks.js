export const THEMES = {
  beach: {
    skyTop: 0x3aa0ff, skyBottom: 0xbfe6ff, fog: 0xbfe6ff, fogNear: 180, fogFar: 650,
    grass: 0x5cc94a, grass2: 0x3fa83a, sand: 0xf3dc9b, rock: 0x9b8b7a, high: 0x6b8e3a,
    road: 0x6b6f78, roadLine: 0xffffff, curbA: 0xe23b3b, curbB: 0xffffff,
    liquid: 0x1fa3d6, liquidDeep: 0x0a5f9e, sun: 0xfff3d6, hemiSky: 0xd9f1ff, hemiGround: 0x5d8f4a, ambient: 0.55
  },
  volcano: {
    skyTop: 0x5a2a3c, skyBottom: 0xf28c4a, fog: 0xd98059, fogNear: 140, fogFar: 520,
    grass: 0x6e5a4e, grass2: 0x4d3d36, sand: 0x3a302c, rock: 0x2f2826, high: 0x463733,
    road: 0x4b4448, roadLine: 0xffd166, curbA: 0xffb703, curbB: 0x222222,
    liquid: 0xff5a1f, liquidDeep: 0xb32400, sun: 0xffc9a1, hemiSky: 0xffb38a, hemiGround: 0x4a2a20, ambient: 0.5
  },
  lagoon: {
    skyTop: 0x2bb5d8, skyBottom: 0xd6f6ff, fog: 0xcff3ff, fogNear: 200, fogFar: 700,
    grass: 0x68d65a, grass2: 0x45b84a, sand: 0xfbe7b2, rock: 0xa3988a, high: 0x76a843,
    road: 0xd8c08a, roadLine: 0x9a7b4f, curbA: 0x8a5a33, curbB: 0xc89a5a,
    liquid: 0x17c3c9, liquidDeep: 0x087a9e, sun: 0xfffbe8, hemiSky: 0xe3fbff, hemiGround: 0x4f9f6a, ambient: 0.6
  },
  snow: {
    skyTop: 0x7aa7d9, skyBottom: 0xe8f1fb, fog: 0xe8f1fb, fogNear: 120, fogFar: 480,
    grass: 0xf4f8ff, grass2: 0xdfe8f5, sand: 0xc9d8ea, rock: 0x7c8794, high: 0xffffff,
    road: 0x7b8594, roadLine: 0xffffff, curbA: 0x3b82f6, curbB: 0xffffff,
    liquid: 0xbfe3f5, liquidDeep: 0x8cc4e6, sun: 0xffffff, hemiSky: 0xeaf3ff, hemiGround: 0x9fb2c8, ambient: 0.62
  },
  temple: {
    skyTop: 0x4b3b8f, skyBottom: 0xffb27a, fog: 0xf0a77f, fogNear: 220, fogFar: 760,
    grass: 0x8fbf5a, grass2: 0x6a9a44, sand: 0xe0c48e, rock: 0xb48a6a, high: 0xc9a27a,
    road: 0xc9b28a, roadLine: 0x7a5a3a, curbA: 0xd97706, curbB: 0xfde68a,
    liquid: 0x3a7bd5, liquidDeep: 0x23447e, sun: 0xffd2a8, hemiSky: 0xffd9c2, hemiGround: 0x6a5a4a, ambient: 0.55
  }
};

export const TRACKS = [
  {
    id: 'palmenbucht',
    name: 'Palmenbucht',
    desc: 'Sonniger Strandkurs mit einer flachen Wasserpassage – ideal zum Einfahren.',
    theme: 'beach',
    defaultVehicle: 'car',
    liquid: 'water',
    width: 9.5,
    points: [
      [0, 0, 1.6], [70, -8, 1.6], [140, 2, 2.2], [200, 30, 3.2], [236, 85, 5], [232, 150, 6], [196, 200, 4],
      [136, 216, 1.6], [76, 200, -0.7], [18, 208, -0.75], [-40, 228, 0.6], [-102, 206, 2.2], [-142, 160, 4.2],
      [-152, 100, 6], [-126, 50, 4], [-70, 18, 2]
    ],
    terrain: { hills: 9, island: [70, 140], base: 0.6, seaFloor: -10, scale: 0.014, shoulder: 10 },
    ramps: [{ u: 0.27, len: 16, h: 2.4 }, { u: 0.83, len: 14, h: 2 }],
    pads: [{ u: 0.05, lat: 0 }, { u: 0.4, lat: -0.35 }, { u: 0.62, lat: 0.4 }, { u: 0.9, lat: 0 }],
    balloons: [
      { u: 0.16, colors: ['red', 'blue', 'green'] },
      { u: 0.36, colors: ['yellow', 'red', 'rainbow'] },
      { u: 0.55, colors: ['blue', 'green', 'red'] },
      { u: 0.76, colors: ['red', 'yellow', 'blue'] }
    ],
    coins: [{ u: 0.1, lat: 0.4, n: 5 }, { u: 0.31, lat: -0.4, n: 5 }, { u: 0.47, lat: 0, n: 6 }, { u: 0.69, lat: -0.3, n: 5 }, { u: 0.86, lat: 0.35, n: 5 }],
    rings: [],
    decor: { palm: 140, rock: 30, bush: 70 }
  },
  {
    id: 'vulkanpfad',
    name: 'Vulkanpfad',
    desc: 'Enge Serpentinen am Krater, Lavaseen und große Sprünge.',
    theme: 'volcano',
    defaultVehicle: 'car',
    liquid: 'lava',
    width: 8.5,
    points: [
      [0, 0, 5], [80, 10, 7], [150, -18, 11], [212, 10, 15], [232, 80, 19], [192, 132, 23], [122, 124, 21],
      [80, 172, 17], [112, 232, 13], [62, 282, 9], [-20, 272, 7], [-82, 222, 10], [-62, 160, 13],
      [-112, 110, 11], [-152, 50, 7], [-92, 2, 5]
    ],
    terrain: { hills: 26, island: [80, 150], base: -0.5, seaFloor: -12, scale: 0.016, shoulder: 9 },
    ramps: [{ u: 0.12, len: 16, h: 2.8 }, { u: 0.47, len: 14, h: 2.4 }, { u: 0.78, len: 16, h: 3 }],
    pads: [{ u: 0.02, lat: 0 }, { u: 0.3, lat: 0.3 }, { u: 0.58, lat: -0.3 }, { u: 0.88, lat: 0 }],
    balloons: [
      { u: 0.08, colors: ['red', 'green', 'blue'] },
      { u: 0.33, colors: ['rainbow', 'red', 'yellow'] },
      { u: 0.52, colors: ['green', 'blue', 'red'] },
      { u: 0.72, colors: ['red', 'yellow', 'green'] },
      { u: 0.92, colors: ['blue', 'red', 'rainbow'] }
    ],
    coins: [{ u: 0.18, lat: -0.3, n: 5 }, { u: 0.4, lat: 0.3, n: 5 }, { u: 0.63, lat: 0, n: 6 }, { u: 0.84, lat: -0.35, n: 5 }],
    rings: [],
    decor: { deadtree: 50, rock: 110, crystal: 25 }
  },
  {
    id: 'lagunenlauf',
    name: 'Lagunenlauf',
    desc: 'Durch die Lagune – mit dem Hovercraft gleitest du übers Wasser.',
    theme: 'lagoon',
    defaultVehicle: 'hover',
    liquid: 'water',
    width: 10,
    points: [
      [0, 0, 1.2], [90, 20, 0.6], [160, -10, -1.6], [232, 30, -1.6], [262, 110, -1.1], [222, 180, 0.6],
      [152, 172, 1.6], [102, 222, -1.3], [20, 242, -1.6], [-60, 212, -1.1], [-112, 150, 1.1], [-92, 80, 1.6],
      [-132, 20, -1.1], [-72, -30, 0.2]
    ],
    terrain: { hills: 6, island: [28, 70], base: 0.8, seaFloor: -7, scale: 0.02, shoulder: 8 },
    ramps: [{ u: 0.44, len: 14, h: 2.2 }, { u: 0.71, len: 14, h: 2.2 }],
    pads: [{ u: 0.03, lat: 0 }, { u: 0.22, lat: 0.35 }, { u: 0.5, lat: -0.35 }, { u: 0.8, lat: 0.3 }],
    balloons: [
      { u: 0.12, colors: ['blue', 'red', 'green'] },
      { u: 0.31, colors: ['red', 'rainbow', 'yellow'] },
      { u: 0.58, colors: ['green', 'red', 'blue'] },
      { u: 0.86, colors: ['yellow', 'blue', 'red'] }
    ],
    coins: [{ u: 0.07, lat: 0.3, n: 5 }, { u: 0.26, lat: -0.3, n: 6 }, { u: 0.46, lat: 0.3, n: 5 }, { u: 0.65, lat: 0, n: 6 }, { u: 0.93, lat: -0.3, n: 5 }],
    rings: [],
    decor: { palm: 90, rock: 40, bush: 40, lily: 60 }
  },
  {
    id: 'gletscherpass',
    name: 'Gletscherpass',
    desc: 'Verschneite Bergstraße mit gefrorenem See – Vorsicht, rutschig!',
    theme: 'snow',
    defaultVehicle: 'car',
    liquid: 'ice',
    width: 9,
    points: [
      [0, 0, 3], [70, -20, 4], [140, -10, 7], [190, 40, 10], [180, 110, 12], [120, 140, 9], [70, 110, 6],
      [20, 140, 3], [-10, 210, 0.2], [-80, 240, 0.2], [-150, 200, 3], [-170, 130, 7], [-140, 70, 9], [-80, 40, 6]
    ],
    terrain: { hills: 22, island: [80, 150], base: 0, seaFloor: -6, scale: 0.015, shoulder: 9 },
    ramps: [{ u: 0.2, len: 16, h: 2.6 }, { u: 0.55, len: 14, h: 2.4 }, { u: 0.88, len: 14, h: 2.2 }],
    pads: [{ u: 0.04, lat: 0 }, { u: 0.35, lat: -0.3 }, { u: 0.66, lat: 0.3 }],
    balloons: [
      { u: 0.13, colors: ['red', 'blue', 'yellow'] },
      { u: 0.4, colors: ['green', 'red', 'rainbow'] },
      { u: 0.62, colors: ['blue', 'yellow', 'red'] },
      { u: 0.8, colors: ['red', 'green', 'blue'] }
    ],
    coins: [{ u: 0.08, lat: -0.3, n: 5 }, { u: 0.29, lat: 0.3, n: 5 }, { u: 0.5, lat: 0, n: 6 }, { u: 0.72, lat: -0.3, n: 5 }, { u: 0.94, lat: 0.3, n: 4 }],
    rings: [],
    decor: { pine: 160, rock: 40, snowman: 6 }
  },
  {
    id: 'wolkentempel',
    name: 'Wolkentempel',
    desc: 'Tempelruinen hoch über dem Meer. Flieg durch die Ringe für einen Schub!',
    theme: 'temple',
    defaultVehicle: 'plane',
    liquid: 'water',
    width: 10,
    points: [
      [0, 0, 8], [90, -20, 12], [180, 0, 20], [250, 60, 28], [262, 150, 22], [210, 220, 14], [130, 240, 18],
      [60, 200, 26], [-10, 230, 20], [-90, 250, 12], [-170, 210, 16], [-210, 130, 24], [-190, 50, 18], [-110, 10, 10]
    ],
    terrain: { hills: 34, island: [60, 130], base: -1, seaFloor: -14, scale: 0.013, shoulder: 10 },
    ramps: [{ u: 0.16, len: 18, h: 3.2 }, { u: 0.5, len: 18, h: 3.2 }, { u: 0.83, len: 16, h: 2.8 }],
    pads: [{ u: 0.03, lat: 0 }, { u: 0.33, lat: 0.3 }, { u: 0.66, lat: -0.3 }],
    balloons: [
      { u: 0.1, colors: ['red', 'blue', 'green'] },
      { u: 0.28, colors: ['yellow', 'red', 'rainbow'] },
      { u: 0.45, colors: ['blue', 'green', 'red'] },
      { u: 0.63, colors: ['red', 'rainbow', 'blue'] },
      { u: 0.8, colors: ['green', 'red', 'yellow'] }
    ],
    coins: [{ u: 0.06, lat: 0.3, n: 5 }, { u: 0.22, lat: -0.3, n: 5 }, { u: 0.4, lat: 0, n: 6 }, { u: 0.58, lat: 0.3, n: 5 }, { u: 0.76, lat: -0.3, n: 5 }, { u: 0.92, lat: 0, n: 5 }],
    rings: [
      { u: 0.07, lat: 0, h: 9 }, { u: 0.14, lat: 0.3, h: 12 }, { u: 0.21, lat: -0.2, h: 10 }, { u: 0.3, lat: 0, h: 14 },
      { u: 0.38, lat: 0.3, h: 11 }, { u: 0.47, lat: -0.3, h: 13 }, { u: 0.55, lat: 0, h: 10 }, { u: 0.62, lat: 0.3, h: 15 },
      { u: 0.7, lat: -0.2, h: 11 }, { u: 0.78, lat: 0, h: 12 }, { u: 0.86, lat: 0.25, h: 10 }, { u: 0.94, lat: -0.2, h: 9 }
    ],
    decor: { pillar: 45, ruin: 18, palm: 40, rock: 40 }
  }
];

export const trackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
export const TRACK_IDS = TRACKS.map((t) => t.id);
