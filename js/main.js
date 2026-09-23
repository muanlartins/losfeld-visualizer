import * as THREE from 'three';
import { AXIS, Car, NO_CONTROLS, TICK, stickToInputs } from './physics.js';
import { POINTS, createStage } from './scene.js';
import { createInput } from './input.js';
import { CLOCKWISE, clockName, createClockPlayer, turnsWithRoll } from './clock.js';
import { createHeading } from './heading.js';
import { createGauge } from './gauge.js';
import { recordCombo } from './moves.js';
import { createMovePanel } from './move-panel.js';
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
  moves: {
    hint: 'Plays a combo on the clock, one move per revolution of the car. Pause, scrub and step through it on the timeline; Speed sets the pace.',
    reset: 'Play again',
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
  clock: { turn: CLOCKWISE, tempo: 'clock' },
  combo: { names: ['R', 'U', 'L', 'D'], tempo: 'double', resume: 'jump' },
  holdTicks: 12,
  speed: 0.5,
  arrows: true,
  trails: false,
  hitbox: true,
  ball: false,
  points: new Set(['nose']),
};
const pickedInputs = () => stickToInputs(settings.stick, settings.airRoll);
const RIGHT = STICK[5];

const stage = createStage($('stage'), { onOrbit: () => checkView(null) });
const input = createInput();
const pad = createPad($('pad'));
const gauge = createGauge($('gauge'));
const heading = createHeading();
const car = new Car();
let device = input.read();
let ticks = 0;
// Moves: the combo is recorded once with the same physics, then shown from `replay.tick`, played on at the speed
// slider's pace or stepped by hand.
const replay = { recording: null, tick: 0, playing: true };
let clock = null;

// The jump loop replays one jump. It starts every jump from the start mark and shows where the last one landed.
const loop = { wait: 0, tick: 0, jump: null };
car.onJump = () => {
  heading.clear();
  gauge.clear();
  if (settings.mode === 'loop') stage.clearTrails();
};
car.onLand = (position) => {
  if (settings.mode !== 'loop') return;
  stage.showLanding(position);
  showStatus(describeLanding(position));
};

// The stick as it was last put: picked, circling with the clock, or from the controller.
function currentStick() {
  if (settings.source === 'controller') return device.stick;
  if (settings.source === 'clock') return clock.current;
  return settings.stick;
}

// Moves the clock on by one tick, so call it once per tick.
const nextStick = () => (settings.source === 'clock' ? clock.stick(car) : currentStick());

function steering(stick = currentStick()) {
  return stickToInputs(stick, settings.source === 'controller' ? device.roll : settings.airRoll);
}

// The clock starts again from its first notch whenever the car resets or the clock changes.
function restartClock() {
  clock = createClockPlayer({ ...settings.clock, start: Math.atan2(settings.stick.y, settings.stick.x) });
}

function controls() {
  if (settings.mode !== 'loop') {
    return { ...steering(nextStick()), jump: settings.mode === 'free' && device.jump, boost: device.boost };
  }
  if (car.phase === 'ground') {
    loop.wait += TICK;
    if (loop.wait < GROUND_WAIT) return NO_CONTROLS;
    loop.wait = 0;
    loop.tick = 0;
    loop.jump = { inputs: pickedInputs(), holdTicks: settings.holdTicks };
    car.reset();
    restartClock();
  }
  if (!loop.jump) return NO_CONTROLS;
  const inputs = settings.source === 'panel' ? loop.jump.inputs : steering(nextStick());
  return { ...inputs, jump: loop.tick++ < loop.jump.holdTicks, boost: false };
}

function describeLanding({ x, z }) {
  const side = z * 100;
  const ahead = x * 100;
  const sideways = Math.abs(side) < 0.05 ? 'no drift sideways' : `${Math.abs(side).toFixed(1)} uu ${side < 0 ? 'left' : 'right'}`;
  return `Landed ${sideways}, ${Math.abs(ahead).toFixed(1)} uu ${ahead < 0 ? 'behind' : 'ahead'}`;
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
  restartClock();
  heading.clear();
  gauge.clear();
  replay.recording = mode === 'moves' ? recordCombo(settings.combo) : null;
  replay.tick = 0;
  if (replay.recording) showFrame();
  $('moves-group').hidden = mode !== 'moves';
  $('inputs-group').hidden = mode === 'moves';
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
  $('panel-inputs').hidden = source === 'controller';
  $('clock-inputs').hidden = source !== 'clock';
  $('controller-inputs').hidden = source !== 'controller';
  // A clock starts from a direction, so it can't start from neutral.
  if (source === 'clock' && settings.stick === STICK[4]) pickStick(RIGHT);
  notches.classList.toggle('clock', source === 'clock');
  $('stick-label').textContent = source === 'clock' ? 'Starts at' : 'Left stick';
  document.querySelector('.stick').classList.toggle('live', source === 'clock');
  updateKeyboard();
  renderInputs();
}

// The keyboard is only taken over when it steers, jumps or boosts, so Space presses panel buttons otherwise.
function updateKeyboard() {
  input.enabled = settings.mode === 'locked' || settings.mode === 'free' || settings.source === 'controller';
}

document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-source]').forEach((button) => button.addEventListener('click', () => setSource(button.dataset.source)));
$('reset').addEventListener('click', () => setMode(settings.mode));

// Moves

const movePanel = createMovePanel(
  {
    pad: $('move-pad'),
    combo: $('combo'),
    timeline: $('timeline'),
    clock: $('timeline-clock'),
    total: $('combo-total'),
    undo: $('combo-undo'),
    clear: $('combo-clear'),
    stick: $('move-stick'),
    steps: $('steps'),
    revolution: $('revolution'),
    compare: $('compare'),
    resumeHint: $('resume-hint'),
    hint: $('move-hint'),
  },
  {
    onAdd: (name) => setCombo({ names: [...settings.combo.names, name] }),
    onUndo: () => setCombo({ names: settings.combo.names.slice(0, -1) }),
    onClear: () => setCombo({ names: [] }),
    onSeek: (tick) => seek(tick, { pause: true }),
    onToggle: () => {
      replay.playing = !replay.playing;
      if (replay.playing && replay.tick === replay.recording.frames.length - 1) seek(0);
    },
    onStep: (by) => seek(replay.tick + by, { pause: true }),
    onRevolution: (by) => seek(nextUpright(by), { pause: true }),
    onSpeed: (speed) => {
      $('speed').value = speed;
      $('speed').dispatchEvent(new Event('input'));
    },
    onSlot: (index) => seek(index < 0 ? 0 : replay.recording.uprights[replay.recording.slots[index].start - 1]),
  },
);

function showFrame() {
  const frame = replay.recording.frames[replay.tick];
  car.orientation.copy(frame.orientation);
  car.omega.copy(frame.omega);
  car.rolled = frame.rolled;
  car.controls = frame.controls;
}

// Going back, or skipping ahead, starts the trails again.
function seek(tick, { pause = false } = {}) {
  const next = THREE.MathUtils.clamp(Math.round(tick), 0, replay.recording.frames.length - 1);
  if (pause) replay.playing = false;
  if (next < replay.tick || next > replay.tick + 1) {
    stage.clearTrails();
    gauge.clear();
  }
  replay.tick = next;
  showFrame();
}

// The frame where the car next turns upright, going forward or back. Going back from just past one goes to the one
// before it.
function nextUpright(by) {
  const uprights = [0, ...replay.recording.uprights, replay.recording.frames.length - 1];
  if (by > 0) return uprights.find((t) => t > replay.tick) ?? replay.tick;
  return uprights.findLast((t) => t < replay.tick - 2) ?? 0;
}

addEventListener('keydown', (e) => {
  if (settings.mode !== 'moves' || e.metaKey || e.ctrlKey || e.altKey) return;
  const onControl = e.target.closest?.('button, input');
  if (e.code === 'Space' && !onControl) {
    e.preventDefault();
    replay.playing = !replay.playing;
  } else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && e.target.type !== 'range') {
    e.preventDefault();
    const by = e.code === 'ArrowLeft' ? -1 : 1;
    if (e.shiftKey) seek(nextUpright(by), { pause: true });
    else seek(replay.tick + by, { pause: true });
  } else if (e.code === 'KeyR') {
    setMode('moves');
  }
});
// Any change to the combo plays it again from the start.
function setCombo(change) {
  Object.assign(settings.combo, change);
  document.querySelectorAll('[data-move-tempo]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.moveTempo === settings.combo.tempo)));
  document.querySelectorAll('[data-resume]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.resume === settings.combo.resume)));
  setMode('moves');
}
document.querySelectorAll('[data-move-tempo]').forEach((b) => b.addEventListener('click', () => setCombo({ tempo: b.dataset.moveTempo })));
document.querySelectorAll('[data-resume]').forEach((b) => b.addEventListener('click', () => setCombo({ resume: b.dataset.resume })));

// Clock

function setClock(change) {
  Object.assign(settings.clock, change);
  restartClock();
  document.querySelectorAll('[data-turn]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.turn) === settings.clock.turn)));
  document.querySelectorAll('[data-tempo]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tempo === settings.clock.tempo)));
  renderInputs();
}
document.querySelectorAll('[data-turn]').forEach((b) => b.addEventListener('click', () => setClock({ turn: Number(b.dataset.turn) })));
document.querySelectorAll('[data-tempo]').forEach((b) => b.addEventListener('click', () => setClock({ tempo: b.dataset.tempo })));

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
function pickStick(position) {
  settings.stick = position;
  restartClock();
  notches.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.name === position.name)));
  renderInputs();
}
for (const position of STICK) {
  const button = document.createElement('button');
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-label', position.name);
  button.setAttribute('aria-checked', String(position === settings.stick));
  button.dataset.name = position.name;
  button.style.setProperty('--x', position.x);
  button.style.setProperty('--y', position.y);
  button.addEventListener('click', () => pickStick(position));
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
  const live = settings.source !== 'panel';
  const next = settings.mode === 'moves' ? car.controls : live || settings.mode !== 'loop' ? steering() : pickedInputs();
  const format = (v) => (v > 0 ? '+' : v < 0 ? '−' : ' ') + Math.abs(v).toFixed(2);
  const text = [next.roll, next.pitch, next.yaw].map(format);
  if (text.join() !== shown) {
    shown = text.join();
    [$('in-roll').value, $('in-pitch').value, $('in-yaw').value] = text;
  }
  const stick = currentStick();
  $('stick-name').value = settings.stick.name;
  cap.style.setProperty('--x', stick.x);
  cap.style.setProperty('--y', stick.y);
  $('stick-hint').textContent = settings.source === 'clock' ? clockHint() : 'Up pushes the nose down (default, not inverted)';
  $('clock-name').textContent = settings.source === 'clock' && settings.airRoll ? `The video calls this a ${clockName(settings.clock, settings.airRoll)}` : '';

  const waiting = settings.mode === 'loop' && !live && car.phase === 'air' && loop.jump;
  const unchanged = waiting && ['roll', 'pitch', 'yaw'].every((k) => loop.jump.inputs[k] === next[k]) && loop.jump.holdTicks === settings.holdTicks;
  $('pending').hidden = !waiting || unchanged;
}

function renderLive() {
  if (settings.source === 'controller') {
    pad.update(device);
    $('pad-status').textContent = device.name
      ? `${device.name} · stick ${device.stick.x.toFixed(2)}, ${device.stick.y.toFixed(2)}`
      : 'No controller found yet: plug one in and press any button. Or use the keyboard: WASD stick, Q / E air roll, Space jump, Shift boost, R reset.';
  }
  if (settings.mode === 'free') {
    showStatus(`${Math.round(car.velocity.length() * 100)} uu/s · ${Math.round(car.position.y * 100)} uu high`);
  } else if (settings.mode !== 'loop') {
    showStatus(`Spinning at ${car.omega.length().toFixed(2)} rad/s`);
  }
  if (replay.recording) movePanel.render(settings.combo, replay.recording, replay.tick, replay.playing, settings.speed);
  const airborne = car.phase === 'air';
  gauge.update({
    heading: currentHeading(),
    nose: airborne ? AXIS.roll.clone().applyQuaternion(car.orientation) : null,
    spin: airborne ? car.spinAxis() : null,
    ticks: replay.recording ? replay.tick : ticks,
    camera: stage.camera,
  });
  renderInputs();
}

function currentHeading() {
  if (replay.recording) return replay.recording.frames[replay.tick].heading;
  return car.phase === 'air' ? heading.get() : null;
}

function clockHint() {
  if (!settings.airRoll) return 'The clock keeps time with the air roll: pick left or right';
  return turnsWithRoll(settings.clock.turn, settings.airRoll)
    ? 'Turns with the car, so its push keeps one direction'
    : 'Turns against the car, so its push averages out';
}

// Main loop

let last = performance.now();
let accumulator = 0;
function frame(now) {
  accumulator += Math.min(0.1, (now - last) / 1000) * settings.speed;
  last = now;
  const resetHeld = device.reset;
  device = input.read();
  if (device.reset && !resetHeld) setMode(settings.mode);
  while (accumulator >= TICK) {
    if (replay.recording) {
      if (replay.playing) seek(replay.tick + 1 < replay.recording.frames.length ? replay.tick + 1 : 0);
    } else {
      car.step(controls());
      if (car.phase === 'air') heading.push(car);
    }
    ticks++;
    accumulator -= TICK;
  }
  renderLive();
  stage.sync(car, { ...settings, heading: currentHeading() });
  stage.render();
  requestAnimationFrame(frame);
}
setMode('loop');
setSource('panel');
requestAnimationFrame(frame);
