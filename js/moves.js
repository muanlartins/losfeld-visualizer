import { Car, TICK, stickToInputs } from './physics.js';
import { CLOCKWISE, TEMPOS, createClockPlayer } from './clock.js';
import { compare, createHeading } from './heading.js';
import { RECIPES } from './recipes.js';

// Moves played on Losfeld's clock, as combo letters, laid out like the stick: the middle one is the U-turn.
export const MOVES = [
  { name: 'UL', label: 'Up-left' },
  { name: 'U', label: 'Up' },
  { name: 'UR', label: 'Up-right' },
  { name: 'L', label: 'Left' },
  { name: 'UT', label: 'U-turn' },
  { name: 'R', label: 'Right' },
  { name: 'DL', label: 'Down-left' },
  { name: 'D', label: 'Down' },
  { name: 'DR', label: 'Down-right' },
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
// As in tools/recipes.mjs: air roll left, the move in the third revolution, measured 1.5 s after it.
export const AIR_ROLL = -1;
const REVOLUTION = 2;
const MEASURE_AFTER = Math.round(1.5 / TICK);
const REPLAY_AFTER = Math.round(3 / TICK);

export const recipeFor = ({ tempo, resume, name }) => RECIPES[tempo][resume][name] ?? null;

// Plays one move on the clock from a level car, next to a ghost car that plays the same clock without it.
// The move's result is how far the car's heading ends up from the ghost's.
export function createWalkthrough({ tempo, resume, name }) {
  const recipe = recipeFor({ tempo, resume, name });
  const clock = createClockPlayer({ start: 0, turn: CLOCKWISE, tempo });
  if (recipe) {
    const { notch, circle, hold, reverse } = recipe;
    clock.queue({ at: NOTCH_ANGLES[notch], circle, hold, reverse, resume }, REVOLUTION);
  }
  const ghost = new Car();
  ghost.reset({ pinned: true });
  const ghostClock = createClockPlayer({ start: 0, turn: CLOCKWISE, tempo });
  const ghostHeading = createHeading();
  let doneFor = 0;
  let result = null;

  return {
    recipe,
    circles: TEMPOS[tempo],
    // Where the move starts within a revolution, from 0 to 1 (0 = the car starts a revolution).
    at: recipe ? (recipe.circle + ((2 * Math.PI - NOTCH_ANGLES[recipe.notch]) % (2 * Math.PI)) / (2 * Math.PI)) / TEMPOS[tempo] : null,
    get phase() {
      return clock.move?.phase ?? 'clock';
    },
    get result() {
      return result;
    },
    get over() {
      return doneFor > REPLAY_AFTER;
    },
    ghostHeading: () => ghostHeading.get(),
    controls(car) {
      ghost.step({ ...stickToInputs(ghostClock.stick(ghost), AIR_ROLL), jump: false, boost: false });
      ghostHeading.push(ghost);
      return { ...stickToInputs(clock.stick(car), AIR_ROLL), jump: false, boost: false };
    },
    // Call after the car has stepped, with its heading.
    measure(heading) {
      if (!recipe || clock.move.phase !== 'done') return;
      doneFor++;
      if (doneFor === MEASURE_AFTER) result = compare(ghostHeading.get(), heading.get());
    },
  };
}
