// Traffic cars that drive the road grid, and pedestrians who walk the sidewalks.
// Traffic follows lanes, turns at intersections, and slows for anything ahead.
// Pedestrians wander the sidewalks and flee from danger.
//
// Determinism: every random choice here (spawn spots, car types, turn decisions,
// pedestrian attributes) comes from the game's seeded RNG (G.rng, via rngFor),
// so the same ?shot=play&seed=N load always produces the same traffic layout.
// Callers without a seeded RNG (the headless smoke test) fall back to Math.random.
import { PEDS, ROAD, TRAFFIC } from './config.js';
import { dist, rngFor } from './random.js';
import { onRoad, resolveCircle } from './world.js';
import { resolveCarBody } from './vehicles.js';

export const DIRS = [
  { x: 0, y: -1 }, // 0 up (north)
  { x: 1, y: 0 },  // 1 right (east)
  { x: 0, y: 1 },  // 2 down (south)
  { x: -1, y: 0 }, // 3 left (west)
];
const DIR_ANGLE = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

// Lane centre for a road: right-hand traffic.
function laneCoord(road, dir) {
  if (dir === 0) return road - ROAD.laneOffset; // northbound: west lane
  if (dir === 2) return road + ROAD.laneOffset; // southbound: east lane
  if (dir === 1) return road - ROAD.laneOffset; // eastbound: north lane
  return road + ROAD.laneOffset;                // westbound: south lane
}

function nextIntersection(car) {
  const d = DIRS[car.dir];
  if (d.y !== 0) {
    // Moving vertically: next horizontal road in the direction of travel.
    let best = null;
    for (const h of ROAD.horizontal) {
      if (d.y < 0 && h < car.y && (best === null || h > best)) best = h;
      if (d.y > 0 && h > car.y && (best === null || h < best)) best = h;
    }
    return best === null ? null : { road: car.road, cross: best };
  }
  let best = null;
  for (const v of ROAD.vertical) {
    if (d.x > 0 && v > car.x && (best === null || v < best)) best = v;
    if (d.x < 0 && v < car.x && (best === null || v > best)) best = v;
  }
  return best === null ? null : { road: car.road, cross: best };
}

// Would driving in `dir` from the intersection (ix, iy) stay on the road grid?
function dirStaysOnGrid(dir, ix, iy) {
  if (dir === 0) return iy > ROAD.horizontal[0]; // north: a road must lie above
  if (dir === 2) return iy < ROAD.horizontal[ROAD.horizontal.length - 1]; // south: below
  if (dir === 3) return ix > ROAD.vertical[0]; // west: to the west
  return ix < ROAD.vertical[ROAD.vertical.length - 1]; // east: to the east
}

function chooseTurn(G, car, inter) {
  // The intersection point: (vertical road, horizontal road), whichever order
  // the car arrived in.
  const rng = rngFor(G);
  const wasVertical = car.dir === 0 || car.dir === 2;
  const ix = wasVertical ? inter.road : inter.cross;
  const iy = wasVertical ? inter.cross : inter.road;
  const left = (car.dir + 3) % 4;
  const right = (car.dir + 1) % 4;
  // Only directions that stay on the grid are candidates (never reverse). A car
  // turning south off the highway, or north off the top street, would otherwise
  // drive out of the world.
  const candidates = [car.dir, left, right].filter((d) => dirStaysOnGrid(d, ix, iy));
  let next = car.dir;
  const roll = rng.next();
  if (candidates.includes(car.dir) && roll < 0.55) next = car.dir;
  else {
    const turns = candidates.filter((d) => d !== car.dir);
    next = turns.length ? turns[Math.floor(rng.next() * turns.length)] : car.dir;
  }
  // Snap onto the new lane. inter.road is the road the car is on, inter.cross is the
  // road it crosses at this intersection; the intersection point is (vertical, horizontal).
  if (next === 0 || next === 2) {
    const vRoad = wasVertical ? inter.road : inter.cross;
    car.road = vRoad;
    car.x = laneCoord(vRoad, next);
    car.y = wasVertical ? inter.cross : inter.road;
  } else {
    const hRoad = wasVertical ? inter.cross : inter.road;
    car.road = hRoad;
    car.y = laneCoord(hRoad, next);
    car.x = wasVertical ? inter.road : inter.cross;
  }
  car.dir = next;
  car.angle = DIR_ANGLE[next];
}

// Is anything (car, player, ped) ahead of this traffic car within `ahead` px?
function blockedAhead(G, car, ahead) {
  const d = DIRS[car.dir];
  const px = car.x;
  const py = car.y;
  function check(x, y, radius) {
    const dx = x - px;
    const dy = y - py;
    const along = dx * d.x + dy * d.y;
    if (along < 0 || along > ahead) return 0;
    const perp = Math.abs(dx * d.y - dy * d.x);
    if (perp > 30 + radius) return 0;
    return along;
  }
  let nearest = Infinity;
  for (const other of G.cars) {
    if (other === car || other.disabled) continue;
    const a = check(other.x, other.y, 20);
    if (a > 0 && a < nearest) nearest = a;
  }
  const p = G.player;
  if (!p.inCar) {
    const a = check(p.x, p.y, 12);
    if (a > 0 && a < nearest) nearest = a;
  } else if (p.inCar !== car) {
    const a = check(p.inCar.x, p.inCar.y, 20);
    if (a > 0 && a < nearest) nearest = a;
  }
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    const a = check(ped.x, ped.y, 10);
    if (a > 0 && a < nearest) nearest = a;
  }
  return nearest;
}

export function updateTrafficCar(G, car, dt) {
  if (!car.isTraffic || car.disabled) return;
  const d = DIRS[car.dir];
  // The south highway (horizontal road y=1840) carries faster traffic.
  const onHighway = (car.dir === 1 || car.dir === 3) && car.road === ROAD.highwayY;
  const cruise = onHighway ? TRAFFIC.highwaySpeed : (car.cruise || TRAFFIC.cruiseSpeed);

  // Approach to the next intersection: slow a little if we are about to turn.
  // (No next intersection means we are off the grid — respawn on a road.)
  const inter = nextIntersection(car);
  if (!inter) {
    const spot = randomRoadSpot(G);
    car.x = spot.x; car.y = spot.y; car.dir = spot.dir; car.road = spot.road;
    car.angle = DIR_ANGLE[car.dir];
    car.speed = 0;
    return;
  }
  let target = cruise;
  if (inter) {
    const pos = d.y !== 0 ? car.y : car.x;
    const remain = Math.abs(inter.cross - pos);
    if (remain < 70) target = cruise * 0.55;
    if (remain <= Math.max(2, car.speed * dt + 1)) {
      // Snap onto the intersection and choose the next leg.
      if (d.y !== 0) car.y = inter.cross;
      else car.x = inter.cross;
      chooseTurn(G, car, inter);
    }
  }

  // Slow / stop for anything ahead.
  const near = blockedAhead(G, car, TRAFFIC.slowDist);
  if (near < TRAFFIC.stopDist) target = 0;
  else if (near < TRAFFIC.slowDist) target = Math.min(target, cruise * 0.3);

  // Accelerate toward the target speed.
  const accel = target > car.speed ? 200 : 420;
  if (car.speed < target) car.speed = Math.min(target, car.speed + accel * dt);
  else car.speed = Math.max(target, car.speed - accel * dt);

  car.x += d.x * car.speed * dt;
  car.y += d.y * car.speed * dt;
  car.angle = DIR_ANGLE[car.dir];
  // A shove from another car can push a traffic car off the road; keep it out of buildings.
  resolveCarBody(G.world, car);
  // If it was shoved off the road (into a plaza or block) and can't get back
  // on its own, put it back on a road after a short while instead of wandering.
  if (!onRoad(car.x, car.y)) {
    car.offRoadT = (car.offRoadT || 0) + dt;
    if (car.offRoadT > 3) {
      const spot = randomRoadSpot(G);
      car.x = spot.x; car.y = spot.y; car.dir = spot.dir; car.road = spot.road;
      car.angle = DIR_ANGLE[car.dir];
      car.speed = 0;
      car.offRoadT = 0;
    }
  } else {
    car.offRoadT = 0;
  }

  // Stuck for too long (boxed in): teleport to a fresh road spot away from the player.
  if (car.speed < 2) {
    car.stuckT = (car.stuckT || 0) + dt;
    if (car.stuckT > 9) {
      const spot = randomRoadSpot(G);
      car.x = spot.x; car.y = spot.y; car.dir = spot.dir; car.road = spot.road;
      car.angle = DIR_ANGLE[car.dir];
      car.speed = 0;
      car.stuckT = 0;
    }
  } else {
    car.stuckT = 0;
  }
}

// A random road spot, drawn from the game's seeded RNG so the same seed always
// lays out the same traffic.
export function randomRoadSpot(G) {
  const rng = rngFor(G);
  const vertical = rng.next() < 0.5;
  if (vertical) {
    const road = rng.pick(ROAD.vertical);
    const dir = rng.next() < 0.5 ? 0 : 2;
    const y = 240 + rng.next() * 1600;
    return { x: laneCoord(road, dir), y, dir, road };
  }
  const road = rng.pick(ROAD.horizontal);
  const dir = rng.next() < 0.5 ? 1 : 3;
  const x = 240 + rng.next() * 1600;
  return { x, y: laneCoord(road, dir), dir, road };
}

// --- Pedestrians ---------------------------------------------------------------

const PED_COLORS = ['#e07a5f', '#6d9dc5', '#e9c46a', '#a8c686', '#d9a0a0', '#9b5de5', '#f2d8a7', '#5aa469'];

export function makePed(G, x, y) {
  const rng = rngFor(G);
  return {
    x, y,
    axis: rng.next() < 0.5 ? 'v' : 'h',
    line: 0,
    dir: rng.next() < 0.5 ? 1 : -1,
    speed: PEDS.walkSpeed * (0.8 + rng.next() * 0.5),
    state: 'walk',
    fleeT: 0,
    downT: 0,
    hp: 40,
    color: rng.pick(PED_COLORS),
    phase: rng.next() * Math.PI * 2,
  };
}

export function spawnPed(G) {
  // On a random sidewalk next to a random road.
  const rng = rngFor(G);
  const vertical = rng.next() < 0.5;
  let x; let y;
  if (vertical) {
    const road = rng.pick(ROAD.vertical);
    x = road + (rng.next() < 0.5 ? -1 : 1) * (ROAD.width / 2 + ROAD.sidewalk / 2);
    y = 120 + rng.next() * 1760;
  } else {
    const road = rng.pick(ROAD.horizontal);
    y = road + (rng.next() < 0.5 ? -1 : 1) * (ROAD.width / 2 + ROAD.sidewalk / 2);
    x = 200 + rng.next() * 1700;
  }
  const ped = makePed(G, x, y);
  ped.axis = vertical ? 'v' : 'h';
  ped.line = vertical ? x : y;
  return ped;
}

function pedThreat(G, ped) {
  // Returns a threat {x, y} if something scary is close, else null.
  const p = G.player;
  if (p.inCar) {
    const car = p.inCar;
    const speed = Math.abs(car.speed);
    if (speed > 120 && dist(ped.x, ped.y, car.x, car.y) < 150) return { x: car.x, y: car.y };
  } else if (dist(ped.x, ped.y, p.x, p.y) < 70 && G.time - (G.lastShotT || -99) < 1.5) {
    return { x: p.x, y: p.y }; // the player just fired nearby
  }
  for (const b of G.bullets) {
    if (dist(ped.x, ped.y, b.x, b.y) < 90) return { x: b.x, y: b.y };
  }
  for (const car of G.cars) {
    if (car.isTraffic && !car.disabled && Math.abs(car.speed) > 100 && dist(ped.x, ped.y, car.x, car.y) < 90) {
      return { x: car.x, y: car.y };
    }
  }
  return null;
}

export function updatePed(G, ped, dt) {
  const rng = rngFor(G);
  if (ped.state === 'down') {
    ped.downT -= dt;
    if (ped.downT <= 0) {
      // A fresh pedestrian takes their place elsewhere.
      const fresh = spawnPed(G);
      Object.assign(ped, fresh, { state: 'walk', hp: 40 });
    }
    return;
  }
  const threat = pedThreat(G, ped);
  if (threat) {
    // Remember the away-direction: the threat may be gone next frame, but the
    // ped keeps running the way it was running.
    ped.fleeAngle = Math.atan2(ped.y - threat.y, ped.x - threat.x);
    if (ped.state !== 'flee') {
      ped.state = 'flee';
      ped.fleeT = 2.5;
    }
  }
  if (ped.state === 'flee') {
    ped.fleeT -= dt;
    const a = ped.fleeAngle ?? 0;
    ped.x += Math.cos(a) * PEDS.fleeSpeed * dt;
    ped.y += Math.sin(a) * PEDS.fleeSpeed * dt;
    resolveCircle(G.world, ped, 10);
    if (ped.fleeT <= 0) ped.state = 'walk';
    return;
  }
  // Walk along the sidewalk; turn at intersections sometimes.
  const speed = ped.speed;
  if (ped.axis === 'v') {
    ped.y += ped.dir * speed * dt;
    ped.x = ped.line;
    for (const h of ROAD.horizontal) {
      if (Math.abs(ped.y - h) < 4 && rng.next() < 0.25) {
        ped.axis = 'h';
        ped.line = h + (rng.next() < 0.5 ? -1 : 1) * (ROAD.width / 2 + ROAD.sidewalk / 2);
        ped.y = ped.line;
        ped.dir = rng.next() < 0.5 ? 1 : -1;
        break;
      }
    }
    if (ped.y < 120) ped.dir = 1;
    if (ped.y > 1900) ped.dir = -1;
  } else {
    ped.x += ped.dir * speed * dt;
    ped.y = ped.line;
    for (const v of ROAD.vertical) {
      if (Math.abs(ped.x - v) < 4 && rng.next() < 0.25) {
        ped.axis = 'v';
        ped.line = v + (rng.next() < 0.5 ? -1 : 1) * (ROAD.width / 2 + ROAD.sidewalk / 2);
        ped.x = ped.line;
        ped.dir = rng.next() < 0.5 ? 1 : -1;
        break;
      }
    }
    if (ped.x < 200) ped.dir = 1;
    if (ped.x > 1900) ped.dir = -1;
  }
  ped.phase += dt * 8;
}

// A car hitting a pedestrian knocks them down and (for the player) raises the heat.
export function hitPed(G, ped, damage, byPlayer) {
  if (ped.state === 'down') return;
  const rng = rngFor(G);
  ped.hp -= damage;
  if (ped.hp <= 0) {
    ped.state = 'down';
    ped.downT = 3;
    if (byPlayer) {
      G.addWanted(1, 'ped-hit');
      G.flashMessage('Pedestrian down — witnesses called it in!');
    }
    for (let i = 0; i < 8; i += 1) {
      G.parts.push({
        kind: 'spark', x: ped.x, y: ped.y,
        vx: (rng.next() - 0.5) * 200, vy: (rng.next() - 0.5) * 200,
        life: 0.3, maxLife: 0.3, color: '#ff5a4e', size: 3,
      });
    }
  } else {
    ped.state = 'flee';
    ped.fleeT = 2;
  }
}
