# Procedural eye blinking — all canonical expressions, Phase 2

## 1. Result and supported expressions

The development blink preview now supports Idle, Happy, Happier, Sad, Cry, Shock and Thinking, with independent left/right geometry calls and original expression-specific placement. Play Blink performs OPEN → CLOSED → OPEN. Reset, direct closure slider, percentage output, status, expression display and 0/25/50/75/90/100% inspection buttons remain. Changing expression cancels playback and mounts the selected eyes in their exact approved open state.

Production Eyes/FaceRenderer, canonical eye presets, approved layouts/assets, existing eye/mouth morphing, global animation modules, Zustand, backend and protocol were not edited by this task. The workspace had earlier changes; they were preserved. No dependencies were installed or added. This report describes only the Phase 2 additions.

All generated closed silhouettes are procedural designs pending artistic approval, not approved source exports. No browser, device FPS or display latency pass is claimed.

## 2. Source inspection and geometry families

Read AGENTS.md and architecture, animation, stack, implementation/protocol, benchmark and research documentation. Inspected the eight requested eye implementation reports, source and blink modules, ProceduralEye/BlinkEye/morph/comparison previews, asset mappings/layouts, and all fourteen original eye SVGs, including the separate chevron transition references. Happy has no separate eye SVG; its actual composition uses the Idle pair. The transition reference remains outside canonical blinking.

| Family | Canonical members | Source features |
| --- | --- | --- |
| Original ellipse | Idle, Happy, Shock | 129×171; ellipse center (64.5,85.5), radii (60.5,81.5); independent eight-cubic outline, gradient, inner shadow and two highlights |
| Happier | Happier left/right | 123×139; five-cubic gradient body with its own black width-4 stroke; lower bridge/shoulders and two highlights; no shadow |
| Sloping body | Sad/Cry both sides, Thinking-left | Six-cubic body; independent mixed cubic/line width-4 outline; filtered width-8 supplementary outline and body-exclusion mask; side-specific highlights and gradients |
| Thinking ellipse | Thinking-right | 129×171; ellipse and outline equal to Idle, but independently positioned highlight geometry and face layout |

Sad additionally has a referenced round lower detail, its mask/stroke and a dark transformed ellipse. Cry instead has a sixteen-cubic blue water path and, on the right, a white ellipse with blur=15 in a taller 183-unit viewport. Cry-left is 145 units high, Sad is 156, and Thinking-left is 145. These complete artworks are not interchangeable even when their base contours match.

The original gradients retain userSpaceOnUse and .0625/#6260B0 and .533654/#29284A stops. Source filter primitives, regions, original opacities, path rounding, transforms and resource references remain intact.

## 3. Phase 1 preservation and immutable baseline

Before implementation, captured [idle-phase1-baseline.json](eye-expression-blinking/idle-phase1-baseline.json): 101 progress values per side, with SHA-256 hashes of actual geometry JSON and actual BlinkEye SSR SVG. Also captured 63 protected source/asset file hashes. The one-time capture script refused overwrite and was removed after capture. Tests only read this fixture; they never regenerate it.

The fixture itself is pinned in the new test with SHA-256:

    9f7a18a127a166aa26c869896c51ee3738b7838207a031091d9cebd36cbbbc82

All 202 geometry hashes, all 202 original renderer SVG hashes, and all 202 SVG hashes through the new compatible renderer match. All 63 protected files match, including Phase 1 blinkGeometry.ts, blinkInterpolator.ts and BlinkEye.tsx. Those three implementation files remain byte-for-byte unchanged. Original open endpoint identity, aperture/lid movement and configured timing are preserved. Existing Phase 1 functional and raster checks pass without weakened assertions or tolerances.

## 4. API and separation of responsibilities

The new pure API is:

    generateExpressionBlinkGeometry(expression, side, progress, source?)

It validates the canonical expression name, side, finite numeric progress and complete source geometry. The optional source must be data-equal to that named expression/side; reordered properties and data-equivalent clones are accepted. Modified dimensions, side, contours, paint or resources are rejected, including at progress endpoints. There is no unsupported-expression fallback. Finite progress clamps to [0,1]; nonnumbers, NaN and infinities throw RangeError.

At progress 0 the exact source object is returned, preserving its native viewport and complete artwork. Idle/Happy/Shock delegate to the unchanged Phase 1 generator. Layered-family interior results use a separate typed expression-blink configuration containing the original source, expression name, upper/lower controls, aperture path, stroke paths and interior visibility. At full closure both lids are pinned to the exact same frozen contour, avoiding floating-point residual gaps.

expressionBlinkPresets.ts owns immutable cached source-derived lid configurations and semantic landmarks. Expression artwork stays in the existing canonical presets; external positions stay in FACE_LAYER_LAYOUTS. No layout, React or store dependency enters the pure blinking functions. The old BlinkGeometry data contract is preserved; a separate union adds the layered output.

## 5. Shared Idle / Happy / Shock policy

Actual asset mappings and equality checks confirm that all three currently have the same local eye artwork and eye layouts. Happy maps to the Idle files; Shock maps to separate files whose contents agree with Idle after resource naming. Each expression remains a separate selector/API name and is rendered at its own checked layout.

The generator reuses the canonical Phase 1 motion rather than copying its controls. A source-equality guard rejects a future changed shared-family artwork until its correspondence is reviewed. The tests validate each expression against its actual mapped source SVG, including the separate Shock exports, and compare every generated shared-family sample with Phase 1.

The unchanged closed support spans x=-4..133, with edge y=124.62 and cubic control y=137.66. The midpoint is y=134.4. Body, independent outline and highlights are never converted into an approximate open endpoint.

## 6. Happier strategy

Happier uses its actual five-cubic body as the stroke boundary; no Idle body is introduced. Semantic measurements come from its top (61.3243,2), lateral point (120.649,81.3073), lower-right/left shoulders (98.1679,131.265)/(24.4808,131.265) and lower bridge. The bridge's analytic lower y extremum is 136.41675, retaining the source distinction from gradient endpoint 136.416.

Its conservative upper support follows a dome, using source lateral/top heights with outward margins. Its lower support lies eight units below the measured bridge. These supports are clipping controls, not replacements for the approved source perimeter. Original side silhouettes remain visible where not covered by the aperture.

The closed contour is an upward arch, rather than Idle's downward shallow curve. With h=lowerY−topY, edgeY=shoulderY−.13*h and arch=.075*h, the controls are edgeY−4/3*arch. The x span is -6..128.649. Rounded controls are edge y=113.7908225 and internal control y=100.3491475. Both sides are prepared from their own canonical source; their values agree because their inspected source geometry agrees.

The existing stroked body is painted once. Added lid strokes terminate within that same body boundary; no second complete eye outline is painted. Highlights retain original coordinates and opacity and are clipped by the aperture. Sampled intermediate curves have no intersections or control spikes.

## 7. Sad strategy and lower detail policy

Left/right preparations read their own central upper cubic and lower return cubic. The right upper cubic is reversed into left-to-right traversal; neither complete eye is synthesized by reflection. Upper native y controls are:

| Side | Start / control 1 / control 2 / end y |
| --- | --- |
| Left | 31.1302 / 35.927 / 32.1974 / 16.8846 |
| Right | 16.8846 / 32.1974 / 35.927 / 31.1302 |

Analytic derivative roots on the native lower cubic give lower extrema approximately (83.5855958897,138.5940890161) left and (58.1059505370,138.5940890161) right. The closed contour blends 25% of each native upper y control with 75% of that side's lower extremum, adding six units to the two inner controls for a shallow curve. The opposite upper slopes therefore remain visible in the closed pair.

Upper open supports use those native y controls minus 24 units; lower supports conservatively cover the source viewport plus eight units. All use the same monotone horizontal parameterization across x=-8..150. This retains source highlight overpaint and lower details at the open end rather than abruptly clipping them to a fitted eyeball.

Selected detail policy: clip the complete source scene, including the original lower-circle use, its mask/stroke and the transformed ellipse, through the moving aperture after painting. The lower ornament is attached to the source lower edge. It is partially retained while exposed, then covered by the rising lower lid. A small attached source fragment remains around the 50% sample; no detached fragment is introduced. At 100% every interior/detail layer is hidden. Original matrix/rotate transforms and both mask/use reference systems stay unchanged.

## 8. Cry water and right-detail policy

Cry independently reads each side's own base body and primary outline. Those base controls match corresponding Sad contours; its supplementary outline/mask rounding, water, viewport and right-only detail still come from the actual Cry configuration. Shared base contour equality justifies the same lid derivation, not substitution of the complete artwork.

The blue sixteen-cubic water path remains mounted exactly once, with original commands, fill and position. The right white ellipse, original group/fill opacity, blur=15 and its filter region also stay mounted exactly once. Blinking never scales, translates, restarts or deletes these source shapes. Tests compare the complete painted interior markup against the open scene at every rendered sample, in addition to checking source identity and unique resource references.

Selected visibility policy: apply the same moving aperture to the entire painted eye scene after all source filters. This clips water and the right blur to exposed eye space. Water remains visible in every requested partial Cry sample and is covered completely at 100%, then returns exactly when reopening. The lower support uses each actual viewport height, including Cry-right's taller blur extent, to avoid dropping that source effect abruptly near progress zero.

No falling particles or face-level tear strips were added. The separate cryEffect artwork is unchanged and is not mounted by this preview.

## 9. Thinking left/right behavior

Thinking-left uses its own six-cubic body, mixed primary outline, masked supplementary outline, highlight coordinates and source filters. Its base contour matches the inspected left sloping family, so the same landmark derivation yields a sloped closure without introducing Sad's lower ornament or Cry's water.

Thinking-right uses its actual layered ellipse scene and different highlights, not Idle artwork. Its source body/outline was confirmed equal to Idle. Its independent preset therefore borrows only the proven silhouette motion from Phase 1, guarded by the measured ellipse parameters. Its own boundary, source highlight paths, resources, viewport and layout remain separate. The left and right lid curves differ; the right is never mirrored from the left. Exact open raster comparisons cover both distinct source files.

## 10. Closed contour and aperture guarantees

All lid curves are cubics. Each pair shares the same x controls and common closed target; x(t) is strictly monotone. Open-to-closed interpolation moves the upper controls down and the lower controls up. Their vertical gap is (1-progress) times the original nonnegative control-weighted gap. Nonnegative Bernstein weights preserve this property across the whole curve, and matching x(t) prevents contour crossings. The aperture is a connected M/C/L/C/Z band. Dense numerical tests and sampled polygon intersection checks independently exercise these properties.

At 100% the source interior is hidden and the duplicate lower lid stroke is omitted. One width-4 black contour remains, clipped to the actual main body/primary outline boundary. Original source width-8 supplementary outlines remain unmodified within the clipped source scene during partial closure; they are not additional generated lids. No whole-eye opacity or scaleY operation simulates closure.

Rounded sloping closed controls, x=-8 / 44.6666667 / 97.3333333 / 150:

| Source side | Closed y values |
| --- | --- |
| Sad/Cry/Thinking-left | 111.7281168 / 118.9273168 / 117.9949168 / 108.1667168 |
| Sad/Cry-right | 108.1667168 / 117.9949168 / 118.9273168 / 111.7281168 |

These procedural designs and the Happier/Idle curves require artistic approval. Their full-precision controls and native landmarks are in [geometry-metrics.json](eye-expression-blinking/geometry-metrics.json).

## 11. Renderer, Anime.js and lifecycle

ExpressionBlinkEye is a compatible extension that delegates ellipse-family output to the untouched BlinkEye. Layered families use the existing validated generateEyeLayers conversion and paint original nodes directly into one SVG, avoiding a nested viewport clip. The named expression/source pairing is validated before rendering. React useId scopes aperture, boundary, gradient, filter, mask and use IDs. Simultaneous rendering of all 84 inspection instances has no duplicate or unresolved IDs.

EyeBlinkPreview reuses the existing local Anime.js 4.5.0 implementation and typed timing prop: closing=100 ms, hold=40 ms, opening=150 ms, inOutSine, autoplay:false before play. These are configured times, not measured device latency. Phase 1 custom-timing tests still pass.

Frame callbacks write only aperture/lid paths, interior clip/visibility and slider/output DOM properties. They do not write React state or Zustand per frame. Source paint nodes/resources remain mounted throughout a blink. React state is used for expression selection and loading/phase status only.

Expression selection calls the existing cancellation/reset path before changing the selected expression ref/state. Eye containers are keyed by expression and side so the new scene starts exactly open with its own layout. The current selection ref prevents stale closure capture. Generation tokens invalidate old callbacks before cancel(); the old animated object is detached so late driver mutation cannot corrupt a later run. Cancelling a closing callback cannot start an opening phase. The opening animation owns its delay, so cancelling during the hold cancels the remaining sequence. Cleanup rejects late imports and stale begin/update/complete callbacks. StrictMode-style setup/cleanup/setup, replays, Reset, scrubbing and rapid expression changes are tested.

## 12. Development preview and placement

The existing development-only comparison area now has an independent seven-option Blink expression selector. Current expression, dynamic title, status and closure percentage are shown. Manual closure still means open-to-closed geometry, not playback time. Play always starts from open and returns to open. Re-selecting the same expression preserves an active blink; invalid selections are ignored.

Each eye uses its original FACE_LAYER_LAYOUTS x/y/width/height and existing eye z-order. No positioning or second scale transform was introduced. The full 800×480 artwork and responsive canvas conventions remain unchanged. Existing EyeMorphPreview and static references remain intact and independently selectable. No production Expression Controller call is made.

The inherited Vite DEV guard removes the entire preview and geometry extension from production JS. Tests inspect all dist JS for distinctive blink/configuration/UI markers. Production main JS retains index-6BEnCzdN.js, matching Phase 1.

## 13. Visual artifacts and observations

Generated actual React SSR SVG and PNG at all six requested closure values for all seven expressions and both eyes: 84 SVG/PNG sample pairs, seven shape grids and seven original-placement grids. Individual files are expression/left-or-right-000/025/050/075/090/100.svg/png beneath eye-expression-blinking/.

| Expression | Shape progress | Approved placement |
| --- | --- | --- |
| Idle | [PNG](eye-expression-blinking/idle/blink-grid.png) | [PNG](eye-expression-blinking/idle/layout-grid.png) |
| Happy | [PNG](eye-expression-blinking/happy/blink-grid.png) | [PNG](eye-expression-blinking/happy/layout-grid.png) |
| Happier | [PNG](eye-expression-blinking/happier/blink-grid.png) | [PNG](eye-expression-blinking/happier/layout-grid.png) |
| Sad | [PNG](eye-expression-blinking/sad/blink-grid.png) | [PNG](eye-expression-blinking/sad/layout-grid.png) |
| Cry | [PNG](eye-expression-blinking/cry/blink-grid.png) | [PNG](eye-expression-blinking/cry/layout-grid.png) |
| Shock | [PNG](eye-expression-blinking/shock/blink-grid.png) | [PNG](eye-expression-blinking/shock/layout-grid.png) |
| Thinking | [PNG](eye-expression-blinking/thinking/blink-grid.png) | [PNG](eye-expression-blinking/thinking/layout-grid.png) |

Opened all seven shape grids and the Happier/Sad/Cry/Thinking placement grids. Observed source silhouettes and highlights at open; progressively narrowing apertures; Happier's upward closed arch; opposite sloping Sad/Cry sides; clipped/attached lower Sad details; retained Cry water and right blur until covered; and Thinking's different left/right silhouettes and closure heights. No detached source fragment, disconnected contour, residual interior at full closure, or sampled aperture crossing was found. The shared-family layouts are additionally verified numerically against their original identical eye positions.

The supports are deliberately conservative: early Happier closure preserves much of its dome, and the layered lower supports include native lower details/blur. Perceived naturalness and the newly designed closed contours remain review items. Static images and Node scheduling tests do not establish live browser appearance or target-display approval.

## 14. Raster comparison and detail evidence

Used the existing local resvg_py 0.5.0 and Pillow 13.0.0 environment via TEMP/brone-asset-tools. No packages were installed. The new [raster-validation.json](eye-expression-blinking/raster-validation.json) records:

- All 42 original-versus-open comparisons (seven expressions × two sides × 1×/1.5×/2×): zero differing RGBA pixels and zero maximum channel difference.
- All 14 full closures: one connected component using eight-neighbor connectivity, with every nontransparent pixel black. No gradient, highlight, water or filter leakage remains.
- All 56 partial samples: painted pixels remain connected; every nonblack pixel is inside the computed aperture with a one-unit antialiasing margin; exposed colored area decreases across samples. This margin applies only to partial-edge containment, never to endpoint equality.
- Cry has visible blue pixels at every partial sample on both sides. The original water path and right blur exist exactly once in the rendered scene.

The complete original painted interior markup, including all masks, filters, gradients, transforms and details, is identical at every inspection sample. Only its outer aperture/visibility and generated stroke paths change.

Existing verify-eye-raster.py retains its original six source/procedural pairs, sixteen complete XML comparisons and 48 expanded raster pairs, all exact. Existing render-eye-blinking.py retains all six zero-difference Idle endpoint pairs and connected black-only closures. Original source-hash and protected-file assertions remain unchanged.

## 15. Executed verification and regressions

Windows development host, Node 24.14.1, Vite 7.3.7, installed Anime.js 4.5.0. Commands from frontend unless specified. [check-results.json](eye-expression-blinking/check-results.json) records the 17 frontend command exit codes; all are zero. The focused new suite was rerun successfully after strengthening complete paint-markup assertions.

| Command | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS |
| node scripts/verify-eye-geometry.mjs | PASS, all static/expression/production tests |
| node scripts/verify-eye-morphing.mjs | PASS, including all five pairs' actual Anime playback |
| node scripts/verify-eye-sad-morphing.mjs | PASS, old protected hashes retained |
| node scripts/verify-eye-cry-morphing.mjs | PASS |
| node scripts/verify-eye-thinking-morphing.mjs | PASS, 808 prior geometry hashes retained |
| node scripts/verify-eye-blinking.mjs | PASS, all existing Phase 1 assertions retained |
| node scripts/verify-eye-expression-blinking.mjs | PASS, 1,414 geometry samples plus baseline/handler/renderer tests |
| node scripts/verify-mouth-geometry.mjs | PASS |
| node scripts/verify-mouth-morphing.mjs | PASS |
| node scripts/verify-mouth-expressions.mjs | PASS |
| node scripts/verify-face-layers.mjs | PASS |
| node scripts/verify-expression-controller.mjs | PASS |
| node scripts/verify-animation-engine.mjs | PASS |
| node scripts/verify-expression-transitions.mjs | PASS |
| node scripts/verify-element-transitions.mjs | PASS |
| python scripts/verify-eye-raster.py, established asset-tool environment | PASS |
| python scripts/render-eye-blinking.py, same environment | PASS |
| python scripts/render-eye-expression-blinking.py, same environment | PASS |
| git diff --check, repository root | PASS; existing LF/CRLF notices only |
| Actual browser / backend tests / target-device measurements | Not run |

The new suite covers all seven expressions and both sides, exact source endpoint identity, named-source rejection, finite/clamped progress, dense cubic controls, monotone/nonnegative/simple apertures, exact lid meeting, reverse opening, deterministic output, input immutability, source dimensions/original layouts, independent asymmetric presets, shared-family equality, exact source interior markup, lower Sad/water/right-detail retention and unique resources. It checks the immutable Phase 1 fixture and 63 protected files, and rejects transition/SHY/invalid-side inputs.

Actual component handlers are exercised in a Node hook/DOM-attribute harness: all expression choices, samples/slider/Reset/Play, reselecting the same expression, changing during closing and hold, stale callbacks, StrictMode-style cleanup, early import resolution, original new-expression props/layouts and no per-frame React state updates. Real installed Anime.js automatic closing/opening runs through the actual handlers for every expression, plus a live expression switch that remains open beyond the cancelled run's end. Canonical store identity remains unchanged. These are not browser DOM tests.

Reproduce after build:

    node scripts/verify-eye-blinking.mjs
    node scripts/verify-eye-expression-blinking.mjs
    $env:PYTHONPATH = "$env:TEMP/brone-asset-tools"
    python scripts/render-eye-blinking.py
    python scripts/render-eye-expression-blinking.py
    python scripts/verify-eye-raster.py

The baseline fixture must not be regenerated by these commands.

## 16. Modified files

Added:

- src/geometry/eyes/blink/expressionBlinkPresets.ts: source landmarks, analytic lower extrema, per-side immutable lid configurations.
- src/geometry/eyes/blink/expressionBlinkGeometry.ts: named expression/source validation and typed aperture generation.
- src/components/face/eyes/ExpressionBlinkEye.tsx: compatible layered renderer and local SVG attribute writer.
- scripts/verify-eye-expression-blinking.mjs and render-eye-expression-blinking.py.
- reports/EYE_MULTI_EXPRESSION_BLINKING.md.
- reports/eye-expression-blinking/: immutable baseline, samples/metrics/check/raster JSON, 84 SVG/PNG sample pairs and seven shape/placement SVG/PNG grid pairs each.

Updated:

- src/geometry/eyes/blink/types.ts and index.ts: additional typed contracts/exports; old Phase 1 contract retained.
- src/components/face/eyes/EyeBlinkPreview.tsx: local expression selection, selected-expression ref, original per-expression placement and keyed open-scene reset.
- scripts/verify-eye-blinking.mjs: register the compatible renderer import in its existing harness only; original assertions remain.
- tsconfig.tsbuildinfo: TypeScript-generated cache.

Existing verification scripts refresh their established report artifacts. Original canonical presets, source art, protected renderers, morph algorithms, layouts, protocol and backend were not changed by this extension.

## 17. Limitations and readiness for gaze work

Closed silhouettes and moving support envelopes are procedural designs, not source-approved eyelids. Source body shadows are clipped after filtering rather than recomputed along the moving lids. Sad's attached lower ornament is progressively cut off; Cry-right's conservative lower envelope includes its native blur extent. These are deliberate phase-specific visibility policies, not tear/fluid animation. The prototype does not compose expression morphing and blinking simultaneously.

Browser scheduling/raster differences, target-display appearance, perceived timing and performance remain unverified. Static endpoint equality and dense geometry tests do not substitute for artistic review of all continuous motion. No random blinking, gaze, squash/stretch, visemes or production migration was implemented.

Expression artwork, aperture controls and external layout now have separate ownership, with exact open endpoints and per-family validation. That gives a useful foundation for a later gaze task, but gaze still needs an explicit interior-motion/containment model, highlight behavior, interaction with blink clipping, expression-specific bounds and browser/device evidence. The next step is reviewing the seven previews on the intended browser/display and approving or revising the closed silhouettes before any production or gaze integration.
