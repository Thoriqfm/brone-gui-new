# Animation Engine Foundation and Lifecycle Management

Date: 2026-10-31. Scope: lifecycle infrastructure only. No expression transition, crossfade, intensity effect, blinking, gaze, idle motion, viseme or audio behavior was implemented. Existing expression selection and approved static composition remain immediate and unchanged.

## 1. Implemented architecture

[animationEngine.ts](../src/animation/animationEngine.ts) now exports:

- createAnimationEngine(driver): an independent registry and lifecycle owner.
- loadAnimeDriver(): a lazy loader for the installed Anime.js v4 adapter.
- AnimationDriver / AnimationInstance: the small create/play/cancel/revert boundary used by production and deterministic tests.

[useAnimationEngine.ts](../src/animation/useAnimationEngine.ts) creates an engine for each mounted FaceRenderer after its driver loads. [FaceRenderer.tsx](../src/components/face/FaceRenderer.tsx) attaches the hook's rootRef to its existing face-artwork div. No wrappers, new layout rules or new rendering branches were introduced.

~~~text
Mounted FaceRenderer
  -> layout effect starts lazy Anime.js import
  -> per-mount engine registers face-root via existing DOM ref
  -> trusted future frontend callers may start/cancel registered target work
  -> ref cleanup / engine disposal stops work and unwinds owned mutations
~~~

Nothing calls start from production face code in this phase. Expression Controller, Zustand, App, WebSocket routing and shared protocol do not supply animation parameters and were not changed.

## 2. Anime.js v4 API usage

The installed node_modules/animejs/package.json reports 4.5.0. Its exports and declarations were inspected directly:

| Installed source | Verified API / behavior |
| --- | --- |
| dist/modules/animation/animation.d.ts | Named animate(targets, parameters) returns JSAnimation; revert restores affected original values. |
| dist/modules/timer/timer.d.ts | play, cancel, revert and callback lifecycle methods. |
| dist/modules/timer/timer.js:418–426 | cancel removes tween siblings, marks the instance cancelled and pauses it; it does not seek back to the beginning. |
| dist/modules/animation/animation.js:711–714 | revert invokes timer reversion and restores affected values. |
| dist/modules/types/index.d.ts | AnimationParams and the seven supported callbacks wrapped by the engine. |

The production adapter calls the v4 named animate function with an actual registered element reference, never a selector. Engine creation forces autoplay false, attaches ownership and guarded callbacks, then calls play. The start API always starts work; callers do not control playback ownership through autoplay.

Normal cancellation calls cancel. Target teardown and engine disposal call revert on owned instances in reverse creation order. No v3 anime({...}) or global anime.remove call is used.

All runtime Anime.js imports occur inside loadAnimeDriver, called by the mounted hook. Engine module evaluation imports only TypeScript types; it does not access window/document, start a browser animation, or construct a global Brone engine. Anime.js has its own package-level scheduler, but Brone's instances and target ownership remain per renderer.

## 3. Animation instance ownership

Each engine has a private map of target name to element, current run token and owned-instance undo history. One active run per registered target is permitted. Different registered elements may have independent active runs.

The engine returns a controlled API: registerTarget, start, cancel, cancelAll, dispose, hasTarget, isAnimating and disposed. start returns a boolean rather than exposing the raw animation instance. Unknown, detached or disposed targets cannot start work. The registry holds DOM refs, never CSS selector strings.

No engine handles, progress, timers or frame callbacks enter Zustand. A test verifies that engine/driver/hook activity leaves the canonical store snapshot unchanged. No application singleton or unmanaged Brone animation is created.

## 4. Target registration mechanism

registerTarget(name, element) requires a connected element and rejects both duplicate names and multiple aliases for the same element within one engine. It returns an idempotent unregister closure bound to that registration's identity. An old cleanup closure cannot remove a later registration that reused the name.

| Potential target | Current wiring / reason |
| --- | --- |
| face-root | Registered: existing stable face-artwork div, via rootRef. |
| face-base | Deferred: its image is inside FaceBase/FaceLayer; no DOM ref is currently exposed to FaceRenderer. No ref threading was added merely to animate nothing. |
| eyes | Deferred: Eyes returns a fragment containing two images, with no group element. A future feature can expose left/right role refs without inventing a wrapper now. |
| mouth | Deferred: Mouth returns FaceLayer; its image currently exposes no DOM ref to the parent. |
| effects | Deferred: FaceEffects returns dynamically keyed images; it has no persistent group element. Effect IDs will need individual lifecycle-bound refs. |

The registry itself supports multiple independent targets, exercised with eyes/mouth names in tests. Only face-root is wired into the actual renderer today. There are no document queries, dynamic CSS selectors, asset-name selectors, or changes to approved dimensions/z-order/clipping.

Future dynamic target integrations must call their returned unregister function when the element detaches. The renderer root is disposed by layout-effect cleanup. A disconnected target found at start or in a guarded lifecycle callback is unregistered defensively; this is not a MutationObserver-based DOM removal service. External DOM owners should unregister before removing an element rather than rely on the next callback. No browser claim about intra-frame removal timing is made.

## 5. Cancellation behavior

cancel(name) invalidates the active run before invoking the driver's cancel method. Repeated cancellation and cancellation of unknown names are harmless. It leaves the element's current values intact and retains the target registration for later reuse. It does not call revert during ordinary interruption.

cancelAll applies this operation to each target independently. A failure from one driver does not skip attempts on remaining targets; errors are reported as AggregateError. Cancelling eyes does not cancel mouth. Cancelling one engine does not affect another engine.

Completed and cancelled instances remain in that target's undo history until unregister/disposal so earlier property mutations can also be restored. This history is not counted as active work.

## 6. Interruption handling and stale callbacks

start first cancels the current run on that target, then creates its replacement. The old instance is stopped before replacement creation; current visual values are preserved as the next animation's starting context unless trusted parameters explicitly specify a different from value. No facial motion parameters are defined here.

All v4 lifecycle callbacks are guarded: onBegin, onBeforeUpdate, onUpdate, onLoop, onPause, onComplete and onRender. A callback must belong to the current registration, active run and live engine, and its element must remain connected. Construction callbacks are suppressed until ownership is attached. Cancellation invalidates callbacks before calling driver code. Completion clears the active run once before invoking the caller.

Stale completion cannot clear a replacement. Interrupted, completed, unregistered or disposed run callbacks cannot reach user callbacks through the engine. A callback may synchronously start a replacement; if that old callback then throws, its error path cannot cancel the newer run. Creation errors clear the failed active token and propagate; the registration can accept a later request.

These callbacks are available only to trusted frontend code. No WebSocket command gains access to animation configuration or executable callbacks.

## 7. Cleanup behavior

Unregistering a target cancels its active run, removes its registry entry and reverts every owned instance in reverse creation order. This restores original values across multiple interruptions rather than restoring only the most recent intermediate starting point. It clears the undo list afterward.

dispose marks the engine disposed before cleanup, then unregisters all targets. It is idempotent, prevents later starts/registrations, and releases registered targets and owned handles. All cleanup attempts run even if an individual driver method throws; errors are surfaced as AggregateError after the remaining resources are handled. Repeated dispose does not retry already-released resources or act on another engine.

A registered target has one retained handle per start until teardown. This is a deliberate simple undo history, not a bounded pool: long-lived, high-volume repeated animations would grow this history. Before such traffic is introduced, compact property baselines or an equivalent bounded undo policy will need a separate design. No animation traffic is generated by this phase.

## 8. React lifecycle integration

The hook uses refs and useLayoutEffect, with no React state or Zustand writes. The effect runs once per mount; ordinary expression rerenders reuse its engine. Layout-effect cleanup owns teardown during unmount, including switching to the original-image-only view.

Anime.js loads asynchronously after mount. engineRef.current remains null until initialization completes, so future consumers must tolerate that readiness state. A stopped flag and root identity/connected checks prevent an unmounted or superseded effect from creating an engine after its import resolves. Cleanup clears engineRef before disposal. An old cleanup checks identity before touching that ref and cannot clear a remounted engine.

StrictMode setup/cleanup/setup creates a fresh engine for the surviving lifetime. Multiple mounted FaceRenderer instances get separate registries. Driver-loading failures are logged and leave the engine unavailable; rendering remains independent. No new retry scheduler was added.

Server-side rendering executes no engine initialization, driver import or animation start through the hook. Existing static renderer output is preserved apart from a nonserialized React ref.

## 9. Test results

Executed on Windows with Node.js 24.14.1, TypeScript 5.9.3, Vite 7.3.7 and Anime.js 4.5.0. No dependencies were installed. Commands ran from frontend using native child-process execution through the Node tool, as in the preceding implementation task.

| Command | Result |
| --- | --- |
| npm run typecheck | PASS, exit 0. |
| npm run build | PASS, exit 0; 98 modules transformed, including the lazy Anime.js chunk. |
| node scripts/verify-face-layers.mjs | PASS, exit 0; 8 static compositions, 27 SVGs, geometry/order/path checks and SSR switching. |
| node scripts/verify-expression-controller.mjs | PASS, exit 0; existing parser/controller/socket/preview regressions. |
| node scripts/verify-animation-engine.mjs | PASS, exit 0; lifecycle, production adapter and shallow hook checks. |
| git diff --check | PASS, exit 0; Git emitted LF/CRLF normalization warnings for working-tree files. |
| Browser visual animation / real React DOM StrictMode / live FastAPI | NOT RUN. No such results are claimed. |

[verify-animation-engine.mjs](../scripts/verify-animation-engine.mjs) tests initialization, duplicate/alias registration rejection, connected-target validation, unregister identity safety, driver creation, cancellation order, replacement, target-specific/all-target cancellation, independent targets/engines, completion, removed targets, cleanup, repeated disposal and stale callback suppression. It also covers failed creation, reentrant callback errors and one cleanup failure without skipping other resources.

The production adapter smoke test uses actual Anime.js JS object targets and seek to assert intermediate values without timing races. It verifies real cancel value preservation, real revert restoration and an actual two-run engine undo chain. These are object-target API tests, not rendered DOM or facial animation tests.

A shallow hook harness transpiles the actual hook with installed TypeScript and substitutes React ref/effect primitives plus a deferred driver loader. It exercises no initialization during render, unmount-before-load, StrictMode-style setup/cleanup/setup, reuse across rerenders, independent mounts, cleanup of owned work, remount, stale cleanup and a root removed before readiness. Mount alone creates no animation instances. It does not reproduce browser scheduling or paint.

During development, one event-order assertion used an incorrect slice index and was corrected. An SSR-only Vite dependency scan also raced shutdown after tests passed; the new verifier now disables unused client dependency discovery and filesystem watching. The final complete verification run above passed with no stderr from any of the five frontend commands. Existing verifier scripts were not altered in this task.

## 10. Modified files

| File | Change |
| --- | --- |
| src/animation/animationEngine.ts | Replaces placeholder with driver boundary, registry, guarded lifecycle and cancellation/cleanup. |
| src/animation/useAnimationEngine.ts | New mounted, ref-based async driver/engine lifecycle hook. |
| src/components/face/FaceRenderer.tsx | Calls hook and attaches ref to existing face-artwork element. |
| scripts/verify-animation-engine.mjs | New focused deterministic verification script. |
| reports/ANIMATION_ENGINE_IMPLEMENTATION.md | This report. |
| tsconfig.tsbuildinfo | Generated TypeScript build metadata updated by required checks. |

Production dist output was regenerated by npm run build. The existing layer verifier regenerated runtime-config.json with identical contents. Task-baseline SHA-256 checks found only animationEngine.ts, FaceRenderer.tsx and generated tsconfig.tsbuildinfo changed among existing inspected files, plus the new hook, verifier and this report. Pre-existing user changes were preserved.

## 11. Remaining limitations and next step

Only face-root is connected to real renderer DOM. More granular targets need narrow ref integration when a feature actually uses them. No property ownership policy between future expression/idle/viseme features, motion presets, renderer transition buffers, image decoding or timing behavior has been implemented. React-owned layout styles should not be animated by future callers without an explicit ownership boundary.

The undo history grows with starts until target teardown; the engine does not poll for arbitrary external DOM removal. Production animation configurations remain trusted internal frontend parameters. Browser DOM style restoration and target-device behavior remain unverified. No FPS or latency measurements were collected.

Expression Controller semantics, canonical Zustand fields, backend source, shared protocol, dependencies/lockfile, SVG/PNG/WebP assets and approved layout/composition configuration are unchanged from this task's baseline. The next phase can define approved expression motion and granular target/property ownership before implementing transitions. That phase was not started here.
