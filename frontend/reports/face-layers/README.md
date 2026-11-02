> Historical implementation notes: current refined coordinates and expression validation are recorded in [EXPRESSION_VALIDATION.md](../face-decomposition/EXPRESSION_VALIDATION.md).

# Static SVG layer composition

## Inventory

27 supplied SVGs were parsed and rasterized. Every viewBox starts at 0,0;
width and height match each cropped viewBox. Dimensions describe local geometry,
not positions on the 800 x 480 artwork canvas. All source files remain unchanged.

| SVG relative to face-layers/ | viewBox | Intrinsic width x height |
| --- | --- | --- |
| base/face-base.svg | 0 0 800 480 | 800 x 480 |
| base/face-lines.svg | 0 0 1060 274 | 1060 x 274 |
| effects/blushing.svg | 0 0 61 36 | 61 x 36 |
| effects/cry-effect.svg | 0 0 81 269 | 81 x 269 |
| effects/line-for-blushing.svg | 0 0 103 8 | 103 x 8 |
| effects/question-mark.svg | 0 0 60 89 | 60 x 89 |
| effects/shock-effect.svg | 0 0 77 88 | 77 x 88 |
| eyes/left/cry-eye-left.svg | 0 0 142 145 | 142 x 145 |
| eyes/left/happier-eye-left.svg | 0 0 123 139 | 123 x 139 |
| eyes/left/happier-transition-eye-left.svg | 0 0 156 153 | 156 x 153 |
| eyes/left/idle-eye-left.svg | 0 0 129 171 | 129 x 171 |
| eyes/left/sad-eye-left.svg | 0 0 142 156 | 142 x 156 |
| eyes/left/shock-eye-left.svg | 0 0 129 171 | 129 x 171 |
| eyes/left/thinking-eye-left.svg | 0 0 142 145 | 142 x 145 |
| eyes/right/cry-eye-right.svg | 0 0 142 183 | 142 x 183 |
| eyes/right/happier-eye-right.svg | 0 0 123 139 | 123 x 139 |
| eyes/right/happier-transition-eye-right.svg | 0 0 160 163 | 160 x 163 |
| eyes/right/idle-eye-right.svg | 0 0 129 171 | 129 x 171 |
| eyes/right/sad-eye-right.svg | 0 0 142 156 | 142 x 156 |
| eyes/right/shock-eye-right.svg | 0 0 129 171 | 129 x 171 |
| eyes/right/thinking-eye-right.svg | 0 0 129 171 | 129 x 171 |
| mouth/cry-mouth.svg | 0 0 276 86 | 276 x 86 |
| mouth/happier-mouth.svg | 0 0 282 155 | 282 x 155 |
| mouth/idle-mouth.svg | 0 0 282 96 | 282 x 96 |
| mouth/sad-mouth.svg | 0 0 276 86 | 276 x 86 |
| mouth/shock-mouth.svg | 0 0 156 148 | 156 x 148 |
| mouth/thinking-mouth.svg | 0 0 271 52 | 271 x 52 |

## Expression mapping

- idle: idle eye pair and idle mouth; no effects.
- happier: happier eye pair and happier mouth, two blushing patches and two
  line-for-blushing underlines. The patches already contain pink hatch marks.
- happier-transition: dedicated transition eye pair, happier mouth, no effects.
  This is a static local preview override, not a new protocol emotion.
- sad: sad eye pair and sad mouth; no effects.
- cry: cry eye pair and cry mouth, cry-effect reused as left and right tear strips.
- shock: shock eye pair and shock mouth, shock-effect.
- thinking: thinking eye pair and thinking mouth, question-mark.
- happy: explicitly reuses idle eyes and the happier mouth, with no effects,
  matching the happy PNG. The shared mouth position was measured as (259,288,282,155).
- shy is intentionally excluded from the finalized face design. It is not a
  missing asset or pending implementation; no mapping, control, or fallback exists.
- No transition mouth, dedicated happy SVG files, or visemes were supplied.
  No geometry was invented and no artwork was modified.

## Coordinate measurements

Source masters are 3200 x 1920, reduced to 800 x 480 for analysis. Coordinates
were derived by alpha-weighted RGB template matching at intrinsic SVG scale,
within regions selected from the reference images. The oversized line layer was
fitted with negative offsets while excluding the occluded eye regions.
The measurement script and analysis.json retain the search regions/results.
Coordinates currently use integer logical pixels; subpixel refinement is deferred.

| Expression | Left eye (x,y,w,h) | Right eye | Mouth |
| --- | --- | --- | --- |
| idle | 115, 154, 129, 171 | 556, 154, 129, 171 | 260, 325, 282, 96 |
| happy | 115, 154, 129, 171 | 556, 154, 129, 171 | 259, 288, 282, 155 |
| happier | 104, 133, 123, 139 | 573, 133, 123, 139 | 259, 288, 282, 155 |
| happier-transition | 95, 159, 156, 153 | 545, 149, 160, 163 | 259, 288, 282, 155 |
| sad | 104, 148, 142, 156 | 554, 148, 142, 156 | 262, 304, 276, 86 |
| cry | 104, 148, 142, 145 | 554, 148, 142, 183 | 262, 304, 276, 86 |
| shock | 115, 154, 129, 171 | 556, 154, 129, 171 | 322, 304, 156, 148 |
| thinking | 103, 167, 142, 145 | 560, 154, 129, 171 | 265, 338, 271, 52 |

Every expression shares faceBase=(0,0,800,480), faceLines=(-130,-5,1060,274).
This preserves the line SVG's original proportions and aligns the visible bends
and center point. Only its overhanging portions are intentionally clipped at the
logical canvas boundary, matching the full-image export. The shared artwork
parent itself permits overflow; it has no rounded clipping mask.

Effects (x,y,width,height):

- happier blush left=(135,272,61,36), right=(604,272,61,36).
- happier underline left=(114,267,103,8), right=(583,267,103,8).
- cry tear left=(138,227,81,269), right=(581,227,81,269).
- shock mark=(687,53,77,88).
- thinking mark=(700,43,60,89).

All dimensions retain each asset's intrinsic ratio. Configurable z-order:
base=0, lines=10, eyes=20, mouth=30, effects including tear strips=40.
The tear strips render in front of the cry eyes to cover the lower outlines.

## Implementation and preview

faceLayerAssets.ts centralizes paths, metadata, expression combinations, and
expression combinations. faceLayerLayouts.ts holds logical positions and z-order.
FaceLayer translates logical coordinates to percentage-based CSS boxes, shared
by FaceBase, Eyes, Mouth, and FaceEffects. Each SVG is an external image, so its
internal definition IDs cannot collide with those in another SVG.
FaceRenderer gets the current emotion from the existing Zustand store.

An 800:480 relative artwork box is centered inside a responsive 1490:960 display
canvas. At 1490 CSS pixels wide the artwork is 1490 x 894, leaving 33 CSS pixels
above/below. Both preview panels use identical canvas dimensions; on narrow
screens the panels stack. The single-view selector supports full-width review.
The development header/controls remain outside the display canvas.

FullImageFaceRenderer preserves the full-image rendering approach, displaying
original PNG masters for comparison. The old production expressionAssets.ts
mapping and PNG/WebP files are retained. No animation, visemes, store architecture changes, or application dependencies
were added. The finalized expression correction removes shy from the frontend,
shared schema, and Python emotion enum together.

## Verification and visual findings

Run:

- node scripts/verify-face-layers.mjs
- python scripts/analyze-face-layers.py (tooling: Pillow, numpy, resvg-py)
- python scripts/preview-face-layers.py (same tooling; run Node checks first)
- npm run typecheck
- npm run build

The Node checks exercise actual React components through Vite SSR with a seeded
Zustand server snapshot for each expression. They check all 27 asset paths,
viewBoxes, aspect ratios, configured bounds, expected rendered layers, finalized expression validation, unchanged protocol enum, and the comparison App. This is not a browser
interaction test. The verification script writes runtime-config.json directly
from the TypeScript exports; the preview script uses that exact configuration.
Analysis tooling is isolated in a temporary directory, not an app dependency.

See composition-comparison.png: master / composed layers / absolute difference.
Individual 800- and 1490-pixel-wide composition previews are also included.
All eight compositions were inspected visually. Overall placement and scale
closely follow the references, but exact visual parity is NOT established.

Remaining adjustments/differences:

- Cry has the largest discrepancy: flat SVG strips cannot reproduce the master's
  soft tear highlights. Rounded strip bottoms differ. Tear strips now render in front of the eyes,
  as requested, covering lower-eye outlines and some exported wave details. Do not stretch the strips
  or fabricate gradients to force parity. The supplied right cry eye includes
  a blurred highlight not present in the left export.
- Happier right-eye highlight details differ; positioning alone cannot correct
  internal SVG geometry. Small underline/edge residuals remain.
- Other expressions show small outline, antialiasing, and highlight differences.
  Refine integer positions to subpixel offsets only after reviewing the target
  browser. Native SVG rasterization and downsampled PNG edges are not identical.
- No assets are unavailable among the eight supported compositions. No visemes or animation were attempted.

Whole-canvas RGB RMSE against reference (0..255), composited on #080f1d at width
800, includes all artwork and empty margins. These are diagnostic image errors,
not perceptual approval thresholds or performance measurements:

- idle: 4.179
- happier: 5.273
- happier-transition: 5.641
- sad: 5.33
- cry: 13.904
- shock: 3.861
- thinking: 5.322

Happy-mouth regression: verifies the happier mouth is rendered for happy, the idle
mouth is absent, idle-style eyes remain, and the mouth layout equals happier.

Source SVG hashes were verified against analysis.json and original PNG hashes
against the earlier expression-assets report. All SVGs rasterized at 800- and
1490-pixel artwork widths. The image files were never edited.

Browser access was unavailable, so live browser expression switching, responsive
CSS behavior, image decoding, DPR, and visual parity on the Brone display remain
unverified. No performance improvements are claimed. Next step: use the built-in
comparison on the target display to approve/refine the documented coordinates.

## Final check results

- npm run typecheck: PASS.
- npm run build: PASS (Vite 7.3.7; 44 modules transformed).
- node scripts/verify-face-layers.mjs: PASS for eight compositions, 27 SVGs, and the comparison UI.
- SVG raster previews and source integrity checks: PASS.
- git diff --check: PASS (only Windows line-ending warnings).
- Live browser validation: NOT RUN; browser access host unavailable.

Cry layer-order regression: both rendered cry-effect images must have a z-index
above the eye layer. PASS; typecheck/build also PASS after this change.

Cry position refinement: lowered both tear strips from y=211 to y=227 to
clear the white eye highlights (bottom about y=225.4). Foreground order and
original SVG dimensions are preserved. The strips intentionally extend 16
logical units below the artwork into the display margin, without clipping.
The new regression check requires the tear tops to clear the highlights and
the bottoms to stay within the display canvas. Raster preview inspected.

## Finalized expression correction

Supported protocol expressions: idle, happy, happier, sad, cry, shock, thinking.
The transition remains a local preview only. Shy is intentionally excluded;
there is no pending artwork, idle fallback, or preview button for it.
Seven valid fixtures and an invalid shy fixture pass both frontend parser and
Python model validation; the shared-schema enum matches both. All eight static
compositions (seven expressions plus transition) pass the renderer checks.
Typecheck/build and the existing backend test pass. Live browser testing was
not rerun for this correction. Other expression layouts/assets remain unchanged.
