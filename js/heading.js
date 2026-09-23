import * as THREE from 'three';
import { AXIS, TICK } from './physics.js';

// Where the car is going: its nose averaged over the last full revolution, which is where boost takes it
// (the video's "vector"). Without a full revolution in the last LONGEST seconds, it averages those instead.
const LONGEST = Math.round(1.5 / TICK);
const REVOLUTION = 2 * Math.PI;

export function createHeading() {
  const samples = [];
  return {
    clear() {
      samples.length = 0;
    },
    push(car) {
      samples.push({ nose: AXIS.roll.clone().applyQuaternion(car.orientation), rolled: car.rolled });
      if (samples.length > LONGEST) samples.shift();
    },
    get() {
      if (!samples.length) return null;
      const { rolled } = samples.at(-1);
      const sum = new THREE.Vector3();
      for (let i = samples.length - 1; i >= 0; i--) {
        sum.add(samples[i].nose);
        if (Math.abs(rolled - samples[i].rolled) >= REVOLUTION) break;
      }
      return sum.normalize();
    },
  };
}

// Angles in the car's starting frame, labelled as the game does: X ahead, Y right, Z up.
// Yaw is positive toward +Y and pitch toward +Z.
export function angles(direction) {
  const { x, y, z } = direction;
  return {
    yaw: THREE.MathUtils.radToDeg(Math.atan2(z, x)),
    pitch: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(y, -1, 1))),
    xyz: { x, y: z, z: y },
  };
}

// How far `heading` is from `base`, seen from behind `base` with the world's up kept up: how far right and how far
// up it turned, and the whole angle between them, in degrees.
export function compare(base, heading) {
  const right = base.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const up = right.clone().cross(base);
  return {
    right: THREE.MathUtils.radToDeg(Math.atan2(heading.dot(right), heading.dot(base))),
    up: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(heading.dot(up), -1, 1))),
    angle: THREE.MathUtils.radToDeg(heading.angleTo(base)),
  };
}
