// The screenshot scenes behind ?shot=start|play|end. Each one sets the real game to a
// moment a short session actually looks like, then steps the simulation forward a few
// seconds (traffic moving, police chasing, the camera settled) so the frame is what
// real play looks like — and the same seed always gives the same frame.
import { CAR_TYPES, STEP, WORLD } from './config.js';
import { PLACES } from './world.js';
import { driveCar, makeCar } from './vehicles.js';
import { updatePed, updateTrafficCar } from './traffic.js';
import { updatePolice } from './police.js';
import { updateMissions } from './missions.js';
import { clamp, rngFor } from './random.js';

// Clamp the camera so the viewport never shows area outside the world. The visible
// half-width/height in world px depends on the window size and the zoom, so a fixed
// margin would show unrendered void on a wide screenshot. If the viewport is wider
// than the world, centre the camera instead.
function clampCamera(G) {
  const zoom = clamp(Math.min(window.innerWidth / 1100, window.innerHeight / 750), 0.55, 1.5);
  const halfW = window.innerWidth / zoom / 2;
  const halfH = window.innerHeight / zoom / 2;
  G.camera.x = halfW >= WORLD.size / 2 ? WORLD.size / 2 : clamp(G.camera.x, halfW, WORLD.size - halfW);
  G.camera.y = halfH >= WORLD.size / 2 ? WORLD.size / 2 : clamp(G.camera.y, halfH, WORLD.size - halfH);
}

// A small local simulation step (no input, no DOM) used to settle a staged scene.
function simStep(G, dt, driveThrottle) {
  G.time += dt;
  const p = G.player;
  if (p.inCar) {
    driveCar(G, p.inCar, driveThrottle, 0, dt);
    p.x = p.inCar.x;
    p.y = p.inCar.y;
    p.angle = p.inCar.angle;
  }
  for (const car of G.cars) updateTrafficCar(G, car, dt);
  for (const ped of G.peds) updatePed(G, ped, dt);
  updatePolice(G, dt);
  updateMissions(G, dt);
  for (let i = G.parts.length - 1; i >= 0; i -= 1) {
    const pt = G.parts[i];
    pt.life -= dt;
    if (pt.life <= 0) { G.parts.splice(i, 1); continue; }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
  }
  // Camera follows the player, clamped to the world so no void shows at the edges.
  const tx = p.x;
  const ty = p.y;
  const k = Math.min(1, 6 * dt);
  G.camera.x += (tx - G.camera.x) * k;
  G.camera.y += (ty - G.camera.y) * k;
  clampCamera(G);
}

function putPlayerInCar(G, type, x, y, angle, speed) {
  const rng = rngFor(G);
  const car = makeCar(type, x, y, angle, { color: rng.pick(CAR_TYPES[type].colors) });
  car.driver = 'player';
  car.speed = speed;
  car.vx = Math.cos(angle) * speed;
  car.vy = Math.sin(angle) * speed;
  G.cars.push(car);
  G.player.inCar = car;
  G.player.x = x;
  G.player.y = y;
  G.player.angle = angle;
  return car;
}

/**
 * Set `G` to the named scene and return { mode, endText } for the overlay.
 * start: title over a living city. play: mid-chase driving with a mission marker.
 * end: the BUSTED screen. Any other name is start.
 */
export function stageShot(G, name) {
  if (name === 'play') {
    G.mode = 'playing';
    G.player.money = 1250;
    G.player.health = 82;
    G.wanted = 2;
    G.lastCrimeT = G.time;
    // The player is mid-chase in a sports car on the east avenue.
    const playerCar = putPlayerInCar(G, 'sports', 1040, 640, 0, 300);
    // Two police cars on the player's tail.
    const cop1 = makeCar('police', 880, 640, 0, {});
    cop1.speed = 320;
    G.cars.push(cop1);
    const cop2 = makeCar('police', 1040, 820, -Math.PI / 2, {});
    cop2.speed = 300;
    G.cars.push(cop2);
    // Mission 2 in its delivery stage, so the marker and timer show.
    G.mission.index = 1;
    G.mission.stage = 'deliver';
    G.mission.timer = 58;
    G.mission.target = { x: PLACES.dropoff.x, y: PLACES.dropoff.y, label: PLACES.dropoff.label };
    // Drive the chase just long enough to settle (traffic moving, police closing
    // in) but not so long the car pins itself against the east edge of the world,
    // which would zero its speed. 100 steps keeps it mid-map and still moving.
    for (let i = 0; i < 100; i += 1) simStep(G, STEP, 1);
    // Guarantee the HUD reads a sensible speed: the staged car cruises at 300 px/s
    // (about 54 mph) no matter what the settle steps did to it.
    playerCar.speed = 300;
    playerCar.vx = Math.cos(playerCar.angle) * 300;
    playerCar.vy = Math.sin(playerCar.angle) * 300;
    return { mode: 'playing', endText: '' };
  }

  if (name === 'end') {
    G.mode = 'busted';
    G.player.money = 640;
    G.wanted = 4;
    // Busted mid-getaway: close enough to the safehouse to read as the escape,
    // far enough that the mission does NOT complete during staging (that would
    // pop the "Story complete" banner through the BUSTED overlay).
    G.player.x = PLACES.safehouse.x - 170;
    G.player.y = PLACES.safehouse.y + 140;
    const cop = makeCar('police', PLACES.safehouse.x - 90, PLACES.safehouse.y + 40, 0, {});
    G.cars.push(cop);
    G.mission.index = 4;
    G.mission.stage = 'escape';
    G.mission.target = { x: PLACES.safehouse.x, y: PLACES.safehouse.y, label: PLACES.safehouse.label };
    for (let i = 0; i < 90; i += 1) simStep(G, STEP, 0);
    return {
      mode: 'busted',
      endText: 'The Solmar PD caught you. You lost $96. Your car is impounded — the crew will get you a new one.',
    };
  }

  // start: the title over a living city.
  G.mode = 'title';
  for (let i = 0; i < 240; i += 1) {
    G.time += STEP;
    for (const car of G.cars) updateTrafficCar(G, car, STEP);
    for (const ped of G.peds) updatePed(G, ped, STEP);
  }
  G.camera.x = WORLD.size / 2;
  G.camera.y = WORLD.size / 2;
  return { mode: 'title', endText: '' };
}
