import * as THREE from 'three';

// Follows RocketSim (github.com/ZealanL/RocketSim), a reimplementation of Rocket League's physics,
// tick for tick. Distances in this scene are uu / 100.
const TORQUE_SCALE = ((2 * Math.PI) / 65536) * 1000;
const TORQUE = { roll: 400 * TORQUE_SCALE, pitch: 130 * TORQUE_SCALE, yaw: 95 * TORQUE_SCALE };
const DAMPING = { roll: 50 * TORQUE_SCALE, pitch: 30 * TORQUE_SCALE, yaw: 20 * TORQUE_SCALE };
const MAX_ANGULAR_SPEED = 5.5;
const MIN_SPIN = 0.05;
const MAX_SPEED = 23;
const GRAVITY = 6.5;
const STICKY_ACCEL = 3.25;
const JUMP_IMPULSE = 2.91667;
const JUMP_ACCEL = 14.58333;
const JUMP_MIN_TICKS = 3;
const JUMP_MAX_TICKS = 24;
const JUMP_PRE_MIN_ACCEL_SCALE = 0.62;
const BOOST_ACCEL = { wheels: 9.91667, air: 10.58333 };
const BOOST_MIN_TICKS = 12;
const ENGINE_ACCEL = 16;
// Measured in RocketSim: the wheels stay in contact for the first 5 ticks of a jump (sticky force on,
// no air control), and on the first tick the compressed suspension still carries the car's weight.
const GROUND_CONTACT_TICKS = 5;
// Measured in RocketSim: resting on its suspension, the Octane sits 0.55° nose down.
const REST_PITCH = THREE.MathUtils.degToRad(-0.549);

export const TICK = 1 / 120;
export const REST_HEIGHT = 0.1703;

const SETTLE_TIME = 0.35;

// Car frame: forward = +X, up = +Y, right = +Z.
// Positive roll = air roll right, positive pitch = nose up, positive yaw = nose right.
export const AXIS = {
  roll: new THREE.Vector3(1, 0, 0),
  pitch: new THREE.Vector3(0, 0, 1),
  yaw: new THREE.Vector3(0, -1, 0),
};
const UP = new THREE.Vector3(0, 1, 0);
const REST_ORIENTATION = new THREE.Quaternion().setFromAxisAngle(AXIS.pitch, REST_PITCH);
export const HOME = new THREE.Vector3(0, REST_HEIGHT, 0);

// Octane hitbox, placed relative to the point the car turns around (its centre of mass).
export const HITBOX = {
  size: new THREE.Vector3(1.20507, 0.386591, 0.866994),
  center: new THREE.Vector3(0.138757, 0.20755, 0),
};
// A point on the hitbox, with each coordinate from -1 (tail, underside, left) to 1 (nose, roof, right).
export const hitboxPoint = (x, y, z) => new THREE.Vector3(x, y, z).multiply(HITBOX.size).multiplyScalar(0.5).add(HITBOX.center);
const CORNERS = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => hitboxPoint(x, y, z))));
// The ball: the smallest sphere around the turning point that holds the whole hitbox.
export const BALL_RADIUS = Math.max(...CORNERS.map((corner) => corner.length()));

// Hitbox corners and resting wheel contact points, used to find where the car first touches the floor.
const CONTACT_POINTS = [
  ...CORNERS,
  ...[[0.5125, 0.259], [-0.3375, 0.295]].flatMap(([x, z]) => [z, -z].map((side) => new THREE.Vector3(x, -REST_HEIGHT, side))),
];

// Below this, the nose is square to the spin axis and neither end of it counts as ahead.
export const NOSE_SQUARE = 0.03;

export const NO_CONTROLS = Object.freeze({ roll: 0, pitch: 0, yaw: 0, jump: false, boost: false });

export function stickToInputs(stick, airRoll) {
  return { roll: airRoll, pitch: -stick.y, yaw: stick.x };
}

export class Car {
  constructor() {
    this.onJump = () => {};
    this.onLand = () => {};
    this.reset();
  }

  // A pinned car hangs in the air and only turns: gravity, jump and boost don't move it.
  reset({ position = HOME, pinned = false } = {}) {
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.orientation = pinned ? new THREE.Quaternion() : REST_ORIENTATION.clone();
    this.omega = new THREE.Vector3();
    // How far the car has turned around its nose in the air, in radians (positive = rolled right).
    this.rolled = 0;
    this.controls = NO_CONTROLS;
    this.pinned = pinned;
    this.phase = pinned ? 'air' : 'ground';
    this.wheelTicks = 0;
    this.jumping = false;
    this.jumpTicks = 0;
    this.boosting = false;
    this.boostTicks = 0;
    this.settle = null;
  }

  step(controls) {
    const jumpPressed = controls.jump && !this.controls.jump;
    this.controls = controls;
    if (this.phase === 'settle') return this.settleStep();
    if (this.phase === 'ground') {
      if (!jumpPressed) return;
      this.takeOff();
    }

    const onWheels = this.wheelTicks > 0;
    this.updateJump();
    this.updateBoost(onWheels);
    if (onWheels) {
      this.velocity.addScaledVector(this.up(), -STICKY_ACCEL * TICK);
      if (this.wheelTicks < GROUND_CONTACT_TICKS) this.drive();
      this.wheelTicks--;
    } else {
      this.rotate();
    }
    if (this.pinned) {
      this.velocity.set(0, 0, 0);
      return;
    }
    this.velocity.y -= GRAVITY * TICK;
    this.position.addScaledVector(this.velocity, TICK);
    // Like the spin cap, the game caps speed after moving the car.
    if (this.velocity.length() > MAX_SPEED) this.velocity.setLength(MAX_SPEED);
    if (this.velocity.y <= 0 && this.lowestPoint() <= 0) this.land();
  }

  takeOff() {
    const up = this.up();
    this.phase = 'air';
    this.wheelTicks = GROUND_CONTACT_TICKS;
    this.jumping = true;
    this.jumpTicks = 0;
    this.velocity.copy(up).multiplyScalar(JUMP_IMPULSE + (GRAVITY + STICKY_ACCEL) * TICK);
    this.onJump();
  }

  // A jump pushes along the roof for at least 3 ticks, and for as long as jump is held, up to 24.
  updateJump() {
    if (this.jumpTicks > 0) {
      this.jumping &&= this.jumpTicks < JUMP_MIN_TICKS || (this.controls.jump && this.jumpTicks < JUMP_MAX_TICKS);
    }
    if (this.jumping) {
      const scale = this.jumpTicks < JUMP_MIN_TICKS ? JUMP_PRE_MIN_ACCEL_SCALE : 1;
      this.velocity.addScaledVector(this.up(), JUMP_ACCEL * scale * TICK);
    }
    this.jumpTicks++;
  }

  // Boost pushes along the nose, and once started it lasts at least 0.1 s.
  updateBoost(onWheels) {
    this.boosting = this.controls.boost || (this.boosting && this.boostTicks < BOOST_MIN_TICKS);
    this.boostTicks = this.boosting ? this.boostTicks + 1 : 0;
    if (!this.boosting) return;
    const forward = AXIS.roll.clone().applyQuaternion(this.orientation);
    this.velocity.addScaledVector(forward, (onWheels ? BOOST_ACCEL.wheels : BOOST_ACCEL.air) * TICK);
  }

  // While the wheels still touch the floor, holding boost also means full throttle, and otherwise the
  // brakes hold the car in place. Both act along the floor.
  drive() {
    const forward = AXIS.roll.clone().applyQuaternion(this.orientation).setY(0).normalize();
    const speed = this.velocity.dot(forward);
    if (!this.controls.boost) {
      this.velocity.addScaledVector(forward, -speed);
      return;
    }
    const uu = Math.abs(speed) * 100;
    const torque = uu < 1400 ? 1 - (0.9 * uu) / 1400 : Math.max(0, (0.1 * (1410 - uu)) / 10);
    this.velocity.addScaledVector(forward, ENGINE_ACCEL * torque * TICK);
  }

  // Landing isn't simulated: the car stops where it touches down and turns back onto its wheels,
  // keeping its heading.
  land() {
    this.velocity.set(0, 0, 0);
    this.omega.set(0, 0, 0);
    this.jumping = false;
    this.boosting = false;
    const forward = AXIS.roll.clone().applyQuaternion(this.orientation);
    const flat = Math.hypot(forward.x, forward.z) > 1e-3 ? forward : UP.clone().applyQuaternion(this.orientation);
    const heading = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-flat.z, flat.x));
    this.settle = {
      timer: 0,
      from: { orientation: this.orientation.clone(), height: this.position.y },
      to: heading.multiply(REST_ORIENTATION),
    };
    this.phase = 'settle';
    this.onLand(this.position.clone());
  }

  settleStep() {
    const { from, to } = this.settle;
    this.settle.timer += TICK;
    const t = easeOut(Math.min(1, this.settle.timer / SETTLE_TIME));
    this.orientation.slerpQuaternions(from.orientation, to, t);
    this.position.y = THREE.MathUtils.lerp(from.height, REST_HEIGHT, t);
    if (this.settle.timer >= SETTLE_TIME) this.phase = 'ground';
  }

  up() {
    return UP.clone().applyQuaternion(this.orientation);
  }

  // The axis the car spins around, pointing to the side the nose leans to: where boost takes the car on
  // average. `nose` runs from 1 (nose on the axis) to 0 (nose square to it, so no side is ahead).
  spinAxis() {
    if (this.omega.length() < MIN_SPIN) return null;
    const direction = this.omega.clone().normalize();
    const nose = direction.dot(AXIS.roll.clone().applyQuaternion(this.orientation));
    return { direction: nose < 0 ? direction.negate() : direction, nose: Math.abs(nose) };
  }

  lowestPoint() {
    const point = new THREE.Vector3();
    return Math.min(...CONTACT_POINTS.map((p) => point.copy(p).applyQuaternion(this.orientation).add(this.position).y));
  }

  rotate() {
    const { roll, pitch, yaw } = this.controls;
    const inverse = this.orientation.clone().invert();
    const local = this.omega.clone().applyQuaternion(inverse);
    const w = { roll: local.dot(AXIS.roll), pitch: local.dot(AXIS.pitch), yaw: local.dot(AXIS.yaw) };

    const torque = new THREE.Vector3()
      .addScaledVector(AXIS.roll, TORQUE.roll * roll - DAMPING.roll * w.roll)
      .addScaledVector(AXIS.pitch, TORQUE.pitch * pitch - DAMPING.pitch * (1 - Math.abs(pitch)) * w.pitch)
      .addScaledVector(AXIS.yaw, TORQUE.yaw * yaw - DAMPING.yaw * (1 - Math.abs(yaw)) * w.yaw)
      .applyQuaternion(this.orientation);

    this.omega.addScaledVector(torque, TICK);
    this.rolled += this.omega.dot(AXIS.roll.clone().applyQuaternion(this.orientation)) * TICK;
    const angle = this.omega.length() * TICK;
    if (angle > 0) {
      const spin = new THREE.Quaternion().setFromAxisAngle(this.omega.clone().normalize(), angle);
      this.orientation.premultiply(spin).normalize();
    }
    // The game caps spin speed after moving the car, so it turns slightly faster than the cap each tick.
    if (this.omega.length() > MAX_ANGULAR_SPEED) this.omega.setLength(MAX_ANGULAR_SPEED);
  }
}

const easeOut = (t) => 1 - (1 - t) ** 3;
