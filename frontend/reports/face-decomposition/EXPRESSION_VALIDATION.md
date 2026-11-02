# Brone Expression Composition Validation

## Scope and result

Seven main expressions were inspected individually against their original full-image
PNG masters: idle, happy, happier, sad, cry, shock, thinking. happier-transition
was inspected separately as a static preview. All 27 supplied SVGs were parsed,
rasterized, and checked against the asset mappings. No source SVG, PNG, or WebP
was modified. No new dependencies, backend changes, animation, or visemes were added.

The compositions are complete at the file/mapping level. Small measured coordinate
corrections were applied without changing layer sizes, proportions, or z-order.
There is no silent fallback. Happy and happier are distinct. Shy is intentionally
outside the finalized design, not a missing asset, and has no mapping or preview.

**Exact visual parity is not established.** Cry retains substantial artwork
mismatches. Happier and thinking retain internal-eye residuals. The remaining
expressions have smaller edge, highlight, and rasterization residuals.

## Method and evidence

- Logical artwork: 800 x 480; display canvas: 1490 x 960.
- Artwork at full display size: 1490 x 894, vertically centered with 33 px margins.
- The docs/ANIMATION_SPEC.md still describes the early scaffold;
  docs/IMPLEMENTATION_PLAN.md is empty. This task's seven-expression requirements
  and supplied masters were used as the current visual acceptance reference.
- React components and runtime TypeScript configs were inspected directly.
- The 3200 x 1920 PNG masters were compared with all SVG combinations. PNG is the
  authoritative full-resolution reference; the existing PNG/WebP derivatives were
  retained and their hashes verified, not substituted as new artwork.
- Candidate translations were measured at master resolution: SVGs rasterized at
  4x, alpha-weighted RGB comparison, +/-1 logical pixel in 0.25-pixel increments.
  Native SVG dimensions were preserved. These are diagnostic candidates, not
  perceptual approval thresholds. All selected candidates were inside the search
  boundary; no extrapolation or shape fitting was applied.
- Offline previews use resvg-py. Original SVGs are embedded as separate image
  documents to preserve filters/masks/ID isolation. Fractional positions remain
  vector transforms; face-lines alone is clipped to the artwork window.
- PNG references and compositions share the same fractional artwork origin.
  This avoids comparing a rounded PNG paste with a fractional SVG origin.
- Every final 1490 x 960 preview and its amplified difference panel was inspected,
  plus the responsive 800-pixel comparison overview. Raster output is evidence of
  geometry and mapping, not proof of target-browser rendering.
- All 52 files under the expression and layer asset directories
  have unchanged SHA-256 hashes, including masters and production derivatives.

Evidence files:

- [All expressions: master / before / refined](expression-comparison.png)
- Individual target-size panels: [idle](idle-detail.png), [happy](happy-detail.png),
  [happier](happier-detail.png), [sad](sad-detail.png), [cry](cry-detail.png),
  [shock](shock-detail.png), [thinking](thinking-detail.png),
  [happier-transition](happier-transition-detail.png).
  Each shows original PNG, composed SVG, and absolute RGB difference amplified 4x.
- [Exact final measurements and inventory](validation-evidence.json)
- [Immutable pre-refinement configuration](baseline-config.json)
- [Coordinate candidate measurements and source hashes](coordinate-candidates.json)
- Current config export: ../face-layers/runtime-config.json.

## Expression validation matrix

Validated composition means the correct layers, native proportions, positioning,
and overall expression were visually reviewed offline. It does not mean pixel
identity, target-browser approval, or measured runtime performance.

| Expression | Left eye | Right eye | Mouth | Lines and effects | Result |
| --- | --- | --- | --- | --- | --- |
| idle | Idle oval and native ratio; location retained | Matching idle oval; location retained | Shallow idle mouth; fractional alignment corrected | Line bends/center refined; no effects | Validated composition; small edge/highlight residuals |
| happy | Idle-style oval reused intentionally, matches happy master | Idle-style oval reused intentionally | Large happier mouth reused intentionally; not idle mouth | Refined lines; no blush or other effects | Validated composition; distinct from happier |
| happier | Dedicated shorter happier eye; position retained | Dedicated happier eye; internal highlight differs visibly | Large happier mouth; fractional alignment corrected | Two blush patches plus two underlines; vertical positions corrected | Needs refinement in supplied/rendered right-eye highlight; mapping and placement reviewed |
| sad | Dedicated sad eye with lower protrusion; native ratio retained | Dedicated mirrored sad eye; x corrected by 0.25 | Sad mouth shifted up 0.5 | Refined shared lines; no effects | Validated composition; small internal-eye and edge residuals |
| cry | Cry eye with waterline, correct native proportions | Dedicated cry eye includes extra blurred highlight; x corrected by 0.25 | Cry mouth shifted up 0.5 | Foreground tear strips retain approved y=227; no gradients available in strips | Needs artwork refinement; substantial remaining visual differences |
| shock | Dedicated shock file has idle-style shape; correct location | Dedicated shock file, correct ratio/location | Shock oval mouth shifted right 0.25 | Shock mark retained; no fallback | Validated composition; mark/edge rasterization residuals |
| thinking | Dedicated partly closed left eye; x/y refined | Open right thinking eye; x refined | Thin thinking mouth; x refined | Question mark shifted down 0.25; line alignment refined | Needs refinement/review of internal-eye residual; mapping and placement reviewed |
| happier-transition | Dedicated chevron eye; x/y refined | Dedicated chevron eye with different cropped bounds; x/y refined | Shared happier mouth at same measured location | No blush/effects; shared lines refined | Preview only; composition visually reviewed, not a regular emotion |

## Asset mapping inventory

All expressions share base/face-base.svg and base/face-lines.svg. Paths below are
relative to public/assets/face-layers/. Each effect is placed explicitly; repeated
cheek/tear entries represent two intentional instances of the same SVG.

| Expression | Left eye | Right eye | Mouth | Effects |
| --- | --- | --- | --- | --- |
| idle | eyes/left/idle-eye-left.svg | eyes/right/idle-eye-right.svg | mouth/idle-mouth.svg | None |
| happy | eyes/left/idle-eye-left.svg | eyes/right/idle-eye-right.svg | mouth/happier-mouth.svg | None |
| happier | eyes/left/happier-eye-left.svg | eyes/right/happier-eye-right.svg | mouth/happier-mouth.svg | effects/blushing.svg [blushLeft]; effects/blushing.svg [blushRight]; effects/line-for-blushing.svg [blushLineLeft]; effects/line-for-blushing.svg [blushLineRight] |
| happier-transition | eyes/left/happier-transition-eye-left.svg | eyes/right/happier-transition-eye-right.svg | mouth/happier-mouth.svg | None |
| sad | eyes/left/sad-eye-left.svg | eyes/right/sad-eye-right.svg | mouth/sad-mouth.svg | None |
| cry | eyes/left/cry-eye-left.svg | eyes/right/cry-eye-right.svg | mouth/cry-mouth.svg | effects/cry-effect.svg [tearLeft]; effects/cry-effect.svg [tearRight] |
| shock | eyes/left/shock-eye-left.svg | eyes/right/shock-eye-right.svg | mouth/shock-mouth.svg | effects/shock-effect.svg [mark] |
| thinking | eyes/left/thinking-eye-left.svg | eyes/right/thinking-eye-right.svg | mouth/thinking-mouth.svg | effects/question-mark.svg [mark] |

Intentional sharing:

- Happy uses idle eye SVGs because the happy PNG has that same oval-eye design.
  It uses happier-mouth.svg because the happy PNG has the large open mouth.
  This is explicit component reuse, not an idle fallback. Happy has no blush.
- Happier has dedicated shorter eyes plus four cheek effect instances. It is
  not interchangeable with happy, despite sharing the mouth.
- Happier-transition uses dedicated left/right chevron SVGs and happier-mouth.svg,
  matching the transition reference. There is no dedicated transition mouth file,
  and none is required for the observed combination. It is local preview-only.
- Sad and cry retain their separate named mouth files. Their bytes are identical,
  matching the shared sad-mouth geometry visible in their full-image references.
- Shock has dedicated eye filenames even though the artwork is idle-style.
- Base/lines are shared; one blushing SVG and one underline SVG are each instanced
  twice for happier; one cry-effect SVG is instanced twice for cry.

Full SVG inventory (all viewBoxes have local origin 0,0; these are NOT positions):

| File under public/assets/face-layers/ | viewBox | Intrinsic size |
| --- | --- | ---: |
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

## Coordinate corrections

All coordinates below are logical 800 x 480 units. Width and height were not
changed for any layer, so no layer was stretched or squeezed. These are the only
production layout changes in this validation pass:

| Expression | Layer | Before x, y | After x, y |
| --- | --- | ---: | ---: |
| all eight | faceLines | -130, -5 | -129.75, -4.75 |
| idle | mouth | 260, 325 | 259.75, 325.25 |
| happy | mouth | 259, 288 | 259.5, 287.75 |
| happier | mouth | 259, 288 | 259.5, 287.75 |
| happier | blushLeft | 135, 272 | 135, 271.25 |
| happier | blushRight | 604, 272 | 604, 271.25 |
| happier | blushLineLeft | 114, 267 | 114, 267.5 |
| happier | blushLineRight | 583, 267 | 583, 267.5 |
| happier-transition | leftEye | 95, 159 | 95.5, 159.25 |
| happier-transition | rightEye | 545, 149 | 545.5, 149.25 |
| happier-transition | mouth | 259, 288 | 259.5, 287.75 |
| sad | rightEye | 554, 148 | 554.25, 148 |
| sad | mouth | 262, 304 | 262, 303.5 |
| cry | rightEye | 554, 148 | 554.25, 148 |
| cry | mouth | 262, 304 | 262, 303.5 |
| shock | mouth | 322, 304 | 322.25, 304 |
| thinking | leftEye | 103, 167 | 102.5, 167.5 |
| thinking | rightEye | 560, 154 | 560.25, 154 |
| thinking | mouth | 265, 338 | 265.5, 338 |
| thinking | mark | 700, 43 | 700, 43.25 |

Retained values:

- Base: (0,0,800,480).
- Native eye positions for idle, happy, happier, shock; sad/cry left eyes.
- Cry strips: left=(138,227,81,269), right=(581,227,81,269).
- Shock mark: (687,53,77,88).
- Z-order: base 0, lines 10, eyes 20, mouth 30, effects 40. Cry strips stay in
  front of eyes, as previously requested. The unused underEyes tier is unchanged.
- The face-lines SVG remains 1060 x 274. Its negative offset is intentional:
  forcing it to width 800 would change the bends relative to the eyes.
  Its outer overhang is clipped at the original artwork boundaries; the shared
  artwork container still permits intentional overflow.

## Visual differences and remaining refinement

### Cry: artwork mismatch, not a missing expression

The cry-effect.svg contains a single path filled #76C5FD, with no gradient or
highlight filter. The PNG masters contain multiple soft highlights along both
tear streams. The right cry-eye.svg also contains a blurred highlight, while
its left counterpart does not. Translating layers cannot reproduce the full
master shading from this supplied set; no CSS gradients, extra shapes, or asset
edits were introduced to simulate it.

The prior user corrections are preserved: both strips are in front of the eyes
and start below the white highlights at y=227. Their full native height is 269,
so the bottoms reach logical y=496: 16 units below the base artwork. This is
intentional visible overflow into the lower display margin (about 29.8 display
pixels), staying inside the 1490 x 960 canvas. The PNG is flattened/cut at the
base bottom, whereas the composed SVG retains rounded strip ends. This is a
visible design difference and is not marked as parity. The waterline/outline
junction also remains slightly different. Resolving these details exactly needs
an artwork/design decision; this task does not redraw, shorten, stretch, or
regenerate the supplied SVG.

### Eyes, marks, lines, and edges

The happier right small white highlight has a visible residual after matching
its outer eye location. Thinking also retains residuals inside the eye shapes.
A whole-layer translation cannot fix an internal highlight without moving the
outline. These are recorded as supplied-artwork/rendering differences, not
silently compensated by moving otherwise aligned eye geometry. Exact separation
of SVG-export differences from the target browser's filter rasterization still
requires target-browser review.

All expressions retain small antialiasing/edge differences between vector
rendering and full-image PNG rasterization. Mouth and line edges align more
closely after the measured translations; exact pixel equality is not claimed.
Marks retain their supplied stroke boundaries and masks. No masks, SVG paths,
colors, eye proportions, or facial features were edited.

### Quantitative image diagnostics

Whole-display RGB RMSE on #080f1d at 1490 x 960, range 0..255. Both baseline and
refined images were rerendered with the same offline renderer and fractional
reference placement. Difference images were reviewed in addition to these
numbers. Empty/background pixels dilute whole-image error; these values are not
perceptual acceptance thresholds, browser benchmarks, or FPS/latency results.

| Expression | Before RMSE | Refined RMSE |
| --- | ---: | ---: |
| idle | 5.0317 | 2.2933 |
| happy | 6.3057 | 2.5708 |
| happier | 7.1876 | 3.3698 |
| happier-transition | 7.7094 | 2.5346 |
| sad | 6.8596 | 2.7356 |
| cry | 14.6456 | 13.2440 |
| shock | 4.4126 | 2.6757 |
| thinking | 6.4945 | 2.7081 |

The largest residual is cry. Lower numerical image error supports the small
coordinate changes; it does not establish visual parity or runtime improvement.

## Missing assets and fallback decisions

- Required eye/mouth/effect FILES missing for the seven compositions: **none**.
- There is no happy-named SVG set. The approved happy composition explicitly
  shares idle-style eyes and the happier mouth; it remains fully previewable.
- There is no transition-named mouth; intentional happier-mouth reuse is recorded.
- Cry's complete tear shading/highlights are not present in cry-effect.svg. This
  is an artwork-detail gap against the master, not an unavailable cry expression.
- No runtime idle fallback exists for any main expression.
- Shy is intentionally excluded from the design, supported list, assets/mappings,
  preview controls, and parser allowlist. It is never classified as a missing asset.
- Happier-transition stays outside EMOTIONS and the communication protocol.
- Visemes are intentionally outside scope; their empty directory is not an
  expression completeness defect.

## Preview and verification

The existing comparison UI is preserved: every main expression has its own
button, happy and happier remain separate, and the transition has a separate
preview-only button. Original-image-only, composed-layer-only, and equal-sized
comparison modes remain available. No new preview status was added because this
report distinguishes offline review from target-device approval explicitly.

Checks actually run:

| Check | Result |
| --- | --- |
| node scripts/verify-face-layers.mjs | PASS: all 8 compositions, all 27 SVGs, ratios, paths, bounds, React SSR snapshots, protocol fixtures, no shy control/fallback |
| Happy versus happier regression | PASS: shared large mouth, different eye pairs, happy has zero effects, happier has four |
| Transition separation | PASS: separate composition, no effects, outside regular enum, preview does not mutate emotion |
| Cry corrections | PASS: both strips above eye z-order, clear white-highlight bottom, remain within display canvas |
| python scripts/refine-face-layouts.py | PASS: native master-resolution candidates measured; no source edits |
| python scripts/validate-expression-compositions.py | PASS: all 8 compositions at 800/1490 widths, 27 SVGs rasterized, 52 source hashes unchanged |
| Visual review | Completed for all eight final target-size master/composition/difference panels and responsive overview |
| npm run typecheck | PASS |
| npm run build | PASS: Vite 7.3.7, 44 modules transformed |
| Live browser clicks/responsive CSS/WebSocket | NOT RUN: browser access host unavailable |
| Backend tests | NOT RUN for this task; backend was not modified |

The Node checks use actual React components via Vite SSR and seed Zustand's
server snapshot per expression. They are not a substitute for pointer/keyboard
interaction tests. Offline rasterization tests scaling at two widths but cannot
prove browser layout behavior, decoding, DPR, or fullscreen kiosk behavior.

Reproduction (from frontend):

1. node scripts/verify-face-layers.mjs
2. With the existing temporary image-tooling directory on PYTHONPATH,
   python scripts/refine-face-layouts.py measures candidates.
3. python scripts/validate-expression-compositions.py renders final comparisons.
   --candidates is optional for reviewing proposed translations before adoption.
4. npm run typecheck and npm run build.

baseline-config.json is the preserved state before this refinement pass; do not
replace it when reproducing before/after results. No application dependency was
added for these checks.

## Changed files and next step

- src/config/faceLayerLayouts.ts: measured translations only.
- scripts/verify-face-layers.mjs: explicit completeness and happy/happier checks.
- scripts/refine-face-layouts.py and scripts/validate-expression-compositions.py:
  reproducible candidate measurement, source-integrity checks, and evidence generation.
- reports/face-decomposition/: this matrix, baseline, coordinate/evidence JSON,
  and comparison previews. Original artwork and the full-image renderer are retained.
- reports/face-layers/README.md: pointer to this current validation report.

No Python backend, protocol, store architecture, animation, or viseme code was
changed in this task. Existing unrelated working-tree changes were preserved.

Next step: inspect the same preview on the target Brone display and approve the
remaining eye/cry artwork differences before animation. Target DPR, browser
filter output, live switching, and pixel-exact parity remain unverified.
