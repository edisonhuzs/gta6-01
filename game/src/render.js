// Drawing only: the city, cars, people, bullets and particles on the main canvas,
// plus the minimap on its own small canvas. The HUD and the title/pause/end screens
// are DOM (see index.html); this module only paints pixels.
import { PALETTE, ROAD, WORLD } from './config.js';
import { clamp } from './random.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function createRenderer(canvas, minimap) {
  const ctx = canvas.getContext('2d');
  const mm = minimap.getContext('2d');
  const view = { scale: 1, dpr: 1, w: 0, h: 0, zoom: 1 };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    view.dpr = dpr;
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    canvas.style.width = `${view.w}px`;
    canvas.style.height = `${view.h}px`;
    // Zoom so roughly 1100x750 world px are visible.
    view.zoom = clamp(Math.min(view.w / 1100, view.h / 750), 0.55, 1.5);
    // Minimap is a fixed 200x200 CSS box.
    minimap.width = 200 * dpr;
    minimap.height = 200 * dpr;
  }

  // Screen (CSS px) -> world coords, using the current camera.
  function toWorld(G, sx, sy) {
    const cam = G.camera;
    return {
      x: (sx - view.w / 2) / view.zoom + cam.x,
      y: (sy - view.h / 2) / view.zoom + cam.y,
    };
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // --- City -------------------------------------------------------------------

  function drawGround(G) {
    const s = WORLD.size;
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, s, s);
    // Subtle mowing stripes for a lived-in look.
    ctx.fillStyle = PALETTE.grassDark;
    for (let y = 0; y < s; y += 160) ctx.fillRect(0, y, s, 80);
    // Beach: sand, then the sea.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(WORLD.waterX, 0, WORLD.beachX - WORLD.waterX, s);
    ctx.fillStyle = PALETTE.sandDark;
    for (let y = 0; y < s; y += 90) ctx.fillRect(WORLD.waterX + 8, y + 20, 26, 4);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, 0, WORLD.waterX, s);
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(0, 0, 26, s);
    // Animated wave lines.
    ctx.strokeStyle = PALETTE.wave;
    ctx.lineWidth = 3;
    const t = G.time;
    for (let y = 0; y < s; y += 70) {
      const wob = Math.sin(y * 0.02 + t * 1.6) * 6;
      ctx.beginPath();
      ctx.moveTo(8, y + 30 + wob);
      ctx.quadraticCurveTo(30, y + 24 + wob, 52, y + 30 + wob);
      ctx.stroke();
    }
  }

  function drawPark(G) {
    const p = G.world.park;
    ctx.fillStyle = PALETTE.parkGrass;
    ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
    // Paths.
    ctx.strokeStyle = PALETTE.sand;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(p.x0, (p.y0 + p.y1) / 2);
    ctx.lineTo(p.x1, (p.y0 + p.y1) / 2);
    ctx.moveTo((p.x0 + p.x1) / 2, p.y0);
    ctx.lineTo((p.x0 + p.x1) / 2, p.y1);
    ctx.stroke();
    // Pond.
    ctx.fillStyle = PALETTE.water;
    ctx.beginPath();
    ctx.arc(G.world.pond.x, G.world.pond.y, G.world.pond.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.beginPath();
    ctx.arc(G.world.pond.x, G.world.pond.y, G.world.pond.r - 10, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRoads() {
    const half = ROAD.width / 2;
    // Road beds.
    for (const v of ROAD.vertical) {
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(v - half, 0, ROAD.width, WORLD.size);
    }
    for (const h of ROAD.horizontal) {
      const w = h === ROAD.highwayY ? ROAD.highwayWidth : ROAD.width;
      ctx.fillStyle = h === ROAD.highwayY ? PALETTE.highway : PALETTE.road;
      ctx.fillRect(0, h - w / 2, WORLD.size, w);
    }
    // Edge lines.
    ctx.strokeStyle = PALETTE.roadEdge;
    ctx.lineWidth = 3;
    for (const v of ROAD.vertical) {
      ctx.beginPath(); ctx.moveTo(v - half, 0); ctx.lineTo(v - half, WORLD.size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(v + half, 0); ctx.lineTo(v + half, WORLD.size); ctx.stroke();
    }
    for (const h of ROAD.horizontal) {
      const w = (h === ROAD.highwayY ? ROAD.highwayWidth : ROAD.width) / 2;
      ctx.beginPath(); ctx.moveTo(0, h - w); ctx.lineTo(WORLD.size, h - w); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h + w); ctx.lineTo(WORLD.size, h + w); ctx.stroke();
    }
    // Centre dashed yellow lines + lane dashes.
    ctx.strokeStyle = PALETTE.laneYellow;
    ctx.lineWidth = 4;
    ctx.setLineDash([26, 22]);
    for (const v of ROAD.vertical) {
      ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, WORLD.size); ctx.stroke();
    }
    for (const h of ROAD.horizontal) {
      ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(WORLD.size, h); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = PALETTE.laneWhite;
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 26]);
    for (const v of ROAD.vertical) {
      ctx.beginPath(); ctx.moveTo(v - ROAD.laneOffset, 0); ctx.lineTo(v - ROAD.laneOffset, WORLD.size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(v + ROAD.laneOffset, 0); ctx.lineTo(v + ROAD.laneOffset, WORLD.size); ctx.stroke();
    }
    for (const h of ROAD.horizontal) {
      ctx.beginPath(); ctx.moveTo(0, h - ROAD.laneOffset); ctx.lineTo(WORLD.size, h - ROAD.laneOffset); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h + ROAD.laneOffset); ctx.lineTo(WORLD.size, h + ROAD.laneOffset); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawSidewalks() {
    // Sidewalk slabs are the block faces themselves: each block is filled with the
    // sidewalk colour first, then buildings sit on top of it.
    ctx.fillStyle = PALETTE.sidewalk;
    for (let c = 0; c < ROAD.vertical.length - 1; c += 1) {
      for (let r = 0; r < ROAD.horizontal.length - 1; r += 1) {
        const x0 = ROAD.vertical[c] + ROAD.width / 2;
        const y0 = ROAD.horizontal[r] + ROAD.width / 2;
        const x1 = ROAD.vertical[c + 1] - ROAD.width / 2;
        const y1 = ROAD.horizontal[r + 1] - ROAD.width / 2;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    // Slab seams.
    ctx.strokeStyle = PALETTE.sidewalkLine;
    ctx.lineWidth = 1;
    for (let c = 0; c < ROAD.vertical.length - 1; c += 1) {
      for (let r = 0; r < ROAD.horizontal.length - 1; r += 1) {
        const x0 = ROAD.vertical[c] + ROAD.width / 2;
        const y0 = ROAD.horizontal[r] + ROAD.width / 2;
        const x1 = ROAD.vertical[c + 1] - ROAD.width / 2;
        const y1 = ROAD.horizontal[r + 1] - ROAD.width / 2;
        for (let x = x0 + 40; x < x1; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
        }
        for (let y = y0 + 40; y < y1; y += 40) {
          ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        }
      }
    }
  }

  function drawBuildings(G) {
    for (const b of G.world.buildings) {
      // Drop shadow (taller buildings cast further).
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + 4 + b.height * 2, b.y + 5 + b.height * 2, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = PALETTE.buildingEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      // Rooftop inset (taller = darker inset).
      ctx.fillStyle = `rgba(0,0,0,${0.05 + b.height * 0.05})`;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      if (b.detail === 'ac') {
        ctx.fillStyle = '#5a5148';
        ctx.fillRect(b.x + b.w / 2 - 9, b.y + b.h / 2 - 9, 18, 18);
      } else if (b.detail === 'vent') {
        ctx.fillStyle = '#7a6a58';
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 8, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.detail === 'skylight') {
        ctx.fillStyle = 'rgba(140, 200, 230, 0.85)';
        ctx.fillRect(b.x + b.w / 2 - 12, b.y + b.h / 2 - 7, 24, 14);
      }
      if (b.bank) {
        ctx.fillStyle = '#5a4310';
        ctx.font = `bold 15px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BANK', b.x + b.w / 2, b.y + b.h / 2);
      }
    }
  }

  function drawTrees(G) {
    for (const t of G.world.trees) {
      ctx.fillStyle = PALETTE.treeDark;
      ctx.beginPath(); ctx.arc(t.x + 2, t.y + 3, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    for (const p of G.world.palms) {
      ctx.strokeStyle = PALETTE.trunk;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(p.x, p.y + 8); ctx.lineTo(p.x, p.y - 6); ctx.stroke();
      ctx.fillStyle = PALETTE.palm;
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.ellipse(p.x + Math.cos(a) * 9, p.y - 6 + Math.sin(a) * 9, 10, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- Entities -----------------------------------------------------------------

  function drawCar(G, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(-car.l / 2 + 3, -car.w / 2 + 4, car.l, car.w, 8);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#1c1c1c';
    const wy = car.w / 2 - 2;
    const wx = car.l / 2 - 12;
    ctx.fillRect(-wx - 7, -wy - 3, 14, 6);
    ctx.fillRect(wx - 7, -wy - 3, 14, 6);
    ctx.fillRect(-wx - 7, wy - 3, 14, 6);
    ctx.fillRect(wx - 7, wy - 3, 14, 6);
    // Body.
    ctx.fillStyle = car.disabled ? '#6b6b6b' : car.color;
    roundRect(-car.l / 2, -car.w / 2, car.l, car.w, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    roundRect(-car.l / 2, -car.w / 2, car.l, car.w, 8);
    ctx.stroke();
    if (car.type === 'truck') {
      // Cab + cargo box.
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(car.l / 2 - 20, -car.w / 2 + 4, 16, car.w - 8);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-car.l / 2 + 4, -car.w / 2 + 4, car.l - 28, car.w - 8);
    } else {
      // Windshield + roof + rear window.
      ctx.fillStyle = 'rgba(20, 30, 40, 0.55)';
      ctx.fillRect(car.l * 0.18, -car.w / 2 + 4, 10, car.w - 8);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-car.l * 0.22, -car.w / 2 + 5, car.l * 0.34, car.w - 10);
      ctx.fillStyle = 'rgba(20, 30, 40, 0.45)';
      ctx.fillRect(-car.l * 0.42, -car.w / 2 + 4, 7, car.w - 8);
      // Headlights.
      ctx.fillStyle = '#fff8c9';
      ctx.fillRect(car.l / 2 - 2, -car.w / 2 + 4, 3, 6);
      ctx.fillRect(car.l / 2 - 2, car.w / 2 - 10, 3, 6);
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#20242c';
      ctx.font = `bold 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TAXI', 0, 0);
    }
    if (car.isPolice) {
      // White doors + light bar (flashing red/blue).
      ctx.fillStyle = '#f2efe6';
      ctx.fillRect(-car.l * 0.22, -car.w / 2 + 2, car.l * 0.34, car.w - 4);
      ctx.fillStyle = '#20242c';
      ctx.font = `bold 8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PD', 0, 0);
      const flash = Math.floor(G.time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#2f7bff';
      ctx.beginPath(); ctx.arc(-4, -car.w / 2 + 6, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = flash ? '#2f7bff' : '#ff3b30';
      ctx.beginPath(); ctx.arc(4, -car.w / 2 + 6, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawPed(G, ped) {
    if (ped.state === 'down') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(ped.x, ped.y, 12, 7, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath(); ctx.ellipse(ped.x, ped.y, 10, 6, 0.6, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const bob = Math.sin(ped.phase) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(ped.x + 1, ped.y + 2, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(ped.x, ped.y + bob * 0.3, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath(); ctx.arc(ped.x, ped.y + bob * 0.3 - 1, 5, 0, Math.PI * 2); ctx.fill();
  }

  function drawPlayer(G) {
    const p = G.player;
    if (p.inCar) return;
    const bob = p.moving ? Math.sin(p.walkPhase) * 2 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(p.x + 1, p.y + 3, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
    // Body (blue shirt) + head.
    ctx.fillStyle = '#2f6fd0';
    ctx.beginPath(); ctx.arc(p.x, p.y + bob * 0.2, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath(); ctx.arc(p.x, p.y + bob * 0.2, 6, 0, Math.PI * 2); ctx.fill();
    // Hair.
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath(); ctx.arc(p.x, p.y + bob * 0.2 - 2, 6, Math.PI, 0); ctx.fill();
    // Pistol aim line toward the mouse.
    const aim = p.aimAngle !== undefined ? p.aimAngle : p.angle;
    ctx.strokeStyle = 'rgba(255, 220, 80, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(aim) * 14, p.y + Math.sin(aim) * 14);
    ctx.lineTo(p.x + Math.cos(aim) * 26, p.y + Math.sin(aim) * 26);
    ctx.stroke();
    // Direction tick.
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 15, p.y + Math.sin(p.angle) * 15);
    ctx.stroke();
  }

  function drawBullets(G) {
    for (const b of G.bullets) {
      ctx.strokeStyle = b.fromPolice ? '#ff7b6b' : '#ffe066';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawParticles(G) {
    for (const pt of G.parts) {
      const t = pt.life / pt.maxLife;
      if (pt.kind === 'spark') {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = t;
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      } else if (pt.kind === 'smoke') {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = t * 0.5;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1.6 - t * 0.6), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = t * 0.55;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawMissionMarker(G) {
    const m = G.mission;
    if (!m.target) return;
    const pulse = 1 + Math.sin(G.time * 4) * 0.15;
    const { x, y, label } = m.target;
    // Beacon column.
    ctx.fillStyle = 'rgba(255, 207, 63, 0.12)';
    ctx.fillRect(x - 26, y - 130, 52, 130);
    // Pulsing ring + diamond.
    ctx.strokeStyle = '#ffcf3f';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, 30 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffcf3f';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();
    // Label.
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(12,16,24,0.75)';
    const w = ctx.measureText(label).width + 16;
    ctx.fillRect(x - w / 2, y - 78, w, 24);
    ctx.fillStyle = '#ffcf3f';
    ctx.fillText(label, x, y - 56);
    // Edge arrow when the target is off-screen.
    const viewW = view.w / view.zoom;
    const viewH = view.h / view.zoom;
    const cam = G.camera;
    if (x < cam.x - viewW / 2 + 60 || x > cam.x + viewW / 2 - 60 || y < cam.y - viewH / 2 + 60 || y > cam.y + viewH / 2 - 60) {
      const ang = Math.atan2(y - cam.y, x - cam.x);
      const ax = cam.x + Math.cos(ang) * (viewW / 2 - 50);
      const ay = cam.y + Math.sin(ang) * (viewH / 2 - 50);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffcf3f';
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -13);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-10, 13);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // --- Frame --------------------------------------------------------------------

  function drawWorld(G) {
    const cam = G.camera;
    const dpr = view.dpr;
    const shakeX = (Math.random() - 0.5) * cam.shake;
    const shakeY = (Math.random() - 0.5) * cam.shake;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1d2733';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.setTransform(
      dpr * view.zoom, 0, 0, dpr * view.zoom,
      dpr * (view.w / 2 - cam.x * view.zoom + shakeX),
      dpr * (view.h / 2 - cam.y * view.zoom + shakeY),
    );
    drawGround(G);
    drawPark(G);
    drawRoads();
    drawSidewalks();
    drawBuildings(G);
    drawTrees(G);
    drawMissionMarker(G);
    for (const car of G.cars) drawCar(G, car);
    for (const ped of G.peds) drawPed(G, ped);
    drawPlayer(G);
    drawBullets(G);
    drawParticles(G);
    // Warm sun wash so the frame reads bright and sunny.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const grad = ctx.createLinearGradient(0, 0, view.w, view.h);
    grad.addColorStop(0, 'rgba(255, 214, 120, 0.06)');
    grad.addColorStop(1, 'rgba(255, 160, 60, 0.04)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  // --- Minimap ------------------------------------------------------------------

  function drawMinimap(G) {
    const dpr = view.dpr;
    const S = 200;
    const k = S / WORLD.size;
    mm.setTransform(dpr, 0, 0, dpr, 0, 0);
    mm.fillStyle = '#22401e';
    mm.fillRect(0, 0, S, S);
    mm.fillStyle = PALETTE.grass;
    mm.fillRect(0, 0, S, S);
    // Sea + sand.
    mm.fillStyle = PALETTE.water;
    mm.fillRect(0, 0, WORLD.waterX * k, S);
    mm.fillStyle = PALETTE.sand;
    mm.fillRect(WORLD.waterX * k, 0, (WORLD.beachX - WORLD.waterX) * k, S);
    // Park.
    const p = G.world.park;
    mm.fillStyle = PALETTE.parkGrass;
    mm.fillRect(p.x0 * k, p.y0 * k, (p.x1 - p.x0) * k, (p.y1 - p.y0) * k);
    // Roads.
    mm.strokeStyle = PALETTE.road;
    mm.lineWidth = 3;
    for (const v of ROAD.vertical) {
      mm.beginPath(); mm.moveTo(v * k, 0); mm.lineTo(v * k, S); mm.stroke();
    }
    for (const h of ROAD.horizontal) {
      mm.beginPath(); mm.moveTo(0, h * k); mm.lineTo(S, h * k); mm.stroke();
    }
    // Buildings.
    mm.fillStyle = 'rgba(60, 48, 40, 0.75)';
    for (const b of G.world.buildings) {
      mm.fillRect(b.x * k, b.y * k, Math.max(1.5, b.w * k), Math.max(1.5, b.h * k));
    }
    // Mission target.
    if (G.mission.target) {
      const pulse = 1 + Math.sin(G.time * 5) * 0.25;
      mm.fillStyle = '#ffcf3f';
      mm.beginPath();
      mm.arc(G.mission.target.x * k, G.mission.target.y * k, 5 * pulse, 0, Math.PI * 2);
      mm.fill();
      mm.strokeStyle = '#7a5b00';
      mm.lineWidth = 1;
      mm.stroke();
    }
    // Cars, police, peds.
    for (const car of G.cars) {
      if (car.disabled) continue;
      mm.fillStyle = car.isPolice ? (Math.floor(G.time * 5) % 2 === 0 ? '#ff3b30' : '#2f7bff') : car.color;
      mm.beginPath(); mm.arc(car.x * k, car.y * k, car.isPolice ? 3.5 : 2.5, 0, Math.PI * 2); mm.fill();
    }
    mm.fillStyle = 'rgba(240,240,240,0.8)';
    for (const ped of G.peds) {
      if (ped.state === 'down') continue;
      mm.fillRect(ped.x * k - 1, ped.y * k - 1, 2, 2);
    }
    // Player.
    const pl = G.player;
    mm.fillStyle = '#ffffff';
    mm.beginPath(); mm.arc(pl.x * k, pl.y * k, 4, 0, Math.PI * 2); mm.fill();
    mm.strokeStyle = '#20242c';
    mm.lineWidth = 1.5;
    mm.stroke();
    // North arrow + frame.
    mm.fillStyle = '#f5f0e6';
    mm.font = `bold 11px ${FONT}`;
    mm.textAlign = 'left';
    mm.textBaseline = 'top';
    mm.fillText('N ↑', 5, 4);
    mm.strokeStyle = 'rgba(255,255,255,0.65)';
    mm.lineWidth = 2;
    mm.strokeRect(1, 1, S - 2, S - 2);
  }

  function draw(G) {
    drawWorld(G);
    drawMinimap(G);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toWorld, resize };
}
