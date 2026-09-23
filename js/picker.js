import { hitboxPoint } from './physics.js';

// The hitbox drawn from above the car's right side, nose to the right, with a button on each point.
const project = (signs) => {
  const p = hitboxPoint(...signs);
  return { x: p.x - 0.45 * p.z, y: -p.y + 0.3 * p.z };
};
// A point on the tail, underside or left side, and nowhere else, is on the far side of the drawing.
const isBehind = (signs) => !signs.some((s) => s === 1);
const PADDING = 0.08;

export function createPicker(root, points, selected, onChange) {
  const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z])));
  const projected = corners.map(project);
  const min = { x: Math.min(...projected.map((p) => p.x)) - PADDING, y: Math.min(...projected.map((p) => p.y)) - PADDING };
  const size = {
    x: Math.max(...projected.map((p) => p.x)) + PADDING - min.x,
    y: Math.max(...projected.map((p) => p.y)) + PADDING - min.y,
  };

  const edges = corners.flatMap((a, i) => corners.slice(i + 1)
    .filter((b) => a.filter((v, k) => v !== b[k]).length === 1)
    .map((b) => {
      const [p, q] = [project(a), project(b)];
      const hidden = isBehind(a) || isBehind(b);
      return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"${hidden ? ' class="hidden"' : ''}/>`;
    }));
  root.style.aspectRatio = `${size.x} / ${size.y}`;
  root.innerHTML = `<svg viewBox="${min.x} ${min.y} ${size.x} ${size.y}" aria-hidden="true">${edges.join('')}</svg>`;

  for (const point of points) {
    const p = project(point.signs);
    const button = document.createElement('button');
    button.setAttribute('aria-label', point.name);
    button.title = point.name;
    button.className = isBehind(point.signs) ? 'behind' : '';
    button.style.setProperty('--color', point.color);
    button.style.left = `${((p.x - min.x) / size.x) * 100}%`;
    button.style.top = `${((p.y - min.y) / size.y) * 100}%`;
    button.dataset.id = point.id;
    button.addEventListener('click', () => {
      if (selected.has(point.id)) selected.delete(point.id);
      else selected.add(point.id);
      render();
      onChange();
    });
    root.append(button);
  }

  function render() {
    root.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(selected.has(b.dataset.id))));
  }
  render();
}
