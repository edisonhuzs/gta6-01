// Cars: definitions, simple arcade driving physics (speed, heading, drift), entering
// and exiting, and car-vs-world / car-vs-car collision.
import { CAR_TYPES, PLAYER, WANTED } from './config.js';
import { angleDiff, clamp, dist } from './random.js';
import { onSand, resolveCircle } from './world.js';

let nextCarId = 1;

export function makeCar(type, x, y, angle, opts = {}) {
  const def = CAR_TYPES[type];
  const color = opts.color || def.colors[Math.floor(Math.random() * def.colors.length)];
  return {
    id: nextCarId,
    type,
    label: def.label,
    w: def.w, l: def.l,
    topSpeed: def.topSpeed * (opts.speedMul || 1),
    accel: def.accel,
    brake: def.brake,
    grip: def.grip,
    color,
    x, y,
    angle,
    speed: 0,           // signed forward speed (px/s)
    vx: 0, vy: 0,       // world velocity (for drift)
    hp: type === 'police' ? 120 : 100,
    maxHp: type === 'police' ? 120 : 100,
    isPolice: type === 'police',
    isTraffic: !!opts.traffic,
    isParked: !!opts.parked,
    driver: opts.driver || null, // 'player' when the player drives it
    disabled: false,
    smokeT: 0,
    crashT: -99, // last time this car took crash damage (cooldown so a scrape is one hit)
    // traffic AI fields
    dir: opts.dir ?? 0, // 0 up, 1 right, 2 down, 3 left (road heading)
    cruise: opts.cruise || 0,
    turnSlow: 0,
  };
}

export function resetCarIds() { nextCarId = 1; }

// --- Car body collision --------------------------------------------------------
// A car is two circles (front + rear) that match its footprint, instead of one big
// circle: one big circle scrapes buildings whenever the car runs near a road edge
// and gets the car stuck. Returns {hit, nx, ny} with the average push-out normal.
export function resolveCarBody(world, car) {
  const r = car.w / 2 + 2;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const off = car.l / 2 - r;
  let hit = false;
  let px = 0;
  let py = 0;
  let nx = 0;
  let ny = 0;
  for (const s of [-1, 1]) {
    const c = { x: car.x + fx * off * s, y: car.y + fy * off * s };
    const bx = c.x;
    const by = c.y;
    const res = resolveCircle(world, c, r);
    if (res.hit) {
      hit = true;
      px += c.x - bx;
      py += c.y - by;
      nx += res.nx;
      ny += res.ny;
    }
  }
  if (hit) {
    car.x += px / 2;
    car.y += py / 2;
    const nl = Math.hypot(nx, ny) || 1;
    return { hit: true, nx: nx / nl, ny: ny / nl };
  }
  return { hit: false, nx: 0, ny: 0 };
}

// --- Driving physics ----------------------------------------------------------
// Arcade model: the car has a heading and a forward speed; velocity lerps toward the
// heading direction (grip), so fast turns drift. W/S accelerate/brake, A/D steer.
export function driveCar(G, car, throttle, steer, dt) {
  const def = car;
  if (car.disabled) return;
  const sand = onSand(car.x);
  const top = def.topSpeed * (sand ? 0.55 : 1);
  if (throttle > 0) car.speed += def.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 20) car.speed += def.brake * throttle * dt; // brake
    else car.speed += def.accel * 0.6 * throttle * dt;           // reverse
  } else {
    // coast / drag
    car.speed -= car.speed * 0.9 * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  car.speed = clamp(car.speed, -top * 0.45, top);
  // Steering works even at low speed (a stopped car can still turn its wheels),
  // so a car wedged against a wall can turn away instead of being stuck forever.
  const steerAmount = steer * clamp(0.35 + Math.abs(car.speed) / 120, 0, 1) * 2.6 * (car.speed < 0 ? -1 : 1);
  car.angle += steerAmount * dt;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const wantVx = fx * car.speed;
  const wantVy = fy * car.speed;
  const k = clamp(def.grip * dt, 0, 1);
  car.vx += (wantVx - car.vx) * k;
  car.vy += (wantVy - car.vy) * k;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  const res = resolveCarBody(G.world, car);
  if (res.hit) {
    // Slide along the wall: drop the velocity component that pushes into it, so
    // the car glances off instead of getting stuck. The into-wall speed is the impact.
    const vn = car.vx * res.nx + car.vy * res.ny;
    const impact = Math.abs(vn);
    if (vn < 0) {
      car.vx -= res.nx * vn;
      car.vy -= res.ny * vn;
      // Keep the forward speed consistent with the slid velocity.
      car.speed = clamp(car.vx * fx + car.vy * fy, -top * 0.45, top);
    }
    if (impact > 140 && G.time - car.crashT > 0.5) {
      car.crashT = G.time;
      car.hp = Math.max(0, car.hp - impact * 0.02);
      G.audio.crash(impact / 400);
      G.camera.shake = Math.min(12, G.camera.shake + impact / 60);
      spawnCrashSparks(G, car.x, car.y);
      if (car.driver === 'player' && impact > 240) {
        // Hard crash hurts the driver a little.
        const p = G.player;
        p.health = Math.max(0, p.health - 4);
        p.lastDamageT = G.time;
      }
      if (car.hp <= 0) wreckCar(G, car);
    }
  }
  if (car.hp < car.maxHp * 0.45) {
    car.smokeT -= dt;
    if (car.smokeT <= 0) {
      car.smokeT = 0.09;
      G.parts.push({
        kind: 'smoke', x: car.x - Math.cos(car.angle) * car.l * 0.3, y: car.y - Math.sin(car.angle) * car.l * 0.3,
        vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 30,
        life: 0.7, maxLife: 0.7, color: '#666', size: 5,
      });
    }
  }
}

export function wreckCar(G, car) {
  car.disabled = true;
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  for (let i = 0; i < 10; i += 1) {
    G.parts.push({
      kind: 'spark', x: car.x, y: car.y,
      vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260,
      life: 0.4, maxLife: 0.4, color: '#ffcf3f', size: 3,
    });
  }
  if (car.driver === 'player') exitCar(G, car);
}

export function spawnCrashSparks(G, x, y) {
  for (let i = 0; i < 6; i += 1) {
    G.parts.push({
      kind: 'spark', x, y,
      vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300,
      life: 0.25, maxLife: 0.25, color: '#ffd94d', size: 2.5,
    });
  }
}

// --- Entering / exiting -------------------------------------------------------

export function nearestEnterableCar(G, maxDist = 56) {
  const p = G.player;
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    if (car.disabled || car.driver === 'player') continue;
    if (car.isPolice && car.isTraffic) continue; // police cars on duty can't be taken
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

// Put the player into a car. Stealing a parked or traffic car is a crime.
export function enterCar(G, car) {
  const p = G.player;
  const stolen = car.isParked || car.isTraffic;
  car.isParked = false;
  car.isTraffic = false;
  car.driver = 'player';
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  if (stolen) {
    G.addWanted(1, 'car-theft');
    G.flashMessage('Car taken — the heat is on!');
  }
  G.audio.click();
}

export function exitCar(G, car) {
  const p = G.player;
  p.inCar = null;
  car.driver = null;
  // Step out to the side of the car.
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * (car.w / 2 + PLAYER.radius + 4);
  p.y = car.y + Math.sin(side) * (car.w / 2 + PLAYER.radius + 4);
  const res = resolveCircle(G.world, p, PLAYER.radius);
  void res;
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
}

// --- Car vs car ---------------------------------------------------------------

export function separateCars(G) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.disabled && b.disabled) continue;
      const ra = Math.max(a.w, a.l) * 0.42;
      const rb = Math.max(b.w, b.l) * 0.42;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = ra + rb;
      if (d >= min || d < 0.01) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      // A hard shunt damages both and shakes the camera when the player is involved.
      // (Cooldown per car, so one shunt is one hit, not damage every frame.)
      // A police car ramming the player's car is trying to BUST them, not wreck the
      // car — so a police ram does no hull damage (the bust timer is the threat).
      const rel = Math.abs(a.speed - b.speed) + Math.abs(a.vx - b.vx) + Math.abs(a.vy - b.vy);
      if (rel > 120) {
        const policeRam = (a.isPolice && b.driver === 'player') || (b.isPolice && a.driver === 'player');
        const dmg = policeRam ? 0 : rel * 0.02;
        if (dmg > 0) {
          if (G.time - (a.crashT || -99) > 0.5) { a.hp = Math.max(0, a.hp - dmg); a.crashT = G.time; }
          if (G.time - (b.crashT || -99) > 0.5) { b.hp = Math.max(0, b.hp - dmg); b.crashT = G.time; }
        }
        if (a.driver === 'player' || b.driver === 'player') {
          G.audio.crash(rel / 500);
          G.camera.shake = Math.min(10, G.camera.shake + 2);
        }
        if (a.hp <= 0 && !a.disabled) wreckCar(G, a);
        if (b.hp <= 0 && !b.disabled) wreckCar(G, b);
      }
    }
  }
}

// Keep an angle steering toward a target angle with a max turn rate.
export function steerToward(car, targetAngle, rate, dt) {
  const d = angleDiff(car.angle, targetAngle);
  const turn = clamp(d, -rate * dt, rate * dt);
  car.angle += turn;
  return d;
}

export { WANTED };
