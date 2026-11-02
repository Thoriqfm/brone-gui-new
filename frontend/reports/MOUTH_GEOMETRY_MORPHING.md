# Mouth Geometry Morphing: Idle to Happy

## Scope and architecture

Development prototype only. The existing asset-based production Mouth, face renderer, animation engine, expression controller, layouts and endpoint presets were preserved. No dependencies, backend changes, protocol changes, eye geometry or visemes were introduced. Pre-existing working-tree changes were preserved.

The pure geometryInterpolator.ts exports interpolateMouthGeometry(from, to, progress) and interpolateMouthLayout(from, to, progress). MouthMorphPreview.tsx owns the animated scalar and its local React updates. MouthGeometryComparison.tsx keeps the original SVG versus procedural comparison and mounts the independent interactive preview below it. A Vite DEV guard excludes the panel from production. Actual production build JavaScript was inspected: the preview heading and data-mouth-morph marker are absent.

## Inspection and interpolation algorithm

Verified the actual presets: normalized [0,1] coordinates, one closed cavity with five cubic segments and one closed tongue with ten cubic segments, ordered start/control/control/end arrays. IDLE is 282 x 96; HAPPY is 282 x 155. Both retain outer stroke 8 and cavity stroke 5. No endpoint edits were needed.

Finite progress outside [0,1] clamps; nonfinite or nonnumeric progress throws RangeError. Both inputs are validated even at endpoints. Existing validation checks contour cardinality, point tuples, finite normalized coordinates, closure, positive dimensions/strokes, stroke ordering and the cubic outline envelope. Errors identify the failing endpoint and expected supported contour counts. Missing-versus-present tongue and incompatible topology are rejected. Only the existing 5/10-segment model (or two absent tongues) is supported. Control-point semantic correspondence is the caller's responsibility; matching array shapes alone cannot identify a rotated or reversed control net.

For each scalar and each coordinate, interpolate with (1-t)*from + t*to. This includes both starts, every cavity/tongue control and endpoint, width, height and both stroke widths. Preserve ordering; do not interpolate SVG path strings. At t=0/1 return the exact validated input object, preserving every endpoint value. Intermediate results pass validateMouthGeometry before rendering through the unchanged path generator. Inputs are not mutated.

Coordinates interpolate in the existing normalized parameter space, then the generator multiplies by interpolated dimensions. Absolute control trajectories therefore need not be linear when dimensions change. No alternate timing or handcrafted intermediate shape was necessary for the automated geometry checks; visual approval remains outstanding.

## Layout and rendering

Read placement from FACE_LAYER_LAYOUTS: Idle (259.75,325.25,282,96), Happy (259.5,287.75,282,155). Interpolate x/y/width/height using the same progress. At midpoint placement is (259.625,306.5,282,125.5). Layout validation rejects nonfinite positions and nonpositive dimensions.

The wrapper maps logical coordinates to percentages of the existing 800 x 480 artwork. Its width/height equal the current geometry viewBox dimensions, so there is no independent scale transform or second mouth-size multiplication. The unchanged responsive 1490 x 960 display canvas remains in use. The SVG fills that wrapper using existing procedural-mouth CSS.

The unchanged ProceduralMouth retains the same SVG and path elements across updates. It regenerates cavity/outline/tongue d attributes, viewBox, intrinsic dimensions and strokes. The outline shares the cavity curve, avoiding an independently moving seam. Original dark fill, coral tongue, black strokes and paint order are preserved. There is no opacity animation, asset swap, crossfade or scale animation in the prototype.

## Anime.js integration and controls

Confirmed installed Anime.js 4.5.0, despite the broader package.json range. Load animate after mount, as existing animation hooks do. Animate a local object progress toward 1 or 0 over 1000 ms with inOutSine, constructing with autoplay:false and then play(). React state updates are confined to MouthMorphPreview; Zustand and unrelated face components receive no frame updates. This prototype does not change or route through the production expression coordinator.

Play proceeds from the currently displayed value toward Happy; reverse proceeds toward Idle. Press Reset to replay from Idle after reaching Happy. Scrubbing cancels playback and holds any intermediate state. Status displays loading, playing direction, paused, Idle, Happy, or load failure. Buttons wait for the Anime.js load; reset/scrubbing remain available. Reset, replacement, scrubbing and unmount cancel the owned animation and invalidate callbacks before cancellation. Completion explicitly pins the exact target. Early async cleanup is covered by a StrictMode-style harness.

## Intermediate geometry and visual comparison

Tests inspect every scalar and every start/control/end coordinate at 0, 0.1, 0.25, 0.5, 0.75, 0.9 and 1. They generate validated paths at 101 progress values from 0 through 1. At 21 values, sampled cubic contours (32 subdivisions per segment) have no detected cavity/tongue self-intersections; tongue samples remain inside the cavity or its outline envelope, and remain connected to the lower outline. These samples are evidence for these presets, not an analytic intersection/containment guarantee for arbitrary input geometries. Runtime validation retains the existing geometry validator's limits.

The existing geometry suite compares generated endpoints with approved SVG coordinates, styles and layout and checks all six original mouth SVG hashes. Original references remain available through the static selector while the animated preview can be scrubbed independently.

Browser verification was attempted but could not be completed. The browser connector reported its access host unavailable. The existing Chrome Brone tab was located through Computer Use, but automatic approval review rejected interaction: "Computer Use was not approved to use Google Chrome". Starting an additional Vite server on 5173 also reported that the port was already occupied; no existing server was stopped. No browser visual success, raster equivalence, runtime frame rate or timing measurement is claimed.

To review visually: run npm run dev, expand Mouth geometry comparison, compare both static endpoints against the original assets, then play/reset/reverse and scrub through 0.1/0.25/0.5/0.75/0.9. Check upper/lower contour motion, tongue connection, corner curvature, black outline seams and position continuity. Repeat at narrow and wide viewports and confirm production expression controls remain independent.

## Executed verification

Windows host; Node v24.14.1; Vite 7.3.7; installed Anime.js 4.5.0. Functional checks only; no performance benchmark.

| Check (from frontend unless noted) | Final result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS |
| node scripts/verify-mouth-geometry.mjs | PASS |
| node scripts/verify-mouth-morphing.mjs | PASS |
| node scripts/verify-expression-controller.mjs | PASS |
| node scripts/verify-animation-engine.mjs | PASS |
| node scripts/verify-expression-transitions.mjs | PASS |
| node scripts/verify-element-transitions.mjs | PASS |
| node scripts/verify-face-layers.mjs | PASS |
| git diff --check (repository) | PASS; existing LF/CRLF normalization warnings |
| Browser visual verification | BLOCKED by Chrome approval rejection; outstanding |

The new suite also checks invalid progress, dimensions, strokes, topology, point/curve structure, closure, determinism, input immutability, null-tongue compatibility, layout clamping/validation, distinct stroke and size interpolation, real Anime.js object-animation seeks at 0/500/1000 ms, actual preview handlers with a shallow mounted hook harness, stale callback rejection, scrub/reset/reverse/unmount behavior and the compiled production guard. Existing production-renderer checks still confirm asset images across all expressions. SHA-256 snapshots taken before editing confirm protected production renderer, presets, layout, controller/engine, backend schema and shared protocol files did not change during this task.

During verification, the new fast Vite SSR harness initially emitted a dependency-scan shutdown race after its assertions passed; disabling dependency discovery for that harness resolved it. An initial production-mode SSR test encountered duplicate React resolution caused by Windows path casing and then exposed that Vite dev-server mode alone does not set DEV=false. Replaced that harness with an explicit compiled DEV=false check and inspected the actual production build. Final focused checks pass. No failed intermediate run is counted as a pass.

## Files changed by this task

Added:
- src/geometry/mouth/geometryInterpolator.ts
- src/components/face/mouth/MouthMorphPreview.tsx
- scripts/verify-mouth-morphing.mjs
- reports/MOUTH_GEOMETRY_MORPHING.md

Updated:
- src/geometry/mouth/index.ts: export interpolation helpers.
- src/components/face/mouth/MouthGeometryComparison.tsx: preserve static comparison, mount isolated preview and guard development mode.
- scripts/verify-mouth-geometry.mjs: count the additional preview canvas and its initial placement.
- tsconfig.tsbuildinfo: regenerated by required TypeScript checks.

## Limitations and production readiness

Ready for interactive development review; production migration is deferred. Local React renders and repeated geometry validation are appropriate for this bounded preview but have not been profiled on the robot hardware. Runtime validation does not analytically prove arbitrary contour simplicity, tongue containment, tangent continuity or perceptual naturalness. Current fixed topology is limited to Idle/Happy; the generic function cannot infer semantic correspondence in differently ordered contours. Endpoints retain the previous procedural engine's documented source-outline rounding tolerance and existing tiny viewBox-edge tolerance.

Next step: complete browser visual approval of this mouth transition and inspect it on target display dimensions. Production integration would separately need transition ownership, interruption/reduced-motion policy and measured rendering performance; none of that migration is included here. Eye geometry and visemes remain outside this task.

## Follow-up: Play/Reverse appeared unchanged

The user reported no visible mouth change after Play or Reverse. The local server was checked and served the current preview module. Real Anime.js automatic playback on a plain object advanced 0 to 1. A new regression test then invoked the actual component handlers/callbacks with real automatic Anime.js playback (not manually supplied frames or seek): forward and reverse reached their exact endpoints, an intermediate cavity path differed from Idle, and Reset stayed at Idle past the original animation completion time. This does not reproduce browser scheduling or establish the user's specific browser root cause.

A concrete preview-layout issue was found: the controls were followed by a full-width 1490:960 canvas, with the animated mouth positioned toward its lower part, while two other visible mouths were static references. The animated mouth could be outside the viewport while the controls were being used. Moved the animated preview before the static references, limited only its responsive canvas to 640 CSS pixels while preserving both logical coordinate/aspect systems, and explicitly labeled the references static. Play is disabled at Happy; Reverse is disabled at Idle, making endpoint no-ops visible. Production rendering and interpolation were not changed.

Files updated: MouthGeometryComparison.tsx, MouthMorphPreview.tsx, style.css, verify-mouth-morphing.mjs, verify-mouth-geometry.mjs and this report; TypeScript build metadata was regenerated. Follow-up checks: typecheck/build, morphing suite including real automatic playback, existing geometry suite, expression controller suite, and git diff --check. Browser visual verification and confirmation of the user's specific symptom remain outstanding; the user was asked whether progress/status advance when the buttons are clicked.
