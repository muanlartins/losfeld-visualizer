// Finds, for each clock tempo and way of getting back in time, the freeze that moves the car's heading a little in
// each direction, and the reverse that turns it round. Plays each candidate as a one-move combo with the page's own
// physics, clock and measurement (js/moves.js), then writes js/recipes.js.
//
//   npm install && npm run recipes
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { Car } from '../js/physics.js';
import { TEMPOS } from '../js/clock.js';
import { compare } from '../js/heading.js';
import { NOTCH_ANGLES, lookAhead, playSlots } from '../js/moves.js';

const SLIGHT = 10;
const SETTLED_WITHIN = 1;
export const MOVES = { R: 0, UR: 45, U: 90, UL: 135, L: 180, DL: 225, D: 270, DR: 315 };
const PAIRS = [['R', 'L'], ['U', 'D'], ['UR', 'DL'], ['UL', 'DR']];
const HOLDS = Array.from({ length: 17 }, (_, i) => 4 + 2 * i);
const REVERSES = Array.from({ length: 80 }, (_, i) => 12 + 4 * i);
const deg = THREE.MathUtils.radToDeg;

// What the move does, as the page measures it, and whether the heading has stopped moving a revolution later.
function effect(tempo, resume, move) {
  const car = new Car();
  car.reset({ pinned: true });
  const combo = playSlots({ tempo, resume }, [{ name: 'try', move }]);
  while (!combo.over) car.step(combo.controls(car));
  const [slot] = combo.slots;
  const until = slot.end + 3;
  const later = compare(lookAhead(combo.uprights.get(slot.start), until), lookAhead(combo.uprights.get(slot.end), until));
  const { change } = slot;
  return { ...change, direction: deg(Math.atan2(change.up, change.right)), settled: Math.abs(change.angle - later.angle) < SETTLED_WITHIN };
}

const angleGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

const recipes = {};
for (const tempo of Object.keys(TEMPOS)) {
  recipes[tempo] = {};
  for (const resume of ['jump', 'catch']) {
    const tried = [];
    for (let circle = 0; circle < TEMPOS[tempo]; circle++) {
      for (const [notch, at] of Object.entries(NOTCH_ANGLES)) {
        for (const hold of HOLDS) tried.push({ notch, circle, hold, ...effect(tempo, resume, { at, circle, hold, resume }) });
      }
    }
    const moves = {};
    // Every freeze that ends up within 15° of a move's direction, the closest first.
    const candidates = (name) =>
      tried
        .filter((t) => t.settled && Math.abs(t.angle - SLIGHT) <= 3 && angleGap(t.direction, MOVES[name]) <= 15)
        .map((t) => ({ ...t, gap: angleGap(t.direction, MOVES[name]) }))
        .sort((a, b) => a.gap - b.gap || a.hold - b.hold);
    // On the double clock, opposite moves share a freeze point where they can, one in each circle: four points to
    // learn instead of eight.
    if (TEMPOS[tempo] === 2) {
      for (const [one, other] of PAIRS) {
        const pairs = candidates(one).flatMap((a) =>
          candidates(other)
            .filter((b) => b.notch === a.notch && b.circle !== a.circle)
            .map((b) => [a, b]),
        );
        const [best] = pairs.sort(([a, b], [c, d]) => a.gap + b.gap - (c.gap + d.gap));
        if (best) [moves[one], moves[other]] = best;
      }
    }
    for (const name of Object.keys(MOVES)) moves[name] ??= candidates(name)[0];
    for (const name of Object.keys(MOVES)) if (!moves[name]) delete moves[name];
    // The U-turn: the stick turns back (a stretch of reverse clock) until the heading is as near behind as it gets.
    let uTurn = null;
    for (let circle = 0; circle < TEMPOS[tempo]; circle++) {
      for (const [notch, at] of Object.entries(NOTCH_ANGLES)) {
        for (const reverse of REVERSES) {
          const e = effect(tempo, resume, { at, circle, reverse, resume });
          const closer = !uTurn || e.angle > uTurn.angle + 2 || (Math.abs(e.angle - uTurn.angle) <= 2 && reverse < uTurn.reverse);
          if (e.settled && closer) uTurn = { notch, circle, reverse, ...e };
        }
      }
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
// move that shifts the heading about ${SLIGHT}° each way (or turns it round, UT), played as the first move of a combo
// (air roll left, a clock from far right, after one revolution to spin up). \`result\` is what the page measures for
// it, in degrees.
export const RECIPES = ${JSON.stringify(data, null, 2)};
`,
);
