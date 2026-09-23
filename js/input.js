// Reads the first connected gamepad (standard layout) and the keyboard.
const DEADZONE = 0.1;
export const BUTTON = { jump: 0, boost: 1, rollLeft: 4, rollRight: 5, reset: 12 };
const KEY_BUTTONS = { Space: BUTTON.jump, ShiftLeft: BUTTON.boost, ShiftRight: BUTTON.boost, KeyQ: BUTTON.rollLeft, KeyE: BUTTON.rollRight, KeyR: BUTTON.reset };
const STICK_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const BOUND = new Set([...Object.keys(KEY_BUTTONS), ...STICK_KEYS]);

export function createInput() {
  const held = new Set();
  // Keys pressed since the last read, so a tap shorter than a frame still counts.
  const tapped = new Set();
  let enabled = false;

  addEventListener('keydown', (e) => {
    if (!enabled || !BOUND.has(e.code) || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    held.add(e.code);
    tapped.add(e.code);
  });
  addEventListener('keyup', (e) => {
    if (enabled && BOUND.has(e.code)) e.preventDefault();
    held.delete(e.code);
  });
  addEventListener('blur', () => held.clear());

  return {
    // Keys are only taken over while something uses them, so Space still presses buttons otherwise.
    set enabled(value) {
      enabled = value;
      if (!value) held.clear();
    },
    read() {
      const down = new Set([...held, ...tapped]);
      tapped.clear();
      const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p?.connected && p.mapping === 'standard');
      const buttons = Array.from({ length: 17 }, (_, i) => Boolean(pad?.buttons[i]?.pressed));
      for (const [code, button] of Object.entries(KEY_BUTTONS)) if (down.has(code)) buttons[button] = true;

      let stick = deadzone(pad?.axes[0] ?? 0, -(pad?.axes[1] ?? 0));
      if (!stick.x && !stick.y) {
        const x = down.has('KeyD') - down.has('KeyA');
        const y = down.has('KeyW') - down.has('KeyS');
        const scale = x && y ? Math.SQRT1_2 : 1;
        stick = { x: x * scale, y: y * scale };
      }

      return {
        name: pad?.id.replace(/\s*\(.*\)\s*$/, '') ?? null,
        stick,
        rightStick: deadzone(pad?.axes[2] ?? 0, -(pad?.axes[3] ?? 0)),
        triggers: [6, 7].map((i) => pad?.buttons[i]?.value ?? 0),
        buttons,
        roll: buttons[BUTTON.rollRight] - buttons[BUTTON.rollLeft],
        jump: buttons[BUTTON.jump],
        boost: buttons[BUTTON.boost],
        reset: buttons[BUTTON.reset],
      };
    },
  };
}

function deadzone(x, y) {
  const length = Math.hypot(x, y);
  if (length < DEADZONE) return { x: 0, y: 0 };
  const scale = Math.min(1, (length - DEADZONE) / (1 - DEADZONE)) / length;
  const clamp = (v) => Math.max(-1, Math.min(1, v * scale));
  return { x: clamp(x), y: clamp(y) };
}
