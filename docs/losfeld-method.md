# The Losfeld method, checked against the physics

The method comes from [A Rocket League Thesis: The Losfeld Method of Directional Air-Roll](https://www.youtube.com/watch?v=NTOBUcqFLVs) by losfeldRL. The full transcript is in [`losfeld-transcript.txt`](losfeld-transcript.txt). This page lists the method's terms as the video defines them, and then what the simulation says about each one.

The video plays air roll **left**. With air roll right, mirror everything left to right, including the direction of the clocks.

## Terms

| Term | Meaning in the video | Where |
|---|---|---|
| Tornado spin | Air roll left with the stick far right. The nose tips up, and the car goes on straight and high. | 34:06, 37:09 |
| Reverse tornado spin | Air roll left with the stick far left. The car goes belly up with the nose slightly down, and still goes straight. | 34:34, 37:24 |
| Top and bottom of the stick | Held while boosting, the top half (up-left to up-right) sends the car right and the bottom half sends it left. | 33:13 |
| Vector | The direction the car is going, even when that is straight. | 49:09 |
| Clock | One full clockwise circle of the stick for each car revolution, in time with it, from far right (later: from up-right). The car goes straight. | 48:29, 60:11 |
| Double and triple clock | Two or three stick circles for each car revolution. Still straight. | 49:22 |
| Locking | Hold one input longer than the others, then finish the clock: the car turns and then goes straight in the new direction. | 53:31 |
| Turning basics | Up-right at the start of a revolution locks a right turn and down-right locks a left turn. | 61:33 |
| Catching the clock | Speed the stick up or slow it down so the clock ends when the revolution ends. | 62:29, 63:52 |
| Refreshing the car | Give up on this revolution: hold far right (tornado) or let go of the stick, and start the clock again on the next one. | 63:11 |
| Calibrating | Just before the car is upside down, push the stick left, up-left or down-left: the nose swings right. | 70:47 |
| Reverse clock | The clock counterclockwise, at the same tempo: a hard turn, and a U-turn if you keep it up. | 74:57 |
| Half reverse clocks | Down-right to up done slowly turns left, up-left to down turns right. Done fast they tilt the car up or level it. | 77:37 |
| Reverse double clock | Two counterclockwise circles for each revolution, from the bottom. Straight again, with a different feel. | 82:34 |

## What the physics says

Measured with the same physics as the page. Clocks are perfect circles at full stick, kept in time with the car's own roll. "Straight" means the average direction of the nose, which is where boost takes the car.

**Why a clockwise clock goes straight and a counterclockwise one turns.** With air roll left the car turns counterclockwise, seen from behind. A stick circled counterclockwise at the same rate turns with the car, so its push keeps pointing one way in the world and adds up to a hard turn. A stick circled clockwise turns against the car, so its push goes round the world twice per revolution and cancels out. The video's own explanation, that every input lasts the same time, can't be the whole story: the reverse clock also spends equal time on every input.

**The single clock is not quite straight.** Even perfectly in time, it drifts about 14° per second, whatever the starting point. The Octane pitches harder than it yaws (torque 130 against 95), so a circle on the stick is an oval of push. At exactly one circle per revolution, part of that oval stays fixed in the world, like a small reverse clock. With pitch and yaw made equal, the drift drops to 0.1° per second.

| Stick, with air roll left | Drift once the spin has settled |
|---|---|
| Neutral | 0°/s |
| Clock | about 14°/s |
| Double clock | under 0.3°/s |
| Triple clock | under 0.1°/s |
| Reverse clock | a U-turn in about a second |

**Locking works.** Freezing the stick during a double clock and then jumping back to where the clock should be gives a single change of direction, then the car goes straight again. It turns about 4.5° for a 100 ms freeze and about 20° for 250 ms. The direction is where that stick position pushes the nose at that moment of the roll, a little further round because the car keeps rolling during the freeze. So it depends on where the car is in its roll, not only on where the stick points. On the single clock, freezing at up-right turns the car right and at down-right turns it left, as the video says.

**How you get back in time matters.** Staying late or catching up slowly after a freeze also turns the car once, but in a different direction, because being behind the clock is itself an extra push. On the single clock it also changes which way that 14°/s drift goes.
