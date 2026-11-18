// Solmar Bay — the city itself. A seeded generator lays out a road grid, city blocks
// with buildings, a beach and water on the west edge, a park, and a south highway.
// Collision is circle-vs-building-rectangle plus the water edge; everything else reads
// these helpers instead of knowing the layout.
import { PALETTE, ROAD, WORLD } from './config.js';
import { clamp, makeRng } from './random.js';

const BLOCK_GAP = ROAD.width / 2 + ROAD.sidewalk; // road centre -> block edge

function blockRects() {
  const rects = [];
  for (let c = 0; c < ROAD.vertical.length - 1; c += 1) {
    for (let r = 0; r < ROAD.horizontal.length - 1; r += 1) {
      rects.push({
        x0: ROAD.vertical[c] + BLOCK_GAP,
        y0: ROAD.horizontal[r] + BLOCK_GAP,
        x1: ROAD.vertical[c + 1] - BLOCK_GAP,
        y1: ROAD.horizontal[r + 1] - BLOCK_GAP,
        col: c, row: r,
      });
    }
  }
  return rects;
}

// The park block: between avenues 640/1040 and streets 1040/1440.
export const PARK_BLOCK = { col: 1, row: 2 };

// Named places (road points the missions and respawns use).
export const PLACES = {
  safehouse: { x: 1840, y: 1840, label: 'Safehouse' },
  garage: { x: 1040, y: 240, label: 'Garage' },
  bank: { x: 1440, y: 640, label: 'Solmar Bank' },
  pickup: { x: 1840, y: 640, label: 'Pickup' },
  dropoff: { x: 240, y: 1440, label: 'Drop-off' },
  crew: { x: 640, y: 1440, label: 'Crew pickup' },
  spawn: { x: 1780, y: 1780, label: 'Start' },
};

export function buildWorld(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const palms = [];
  const plazas = []; // empty lots / parking areas where parked cars can sit off-road

  // Buildings: each city block splits into 2x2 lots; a lot sometimes stays an empty plaza.
  // Block (col 3, row 0) is a dedicated parking lot, not buildings.
  for (const b of blockRects()) {
    if (b.col === PARK_BLOCK.col && b.row === PARK_BLOCK.row) continue; // the park
    if (b.col === 3 && b.row === 0) { plazas.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, big: true }); continue; }
    const lotW = (b.x1 - b.x0) / 2;
    const lotH = (b.y1 - b.y0) / 2;
    for (let lx = 0; lx < 2; lx += 1) {
      for (let ly = 0; ly < 2; ly += 1) {
        const isBank = b.col === 2 && b.row === 0 && lx === 0 && ly === 0;
        if (!isBank && rng.chance(0.18)) {
          plazas.push({ x0: b.x0 + lx * lotW + 8, y0: b.y0 + ly * lotH + 8, x1: b.x0 + (lx + 1) * lotW - 8, y1: b.y0 + (ly + 1) * lotH - 8, big: false });
          continue; // plaza / parking gap
        }
        const pad = 8;
        const w = lotW - pad * 2 - rng.range(0, 18);
        const h = lotH - pad * 2 - rng.range(0, 18);
        const x = b.x0 + lx * lotW + pad + rng.range(0, 10);
        const y = b.y0 + ly * lotH + pad + rng.range(0, 10);
        buildings.push({
          x, y, w, h,
          color: isBank ? '#e9c46a' : rng.pick(PALETTE.buildingRoof),
          height: isBank ? 3 : rng.int(1, 3), // rooftop shading tier
          bank: isBank,
          detail: rng.pick(['ac', 'vent', 'none', 'none', 'skylight']),
        });
      }
    }
  }

  // Park trees + a pond.
  const park = blockRects().find((b) => b.col === PARK_BLOCK.col && b.row === PARK_BLOCK.row);
  for (let i = 0; i < 26; i += 1) {
    const x = rng.range(park.x0 + 20, park.x1 - 20);
    const y = rng.range(park.y0 + 20, park.y1 - 20);
    if (Math.hypot(x - (park.x0 + park.x1) / 2, y - (park.y0 + park.y1) / 2) < 55) continue; // keep the pond clear
    trees.push({ x, y, r: rng.range(9, 15) });
  }

  // Palm trees along the beachfront and a few sidewalk trees.
  for (let y = 60; y < WORLD.size; y += 110) palms.push({ x: 108, y: y + rng.range(-14, 14), r: 11 });
  for (let i = 0; i < 18; i += 1) {
    const v = rng.pick(ROAD.vertical);
    const h = rng.pick(ROAD.horizontal);
    trees.push({ x: v + (rng.chance(0.5) ? -1 : 1) * (ROAD.width / 2 + 9), y: h + rng.range(-140, 140), r: rng.range(7, 10) });
  }

  const world = {
    seed,
    size: WORLD.size,
    buildings,
    trees,
    palms,
    plazas,
    park,
    pond: { x: (park.x0 + park.x1) / 2, y: (park.y0 + park.y1) / 2, r: 48 },
    places: PLACES,
  };
  return world;
}

// --- Collision ---------------------------------------------------------------

// Is a circle of radius r at (x, y) overlapping any solid? Buildings and the water.
export function hitsSolid(world, x, y, r) {
  if (x - r < WORLD.waterX) return true; // the sea
  if (x < -r || y < -r || x + r > world.size || y + r > world.size) return true;
  for (const b of world.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

// Push a circle out of solids; returns true if anything was hit. Mutates the given
// object {x, y} in place and returns the push normal for bounce/slide feedback.
export function resolveCircle(world, body, r) {
  let hit = false;
  let nx = 0;
  let ny = 0;
  if (body.x - r < WORLD.waterX) { body.x = WORLD.waterX + r; hit = true; nx = 1; }
  if (body.x - r < 0) { body.x = r; hit = true; nx = 1; }
  if (body.y - r < 0) { body.y = r; hit = true; ny = 1; }
  if (body.x + r > world.size) { body.x = world.size - r; hit = true; nx = -1; }
  if (body.y + r > world.size) { body.y = world.size - r; hit = true; ny = -1; }
  for (const b of world.buildings) {
    const cx = clamp(body.x, b.x, b.x + b.w);
    const cy = clamp(body.y, b.y, b.y + b.h);
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = r - d;
      body.x += (dx / d) * push;
      body.y += (dy / d) * push;
      nx = dx / d; ny = dy / d;
    } else {
      // Centre inside the rectangle: push out along the smallest penetration axis.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) { body.x = b.x - r; nx = -1; }
      else if (m === right) { body.x = b.x + b.w + r; nx = 1; }
      else if (m === top) { body.y = b.y - r; ny = -1; }
      else { body.y = b.y + b.h + r; ny = 1; }
    }
  }
  return { hit, nx, ny };
}

// Is the point on a road (drivable lane area)? Used by traffic and the minimap.
export function onRoad(x, y) {
  const half = ROAD.width / 2;
  for (const v of ROAD.vertical) if (Math.abs(x - v) <= half) return true;
  for (const h of ROAD.horizontal) if (Math.abs(y - h) <= half + (h === ROAD.highwayY ? (ROAD.highwayWidth - ROAD.width) / 2 : 0)) return true;
  return false;
}

// Is the point on sand (slower driving) or in the park?
export function onSand(x) { return x >= WORLD.waterX && x < WORLD.beachX; }
export function inPark(world, x, y) {
  const p = world.park;
  return x > p.x0 && x < p.x1 && y > p.y0 && y < p.y1;
}

// Nearest road centre line to a point (for spawning traffic on roads).
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const v of ROAD.vertical) {
    const d = Math.abs(x - v);
    if (d < bestD) { bestD = d; best = { x: v, y }; }
  }
  for (const h of ROAD.horizontal) {
    const d = Math.abs(y - h);
    if (d < bestD) { bestD = d; best = { x, y: h }; }
  }
  return best;
}
