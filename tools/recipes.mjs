// Finds, for each clock tempo, the freeze that moves the car's heading a little in each direction, and the reverse
// that turns it round. Runs the page's own physics and clock, then writes js/recipes.js.
//
//   npm install && npm run recipes
//
// Every candidate is played from a level car with air roll left: the clock runs for two revolutions, the move
// happens in the third, and the heading is compared with the same clock played without the move.
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { Car, TICK, stickToInputs } from '../js/physics.js';
import { CLOCKWISE, TEMPOS, createClockPlayer } from '../js/clock.js';
import { compare, createHeading } from '../js/heading.js';

const AIR_ROLL = -1;
const REVOLUTION = 2;
const SLIGHT = 10;
const MEASURE_AFTER = 1.5;
const SETTLED_WITHIN = 1;
const NOTCHES = ['Right', 'Upper right', 'Up', 'Upper left', 'Left', 'Lower left', 'Down', 'Lower right'];
export const MOVES = { R: 0, UR: 45, U: 90, UL: 135, L: 180, DL: 225, D: 270, DR: 315 };
const HOLDS = Array.from({ length: 17 }, (_, i) => 4 + 2 * i);
const REVERSES = Array.from({ length: 80 }, (_, i) => 12 + 4 * i);
const deg = THREE.MathUtils.radToDeg;

// Plays the clock with the move, and returns the heading at each of `times` seconds after the move is done.
function play(tempo, move, times) {
  const car = new Car();
  car.reset({ pinned: true });
  const clock = createClockPlayer({ start: 0, turn: CLOCKWISE, tempo });
  clock.queue(move, REVOLUTION);
  const heading = createHeading();
  const seen = [];
  let doneAt = null;
  for (let tick = 0; seen.length < times.length; tick++) {
    const stick = clock.stick(car);
    if (doneAt === null && clock.move.phase === 'done') doneAt = tick;
    car.step({ ...stickToInputs(stick, AIR_ROLL), jump: false, boost: false });
    heading.push(car);
    if (doneAt !== null && tick - doneAt >= Math.round(times[seen.length] / TICK)) seen.push(heading.get());
  }
  return { seen, doneAt };
}

// The unplayed clock, sampled at the same ticks as a move done at `tick`.
const baselines = new Map();
function baseline(tempo, tick, times) {
  const key = `${tempo}:${tick}`;
  if (!baselines.has(key)) {
    const car = new Car();
    car.reset({ pinned: true });
    const clock = createClockPlayer({ start: 0, turn: CLOCKWISE, tempo });
    const heading = createHeading();
    const seen = [];
    for (let t = 0; seen.length < times.length; t++) {
      car.step({ ...stickToInputs(clock.stick(car), AIR_ROLL), jump: false, boost: false });
      heading.push(car);
      if (t - tick >= Math.round(times[seen.length] / TICK)) seen.push(heading.get());
    }
    baselines.set(key, seen);
  }
  return baselines.get(key);
}

// How far the heading moved, seen from behind the unplayed clock's heading: right and up, in degrees.
function effect(tempo, move) {
  const times = [MEASURE_AFTER, MEASURE_AFTER + 1.2];
  const { seen, doneAt } = play(tempo, move, times);
  const base = baseline(tempo, doneAt, times);
  const [change, later] = seen.map((h, i) => compare(base[i], h));
  return { ...change, settled: Math.abs(change.angle - later.angle) < SETTLED_WITHIN };
}

const angleGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

const recipes = {};
for (const tempo of Object.keys(TEMPOS)) {
  recipes[tempo] = {};
  for (const resume of ['jump', 'catch']) {
    const tried = [];
    for (let circle = 0; circle < TEMPOS[tempo]; circle++) {
      NOTCHES.forEach((notch, i) => {
        for (const hold of HOLDS) {
          const move = { at: (i * Math.PI) / 4, circle, hold, resume };
          const e = effect(tempo, move);
          tried.push({ notch, circle, hold, ...e, direction: deg(Math.atan2(e.up, e.right)) });
        }
      });
    }
    const moves = {};
    for (const [name, direction] of Object.entries(MOVES)) {
      const best = tried
        .filter((t) => t.settled && Math.abs(t.angle - SLIGHT) <= 3)
        .sort((a, b) => angleGap(a.direction, direction) - angleGap(b.direction, direction) || a.hold - b.hold)[0];
      if (best && angleGap(best.direction, direction) <= 15) moves[name] = best;
    }
    // The U-turn: the stick turns back (a stretch of reverse clock) until the heading is as near behind as it gets.
    let uTurn = null;
    for (let circle = 0; circle < TEMPOS[tempo]; circle++) {
      NOTCHES.forEach((notch, i) => {
        for (const reverse of REVERSES) {
          const e = effect(tempo, { at: (i * Math.PI) / 4, circle, reverse, resume });
          const closer = !uTurn || e.angle > uTurn.angle + 2 || (Math.abs(e.angle - uTurn.angle) <= 2 && reverse < uTurn.reverse);
          if (e.settled && closer) {
            uTurn = { notch, circle, reverse, ...e, direction: deg(Math.atan2(e.up, e.right)) };
          }
        }
      });
    }
    if (uTurn) moves.UT = uTurn;
    recipes[tempo][resume] = moves;
    console.log(`\n${tempo}, ${resume}:`);
    for (const [name, m] of Object.entries(moves)) {
      const how = m.reverse ? `reverse ${m.reverse} ticks` : `hold ${m.hold} ticks`;
      console.log(`  ${name.padEnd(3)} ${m.notch.padEnd(12)} circle ${m.circle + 1}  ${how.padEnd(18)} → ${m.angle.toFixed(1)}° toward ${m.direction.toFixed(0)}° (right ${m.right.toFixed(1)}, up ${m.up.toFixed(1)})`);
    }
    const missing = Object.keys(MOVES).filter((name) => !moves[name]);
    if (missing.length) console.log(`  no single freeze within 15° for: ${missing.join(', ')}`);
  }
}

const round = (v) => Math.round(v * 10) / 10;
const data = Object.fromEntries(
  Object.entries(recipes).map(([tempo, byResume]) => [
    tempo,
    Object.fromEntries(
      Object.entries(byResume).map(([resume, moves]) => [
        resume,
        Object.fromEntries(
          Object.entries(moves).map(([name, m]) => [
            name,
            {
              notch: m.notch,
              circle: m.circle,
              ...(m.reverse ? { reverse: m.reverse } : { hold: m.hold }),
              result: { right: round(m.right), up: round(m.up), angle: round(m.angle) },
            },
          ]),
        ),
      ]),
    ),
  ]),
);
writeFileSync(
  new URL('../js/recipes.js', import.meta.url),
  `// Generated by tools/recipes.mjs: don't edit by hand. For each clock tempo and way of getting back in time, the
// move that shifts the heading about ${SLIGHT}° each way (or turns it round, UT), played with air roll left in the
// third revolution of a clock that starts far right. \`result\` is what the simulation measured, in degrees.
export const RECIPES = ${JSON.stringify(data, null, 2)};
`,
);
