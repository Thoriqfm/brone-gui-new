# Procedural Idle eye blinking — Phase 1

## Result and scope

Both Idle eyes now have an isolated development blink preview in the existing Eye geometry comparison panel. Play Blink runs OPEN → CLOSED → OPEN. Reset, direct closure slider, progress output, animation status, and 0/25/50/75/90/100% inspection buttons are available. The existing morph preview and static comparison remain available.

This is a geometry-controlled clipping prototype, not an approved closed-eye asset. Production Eyes/FaceRenderer, original SVGs, canonical eye presets, existing morph algorithms, mouth geometry, global animation engine, Zustand, backend and protocol were not changed by this task. The workspace already contained substantial earlier changes; those were preserved. The existing protected-file hash suite passes unchanged. No dependency was installed or added.

## 1. Existing Idle geometry

Inspected both actual Idle SVG files, all requested implementation reports, eye types/presets/path/layer generators/interpolator, ProceduralEye, EyeMorphPreview, EyeGeometryComparison, animationEngine and faceLayerLayouts. Source findings:

| Feature | Both Idle sides, in native SVG units |
| --- | --- |
| Viewport | 129 × 171 |
| Body | Exact ellipse, center (64.5,85.5), radii (60.5,81.5) |
| Outline | Independent eight-cubic closed path; cardinal positions (64.5,2), (127,85.5), (64.5,169), (2,85.5); black width 4 |
| Gradient | userSpaceOnUse, (64.5,4) → (64.5,167); .0625/#6260B0 and .533654/#29284A |
| Small highlight | White, opacity .96; center (27.7,94.8559), radii (9.2,9.6) |
| Notched highlight | Original eight-cubic white path, opacity .96, starts (41.5,33.2559) |
| Inner shadow | Source sRGB primitive pipeline, dy=4, blur=2, alpha=.25; region (0,0,129,175) |
| Layout | Left (115,154,129,171); right (556,154,129,171), existing eye z-order |

The assets have identical local geometry after resource naming normalization. Highlights must not be mirrored. Body and independent outline must not be replaced by one stroked ellipse.

## 2. Eyelids and aperture

The dedicated pure module is under src/geometry/eyes/blink. It produces two cubic lid curves and a closed aperture path between them. Original artwork is clipped by this aperture. The added lid strokes are separately clipped to the exact source outline interior, so their ends stay attached to the remaining lateral source outline. No whole-eye opacity, whole-eye scaling, asset swapping or static closed image is used.

The lids span x=-4..133, outside the source silhouette. Cubic x controls divide that span into thirds, making x(t) linear and strictly increasing. Open upper/lower y values are -4 and 175, including a two-stroke-width margin beyond the body. This allows the first small progress values to enter the source outline without replacing its open endpoint.

At each horizontal position, the upper curve moves downward and the lower curve upward. Both converge to the same shallow curve. The vertical gap is exactly 179*(1-progress) throughout the full horizontal span. Therefore the aperture narrows continuously and the lid curves cannot cross before closure. Its path is M/C/L/C/Z; full closure is deliberately zero area. Each intermediate aperture is connected and non-self-intersecting by its monotone x and strictly nonnegative gap construction; dense numerical checks also exercise these properties.

## 3. Closed contour derivation

The new contour uses the inspected Idle body center/radius, not unrelated decoration:

- Meeting curve edge y = cy + .48*ry = 124.62.
- Both cubic y controls = edge + .12*ry*4/3 = 137.66.
- Curve midpoint y = cy + .60*ry = 134.4.
- x controls use the common -4..133 span above.

The source outline clips the visible horizontal extent. The final result is one continuous shallow curved stroke. Upper motion dominates: relative to the source body top/bottom at the center, upper travel is 130.4 units and lower travel 32.6 units. The closed contour is newly generated and still requires human visual approval. It is not presented as an approved export.

At progress 1 the source interior group is hidden, and the duplicate lower stroke is omitted. Only the upper stroke remains painted. No gradient, highlight, source outline fragment or filter output remains visible at this endpoint. A closed eyelid here means a connected stroked curve, not a new filled closed shape.

## 4. Pure API, interpolation and validation

The API is generateBlinkGeometry(eye, progress), exported from geometry/eyes/blink/index.ts. It accepts each side independently, validates the complete input through the existing eye validator, then checks data equality against that side's Idle configuration. Data-equivalent clones are supported without property-order dependence. Edited/unsupported geometry is rejected even at progress endpoints. Happy/Shock currently alias the identical Idle geometry in the repository; this API validates geometry rather than expression names, and the UI exposes Idle only.

Non-number and nonfinite progress throw RangeError. Finite values clamp to [0,1]. At progress 0 the original caller object is returned by identity. This preserves the exact ellipse, independent outline, details, filters and gradients, without fitting or approximation. Interior results keep the original source object and expose their typed lid controls, aperture/stroke paths and interior visibility. No input or preset is mutated. Generation is deterministic and independent of React/browser APIs.

Lid interpolation uses linear interpolation of matching cubic controls. Progress is closure amount, not elapsed playback time. Opening traverses the same geometry in reverse. No general expression topology, arbitrary remeshing, or global blink engine was added.

## 5. Highlights, gradient and inner shadow

BlinkEye paints the original ellipse, independent outline, two highlights and original defs in their original order. Coordinates, source gradient stops and inner-shadow primitive values are unchanged. During closure, clipping happens after source painting/filtering, constraining the complete source interior and its details to the current aperture. Highlights cannot float outside that exposed region. There is no opacity ramp.

The original body shadow remains anchored to the original body and is clipped with it; this phase does not add a newly shaded upper-lid edge or deform the filter pipeline. At full closure the entire interior is hidden, preventing filter or gradient leakage.

BlinkEye contains an explicit Idle paint scene matching the protected ProceduralEye implementation. This small duplication preserves that existing renderer and its byte-level protection. An initial nested SVG reuse differed from the source in three antialiased edge pixels because of the extra viewport clip; the final renderer paints directly inside one SVG, and all six open raster comparisons are exact. Resource IDs use React useId, and all clip/gradient/filter references are instance-local.

## 6. Anime.js timing and lifecycle

EyeBlinkPreview dynamically imports the installed Anime.js 4.5.0 animate API after mounting. It animates a local object progress value with inOutSine easing and autoplay:false, attaching ownership before play:

| Phase | Default configured duration |
| --- | --- |
| Closing, 0 → 1 | 100 ms |
| Closed hold, opening animation delay | 40 ms |
| Opening, 1 → 0 | 150 ms |
| Total configured | 290 ms |

A timing prop supports other finite nonnegative durations without introducing another engine. These are configured durations, not measured display latency.

Frame callbacks update only local SVG path/clip/visibility attributes and the slider/output DOM. React state is used for loading and phase status, with no frame React state updates and no Zustand writes. Play starts from open even after manual inspection. Scrubbing, Reset, replay and unmount cancel the current animation. Cancellation invalidates a generation token before cancel(), detaches the old object target, and guards update/begin/completion callbacks. A cancelled closing callback cannot launch opening. The opening animation owns its hold delay, so cancellation during hold cancels the whole remaining sequence. Dynamic import success/failure is guarded after cleanup. StrictMode-style setup/cleanup/setup is covered.

## 7. Development integration

The existing import.meta.env.DEV comparison guard contains EyeBlinkPreview. Both eyes use the unchanged Idle layout and existing responsive face classes. The slider directly seeks closure; the sample buttons use the same geometry path. Status distinguishes loading, ready, closing, closed hold, opening, open, closed and manual inspection.

Actual production JS was searched for blink renderer, UI and validation markers; none remain. Production main JS retains index-6BEnCzdN.js. The production asset renderer still passes its existing compatibility checks. No production Expression Controller is called.

## 8. Static visual validation

Generated actual SSR SVG markup and PNGs for both sides at all six required progress values:

- [Comparison PNG](eye-blinking/blink-grid.png) and [SVG](eye-blinking/blink-grid.svg).
- Individual left/right 000/025/050/075/090/100 .svg and .png files in eye-blinking/.
- [Rendered samples](eye-blinking/samples.json).
- [Raster evidence](eye-blinking/raster-validation.json).

The final PNG sheet was opened and inspected. Both eyes retain the open ellipse/outline/notched and small highlights, progressively expose a smaller lower aperture, clip the highlights as the upper lid passes them, and end in a shallow uninterrupted black stroke. The lower boundary rises less than the upper boundary descends. No sampled self-intersection, unexpected bulge, floating highlight, residual interior, or filter leakage was observed. The generated lid enters with a relatively shallow curvature; its naturalness is a prototype design choice pending review.

Static resvg checks show:

- Original Idle versus blink-open at 1×/1.5×/2×, both sides: six pairs, zero differing RGBA pixels and zero maximum channel difference.
- Every nonblack painted pixel in all eight partial samples lies inside the computed aperture, allowing one raster unit for edge antialiasing.
- At 100%, each eye has 525 nontransparent pixels, all black, forming one connected component with eight-neighbor connectivity.
- Both sides have matching partial colored-pixel counts: 13,759 at 25%, 9,526 at 50%, 4,596 at 75%, 1,575 at 90%.

Tools: existing resvg_py 0.5.0 and Pillow 13.0.0, using the established TEMP/brone-asset-tools PYTHONPATH. Nothing was installed. This is static raster evidence and Node playback testing. No actual browser, robot display, FPS or latency verification was performed.

## 9. Tests executed

Windows host, Node 24.14.1, Vite 7.3.7, Anime.js 4.5.0. Commands ran from frontend unless noted. Machine-readable results: [check-results.json](eye-blinking/check-results.json).

| Check | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS |
| node scripts/verify-eye-geometry.mjs | PASS, including expanded expression/asset/production checks |
| node scripts/verify-eye-morphing.mjs | PASS, including real automatic playback of all existing pairs |
| node scripts/verify-eye-sad-morphing.mjs | PASS, existing protected hashes unchanged |
| node scripts/verify-eye-cry-morphing.mjs | PASS |
| node scripts/verify-eye-thinking-morphing.mjs | PASS, 808 prior geometry hashes unchanged |
| node scripts/verify-eye-blinking.mjs | PASS |
| node scripts/verify-mouth-geometry.mjs | PASS |
| node scripts/verify-mouth-morphing.mjs | PASS |
| node scripts/verify-mouth-expressions.mjs | PASS |
| node scripts/verify-expression-controller.mjs | PASS |
| node scripts/verify-animation-engine.mjs | PASS |
| node scripts/verify-expression-transitions.mjs | PASS |
| node scripts/verify-element-transitions.mjs | PASS |
| node scripts/verify-face-layers.mjs | PASS |
| python scripts/render-eye-blinking.py, existing asset-tool environment | PASS |
| python scripts/verify-eye-raster.py, same environment | PASS: original six pairs, sixteen complete XML comparisons and 48 expanded RGBA pairs, all exact |
| git diff --check, repository root | PASS; existing LF/CRLF notices only |
| Browser/backend/target-device checks | Not run |

The new JS suite covers at least 101 samples per side, exact open identity, full closure, finite deterministic controls/paths, monotone upper/lower movement, reverse traversal, source immutability, malformed/edited/unsupported geometry rejection, nonfinite progress rejection, finite clamping, local resource IDs, actual preview sample/slider/reset/play handlers and SVG attribute updates, configured timing/custom timing, real installed Anime automatic closing/reopening, stale callbacks, replay/scrub/hold/unmount cancellation, early import cleanup/failure, StrictMode-style replay, no per-frame React updates, unchanged store, all original eye asset hashes and production exclusion.

Existing endpoint/raster tests and protected hashes were not relaxed. Only expected comparison element/layout counts were increased for the added panel, and its import was registered in the existing shallow comparison harness. Initial test-script escaping errors were corrected before the final pass; no failed check is reported as passing without a successful rerun.

Reproduce the two new checks after build:

    node scripts/verify-eye-blinking.mjs
    $env:PYTHONPATH = "$env:TEMP/brone-asset-tools"
    python scripts/render-eye-blinking.py

## 10. Files added or updated

Added:

- src/geometry/eyes/blink/{types,blinkGeometry,blinkInterpolator,index}.ts.
- src/components/face/eyes/BlinkEye.tsx and EyeBlinkPreview.tsx.
- scripts/verify-eye-blinking.mjs and render-eye-blinking.py.
- reports/EYE_BLINK_IMPLEMENTATION.md.
- reports/eye-blinking/ SVG/PNG grid, twelve individual SVG/PNG sample pairs, samples.json, raster-validation.json and check-results.json.

Updated:

- src/components/face/eyes/EyeGeometryComparison.tsx: mount the new preview inside the existing DEV guard.
- scripts/verify-eye-geometry.mjs: exact expected panel/SVG/canvas/layout counts.
- scripts/verify-eye-expressions.mjs: recognize the new comparison import in its selector harness.
- tsconfig.tsbuildinfo: TypeScript-generated cache.

Existing verification commands also regenerate their established eye/mouth report artifacts. The task did not edit their geometry algorithms or baseline snapshots.

## 11. Limitations

Only Idle geometry is supported by this prototype UI. The generated closed silhouette has no approved source target and awaits visual approval. Static resvg parity does not prove browser raster parity. Frame scheduling, perceived timing, target-display appearance and performance remain unmeasured. Source inner shadow is clipped rather than regenerated along moving lids. The hand-authored blink paint scene must stay synchronized with the protected source renderer; exact endpoint raster tests detect drift. Manual closure and playback duration are separate controls; there is no automatic random blinking or expression blending.

## 12. Future expression compatibility

The geometry contract separates source artwork, upper/lower lid controls, aperture, stroke paths and interior visibility. Future expression families can provide their own source validation, semantic lid landmarks, meeting contour and detail policy while reusing local playback and attribute updates. They must not reuse Idle contours automatically.

Happy and Shock currently share Idle-shaped source data but still require explicit expression-level review before exposure. Happier has a distinct stroked five-cubic silhouette and needs its own lid derivation. Sad/Cry need separate treatment of supplemental masked outlines, lower details, water and Cry-right blur/highlight. Thinking requires independent left/right rules because its left silhouette is layered/sloping and its right is an ellipse with different highlights. Preserve each family's exact open endpoint and add its own closure, dense geometry and raster evidence before enabling it.

The next step is reviewing this Idle preview in an actual browser and on the target display, then approving or adjusting the generated closed contour. Gaze, multi-expression blinking, visemes and production integration remain outside this phase.
