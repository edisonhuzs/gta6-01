// The story: five missions from Mara the fixer, run by a small state machine.
// Each mission has stages, a map marker, a HUD objective line, and a cash reward.
// Completing one pays out, shows a story banner, advances to the next, and saves.
import { PLACES } from './world.js';
import { dist } from './random.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    name: 'M1 — First Wheels',
    reward: 200,
    briefing: 'Mara: "New in Solmar Bay? You need wheels. Take any car — press E next to one — then bring it to my garage."',
  },
  {
    id: 'package-run',
    name: 'M2 — Package Run',
    reward: 400,
    briefing: 'Mara: "A package is waiting across town. Grab it and drop it off — and don\'t be late, the clock is ticking."',
  },
  {
    id: 'lose-the-heat',
    name: 'M3 — Lose the Heat',
    reward: 300,
    briefing: 'Mara: "The PD has your face now. Get a wanted level, then vanish — stay clean until the stars clear."',
  },
  {
    id: 'the-getaway',
    name: 'M4 — The Getaway',
    reward: 600,
    briefing: 'Mara: "My crew is waiting on the corner. Pick them up and get to the safehouse — the cops will be all over you."',
  },
  {
    id: 'bay-heist',
    name: 'M5 — Bay Heist',
    reward: 1500,
    briefing: 'Mara: "The big one. Hit Solmar Bank, grab the cash, and escape to the safehouse. Make it count."',
  },
];

export function createMissionState(startIndex) {
  return {
    index: Math.min(startIndex || 0, MISSIONS.length),
    stage: 'start',
    timer: 0,
    target: null,
    done: false,
    banner: null,
    bannerT: 0,
  };
}

function setTarget(G, place, label) {
  G.mission.target = { x: place.x, y: place.y, label: label || place.label };
}

// (Re)start the current mission's first stage.
export function startMission(G) {
  const m = G.mission;
  const idx = m.index;
  if (idx >= MISSIONS.length) {
    m.target = null;
    m.done = true;
    return;
  }
  m.done = false;
  if (idx === 0) {
    m.stage = 'steal';
    m.target = null;
  } else if (idx === 1) {
    m.stage = 'pickup';
    setTarget(G, PLACES.pickup);
  } else if (idx === 2) {
    m.stage = 'heat';
    m.target = null;
  } else if (idx === 3) {
    m.stage = 'crew';
    setTarget(G, PLACES.crew);
  } else if (idx === 4) {
    m.stage = 'bank';
    setTarget(G, PLACES.bank);
  }
}

export function currentObjective(G) {
  const m = G.mission;
  if (m.index >= MISSIONS.length) return 'Free roam — Solmar Bay is yours. Mara will call again soon.';
  const name = MISSIONS[m.index].name;
  if (m.index === 0) {
    return m.stage === 'steal'
      ? `${name}: Steal a car — press E near any car`
      : `${name}: Drive to the garage`;
  }
  if (m.index === 1) {
    return m.stage === 'pickup'
      ? `${name}: Drive to the pickup point`
      : `${name}: Deliver the package — ${Math.ceil(m.timer)}s left!`;
  }
  if (m.index === 2) {
    return m.stage === 'heat'
      ? `${name}: Get a wanted level — steal a car or cause trouble`
      : `${name}: Lose the heat — stay clean until the stars clear`;
  }
  if (m.index === 3) {
    return m.stage === 'crew'
      ? `${name}: Pick up the crew at the corner`
      : `${name}: Get to the safehouse!`;
  }
  if (m.index === 4) {
    return m.stage === 'bank'
      ? `${name}: Drive to Solmar Bank`
      : `${name}: Cash grabbed! Escape to the safehouse!`;
  }
  return name;
}

function completeMission(G) {
  const m = G.mission;
  const def = MISSIONS[m.index];
  G.player.money += def.reward;
  G.earned += def.reward;
  G.audio.mission();
  m.banner = `${def.name} complete — +$${def.reward}`;
  m.bannerT = 4;
  m.index += 1;
  m.target = null;
  G.saveGame();
  if (m.index >= MISSIONS.length) {
    m.banner = 'Story complete — you own Solmar Bay. Free roam!';
    m.bannerT = 5;
    m.done = true;
  } else {
    startMission(G);
  }
}

function near(G, place, radius) {
  const p = G.player;
  const ref = p.inCar ? p.inCar : p;
  return dist(ref.x, ref.y, place.x, place.y) < radius;
}

export function updateMissions(G, dt) {
  const m = G.mission;
  if (m.bannerT > 0) m.bannerT -= dt;
  if (m.index >= MISSIONS.length) return;
  const p = G.player;

  if (m.index === 0) {
    if (m.stage === 'steal') {
      if (p.inCar) {
        m.stage = 'drive';
        setTarget(G, PLACES.garage);
        G.flashMessage('Nice wheels. Now bring it to the garage.');
      }
    } else if (near(G, PLACES.garage, 80)) {
      completeMission(G);
    }
    return;
  }

  if (m.index === 1) {
    if (m.stage === 'pickup') {
      if (near(G, PLACES.pickup, 70)) {
        m.stage = 'deliver';
        m.timer = 75;
        setTarget(G, PLACES.dropoff);
        G.audio.pickup();
        G.flashMessage('Package collected — 75 seconds to deliver!');
      }
    } else {
      m.timer -= dt;
      if (m.timer <= 0) {
        m.stage = 'pickup';
        setTarget(G, PLACES.pickup);
        G.flashMessage('Too slow — the package run failed. Try again.');
      } else if (near(G, PLACES.dropoff, 70)) {
        completeMission(G);
      }
    }
    return;
  }

  if (m.index === 2) {
    if (m.stage === 'heat') {
      if (G.wanted >= 1) {
        m.stage = 'lose';
        G.flashMessage('Heat is on — now lose them. Stay clean.');
      }
    } else if (G.wanted === 0) {
      completeMission(G);
    }
    return;
  }

  if (m.index === 3) {
    if (m.stage === 'crew') {
      if (p.inCar && near(G, PLACES.crew, 70)) {
        m.stage = 'safehouse';
        setTarget(G, PLACES.safehouse);
        // The pickup draws the police.
        if (G.wanted < 2) G.addWanted(2 - G.wanted, 'getaway');
        G.flashMessage('Crew is in! Get to the safehouse — cops incoming!');
      }
    } else if (p.inCar && near(G, PLACES.safehouse, 80)) {
      completeMission(G);
    }
    return;
  }

  if (m.index === 4) {
    if (m.stage === 'bank') {
      if (near(G, PLACES.bank, 70)) {
        m.stage = 'escape';
        setTarget(G, PLACES.safehouse);
        if (G.wanted < 3) G.addWanted(3 - G.wanted, 'heist');
        G.audio.pickup();
        G.flashMessage('Cash grabbed! Escape to the safehouse!');
      }
    } else if (near(G, PLACES.safehouse, 80)) {
      completeMission(G);
    }
  }
}

// Called when the player enters a car (M1 watches for it); kept here so the
// mission module owns all mission transitions.
export function onEnterCar(G) {
  const m = G.mission;
  if (m.index === 0 && m.stage === 'steal') {
    m.stage = 'drive';
    setTarget(G, PLACES.garage);
  }
}
