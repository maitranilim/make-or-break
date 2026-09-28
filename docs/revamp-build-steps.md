# Make or Break — executable build steps

Use this with [the revamp plan](revamp-plan.md). Each numbered step is a proposed implementation PR with a concrete acceptance gate. These tasks are **not yet implemented or tested** by this planning PR.

Implement dependencies in order. Keep a working, previewable app after every step. The first release ends at step 08 plus the applicable checks in step 12; the complete revamp includes all twelve steps.

## Build order

| Step | Depends on | Deliverable | Suggested branch suffix |
| --- | --- | --- | --- |
| 01 | Current main and merged PRs #1/#2/#4 review | Baseline and compatibility fixtures | `baseline` |
| 02 | 01 | Modular app and dual-renderer contract | `modules` |
| 03 | 02 | Versioned fixed-tick engine | `engine` |
| 04 | 03 | Event recording and cell history | `recording` |
| 05 | 02–04 | Accessible control deck and view states | `controls` |
| 06 | 04–05 | Three.js arena with Canvas2D fallback | `arena` |
| 07 | 04–06 | Cell microscope | `inspector` |
| 08 | 05–07 | Scroll dissection and preset drum | `exhibit` |
| 09 | 04–07 | Time ribbon and recorded playback | `replay` |
| 10 | 03, 09 | Forked comparison | `fork` |
| 11 | 01, 09–10 | Durable history and clear sharing flows | `history-share` |
| 12 | 01–08 for release one; 01–11 for complete release | Measured release candidate | `release-checks` |

Use a `revamp/` branch prefix. Prefer small sequential PRs over replacing the entire application in one commit.

## 01 — Capture the baseline and preserve the challenge work

**Touch:** `README.md`, `tests/challenge.test.mjs`, `tests/fixtures/`, `docs/revamp-validation.md`.

- Refresh main, open PRs and applicable repository instructions. Record the exact reviewed SHAs; the plan's SHA is a snapshot, not an instruction to overwrite later work.
- Start from current main, which includes PRs #1, #2 and #4 at this review. Run the twelve challenge, smoke and angle tests before changing their harnesses and record the actual outcome.
- Capture desktop and narrow-screen screenshots, default values, grid geometry, winning threshold, Multi behavior, sound toggle and legacy history shape.
- Save initial occupancy fixtures for several valid seeds, including 0 and the upper unsigned 32-bit boundary. Add malformed and out-of-range URL cases.
- Establish round semantics: speeds/chaos/Multi apply on the next tick; duration applies on the next new round. Preserve the current 50% tie behavior.
- Record current AdSense placement and the repository's linked deployment configuration if accessible. Source metadata does not prove the live deployment matches main.

**Done when:** the selected implementation base is recorded; seeded grids and current control/share behavior have reproducible fixtures. Any baseline failures are recorded separately from new regressions.

## 02 — Extract the app without redesigning its rules

**Touch:** `index.html`, `package.json`, lockfile, `tsconfig.json`, `.github/workflows/ci.yml`, `src/main.ts`, `src/app.ts`, `src/sim/`, `src/render/canvas2d.ts`, `src/audio.ts`, `src/styles/`.

- Move styles, controls, drawing, audio, history and engine functions into their respective modules. Keep the 800 × 600 world, 14 × 20 grid, existing Canvas2D output and PR #4's 15-degree off-axis heading guard.
- Introduce Vite and TypeScript. Pin resolved dependencies in the lockfile and document a compatible Node runtime. Do not run a scaffold generator over the repository.
- Extract pure rule functions from `checkBrickCollision()`, `getNeighbors()`, `triggerBrick()` and `endGame()`. Pass configuration/state as arguments instead of reading DOM inputs.
- Define a renderer contract: `render(snapshot, viewState)`, `resize(size, dpr)`, `pick(pointer)` and `dispose()`. It must not own simulation time.
- Keep PR #1's challenge parser/share behavior operational. Update all three browser test servers: they currently respond with the same HTML for every path, which will not serve imported modules correctly. Serve the Vite app or built preview. Preserve PR #2's smoke checks and PR #4's angle checks.
- Add a TypeScript loader such as `tsx` for Node unit tests. Retain the existing Node/Playwright browser runner. Extend CI to run types, unit/browser checks and the production build on a supported Node version compatible with the pinned dependencies.
- Preserve metadata and the ad integration. Document that development now uses an HTTP dev server and production uses generated static files.

**Done when:** the original interaction works through the module build; fixtures and existing browser tests still pass. Browser errors, duplicate animation loops and missing assets are absent.

**Command surface to implement:** `npm run dev`, `npm run typecheck`, `npm run test:unit`, `npm run test:e2e`, `npm test`, `npm run build`, `npm run preview`. These commands are proposed; they do not all exist on the reviewed baseline.

## 03 — Make time and outcomes stable

**Touch:** `src/sim/types.ts`, `engine.ts`, `rng.ts`, `rules.ts`, `src/app.ts`, `tests/unit/engine.test.ts`.

- Introduce `engineVersion`, integer `tick`, immutable starting configuration and a tick-stamped command queue.
- Step at 120 Hz. Rendering interpolates between simulation snapshots; it never supplies a variable rule timestep.
- Bound work per animation frame. Discard hidden-tab wall-time backlog and require Resume on return. Never advance the timer without advancing the corresponding engine ticks.
- Convert chaos sampling to a tick-based schedule. As an initial calibration, a 5% event chance at a nominal 60 Hz corresponds to `1 - (1 - 0.05) ** (60 / 120)` per 120 Hz tick. This is an intentional engine-version change, not legacy trajectory compatibility.
- Derive chaos samples deterministically from seed, actor, tick and sample channel. Grid initialization retains the old seeded occupancy mapping. Record any changed launch or collision behavior in the engine-version notes.
- Preserve normal bounce versus Multi's non-bouncing neighborhood effect and `keepOffAxis()` at launch/after steps. Define processing order as Breaker then Builder and row-major cell lookup, matching the current source.
- Return immediately when the final tick ends the round. Compute the result from that frozen state once; write history once.
- Validate finite velocities, bounds and command ranges. If collision corrections change gameplay, document them as rule changes rather than hiding them inside a graphics commit.

**Done when:** a full run with the same version/seed/commands has the same final state under synthetic 30, 60 and 144 Hz render schedules. Pause, resize, drawer opening and renderer selection do not change a tick's state.

**Meaningful checks:** single-cell hit, Multi at corner/edge/interior, no-op neighbor changes, 50% tie, timer boundary, no post-result mutation, maximum speeds, off-axis headings with speed/sign preservation, duplicate end-game calls and same-tick command ordering. Cross-browser exactness is a separate release gate; do not promise it from a same-process test.

## 04 — Record enough truth for every visual

**Touch:** `src/sim/events.ts`, `src/replay/recorder.ts`, `src/replay/types.ts`, `tests/unit/recording.test.ts`.

- Emit a collision event containing ID, tick, actor, hit cell, incoming/outgoing motion and the cells whose active state actually changed.
- Record per-cell before/after values. Maintain count, last actor, last-change tick and an event index per cell.
- Separate state transitions from visual/audio responses. Every UI metric and animation uses these events or the authoritative snapshot.
- Record initial state, tick-stamped commands and checkpoints every simulated second. Include positions, velocities, occupancy, configuration, random state and all other state needed to resume exactly.
- Keep a versioned in-memory recording first. Index events by tick and cell ID; store compact arrays rather than growing strings or storing full trail geometry every frame.
- Enforce the 8 MiB recording limit. If reached, retain the summary and explicitly mark the available replay range as partial. Never show a full-replay badge on truncated data.

**Minimum contracts:**

~~~ts
type CellId = number; // row * 20 + column
type Actor = 'breaker' | 'builder';
type CellChange = { cellId: CellId; before: boolean; after: boolean };
type CollisionEvent = {
  id: number;
  tick: number;
  actor: Actor;
  hitCell: CellId;
  changes: CellChange[];
  // Add typed motion data for explaining this collision.
};
type RecordedRun = {
  schemaVersion: number;
  engineVersion: string;
  seed: number;
  complete: boolean;
  // Initial config/state, checkpoints, commands and events.
};
~~~

This is a contract sketch, not drop-in implementation. Fully type its remaining fields in this step.

**Done when:** reconstructing occupancy at selected ticks from recorded transitions matches the engine snapshot. A cell touched twice has a truthful history; a Multi event counts only real changes. Recording does not alter the outcome.

## 05 — Build the control deck and clear view states

**Touch:** `src/ui/controls.ts`, `view-state.ts`, `src/styles/tokens.css`, `layout.css`, `tests/controls.test.mjs`.

- Create the first-screen layout: identity, compact readable controls, board, active-cell count, timer and win threshold. Preserve immediate play.
- Add Pause/Resume, Restart/New Round, sound, graphics quality and the existing challenge actions.
- Use associated labels and `output` values; provide keyboard-focusable native inputs and an explicit next-round label for duration. Keep control feedback usable after a round ends.
- Model live, paused, inspecting, replay and compare as explicit view states. Entering inspection pauses and snapshots the current round; closing it returns to the paused board with Resume available.
- Restore browser zoom, focus outlines and sufficient hit areas. Pair actor colors with labels and distinct shapes.
- Build the history drawer with Escape handling, initial focus and focus restoration; trap focus only while it behaves as a modal.
- Honor reduced motion at startup and when the preference changes. Use polite announcements for outcomes and selected actions, not every frame.

**Done when:** a keyboard-only visitor can change every setting, pause, restart, open/close history and share. At 320 px and 200% zoom, controls remain reachable without covering essential board information.

## 06 — Create the living Three.js arena

**Touch:** `src/render/three-arena.ts`, `materials.ts`, `quality.ts`, `src/styles/arena.css`.

- Add Three.js as a lazy dependency. Render the usable Canvas2D board before the enhanced renderer is ready.
- Map all 280 cells to stable instance IDs. Use shared box geometry for active tiles and inexpensive socket geometry/lines for inactive cells.
- Keep logical collision geometry in the engine. Cell rise/collapse is presentation interpolation, not extra physical volume.
- Use an orthographic camera for play. Add subtle material depth, two distinguishable agent meshes and pooled trails driven by recorded positions.
- Animate only changed cells and the actual affected cluster. Keep glow restrained so active/inactive states and the agent silhouettes remain readable.
- Use one render loop owner, one WebGL context and capped DPR. Quality settings reduce effects, never the simulation rate.
- Handle initialization failure/context loss by restoring Canvas2D with the current state. Dispose GPU resources and keep picking bounds consistent with animated instance transforms.

**Done when:** a side-by-side fixture has identical occupancy and agent coordinates in both renderers. Picking matches visible cells at several sizes/DPRs. Toggle graphics repeatedly and verify that the round, input handlers and resource counts remain stable.

**Visual review:** capture normal, Multi, paused and final-result states on desktop and phone. Approve readability and composition before adding more effects.

## 07 — Add the cell microscope

**Touch:** `src/ui/inspector.ts`, `src/render/selection.ts`, `tests/inspector.test.mjs`.

- Map pointer picking to a stable cell ID and show a small HTML preview. Keep the pointer and buttons stationary.
- Show coordinates, active/inactive state, last real change and number of changes. “Unchanged since start” is valid.
- On click/tap/Enter, pin the inspected moment and display its event context: incoming path, hit cell, changed neighborhood and bounce rule.
- Add keyboard cell navigation and row/column selection. Escape closes the inspector and restores its trigger's focus.
- Keep live hover non-invasive; only explicit pinning enters paused inspection. Avoid flooding announcements as the pointer moves.

**Done when:** inspector values match a known event fixture, including a Multi collision with unchanged neighbors. Touch, keyboard and mouse can reach the same information.

## 08 — Build the scroll dissection and finite preset drum

**Touch:** `src/exhibit/timeline.ts`, `chapters.ts`, `src/ui/presets.ts`, `src/data/presets.ts`, `tests/exhibit.test.mjs`.

- Implement the four chapters in the plan with one frozen exhibit snapshot. Choose an actual recorded event or a labeled deterministic example.
- Separate the cell, event and rule layers spatially. Link camera/layer presentation to a normalized 0–1 scroll value with GSAP ScrollTrigger.
- Keep captions in normal HTML. Provide chapter buttons, Back to arena and complete non-animated content.
- Use `gsap.matchMedia()` to scope desktop pinning and clean up when layout or motion preference changes. Refresh after fonts/layout settle.
- Use native scroll. Do not intercept the wheel to rotate presets or register another smooth-scrolling engine.
- Implement the five specified presets as semantic radio controls. Add a shallow cylindrical visual on suitable screens, bounded Previous/Next selection and explicit Apply.
- Preview settings without changing the active round. Apply starts a new round; show exactly which values will change.

**Done when:** forward/reverse scroll yields the same presentation state; no simulation tick/configuration changes while an inspected snapshot is paused. Resizing mid-exhibit produces no stranded pin spacer or duplicate listener. Mobile and reduced-motion paths expose all four explanations and all presets.

## 09 — Make the time ribbon an actual replay tool

**Touch:** `src/replay/playback.ts`, `src/ui/replay-controls.ts`, `timeline-strip.ts`, `tests/replay.test.mjs`.

- Add Watch replay to complete recorded rounds. Keep Try this grid as a separate action.
- Render occupancy over time with true timestamps and real event markers. Label the 50% threshold and expose equivalent numeric values.
- Implement play/pause, time scrub, step to previous/next event and jump to a selected cell's last change.
- Reconstruct from the nearest checkpoint and intervening events; use supported engine-version state to restore motion. Keep visual interpolation out of recorded truth.
- Debounce expensive seeks, cancel stale work and render on demand when paused.
- Preserve old summary-only records as readable history without a replay button. For partial recordings, expose only the actual retained range.

**Done when:** seeking to beginning, event boundaries and end matches known snapshots. Repeated backward/forward seeks do not duplicate events or audio. Playback cannot mutate the saved run or live round.

## 10 — Let the visitor fork one moment into two futures

**Touch:** `src/compare/fork.ts`, `comparison-view.ts`, `tests/unit/fork.test.ts`, `tests/compare.test.mjs`.

- Add Fork this moment at a valid paused/replay checkpoint. Clone the complete resumable engine state into A and B.
- Default to changing only Builder speed in B. Expose the changed setting and its before/after value prominently. A remains unchanged.
- Advance both branches to matching ticks. Keep unchanged chaos driven by the same seed/actor/tick schedule.
- Use two scissor viewports in one WebGL renderer. A stable draggable seam or A/B toggle reveals differences; camera motion is optional presentation.
- Show active cells, percentage, changes since the fork and winner at the same time in each branch. Highlight differing cells without replacing their state colors.
- On small screens use A/B tabs and a comparison table. Keep the parent round and stored replay untouched.
- End at the original round's end tick; do not silently grant B more simulated time. Limit the initial comparison controls to one declared change.

**Done when:** identical branches remain identical. A single controlled change can diverge while both still show the same tick. Reset restores the fork snapshot. The summary describes this run, without claiming a general causal law or guaranteed strategy.

## 11 — Finish persistence and sharing without ambiguity

**Touch:** `src/replay/storage.ts`, `src/share/challenge.ts`, `src/ui/history.ts`, `tests/challenge.test.mjs`, `tests/history.test.mjs`.

- Keep all PR #1 URL keys readable; validate inputs through shared parsing rules rather than relying only on DOM clamping.
- Add versioned setup links. Serialize the starting seed/configuration. If a run contains live edits, explain that a setup link does not contain its recorded play.
- Preserve 20 legacy summaries and migrate them without inventing configuration, dates or events. Keep the old storage key readable during migration.
- Store up to 10 completed replay records in IndexedDB within the 40 MiB budget. Evict oldest full recordings before summaries; handle blocked storage and quota failures with usable memory mode.
- Offer a versioned JSON replay export/import for complete local recordings. Validate schema, supported versions and size; treat imported text as data.
- Keep native share/clipboard fallbacks and cancellation behavior from PR #1. Clearly separate sharing a setup from exporting a replay.
- Clear History removes the relevant local summaries and replay records. Show the scope in the action; never remove unrelated browser data.

**Done when:** old challenge URLs still load the expected starting grids; malformed links are handled; a completed export/import round-trip preserves recorded results. Storage denial does not break play, results or sharing.

## 12 — Measure, verify and prepare the release

**Touch:** `docs/revamp-validation.md`, `README.md`, quality configuration and targeted fixes.

Run the gates relevant to the release scope; do not repeatedly broaden tests without an unresolved risk.

1. Run types, meaningful engine tests, browser flows and production build. Add coverage for regressions found during the earlier steps.
2. Verify current target versions of Chromium, Firefox and WebKit. For deterministic outcome claims, compare state checksums for the same fixture across browsers. If they differ, fix numeric stability or retain the narrower “same setup” claim; never loosen a test just to display “exact.”
3. Measure the documented transfer/frame budgets on a named desktop and physical phone. Test fast-agent/Multi/chaos scenarios, inspector, repeated replay seeks and dual comparison where implemented.
4. Check memory and resource stability over repeated rounds/view changes. Test graphics initialization failure and context loss.
5. Run automated accessibility checks and manual keyboard, screen-reader summary, touch, zoom and reduced-motion checks.
6. Capture first-screen, collision inspection, scroll chapter and result screenshots; add replay/fork evidence for the complete release.
7. Verify ordinary loading with the ad integration and loading with external requests blocked. Reserve layout space; do not make core play depend on the ad request.
8. Update README with the new run commands, exact feature scope, rules, sharing distinctions, renderer fallback and measured limitations. Record versions and devices beside results.
9. Produce a reviewable release PR and preview. Leave production deployment to the repository's normal release process.

**Done when:** every shipped feature has its gate satisfied, failures and limitations are explicit, and the validation record contains actual command results and measurements. A polished screenshot alone is not a release check.

## Initiation prompt for an implementation agent

~~~text
Revamp maitranilim/make-or-break using docs/revamp-plan.md and
docs/revamp-build-steps.md.

First inspect current main, repository instructions and any newer PRs. Preserve
merged PR #1's challenge links, PR #2's CI/smoke tests and PR #4's angle fix.
Complete step 01, then work through the dependencies in small reviewable PRs, keeping a usable app at each stage.

Build the first release: the living arena, cell microscope, scroll dissection
and finite preset drum, with an isolated deterministic engine, event recording,
accessible controls and Canvas2D fallback. Apply the release checks in step 12.
Use Vite, TypeScript, plain Three.js and GSAP as specified.

Do not mark replay or fork comparison complete until steps 09–11 and their
gates are implemented. Do not merge other PRs or publish production
as a side effect of implementation.

For each completed step report what changed, the checks actually run, a preview
or visual evidence where relevant, and remaining limitations. Keep a current
validation record. Begin with repository inspection and step 01.
~~~
