// Keyboard + mouse input. Held keys are read every frame; one-shot presses (enter
// car, shoot, pause, confirm) are queued as flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_SHOOT = 8;
export const ACTION_MUTE = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const SHOOT = new Set(['KeyF']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false, worldX: 0, worldY: 0 };

  function press(code) {
    if (CONFIRM.has(code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
    else if (ENTER.has(code)) actions |= ACTION_ENTER;
    else if (SHOOT.has(code)) actions |= ACTION_SHOOT;
    else if (MUTE.has(code)) actions |= ACTION_MUTE;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    press(event.code);
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) { mouse.down = true; actions |= ACTION_SHOOT; }
  });
  window.addEventListener('mouseup', () => { mouse.down = false; });

  return {
    mouse,
    isDown(code) { return keys.has(code); },
    axis() {
      let ax = 0;
      let ay = 0;
      for (const c of keys) {
        if (LEFT.has(c)) ax -= 1;
        if (RIGHT.has(c)) ax += 1;
        if (UP.has(c)) ay -= 1;
        if (DOWN.has(c)) ay += 1;
      }
      return { x: ax, y: ay };
    },
    running() {
      for (const c of keys) if (RUN.has(c)) return true;
      return false;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
