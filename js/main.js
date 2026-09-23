import * as THREE from 'three';
import { Car, NOSE_SQUARE, NO_CONTROLS, TICK, stickToInputs } from './physics.js';
import { POINTS, createStage } from './scene.js';
import { createInput } from './input.js';
import { createPad } from './pad.js';
import { createPicker } from './picker.js';

const D = Math.SQRT1_2;
const STICK = [
  { name: 'Upper left', x: -D, y: D },
  { name: 'Up', x: 0, y: 1 },
  { name: 'Upper right', x: D, y: D },
  { name: 'Left', x: -1, y: 0 },
  { name: 'Neutral', x: 0, y: 0 },
  { name: 'Right', x: 1, y: 0 },
  { name: 'Lower left', x: -D, y: -D },
  { name: 'Down', x: 0, y: -1 },
  { name: 'Lower right', x: D, y: -D },
];

const GROUND_WAIT = 0.6;
const LOCKED_POSITION = new THREE.Vector3(0, 1.6, 0);
const MODES = {
  loop: {
    hint: 'Jumps over and over with the same inputs. Each jump starts from the start mark.',
    reset: null,
    car: {},
  },
  locked: {
    hint: 'Pinned in mid-air, like boosting forever without moving: only rotation.',
    reset: 'Level the car',
    car: { position: LOCKED_POSITION, pinned: true },
  },
  free: {
    hint: 'Jump and boost from your controller or keyboard. Landing puts the car back on its wheels.',
    reset: 'Back to the start mark',
    car: {},
  },
};

const $ = (id) => document.getElementById(id);
const settings = {
  mode: 'loop',
  source: 'panel',
  airRoll: 0,
  stick: STICK[4],
  holdTicks: 12,
  speed: 0.5,
  arrows: true,
  trails: false,
  hitbox: true,
  ball: false,
  points: new Set(['nose']),
};
const pickedInputs = () => stickToInputs(settings.stick, settings.airRoll);

const stage = createStage($('stage'), { onOrbit: () => checkView(null) });
const input = createInput();
const pad = createPad($('pad'));
const car = new Car();
let device = input.read();

// The jump loop replays one jump. It starts every jump from the start mark and shows where the last one landed.
const loop = { wait: 0, tick: 0, jump: null };
car.onJump = () => {
  if (settings.mode === 'loop') stage.clearTrails();
};
car.onLand = (position) => {
  if (settings.mode !== 'loop') return;
  stage.showLanding(position);
  showStatus(describeLanding(position));
};

function steering() {
  return settings.source === 'controller' ? stickToInputs(device.stick, device.roll) : pickedInputs();
}

function controls() {
  if (settings.mode !== 'loop') {
    return { ...steering(), jump: settings.mode === 'free' && device.jump, boost: device.boost };
  }
  if (car.phase === 'ground') {
    loop.wait += TICK;
    if (loop.wait < GROUND_WAIT) return NO_CONTROLS;
    loop.wait = 0;
    loop.tick = 0;
    loop.jump = { inputs: pickedInputs(), holdTicks: settings.holdTicks };
    car.reset();
  }
  if (!loop.jump) return NO_CONTROLS;
  const inputs = settings.source === 'controller' ? steering() : loop.jump.inputs;
  return { ...inputs, jump: loop.tick++ < loop.jump.holdTicks, boost: false };
}

function describeLanding({ x, z }) {
  const side = z * 100;
  const ahead = x * 100;
  const sideways = Math.abs(side) < 0.05 ? 'no drift sideways' : `${Math.abs(side).toFixed(1)} uu ${side < 0 ? 'left' : 'right'}`;
  return `Landed ${sideways}, ${Math.abs(ahead).toFixed(1)} uu ${ahead < 0 ? 'behind' : 'ahead'}`;
}

// Where the spin axis points, on the car and in the world (ahead and right as the car starts).
const CAR_SIDES = ['the roof', 'the roof and right side', 'the right side', 'the underside and right side', 'the underside', 'the underside and left side', 'the left side', 'the roof and left side'];
const degrees = (radians) => Math.round(THREE.MathUtils.radToDeg(Math.abs(radians)));

function describeAxis() {
  const spin = car.phase === 'air' && car.spinAxis();
  if (!spin) return null;
  if (spin.nose <= NOSE_SQUARE) return 'Spin axis square to the nose';

  const { x, y, z } = spin.direction.clone().applyQuaternion(car.orientation.clone().invert());
  const offNose = degrees(Math.acos(Math.min(1, x)));
  const side = CAR_SIDES[(Math.round(Math.atan2(z, y) / (Math.PI / 4)) + 8) % 8];
  const onCar = offNose < 1 ? 'Spin axis along the nose' : `Spin axis ${offNose}° off the nose, toward ${side}`;

  const { x: ahead, y: up, z: right } = spin.direction;
  const rise = degrees(Math.asin(up));
  if (rise > 88) return `${onCar}\nPoints straight ${up > 0 ? 'up' : 'down'}`;
  const bearing = degrees(Math.atan2(right, ahead));
  const height = rise < 1 ? 'level' : `${rise}° ${up > 0 ? 'up' : 'down'}`;
  const heading = bearing < 1 ? 'ahead' : bearing > 179 ? 'behind' : `${bearing}° ${right > 0 ? 'right' : 'left'} of ahead`;
  return `${onCar}\nPoints ${height}, ${heading}`;
}

let axisText = null;
function showAxis() {
  const text = describeAxis();
  if (text === axisText) return;
  axisText = text;
  $('axis').hidden = !text;
  $('axis').textContent = text ?? '';
}

function showStatus(text) {
  $('status').hidden = !text;
  $('status').textContent = text ?? '';
}

// Mode and input source

function setMode(mode) {
  settings.mode = mode;
  const config = MODES[mode];
  car.reset(config.car);
  loop.wait = 0;
  loop.jump = null;
  stage.setMode(mode, car);
  stage.clearTrails();
  stage.showLanding(null);
  showStatus(null);
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  $('mode-hint').textContent = config.hint;
  $('hold-control').hidden = mode !== 'loop';
  $('reset').hidden = !config.reset;
  $('reset').textContent = config.reset ?? '';
  updateKeyboard();
  renderInputs();
}

function setSource(source) {
  settings.source = source;
  document.querySelectorAll('[data-source]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.source === source)));
  $('panel-inputs').hidden = source !== 'panel';
  $('controller-inputs').hidden = source !== 'controller';
  updateKeyboard();
  renderInputs();
}

// The keyboard is only taken over when it steers, jumps or boosts, so Space presses panel buttons otherwise.
function updateKeyboard() {
  input.enabled = settings.mode !== 'loop' || settings.source === 'controller';
}

document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-source]').forEach((button) => button.addEventListener('click', () => setSource(button.dataset.source)));
$('reset').addEventListener('click', () => setMode(settings.mode));

// Camera views

function checkView(name) {
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === name)));
}
document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    checkView(button.dataset.view);
    stage.view(button.dataset.view);
  });
});

// Picked inputs

document.querySelectorAll('[data-roll]').forEach((button) => {
  button.addEventListener('click', () => {
    settings.airRoll = Number(button.dataset.roll);
    document.querySelectorAll('[data-roll]').forEach((b) => b.setAttribute('aria-checked', String(b === button)));
    renderInputs();
  });
});

const notches = document.querySelector('.notches');
const cap = document.querySelector('.cap');
for (const position of STICK) {
  const button = document.createElement('button');
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-label', position.name);
  button.setAttribute('aria-checked', String(position === settings.stick));
  button.style.setProperty('--x', position.x);
  button.style.setProperty('--y', position.y);
  button.addEventListener('click', () => {
    settings.stick = position;
    notches.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === button)));
    renderInputs();
  });
  notches.append(button);
}

// Sliders and toggles

bindRange('speed', (v) => {
  settings.speed = v;
  return `${v.toFixed(2)}×`;
});
bindRange('hold', (v) => {
  settings.holdTicks = v;
  const ms = `${Math.round(v * TICK * 1000)} ms`;
  return v === 3 ? `Tap · ${ms}` : v === 24 ? `Full · ${ms}` : ms;
});
for (const id of ['arrows', 'trails', 'hitbox', 'ball']) {
  $(id).addEventListener('change', (e) => {
    settings[id] = e.target.checked;
    $('legend').hidden = !settings.arrows;
  });
}

function bindRange(id, apply) {
  const input = $(id);
  const output = $(`${id}-out`);
  input.addEventListener('input', () => {
    output.value = apply(Number(input.value));
    renderInputs();
  });
}

// Points

const pointNames = () => {
  const names = POINTS.filter((p) => settings.points.has(p.id)).map((p) => p.name);
  return names.length > 2 ? `${names.length} points` : names.join(', ') || 'None';
};
const picker = $('picker');
createPicker(picker, POINTS, settings.points, () => ($('points-name').value = pointNames()));
picker.addEventListener('pointerover', (e) => {
  if (e.target.title) $('points-name').value = e.target.title;
});
picker.addEventListener('pointerleave', () => ($('points-name').value = pointNames()));
$('points-name').value = pointNames();

// Readout

let shown = '';
function renderInputs() {
  const live = settings.source === 'controller';
  const next = live || settings.mode !== 'loop' ? steering() : pickedInputs();
  const format = (v) => (v > 0 ? '+' : v < 0 ? '−' : ' ') + Math.abs(v).toFixed(2);
  const text = [next.roll, next.pitch, next.yaw].map(format);
  if (text.join() !== shown) {
    shown = text.join();
    [$('in-roll').value, $('in-pitch').value, $('in-yaw').value] = text;
  }
  $('stick-name').value = settings.stick.name;
  cap.style.setProperty('--x', settings.stick.x);
  cap.style.setProperty('--y', settings.stick.y);

  const waiting = settings.mode === 'loop' && !live && car.phase === 'air' && loop.jump;
  const unchanged = waiting && ['roll', 'pitch', 'yaw'].every((k) => loop.jump.inputs[k] === next[k]) && loop.jump.holdTicks === settings.holdTicks;
  $('pending').hidden = !waiting || unchanged;
}

function renderLive() {
  if (settings.source === 'controller') {
    pad.update(device);
    $('pad-status').textContent = device.name
      ? `${device.name} · stick ${device.stick.x.toFixed(2)}, ${device.stick.y.toFixed(2)}`
      : 'No controller found yet: plug one in and press any button. Or use the keyboard: WASD stick, Q / E air roll, Space jump, Shift boost.';
  }
  if (settings.mode === 'free') {
    showStatus(`${Math.round(car.velocity.length() * 100)} uu/s · ${Math.round(car.position.y * 100)} uu high`);
  } else if (settings.mode === 'locked') {
    showStatus(`Spinning at ${car.omega.length().toFixed(2)} rad/s`);
  }
  showAxis();
  renderInputs();
}

// Main loop

let last = performance.now();
let accumulator = 0;
function frame(now) {
  accumulator += Math.min(0.1, (now - last) / 1000) * settings.speed;
  last = now;
  device = input.read();
  while (accumulator >= TICK) {
    car.step(controls());
    accumulator -= TICK;
  }
  renderLive();
  stage.sync(car, { ...settings });
  stage.render();
  requestAnimationFrame(frame);
}
setMode('loop');
setSource('panel');
requestAnimationFrame(frame);
