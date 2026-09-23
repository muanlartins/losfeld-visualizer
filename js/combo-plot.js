import { compare } from './heading.js';

// A recorded combo drawn as how far right and up the car has turned from where the combo started (the plain clock
// from the first move's revolution on), zoomed once to fit the whole combo so it stays put while scrubbing. The
// trail starts with the first move: while the car spins up, the heading comes in from further out, on the rim.
const RANGES = [15, 30, 45, 60, 90, 120, 180];
const TRAIL_EVERY = 3;

export function comboPlot(recording, radius) {
  const { frames, slots, origin } = recording;
  const turned = (direction) => {
    const { right, up } = compare(origin, direction);
    return [right, up];
  };
  const from = recording.uprights[0] ?? 0;
  const widest = Math.max(
    0,
    ...frames.slice(from).flatMap((f) => (f.turned ? [f.turned.right, f.turned.up] : [])).map(Math.abs),
    ...slots.flatMap((slot) => [...turned(slot.before), ...turned(slot.after)]).map(Math.abs),
  );
  const range = RANGES.find((r) => widest * 1.15 <= r) ?? RANGES.at(-1);
  const place = ([right, up]) => {
    const scale = Math.min(1, range / Math.hypot(right, up)) * (radius / range);
    return [right * scale, -up * scale].map((v) => v.toFixed(1));
  };

  return {
    range,
    at: (direction) => place(turned(direction)),
    // Each move as a line from before to after, labelled with its letter.
    moves: slots
      .map((slot, i) => {
        const [x1, y1] = place(turned(slot.before));
        const [x2, y2] = place(turned(slot.after));
        const start = i ? '' : `<circle class="start" r="2.5" cx="${x1}" cy="${y1}"/>`;
        return `${start}<g data-move-line="${i}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><circle r="2.5" cx="${x2}" cy="${y2}"/><text x="${x2}" y="${(Number(y2) - 5).toFixed(1)}">${slot.name}</text></g>`;
      })
      .join(''),
    // The heading's trail from the first move up to `tick`, as polyline points.
    trail(tick) {
      const points = [];
      for (let i = from; i <= tick; i += TRAIL_EVERY) if (frames[i].turned) points.push(place([frames[i].turned.right, frames[i].turned.up]).join(','));
      return points.join(' ');
    },
    live: (tick) => (frames[tick].turned ? place([frames[tick].turned.right, frames[tick].turned.up]) : null),
    highlight: (root, index) => root.querySelectorAll('[data-move-line]').forEach((g) => g.classList.toggle('now', Number(g.dataset.moveLine) === index)),
  };
}
