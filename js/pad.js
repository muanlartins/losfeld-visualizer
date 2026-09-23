import { BUTTON } from './input.js';

// A live controller drawing: sticks move and buttons light up as they're pressed.
const STICK_TRAVEL = { left: 17, right: 11 };
const LEFT = { x: 82, y: 88 };
const RIGHT = { x: 184, y: 128 };

const SVG = `
<svg viewBox="0 0 300 200" aria-hidden="true">
  <g data-trigger="0"><rect class="shell" x="60" y="4" width="40" height="16" rx="5"/><rect class="level" x="60" y="4" width="40" height="16" rx="5"/><text x="80" y="15.5">LT</text></g>
  <g data-trigger="1"><rect class="shell" x="200" y="4" width="40" height="16" rx="5"/><rect class="level" x="200" y="4" width="40" height="16" rx="5"/><text x="220" y="15.5">RT</text></g>
  <g class="button bound" data-button="${BUTTON.rollLeft}"><rect x="42" y="26" width="76" height="15" rx="7.5"/><text x="80" y="36.5">Air roll left</text></g>
  <g class="button bound" data-button="${BUTTON.rollRight}"><rect x="182" y="26" width="76" height="15" rx="7.5"/><text x="220" y="36.5">Air roll right</text></g>
  <path class="body" d="M78 48 C50 48 32 64 24 100 C14 148 22 192 50 194 C72 196 84 170 102 154 L198 154 C216 170 228 196 250 194 C278 192 286 148 276 100 C268 64 250 48 222 48 Z"/>
  <circle class="well" cx="${LEFT.x}" cy="${LEFT.y}" r="27"/>
  <circle class="range" cx="${LEFT.x}" cy="${LEFT.y}" r="${STICK_TRAVEL.left}"/>
  <circle class="knob bound" data-stick="left" data-button="10" cx="${LEFT.x}" cy="${LEFT.y}" r="11"/>
  <g transform="translate(116 128)">
    <rect class="button" data-button="12" x="-5" y="-17" width="10" height="12" rx="2"/>
    <rect class="button" data-button="13" x="-5" y="5" width="10" height="12" rx="2"/>
    <rect class="button" data-button="14" x="-17" y="-5" width="12" height="10" rx="2"/>
    <rect class="button" data-button="15" x="5" y="-5" width="12" height="10" rx="2"/>
  </g>
  <circle class="well" cx="${RIGHT.x}" cy="${RIGHT.y}" r="20"/>
  <circle class="knob" data-stick="right" data-button="11" cx="${RIGHT.x}" cy="${RIGHT.y}" r="10"/>
  <rect class="button" data-button="8" x="129" y="84" width="15" height="9" rx="4.5"/>
  <rect class="button" data-button="9" x="156" y="84" width="15" height="9" rx="4.5"/>
  <circle class="button" data-button="16" cx="150" cy="66" r="8"/>
  <g class="button face y" data-button="3"><circle cx="218" cy="70" r="10"/><text x="218" y="74">Y</text></g>
  <g class="button face x" data-button="2"><circle cx="198" cy="90" r="10"/><text x="198" y="94">X</text></g>
  <g class="button face b bound" data-button="${BUTTON.boost}"><circle cx="238" cy="90" r="10"/><text x="238" y="94">B</text></g>
  <g class="button face a bound" data-button="${BUTTON.jump}"><circle cx="218" cy="110" r="10"/><text x="218" y="114">A</text></g>
  <text class="bind start" x="252" y="94">Boost</text>
  <text class="bind" x="218" y="134">Jump</text>
</svg>`;

export function createPad(root) {
  root.innerHTML = SVG;
  const buttons = [...root.querySelectorAll('[data-button]')];
  const sticks = { left: root.querySelector('[data-stick="left"]'), right: root.querySelector('[data-stick="right"]') };
  const triggers = [...root.querySelectorAll('[data-trigger] .level')];

  return {
    update(device) {
      for (const el of buttons) el.classList.toggle('on', device.buttons[el.dataset.button]);
      moveKnob(sticks.left, LEFT, device.stick, STICK_TRAVEL.left);
      moveKnob(sticks.right, RIGHT, device.rightStick, STICK_TRAVEL.right);
      triggers.forEach((level, i) => {
        const h = 16 * device.triggers[i];
        level.setAttribute('y', 20 - h);
        level.setAttribute('height', h);
      });
    },
  };
}

function moveKnob(knob, center, stick, travel) {
  knob.setAttribute('cx', center.x + stick.x * travel);
  knob.setAttribute('cy', center.y - stick.y * travel);
}
