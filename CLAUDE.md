# Losfeld Visualizer

Rocket League directional air roll in 3D, built around the Losfeld method. Read these first:

- [`README.md`](README.md): what the page does and how to run it.
- [`docs/development.md`](docs/development.md): file layout, conventions, how physics changes are validated, and how the page is checked.
- [`docs/losfeld-method.md`](docs/losfeld-method.md): the method's terms and what the physics says about each.
- [`docs/losfeld-transcript.txt`](docs/losfeld-transcript.txt): the video's transcript, with timestamps. Take terms from here; don't invent new ones.

Rules:

- Physics follows RocketSim. Check changes against RocketSim, and never mask what the physics does.
- Commit only when asked, in small logical commits. Ask before any push.
