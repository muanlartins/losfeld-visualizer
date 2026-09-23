import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { AXIS, BALL_RADIUS, HITBOX, NOSE_SQUARE, REST_HEIGHT, hitboxPoint } from './physics.js';

export const COLORS = {
  night: 0x070d24,
  pitch: 0x16224a,
  roll: 0xff8a2b,
  stick: 0x2e8bff,
  spin: 0xeaf1ff,
  heading: 0xffd23d,
};

// Points on the hitbox that can be traced, as signs along (forward, up, right).
export const POINTS = [
  { id: 'nose', name: 'Nose', signs: [1, 0, 0], color: '#ffd29a' },
  { id: 'tail', name: 'Tail', signs: [-1, 0, 0], color: '#9aa6d6' },
  { id: 'roof', name: 'Roof', signs: [0, 1, 0], color: '#c6ff4d' },
  { id: 'underside', name: 'Underside', signs: [0, -1, 0], color: '#ff9b73' },
  { id: 'left', name: 'Left side', signs: [0, 0, -1], color: '#5fb4ff' },
  { id: 'right', name: 'Right side', signs: [0, 0, 1], color: '#ff5f8f' },
  ...[1, -1].flatMap((x) => [1, -1].flatMap((y) => [-1, 1].map((z) => ({
    id: `${x > 0 ? 'nose' : 'tail'}-${y > 0 ? 'roof' : 'underside'}-${z < 0 ? 'left' : 'right'}`,
    name: `${x > 0 ? 'Nose' : 'Tail'} ${y > 0 ? 'roof' : 'underside'} ${z < 0 ? 'left' : 'right'}`,
    signs: [x, y, z],
  })))).map((corner, i) => ({ ...corner, color: ['#ff4d4d', '#ffb000', '#ff7ad9', '#f4f16a', '#3ddcff', '#7d85ff', '#4dff9a', '#c08bff'][i] })),
];

const TRAIL_POINTS = 360;
const LABEL_FONT = "'Exo 2', sans-serif";
const CAMERA_OFFSET = new THREE.Vector3(-4.4, 1.35, 4.6);
const LOOP_FOCUS = new THREE.Vector3(0, 1.25, 0);
const FOLLOW_LIFT = new THREE.Vector3(0, 0.3, 0);
// Camera positions around what it looks at. Ahead is +X and right is +Z, as the car starts.
const VIEWS = {
  angled: CAMERA_OFFSET,
  behind: new THREE.Vector3(-6.4, 1.1, 0),
  side: new THREE.Vector3(0, 1.1, 6.4),
  top: new THREE.Vector3(-0.01, 6.5, 0),
};
const FLIGHT_MS = 400;

// The model is in game units (uu), nose +X and roof +Y, and its body node sits on the car's pivot.
const MODEL_URL = 'assets/octane.glb';
const MODEL_PIVOT = 'Octane';

export function createStage(canvas, { onOrbit }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.night);
  scene.fog = new THREE.Fog(COLORS.night, 9, 26);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(LOOP_FOCUS);
  camera.position.copy(LOOP_FOCUS).add(CAMERA_OFFSET);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 2.5;
  controls.maxDistance = 12;
  controls.maxPolarAngle = Math.PI * 0.495;
  let flight = null;
  controls.addEventListener('start', () => {
    flight = null;
    onOrbit();
  });

  scene.add(new THREE.HemisphereLight(0x9fb8ff, 0x0a0f25, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-3, 6, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(COLORS.roll, 1.4);
  rim.position.set(4, 2, -5);
  scene.add(rim);

  const floor = createFloor();
  scene.add(floor, createStartMark(), createDirections());
  const landing = createLandingMark();
  scene.add(landing);

  const car = new THREE.Group();
  const body = new THREE.Group();
  const hitbox = createHitbox();
  const markers = new Map(POINTS.map((point) => [point.id, createMarker(point)]));
  const flame = createFlame();
  car.add(body, hitbox, flame, ...markers.values());
  scene.add(car);
  loadModel(body);

  const ball = createBall();
  scene.add(ball);

  const inputArrows = {
    roll: createSpinGlyph(COLORS.roll, 0.55),
    stick: createSpinGlyph(COLORS.stick, 0.85),
  };
  car.add(inputArrows.roll, inputArrows.stick);
  const spinAxis = createSpinAxis();
  const headingArrow = createHeadingArrow();
  scene.add(spinAxis, headingArrow);

  const trails = new Map(POINTS.map((point) => [point.id, createTrail(point.color)]));
  trails.forEach((trail) => scene.add(trail.line));

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    trails.forEach((trail) => trail.material.resolution.set(w, h));
    camera.aspect = w / h;
    // On phones the panel covers the lower half, so the car is drawn in the top part instead.
    if (w <= 640) camera.setViewOffset(w, h, 0, h * 0.28, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function lookAt(focus) {
    camera.position.add(focus.clone().sub(controls.target));
    controls.target.copy(focus);
  }

  return {
    camera,
    // Keeps the viewing angle, and moves the camera to what the mode is about.
    setMode(mode, state) {
      floor.position.set(0, 0, 0);
      lookAt(mode === 'loop' ? LOOP_FOCUS : state.position.clone().add(mode === 'free' ? FOLLOW_LIFT : new THREE.Vector3()));
    },
    sync(state, view) {
      car.position.copy(state.position);
      car.quaternion.copy(state.orientation);
      if (view.mode === 'free') {
        lookAt(state.position.clone().add(FOLLOW_LIFT));
        floor.position.set(Math.round(state.position.x), 0, Math.round(state.position.z));
      }

      const airborne = state.phase === 'air';
      const { roll, pitch, yaw } = state.controls;
      inputArrows.roll.set(AXIS.roll.clone().multiplyScalar(roll), view.arrows && airborne);
      const stickAxis = AXIS.pitch.clone().multiplyScalar(pitch).addScaledVector(AXIS.yaw, yaw);
      inputArrows.stick.set(stickAxis, view.arrows && airborne);
      spinAxis.set(state.position, state.spinAxis(), state.omega, view.arrows && airborne);
      headingArrow.set(state.position, view.heading, view.arrows && airborne);

      hitbox.visible = view.hitbox;
      ball.visible = view.ball;
      ball.position.copy(state.position);
      flame.set(state.boosting && airborne);

      car.updateMatrixWorld();
      for (const point of POINTS) {
        const selected = view.points.has(point.id);
        const marker = markers.get(point.id);
        const trail = trails.get(point.id);
        marker.visible = selected;
        trail.line.visible = selected && view.trails;
        if (!selected) trail.clear();
        else if (airborne) trail.push(marker.getWorldPosition(new THREE.Vector3()));
      }
    },
    showLanding(position) {
      landing.set(position);
    },
    clearTrails: () => trails.forEach((trail) => trail.clear()),
    // Swings the camera round what it looks at, keeping the distance.
    view(name) {
      const from = camera.position.clone().sub(controls.target);
      const to = VIEWS[name].clone().setLength(from.length());
      const turn = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
      const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : FLIGHT_MS;
      flight = { from, turn, start: performance.now(), duration };
    },
    render() {
      if (flight) {
        const t = flight.duration ? Math.min(1, (performance.now() - flight.start) / flight.duration) : 1;
        const turn = new THREE.Quaternion().slerp(flight.turn, easeInOut(t));
        camera.position.copy(controls.target).add(flight.from.clone().applyQuaternion(turn));
        if (t === 1) flight = null;
      }
      controls.update();
      composer.render();
    },
  };
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function createFloor() {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: COLORS.pitch, roughness: 0.9 }),
  );
  group.add(floor);

  const grid = new THREE.GridHelper(40, 40, 0x2a3c78, 0x1b2a5a);
  grid.position.y = 0.002;
  group.add(grid);
  return group;
}

function createStartMark() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.14, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x3d5bb8 }),
  );
  ring.position.y = 0.004;
  return ring;
}

// Where the last jump touched down, and a line back to the start mark.
function createLandingMark() {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: COLORS.spin, toneMapped: false });
  const dot = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.055, 32).rotateX(-Math.PI / 2), material);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.012).rotateX(-Math.PI / 2), material);
  group.add(dot, line);
  group.visible = false;

  group.set = (position) => {
    group.visible = Boolean(position);
    if (!position) return;
    const flat = new THREE.Vector3(position.x, 0.006, position.z);
    dot.position.copy(flat);
    const length = Math.hypot(flat.x, flat.z);
    line.visible = length > 0.001;
    line.scale.x = length;
    line.position.set(flat.x / 2, 0.006, flat.z / 2);
    line.rotation.y = -Math.atan2(flat.z, flat.x);
  };
  return group;
}

function createHitbox() {
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(HITBOX.size.x, HITBOX.size.y, HITBOX.size.z)),
    new THREE.LineBasicMaterial({ color: COLORS.spin, transparent: true, opacity: 0.7, toneMapped: false }),
  );
  box.position.copy(HITBOX.center);
  return box;
}

function createMarker({ signs, color }) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 16, 12),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  marker.position.copy(hitboxPoint(...signs));
  return marker;
}

// The ball: centred on the point the car turns around, just reaching the farthest hitbox corners.
function createBall() {
  const group = new THREE.Group();
  const color = 0x9fb8ff;
  group.add(new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 48, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, depthWrite: false }),
  ));

  const lines = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false });
  const circle = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 97 }, (_, i) => {
      const a = (i / 96) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    }),
  );
  for (let i = 1; i < 6; i++) {
    const lat = -Math.PI / 2 + (i * Math.PI) / 6;
    const ring = new THREE.Line(circle, lines);
    ring.scale.setScalar(BALL_RADIUS * Math.cos(lat));
    ring.position.y = BALL_RADIUS * Math.sin(lat);
    group.add(ring);
  }
  for (let i = 0; i < 6; i++) {
    const meridian = new THREE.Line(circle, lines);
    meridian.scale.setScalar(BALL_RADIUS);
    meridian.rotation.set(Math.PI / 2, 0, (i * Math.PI) / 6);
    group.add(meridian);
  }

  group.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 12, 8),
    new THREE.MeshBasicMaterial({ color: COLORS.spin, toneMapped: false }),
  ));
  group.visible = false;
  return group;
}

function createFlame() {
  const group = new THREE.Group();
  const tail = hitboxPoint(-1, 0, 0);
  const cone = (radius, length, color, opacity) => {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(radius, length, 20, 1, true).rotateZ(Math.PI / 2).translate(-length / 2, 0, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    return mesh;
  };
  group.add(cone(0.075, 0.5, COLORS.roll, 0.8), cone(0.04, 0.3, 0xfff1c9, 0.9));
  group.position.set(tail.x, tail.y - 0.03, 0);
  group.visible = false;

  group.set = (on) => {
    group.visible = on;
    if (on) group.scale.set(0.85 + Math.random() * 0.3, 1, 1);
  };
  return group;
}

function loadModel(body) {
  new GLTFLoader().load(
    MODEL_URL,
    ({ scene: model }) => {
      model.scale.setScalar(0.01);
      model.updateMatrixWorld(true);
      const pivot = model.getObjectByName(MODEL_PIVOT).getWorldPosition(new THREE.Vector3());
      const wheelBottom = new THREE.Box3().setFromObject(model).min.y;
      model.position.set(-pivot.x, -REST_HEIGHT - wheelBottom, -pivot.z);
      body.clear();
      body.add(model);
    },
    undefined,
    () => body.add(createStandInCar()),
  );
}

function createStandInCar() {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x1f6fe0, metalness: 0.4, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c1022, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a1330, metalness: 0.8, roughness: 0.1 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.2, 0.74), paint);
  chassis.position.y = -0.02;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.17, 0.6), glass);
  cabin.position.set(-0.12, 0.16, 0);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.8), paint);
  spoiler.position.set(-0.54, 0.16, 0);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
  nose.position.set(0.6, 0, 0);
  group.add(chassis, cabin, spoiler, nose);

  const wheel = new THREE.CylinderGeometry(0.17, 0.17, 0.14, 24).rotateX(Math.PI / 2);
  for (const [x, z] of [[0.36, 0.4], [0.36, -0.4], [-0.36, 0.4], [-0.36, -0.4]]) {
    const mesh = new THREE.Mesh(wheel, dark);
    mesh.position.set(x, -0.05, z);
    group.add(mesh);
  }
  return group;
}

// An arc with an arrowhead, circling +Z the way a turn about +Z goes (right-hand rule).
function createTurnArc(radius, material) {
  const group = new THREE.Group();
  const sweep = Math.PI * 1.55;
  const arc = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.033, 8, 96, sweep), material);
  const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.11, radius * 0.29, 16), material);
  head.position.set(Math.cos(sweep) * radius, Math.sin(sweep) * radius, 0);
  head.rotation.z = sweep;
  group.add(arc, head);
  return group;
}

// One input's turn: a ring around the axis it turns the car about, and that axis poking out both sides.
function createSpinGlyph(color, radius) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, radius * 2.4, 8).rotateX(Math.PI / 2), material);
  group.add(createTurnArc(radius, material), axis);

  const Z = new THREE.Vector3(0, 0, 1);
  group.set = (vector, visible) => {
    const strength = vector.length();
    group.visible = visible && strength > 1e-3;
    if (!group.visible) return;
    group.quaternion.setFromUnitVectors(Z, vector.clone().normalize());
    group.scale.setScalar(0.55 + 0.45 * Math.min(1, strength));
  };
  return group;
}

// The axis the car spins around. The arrow points to the side the nose leans to, and the ring near its tip
// circles the way the car turns. With the nose square to the axis neither side is ahead, so there's no tip.
function createSpinAxis() {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: COLORS.spin, toneMapped: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.6, 12).rotateX(Math.PI / 2), material);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 16).rotateX(Math.PI / 2), material);
  tip.position.z = 1.9;
  const turn = createTurnArc(0.2, material);
  turn.position.z = 1.45;
  group.add(shaft, tip, turn);

  const Z = new THREE.Vector3(0, 0, 1);
  group.set = (position, spin, omega, visible) => {
    group.visible = visible && Boolean(spin);
    if (!group.visible) return;
    group.position.copy(position);
    group.quaternion.setFromUnitVectors(Z, spin.direction);
    tip.visible = spin.nose > NOSE_SQUARE;
    turn.rotation.x = omega.dot(spin.direction) < 0 ? Math.PI : 0;
  };
  return group;
}

// Where the car is going on average (see heading.js): a thin arrow out of the car, from past the body.
function createHeadingArrow() {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: COLORS.heading, toneMapped: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.9, 8).rotateX(Math.PI / 2), material);
  shaft.position.z = 1.45;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 16).rotateX(Math.PI / 2), material);
  tip.position.z = 2.48;
  group.add(shaft, tip);

  const Z = new THREE.Vector3(0, 0, 1);
  group.set = (position, heading, visible) => {
    group.visible = visible && Boolean(heading);
    if (!group.visible) return;
    group.position.copy(position);
    group.quaternion.setFromUnitVectors(Z, heading);
  };
  return group;
}

// Direction labels around the start mark, as the car starts: they face the camera so they read from any view.
function createDirections() {
  const group = new THREE.Group();
  const color = 0x5b78d6;
  const labels = [['Ahead', 1, 0], ['Right', 0, 1], ['Behind', -1, 0], ['Left', 0, -1]];
  const redraws = labels.map(([text, x, z]) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, depthWrite: false, toneMapped: false }));
    label.scale.set(0.9, 0.225, 1);
    label.position.set(x * 1.65, 0.14, z * 1.65);
    group.add(label);
    return () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = `italic 900 88px ${LABEL_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);
      texture.needsUpdate = true;
    };
  });
  const redraw = () => redraws.forEach((draw) => draw());
  redraw();
  document.fonts?.load(`italic 900 88px ${LABEL_FONT}`).then(redraw, () => {});

  const chevron = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0.14, 0), new THREE.Vector2(-0.06, 0.12), new THREE.Vector2(-0.06, -0.12)])).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  chevron.position.set(1.25, 0.005, 0);
  group.add(chevron);
  return group;
}

function createTrail(color) {
  const points = [];
  const geometry = new LineGeometry();
  const material = new LineMaterial({
    linewidth: 3,
    vertexColors: true,
    toneMapped: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new Line2(geometry, material);
  line.frustumCulled = false;
  line.visible = false;

  const head = new THREE.Color(color);
  const tail = new THREE.Color(COLORS.night);

  function rebuild() {
    if (points.length < 2) {
      line.geometry.dispose();
      line.geometry = new LineGeometry();
      return;
    }
    const positions = [];
    const colors = [];
    const shade = new THREE.Color();
    points.forEach((p, i) => {
      positions.push(p.x, p.y, p.z);
      shade.lerpColors(tail, head, (i / (points.length - 1)) ** 1.6);
      colors.push(shade.r, shade.g, shade.b);
    });
    line.geometry.dispose();
    line.geometry = new LineGeometry().setPositions(positions).setColors(colors);
    line.computeLineDistances();
  }

  return {
    line,
    material,
    push(point) {
      if (points.length && points.at(-1).distanceToSquared(point) < 1e-4) return;
      points.push(point);
      if (points.length > TRAIL_POINTS) points.shift();
      rebuild();
    },
    clear() {
      if (!points.length) return;
      points.length = 0;
      rebuild();
    },
  };
}
