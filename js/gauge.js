import * as THREE from 'three';
import { angles } from './heading.js';

// A live readout of where the car is going. The scope looks straight ahead from the start (+X at the centre):
// a point's distance from the centre is its angle from ahead, and its direction is where it lies,
// +Y (right) and +Z (up). The gizmo shows the X, Y and Z axes as the camera sees them.
const RADIUS = 88;
const RANGES = [15, 30, 60, 120, 180];
const TRAIL_TICKS = 720;
const TRAIL_EVERY = 4;
const GIZMO = { x: -76, y: -76, length: 18 };
const AXES = [
  { label: 'X', world: new THREE.Vector3(1, 0, 0) },
  { label: 'Y', world: new THREE.Vector3(0, 0, 1) },
  { label: 'Z', world: new THREE.Vector3(0, 1, 0) },
];

const MARKUP = `
<h2>Heading</h2>
<svg class="scope" viewBox="-112 -108 224 222" aria-hidden="true">
  <circle class="disc" r="${RADIUS}"/>
  <circle class="ring" data-ring="1"/><circle class="ring" data-ring="2"/>
  <line class="cross" x1="-${RADIUS}" x2="${RADIUS}"/><line class="cross" y1="-${RADIUS}" y2="${RADIUS}"/>
  <text class="ring-label" data-ring-label="1"/><text class="ring-label" data-ring-label="2"/><text class="ring-label" data-ring-label="3"/>
  <text class="edge" x="${RADIUS + 5}" y="3">+Y</text><text class="edge" x="${-RADIUS - 5}" y="3" text-anchor="end">−Y</text>
  <text class="edge" y="${-RADIUS - 4}" text-anchor="middle">+Z</text><text class="edge" y="${RADIUS + 10}" text-anchor="middle">−Z</text>
  <polyline class="trail"/>
  <circle class="spin" r="5"/>
  <circle class="ghost" r="5.5"/>
  <circle class="nose" r="2.5"/>
  <circle class="heading" r="4.5"/>
  <g class="gizmo" transform="translate(${GIZMO.x} ${GIZMO.y})">
    ${AXES.map((a) => `<g data-axis="${a.label}"><line/><text>${a.label}</text></g>`).join('')}
  </g>
</svg>
<table>
  <thead><tr><th></th><th>Yaw</th><th>Pitch</th></tr></thead>
  <tbody>
    <tr class="key-heading"><th>Heading</th><td data-out="heading-yaw"></td><td data-out="heading-pitch"></td></tr>
    <tr class="key-spin"><th>Spin axis</th><td data-out="spin-yaw"></td><td data-out="spin-pitch"></td></tr>
  </tbody>
</table>
<p class="gauge-note" data-out="xyz"></p>
<p class="gauge-note" data-out="off-nose"></p>`;

export function createGauge(root) {
  root.innerHTML = MARKUP;
  const $ = (selector) => root.querySelector(selector);
  const dots = { heading: $('.heading'), nose: $('.nose'), spin: $('.spin'), ghost: $('.ghost') };
  const trailLine = $('.trail');
  const rings = [1, 2].map((i) => $(`[data-ring="${i}"]`));
  const ringLabels = [1, 2, 3].map((i) => $(`[data-ring-label="${i}"]`));
  const axes = AXES.map((axis) => ({ ...axis, group: $(`[data-axis="${axis.label}"]`) }));
  const outputs = Object.fromEntries([...root.querySelectorAll('[data-out]')].map((el) => [el.dataset.out, el]));
  const trail = [];
  let range = RANGES[0];
  let shownRange = null;

  const write = (key, text) => {
    if (outputs[key].textContent !== text) outputs[key].textContent = text;
  };
  const degrees = (v) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : ' '}${Math.abs(v).toFixed(1)}°`;
  const angleFromAhead = (direction) => THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(direction.x, -1, 1)));

  function place(direction) {
    const r = (Math.min(angleFromAhead(direction), range) / range) * RADIUS;
    const side = Math.hypot(direction.z, direction.y);
    return side < 1e-9 ? [0, 0] : [(direction.z / side) * r, (-direction.y / side) * r];
  }
  function show(dot, direction) {
    dot.style.display = direction ? '' : 'none';
    if (!direction) return;
    const [x, y] = place(direction);
    dot.setAttribute('cx', x.toFixed(1));
    dot.setAttribute('cy', y.toFixed(1));
  }
  function setRange(next) {
    range = next;
    if (shownRange === range) return;
    shownRange = range;
    rings.forEach((ring, i) => ring.setAttribute('r', ((RADIUS * (i + 1)) / 3).toFixed(1)));
    ringLabels.forEach((label, i) => {
      const r = (RADIUS * (i + 1)) / 3;
      label.setAttribute('x', (r * Math.SQRT1_2 + 2).toFixed(1));
      label.setAttribute('y', (-r * Math.SQRT1_2 - 2).toFixed(1));
      label.textContent = `${Math.round((range * (i + 1)) / 3)}°`;
    });
  }
  setRange(range);

  return {
    clear() {
      trail.length = 0;
    },
    update({ heading, ghost, nose, spin, ticks, camera }) {
      if (heading && (!trail.length || ticks - trail.at(-1).ticks >= TRAIL_EVERY)) trail.push({ ticks, direction: heading.clone() });
      while (trail.length && ticks - trail[0].ticks > TRAIL_TICKS) trail.shift();

      // Zoom out far enough to hold the trail and the spin axis, and back in once they fit.
      const widest = Math.max(0, ...trail.map((p) => angleFromAhead(p.direction)), spin ? angleFromAhead(spin.direction) : 0);
      setRange(RANGES.find((r) => widest * 1.1 <= r) ?? RANGES.at(-1));
      trailLine.setAttribute('points', trail.map((p) => place(p.direction).map((v) => v.toFixed(1)).join(',')).join(' '));
      show(dots.heading, heading);
      show(dots.nose, nose);
      show(dots.spin, spin?.direction);
      show(dots.ghost, ghost);

      const view = camera.quaternion.clone().invert();
      for (const axis of axes) {
        const v = axis.world.clone().applyQuaternion(view);
        const [x, y] = [v.x * GIZMO.length, -v.y * GIZMO.length];
        const line = axis.group.firstElementChild;
        line.setAttribute('x2', x.toFixed(1));
        line.setAttribute('y2', y.toFixed(1));
        axis.group.lastElementChild.setAttribute('x', (x * 1.45).toFixed(1));
        axis.group.lastElementChild.setAttribute('y', (y * 1.45 + 3).toFixed(1));
        axis.group.style.opacity = v.z < 0 ? 0.45 : 1;
      }

      const h = heading && angles(heading);
      const s = spin && angles(spin.direction);
      write('heading-yaw', h ? degrees(h.yaw) : '–');
      write('heading-pitch', h ? degrees(h.pitch) : '–');
      write('spin-yaw', s ? degrees(s.yaw) : '–');
      write('spin-pitch', s ? degrees(s.pitch) : '–');
      write('xyz', h ? `Heading X ${h.xyz.x.toFixed(2)} · Y ${h.xyz.y.toFixed(2)} · Z ${h.xyz.z.toFixed(2)}` : 'Heading shows once the car is in the air');
      write('off-nose', s ? `Spin axis ${Math.round(THREE.MathUtils.radToDeg(Math.acos(Math.min(1, spin.nose))))}° off the nose` : '');
    },
  };
}
