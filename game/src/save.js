// Save / load through localStorage. Progress is money earned and the mission index
// (which missions are done). Everything else (positions, cars, wanted) is fresh each run.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      money: Number.isFinite(data.money) ? Math.max(0, Math.floor(data.money)) : 0,
      missionIndex: Number.isFinite(data.missionIndex) ? Math.max(0, Math.min(5, Math.floor(data.missionIndex))) : 0,
      earned: Number.isFinite(data.earned) ? Math.max(0, Math.floor(data.earned)) : 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: Math.floor(data.money),
      missionIndex: data.missionIndex,
      earned: Math.floor(data.earned || 0),
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
