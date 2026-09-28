# Make or Break — revamp plan

**Status:** implementation proposal; no application changes in this planning PR.  
**Reviewed:** 28 September 2026.  
**Repository:** [maitranilim/make-or-break](https://github.com/maitranilim/make-or-break).  
**Baseline:** main at `2a4ac36e3ae9a225fe5ca201665cd0b638735fcb`, refreshed after PRs #1 and #2 merged during this review.  
**Build sequence:** [revamp-build-steps.md](revamp-build-steps.md).

## The goal

Turn Make or Break into an interactive arena where creation and destruction are beautiful to watch and easy to investigate. Keep the immediate pleasure of two agents competing over a grid. Give every ambitious visual a job: reveal the rules, explain a collision, replay a turning point, or compare two possible futures.

The visual direction is a **living circuit board**: an obsidian stage, ivory cells that rise when restored, recessed sockets when cleared, an emerald Builder and a coral Breaker moving through precise light trails. The identity remains Make or Break.

The complete experience should let a visitor:

1. Start watching and adjusting the simulation immediately.
2. Inspect a cell and understand exactly what changed it.
3. Scroll through a short, reversible explanation of the machinery.
4. Revisit a recorded moment and fork it into two experiments.
5. Share a starting setup or export a recorded replay, with those actions clearly distinguished.

## What the repository actually contains

This is a source review, not a live-site performance or accessibility audit. Main now contains eight files, including the roughly 42 kB single-file app, README, package files, two browser-test files and a CI workflow. The live URL listed by the repository is [brickflux.vercel.app](https://brickflux.vercel.app); deployment parity with main has not been verified.

| Finding | Evidence in the reviewed source | Consequence for the revamp |
| --- | --- | --- |
| Canvas2D, ordinary JavaScript, inline CSS and engine; npm tests and CI, but no application build system | [README](https://github.com/maitranilim/make-or-break/blob/2a4ac36e3ae9a225fe5ca201665cd0b638735fcb/README.md), `index.html` | Modularize incrementally. Keep Canvas2D as a working renderer and fallback. |
| An 800 × 600 logical world with 14 × 20 cells; each cell starts active with probability 0.3 | `LOGICAL_WIDTH`, `initBricks()` | Preserve all 280 cells and world coordinates. The initial count varies; it is not exactly 30%. |
| Builder restores inactive cells; Breaker clears active cells | `checkBrickCollision()`, `triggerBrick()` | Cell appearance must represent active/inactive state, not invented ownership. |
| Multi affects the hit cell and up to eight neighbors, and skips the normal bounce | `getNeighbors()`, `checkBrickCollision()` | Explain both rule changes. Show actual changed cells, including edge and corner cases. |
| Movement uses variable frame duration; chaos rolls once per update | `gameLoop()`, `update()` | Rendering frequency can change trajectories. Seeded initialization alone cannot provide exact replay. |
| The timer calls `endGame()`, then the same update continues moving the agents | `update()`, `endGame()` | Freeze the final state before publishing the result; prevent a score/board mismatch. |
| Builder wins only above 50% active; a 50% tie belongs to Breaker | `endGame()` | Label the threshold explicitly. Do not silently redesign scoring. |
| Time is read at reset; speed, chaos and Multi are read during play | `resetSimulation()`, `update()` | Mark duration “next round”; log live parameter changes at a simulation tick. |
| Zoom is disabled, slider labels are not associated labels, range outlines are removed, Multi's checkbox is hidden with `display:none` | viewport, control markup and CSS | Restore zoom, focus, meaningful labels and keyboard operation before visual complexity. |
| No exposed Pause control; history is a visual side drawer | control markup, UI bindings | Add Pause/Resume and accessible drawer/dialog behavior. |
| History reads/writes are guarded following PR #1; AdSense is already present | `loadHistory()`, `saveHistory()`, page head | Preserve the storage guards. Retain the ad integration and reserve its layout space outside the arena. |

### Merged work to preserve

[PR #1](https://github.com/maitranilim/make-or-break/pull/1) added seeded challenge links, share/retry controls, guarded local storage and seven browser tests. [PR #2](https://github.com/maitranilim/make-or-break/pull/2) added CI and three smoke tests. Both merged while this plan was being prepared; the final baseline incorporates them. The current app source matches the reviewed PR #1 head `e6b66aedb1eec5ca66cf76b519d74225f26b0938`.

The challenge tests freeze `requestAnimationFrame` for most checks. The smoke tests check boot, advancing movement and a timer label. Together they do not establish deterministic full-round replay. Their execution has not been independently verified in this planning task.

CI currently runs `npm ci`, installs Playwright Chromium and runs `npm test` on PRs and pushes to main, using Node 20. Extend that workflow when introducing a build system; select a supported Node version compatible with the pinned tooling.

Before implementation, refresh main and any open PRs again. Start from current main, preserve both merged features and retain their tests while adapting the module-serving harness. Do not restore the earlier two-file baseline at `188780403c8778d1eaa29d77122027d43ea89b8b`.

## Signature interactions

These adapt the earlier *Future Web Interaction Research* to this specific simulation.

| Interaction | What the visitor sees and learns | Implementation choice | Equivalent access |
| --- | --- | --- | --- |
| **Living arena** | Restored tiles rise from their sockets; cleared tiles recede. A short ripple identifies the actual collision cluster. Two distinct agent silhouettes leave decaying trails. | Three.js instanced tiles, an orthographic camera, pooled trails and bounded emissive effects. Animate events from the engine. | Canvas2D draws the same state. Motion reduction removes height animation and trails. |
| **Cell microscope** | Hover reveals row/column, state, last actor, time and number of real state changes. Pinning the lens freezes a moment; the relevant path segment and affected neighbors light up. | Raycast to a stable cell ID; HTML inspector; recorded event index. No random hover statistics. | Tap or keyboard-select a cell; Enter pins; Escape closes and returns focus. A row/column selector avoids 280 Tab stops. |
| **Scroll dissection** | The board separates into three aligned planes: current cells, the last collision and the rule that produced it. Scrolling backward reassembles it. | One finite GSAP ScrollTrigger timeline over a frozen exhibit snapshot. Camera, layer spacing and annotation visibility share one progress signal. | Chapter buttons and static diagrams expose identical content; mobile uses ordinary stacked sections. |
| **Preset drum** | Five settings appear on a shallow cylindrical dial. The front card states what will change; Apply starts a new round deliberately. | CSS 3D transforms around semantic controls. Previous/Next/Apply; no infinite wrap. | Flat radio list on narrow screens or reduced motion. Native page scrolling stays available. |
| **Time ribbon** | A completed run unrolls into a time strip. Real change events mark the strip; dragging or stepping exposes the corresponding board state and score. | HTML range input plus SVG/canvas event strip, snapshot checkpoints and event playback. | Labeled time control, step buttons, event list and plain result table. |
| **Fork this moment** | A frozen board opens into two synchronized futures. A continues unchanged; B changes one chosen setting. The seam reveals cells where their states differ. | Clone full engine state at one tick; render two views with one renderer and scissor viewports. | Stacked A/B views or tabs with an exact metric comparison table. |

The first release delivers the arena, microscope, scroll dissection and preset drum. The second adds the time ribbon and two-future comparison. Their required recording foundations are built in the first release.

### The scroll sequence

The live arena remains the first screen. “Inspect the mechanism” starts the guided sequence; “Back to arena” is always available. Reading the lower explanation does not require a long introductory animation.

| Chapter | Reveal | Useful answer |
| --- | --- | --- |
| 1. Two agents | Separate the agents visually from the cell layer and show their different target states. | What can each agent change? |
| 2. One collision | Magnify one recorded interaction and its incoming/outgoing path. | Why did this cell change and did the agent bounce? |
| 3. Chain reaction | Display the clipped 3 × 3 neighborhood and actual before/after differences. | What does Multi really do? |
| 4. The outcome | Align the final grid with the occupancy trace and 50% threshold. | How is the winner decided? |

Use a deterministic demonstration run when no recorded event is available, labeled “Example round.” An inspected live round is paused explicitly. Scroll controls only presentation; it must never alter the live simulation tick, random stream, controls or score. Limit desktop pinning to one concise sequence, about three additional viewport heights. Touch and reduced-motion modes use chapter sections without forced pinning or scroll smoothing.

## Art direction and response

Use the existing dark, green and red identity with more spatial discipline: near-black background `#080B12`, panel `#141B28`, readable ivory `#EDF2F7`, muted text `#A8B4C5`, Builder `#4DFFAA`, Breaker `#FF687C`, inspection cyan `#75D9FF`. Verify contrast in implementation rather than treating these swatches as a compliance claim.

Keep the board nearly top-down during play; perspective must not obscure collisions. A restrained tilt belongs to inspection mode. Use solid panel surfaces behind controls, clear typography and stable click targets. Give agents shape and text cues as well as color.

Initial motion targets: 120–180 ms control feedback, 180–260 ms tile response and 350–500 ms deliberate view transitions. These are design starting points, to tune on devices. Avoid continuous text movement, full-screen glitching and camera shake. A brief outcome reveal can draw the final score; it must never delay the result or its controls. Sound remains opt-in; bind tones to emitted collision events and cap overlapping voices.

Presets are transparent experiments, not promises about winners:

| Preset | Breaker | Builder | Chaos | Multi | Duration |
| --- | ---: | ---: | ---: | --- | ---: |
| Equal speed | 400 | 400 | 0 | Off | 60 s |
| Recovery | 250 | 600 | 0 | Off | 60 s |
| Pressure | 650 | 300 | 10 | Off | 60 s |
| Chain reaction | 400 | 400 | 10 | On | 60 s |
| Slow study | 150 | 150 | 0 | Off | 30 s |

Retain the current slider ranges. Relabel chaos as “Chaos intensity”: the existing percentage is not the probability of a collision, destruction or winning.

## Stack and boundaries

| Tool | Responsibility | Decision |
| --- | --- | --- |
| Vite + TypeScript + semantic HTML/CSS | Modules, builds, types and the control surface | Recommended migration from the single file. Adds a documented dev/build step; preserve a static deployable output. |
| Existing Canvas2D | Immediate usable board, low-power mode and graphics fallback | Maintain it against the same engine/render contract. |
| Three.js with WebGLRenderer | Optional enhanced arena, tile instances, picking and two-view rendering | Lazy-load it. One shared renderer; no framework rewrite required. |
| GSAP + ScrollTrigger | Reversible exhibit camera/layer choreography | Load with the exhibit. Use `gsap.matchMedia()` for cleanup and motion preferences. |
| Native CSS transforms | Preset cylinder and ordinary UI transitions | Keep the preset controls as HTML. |
| Web Audio API | Event-based tones | Reuse and isolate the current audio behavior. |
| IndexedDB, with the small `idb` helper | Completed replay records | Optional persistence; memory mode must still work. Local storage holds small settings and legacy summaries. |
| Node's test runner + Playwright | Engine invariants and meaningful browser flows | Extend PR #1's tooling. Add `@axe-core/playwright` for automated accessibility checks, followed by manual keyboard checks. |
| Browser performance tools + Lighthouse | Frame timings, transfers, long tasks and loading | Record actual results and test devices; budgets below are proposed gates. |

Three.js instancing suits the repeated tile geometry; raycasting exposes an instance ID for mapping the lens to a cell. GSAP provides scroll progress and media-query cleanup. These are tool capabilities; the choice to use them here is a design recommendation.

Keep React/R3F out of this migration unless a separate product requirement justifies adopting React. Keep native scrolling initially; Lenis is unnecessary for the requested finite reveal. A general rigid-body engine would change the current game rules and is not required.

WebGPU is a later experiment behind the renderer interface. Do not treat a renderer swap as a free upgrade: Three.js documents `ShaderMaterial` for WebGLRenderer. Validate a WebGPU material/postprocessing approach separately if the project later needs it.

## Architecture and trustworthy data

The engine owns the rules and time. Renderers receive snapshots and events. UI controls submit validated commands. Neither the DOM, GSAP nor pointer movement can write directly into engine state.

| Module boundary | Proposed files | Contract |
| --- | --- | --- |
| Simulation | `src/sim/types.ts`, `engine.ts`, `rng.ts`, `rules.ts` | Seed/config → state; fixed tick + commands → next state + events. No DOM, drawing or audio imports. |
| Recording | `src/replay/recorder.ts`, `playback.ts`, `storage.ts` | Versioned checkpoints, command log, transitions and indexed cell history. |
| Rendering | `src/render/canvas2d.ts`, `three-arena.ts`, `quality.ts` | Render, resize, pick and dispose. Switching renderers preserves the round. |
| Interaction | `src/ui/controls.ts`, `inspector.ts`, `presets.ts`, `history.ts` | Accessible actions, selection and readable metrics. |
| Exhibit | `src/exhibit/timeline.ts`, `chapters.ts` | Frozen exhibit state + normalized scroll progress → presentation only. |
| Comparison | `src/compare/fork.ts`, `comparison-view.ts` | Clone snapshot into A/B; apply one declared difference; synchronize ticks. |
| Sharing | `src/share/challenge.ts` | Parse legacy/new URLs, serialize setups and label replay exports correctly. |
| Application | `src/main.ts`, `src/app.ts`, `src/styles/` | Own lifecycle, visibility, view mode and feature loading. |

Keep three independent coordinates: simulation tick, replay playhead and exhibit progress. A pointer location is selection input, never an implicit engine command.

Use 120 fixed simulation ticks per simulated second as the initial engineering choice. Render with interpolation; bound catch-up work. On a hidden tab, pause and discard wall-time backlog. On returning, show a Resume action. Ordinary performance degradation can slow wall-time progress; it must not skip simulation ticks or fabricate results.

Introduce an engine version for timing/rule changes. Preserve PR #1's seeded starting-grid fixtures and legacy URL parsing. Do not claim that a new engine recreates an old frame-dependent outcome. Test repeatability under different rendering schedules, then across the target browsers before making any cross-browser exactness claim.

For comparison, clone positions, velocities, occupancy, tick, remaining duration, configuration and random state. Use a deterministic chaos sample schedule keyed by seed, agent and tick, so both branches receive the same noise schedule when chaos is unchanged. Report “B ended with X more active cells in this run”; one fork does not establish a general winning strategy.

Record real changes only. A Multi collision touching an already-matching neighbor does not count as another restoration/destruction. Cell state, occupancy, history, audio and outcome must derive from the same event/state boundary.

### Sharing and history

Preserve the distinction between **Try this grid**, **Watch replay**, **Share starting setup** and **Export replay**. A seed plus settings describes initialization. It does not contain live edits, a complete history or every subsequent event.

Support the existing `seed`, `breaker`, `builder`, `time`, `chaos` and `multi` parameters. Add a version marker for new engine setups. Retain old history entries as summary-only records; missing data must never become an invented replay. Full replay exports include schema/engine versions, configuration, snapshots, commands and recorded transitions.

## Delivery and quality gates

| Milestone | Included build steps | Reviewable result |
| --- | --- | --- |
| Foundation | 01–04 | Compatible challenge flows, isolated engine, stable timing and honest event records. |
| First release | 05–08, then release checks from 12 | Accessible controls, living arena, microscope, preset drum and scroll dissection. |
| Complete revamp | 09–11, then all of 12 | Replay ribbon, two-future fork and complete history/share experience. |

The priorities if capacity becomes tight are readable controls, correct state, arena, microscope and rule dissection. Defer the cylinder's depth treatment and cinematic transition polish before cutting functionality.

Proposed performance budgets, to validate on a documented mid-range laptop and physical mid-range phone:

- Usable controls plus Canvas2D before optional 3D/exhibit downloads; core HTML/CSS/JS target ≤150 kB compressed, excluding existing advertising.
- Optional graphics/exhibit code target ≤600 kB compressed combined; total first-party initial transfer ≤1 MB. Prefer procedural geometry; no video background.
- Target p95 frame duration ≤20 ms on the desktop and ≤34 ms on the phone during representative rounds. Record settings, viewport, DPR, device, browser and sample duration.
- Default DPR cap 1.5 on mobile and 2 on desktop. Reduce bloom, trail density and resolution before changing simulation behavior.
- Keep at most one WebGL context. Dispose listeners, geometries, materials and timelines. Context loss falls back to Canvas2D using the current state.
- Store 20 lightweight summaries and at most 10 completed full recordings within a 40 MiB replay budget. Handle denied storage and quota exhaustion. An 8 MiB per-run recording cap must produce a clearly labeled partial recording if reached, never a false “full replay.”
- Reserve ad space to avoid layout jumps and report both first-party-only and normal ad-enabled loading behavior.

Release checks include 320 px layouts, 200% zoom, visible focus, labeled controls, Pause/Resume, keyboard/touch parity, meaningful screen-reader summaries, motion preference changes, graphics loss, storage failure and seed-link compatibility. Use at least 44 px control hit targets as a design target. Do not announce every collision to assistive technology; announce selected events and round results.

A useful acceptance session: a new visitor can change a speed, explain one inspected collision, identify the win threshold and share a setup without reading a long FAQ. In the complete revamp they can also scrub a replay and explain the one setting changed in a fork.

## Research and technical references

The interaction selection applies the earlier *Future Web Interaction Research* report dated 25 September 2026. Repository facts above come from the pinned main source, PR #1 diff, merged CI workflow and smoke tests. No runtime measurements are claimed.

Official references checked 28 September 2026:

- [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html): repeated geometry, instance transforms/colors and resource disposal.
- [Three.js Raycaster](https://threejs.org/docs/pages/Raycaster.html): pointer picking and `instanceId`.
- [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/): bounded scroll-linked timelines.
- [GSAP matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/): responsive setup, cleanup and reduced motion.
- [Three.js ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html): WebGL renderer compatibility.
- [Vite guide](https://vite.dev/guide/): development and production build setup. Check the required Node version when pinning dependencies.
