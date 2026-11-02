# Eye Morphing Phase 2A — Idle to Sad

## Result and scope

Idle → Sad and Sad → Idle now work independently for both eyes through the existing geometry API and local development preview. An animated target selector offers Happier and Sad; switching targets cancels playback and resets progress to Idle. Play, Reverse, Reset, progress slider, inspection samples, animation status, current expression and phase follow the selected target. The independent static selector still offers every canonical expression and the separately labelled transition reference.

The previous Idle/Happier output is preserved exactly: pre-edit SHA-256 snapshots of generated geometry at 101 progress values per side match all **202** post-edit results. Protected file hashes also confirm that canonical eye presets/layouts, approved artwork, production Eyes/FaceRenderer/ProceduralEye, mouth geometry/components, animation source, backend schema, shared protocol and canonical store files were not changed. Existing unrelated working-tree changes were preserved. No dependencies were added or installed.

No Cry/Thinking morphing, blinking, gaze, visemes or production migration was implemented. Main eye geometry is never replaced by a whole-eye opacity crossfade.

## 1. Source geometry analysis

Inspected actual `public/assets/face-layers/eyes/{left,right}/idle-eye-{side}.svg` and `sad-eye-{side}.svg`, current extracted source presets, layered renderer/validator, prior morphing implementation and FACE_LAYER_LAYOUTS. The original exports remain the source of truth. Their full XML attributes, commands, paint order and hashes are retained in [eye-svg-inventory.json](eye-svg-inventory.json). See also [static-eye analysis](EYE_MULTI_EXPRESSION_IMPLEMENTATION.md) and [Idle/Happier correspondence](EYE_GEOMETRY_MORPHING.md).

| Feature | Idle, both sides | Sad-left | Sad-right |
| --- | --- | --- | --- |
| Viewport | 129 x 171 | 142 x 156 | 142 x 156 |
| Body | Ellipse center (64.5,85.5), radii (60.5,81.5) | Six cubics, sloping/concave upper edge | Independent six cubics, opposite slope |
| Primary outline | Independent eight-cubic path, black width 4 | Eight cubics plus four short lines, black width 4 | Independent mixed-command outline, black width 4 |
| Small highlight | (27.7,94.8559), radii (9.2,9.6) | (42.9422,90.9853) | (30.1492,90.9853) |
| Notched highlight | Eight cubics, white opacity 0.96 | Independent eight-cubic path, start (56.7422,29.3853) | Independent eight-cubic path, start (43.9492,29.3853) |
| Gradient | (64.5,4) → (64.5,167) | (78.8829,7.85522) → (62.8089,136.38) | (62.8085,7.85522) → (78.8825,136.38) |
| Additional outline | None | Filtered width-8 path with outside-body mask | Same source feature, independent controls/mask coordinates |
| Lower details | None | Referenced four-cubic round detail, mask/stroke and transformed dark ellipse | Independent round detail, mask/stroke and rotated dark ellipse |

Both Sad gradients retain userSpaceOnUse and original stops 0.0625/#6260B0 and 0.533654/#29284A. Both highlights retain white fill and opacity 0.96. The body and primary outline have distinct source contours. The additional width-8 outline uses a black body path in a white-rectangle mask, exposing the outside portion of its stroke. The lower detail is painted through `use`, its own mask, width-8 stroke and a dark #29284A ellipse. These are separate features, not a second copy of the whole eye.

Sad-left's lower ellipse retains `matrix(-0.961592 -0.274482 -0.274482 0.961592 94.1992 124.054)`; Sad-right retains `rotate(-15.9311 71.1942 127.572)`. The left/right highlight offsets, gradient slopes, contour rounding and detail placement were extracted independently; neither side is synthesized by reflection.

Original paint order is filtered body, primary outline, small highlight, notched highlight, filtered masked supplementary outline, lower-detail use, lower-detail mask, lower-detail outline, transformed lower ellipse, defs. Interior rendering preserves this order, grouping only the lower-detail subtree for its localized emergence.

## 2. Semantic correspondence per side

Sad's x-extrema occur near its upper corners. Matching them to Idle's mid-height lateral extrema would compress the wrong sectors. The chosen landmarks are therefore **upper-edge midpoint → upper-right rounded corner → lower y-extremum → upper-left rounded corner**, in positive signed-area order for SVG coordinates.

Idle uses native eight-segment anchors `[0,1,4,7]`: top, upper-right shoulder, bottom, upper-left shoulder. The ellipse body uses the existing eight-arc conversion; its outline remains the independent source eight-cubic contour.

Positions below are native segment-index plus local parameter, before direction reversal. Sad outline line commands are counted as segments and converted to exact straight cubics for preparation. The original mixed commands are returned unchanged at the endpoint.

| Contour | Sad-left anchors / reverse | Sad-right anchors / reverse |
| --- | --- | --- |
| Body | [1.5, 2.5, 4.274997786459874, 0.5] / no | [1.5, 0.5, 4.274997786459874, 2.5] / yes |
| Primary outline | [11.5, 0.5, 5.549909547180367, 10.5] / no | [11.5, 10.5, 5.549909547180367, 0.5] / yes |
| Outside-stroke mask body | Same body landmark policy, own source controls / no | Same body landmark policy, own source controls / yes |
| Supplementary outline | [2.5, 1.5, 5.725002213540126, 3.5] / yes | [2.5, 3.5, 5.725002213540126, 1.5] / no |

The lower parameters are calculated from the selected cubic's analytic y-derivative roots, not guessed from segment count. Top/corner midpoints are explicit inspected source positions. Direction reversal swaps controls and segment traversal while preserving the underlying curves.

Body target landmark coordinates, in canonical order:

| Side | Upper midpoint | Upper-right corner | Lower y-extremum | Upper-left corner |
| --- | --- | --- | --- | --- |
| Left | (71.49635,31.5485) | (130.726875,16.9976375) | (83.5855958897,138.5940890161) | (13.921175,32.134925) |
| Right | (70.1950625,31.5485) | (127.770125,32.134925) | (58.1059505370,138.5940890161) | (10.96458375,16.9976375) |

The independent primary-outline landmarks and tiny mask rounding differences are retained, rather than substituting the body outline. Exact controls, anchors, directions, prepared vertex indices and attachment metadata are recorded in [correspondence.json](eye-sad-morphing/correspondence.json).

## 3. Subdivision and interpolation architecture

`geometryInterpolator.ts` adds an explicit same-side Idle/Sad branch before the unchanged Idle/Happier branch. Both endpoints are validated; only exact approved source configurations or data-equivalent clones are accepted. Modified sources, cross-side pairs, Happier/Sad, Cry, Thinking and the transition chevron are rejected. Finite progress clamps; nonnumeric/nonfinite progress fails. Clamped endpoints return the exact caller object, preserving original controls, resource definitions and paint.

`prepareIdleSadEye` caches and freezes separate preparations per side. Each body/outline/mask/supplementary pair is aligned independently:

1. Convert source lines to their exact cubic representation with controls at one-third and two-thirds of the line.
2. Align traversal and split each native contour into the four semantic sectors above.
3. Measure each source piece's arc length with 64-step Simpson integration.
4. Use the union of normalized arc-distance knots within each sector; locate corresponding split parameters using 36 bisection iterations.
5. Apply exact De Casteljau subdivision to the original curve, preserving its geometry. Arc-distance estimation chooses correspondence only; it does not fit a new curve.

Prepared counts are **14** segments for body, **20** for primary outline, **14** for mask body and **14** for supplementary outline, on both sides. Matching raw array indices is used only after this semantic preparation. Original span start/controls/parameter intervals remain available to verify analytic evaluations against the prepared curves.

Each prepared pair then interpolates native control coordinates linearly. Body fill, independent primary outline, outside-stroke mask and supplementary contour remain separate. Layered M/C/Z output stays closed; the four short native outline lines are still straight after exact cubic conversion/subdivision. Endpoint objects retain their original L commands.

The existing ellipse conversion and its measured interior error (<0.00035 logical units in the prior dense samples) are reused unchanged. Idle's exact ellipse is returned at progress 0; the exact original Sad object is returned at progress 1. No source artwork is adjusted for topology convenience.

## 4. Sad-specific lower details and attachment

Idle has no lower round detail or dark transformed ellipse, so no invented matching source contour is assigned to them. The actual Sad lower subtree is retained unchanged, including paths, use/mask references, stroke widths, ellipse controls and matrix/rotation.

An attachment point is selected on Sad's lower body directly above the original lower-circle center. A monotonic solve on the original lower cubic finds that point; the prepared correspondence supplies its matching Idle point. Its parameter is then evaluated on the interpolated body, so attachment tracks the body continuously.

| Side | Corresponding Idle attachment | Sad attachment |
| --- | --- | --- |
| Left | (44.0965471776,162.2254532197) | (65.9167,135.4540917985) |
| Right | (86.0477338650,161.6556219262) | (76.7805,135.0871597353) |

The target attachment lies inside the original lower circle and on the main body edge. The lower subtree is wrapped in a uniform-scale affine matrix: scale=p and translation=currentAttachment − p×targetAttachment. At p→0 its geometry collapses to the corresponding lower Idle edge; at p→1 the wrapper becomes identity. Its original shape proportions and internal transforms remain intact. Tests verify the transformed target attachment equals the actual point on the interpolated body at every interior sample.

A localized smoothstep opacity `p²(3−2p)` accompanies this emergence. The same local appearance schedule introduces Sad's supplementary masked outline, which has no Idle layer counterpart. Main body and primary outline remain fully opaque; this local detail treatment does not substitute for their geometric deformation. Existing highlight opacity remains 0.96.

The affine growth keeps each detail point on a direct path from an inside-viewport lower-edge point to its original endpoint position. In the rendered samples the detail remains connected and does not suddenly appear as a full-size detached shape. This is a documented prototype emergence policy, not evidence that Idle has an approved hidden lower-detail shape.

## 5. Masks, highlights, gradients and filters

The outside-stroke mask's path follows its own prepared body correspondence; its supplementary width-8 contour follows its own source controls. Original source rounding differences are not overwritten by one shared path. Resource IDs and URL/xlink references remain logical references until the existing useId-scoped renderer generates unique instance IDs. Tests cover both masks and all references with multiple eyes rendered simultaneously.

During interior frames, filter regions and the outside-mask white rectangle use a fixed padded working region (-16,-16,180,205), covering the entire transitioning geometry. This avoids applying Sad's smaller native filter/mask rectangle to the taller initial Idle shape. It is a deliberate region policy, not primitive interpolation. At both endpoints the original objects return, including exact source regions and implicit mask defaults.

Body-shadow and supplementary-outline filter primitive arrays are copied unchanged from the approved Sad definitions. Idle/Sad share their sRGB inner-shadow pipeline: transparent flood, SourceGraphic blend, hard-alpha matrix, dy=4, blur=2, arithmetic composite and black alpha=0.25. No arbitrary matrix coefficient, blur, offset or filter operator is interpolated. The supplementary effect is localized by its group opacity. No whole-eye filter crossfade is introduced.

Gradient endpoints interpolate independently toward each Sad side's original tilted gradient. Stops and colors do not change. Small highlights interpolate to the side-specific centers; the eight notched-highlight pieces retain their shared feature ordering and interpolate to the corresponding source controls. Original Sad highlight overpaint near the eyelid is preserved through original layer order and the outside masked outline; an invented clipping path was not added to redesign it.

## 6. Layout and animation

External layout continues through `interpolateEyeLayout`, using untouched FACE_LAYER_LAYOUTS:

| Side | Idle x/y/width/height | Sad x/y/width/height |
| --- | --- | --- |
| Left | 115 / 154 / 129 / 171 | 104 / 148 / 142 / 156 |
| Right | 556 / 154 / 129 / 171 | 554.25 / 148 / 142 / 156 |

The existing 800×480 artwork and 1490×960 responsive display system remain unchanged. Interpolated viewport dimensions equal interpolated layout dimensions; no transform scale is added to the main eye. The small lower-detail affine transform serves its emergence only.

EyeMorphPreview keeps its existing Anime.js 4.5.0 local progress object, duration=1000 ms, inOutSine, autoplay=false then play(). Target selection offers only Happier and Sad. Selection replacement cancels the current owned run, invalidates its callbacks and resets to Idle before changing target. A current-target ref also handles selection changes while the dynamic Anime.js import is pending. Re-selecting the same target preserves the current run.

Both target directions, scrub, sample buttons, Reset and endpoint button states remain. Status, current expression and phase use the selected label. All frame updates stay inside the development component; no production engine/controller/store semantics change. The actual production bundle contains no procedural-eye, morphing or Sad-preparation implementation markers; production Eyes remains asset-based.

## 7. Visual validation

Actual React SVG output was exported for left/right eyes at 0,10,25,50,75,90,100 percent and rendered with the existing local resvg_py 0.5.0/Pillow 13.0.0 environment. The final [shape matrix](eye-sad-morphing/morph-grid.png) and [layout matrix](eye-sad-morphing/layout-grid.png) were opened and inspected.

Observed in these static samples: the upper dome progressively flattens and takes the correct opposite slopes per side; lower curvature and primary outline remain continuous; highlights move gradually; the supplementary outline and attached lower detail emerge locally. No visible detached detail, unexpected spike, broken outline or sudden mask cutoff was observed. The left/right asymmetry is retained. This is bounded visual review of the requested sample positions, not a universal perceptual guarantee.

The actual morph API endpoints were compared with the original Idle/Sad SVGs as transparent RGBA images at 1x,1.5x,2x. **All 12 endpoint pairs have zero differing pixels and zero maximum channel difference.** Detailed results: [endpoint-raster-validation.json](eye-sad-morphing/endpoint-raster-validation.json). Existing Happier endpoint raster QA also remains zero across 12 pairs; the static-eye six Phase-1 and 48 all-expression pairs still pass unchanged.

Real browser access was checked through Computer Use. The connector returned **“The browser access host is unavailable”**. No browser preview interaction or browser screenshot pass is claimed. Target-browser scheduling, resizing and robot-display review remain unverified; no robot FPS/latency/performance improvement is asserted.

Reproduce from frontend with the established local asset tools; no dependency installation is required:

```powershell
npm run typecheck
npm run build
node scripts/verify-eye-geometry.mjs
node scripts/verify-eye-morphing.mjs
node scripts/verify-eye-sad-morphing.mjs
$env:PYTHONPATH = "$env:TEMP/brone-asset-tools"
python scripts/render-eye-morphing.py --target sad
python scripts/render-eye-morphing.py
python scripts/verify-eye-raster.py
```

## 8. Tests and evidence

Windows development host, Node 24.14.1, Vite 7.3.7 and installed Anime.js 4.5.0. Commands from frontend except git. Final results:

| Check | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS |
| node scripts/verify-eye-geometry.mjs | PASS; all static source/production compatibility checks retained |
| node scripts/verify-eye-morphing.mjs | PASS; includes Sad geometry suite and actual handlers/playback for both targets |
| node scripts/verify-eye-sad-morphing.mjs | PASS; 101 progress values per side, 202 unchanged Happier baseline hashes, protected file integrity |
| python scripts/render-eye-morphing.py --target sad | PASS; 12 zero-difference endpoint pairs, visual sheets generated/inspected |
| python scripts/render-eye-morphing.py | PASS; 12 existing Happier endpoint pairs |
| Existing python scripts/verify-eye-raster.py | PASS; existing XML and raster tests unchanged |
| node scripts/verify-mouth-geometry.mjs | PASS |
| node scripts/verify-mouth-morphing.mjs | PASS |
| node scripts/verify-mouth-expressions.mjs | PASS |
| node scripts/verify-face-layers.mjs | PASS |
| node scripts/verify-expression-controller.mjs | PASS |
| node scripts/verify-animation-engine.mjs | PASS |
| node scripts/verify-expression-transitions.mjs | PASS |
| node scripts/verify-element-transitions.mjs | PASS |
| git diff --check | PASS; existing LF/CRLF normalization warnings |
| Real browser / robot-display checks | Unavailable / not run |
| Backend tests | Not run; backend/protocol unchanged |

Sad tests verify exact endpoint identity/clamping/reverse, explicit native landmark positions and direction reversal, independent left/right preparation, source subdivision evaluation, exact line-to-cubic preservation, finite/control-net interpolation, closed contours, deterministic immutable output, unsupported/modified endpoint rejection and layout equality. At every interior progress sample, sampled polygons for body, primary outline, mask and supplementary contour are checked for self-intersections and positive orientation. Analytical De Casteljau evaluations are compared against retained native curve spans at five parameters per prepared segment. Attachment follows the current body; lower source geometry and filter primitives remain unchanged.

Resource tests validate multiple simultaneous gradient/filter/mask/path IDs and all references. Local emergence opacity, main-body opacity absence, source stroke widths, highlight opacity and gradient endpoints/stops are checked. Existing tests continue to prove production asset rendering and all original asset hashes.

The actual preview's shallow-hook harness checks Happier/Sad selection, both rendered eye props at every inspection sample, invalid Cry selection rejection, reselecting the same target, switching during playback, stale callbacks, reset, scrub, reverse, endpoint status and selection while import is pending. Real automatic Anime.js playback exercises forward/reverse for both targets and confirms a target switch stays at Idle beyond the cancelled run's original completion time. Canonical store identity remains unchanged. These are real Anime.js/hook tests, not browser DOM tests.

The former rejection list no longer treats Sad as unsupported; all prior Happier coordinate/raster assertions remain, strengthened by the 202-sample pre-edit baseline comparison. No endpoint or raster tolerance was loosened. The first shell invocation could not initialize its sandbox helper; approved escalated execution completed the required checks.

## 9. Files changed

Updated:

- src/geometry/eyes/geometryInterpolator.ts: explicit Idle/Sad dispatch, semantic sector preparation, arc-distance subdivision, layered Sad morph, detail attachment/emergence.
- src/geometry/eyes/index.ts: export prepareIdleSadEye.
- src/components/face/eyes/EyeMorphPreview.tsx: local animated target selector and target-aware controls/geometry/layout/status.
- scripts/verify-eye-morphing.mjs: retain Happier regression, exercise both target handlers/playback and invoke the dedicated Sad suite.
- scripts/render-eye-morphing.py: optional --target sad; the default Happier behavior remains.
- tsconfig.tsbuildinfo: regenerated by TypeScript checks.

Added:

- scripts/verify-eye-sad-morphing.mjs
- reports/EYE_SAD_MORPHING.md
- reports/eye-sad-morphing/happier-baseline.json: pre-edit output hashes, never automatically re-recorded by tests.
- reports/eye-sad-morphing/protected-baseline.json: pre-edit hashes for protected source/artwork files.
- reports/eye-sad-morphing/{samples.json,correspondence.json,morph-grid.svg,morph-grid.png,layout-grid.svg,layout-grid.png,endpoint-raster-validation.json}

Existing eye report artifacts were regenerated by their existing checks. No canonical preset, original SVG, layout/config, production renderer, mouth module, animation source, store, backend, protocol or dependency file was edited by this task.

## 10. Limitations and readiness for Cry

This is a bounded Idle/Sad prototype with exact source endpoints. Arc-length calculation selects correspondence numerically; De Casteljau preserves the chosen source pieces. Dense sampled polygon tests and the seven rendered positions are not analytic self-intersection, curvature or all-time naturalness proofs. The previous sampled ellipse approximation error still applies to interior source-body conversion. Filter/mask working regions and localized detail scale/opacity are explicit prototype policies requiring live browser/robot review.

The generic public API remains restricted to source-derived Idle/Happier and Idle/Sad pairs in either direction. It does not accept Cry, Thinking, the transition chevron, arbitrary endpoint edits or arbitrary expression-to-expression pairs. No source correspondence is inferred from segment count alone.

The Sad base-contour analysis can inform a later Cry inspection, but Cry adds water geometry, distinct paint interactions and right-eye blur/detail/viewport behavior. It needs its own source correspondence and appearance policy; this task does not establish readiness to animate those features. Next step is real-browser/robot-display review of both current targets before starting Cry morphing. Blinking, visemes and production migration remain outside this phase.
