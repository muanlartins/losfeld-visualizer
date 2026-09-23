# Losfeld Visualizer

See which axis a Rocket League car spins around for any combination of directional air roll and left stick, as taught in [The Losfeld Method of Directional Air-Roll](https://www.youtube.com/watch?v=NTOBUcqFLVs).

Three modes:

- **Jump loop**: the car jumps over and over with the same inputs. Every jump starts from the start mark, and a small ring on the floor shows where the last one touched down.
- **Locked**: the car hangs in mid-air and only turns. Where a car is and how fast it moves never changes how it rotates, so this shows rotation exactly as the game does.
- **Moves**: one move played on the video's clock, over and over, as a walkthrough. The moves are named like combo letters (R, UR, U, UL, L, DL, D, DR, and UT for the U-turn) and laid out like the stick. Pick the clock (single, double or triple) and how the stick gets back in time (jump back, or catch up as the video does). The panel shows where the stick freezes, the steps with the current one lit, and where in the car's revolution the move happens. A ghost car keeps clocking without the move, and the result is measured against it.

A fourth mode, **Free flight** (jump, boost and turn freely, with a floor and nothing else), works but is hidden for now: unhide its button in `index.html`.

Inputs come from the panel (air roll plus one of 8 stick directions), from the **clock** (the stick circles by itself at full tilt, clockwise or anticlockwise, one, two or three times per car revolution, in time with the car's roll and starting from the picked notch), or from a controller or the keyboard.

Orange rings show the air roll turn and blue rings the stick turn. The white arrow is the axis the car actually spins around. It points to the side the nose leans to, and its small ring shows which way the car turns. Air roll left with stick right leans it towards the roof, and with stick left towards the underside. With the nose square to the axis (stick alone, no air roll) the arrow has no tip. The gold arrow is the **heading**: the nose averaged over the last full revolution, which is where boost takes the car (the video's "vector").

The **heading gauge** (top right) looks straight ahead from the start. A point's distance from the centre is its angle from ahead, and its direction is where it lies. It plots the heading (gold dot, with its trail), the nose (small dot), the spin axis (white ring) and, in Moves, the ghost (dashed ring). Angles use the game's axes as the car starts: X ahead, Y right, Z up. Yaw turns toward +Y and pitch toward +Z; the small gizmo shows those axes as the camera sees them.

Ahead, behind, left and right are labelled around the start mark, as the car starts, and the camera can jump to an angled, behind, side or top view. The Octane's hitbox (a plain box, 120.5 × 86.7 × 38.7 uu, centred 13.9 uu ahead of and 20.8 uu above the point the car turns around), the ball around it (centred on that point, just reaching the farthest corners) and coloured trails on any hitbox point can be switched on.

| Action | Controller | Keyboard |
|---|---|---|
| Left stick | Left stick (10% deadzone) | W A S D |
| Air roll left / right | LB / RB | Q / E |
| Jump (Free flight) | A | Space |
| Boost (unlimited) | B | Shift |
| Reset (level the car, play again) | D-pad up | R |

## Physics

- Follows [RocketSim](https://github.com/ZealanL/RocketSim), a tick-for-tick reimplementation of Rocket League's physics, at 120 ticks per second: jump impulse and hold force along the roof, boost along the nose, sticky force, brakes and throttle and no air control while the wheels touch the floor, air-control torque and damping, and the 5.5 rad/s spin and 2300 uu/s speed caps.
- The car starts from the Octane's resting pose on its suspension, 0.55° nose down.
- Checked tick by tick against RocketSim itself over jumps with air roll, stick and boost: within 0.2 uu and 0.05° in the air (1.6 uu over 10 m when holding boost from takeoff).
- Jump hold runs from a tap (25 ms, the game's minimum) to a full hold (200 ms). At 100 ms, air roll alone does one revolution and lands on its wheels.
- Drift is real: jump is still pushing along the roof for a few ticks after air roll starts tilting the car. At 100 ms with air roll left, the car touches down 2 uu left and 1 uu ahead. Holds of 50 ms or less don't drift sideways at all.
- Not simulated: landing (the car stops and turns back onto its wheels; in RocketSim the suspension pushes it about 4.5 uu further), driving, double jumps, dodges, walls and the ball.

## Docs

- [The Losfeld method, checked against the physics](docs/losfeld-method.md)
- [Working on the visualizer](docs/development.md)
- [Transcript of the thesis video](docs/losfeld-transcript.txt)

## Run locally

```sh
python3 -m http.server 8765
```

Open http://localhost:8765. No build step; three.js loads from jsDelivr.

The moves come from a search over every freeze point, circle and length, run with the page's own physics. To run it again after changing the physics or the clock:

```sh
npm install
npm run recipes
```

It prints what it found and rewrites `js/recipes.js`.

## Car model

Put the model at `assets/octane.glb`. Without it the page uses a stand-in car.

Octane model by [Jako](https://sketchfab.com/3d-models/octane-rocket-league-car-9910f0a5d158425bbc7deb60c7a81f69), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Fan project, not affiliated with Psyonix.

## Deploy

Push to GitHub, then Settings → Pages → Deploy from branch → `main`, `/ (root)`.
