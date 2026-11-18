// Solmar Bay — boot and the one loop. The game moves between title, playing, paused,
// busted and wasted. Input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. The HUD is DOM, updated here.
//
// ?seed=N fixes the city. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.
import { CAMERA, CAR_TYPES, MONEY, PEDS, PLAYER, STEP, TRAFFIC, WORLD } from './config.js';
import { makeRng, clamp, dist } from './random.js';
import { buildWorld, PLACES, resolveCircle } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_SHOOT, createInput } from './input.js';
import { createAudio } from './audio.js';
import { clearSave, loadSave, writeSave } from './save.js';
import { createPlayer, damagePlayer, tryShoot, updatePlayerOnFoot } from './player.js';
import { driveCar, enterCar, exitCar, makeCar, nearestEnterableCar, separateCars } from './vehicles.js';
import { hitPed, makePed, randomRoadSpot, spawnPed, updatePed, updateTrafficCar } from './traffic.js';
import { addWanted, damagePoliceCar, policeCars, updatePolice } from './police.js';
import { MISSIONS, createMissionState, currentObjective, onEnterCar, startMission, updateMissions } from './missions.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const minimap = document.getElementById('minimap');
const status = document.getElementById('status');

const $ = (id) => document.getElementById(id);
const hud = {
  money: $('hud-money'), healthFill: $('hud-health-fill'), healthText: $('hud-health-text'),
  stars: $('hud-stars'), objective: $('hud-objective'), missions: $('hud-missions'),
  speed: $('hud-speed'), prompt: $('hud-prompt'), flash: $('hud-flash'), banner: $('hud-banner'),
  title: $('screen-title'), pause: $('screen-pause'), end: $('screen-end'),
  endTitle: $('end-title'), endText: $('end-text'), endButton: $('end-button'),
  titleSave: $('title-save'),
};

function createGame(saved) {
  const rng = makeRng(seed);
  const world = buildWorld(seed);
  const player = createPlayer(PLACES.spawn.x, PLACES.spawn.y);
  player.money = saved ? saved.money : MONEY.start;
  const G = {
    time: 0,
    mode: 'title',
    seed,
    rng,
    world,
    player,
    cars: [],
    peds: [],
    bullets: [],
    parts: [],
    wanted: 0,
    lastCrimeT: -999,
    lastWantedGainT: -999,
    decayT: 0,
    bustT: 0,
    spawnT: 0,
    mission: createMissionState(saved ? saved.missionIndex : 0),
    camera: { x: player.x, y: player.y, shake: 0 },
    input: null,
    audio: createAudio(),
    renderer: null,
    events: [],
    flashMsg: null,
    flashT: 0,
    earned: saved ? saved.earned : 0,
    lastCarHitT: -99,
    addWanted: (stars, reason) => addWanted(G, stars, reason),
  };
  G.flashMessage = (msg) => { G.flashMsg = msg; G.flashT = 3.5; };
  G.saveGame = () => writeSave({ money: G.player.money, missionIndex: G.mission.index, earned: G.earned });
  G.input = createInput(canvas);
  G.renderer = createRenderer(canvas, minimap);
  startMission(G);
  spawnWorldActors(G);
  return G;
}

function spawnWorldActors(G) {
  // Parked cars in plazas and the parking lot (off the roads, so traffic never jams).
  // Every random choice here comes from the game's seeded RNG (G.rng), so the same
  // seed always lays out the same cars, in the same lots, in the same colours.
  const rng = G.rng;
  const types = ['sedan', 'sedan', 'sedan', 'taxi', 'sports', 'truck'];
  let placed = 0;
  const plazas = [...G.world.plazas];
  for (let i = plazas.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [plazas[i], plazas[j]] = [plazas[j], plazas[i]];
  }
  for (const plaza of plazas) {
    if (placed >= TRAFFIC.parkedCount) break;
    const cols = plaza.big ? 4 : 2;
    const rows = plaza.big ? 3 : 1;
    for (let r = 0; r < rows && placed < TRAFFIC.parkedCount; r += 1) {
      for (let c = 0; c < cols && placed < TRAFFIC.parkedCount; c += 1) {
        const x = plaza.x0 + ((c + 0.5) / cols) * (plaza.x1 - plaza.x0);
        const y = plaza.y0 + ((r + 0.5) / rows) * (plaza.y1 - plaza.y0);
        const type = rng.pick(types);
        const angle = plaza.big ? 0 : (rng.next() < 0.5 ? 0 : Math.PI / 2);
        G.cars.push(makeCar(type, x, y, angle, { parked: true, color: rng.pick(CAR_TYPES[type].colors) }));
        placed += 1;
      }
    }
  }
  // Moving traffic on the roads.
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const spot = randomRoadSpot(G);
    const type = rng.next() < 0.12 ? 'taxi' : (rng.next() < 0.1 ? 'truck' : 'sedan');
    const car = makeCar(type, spot.x, spot.y, 0, { traffic: true, dir: spot.dir, cruise: TRAFFIC.cruiseSpeed, color: rng.pick(CAR_TYPES[type].colors) });
    car.road = spot.road;
    car.angle = [ -Math.PI / 2, 0, Math.PI / 2, Math.PI ][spot.dir];
    car.speed = car.cruise * (0.7 + rng.next() * 0.4);
    G.cars.push(car);
  }
  // Pedestrians on the sidewalks.
  for (let i = 0; i < PEDS.count; i += 1) {
    const ped = spawnPed(G);
    G.peds.push(ped);
  }
  void makePed;
}

// --- Money / respawn -----------------------------------------------------------

function loseMoney(G, frac, min) {
  const lost = Math.max(min, Math.floor(G.player.money * frac));
  G.player.money = Math.max(0, G.player.money - lost);
  return lost;
}

function respawn(G) {
  const p = G.player;
  if (p.inCar) exitCar(G, p.inCar);
  p.x = PLACES.safehouse.x;
  p.y = PLACES.safehouse.y + 60;
  p.health = PLAYER.health;
  p.inCar = null;
  G.wanted = 0;
  G.bustT = 0;
  G.bullets = [];
  for (const cop of [...policeCars(G)]) {
    const i = G.cars.indexOf(cop);
    if (i >= 0) G.cars.splice(i, 1);
  }
  G.camera.x = p.x;
  G.camera.y = p.y;
  G.saveGame();
  G.mode = 'playing';
  showScreen(G, 'playing');
}

// --- Screens (DOM overlays) -----------------------------------------------------

const SCREENS = { title: 'screen-title', playing: null, paused: 'screen-pause', busted: 'screen-end', wasted: 'screen-end' };

function showScreen(G, mode) {
  for (const [name, id] of Object.entries(SCREENS)) {
    if (!id) continue;
    const el = $(id);
    if (el) el.classList.toggle('hidden', name !== mode);
  }
  hud.title.classList.toggle('hidden', mode !== 'title');
  hud.pause.classList.toggle('hidden', mode !== 'paused');
  const end = mode === 'busted' || mode === 'wasted';
  hud.end.classList.toggle('hidden', !end);
  if (mode === 'busted') {
    hud.endTitle.textContent = 'BUSTED';
    hud.endTitle.className = 'end-title busted';
    hud.endButton.textContent = 'Respawn at the safehouse';
  } else if (mode === 'wasted') {
    hud.endTitle.textContent = 'WASTED';
    hud.endTitle.className = 'end-title wasted';
    hud.endButton.textContent = 'Respawn at the safehouse';
  }
}

function announce(message) {
  if (status) status.textContent = message;
}

// --- HUD ------------------------------------------------------------------------

let lastHud = { money: -1, health: -1, wanted: -1, objective: '', speed: -1, prompt: '', missions: '' };

function updateHud(G) {
  const p = G.player;
  const money = Math.floor(p.money);
  if (money !== lastHud.money) {
    hud.money.textContent = `$${money.toLocaleString('en-US')}`;
    lastHud.money = money;
  }
  const health = Math.ceil(p.health);
  if (health !== lastHud.health) {
    hud.healthFill.style.width = `${clamp(health, 0, 100)}%`;
    hud.healthText.textContent = `${health}`;
    hud.healthFill.classList.toggle('low', health < 30);
    lastHud.health = health;
  }
  if (G.wanted !== lastHud.wanted) {
    hud.stars.textContent = '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted);
    hud.stars.classList.toggle('hot', G.wanted > 0);
    lastHud.wanted = G.wanted;
  }
  const objective = currentObjective(G);
  if (objective !== lastHud.objective) {
    hud.objective.textContent = objective;
    lastHud.objective = objective;
  }
  const missionList = MISSIONS.map((m, i) => `${i < G.mission.index ? '✓' : i === G.mission.index ? '▶' : '·'} ${m.name}`).join('\n');
  if (missionList !== lastHud.missions) {
    hud.missions.textContent = missionList;
    lastHud.missions = missionList;
  }
  const speed = p.inCar ? Math.round(Math.abs(p.inCar.speed) * 0.18) : 0; // px/s -> rough mph
  if (speed !== lastHud.speed) {
    hud.speed.textContent = p.inCar ? `${speed} mph — ${p.inCar.label}` : '';
    lastHud.speed = speed;
  }
  let prompt = '';
  if (G.mode === 'playing') {
    if (p.inCar) prompt = 'E — exit car';
    else {
      const near = nearestEnterableCar(G);
      if (near) prompt = `E — enter ${near.label}`;
    }
  }
  if (prompt !== lastHud.prompt) {
    hud.prompt.textContent = prompt;
    lastHud.prompt = prompt;
  }
  if (G.flashMsg && G.flashT > 0) {
    hud.flash.textContent = G.flashMsg;
    hud.flash.classList.remove('hidden');
  } else {
    hud.flash.classList.add('hidden');
  }
  // The story banner only shows while playing — never through a BUSTED/WASTED
  // overlay, where it would ghost behind the end panel.
  if (G.mode === 'playing' && G.mission.bannerT > 0 && G.mission.banner) {
    hud.banner.textContent = G.mission.banner;
    hud.banner.classList.remove('hidden');
  } else {
    hud.banner.classList.add('hidden');
  }
}

// --- Bullets ---------------------------------------------------------------------

function updateBullets(G, dt) {
  const p = G.player;
  for (let i = G.bullets.length - 1; i >= 0; i -= 1) {
    const b = G.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.range -= Math.hypot(b.vx, b.vy) * dt;
    let dead = b.range <= 0;
    // Buildings and the sea stop bullets.
    if (!dead) {
      if (b.x < 70 || b.x > WORLD.size || b.y < 0 || b.y > WORLD.size) dead = true;
      else {
        for (const bd of G.world.buildings) {
          if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { dead = true; break; }
        }
      }
    }
    if (!dead && b.fromPlayer) {
      for (const ped of G.peds) {
        if (ped.state !== 'down' && dist(b.x, b.y, ped.x, ped.y) < 13) {
          hitPed(G, ped, b.damage, true);
          dead = true;
          break;
        }
      }
    }
    if (!dead && b.fromPlayer) {
      for (const car of G.cars) {
        if (car.driver === 'player' || car.disabled) continue;
        if (dist(b.x, b.y, car.x, car.y) < 26) {
          if (car.isPolice) damagePoliceCar(G, car, b.damage);
          else {
            car.hp -= b.damage;
            if (car.hp <= 0 && !car.disabled) {
              car.disabled = true;
              car.speed = 0;
            }
          }
          dead = true;
          break;
        }
      }
    }
    if (!dead && b.fromPolice && !p.inCar && p.health > 0) {
      if (dist(b.x, b.y, p.x, p.y) < 13) {
        damagePlayer(G, b.damage, 'shot');
        dead = true;
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }
}

// --- Car vs pedestrian / player contact -------------------------------------------

function updateCarContacts(G, dt) {
  void dt;
  const p = G.player;
  // The player's car ramming pedestrians.
  if (p.inCar) {
    const car = p.inCar;
    for (const ped of G.peds) {
      if (ped.state === 'down') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 28 && Math.abs(car.speed) > 60) {
        hitPed(G, ped, 60, true);
        car.speed *= 0.85;
        G.audio.crash(0.3);
        G.camera.shake = Math.min(10, G.camera.shake + 3);
      }
    }
  }
  // Traffic cars knocking pedestrians down (no wanted — an accident, not the player).
  for (const car of G.cars) {
    if (!car.isTraffic || car.disabled || Math.abs(car.speed) < 40) continue;
    for (const ped of G.peds) {
      if (ped.state === 'down') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 26) hitPed(G, ped, 60, false);
    }
  }
  // A car hitting the player on foot hurts.
  if (!p.inCar && p.health > 0 && G.time - G.lastCarHitT > 0.8) {
    for (const car of G.cars) {
      if (car.disabled) continue;
      if (dist(car.x, car.y, p.x, p.y) < 26) {
        damagePlayer(G, 10, 'run-over');
        G.lastCarHitT = G.time;
        const a = Math.atan2(p.y - car.y, p.x - car.x);
        p.x += Math.cos(a) * 20;
        p.y += Math.sin(a) * 20;
        resolveCircle(G.world, p, PLAYER.radius);
        break;
      }
    }
  }
}

// --- Particles ---------------------------------------------------------------------

function updateParticles(G, dt) {
  for (let i = G.parts.length - 1; i >= 0; i -= 1) {
    const pt = G.parts[i];
    pt.life -= dt;
    if (pt.life <= 0) { G.parts.splice(i, 1); continue; }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.kind === 'smoke') { pt.vy -= 12 * dt; pt.size += 6 * dt; }
  }
  // Dust kicked up by a fast car.
  const p = G.player;
  if (p.inCar && Math.abs(p.inCar.speed) > 260 && Math.random() < 0.5) {
    const car = p.inCar;
    G.parts.push({
      kind: 'dust',
      x: car.x - Math.cos(car.angle) * car.l * 0.5 + (Math.random() - 0.5) * 14,
      y: car.y - Math.sin(car.angle) * car.l * 0.5 + (Math.random() - 0.5) * 14,
      vx: (Math.random() - 0.5) * 24, vy: (Math.random() - 0.5) * 24,
      life: 0.5, maxLife: 0.5, color: '#cbb98f', size: 4,
    });
  }
}

// --- One fixed step -----------------------------------------------------------------

function step(G, dt, actions) {
  G.time += dt;
  const p = G.player;
  const input = G.input;

  // Mouse position in world coords (for aiming).
  const w = G.renderer.toWorld(G, input.mouse.x, input.mouse.y);
  input.mouse.worldX = w.x;
  input.mouse.worldY = w.y;

  if (actions & ACTION_MUTE) {
    G.audio.setMuted(!G.audio.isMuted());
    G.flashMessage(G.audio.isMuted() ? 'Sound off (M to turn back on)' : 'Sound on');
  }

  // Enter / exit a car.
  if (actions & ACTION_ENTER) {
    if (p.inCar) {
      exitCar(G, p.inCar);
    } else {
      const car = nearestEnterableCar(G);
      if (car) {
        enterCar(G, car);
        onEnterCar(G);
      }
    }
  }

  // Driving or walking.
  if (p.inCar) {
    const car = p.inCar;
    const axis = input.axis();
    const throttle = -axis.y; // W = forward
    const steer = axis.x;     // A/D
    driveCar(G, car, throttle, steer, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (car.disabled) exitCar(G, car);
  } else {
    updatePlayerOnFoot(G, dt);
    if (input.mouse.down || (actions & ACTION_SHOOT)) tryShoot(G);
  }

  // Traffic, pedestrians, police, bullets, contacts, particles.
  for (const car of G.cars) updateTrafficCar(G, car, dt);
  for (const ped of G.peds) updatePed(G, ped, dt);
  updatePolice(G, dt);
  updateBullets(G, dt);
  updateCarContacts(G, dt);
  separateCars(G);
  updateParticles(G, dt);
  updateMissions(G, dt);

  // Audio: engine hum follows the player's car; siren when chased.
  const driving = p.inCar && !p.inCar.disabled;
  G.audio.engine(driving ? Math.abs(p.inCar.speed) / p.inCar.topSpeed : 0, driving);
  G.audio.siren(policeCars(G).length > 0, dt);

  // Flash message timer.
  if (G.flashT > 0) G.flashT -= dt;

  // Camera: follow the player with a look-ahead while driving, then clamp to the world.
  const look = p.inCar ? CAMERA.lookAhead * Math.abs(p.inCar.speed) : 0;
  const tx = p.x + Math.cos(p.angle) * look;
  const ty = p.y + Math.sin(p.angle) * look;
  const k = Math.min(1, CAMERA.smooth * dt);
  G.camera.x += (tx - G.camera.x) * k;
  G.camera.y += (ty - G.camera.y) * k;
  // Clamp so the viewport never shows area outside the world: the visible
  // half-size in world px depends on the window and the zoom. If the viewport is
  // wider than the world, centre the camera instead of clamping to a reversed range.
  const zoom = clamp(Math.min(window.innerWidth / 1100, window.innerHeight / 750), 0.55, 1.5);
  const halfW = window.innerWidth / zoom / 2;
  const halfH = window.innerHeight / zoom / 2;
  G.camera.x = halfW >= WORLD.size / 2 ? WORLD.size / 2 : clamp(G.camera.x, halfW, WORLD.size - halfW);
  G.camera.y = halfH >= WORLD.size / 2 ? WORLD.size / 2 : clamp(G.camera.y, halfH, WORLD.size - halfH);
  G.camera.shake = Math.max(0, G.camera.shake - CAMERA.shakeDecay * dt * 4);

  // Events: busted / wasted.
  for (const ev of G.events) {
    if (ev.type === 'busted') {
      const lost = loseMoney(G, MONEY.bustedLoss, MONEY.bustedMin);
      hud.endText.textContent = `The Solmar PD caught you. You lost $${lost}. Your car is impounded — the crew will get you a new one.`;
      G.audio.busted();
      G.mode = 'busted';
      showScreen(G, 'busted');
      G.saveGame();
      announce('Busted.');
    } else if (ev.type === 'wasted') {
      const lost = loseMoney(G, MONEY.wastedLoss, MONEY.wastedMin);
      hud.endText.textContent = `You got wasted on the streets of Solmar Bay. You lost $${lost}. Mara's crew dragged you to the safehouse.`;
      G.audio.busted();
      G.mode = 'wasted';
      showScreen(G, 'wasted');
      G.saveGame();
      announce('Wasted.');
    }
  }
  G.events = [];
}

// --- Boot -----------------------------------------------------------------------------

function startNewGame(G, fresh) {
  if (fresh) {
    clearSave();
    G.player.money = MONEY.start;
    G.earned = 0;
    G.mission = createMissionState(0);
    startMission(G);
  }
  G.audio.unlock();
  G.audio.click();
  respawnFresh(G);
  G.mode = 'playing';
  showScreen(G, 'playing');
  announce('Playing. Mara has work for you — check the objective.');
}

function respawnFresh(G) {
  const p = G.player;
  if (p.inCar) exitCar(G, p.inCar);
  p.x = PLACES.spawn.x;
  p.y = PLACES.spawn.y;
  p.health = PLAYER.health;
  p.inCar = null;
  G.wanted = 0;
  G.bustT = 0;
  G.bullets = [];
  for (const cop of [...policeCars(G)]) {
    const i = G.cars.indexOf(cop);
    if (i >= 0) G.cars.splice(i, 1);
  }
  G.camera.x = p.x;
  G.camera.y = p.y;
}

function runGame() {
  const saved = loadSave();
  const G = createGame(saved);
  // Title screen: show the save state.
  if (saved && (saved.money > MONEY.start || saved.missionIndex > 0)) {
    hud.titleSave.textContent = `Save found: $${saved.money.toLocaleString('en-US')}, ${saved.missionIndex >= MISSIONS.length ? 'story complete' : `mission ${saved.missionIndex + 1} of ${MISSIONS.length}`}.`;
  } else {
    hud.titleSave.textContent = 'No save yet — a fresh start in Solmar Bay.';
  }

  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Actions are taken once per frame and handed to the first step, so a press
    // between frames is never lost and never counted twice.
    const actions = G.input.takeActions();
    if (G.mode === 'title') {
      if (actions & ACTION_CONFIRM) startNewGame(G, false);
      // The city lives behind the title: traffic and pedestrians keep moving.
      while (accumulator >= STEP) {
        G.time += STEP;
        for (const car of G.cars) updateTrafficCar(G, car, STEP);
        for (const ped of G.peds) updatePed(G, ped, STEP);
        accumulator -= STEP;
      }
      G.camera.x = WORLD.size / 2 + Math.sin(G.time * 0.05) * 160;
      G.camera.y = WORLD.size / 2 + Math.cos(G.time * 0.04) * 120;
    } else if (G.mode === 'paused') {
      accumulator = 0;
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        G.mode = 'playing';
        showScreen(G, 'playing');
        announce('Playing.');
      }
    } else if (G.mode === 'playing') {
      if (actions & ACTION_PAUSE) {
        G.mode = 'paused';
        showScreen(G, 'paused');
        announce('Paused.');
        accumulator = 0;
      } else {
        let first = true;
        while (accumulator >= STEP) {
          step(G, STEP, first ? actions : 0);
          first = false;
          accumulator -= STEP;
          if (G.mode !== 'playing') { accumulator = 0; break; }
        }
      }
    } else {
      accumulator = 0;
    }
    G.renderer.draw(G);
    updateHud(G);
  }

  // Buttons.
  $('btn-play').addEventListener('click', () => startNewGame(G, false));
  $('btn-new').addEventListener('click', () => startNewGame(G, true));
  $('btn-resume').addEventListener('click', () => {
    G.mode = 'playing';
    showScreen(G, 'playing');
    G.audio.click();
  });
  $('btn-restart').addEventListener('click', () => {
    G.audio.click();
    startNewGame(G, true);
  });
  $('btn-quit').addEventListener('click', () => {
    G.mode = 'title';
    showScreen(G, 'title');
    G.audio.click();
  });
  hud.endButton.addEventListener('click', () => {
    G.audio.click();
    respawn(G);
  });

  // Leaving the tab pauses a running game.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.mode === 'playing') {
      G.mode = 'paused';
      showScreen(G, 'paused');
      announce('Paused.');
    }
  });

  showScreen(G, 'title');
  announce('Solmar Bay. Press Enter or click Play to start.');
  requestAnimationFrame(frame);
}

// --- Screenshot staging -------------------------------------------------------------------

function runShot(name) {
  const saved = null;
  const G = createGame(saved);
  // A screenshot must not write over the player's real save.
  G.saveGame = () => {};
  const scene = stageShot(G, name);
  if (scene.endText) hud.endText.textContent = scene.endText;
  showScreen(G, scene.mode);
  let painted = 0;
  function paint() {
    G.renderer.draw(G);
    updateHud(G);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) runShot(shot);
else runGame();
