// The player on foot: WASD movement with building collision, health with slow regen,
// and a pistol aimed with the mouse (click or F to shoot).
import { PLAYER } from './config.js';
import { clamp } from './random.js';
import { resolveCircle } from './world.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2, // facing up
    vx: 0, vy: 0,
    health: PLAYER.health,
    maxHealth: PLAYER.health,
    inCar: null,         // the car object when driving, else null
    fireCooldown: 0,
    lastDamageT: -99,
    aimX: x, aimY: y - 40,
    walkPhase: 0,
    moving: false,
  };
}

export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  if (p.inCar) return;
  const axis = G.input.axis();
  const len = Math.hypot(axis.x, axis.y);
  const speed = G.input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  p.moving = len > 0;
  if (len > 0) {
    const nx = axis.x / len;
    const ny = axis.y / len;
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
    p.angle = Math.atan2(ny, nx);
    p.walkPhase += dt * 11;
  }
  // Mouse aim (world coords are filled in by main each frame).
  p.aimX = G.input.mouse.worldX;
  p.aimY = G.input.mouse.worldY;
  if (G.input.mouse.down || G.input.mouse.worldX !== p.x || G.input.mouse.worldY !== p.y) {
    const dx = p.aimX - p.x;
    const dy = p.aimY - p.y;
    if (dx * dx + dy * dy > 4) p.aimAngle = Math.atan2(dy, dx);
  }
  const hit = resolveCircle(G.world, p, PLAYER.radius);
  if (hit.hit) {
    // Bumped a wall on foot: no damage, just blocked.
  }
  if (p.fireCooldown > 0) p.fireCooldown -= dt;
  // Slow health regen out of combat.
  if (G.time - p.lastDamageT > PLAYER.regenDelay && p.health > 0 && p.health < p.maxHealth) {
    p.health = Math.min(p.maxHealth, p.health + PLAYER.regenRate * dt);
  }
}

// Fire the pistol toward the mouse. Returns true if a shot left the barrel.
export function tryShoot(G) {
  const p = G.player;
  if (p.inCar || p.fireCooldown > 0 || p.health <= 0) return false;
  p.fireCooldown = PLAYER.fireRate;
  G.lastShotT = G.time;
  const angle = p.aimAngle !== undefined ? p.aimAngle : p.angle;
  const sx = p.x + Math.cos(angle) * 18;
  const sy = p.y + Math.sin(angle) * 18;
  G.bullets.push({
    x: sx, y: sy,
    vx: Math.cos(angle) * PLAYER.bulletSpeed,
    vy: Math.sin(angle) * PLAYER.bulletSpeed,
    range: PLAYER.bulletRange,
    damage: PLAYER.bulletDamage,
    fromPlayer: true,
    fromPolice: false,
  });
  spawnMuzzle(G, sx, sy, angle);
  G.audio.shoot();
  return true;
}

export function damagePlayer(G, amount, source) {
  const p = G.player;
  if (p.health <= 0) return;
  p.health = Math.max(0, p.health - amount);
  p.lastDamageT = G.time;
  G.camera.shake = Math.min(10, G.camera.shake + 3);
  if (p.health <= 0) {
    G.events.push({ type: 'wasted', source });
  }
}

export function spawnMuzzle(G, x, y, angle) {
  for (let i = 0; i < 4; i += 1) {
    G.parts.push({
      kind: 'spark', x, y,
      vx: Math.cos(angle + (Math.random() - 0.5) * 1.2) * (120 + Math.random() * 140),
      vy: Math.sin(angle + (Math.random() - 0.5) * 1.2) * (120 + Math.random() * 140),
      life: 0.14 + Math.random() * 0.1, maxLife: 0.24,
      color: '#ffd94d', size: 2.5,
    });
  }
}

export function healPlayer(p, amount) {
  p.health = clamp(p.health + amount, 0, p.maxHealth);
}
