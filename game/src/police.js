// Wanted level, police spawning and pursuit, the BUSTED timer, and police gunfire.
// Police cars live in G.cars with isPolice; this module owns the wanted rules.
// Police randomness (spawn spots, unstick direction, shot timing) comes from the
// game's seeded RNG (G.rng, via rngFor), so a seeded run stays reproducible.
import { ROAD, WANTED } from './config.js';
import { angleTo, clamp, dist, rngFor } from './random.js';
import { driveCar, makeCar, steerToward } from './vehicles.js';
import { randomRoadSpot } from './traffic.js';

// Raise the wanted level (with a short cooldown so one incident can't stack stars).
export function addWanted(G, stars, reason) {
  if (G.time - G.lastWantedGainT < WANTED.crimeCooldown) return;
  G.lastWantedGainT = G.time;
  G.lastCrimeT = G.time;
  const before = G.wanted;
  G.wanted = clamp(G.wanted + stars, 0, WANTED.max);
  if (G.wanted > before) {
    G.flashMessage(`Wanted level ${G.wanted} — the Solmar PD is on you!`);
  }
}

export function policeCars(G) {
  return G.cars.filter((c) => c.isPolice && !c.disabled);
}

function spawnPoliceCar(G) {
  // Appear on a road 500-800 px from the player, so the chase is visible, not instant.
  for (let tries = 0; tries < 12; tries += 1) {
    const spot = randomRoadSpot(G);
    const d = dist(spot.x, spot.y, G.player.x, G.player.y);
    if (d > 480 && d < 850) {
      const car = makeCar('police', spot.x, spot.y, 0, { traffic: false });
      car.dir = spot.dir;
      car.road = spot.road;
      G.cars.push(car);
      return car;
    }
  }
  const spot = randomRoadSpot(G);
  const car = makeCar('police', spot.x, spot.y, 0, { traffic: false });
  G.cars.push(car);
  return car;
}

function removePoliceCar(G, car) {
  const i = G.cars.indexOf(car);
  if (i >= 0) G.cars.splice(i, 1);
}

export function updatePolice(G, dt) {
  const rng = rngFor(G);
  // Wanted decays when the player stays clean.
  if (G.wanted > 0 && G.time - G.lastCrimeT > WANTED.decayQuiet) {
    G.decayT += dt;
    if (G.decayT >= WANTED.decayStep) {
      G.decayT = 0;
      G.wanted = Math.max(0, G.wanted - 1);
      if (G.wanted === 0) G.flashMessage('You lost the heat — clean for now.');
    }
  } else {
    G.decayT = 0;
  }

  // Keep the right number of police cars on the road.
  const want = WANTED.policePerStar[G.wanted];
  const cops = policeCars(G);
  if (cops.length < want) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      spawnPoliceCar(G);
      G.spawnT = 1.2;
    }
  } else {
    G.spawnT = 0.4;
  }
  // With no heat, distant police cars drive off (despawn).
  if (G.wanted === 0) {
    for (const cop of [...cops]) {
      if (dist(cop.x, cop.y, G.player.x, G.player.y) > 520) removePoliceCar(G, cop);
    }
  }

  // Pursuit: steer toward the player and floor it. Ramming contact builds the bust timer.
  const p = G.player;
  const target = p.inCar ? p.inCar : p;
  let touching = false;
  for (const cop of policeCars(G)) {
    const wantAngle = angleTo(cop.x, cop.y, target.x, target.y);
    const d = dist(cop.x, cop.y, target.x, target.y);
    let throttle;
    let steer;
    // Unstick: a cop wedged against a building (barely moving while chasing)
    // reverses out briefly, then resumes the chase.
    if ((cop.unstuckT || 0) > 0) {
      cop.unstuckT -= dt;
      throttle = -1;
      steer = cop.unstuckDir || 1;
    } else {
      if (Math.abs(cop.speed) < 25) cop.stuckT = (cop.stuckT || 0) + dt;
      else cop.stuckT = 0;
      if (cop.stuckT > 1.5) {
        cop.unstuckT = 0.9;
        cop.unstuckDir = rng.next() < 0.5 ? 1 : -1;
        cop.stuckT = 0;
        throttle = -1;
        steer = cop.unstuckDir;
      } else {
        steerToward(cop, wantAngle, 3.2, dt);
        // Throttle: full ahead, unless nearly on top of the player (then ease off to stay in contact).
        throttle = d > 60 ? 1 : 0.25;
        steer = clamp(((wantAngle - cop.angle + Math.PI * 3) % (Math.PI * 2) - Math.PI) * 1.6, -1, 1);
      }
    }
    driveCar(G, cop, throttle, steer, dt);
    if (d < 40) touching = true;

    // At wanted 2+, police shoot at an on-foot player in range.
    if (G.wanted >= 2 && !p.inCar && p.health > 0 && d < 340) {
      cop.shootT = (cop.shootT || 0) - dt;
      if (cop.shootT <= 0) {
        cop.shootT = 1.1 + rng.next() * 0.5;
        const aim = angleTo(cop.x, cop.y, p.x, p.y) + (rng.next() - 0.5) * 0.35;
        G.bullets.push({
          x: cop.x, y: cop.y,
          vx: Math.cos(aim) * 620, vy: Math.sin(aim) * 620,
          range: 380, damage: 7, fromPlayer: false, fromPolice: true,
        });
        G.audio.enemyShoot();
      }
    }
  }

  if (touching) {
    G.bustT += dt;
    if (G.bustT >= WANTED.bustTime) {
      G.events.push({ type: 'busted' });
      G.bustT = 0;
    }
  } else {
    G.bustT = Math.max(0, G.bustT - dt * 2);
  }
}

// Shooting a police car: it can be disabled, which counts as attacking the police.
export function damagePoliceCar(G, car, damage) {
  if (!car.isPolice || car.disabled) return;
  car.hp -= damage;
  if (car.hp <= 0) {
    car.disabled = true;
    car.speed = 0;
    addWanted(G, 2, 'cop-down');
    G.flashMessage('Police car disabled — that will bring more heat!');
  }
}
