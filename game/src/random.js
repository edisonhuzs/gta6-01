// Seeded random helpers (mulberry32) so the city is identical for a given seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

// The game's seeded RNG lives on G.rng. Callers that build a game object without
// one (for example the headless smoke test) get a Math.random-backed stand-in
// with the same interface, so the same code runs seeded in the game and
// unseeded in a test harness.
const FALLBACK_RNG = {
  next: Math.random,
  range: (lo, hi) => lo + Math.random() * (hi - lo),
  int: (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p) => Math.random() < p,
};

export function rngFor(G) {
  return (G && G.rng) || FALLBACK_RNG;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
// Shortest signed angle difference, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
