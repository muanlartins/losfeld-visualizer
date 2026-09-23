import { TICK } from './physics.js';
import { angles } from './heading.js';
import { comboPlot } from './combo-plot.js';
import { MOVES, NOTCH_ANGLES, recipeFor } from './moves.js';

// The Moves panel. The pad builds a combo; the combo is recorded once and watched back and forth on a timeline. For
// the frame under the playhead it shows the move playing, its steps, the stick with where it freezes, the car's
// revolution with where the stick was held and where it went back in time, and the move's before and after.
const GATE = 44;
const COUNT = ['', 'once', 'twice', 'three times'];
const MAX_MOVES = 8;
const PLOT = 50;
const PHASE_STEP = { waiting: 0, hold: 1, reverse: 1, jump: 2, catch: 2, done: 3 };
const RESUME_HINTS = {
  jump: 'When the hold ends, flick the stick round to where the clock is by now. How long you hold sets how far the car turns.',
  catch:
    'When the hold ends, carry on from where you stopped, twice as fast, until you are back in time. Catching up keeps the stick behind the clock for as long again, and that pushes the car too, so the same hold turns it further and in another direction.',
};

const onGate = (angle, r = GATE) => [Math.cos(angle) * r, -Math.sin(angle) * r].map((v) => v.toFixed(1));
const ms = (ticks) => (ticks * TICK >= 1 ? `${(ticks * TICK).toFixed(2)} s` : `${Math.round(ticks * TICK * 1000)} ms`);
const degrees = (v) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : ' '}${Math.abs(v).toFixed(1)}°`;
const label = (name) => MOVES.find((m) => m.name === name).label;
const percent = (v) => `${(v * 100).toFixed(2)}%`;

export const describeChange = ({ right, up }) =>
  `${Math.abs(right).toFixed(1)}° ${right < 0 ? 'left' : 'right'}, ${Math.abs(up).toFixed(1)}° ${up < 0 ? 'down' : 'up'}`;

const STICK_SVG = `
  <circle class="gate" r="${GATE}"/>
  ${Object.values(NOTCH_ANGLES).map((a) => `<circle class="notch" r="2" cx="${onGate(a)[0]}" cy="${onGate(a)[1]}"/>`).join('')}
  <path class="way" d="M ${onGate(1.45, 53)} A 53 53 0 0 1 ${onGate(0.55, 53)}"/>
  <path class="way-head" d="M ${onGate(0.62, 49)} L ${onGate(0.52, 53)} L ${onGate(0.62, 57)}"/>
  <circle class="freeze" r="7"/>
  <circle class="live" r="7"/>`;

const PLOT_SVG = `
<svg class="combo-plot" viewBox="-62 -62 124 124" aria-hidden="true">
  <circle class="ring" r="${PLOT}"/><circle class="ring" r="${PLOT / 2}"/>
  <line class="cross" x1="-${PLOT}" x2="${PLOT}"/><line class="cross" y1="-${PLOT}" y2="${PLOT}"/>
  <text class="edge" x="${PLOT + 3}" y="3">R</text><text class="edge" x="${-PLOT - 3}" y="3" text-anchor="end">L</text>
  <text class="edge" y="${-PLOT - 3}" text-anchor="middle">U</text><text class="edge" y="${PLOT + 9}" text-anchor="middle">D</text>
  <text class="range" x="${(PLOT * 0.72).toFixed(1)}" y="${(-PLOT * 0.72).toFixed(1)}"></text>
  <polyline class="trail"/>
  <g class="moves"></g>
  <circle class="live" r="3.5"/>
</svg>
<div class="compare-text"></div>`;

const TIMELINE = `
<div class="lane"><div class="blocks"></div><div class="paint"></div><i class="head"></i>
  <input type="range" min="0" step="1" value="0" aria-label="Timeline"></div>
<div class="transport">
  <button data-go="revolution:-1" aria-label="Previous revolution" title="Previous revolution (Shift + ←)">⏮</button>
  <button data-go="tick:-1" aria-label="Back one tick" title="Back one tick (←)">‹</button>
  <button data-go="play" class="play" aria-label="Play" title="Play or pause (Space)">▶</button>
  <button data-go="tick:1" aria-label="Forward one tick" title="Forward one tick (→)">›</button>
  <button data-go="revolution:1" aria-label="Next revolution" title="Next revolution (Shift + →)">⏭</button>
  <label class="pace" title="Speed, the same as the slider below">Speed <select>
    ${[0.05, 0.1, 0.25, 0.5, 1].map((v) => `<option value="${v}">${v}×</option>`).join('')}</select></label>
</div>`;

// A move's steps, one per phase of it.
function stepsFor(settings, slot, circles) {
  const clock = `circle the stick clockwise, ${COUNT[circles]} per car revolution, in time with it`;
  if (!slot.recipe) {
    return [
      slot.missing
        ? `No single freeze gives ${label(slot.name).toLowerCase()} on this clock, so this revolution is just the clock: ${clock}.`
        : `Neutral: just the clock. ${clock[0].toUpperCase()}${clock.slice(1)}, and the car goes on as it was.`,
    ];
  }
  const { notch, circle, hold, reverse } = slot.recipe;
  const where = circles > 1 ? ` in circle ${circle + 1} of ${circles}` : '';
  return [
    `Clock until the stick reaches <b>${notch.toLowerCase()}</b>${where}.`,
    reverse ? `Turn it back anticlockwise, with the car, for <b>${ms(reverse)}</b>.` : `Hold it there for <b>${ms(hold)}</b>.`,
    settings.resume === 'jump' ? 'Flick it round to where the clock is now.' : 'Turn it twice as fast until you are back in time.',
    'Clock on to the end of the revolution.',
  ];
}

const segmentsHtml = (segments, from, length) =>
  segments
    .filter((s) => s.to >= from && s.from < from + length)
    .map((s) => {
      const left = (Math.max(s.from, from) - from) / length;
      const right = (Math.min(s.to, from + length) - from) / length;
      return `<em class="${s.kind}" style="left:${percent(left)};width:${percent(right - left)}"></em>`;
    })
    .join('');

export function createMovePanel(elements, actions) {
  const { pad, combo, timeline, total, stick, steps, revolution, resumeHint, hint } = elements;
  pad.innerHTML = MOVES.map(
    (m) => `<button data-move="${m.name}" aria-label="Add ${m.label}"><b>${m.name}</b><span>${m.label}</span></button>`,
  ).join('');
  pad.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => actions.onAdd(b.dataset.move)));
  elements.undo.addEventListener('click', actions.onUndo);
  elements.clear.addEventListener('click', actions.onClear);

  timeline.innerHTML = TIMELINE;
  const lane = {
    blocks: timeline.querySelector('.blocks'),
    paint: timeline.querySelector('.paint'),
    head: timeline.querySelector('.head'),
    scrub: timeline.querySelector('input'),
    play: timeline.querySelector('.play'),
    clock: elements.clock,
  };
  lane.scrub.addEventListener('input', () => actions.onSeek(Number(lane.scrub.value)));
  lane.pace = timeline.querySelector('.pace select');
  lane.pace.addEventListener('change', () => actions.onSpeed(Number(lane.pace.value)));
  timeline.querySelectorAll('[data-go]').forEach((button) =>
    button.addEventListener('click', () => {
      const [kind, by] = button.dataset.go.split(':');
      if (kind === 'play') actions.onToggle();
      else if (kind === 'tick') actions.onStep(Number(by));
      else actions.onRevolution(Number(by));
    }),
  );
  combo.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-slot]');
    if (chip) actions.onSlot(Number(chip.dataset.slot));
  });

  stick.innerHTML = STICK_SVG;
  const freeze = stick.querySelector('.freeze');
  const live = stick.querySelector('.live');
  revolution.innerHTML = `
    <div class="track"><span></span><span></span><span></span><b class="paint"></b><i class="mark"></i><i class="head"></i></div>
    <div class="poses"><span>Upright</span><span>Belly up</span><span>Upright</span></div>
    <p class="count"></p>`;
  const bar = {
    circles: revolution.querySelectorAll('.track span'),
    paint: revolution.querySelector('.paint'),
    mark: revolution.querySelector('.mark'),
    head: revolution.querySelector('.head'),
    count: revolution.querySelector('.count'),
  };
  elements.compare.innerHTML = PLOT_SVG;
  const plot = {
    trail: elements.compare.querySelector('.trail'),
    moves: elements.compare.querySelector('.moves'),
    live: elements.compare.querySelector('.live'),
    range: elements.compare.querySelector('.range'),
    text: elements.compare.querySelector('.compare-text'),
  };

  let shownFor = null;
  let shown = {};
  const write = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
  };
  const once = (key, value, draw) => {
    if (shown[key] === value) return;
    shown[key] = value;
    draw();
  };

  // Everything that stays put while the recording plays: the pad, the chips, the timeline's blocks and the plot's moves.
  function describe(settings, recording) {
    const { slots, frames, segments } = recording;
    pad.querySelectorAll('[data-move]').forEach((b) => {
      const missing = recipeFor({ ...settings, name: b.dataset.move }) === undefined;
      b.classList.toggle('missing', missing);
      b.disabled = missing || settings.names.length >= MAX_MOVES;
    });
    elements.undo.disabled = elements.clear.disabled = !settings.names.length;
    total.textContent = recording.total ? describeChange(recording.total) : '';

    combo.innerHTML =
      '<li class="chip start" data-slot="-1"><b>Start</b><small>spin up</small></li>' +
      slots
        .map((slot, i) => {
          const { right, up, angle } = slot.change;
          const turn = (-Math.atan2(up, right) * 180) / Math.PI;
          const result = angle < 0.5 ? '0°' : `<i class="arrow" style="transform: rotate(${turn.toFixed(0)}deg)"></i>${angle.toFixed(1)}°`;
          const late = slot.late ? ' title="A revolution late: the move before was still going when its freeze came round."' : '';
          return `<li class="chip${slot.missing ? ' missing' : ''}${slot.late ? ' late' : ''}" data-slot="${i}"${late}><b>${slot.name}</b><small>${result}</small></li>`;
        })
        .join('');

    const length = frames.at(-1).turns;
    const at = (turns) => percent(turns / length);
    const lastEnd = slots.at(-1)?.end ?? 1;
    const block = (from, to, text, i) => `<span data-block="${i}" style="left:${at(from)};width:${at(to - from)}">${text}</span>`;
    lane.blocks.innerHTML =
      block(0, 1, 'Start', -1) +
      slots.map((slot, i) => block(slot.start, slot.end, slot.name, i)).join('') +
      block(lastEnd, length, 'clock', slots.length) +
      Array.from({ length: Math.floor(length) }, (_, i) => `<i style="left:${at(i + 1)}"></i>`).join('');
    lane.paint.innerHTML = segmentsHtml(segments, 0, length);
    lane.scrub.max = String(frames.length - 1);

    bar.circles.forEach((span, i) => (span.hidden = i >= recording.circles));
    resumeHint.textContent = RESUME_HINTS[settings.resume];
    hint.textContent = settings.names.length
      ? 'Each move is measured against playing just the clock in its place: where the car goes on to, in both, over the revolution after next.'
      : 'Add moves from the pad: each one takes a revolution of the car.';
    hint.textContent += ' Keys: Space plays or pauses, ← → step a tick, Shift + ← → a revolution.';

    shown.plot = recording.origin ? comboPlot(recording, PLOT) : null;
    plot.range.textContent = shown.plot ? `${shown.plot.range}°` : '';
    plot.moves.innerHTML = shown.plot?.moves ?? '';
  }

  // The move under the playhead: its before and after, or the combo's total once it's over.
  function describeSlot(recording, index) {
    const slot = recording.slots[index];
    shown.plot?.highlight(plot.moves, index);
    if (!slot) {
      plot.text.innerHTML =
        index < 0
          ? '<p class="hint">Spinning up. Each move\'s before and after shows here as the playhead reaches it.</p>'
          : recording.total
            ? `<h3>Whole combo</h3><p class="change">${describeChange(recording.total)}</p><p class="hint">Against playing just the clock all along.</p>`
            : '<p class="hint">Add moves from the pad.</p>';
      return;
    }
    const [before, after] = [angles(slot.before), angles(slot.after)];
    const name = slot.recipe ? label(slot.name) : slot.missing ? `${label(slot.name)}, not on this clock` : 'Neutral';
    plot.text.innerHTML = `
      <h3>${slot.name} · ${name}</h3>
      <table>
        <thead><tr><th></th><th>Yaw</th><th>Pitch</th></tr></thead>
        <tbody>
          <tr><th>Before</th><td>${degrees(before.yaw)}</td><td>${degrees(before.pitch)}</td></tr>
          <tr class="after"><th>After</th><td>${degrees(after.yaw)}</td><td>${degrees(after.pitch)}</td></tr>
        </tbody>
      </table>
      <p class="change">${slot.change.angle < 0.05 ? 'No change' : describeChange(slot.change)}</p>`;
  }

  return {
    render(settings, recording, tick, playing, speed) {
      if (shownFor !== recording) {
        shownFor = recording;
        shown = {};
        describe(settings, recording);
      }
      const { frames, slots, segments } = recording;
      const frame = frames[tick];
      const slot = slots[frame.index] ?? null;
      const length = frames.at(-1).turns;

      // Timeline
      lane.head.style.left = percent(frame.turns / length);
      if (document.activeElement !== lane.scrub) lane.scrub.value = String(tick);
      once('playing', playing, () => {
        lane.play.textContent = playing ? '❚❚' : '▶';
        lane.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      });
      write(lane.clock, `${(tick * TICK).toFixed(2)} s · tick ${tick}`);
      once('speed', speed, () => {
        const option = [...lane.pace.options].find((o) => Number(o.value) === speed);
        if (!option) lane.pace.add(new Option(`${speed}×`, speed));
        lane.pace.value = String(speed);
      });
      once('index', frame.index, () => {
        combo.querySelectorAll('.chip').forEach((chip) => {
          const i = Number(chip.dataset.slot);
          chip.classList.toggle('now', i === frame.index);
          chip.classList.toggle('done', i < frame.index);
        });
        lane.blocks.querySelectorAll('[data-block]').forEach((b) => b.classList.toggle('now', Number(b.dataset.block) === frame.index));
        const lines =
          frame.index < 0
            ? ['Spin up: air roll left, and start the clock from far right as the car starts to roll.']
            : slot
              ? stepsFor(settings, slot, recording.circles)
              : ['Combo done. The clock carries on while the heading catches up, then the combo plays again.'];
        steps.innerHTML = lines.map((text) => `<li>${text}</li>`).join('');
        steps.classList.toggle('single', lines.length === 1);
        freeze.style.display = slot?.recipe ? '' : 'none';
        if (slot?.recipe) {
          const [fx, fy] = onGate(NOTCH_ANGLES[slot.recipe.notch]);
          freeze.setAttribute('cx', fx);
          freeze.setAttribute('cy', fy);
        }
        describeSlot(recording, frame.index);
        shown.step = null;
      });
      const step = slot?.recipe ? PHASE_STEP[frame.phase] ?? 0 : 0;
      once('step', step, () => steps.querySelectorAll('li').forEach((li, i) => li.classList.toggle('now', i === step)));

      // The stick
      live.setAttribute('cx', (frame.controls.yaw * GATE).toFixed(1));
      live.setAttribute('cy', (frame.controls.pitch * GATE).toFixed(1));
      live.classList.toggle('held', frame.phase === 'hold' || frame.phase === 'reverse');

      // This revolution, with where the stick was held and where it went back in time.
      const floor = Math.min(Math.floor(frame.turns), Math.floor(length));
      bar.head.style.left = percent(frame.turns - floor);
      once('revolution', floor, () => {
        bar.paint.innerHTML = segmentsHtml(segments, floor, 1);
        const freezes = slots.filter((s) => s.freezeAt !== undefined && Math.floor(s.freezeAt) === floor);
        bar.mark.hidden = !freezes.length;
        if (freezes.length) bar.mark.style.left = percent(freezes[0].freezeAt - floor);
        const inRevolution = slots.find((s) => s.start <= floor && floor < s.end);
        bar.count.textContent = floor < 1 ? 'Revolution 1 · spin up' : `Revolution ${floor + 1} · ${inRevolution ? inRevolution.name : 'just the clock'}`;
      });

      // The plot: the heading's trail up to now, and where it is now.
      once('trail', tick, () => {
        plot.trail.setAttribute('points', shown.plot?.trail(tick) ?? '');
        const at = shown.plot?.live(tick);
        plot.live.style.display = at ? '' : 'none';
        if (at) {
          plot.live.setAttribute('cx', at[0]);
          plot.live.setAttribute('cy', at[1]);
        }
      });
    },
  };
}
