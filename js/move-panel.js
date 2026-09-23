import { TICK } from './physics.js';
import { MOVES, NOTCH_ANGLES, recipeFor } from './moves.js';

// The walkthrough of one move: the stick with where it freezes, the steps with the current one lit, and a bar
// for the car's revolution with where the move happens in it.
const GATE = 44;
const COUNT = ['', 'once', 'twice', 'three times'];
// How the car sits every 45° into a revolution, rolling left.
const CAR_POSES = ['upright', 'rolling onto its left side', 'on its left side', 'rolling belly up', 'belly up', 'rolling onto its right side', 'on its right side', 'rolling back upright'];
const PHASE_STEP = { waiting: 0, hold: 1, reverse: 1, jump: 2, catch: 2, done: 3 };

const describeResult = ({ right, up, angle }, reverse) =>
  reverse
    ? `turned ${Math.round(angle)}° away from the ghost`
    : `${Math.abs(right).toFixed(1)}° ${right < 0 ? 'left' : 'right'} and ${Math.abs(up).toFixed(1)}° ${up < 0 ? 'down' : 'up'} from the ghost`;

const onGate = (angle, r = GATE) => [Math.cos(angle) * r, -Math.sin(angle) * r].map((v) => v.toFixed(1));

const STICK_SVG = `
  <circle class="gate" r="${GATE}"/>
  ${Object.values(NOTCH_ANGLES).map((a) => `<circle class="notch" r="2" cx="${onGate(a)[0]}" cy="${onGate(a)[1]}"/>`).join('')}
  <path class="way" d="M ${onGate(1.45, 53)} A 53 53 0 0 1 ${onGate(0.55, 53)}"/>
  <path class="way-head" d="M ${onGate(0.62, 49)} L ${onGate(0.52, 53)} L ${onGate(0.62, 57)}"/>
  <circle class="freeze" r="7"/>
  <circle class="live" r="7"/>`;

export function createMovePanel({ pad, stick, steps, revolution, name, hint }, onPick) {
  pad.innerHTML = MOVES.map(
    (m) => `<button role="radio" data-move="${m.name}" aria-checked="false" aria-label="${m.label}"><b>${m.name}</b><span>${m.label}</span></button>`,
  ).join('');
  pad.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.move)));
  stick.innerHTML = STICK_SVG;
  const freeze = stick.querySelector('.freeze');
  const live = stick.querySelector('.live');
  let shownFor = null;
  let lit = null;

  function describe(settings, walkthrough) {
    const move = MOVES.find((m) => m.name === settings.name);
    name.value = `${move.name} · ${move.label}`;
    pad.querySelectorAll('[data-move]').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.move === settings.name));
      b.classList.toggle('missing', !recipeFor({ ...settings, name: b.dataset.move }));
    });
    const { recipe, circles } = walkthrough;
    freeze.style.display = recipe ? '' : 'none';
    revolution.innerHTML = `
      <div class="track">${Array.from({ length: circles }, (_, i) => `<span>Circle ${i + 1}</span>`).join('')}
        ${recipe ? `<i class="mark" style="left:${(walkthrough.at * 100).toFixed(1)}%"></i>` : ''}<i class="head"></i></div>
      <div class="poses"><span>Upright</span><span>Belly up</span><span>Upright</span></div>
      <p class="count"></p>`;
    if (!recipe) {
      steps.innerHTML = '';
      hint.textContent = `No single freeze on a stick notch gives ${move.label.toLowerCase()} on this clock. Try the double or triple clock.`;
      return;
    }
    const [fx, fy] = onGate(NOTCH_ANGLES[recipe.notch]);
    freeze.setAttribute('cx', fx);
    freeze.setAttribute('cy', fy);
    const turned = walkthrough.at * 360;
    const pose = CAR_POSES[Math.round(turned / 45) % 8];
    const ms = (ticks) => `${Math.round(ticks * TICK * 1000)} ms`;
    const where = circles > 1 ? `In circle ${recipe.circle + 1} of ${circles}, when` : 'When';
    const action = recipe.reverse
      ? `turn it back anticlockwise, one circle per revolution, for ${ms(recipe.reverse)}`
      : `hold it there for ${ms(recipe.hold)}`;
    const back = settings.resume === 'jump' ? 'Flick it round to where the clock is now.' : 'Turn it twice as fast until you are back in time.';
    const outcome = describeResult(recipe.result, recipe.reverse);
    steps.innerHTML = [
      `Clock: circle the stick clockwise, ${COUNT[circles]} per car revolution, in time with it.`,
      `${where} the stick reaches <b>${recipe.notch.toLowerCase()}</b> (the car ${Math.round(turned)}° into its revolution, ${pose}), ${action}.`,
      back,
      `Carry on with the clock. The car ends up <b>${outcome}</b>.`,
    ].map((text) => `<li>${text}</li>`).join('');
    hint.textContent = recipe.reverse
      ? 'With air roll held, turning back swings the heading round a cone: it gets about 150° round at most, never fully behind.'
      : 'Air roll left, as in the video. The result is measured against a ghost car that keeps clocking without the move.';
  }

  return {
    render(settings, walkthrough, car) {
      if (shownFor !== walkthrough) {
        shownFor = walkthrough;
        lit = null;
        describe(settings, walkthrough);
      }
      const x = car.controls.yaw;
      const y = -car.controls.pitch;
      live.setAttribute('cx', (x * GATE).toFixed(1));
      live.setAttribute('cy', (-y * GATE).toFixed(1));
      const phase = walkthrough.phase;
      live.classList.toggle('held', phase === 'hold' || phase === 'reverse');

      const step = walkthrough.recipe ? PHASE_STEP[phase] : null;
      if (step !== lit) {
        lit = step;
        steps.querySelectorAll('li').forEach((li, i) => li.classList.toggle('now', i === step));
      }
      const turns = Math.abs(car.rolled) / (2 * Math.PI);
      revolution.querySelector('.head').style.left = `${((turns % 1) * 100).toFixed(1)}%`;
      const count = `Revolution ${Math.floor(turns) + 1} · the move is in 3`;
      const counter = revolution.querySelector('.count');
      if (counter.textContent !== count) counter.textContent = count;
      if (walkthrough.result) {
        const measured = describeResult(walkthrough.result, walkthrough.recipe.reverse);
        const last = steps.lastElementChild;
        const text = `Carry on with the clock. Measured just now, the car ended up <b>${measured}</b>.`;
        if (last && last.dataset.measured !== text) {
          last.dataset.measured = text;
          last.innerHTML = text;
        }
      }
    },
  };
}
