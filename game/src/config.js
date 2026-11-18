// Solmar Bay — tuning constants and palette. Every number the game uses lives here.
export const WORLD = { size: 2000, beachX: 150, waterX: 70 };

export const STEP = 1 / 60; // fixed simulation step (seconds)

export const ROAD = {
  // Avenue / street centre lines (px). The y=1840 street is the wide south highway.
  vertical: [240, 640, 1040, 1440, 1840],
  horizontal: [240, 640, 1040, 1440, 1840],
  width: 84,
  highwayWidth: 130,
  highwayY: 1840,
  laneOffset: 21,
  sidewalk: 18,
};

// Sun-soaked coastal palette.
export const PALETTE = {
  grass: '#79c25a',
  grassDark: '#68ad4b',
  parkGrass: '#5da24a',
  sand: '#ecd9a0',
  sandDark: '#e0c98d',
  water: '#2fa8d8',
  waterDeep: '#1e8fc4',
  wave: '#8fd8f2',
  road: '#5b5348',
  roadEdge: '#4a443c',
  laneYellow: '#f5d76e',
  laneWhite: '#f2efe6',
  sidewalk: '#c9bda6',
  sidewalkLine: '#b3a78d',
  curb: '#9d9178',
  highway: '#514a41',
  buildingRoof: ['#e8a56b', '#f2d8a7', '#c96f5a', '#8fb8c9', '#a8c686', '#d9a0a0', '#b8b0a0', '#e07a5f', '#6d9dc5', '#e9c46a'],
  buildingEdge: '#3a3230',
  tree: '#3f8f3a',
  treeDark: '#2f7030',
  palm: '#4da34d',
  trunk: '#8a6b4a',
  hudBg: 'rgba(12, 16, 24, 0.72)',
  hudText: '#f5f0e6',
  accent: '#ffcf3f',
  danger: '#ff5a4e',
};

export const PLAYER = {
  radius: 12,
  walkSpeed: 185,
  runSpeed: 235,
  health: 100,
  regenDelay: 5,   // seconds without damage before regen starts
  regenRate: 4,    // hp per second
  fireRate: 0.18,  // seconds between pistol shots
  bulletSpeed: 760,
  bulletDamage: 30,
  bulletRange: 460,
};

// Car types: top-down rectangles. length/width in px, tuned speed/accel/handling.
// Grip is how fast velocity aligns with heading (higher = tighter, less drift).
export const CAR_TYPES = {
  sedan:   { label: 'Sedan',    w: 34, l: 62, topSpeed: 300, accel: 240, brake: 420, grip: 11, colors: ['#d94f3d', '#3d7bd9', '#e8e8e8', '#5aa469'] },
  taxi:    { label: 'Taxi',     w: 34, l: 62, topSpeed: 290, accel: 230, brake: 420, grip: 11, colors: ['#f7c948'] },
  sports:  { label: 'Sports',   w: 32, l: 66, topSpeed: 420, accel: 360, brake: 460, grip: 13, colors: ['#e63946', '#9b5de5', '#ff7b00'] },
  truck:   { label: 'Truck',    w: 40, l: 84, topSpeed: 230, accel: 150, brake: 320, grip: 9, colors: ['#7a7a7a', '#4f772d', '#8d6e63'] },
  police:  { label: 'Police',   w: 34, l: 64, topSpeed: 380, accel: 320, brake: 480, grip: 12, colors: ['#20242c'] },
};

export const TRAFFIC = {
  count: 14,
  cruiseSpeed: 150,
  highwaySpeed: 230,
  parkedCount: 14,
  slowDist: 95,   // slow down if something is this close ahead
  stopDist: 42,   // full stop this close ahead
};

export const PEDS = { count: 16, walkSpeed: 55, fleeSpeed: 150 };

export const WANTED = {
  max: 5,
  decayQuiet: 18,  // seconds with no crime before stars start dropping
  decayStep: 6,    // seconds per star lost while quiet
  bustTime: 2.0,   // seconds of police contact to get BUSTED
  policePerStar: [0, 1, 2, 3, 4, 4],
  crimeCooldown: 1.0, // seconds between wanted gains from the same kind of hit
};

export const MONEY = { start: 50, bustedLoss: 0.15, bustedMin: 50, wastedLoss: 0.10, wastedMin: 50 };

export const CAMERA = { lookAhead: 0.35, smooth: 6.0, shakeDecay: 6.0 };

export const SAVE_KEY = 'solmar-bay-save-v1';
