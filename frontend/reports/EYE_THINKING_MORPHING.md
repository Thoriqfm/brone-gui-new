# Thinking eye geometry morphing

## Result and scope

Idle ↔ Thinking is implemented independently for both eyes through the existing interpolation API and development preview. Source Idle now offers Happier, Sad, Cry and Thinking; source Sad still offers only Cry. Play, Reverse, Reset, scrubbing, sample buttons, status and phase use the selected pair. The independent static comparison still includes every canonical expression.

Before editing, 808 geometry hashes were saved across 101 samples per side for Idle/Happier, Idle/Sad, Idle/Cry and Sad/Cry. All remain identical after this change. Existing protected-file checks confirm original SVGs, canonical presets/layouts/mappings, production renderers, mouth, global animation modules, store, backend and protocol were preserved. No dependencies were installed or added. Existing unrelated working-tree edits were retained.

## 1. Source geometry inventory

Inspected actual assets under `public/assets/face-layers/eyes/{left,right}/`: `idle-eye-{side}.svg` and `thinking-eye-{side}.svg`, their typed source presets, layered generator/validator and React renderer. The full original attributes, commands, paint order and hashes remain in [eye-svg-inventory.json](eye-svg-inventory.json); static verification checks all fourteen original asset hashes and all sixteen canonical/reference configurations.

| Feature | Idle, both sides | Thinking-left | Thinking-right |
| --- | --- | --- | --- |
| Native viewBox | 0 0 129 171 | 0 0 142 145 | 0 0 129 171 |
| Body | Ellipse (64.5,85.5), radii (60.5,81.5) | Dedicated six-cubic sloping contour | Exact same ellipse as Idle |
| Primary outline | Independent eight-cubic contour, black width 4 | Eight cubic and four short line segments, black width 4 | Exact same source coordinates as Idle outline |
| Small highlight | (27.7,94.8559), radii (9.2,9.6) | (42.9422,90.9853), same radii | (27.2,94.6), same radii |
| Notched highlight | Eight cubics, starts (41.5,33.2559) | Independent eight cubics, starts (56.7422,29.3853) | Independent eight cubics, starts (41,33) |
| Supplementary outline | Absent | Reversed six-cubic contour, black width 8, body-exclusion mask | Absent |
| Gradient | (64.5,4) → (64.5,167) | (78.8829,7.85522) → (62.8089,136.38) | Same as Idle |
| Filters | One body inner shadow | Two inner shadows, on body and supplementary outline | One body inner shadow, same pipeline/region as Idle |
| Mask | None | White rectangle excluding independently rounded black body path | None |
| Extra lower/water/white detail | None | None | None |
| Transforms / clipPath / use | None | None | None |

Both highlights retain white fill and opacity .96. Gradient stops remain .0625/#6260B0 and .533654/#29284A, with userSpaceOnUse. No highlight is removed or collapsed.

Thinking-left shares inspected base artwork with Sad-left, but contains neither Sad's lower referenced circle/ellipse nor Cry's water. Its own original scene supplies all curves and resources. No whole Sad/Cry configuration is reused. The mask retains source rounding such as y=16.8845 where the painted body uses 16.8846; the supplementary contour remains independently represented.

Native Idle/right-Thinking filter region is (0,0,129,175). Thinking-left's two filter regions are (8.61523,12.5164,130.609,134.077); its mask and white rectangle use (-4.52413,-2.48094,150.834,151.702). All endpoint values remain untouched. There are no implicit hidden water or lower-eye details introduced by this implementation.

## 2. Independent left/right behavior

The left eye changes silhouette, curvature, highlight placement, gradient direction, layout and secondary outline. The right eye's approved silhouette is identical to Idle: its visible transition is a small highlight movement and external x-position change. Creating an extra right-eye deformation would redesign the endpoint family without a source basis.

The right small highlight moves by (-.5,-.2559). Its notched highlight moves similarly, while every exported control's rounding is retained; it is not replaced by an assumed exact translation. Both eyes are prepared separately from their actual presets, never by reflection. Tests explicitly assert full right-outline coordinate equality and exact ellipse parameters, rather than inferring equality from command counts.

## 3. Semantic landmarks and direction

Thinking-left uses upper-edge midpoint → upper-right rounded corner → bottom y-extremum → upper-left rounded corner. Matching Idle's lateral extrema to the high Thinking corners would compress the wrong contour sectors, so Idle uses anchors `[0,1,4,7]` on its eight-arc body/outline: top, upper-right shoulder, bottom, upper-left shoulder.

Thinking-left native segment-index-plus-parameter anchors:

| Contour | Target anchors | Reverse target traversal | Prepared pieces |
| --- | --- | --- | --- |
| Body | [1.5,2.5,lowerExtremum(c,4),.5] | No | 14 |
| Primary outline | [11.5,.5,lowerExtremum(c,5),10.5] | No | 20 |
| Mask body | [1.5,2.5,lowerExtremum(c,4),.5] | No | 14 |
| Supplementary outline | [2.5,1.5,lowerExtremum(c,5),3.5] | Yes | 14 |

The lower anchors are analytic y-derivative roots on the inspected lower curves. All prepared contours traverse in positive SVG signed-area order. Independent mask/stroke controls preserve the source's rounding differences. Numerical anchors and evaluated landmark coordinates are exported in [correspondence.json](eye-thinking-morphing/correspondence.json).

Thinking-right retains the exact ellipse, without converting it to cubics. Its independent eight-cubic outline has the same cardinal landmarks as Idle: top (64.5,2), right (127,85.5), bottom (64.5,169), left (2,85.5), at indices [0,2,4,6]. Its unchanged outline and ellipse are retained by reference during interior frames.

The eight highlight pieces on both sides correspond by inspected features: upper outer arc, right/notch approach, notch entry, inner arc, notch exit, lower outer return and two left outer arcs. Their actual control nets interpolate after this feature correspondence; equal array lengths alone are not an acceptance rule.

## 4. Interpolation architecture

`geometryInterpolator.ts` adds only the explicit same-side Idle/Thinking branch in both directions. Endpoints are validated before pair matching. Finite progress clamps to [0,1]; nonnumbers, NaN and infinity fail. Progress 0/1 returns the exact caller source/target object, including original mixed commands, filters, masks, viewBox dimensions and logical resource references. Data-equivalent source clones are accepted; edited endpoints, mismatched sides, Thinking/Sad, Thinking/Cry, Thinking/Happier, same-expression pairs and the transition reference are rejected.

`prepareIdleThinkingEye` lazily caches and freezes per-side preparation. The left branch reuses the existing semantic-sector alignment utility on the actual Thinking contours. It measures native-sector arc distances with 64-step Simpson integration, takes their union of normalized knots, locates matching split parameters by 36-step bisection, and subdivides original curves through exact De Casteljau operations. Source L commands become exact straight cubics only during preparation. Length estimation chooses correspondence, not a fitted replacement curve.

Body, primary outline, exclusion-mask body and supplementary outline interpolate separately. Approved source curves remain exact subdivisions in the prepared nets. Tests compare evaluations of every native span and prepared piece at five local parameters, check the derivative at lower landmarks, and verify straight-line preservation.

The unchanged eight-arc Idle ellipse approximation is needed only for the left interior path. Existing dense tests retain the measured radial-distance bound of 0.00034601058397731865 logical units; progress 0 still returns the original exact ellipse. Right interior results use the existing legacy EyeGeometry representation, retaining the exact body/outline/gradient/shadow and updating only the highlight geometry. Left interior results use the existing layered representation. Both flow through unchanged ProceduralEye rendering.

## 5. Thinking-specific details

Both source highlights have visible counterparts and interpolate geometrically. Radii, fill and opacity remain source-derived. No whole-eye opacity is introduced.

Thinking-left's extra masked width-8 outline has no independent Idle layer. Its contour and exclusion mask follow their own semantic interpolations while localized smoothstep opacity `p*p*(3-2*p)` introduces that secondary effect. The body and primary outline remain fully opaque, continuous closed contours. No new lower decoration, tear or Cry-right white blur is introduced.

Thinking-right has no additional effect to reveal. It is intentionally a subtle transition. The external question-mark effect belongs to FaceEffects and remains outside this eye-only preview.

## 6. Gradients, masks, filters and IDs

Left gradient endpoints interpolate from Idle's vertical coordinates to Thinking-left's sloped coordinates. Stops and colors stay fixed. Right gradient remains exactly the Idle/source-Thinking gradient.

All original inner-shadow primitive arrays are retained: transparent flood, SourceGraphic blend, hard-alpha matrix, dy=4, blur=2, arithmetic composite, black alpha=.25 matrix and final blend. No blur, matrix coefficient, offset or filter operator is numerically morphed.

For left interior frames, the two filter regions and exclusion mask/white rectangle use the established padded working region (-16,-16,180,205), covering the taller Idle contour. This is an explicit workspace policy, not interpolation of filter primitives. Exact source regions are restored through endpoint object identity. Right retains its native region throughout. The padded left region is necessary to avoid clipping early Idle-shaped frames with the shorter Thinking filter rectangle.

Paint order remains filtered body, independent primary outline, small highlight, notched highlight, optional filtered/masked secondary outline, defs. No clipping path, reordered highlight layer or merged outline was added. The unchanged typed generator and React useId renderer preserve unique gradient/filter/mask references; tests render multiple instances together and resolve every reference.

## 7. Layout interpolation

Untouched FACE_LAYER_LAYOUTS supply these x/y/width/height values:

| Side | Idle | Thinking |
| --- | --- | --- |
| Left | 115 / 154 / 129 / 171 | 102.5 / 167.5 / 142 / 145 |
| Right | 556 / 154 / 129 / 171 | 560.25 / 154 / 129 / 171 |

The existing interpolateEyeLayout handles each field independently. Native viewport dimensions and layout dimensions remain aligned, retaining aspect ratios without another main-eye transform. The logical 800×480 face and 1490×960 responsive canvas are unchanged. Right moves 4.25 logical units horizontally; left moves independently while becoming shorter/wider. No canonical positioning was edited.

## 8. Preview and Anime.js

Thinking is offered only for Idle source. Sad still permits Cry only, including when switching from Thinking during playback. Existing Play/Reverse/Reset/scrub/sample handlers, local generation-token cancellation and detached animation target are reused. Anime.js 4.5.0 drives normalized local progress over 1000 ms with inOutSine. No global engine or Zustand/controller updates were added.

The actual component handler harness covers Thinking selection, both geometry props at all seven samples, forward/reverse completion, scrub/reset, target/source changes during playback, stale callbacks and selection before the dynamic Anime import resolves. Real installed Anime.js automatic forward and reverse playback is also exercised through those handlers, observing actual intermediate geometry for both sides. This is a Node hook harness, not browser DOM verification.

## 9. Visual validation

Actual API results were rendered through the real React ProceduralEye component, in both directions at 0%,10%,25%,50%,75%,90%,100%:

| Direction | Shape matrix | Layout matrix | Endpoint RGBA comparisons |
| --- | --- | --- | --- |
| Idle → Thinking | [PNG](eye-thinking-morphing/idle-thinking/morph-grid.png) | [PNG](eye-thinking-morphing/idle-thinking/layout-grid.png) | 12, zero differing pixels |
| Thinking → Idle | [PNG](eye-thinking-morphing/thinking-idle/morph-grid.png) | [PNG](eye-thinking-morphing/thinking-idle/layout-grid.png) | 12, zero differing pixels |

All four PNG sheets were opened and inspected. The samples show progressive flattening/sloping of the left upper contour, a continuous lower contour and outline, geometric highlight movement, gradual secondary-outline appearance and independent external placement. The right silhouette remains steady as required by the artwork; its small highlight adjustment is subtle at native scale. No unexpected bulges, outline breaks, newly clipped features or highlight jumps were observed in these sampled frames. Left endpoint highlight overpaint near the upper edge is present in the original artwork and is preserved.

Both directions' endpoint SVGs were compared directly with original source files as transparent RGBA at 1×,1.5×,2×: **24 pairs, zero differing pixels and zero maximum channel difference**. Per-direction `endpoint-raster-validation.json` files record results. Existing static-eye tests also retain sixteen complete XML comparisons, 48 expanded raster pairs and six original Phase-1 pairs, all zero difference. Existing Happier, Sad and four Cry-direction endpoint raster checks remain unchanged.

Raster tools were the existing resvg_py 0.5.0/Pillow 13.0.0 local asset environment; nothing was installed. Intermediate images have no approved pixel target, so their visual assessment is sampled and does not establish every continuous frame's naturalness. Browser verification was attempted: the connector returned **“The browser access host is unavailable.”** No browser screenshot, browser pass, robot-display performance or measured latency claim is made.

## 10. Verification results

Windows host, Node 24.14.1, Vite 7.3.7, installed Anime.js 4.5.0. Commands ran from frontend unless stated otherwise.

| Check | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS; production main JS retains index-6BEnCzdN.js and preview code stays absent |
| node scripts/verify-eye-geometry.mjs | PASS, including expanded static eye suite |
| node scripts/verify-eye-morphing.mjs | PASS, including all five pairs' real automatic playback and Sad/Cry/Thinking suites |
| node scripts/verify-eye-sad-morphing.mjs | PASS, including protected files |
| node scripts/verify-eye-cry-morphing.mjs | PASS |
| node scripts/verify-eye-thinking-morphing.mjs | PASS; 101 samples per eye/direction, exact endpoints, correspondence/subdivision, details/resources/layout, determinism/rejection and 808 prior hashes |
| python scripts/verify-eye-raster.py | PASS; original full XML/RGBA checks retained |
| python scripts/render-eye-morphing.py --target thinking [--reverse] | PASS both directions; 24 zero-difference endpoint raster pairs |
| Existing Happier/Sad/four Cry raster render commands | PASS |
| node scripts/verify-mouth-geometry.mjs | PASS |
| node scripts/verify-mouth-morphing.mjs | PASS |
| node scripts/verify-mouth-expressions.mjs | PASS |
| node scripts/verify-face-layers.mjs | PASS |
| node scripts/verify-expression-controller.mjs | PASS |
| node scripts/verify-animation-engine.mjs | PASS |
| node scripts/verify-expression-transitions.mjs | PASS |
| node scripts/verify-element-transitions.mjs | PASS |
| git diff --check | PASS; existing LF/CRLF notices |
| Browser verification | Unavailable, host error above |
| Backend tests / robot display | Not run; unchanged boundaries / no device measurement |

The new focused suite checks 404 actual forward/reverse samples, independent frozen preparations, analytic lower landmarks and directions, exact native subdivisions/straight lines, finite valid closed and sampled-simple contours/highlights, exact right ellipse/outline, geometric highlight movement, gradient stops, unchanged filter primitives, resolved mask/filter references, unique IDs, layout, immutability, unsupported/edited endpoint rejection and determinism. Original endpoint/raster tests were not loosened. Existing assertions that rejected Idle/Thinking were updated only because that pair is now supported; Thinking/Sad and Thinking/Cry remain explicitly rejected.

An initial typecheck identified the different left/right scene lengths: target defs could be absent at the left-specific array index when viewed as a union. An explicit scene-tag guard resolved it. Final typecheck and build pass. Some existing Vite-based regression scripts emitted an HMR port-24678-already-in-use warning while their assertions passed; no command was skipped because of it.

## 11. Modified files and artifacts

Updated:

- `src/geometry/eyes/geometryInterpolator.ts`: explicit Thinking branch, per-side preparation, source-derived left contour/mask interpolation and exact right ellipse/highlight behavior.
- `src/geometry/eyes/index.ts`: expose prepareIdleThinkingEye.
- `src/components/face/eyes/EyeMorphPreview.tsx`: add Idle-only Thinking target.
- `scripts/verify-eye-morphing.mjs`: Thinking handler/automatic-playback/cancellation tests and focused-suite invocation.
- `scripts/verify-eye-sad-morphing.mjs`: newly supported Idle/Thinking removed from unrelated-pair rejection list; other checks retained.
- `scripts/render-eye-morphing.py`: Thinking forward/reverse artifact options, existing defaults preserved.
- `tsconfig.tsbuildinfo`: regenerated by checks.

Added:

- `scripts/verify-eye-thinking-morphing.mjs`.
- This report.
- `reports/eye-thinking-morphing/existing-baseline.json` and `correspondence.json`.
- `reports/eye-thinking-morphing/{idle-thinking,thinking-idle}/`, each containing samples.json, morph-grid.svg/png, layout-grid.svg/png and endpoint-raster-validation.json.

Existing verification-generated eye/mouth report artifacts were refreshed by their existing scripts. Original artwork, canonical geometry data, production rendering, mouth behavior and shared protocol were not changed.

## 12. Known limitations

This remains a pair-specific development prototype. Exact endpoint equality in resvg does not establish browser equivalence or subjective animation approval. Sampled self-intersection checks are numerical, not analytic global proofs. Left interior ellipse conversion retains its previously measured approximation bound and padded filter/mask workspace policy. Right movement is intentionally subtle because the approved silhouette is unchanged. No question-mark animation or full-face transition is included.

## 13. Readiness for advanced eye animation

The five inspected pair families have endpoint and regression evidence, isolated local playback and explicit per-side correspondences. Browser and robot-display review remain the next verification step. Blinking, gaze tracking, squash/stretch, visemes, arbitrary expression pairs, global animation ownership and production migration each require their own design, correspondence and runtime validation. None was implemented here.
