# Working on the visualizer

A static page: no build step and no framework. three.js and its addons load from jsDelivr through the import map in `index.html`. Serve the folder over HTTP (`python3 -m http.server 8765`), because ES modules and the model won't load from `file://`.

## Files

| File | What it owns |
|---|---|
| `js/physics.js` | The `Car`: jump, boost, air control, damping, caps, landing. No three.js scene code, so it also runs in Node. |
| `js/scene.js` | Everything drawn: renderer, camera and views, car model, hitbox, ball, trails, spin arrows, floor labels. `createStage()` returns the few calls `main.js` needs. |
| `js/main.js` | Settings, the panel, the modes, the 120 Hz tick loop and the readouts. |
| `js/input.js` | Gamepad (standard mapping) and keyboard, read once per frame. |
| `js/pad.js` | The controller diagram. |
| `js/picker.js` | The hitbox point picker. |
| `docs/` | The method, its transcript, and these notes. |

## Conventions

- **Units:** scene distances are Rocket League units (uu) / 100. Angles are radians in code and degrees on screen.
- **Time:** the car steps at 120 ticks per second (`TICK`), like the game. Rendering runs at the display rate, and a time accumulator scaled by the speed slider decides how many ticks run each frame.
- **Car frame:** forward +X, up +Y, right +Z (three.js is Y-up). Positive roll is air roll right, positive pitch is nose up, positive yaw is nose right (`AXIS` in `physics.js`).
- **World:** the car starts facing +X, so +X is ahead, +Y up and +Z right as it starts.
- **Stick:** `{ x, y }` with right and up positive. Stick up pitches the nose down, as in the game (`stickToInputs`).
- **Spin axis:** `Car.spinAxis()` points to the nose side of the axis, not along the right-hand-rule angular velocity. That way tornado points ahead and up, and reverse tornado ahead and down.

## Physics must match the game

The physics follows [RocketSim](https://github.com/ZealanL/RocketSim) tick for tick. Any change to `physics.js` has to be checked against RocketSim itself, not against wiki numbers:

1. `pip install rocketsim` in a virtual env. `rocketsim.init(dir)` needs a `soccar/` folder of `.cmf` meshes; a one-triangle dummy mesh is enough for air physics.
2. Move the ball away from the origin. The kickoff ball overlaps the car and ruins the jump.
3. Run the same inputs tick by tick in RocketSim and in Node against `js/physics.js`, and compare position and orientation.

The last check matched within 0.2 uu and 0.05° over jumps with air roll, stick and boost.

Behaviour has to come from the physics. If the car does something surprising, explain it or fix the physics. Never quietly correct the car's position or orientation to make it look right: the loop mode shows where each jump lands for that reason.

## Checking the page

There are no unit tests. Changes were checked in a headless browser: puppeteer-core driving a local Chromium-based browser with `--use-angle=swiftshader`, clicking the panel and taking screenshots. Frames are slow under software rendering, so wait on the page's state rather than on wall-clock time. To test controller code, stub `navigator.getGamepads` with `evaluateOnNewDocument`.

Check a phone width (390 px) too: the panel moves below the car there, and the page must not scroll sideways.

## Deploy

GitHub Pages from the `main` branch, root folder. Everything the page needs is in the repo or on jsDelivr.
