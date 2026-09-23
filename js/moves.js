import { Car, TICK, stickToInputs } from './physics.js';
import { CLOCKWISE, TEMPOS, createClockPlayer } from './clock.js';
import { compare, createHeading } from './heading.js';
import { RECIPES } from './recipes.js';

// Moves played on Losfeld's clock, as combo letters. The pad is laid out like the stick: neutral in the middle,
// which is just the clock, and the U-turn under it.
export const MOVES = [
  { name: 'UL', label: 'Up-left' },
  { name: 'U', label: 'Up' },
  { name: 'UR', label: 'Up-right' },
  { name: 'L', label: 'Left' },
  { name: 'N', label: 'Neutral' },
  { name: 'R', label: 'Right' },
  { name: 'DL', label: 'Down-left' },
  { name: 'D', label: 'Down' },
  { name: 'DR', label: 'Down-right' },
  { name: 'UT', label: 'U-turn' },
];
export const NOTCH_ANGLES = {
  Right: 0,
  'Upper right': Math.PI / 4,
  Up: Math.PI / 2,
  'Upper left': (3 * Math.PI) / 4,
  Left: Math.PI,
  'Lower left': (5 * Math.PI) / 4,
  Down: (3 * Math.PI) / 2,
  'Lower right': (7 * Math.PI) / 4,
};
// As in tools/recipes.mjs: air roll left, a clock that starts far right, and one revolution to spin up first.
export const AIR_ROLL = -1;
export const START_REVOLUTIONS = 1;
// After the last move, the clock carries on while the live heading catches up, then the combo plays again.
const TAIL_REVOLUTIONS = 2;
const TURN = 2 * Math.PI;
// Only a runaway look-ahead gets anywhere near this.
const LOOK_AHEAD_TICKS = Math.round(30 / TICK);

// The move for a letter on this clock, or null for neutral. A letter with no freeze on this clock is `undefined`.
export const recipeFor = ({ tempo, resume, name }) => (name === 'N' ? null : RECIPES[tempo][resume][name]);

export const clockMove = (recipe, resume) => ({
  at: NOTCH_ANGLES[recipe.notch],
  circle: recipe.circle,
  hold: recipe.hold,
  reverse: recipe.reverse,
  resume,
});

const turnsOf = (car) => Math.abs(car.rolled) / TURN;

// Plays a copy of `from` on with the plain clock, and returns its heading once it has rolled `until` revolutions:
// the nose averaged over the revolution before that.
export function lookAhead(from, until) {
  const car = from.car.clone();
  const clock = from.clock.fork();
  const heading = createHeading();
  for (let tick = 0; turnsOf(car) < until && tick < LOOK_AHEAD_TICKS; tick++) {
    car.step({ ...stickToInputs(clock.stick(car), AIR_ROLL), jump: false, boost: false });
    heading.push(car);
  }
  return heading.get();
}

// Plays a combo on the clock, one move per revolution. `slots` are { name, move }, with `move` the clock move or
// null to just carry on with the clock. Each move is played in the revolution after the one before it, or, when the
// one before is still going as its freeze comes round, in the first revolution after that it can still make (`late`).
//
// Each slot is measured before and after: from where the car was as its revolution started and from where it is as
// the next one starts, the plain clock is played on in a copy of the car, and the two headings are read over the
// same revolution, the second after the slot. So `change` is what the move did, against doing nothing in its place.
export function playSlots({ tempo, resume }, slots) {
  const clock = createClockPlayer({ start: 0, turn: CLOCKWISE, tempo });
  const played = slots.map((slot) => ({ ...slot, start: null, end: null, late: false, before: null, after: null, change: null }));
  const segments = [];
  // The car and clock as the car turned upright, by revolution, to look ahead from.
  const uprights = new Map();
  // The slot playing now: -1 while spinning up, played.length once the combo is over.
  let index = -1;
  // The first slot whose revolution isn't known yet.
  let planned = 0;
  // Where the car goes with just the clock, from where the first move's revolution starts: what the combo turns from.
  let origin = null;
  // The whole combo against the plain clock, measured like a slot once the last one ends.
  let total = null;
  let turnsNow = 0;

  // Works out which revolution each slot plays in, queueing each move once the one before it is done.
  function plan() {
    while (planned < played.length) {
      const slot = played[planned];
      const wanted = planned ? played[planned - 1].start + 1 : START_REVOLUTIONS;
      if (slot.move) {
        if (clock.move?.slot !== slot) {
          if (clock.move && clock.move.phase !== 'done') return;
          clock.queue({ ...slot.move, slot }, wanted);
        }
        // The clock settles the revolution on its next tick.
        if (clock.move.trigger === null) return;
      }
      slot.start = slot.move ? clock.move.revolution : wanted;
      slot.late = slot.start > wanted;
      planned++;
    }
  }

  // The last slot ends at the first upright after its move is done.
  function lastEnd() {
    const slot = played.at(-1);
    if (!slot) return START_REVOLUTIONS;
    if (!slot.move) return slot.start === null ? null : slot.start + 1;
    return slot.doneAt === undefined ? null : Math.max(slot.start + 1, Math.floor(slot.doneAt) + 1);
  }

  function finish(slot, end) {
    const until = end + 2;
    slot.end = end;
    slot.before = lookAhead(uprights.get(slot.start), until);
    slot.after = lookAhead(uprights.get(end), until);
    slot.change = compare(slot.before, slot.after);
  }

  // Moves on to the next slot once the car has turned into its revolution, measuring the one it leaves.
  function advance() {
    if (index >= played.length) return;
    const next = index + 1;
    const start = next < played.length ? played[next].start : lastEnd();
    if (start === null || turnsNow < start) return;
    if (index >= 0) finish(played[index], start);
    else if (played.length) origin = lookAhead(uprights.get(start), start + 2);
    if (next === played.length && played.length) {
      total = compare(lookAhead(uprights.get(played[0].start), start + 2), played.at(-1).after);
    }
    index = next;
  }

  function paint() {
    const phase = clock.move?.phase;
    const kind = phase === 'hold' || phase === 'reverse' ? 'hold' : phase === 'jump' || phase === 'catch' ? 'back' : null;
    const last = segments.at(-1);
    if (kind && last?.kind === kind && last.open) last.to = turnsNow;
    else if (kind) segments.push({ kind, from: turnsNow, to: turnsNow, open: true });
    if (!kind && last) last.open = false;
    if (phase === 'done') clock.move.slot.doneAt ??= turnsNow;
  }

  return {
    slots: played,
    uprights,
    segments,
    circles: TEMPOS[tempo],
    get index() {
      return index;
    },
    get turns() {
      return turnsNow;
    },
    get origin() {
      return origin;
    },
    get total() {
      return total;
    },
    get over() {
      return index >= played.length && turnsNow >= lastEnd() + TAIL_REVOLUTIONS;
    },
    // The slot playing now, the phase of its move ('waiting', 'hold', 'reverse', 'jump', 'catch' or 'done') and,
    // once known, how far into the combo, in revolutions, the stick freezes.
    get now() {
      const slot = played[index] ?? null;
      const move = slot && clock.move?.slot === slot ? clock.move : null;
      return {
        slot,
        phase: move?.phase ?? null,
        freezeAt: move?.trigger != null ? move.trigger / (TURN * TEMPOS[tempo]) : null,
      };
    },
    // Call once per tick, before stepping the car.
    controls(car) {
      turnsNow = turnsOf(car);
      if (!uprights.has(Math.floor(turnsNow))) uprights.set(Math.floor(turnsNow), { car: car.clone(), clock: clock.fork() });
      plan();
      advance();
      const stick = clock.stick(car);
      paint();
      return { ...stickToInputs(stick, AIR_ROLL), jump: false, boost: false };
    },
  };
}

export function createCombo({ tempo, resume, names }) {
  const slots = names.map((name) => {
    const recipe = recipeFor({ tempo, resume, name });
    return { name, recipe: recipe ?? null, missing: recipe === undefined, move: recipe ? clockMove(recipe, resume) : null };
  });
  return playSlots({ tempo, resume }, slots);
}

// Plays the whole combo once, from a level car, and keeps every tick of it, so it can be watched back and forth.
// Each frame has the car's state, the heading, how far it has turned from where the combo started, and where the
// combo was. `uprights` are the frames where the car turns upright, one per revolution.
export function recordCombo(settings) {
  const car = new Car();
  car.reset({ pinned: true });
  const player = createCombo(settings);
  const heading = createHeading();
  const frames = [];
  // Each frame is the car as it is on a tick, with the controls it gets on that tick.
  while (!player.over && frames.length < LOOK_AHEAD_TICKS) {
    const controls = player.controls(car);
    const { slot, phase, freezeAt } = player.now;
    if (slot && freezeAt !== null) slot.freezeAt ??= freezeAt;
    frames.push({
      orientation: car.orientation.clone(),
      omega: car.omega.clone(),
      rolled: car.rolled,
      controls,
      heading: heading.get(),
      turns: player.turns,
      index: player.index,
      phase,
      freezeAt,
    });
    car.step(controls);
    heading.push(car);
  }
  const { origin } = player;
  for (const frame of frames) frame.turned = origin && frame.heading ? compare(origin, frame.heading) : null;
  const uprights = frames.flatMap((frame, i) => (i && Math.floor(frame.turns) > Math.floor(frames[i - 1].turns) ? [i] : []));
  return {
    frames,
    uprights,
    slots: player.slots,
    segments: player.segments,
    circles: player.circles,
    origin,
    total: player.total,
  };
}
