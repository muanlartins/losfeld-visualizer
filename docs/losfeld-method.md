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
| Clock | about 12–14°/s |
| Double clock | under 0.3°/s |
| Triple clock | under 0.1°/s |
| Reverse clock | turns hard: about 150° round within 2 s, over the top |

**Locking works.** Freezing the stick during a double clock and then jumping back to where the clock should be gives a single change of direction, then the car goes straight again. It turns about 4.5° for a 100 ms freeze and about 20° for 250 ms. The direction is where that stick position pushes the nose at that moment of the roll, a little further round because the car keeps rolling during the freeze. So it depends on where the car is in its roll, not only on where the stick points. On the single clock, freezing at up-right turns the car right and at down-right turns it left, as the video says.

**How you get back in time matters.** Staying late or catching up slowly after a freeze also turns the car once, but in a different direction, because being behind the clock is itself an extra push. On the single clock it also changes which way that 14°/s drift goes.

## Moves on the clock

The page's Moves mode plays these as combos, one move per revolution of the car, and `tools/recipes.mjs` finds them. The letters are the page's own notation, not the video's. For each clock, the search tries a freeze at every stick notch, in every circle of the revolution, for every length from 33 to 300 ms, and keeps moves of about 10°. Each one is played exactly as the page plays a combo: air roll left, a clock from far right, one revolution to spin up, then the move.

**How a move is measured.** From where the car was as the move's revolution started, and from where it is as the next revolution starts, the plain clock is played on in a copy of the car. Both headings are read over the same revolution, the second after the move. So the result is what the move did against playing just the clock in its place. On the double and triple clocks the plain clock doesn't drift (0.00°/s), so the before of each move is the after of the one before, and a combo's moves add up: R R R turns 26.5° right (8.7°, 8.9° and 9.1°), and R U L D ends 2.5° from where it started.

**Which way a freeze sends the car.** While the stick is held, it pushes the nose where the stick points, read on the car as it is rolled at that moment. The clock ties the stick to the roll, so each stick position in each circle has its own direction. On the double clock the stick passes each notch twice per revolution, half a revolution apart, and the two pushes are opposite. So four freeze points cover all eight directions, and the circle picks which way. On the triple clock the three passes push 120° apart.

Double clock, jumping back in time afterwards:

| Move | Stick at | Circle | Then | Result |
|---|---|---|---|---|
| R | down | 2 of 2 | hold 133 ms | 8.7° right, 2.0° up |
| L | down | 1 of 2 | hold 117 ms | 7.1° left, 0.7° down |
| U | up | 1 of 2 | hold 133 ms | 2.0° left, 8.9° up |
| D | up | 2 of 2 | hold 117 ms | 1.2° right, 7.6° down |
| UR | right | 1 of 2 | hold 150 ms | 7.6° right, 7.7° up |
| DL | right | 2 of 2 | hold 150 ms | 7.3° left, 7.5° down |
| UL | left | 2 of 2 | hold 133 ms | 6.4° left, 6.9° up |
| DR | left | 1 of 2 | hold 150 ms | 7.6° right, 7.3° down |
| UT | up | 2 of 2 | turn back for 1.73 s | 152° round |

Catching up instead, the double clock needs only two freeze points: far left in circle 1 gives R and in circle 2 L, and far right gives U and D the same way (183 ms each, about 11°).

**Jump back or catch up.** Both hold the stick for the same time, and how long you hold sets how far the car turns. The difference is after the hold. Jumping back, the stick flicks straight to where the clock is by now. Catching up, it carries on from where it stopped at twice the speed, so it stays behind the clock for as long again as the hold, and being behind the clock is a push of its own. The same freeze then turns the car further and in another direction: freezing at down in circle 2 for 117 ms turns it 6.8° right, 0.6° up jumping back, and 9.0° right, 4.5° up catching up. That is why each has its own recipes.

**A move that ends past the upright.** A slot ends at the first upright after its move is done. A freeze late in the revolution (like D, at up in circle 2) can finish just after the car turns upright. The next move still plays in the next revolution when its freeze comes later than that; if it would come first (UR freezes right as the car turns upright), it waits a revolution, and the page marks it.

**The single clock only reaches some directions.** Its stick passes each notch once per revolution, and for short freezes, notches half a circle apart push the same way. On top of that it drifts about 12–14°/s by itself. Jumping back, no single freeze gives a clean right, up, left or down-left; catching up, none gives right, up-left, left or down-right.

**The U-turn goes over the top.** Turning the stick back with the car is a stretch of reverse clock: the push keeps one direction and the car turns hard. The nose climbs until it points straight up, and the car comes down the other side, about 150° round at most after 1.7–2 s: the video's "make your car go behind you", but not all the way. Coming out of that half loop, the car is upside down compared with how its roll is counted, so moves played after a UT come out mirrored (an R goes left). The video's refreshing the car (63:11) starts the clock over; whether that is how a player gets back in step after a UT isn't tested here yet.
