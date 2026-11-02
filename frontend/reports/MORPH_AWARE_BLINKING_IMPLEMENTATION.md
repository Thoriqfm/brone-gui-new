# Morph-Aware Blinking — Phase 1

Date: 2026-11-02. The five existing eye morph pairs now have a separate morph-aware blink adapter, a manual development preview, and a development-only connection to the actual procedural face renderer. Canonical blink engines/presets/artwork remain unchanged. The asset renderer remains default; release-build blinking and random automatic blinking remain disabled.

## 1. Existing blinking limitations

`generateExpressionBlinkGeometry` validates every supplied source field against the named canonical preset. Intermediate morph scenes legitimately differ in contours, dimensions, highlights, filters, masks and optional details. Supplying such a scene to the old API must therefore fail. That guard was preserved, rather than broadened to accept arbitrary geometry.

The existing production implementation is newer than the initial task context: it already routes other canonical face transitions through validated Idle eye/mouth legs. This phase does not add direct morph correspondences or change those routes.

## 2. Morph-aware architecture

The new path is:

```text
canonical source/target presets
    → existing interpolateEyeGeometry
    → validate actual current geometry against that context
    → interpolate per-side eyelid supports
    → intersect aperture/stroke with current eye scene/boundary
    → original source artwork plus local SVG clipping
```

The adapter accepts source/target expression, side, morph progress, blink progress, and optional current geometry. It rejects unsupported contexts and edited/mismatched source data. Progress values must be finite numbers; finite out-of-range values clamp. Presets are never mutated.

## 3. Geometry adapter implementation

`geometry/eyes/blink/morphBlinkAdapter.ts` defines `MorphBlinkContext`, `MorphBlinkGeometry`, the five-pair allowlist and `generateMorphAwareBlinkGeometry`.

For intermediate morphs it interpolates the existing canonical upper-open, lower-open and closed support curves, independently for each side. Layered configurations come directly from `prepareExpressionBlink`. The shared ellipse family's open supports are derived from the exact source center/radii/stroke measurements used by its existing private generator; its meeting contour comes from the existing public full-closure output. These small support configurations are cached. Canonical endpoint evaluation still delegates to the original engine, so support derivation cannot alter canonical output.

Both lids share the same strictly increasing cubic x parameter. Their vertical gap is a convex interpolation of nonnegative canonical gaps; the upper and lower curves therefore do not cross. At full closure both use the same meeting curve. The aperture is the connected band between them, not a scale transform or an opacity fade.

The stroke boundary is extracted from the **actual current geometry**: its independent generated outline for ellipse scenes, Happier's stroked body at that canonical endpoint, or the primary outline of the current layered morph scene. The stroke is clipped against that boundary. The original painted scene is clipped by the aperture, then hidden at full closure. No body path is replaced by a generic Idle silhouette.

`MorphBlinkGeometryEye` delegates canonical contexts to `ExpressionBlinkEye`, uses the existing `BlinkEye` artwork renderer for non-layered intermediate scenes, and uses the original validated layered scene generator for layered intermediates. Artwork is painted directly inside one outer SVG; there is no additional nested artwork viewport.

The imperative adapter reuses `updateProductionEyeArtwork`, extracted from the existing production DOM adapter without changing its geometry behavior. Matching source/resource nodes are retained; topology changes restore the original Idle paint structure when required. Instance scopes separate aperture, boundary, gradient, mask, filter and use IDs.

## 4. Supported expression pairs

Both directions and both eyes are supported for:

| Pair | Strategy |
| --- | --- |
| Idle ↔ Happier | Existing morph scene and distinct Happier arch supports |
| Idle ↔ Sad | Existing sloping morph scene, masks and attached detail |
| Idle ↔ Cry | Existing water-emergence morph scene and independent right details |
| Sad ↔ Cry | Existing direct scene transition; no Idle substitution |
| Idle ↔ Thinking | Independent left layered silhouette and right ellipse/highlights |

Same-expression contexts support all seven canonical expressions, retaining Happy/Shock semantics. Unlisted direct contexts, including Happy → Cry, are explicitly rejected by this API. The production route adapter identifies the already-existing effective leg, including verified shared-eye aliases and Idle bridges. This does not expand the five-pair list.

## 5. Source/target endpoint validation

- At morph 0/1, the existing morph engine supplies its exact canonical source/target object. Blink evaluation delegates to the matching canonical engine.
- At blink 0, the adapter returns the exact current geometry object, including a supplied validated current object.
- At blink 1, the interior is hidden and only a boundary-clipped black meeting stroke is painted.
- Reopening evaluates blink 0 against the **latest** current morph geometry, not a saved starting frame.

The canonical generators, `BlinkEye`, `ExpressionBlinkEye`, canonical presets and original baseline JSON files were not edited. Existing canonical regression assertions remain unchanged.

## 6. Expression-specific eyelid behavior

Idle/Happy/Shock retain the verified shared ellipse family through the canonical API. Happier retains its own arch, native highlight and gradient. Sloping Sad/Cry/Thinking-left supports are interpolated using their own per-side landmark configurations. Thinking-right retains its ellipse and independently moving highlights.

These controls are procedural blink supports, not approved new artwork. Intermediate closed contours are pending artist/target-display review.

## 7. Cry water and Sad details

All source paint nodes stay in the source scene under the aperture. Cry water is neither regenerated nor duplicated. Its existing morph-controlled appearance continues independently of closure; Cry-right retains its original white blurred detail and filter pipeline. At full closure none of this internal content is visible.

Sad's attached lower detail, supplementary outlines, masks, transforms and use references remain intact and are progressively clipped by the aperture. The moving lid stroke itself uses the primary silhouette boundary, as in the canonical blink design. Source inner shadows are clipped after filtering; this phase does not synthesize new shadows along moving lids.

Existing face-level Cry tear strips remain owned by `FaceEffects`. They are unchanged and are not part of eye-aperture clipping. No falling particles or new face effects were added.

## 8. Thinking asymmetry

Each side is generated from its own source configuration. The left eye morphs its layered/sloping body and outlines; the right retains its native ellipse and independent highlights. There is no mirroring. Actual current geometry dimensions/type are displayed independently in the preview. The manual controls synchronize closure progress for both eyes; the geometry API itself accepts a separate side and blink progress per evaluation.

## 9. Simultaneous morph/blink behavior

`morphProgress` and `blinkProgress` are independent scalar DOM attributes. Neither animation writes the other's value. Morph sampling updates the current source scene and actual boundary; blink sampling updates closure against the most recent context. A closed eye can continue morphing and then reopen into that evolved scene.

`MorphBlinkEye` owns a stable SVG scaffold after mount. Its initial React description is held in a ref so unrelated React renders do not overwrite an imperative frame. A weak registry connects each mounted SVG to its latest context; cleanup removes the registration and channel subscription. This registry owns no global animation driver or expression state.

No animation frame calls a React state setter or writes to Zustand. State updates are limited to controls and readiness.

## 10. Animation synchronization and cancellation

`animation/morphBlinkPlayback.ts` uses the existing `AnimationEngine` registry, guarded callbacks and mount-owned Anime.js driver. Blink timing is checked against the unchanged existing preview timing:

- Close: 100 ms, `inOutSine`.
- Hold: 40 ms, implemented as the opening phase delay.
- Open: 150 ms, `inOutSine`.

Play/replacement begins at the displayed scalar, not zero. Seek/reset cancels only its own channel. A stale close callback cannot create a replacement opening phase. Registration is renewed at play boundaries to bound retained revert history. Disposal is idempotent, cancels both owned targets, and restores their displayed scalar attributes after engine revert so a StrictMode-style cleanup/setup cycle preserves progress. No timers or random scheduler were added.

With manual production blink validation active, rapid expression requests retain only the latest pending request and finish the current validated morph segment before starting it. This avoids snapping the visible current geometry to a canonical endpoint or inventing a new interpolation from arbitrary controls. It can delay the newest request by the remaining segment duration. Without the blink validation channel, the prior production interruption behavior is unchanged. Explicit zero-duration/reduced-motion settlement remains immediate.

## 11. Unsupported transition policy

The inspected procedural face renderer already implements other canonical transitions using validated Idle legs. `productionEyeMorphContext` exposes the current existing leg to the adapter; it does not redesign or replace that routing. All 42 directed canonical face transitions were sampled through this mapping.

The original asset renderer is not wired to this blink channel: its crossfades and Idle → Happy element animation remain unchanged, and blinking is suppressed there. The preview-only angular `happier-transition` artwork also remains asset-based and unblinked. No arbitrary path interpolation is forced for these unsupported scenes.

Independent canonical procedural compositions can share the same local channel without sharing source geometry. In the current application no unsupported canonical procedural crossfade is needed; source/target endpoint scenes in a geometry transition nevertheless remain separate subscribers. This is not a claim that original asset-image crossfades have acquired blink geometry.

## 12. Development preview and production comparison

Open **Production renderer comparison** in Vite development mode:

1. Use **Enable manual morph-aware blink validation** to opt the procedural comparison face into the local blink channel.
2. Use **Play production Blink** / **Reset production Blink** while changing expressions.
3. Use the **Morph-aware blinking validation** section for seven canonical expressions or any supported pair/direction.
4. Test **Play Morph**, **Play Blink**, **Play Morph + Blink**, independent resets and both progress sliders.

The preview displays source/target, both progresses, side-specific dimensions/representation, animation activity and adapter validity. Explicit source/pair selection establishes a new inspection context and resets its morph slider while retaining blink progress; it is not a simulated production expression request. Playback replacement within a context retains current progress. Existing geometry/morph/blink previews are preserved.

These controls use local state and channels, never the canonical expression controller/store. `FaceRenderer` accepts an optional channel for this validation connection. Both asset rendering and release-build blinking remain unchanged/default-disabled. Vite DEV gates remove the new blink rendering/preview path from the release bundle, preserving existing production-exclusion regression checks. Browser/hardware validation is required before broadening that gate.

## 13. Visual comparison results

Artifacts are in [morph-aware-blinking](morph-aware-blinking/):

- [All ten directed pair grids](morph-aware-blinking/all-pairs.png).
- [Idle → Cry detail](morph-aware-blinking/idle-cry/grid.png).
- [Idle → Thinking detail](morph-aware-blinking/idle-thinking/grid.png).
- Each pair folder contains its SVG/PNG grid and 60 individual eye SVG/PNG samples.
- `samples.json`, `canonical.json`, `check-results.json`, and `raster-validation.json` preserve the actual renderer markup and measurements.

Morph samples: 0/25/50/75/100%. Blink samples: 0/25/50/75/90/100%. Both sides and both directions produce 600 combinations. The all-pair contact sheet and Cry/Thinking detail grids were opened and visually inspected. Highlights and gradients remain in the aperture; Sad details retreat with closure; Cry water remains attached to the existing scene; Thinking remains asymmetric. Full closures show a single black stroke with no visible internal paint. No intermediate shape is declared artist-approved or perceptually validated in motion.

Static resvg RGBA results:

| Check | Result |
| --- | --- |
| New canonical renderer versus existing canonical blink output | 84 exact pairs, zero differing pixels |
| Open morph-aware eye versus original procedural current morph renderer | 100 exact pairs, zero differing pixels |
| Imperative DOM adapter versus actual React renderer | 600 exact pairs, zero differing pixels |
| Full closure | 100 connected, black-only painted components; no interior leakage |
| Partial closure | Colored pixels remain in the aperture with a one-pixel antialias margin |

The partial-edge margin is not applied to endpoint identity or full closure. These are static renders, not browser screenshots. Existing canonical raster checks at 1×/1.5×/2× were also rerun unchanged and passed.

## 14. Regression test results

Environment: Windows development host; Node 24.14.1; React/React DOM 19.3.1; Zustand 5.0.16; TypeScript 5.9.3; Vite 7.3.7; Anime.js 4.5.0. Existing external raster tools: resvg-py 0.5.0 / Pillow 13.0.0. No application dependencies were added or installed. No FPS, latency, memory or robot-hardware improvement was measured.

The new functional suite covers 8,820 dense geometry combinations (21 × 21 × ten directions × two sides), 600 rendered/DOM samples, 84 canonical delegations and 420 existing production-route contexts. It checks endpoint identity, source mismatch rejection, finite/clamped progresses, determinism, preset/store immutability, noncrossing monotone lids/connected aperture, actual boundary selection, unique resources, water/filter retention, exact reopened geometry, independent controls, timing, real Anime.js seeks, stale callbacks, replacement, disposal, StrictMode-style setup replay and continuous latest-wins requests. The DOM fixture is deliberately bounded and does not prove browser CSS layout/scheduling.

Commands ran from `frontend` unless indicated:

| Command | Final result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node scripts/verify-eye-geometry.mjs` | PASS, including all-expression source/asset checks |
| `node scripts/verify-eye-morphing.mjs` | PASS |
| `node scripts/verify-eye-sad-morphing.mjs` | PASS |
| `node scripts/verify-eye-cry-morphing.mjs` | PASS |
| `node scripts/verify-eye-thinking-morphing.mjs` | PASS |
| `node scripts/verify-eye-blinking.mjs` | PASS, unchanged canonical suite |
| `node scripts/verify-eye-expression-blinking.mjs` | PASS, unchanged canonical suite/baselines |
| `node scripts/verify-morph-aware-blinking.mjs` | PASS |
| `node scripts/verify-production-renderer.mjs` | PASS |
| `node scripts/verify-face-layers.mjs` | PASS |
| `node scripts/verify-expression-transitions.mjs` | PASS |
| `node scripts/verify-element-transitions.mjs` | PASS |
| `node scripts/verify-mouth-geometry.mjs` | PASS |
| `node scripts/verify-mouth-morphing.mjs` | PASS |
| `node scripts/verify-mouth-expressions.mjs` | PASS |
| `node scripts/verify-animation-engine.mjs` | PASS |
| `node scripts/verify-expression-controller.mjs` | PASS |
| `python scripts/render-morph-aware-blinking.py` | PASS, 600 SVG/PNG combinations |
| `python scripts/verify-eye-raster.py` | PASS: original six pairs, sixteen XML trees and 48 expanded pairs |
| `python scripts/render-eye-blinking.py` | PASS: six exact opens and connected black-only closures |
| `python scripts/render-eye-expression-blinking.py` | PASS: 42 exact open pairs, fourteen closures and 56 contained partials |
| `git diff --check` | PASS; existing LF/CRLF notices |
| Browser verification | UNAVAILABLE: browser access host/native pipe unavailable |
| Backend/manual socket and robot-device tests | NOT RUN; no backend/protocol changes |

Python uses the established asset environment:

```powershell
$env:PYTHONPATH = "$env:TEMP/brone-asset-tools"
```

The real Anime.js test initially assumed `seek()` included the animation delay. Installed source inspection shows it adds that delay internally; the corrected check samples negative phase time during the hold, then 150 ms for completed opening. The configured 40 ms delay and the separate deterministic timing assertions are retained.

## 15. Modified files

Added:

- `src/geometry/eyes/blink/morphBlinkAdapter.ts` — strict context adapter and typed intermediate blink result.
- `src/animation/morphBlinkPlayback.ts` — local channel and two independently owned playback targets.
- `src/components/face/eyes/{MorphBlinkEye,MorphBlinkPreview}.tsx` — rendering/DOM bridge and manual preview.
- `scripts/verify-morph-aware-blinking.mjs`, `scripts/render-morph-aware-blinking.py`.
- This report and `reports/morph-aware-blinking/*`.

Updated:

- `src/geometry/eyes/blink/index.ts` — additive exports; original engines/types remain unchanged.
- `src/animation/productionGeometry.ts` — identify an existing effective eye leg.
- `src/animation/productionGeometryDom.ts` — expose existing artwork patch operation for reuse.
- `src/animation/{expressionTransition,useExpressionTransition}.ts` — optional continuous latest-request handling for manual blink validation.
- `src/components/face/{FaceRenderer,Eyes,GeometryTransitionLayer,ExpressionTransitionLayer,ProductionGeometryComparison}.tsx` — optional development channel and controls.
- `src/style.css` — SVG sizing inside the stable surface.
- `scripts/verify-production-renderer.mjs`, `scripts/production-renderer-test-dom.mjs` — new import/hook wiring and selector support in existing fixtures; existing production assertions retained.
- `reports/production-geometry/integrity-migration.json` — current integration source hashes; preceding integration hashes retained as history. This is not a canonical geometry/blink baseline.
- Existing generated verification artifacts and `tsconfig.tsbuildinfo` refreshed by required checks.

No original artwork, canonical eye geometry, canonical blink implementation/tests/baseline JSON, approved layouts, mouth engines, core animation engine, canonical expression store/controller, backend or shared protocol was edited by this phase. Prior unrelated working-tree changes were preserved.

## 16. Known limitations

Browser/Brave scheduling, CSS layout and target-device appearance remain unverified. Static grid coverage is bounded; it does not prove artistic quality or all real-time event sequences in a browser. Closed intermediate support curves require approval. Source shadows are aperture-clipped rather than regenerated. Existing face-level Cry strips remain visible independently of eye closure.

Manual blink validation queues only the latest expression request until the current morph segment completes; this preserves continuity at the cost of response delay. Explicit preview context selection resets morph inspection rather than simulating such a request. Explicit zero-duration/reduced-motion commands still settle immediately. The release build keeps blinking disabled, and the original asset renderer is unblinked.

## 17. Production readiness assessment

The geometry pipeline, exact endpoints, all five bidirectional morph combinations and simultaneous manual controls pass the listed functional/static raster checks. The connection to the actual procedural production components is available for explicit development validation. This is **not approval to enable blinking in the release build or to change the default renderer**. The subsequent user-requested automatic development scheduler is documented below.

## 18. Recommended next phase

Run Chrome/Brave and robot-display review using the comparison and preview: blink during each morph direction, morph while held closed, reopen at intermediate frames, rapidly replace expressions, switch renderer/view, enable reduced motion and unmount/remount. Approve or revise intermediate closure contours and assess latest-request response delay. Only then consider broadening the production gate. Gaze, squash/stretch, visemes, audio, effects and backend work remain separate tasks.

## Follow-up: user-requested automatic blinking (2026-11-02)

The user's subsequent request authorizes automatic blinking, superseding the original phase restriction for this addition. In the development Production renderer comparison, automatic blinking is checked by default. Opening the panel schedules a blink after a random 3–6 seconds and repeats with a new interval. Uncheck Automatic blinking to stop scheduling; an already running blink finishes reopening. The existing manual controls and deterministic MorphBlinkPreview remain available.

`src/animation/automaticBlink.ts` schedules the existing playback controller without changing geometry, canonical expression state, morph progress or blink timing (100/40/150 ms). It skips active manual blinks and nonzero held inspection frames. The comparison effect clears its timer and visibility listener on cleanup, pauses scheduling while collapsed, hidden or in asset-only view, and starts a fresh interval on resume. No per-frame React or Zustand writes were added. The original asset renderer remains the default; release blinking remains gated off. This addition applies to the development comparison, not the main live asset face.

Files changed for this follow-up: the new scheduler, `ProductionGeometryComparison.tsx`, new `scripts/verify-automatic-blinking.mjs`, extended `scripts/verify-production-renderer.mjs`, and this report. Typecheck, build, automatic scheduler tests, production renderer tests, morph-aware blinking tests, canonical eye blinking tests and multi-expression blinking tests passed. `git diff --check` passed (existing CRLF notices only). Tests cover interval bounds, repeats, active/held blink isolation, stale callbacks, timer cleanup, setup replay, default UI mode, visibility pause/resume, disabled mode, collapsed panel and asset-only view. Browser automation remains unavailable in this environment; actual browser timing has not been visually verified. Existing raster results above belong to the preceding geometry implementation; timer-only changes did not require new geometry baselines.
