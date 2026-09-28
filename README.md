# Make-or-Break

A little browser simulation about building and breaking. Two agents move across a grid: one restores cells, the other clears them. I made the controls so you can change the balance and watch a different pattern emerge each time.

Move the **Builder** and **Breaker** sliders to change their speed. **Chaos** adds randomness; **Time** changes the length of a round; **Multi** lets a collision affect nearby cells. There is also sound, a restart button, and a local match history.

## Share a challenge

Every round starts from a seeded grid. The **Share** button (and **Share Challenge** on the result screen) copies a one-line result plus a link like `index.html?seed=k3x9q1&breaker=560&builder=300&time=60&chaos=0`. Opening that link loads the same starting grid with the same settings. **Replay This Grid** retries the current grid; **New Round** or **Restart** starts a fresh one.

## Run it

Open `index.html` in a browser. Everything lives in that file: canvas drawing, controls, simulation logic, and styles. No install or build step is needed.

## Tests

`npm install` then `npm test` runs browser tests for challenge links with Playwright. If Chromium is already installed somewhere, set `CHROMIUM_PATH` to it instead of running `npx playwright install`.

## Why I kept it small

This is an interaction sketch. The useful part is how a few controls make a simple system feel responsive and watchable. It is also a place to improve: I want to make the controls more accessible and the simulation rules easier to understand without relying on the long explanation below the canvas.
