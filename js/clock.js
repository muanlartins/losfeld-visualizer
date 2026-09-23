// Losfeld's clock: the stick circles at full deflection, kept exactly in time with the car's roll.
export const TEMPOS = { clock: 1, double: 2, triple: 3 };
export const CLOCKWISE = -1;
export const COUNTERCLOCKWISE = 1;
// Getting back in time with 'jump': a quick sweep forward, like a thumb flicking round the rim.
const RETURN_TICKS = 4;
const TURN = 2 * Math.PI;

// A stick turning the same way as the car keeps its push pointing one way in the world, and the car turns
// hard: the video's reverse clock. Turning against the car, the push averages out and the car goes straight.
export const turnsWithRoll = (turn, airRoll) => turn * airRoll < 0;

export const clockName = ({ turn, tempo }, airRoll) =>
  `${turnsWithRoll(turn, airRoll) ? 'reverse ' : ''}${tempo === 'clock' ? '' : `${tempo} `}clock`;

const mod = (a, n) => ((a % n) + n) % n;

// Plays a clock, and one move on it at a time. `start` is the stick angle the clock starts from (0 = far right,
// π/2 = up) and `turn` its direction. The stick's travel round the clock, in radians, is `tempo` circles per car
// revolution: a move makes it fall behind by `lag` and then get back in time.
//
// A move { at, circle, hold } holds the stick still for `hold` ticks once it reaches angle `at` in circle `circle`
// of a revolution (circle 0 starts as the car starts a revolution). With `reverse` in place of `hold`, the stick
// turns the other way for that many ticks instead, one circle per revolution whatever the tempo: that turns with
// the car, a stretch of the video's reverse clock. Then `resume` 'jump' sweeps it straight to where the clock is,
// and 'catch' turns it twice as fast until it has caught up (the video's "catching the clock").
export function createClockPlayer(clock, state = { lag: 0, last: null, move: null }) {
  const { start, turn, tempo } = clock;
  const circles = TEMPOS[tempo];
  // How fast the stick falls behind while reversing, per unit of clock travel.
  const backwards = 1 + 1 / circles;
  let { lag, last, move } = state;
  let current = state.current ?? { x: Math.cos(start), y: Math.sin(start) };

  // Once the move's revolution is settled, the clock travel at which it starts.
  function trigger(travel) {
    const offset = mod(turn * (move.at - start), TURN) + TURN * move.circle;
    move.revolution = Math.max(move.revolution, Math.ceil((travel - lag - offset) / (TURN * circles)));
    return TURN * circles * move.revolution + offset + lag;
  }

  return {
    // Plays `move` in revolution `revolution`, counted from 0, or in the first one after it that it can still reach.
    // `move.revolution` then says which one that was.
    queue(next, revolution = 0) {
      move = { resume: 'jump', ...next, revolution, phase: 'waiting', trigger: null };
    },
    // A player that carries on from here with the move under way, if any, but not one still waiting to start.
    fork() {
      const going = move && move.phase !== 'waiting' ? { ...move } : null;
      return createClockPlayer(clock, { lag, last, move: going, current });
    },
    get move() {
      return move;
    },
    // Where the stick was put on the last tick.
    get current() {
      return current;
    },
    // Call once per tick, before stepping the car.
    stick(car) {
      const travel = circles * Math.abs(car.rolled);
      const step = last === null ? 0 : travel - last;
      last = travel;

      const holding = () => move?.phase === 'hold' || move?.phase === 'reverse';
      if (move?.phase === 'waiting') {
        move.trigger ??= trigger(travel);
        if (travel >= move.trigger) {
          move.phase = move.reverse ? 'reverse' : 'hold';
          move.ticks = move.reverse ?? move.hold;
          // Starts exactly at `at`, even though this tick's travel went a little past it.
          lag += (travel - move.trigger) * (move.reverse ? backwards : 1);
        }
      } else if (holding()) {
        lag += move.phase === 'hold' ? step : backwards * step;
      } else if (move?.phase === 'jump' || move?.phase === 'catch') {
        lag = Math.max(0, lag - (move.phase === 'jump' ? move.returnStep : step));
        if (lag === 0) move.phase = 'done';
      }
      if (holding() && --move.ticks <= 0) {
        move.phase = move.resume;
        move.returnStep = lag / RETURN_TICKS;
      }

      const angle = start + turn * (travel - lag);
      current = { x: Math.cos(angle), y: Math.sin(angle) };
      return current;
    },
  };
}
