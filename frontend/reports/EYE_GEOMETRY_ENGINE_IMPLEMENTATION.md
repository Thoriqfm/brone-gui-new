# Eye Geometry Engine — Phase 1

## Result and scope

Idle left/right eyes are generated from typed TypeScript geometry and rendered as inline SVG. Happy references the same preset pair because both its actual asset mappings and eye layouts match Idle. Production Eyes, FaceRenderer, expression mappings/layouts, animation controllers, mouth geometry/preview, backend, shared protocol and Zustand semantics received no edits in this task. Existing unrelated working-tree changes were preserved. No dependencies were added or installed.

This phase is static only: no morphing, blinking, gaze, movement, idle animation, visemes or production migration.

## Inventory and source analysis

All 14 available eye SVGs were inspected. The complete, ordered XML attribute inventory is [eye-svg-inventory.json](eye-svg-inventory.json). It records every path's original d string and command sequence, every ellipse, fill/stroke/width/opacity, gradient/stop, transform, filter primitive, mask, reference, root dimensions and SHA-256 hash. Its child arrays preserve document/paint order, including masks and defs. `python scripts/analyze-eye-assets.py` reproduces the read-only inventory; the committed snapshot is the integrity baseline, not automatically rewritten by tests.

All roots use fill=none; dimensions equal their `0 0 width height` viewBox. Paths below include paths inside masks and defs, not just directly painted paths. `MC8Z` means M followed by eight absolute cubic C commands and Z. No relative commands or SVG arcs are present.

| SVG filename | Expression / side | Width x height / viewBox | Path count | Ordered path topology | Style family |
| --- | --- | --- | --- | --- | --- |
| idle-eye-left.svg | Idle / left; also Happy | 129 x 171 / 0 0 129 171 | 2 | MC8Z, MC8Z | A |
| idle-eye-right.svg | Idle / right; also Happy | 129 x 171 / 0 0 129 171 | 2 | MC8Z, MC8Z | A |
| shock-eye-left.svg | Shock / left | 129 x 171 / 0 0 129 171 | 2 | MC8Z, MC8Z | A |
| shock-eye-right.svg | Shock / right | 129 x 171 / 0 0 129 171 | 2 | MC8Z, MC8Z | A |
| happier-eye-left.svg | Happier / left | 123 x 139 / 0 0 123 139 | 2 | MC5Z, MC8Z | B |
| happier-eye-right.svg | Happier / right | 123 x 139 / 0 0 123 139 | 2 | MC5Z, MC8Z | B |
| happier-transition-eye-left.svg | Frontend static preview / left | 156 x 153 / 0 0 156 153 | 1 | MCLCLLCLCLCLZ | C-left |
| happier-transition-eye-right.svg | Frontend static preview / right | 160 x 163 / 0 0 160 163 | 1 | MCLCLLCLCLCLZ | C-right |
| thinking-eye-left.svg | Thinking / left | 142 x 145 / 0 0 142 145 | 5 | MC6Z, MCCCLLCCLLCCCZ, MC8Z, MC6Z, MC6Z | D |
| thinking-eye-right.svg | Thinking / right | 129 x 171 / 0 0 129 171 | 2 | MC8Z, MC8Z | E |
| sad-eye-left.svg | Sad / left | 142 x 156 / 0 0 142 156 | 7 | MC6Z, MCCCLLCCLLCCCZ, MC8Z, MC6Z, MC6Z, MC4Z, MC4Z | F-left |
| sad-eye-right.svg | Sad / right | 142 x 156 / 0 0 142 156 | 7 | MC6Z, MCCCLLCCLLCCCZ, MC8Z, MC6Z, MC6Z, MC4Z, MC4Z | F-right |
| cry-eye-left.svg | Cry / left | 142 x 145 / 0 0 142 145 | 6 | MC6Z, MCCCLLCCLLCCCZ, MC8Z, MC16Z, MC6Z, MC6Z | G-left |
| cry-eye-right.svg | Cry / right | 142 x 183 / 0 0 142 183 | 6 | MC6Z, MCCCLLCCLLCCCZ, MC8Z, MC16Z, MC6Z, MC6Z | G-right |

Each filename lives under `public/assets/face-layers/eyes/{left,right}/`. There is no separate Happy eye export.

### Shared gradient, colors and effects

Every eye uses a userSpaceOnUse linear gradient with stops 0.0625 = #6260B0 and 0.533654 = #29284A. All outlines are black, width 4; the D/F/G families additionally have masked black width-8 outlines. Highlight ellipse radii are (9.2,9.6), fill white, opacity 0.96; the larger notched highlight is an eight-cubic closed white path with opacity 0.96. C has no highlights. All other paint defaults to opacity 1, except the additional Cry-right white ellipse with fill-opacity 0.8. F includes #29284A lower details; G includes #76C5FD water.

All inner-shadow filters use sRGB and userSpaceOnUse: transparent flood, SourceGraphic blend, SourceAlpha hard-alpha matrix, offset dy=4, Gaussian stdDeviation=2, arithmetic composite k2=-1/k3=1, black alpha-0.25 matrix, final normal blend. A/E have one such filter; D/F/G have two. Cry-right additionally has a Gaussian blur filter (full primitive attributes are retained in the JSON inventory).

### Family-specific geometry, gradients and paint order

**A — Idle/Shock:** paint filtered body ellipse, independent outline, small highlight ellipse, large notched highlight, then defs. Body center (64.5,85.5), radii (60.5,81.5). Outline starts at (64.5,2), spans x=2..127 and y=2..169, and retains all eight original cubics. The body and outline are distinct geometry: replacing both with one stroked ellipse would alter the export. Gradient is (64.5,4) to (64.5,167). Filter region is (0,0,129,175), intentionally taller than the 171-unit viewport. Small highlight center is (27.7,94.8559). Large highlight starts at (41.5,33.2559) and retains its inward notch. No transforms or masks.

**B — Happier:** paint five-cubic gradient body with black width-4 stroke, small highlight at (25.7,92.8559), large highlight starting (39.5,31.2559), defs. Gradient (61.3243,2) to (61.3243,136.416). No filters, masks or transforms. This is not Idle geometry.

**C — happier-transition:** single gradient-filled angular chevron with width-4 black stroke, then defs. Exact path sequence is MCLCLLCLCLCLZ on each side, but coordinates, viewport and gradient differ. Left gradient (72.9256,-3.61152) to (86.1986,144.962); right (86.2365,6.51836) to (72.9635,155.091). No filters, masks, highlights or transforms. Equal command strings do not establish geometric symmetry or correspondence.

**D — Thinking-left:** filtered six-cubic body, independent mixed cubic/line outline, highlight ellipse at (42.9422,90.9853), notched highlight starting (56.7422,29.3853), filtered masked width-8 outline, defs. Gradient (78.8829,7.85522) to (62.8089,136.38). Two filter regions (8.61523,12.5164,130.609,134.077). Mask region (-4.52413,-2.48094,150.834,151.702), black fill with white rectangle and body path. No transforms.

**E — Thinking-right:** A's ellipse/outline/gradient/filter topology, but small highlight center is (27.2,94.6), a shift of (-0.5,-0.2559) from Idle-right. Its notched highlight also has its own source coordinates. It must not silently reuse Idle-right. No masks or transforms.

**F — Sad:** begin with D's body/outline/highlight structure for the corresponding side, then filtered masked outline, dark lower detail via use, its second mask and width-8 outline, dark transformed ellipse, defs. Left highlight/gradient/filter coordinates match D; right small highlight center is (30.1492,90.9853), gradient (62.8085,7.85522) to (78.8825,136.38), filter regions (2.4668,12.5164,130.609,134.077), primary mask (-4.61836,-2.48094,150.834,151.702). Left lower ellipse uses `matrix(-0.961592 -0.274482 -0.274482 0.961592 94.1992 124.054)` with local center (20.8589,9.61236); right uses `rotate(-15.9311 71.1942 127.572)` with center (71.1942,127.572). Both radii (20.8589,9.61236). Two masks and use/xlink references require dedicated handling beyond the Phase-1 renderer. The full left/right paths remain separately recorded.

**G — Cry:** filtered body, independent outline, two highlights, blue sixteen-cubic water shape, filtered masked width-8 outline, defs. Left shares D's base coordinates and effects; right shares F-right's corresponding base coordinates/effects. Right additionally paints a filtered white ellipse centered (64.7422,131.546), radii (6.78906,20.5486), fill-opacity 0.8, after the outline. Its additional filter region is (27.9531,80.9978,73.5781,101.097). This additional detail and the 183-unit viewport make the right export materially different from the 145-unit left export. No transform attributes in either Cry export.

### Confirmed matches and differences

Complete XML/attribute comparison after renaming Figma IDs, URL references and filter-result names confirms one shared artwork group: Idle-left, Idle-right, Shock-left, Shock-right. Left/right Idle are not mirrored: both highlights remain at identical local coordinates. Happier-left/right form another identical group. All other full eye exports are unique, including Thinking-right's subtle highlight shift and both transition viewports. Shared base paths across D/F/G do not make those complete eyes interchangeable. Only Idle and Happy are exposed by this engine; no mappings were expanded to Shock or Happier.

Ellipses can be represented exactly with center/radii. Curved paths require their explicit measured controls rather than generic roundness or curvature parameters. Angular C paths, the D/F/G mixed-command outlines, lower Sad details/masks and additional Cry effects need separate treatment in a later phase. Nothing was approximated or removed from the supported artwork.

## Geometry model and presets

`src/geometry/eyes/types.ts` defines readonly EyeGeometry with independent side, viewport width/height, body ellipse, closed outline control net, stroke color/width, gradient endpoints/stops, source shadow region/offset/blur/opacity, and optional ellipse/contour highlights. These parameters all correspond to observed source features. There is no speculative blink/gaze/interpolation API.

Coordinates use native SVG units, rather than normalized units: this preserves the original decimal controls exactly with no normalization multiplication or rounding. Width/height define the viewport; changing them alone changes that viewport, not all control points. For visual resizing use external layout dimensions. Future geometric squash/stretch must explicitly transform centers, radii, control points, gradients and effects under a separately specified policy.

`presets.ts` stores a measured common immutable control net because both Idle assets were confirmed equal. IDLE_LEFT and IDLE_RIGHT are separate typed side configurations sharing recursively frozen source data; either side can later be replaced independently. `EYE_EXPRESSION_PRESETS.happy` references the same pair as `.idle`, avoiding duplicated Happy coordinates. No mouth module is imported or edited.

## Generator and endpoint validation

`pathGenerator.ts` is browser/React independent. `generateEyePaths` validates the entire configuration and emits deterministic absolute M/C/Z outline/highlight data and the original viewBox. Number-to-string conversion retains JavaScript's shortest round-trip representation; no coordinate rounding is added. Ellipses remain exact SVG primitives, not fitted cubic approximations. The output preserves traversal and contour order.

Validation rejects missing/malformed objects, invalid side, nonpositive/nonfinite dimensions/radii/stroke/filter extent, malformed/sparse/nonfinite point and cubic tuples, absent/empty/open contours, malformed colors, degenerate gradients, invalid/unordered gradient stops, nonfinite filter offsets/blur, negative blur and opacity outside [0,1]. Optional highlights must be explicitly null when absent. Colors are restricted to six-digit hex or black/white, matching the inspected supported styling. Runtime validation does not prove containment, self-intersection, tangency or arbitrary artistic correctness; finite controls outside a viewport are allowed, as future source artwork can require them.

Tests compare every emitted outline/highlight number directly against both actual Idle SVG files with exact numeric equality. There is no independent-outline approximation or tolerance. Both contour nets contain eight cubic segments. Ellipse, viewport, colors, stops and source filter parameters are separately checked.

## React rendering and layout

`ProceduralEye.tsx` accepts EyeGeometry props, validates/generates before JSX, then paints filtered ellipse, outline, optional small highlight, optional notched highlight and defs in original order. Root fill=none, transparent background, xMidYMid meet and native width/height/viewBox are preserved. The outline inherits no fill; SVG's default butt/miter stroke settings match the source. The entire source inner-shadow primitive pipeline is retained, including its extended filter region. React useId isolates gradient/filter references across simultaneously rendered eyes. No state, per-frame loop, animation or store writes exist. Updated props are regenerated directly, without stale memoization.

`EyeGeometryComparison.tsx` returns null outside Vite DEV. Its collapsed development panel presents four labelled pairs: Idle-left/right and Happy-left/right. Each original FaceLayer and corresponding inline eye uses the same FACE_LAYER_LAYOUTS coordinates, same eye z-index and equal canvas size. Left position is (115,154,129,171); right is (556,154,129,171) for both expressions. Existing face-artwork 800:480 and face-canvas 1490:960 CSS remain unchanged. Positions map to percentages once; the inline SVG fills its wrapper without a second scale transform. The static panel has no selector, canonical state dependency or transition requests. Original SVGs remain visible alongside it. Production App mounting is harmless because the guard removes the panel and procedural implementation from the production JS, verified against actual dist output.

## Visual validation

The geometry suite exports actual React SSR markup plus original source SVGs to [eye-endpoint-comparison.svg](eye-endpoint-comparison.svg). [eye-endpoint-comparison.png](eye-endpoint-comparison.png) was rendered with the existing local resvg_py 0.5.0 tooling and opened for visual inspection: silhouettes, gradient shading, outline, notch and small highlight agree at the displayed size on both sides.

`scripts/verify-eye-raster.py` compares each source/inline pair as transparent RGBA images at 1x, 1.5x and 2x. All six pairs have **zero differing pixels and zero maximum channel difference**. Raster sizes are 129x171, 194x257 and 258x342. Results and tool versions are stored in [eye-raster-validation.json](eye-raster-validation.json). This is evidence from an independent static rasterizer, beyond TypeScript tests; it does not establish Chrome/Brave raster equivalence or live responsive behavior.

Reproduce from frontend after building:

```powershell
node scripts/verify-eye-geometry.mjs
$env:PYTHONPATH = "$env:TEMP/brone-asset-tools"
python scripts/verify-eye-raster.py
```

The optional Python raster check uses the pre-existing external asset tools, resvg_py 0.5.0 and Pillow 13.0.0. It adds no dependency to either application. Browser interaction and robot-display visual approval were not run in this task. Next review: expand the Eye geometry comparison panel in development, inspect all four pairs at narrow/wide viewports, and confirm the existing production expression controls remain independent.

## Executed checks

Windows development host, Node 24.14.1, Vite 7.3.7, installed Anime.js 4.5.0. Functional/static visual checks only; no FPS or latency claim. Commands run from frontend except git.

| Check | Final result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS |
| node scripts/verify-eye-geometry.mjs | PASS |
| python scripts/verify-eye-raster.py with existing asset-tool PYTHONPATH | PASS; six zero-difference RGBA pairs |
| node scripts/verify-mouth-geometry.mjs | PASS |
| node scripts/verify-mouth-morphing.mjs | PASS |
| node scripts/verify-mouth-expressions.mjs | PASS |
| node scripts/verify-face-layers.mjs | PASS |
| node scripts/verify-expression-controller.mjs | PASS |
| node scripts/verify-animation-engine.mjs | PASS |
| node scripts/verify-expression-transitions.mjs | PASS |
| node scripts/verify-element-transitions.mjs | PASS |
| git diff --check | PASS; existing LF/CRLF normalization warnings |
| Browser/manual/backend/robot-device checks | Not run; backend/protocol unchanged by this task |

The eye suite covers source-derived left/right controls, valid path command output, exact viewBox, finite/structural validation and rejection, styling, optional highlights, source gradient/filter attributes, determinism/input preservation, updated props, unique IDs, Happy mapping/layout reuse, comparison SSR rendering/position/state isolation, compiled DEV=false behavior and absence of procedural markers in the actual production build. It also verifies production asset-based Eyes and FaceRenderer for all expressions, including the frontend transition preview, and all 14 original asset hashes. The controller harness now resolves the actual comparison import added to App.

Initial preset extraction stopped on differing Figma filter-result names, leaving an expected missing-preset typecheck failure; normalizing those reference names corrected extraction. Final typecheck and tests pass. A read of nonexistent tsconfig.app.json failed during inspection; the actual project uses frontend/tsconfig.json, which was inspected. The first shell invocation could not start its sandbox helper; approved escalated shell execution completed the checks. No requested final check remains blocked.

## Files changed by this task

Added:

- src/geometry/eyes/{types,presets,pathGenerator,index}.ts
- src/components/face/eyes/{ProceduralEye,EyeGeometryComparison}.tsx
- scripts/verify-eye-geometry.mjs
- scripts/analyze-eye-assets.py
- scripts/verify-eye-raster.py
- reports/EYE_GEOMETRY_ENGINE_IMPLEMENTATION.md
- reports/eye-svg-inventory.json
- reports/eye-endpoint-comparison.{svg,png}
- reports/eye-raster-validation.json

Updated:

- src/App.tsx: mount independent development eye comparison.
- src/style.css: scoped panel and inline-SVG wrapper sizing.
- scripts/verify-expression-controller.mjs: actual new App import in the existing shallow harness.
- tsconfig.tsbuildinfo: regenerated by TypeScript verification.

## Limitations and readiness for later eye morphing

This establishes source-faithful static Idle/Happy endpoints, not a multi-expression eye engine. The typed control net can accept future updated geometry without changes to rendering ownership, but ellipse bodies and separate outline paths must remain separately represented. Later expressions have different path counts, command types, highlight positions, masks, filters, viewports and additional details. Matching segment counts alone is insufficient.

Before morphing, inspect and mark semantic top/left/bottom/right landmarks per contour and per side; specify traversal/start alignment and separate treatment of body, outline, highlights and effects. Exact cubic subdivision can establish compatible sectors where appropriate, but converting an ellipse to cubics requires an explicitly documented approximation policy or a different exact representation. Angular transition shapes and masked Sad/Cry details need dedicated topology and appearance decisions. No arbitrary resampling, correspondence, blinking closure, fade or interpolation rule is implemented here.

Next step is browser/target-display review of these static endpoints. Morphing and production integration require a separate task and acceptance criteria.
