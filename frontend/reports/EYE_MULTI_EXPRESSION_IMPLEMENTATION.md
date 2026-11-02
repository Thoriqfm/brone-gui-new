# Eye Geometry Engine — Phase 2

## Result and scope

All seven canonical expressions now have procedural left/right eyes: Idle, Happy, Happier, Sad, Cry, Shock and Thinking. A separate HAPPIER_TRANSITION_PREVIEW preserves both angular transition exports as development references. It is absent from the canonical expression/preset collection. SHY is not offered.

The existing Idle/Happy geometry, public path generator and rendering branch remain available. Happy aliases Idle; Shock also aliases the corresponding Idle geometry after checking its separately mapped source artwork and actual layout. Production Eyes/FaceRenderer, expression mappings/layouts, Zustand semantics, mouth code/preview, animation code, backend, shared protocol and approved SVG assets received no edits in this task. Existing unrelated workspace changes were preserved. No dependency was added or installed.

## Full source inventory and geometry families

Originals are under `public/assets/face-layers/eyes/{left,right}/`. The unchanged [Phase-1 XML inventory](eye-svg-inventory.json) records every source control point, attribute, gradient, mask, filter primitive, transform, reference, document order and SHA-256 hash. See also the detailed [Phase-1 family analysis](EYE_GEOMETRY_ENGINE_IMPLEMENTATION.md). All 14 source hashes still match. Happy has no independent eye export.

In this table Cn means n absolute cubic segments between M and Z. Counts include paths inside masks and defs. Every viewport is `0 0 width height`, with native width/height as shown. All source roots have fill=none.

| Source filename | Expression / side | Dimensions | Paths in document order | Family / features |
| --- | --- | --- | --- | --- |
| idle-eye-left.svg | Idle, Happy / left | 129 x 171 | C8, C8 | A: filtered ellipse, separate outline, two highlights |
| idle-eye-right.svg | Idle, Happy / right | 129 x 171 | C8, C8 | A: identical geometry/styling apart from internal Figma names |
| shock-eye-left.svg | Shock / left | 129 x 171 | C8, C8 | A: matches Idle-left artwork; separate asset mapping retained |
| shock-eye-right.svg | Shock / right | 129 x 171 | C8, C8 | A: matches Idle-right artwork; separate asset mapping retained |
| happier-eye-left.svg | Happier / left | 123 x 139 | C5, C8 | B: stroked five-cubic body, two highlights, gradient |
| happier-eye-right.svg | Happier / right | 123 x 139 | C5, C8 | B: independently extracted; artwork matches left |
| thinking-eye-left.svg | Thinking / left | 142 x 145 | C6, mixed C/L, C8, C6, C6 | C-left: two filters, masked independent outline, two highlights |
| thinking-eye-right.svg | Thinking / right | 129 x 171 | C8, C8 | C-right: ellipse with separately positioned highlights |
| sad-eye-left.svg | Sad / left | 142 x 156 | C6, mixed C/L, C8, C6, C6, C4, C4 | D-left: two filters, two masks, use references, lower details, matrix transform |
| sad-eye-right.svg | Sad / right | 142 x 156 | C6, mixed C/L, C8, C6, C6, C4, C4 | D-right: independent paths/gradient/highlights; rotate transform |
| cry-eye-left.svg | Cry / left | 142 x 145 | C6, mixed C/L, C8, C16, C6, C6 | E-left: blue water, two filters, one mask |
| cry-eye-right.svg | Cry / right | 142 x 183 | C6, mixed C/L, C8, C16, C6, C6 | E-right: independent water/body; third filter and additional white ellipse |
| happier-transition-eye-left.svg | Transition reference / left | 156 x 153 | MCLCLLCLCLCLZ | F-left: angular chevron, sloping gradient, no highlights |
| happier-transition-eye-right.svg | Transition reference / right | 160 x 163 | MCLCLLCLCLCLZ | F-right: independent coordinates/gradient and viewport |

The mixed outline sequence is `MCCCLLCCLLCCCZ`. Equal command sequences do not imply equal controls or semantic correspondence. The C8 path in Happier is its notched white highlight, not a separate outline; its black outline is the stroke on the C5 body. No artificial eight-cubic outline was introduced.

Every gradient retains userSpaceOnUse coordinates and the source stops: 0.0625/#6260B0 and 0.533654/#29284A. Black outlines retain widths 4 and, for masked supplementary outlines, 8. The notched white path and small ellipse highlights retain opacity 0.96. Cry water is #76C5FD. Sad's lower details remain #29284A. No colors are interpolated or redesigned.

Inner shadows retain the original sRGB primitive sequence: transparent flood, normal SourceGraphic blend, hard-alpha matrix with the original 127 multiplier, dy=4 offset, blur=2, arithmetic composite k2=-1/k3=1, alpha-0.25 black matrix and final normal blend. All source filter extents are preserved, including overflow beyond an eye viewport. Cry-right's additional white ellipse retains fill-opacity 0.8 inside a group with opacity 0.96 and a third filter with blur=15.

Sad-left's lower ellipse retains `matrix(-0.961592 -0.274482 -0.274482 0.961592 94.1992 124.054)`; Sad-right retains `rotate(-15.9311 71.1942 127.572)`. Their use/xlink references and both masks remain intact, including implicit SVG defaults where attributes were omitted. Masks embedded in painted groups remain in that document position; defs remain trailing. No masks were replaced by approximate clipping.

## Expanded typed model

The Phase-1 EyeGeometry interface is preserved. `EyeConfiguration` is a compatibility union of EyeGeometry and the new LayeredEyeGeometry; it allows a renderer to accept both without changing existing Idle controls or callers. The new model is a closed, typed scene representation of observed SVG features:

- EyeCommand stores ordered numeric M/L/C/Z tuples in native source units.
- EyeSvgNode is a discriminated union over path, ellipse, rect, use, g, mask, defs, linearGradient, stop and the six observed filter primitive tags plus filter itself.
- Each tag has typed attributes. Geometry remains numbers/tuples; color-matrix values are numeric arrays. Transform values are matrix/rotate tuples.
- Gradient, mask, filter and use references are explicit `{ ref: logicalId }` objects. No arbitrary SVG markup, event handlers, raw d strings, external URLs or executable content are accepted.
- LayeredEyeGeometry stores side, native width/height and ordered layers, including children in masks, groups and defs. It contains no facial x/y placement.

There are no clipPath elements in the inspected eyes. No unused clipping abstraction was added: the actual mask behavior is represented directly. A future export with a new tag or attribute must extend the explicit model/validator rather than silently dropping it. The model supports multiple observed paint layers and resources, not unrestricted SVG.

## Source extraction and presets

`scripts/extract-eye-presets.py` reads the original assets, checks all 14 hashes against the unchanged inventory, checks root dimensions/viewBox/fill, and emits `src/geometry/eyes/sourcePresets.ts`. It tokenizes original path commands into numeric tuples without fitting, simplifying, mirroring or resampling. Every observed non-root attribute is converted into a typed property; transforms, local references and matrices become structured data. It writes ten independently measured scenes for Happier, Sad, Cry, Thinking and the transition reference. Generated data is checked with TypeScript `satisfies` against LayeredEyeGeometry.

`presets.ts` exports the required 14 canonical names:

| Expression | Left | Right | Sharing policy |
| --- | --- | --- | --- |
| Idle | IDLE_LEFT | IDLE_RIGHT | Existing Phase-1 side objects preserved |
| Happy | HAPPY_LEFT | HAPPY_RIGHT | Alias the corresponding Idle object |
| Happier | HAPPIER_LEFT | HAPPIER_RIGHT | Independent configurations and layer arrays, even though artwork matches |
| Sad | SAD_LEFT | SAD_RIGHT | Independent complete scenes; never alias Cry |
| Cry | CRY_LEFT | CRY_RIGHT | Independent scenes and distinct 145/183 viewport heights |
| Shock | SHOCK_LEFT | SHOCK_RIGHT | Alias corresponding Idle geometry; source mapping and layout verified |
| Thinking | THINKING_LEFT | THINKING_RIGHT | Independent scenes; preserve 142/129 widths and all asymmetry |

EYE_EXPRESSION_PRESETS retains Idle/Happy reference sharing and adds the remaining canonical pairs. HAPPIER_TRANSITION_PREVIEW is separately exported; it does not appear in EYE_PRESETS or EYE_EXPRESSIONS. All preset configurations and nested arrays are frozen. Pure, argument-free initialization scopes allow the unused data to be eliminated from production builds.

Thinking-right retains the small highlight center (27.2,94.6), rather than Idle's (27.7,94.8559), and its independent notched path. Thinking-left retains its curved/sloping contour and masked outline. No right eye was synthesized by mirroring a left eye. Shared base artwork in Sad/Cry does not erase their distinct details.

## Generation, validation and React rendering

`generateEyePaths` remains the Phase-1 pure contour generator. `generateEyePath` emits validated mixed M/L/C/Z paths. `generateEyeLayers` is the additional pure scene generator, returning native viewBox and allowlisted element/property data in the original document order. `validateEyeGeometry` accepts both model variants and delegates layered data to `validateLayeredEye`. No pure geometry module uses a browser API, React, Zustand or animation code.

Layer validation rejects nonfinite/nonpositive viewport or shape dimensions, invalid opacities, negative blur, unsupported tags/attributes/placement, sparse arrays, malformed commands/arity/order, invalid colors/transforms/matrices, empty/degenerate/unordered gradients, invalid filter inputs, duplicate resource IDs, missing/wrong-type references, resource cycles and cyclic/deep scene trees. Paths retain the source Z closure rather than inventing endpoint correspondence. Invalid values are rejected with RangeError; no feature is silently omitted.

The validator checks structure and SVG reference ownership; it does not prove arbitrary curve containment, self-intersection, tangent continuity or visual suitability. It deliberately permits finite controls outside the viewport and implicit Z closing edges, because exact source reproduction takes precedence over generic shape assumptions.

`ProceduralEye.tsx` dispatches the compatibility union to the unchanged Phase-1 rendering branch or a layered branch. The latter turns pre-generated safe nodes into React elements, preserving child order. Geometry calculations and reference rewriting happen before JSX. Every SVG instance uses React useId as its resource prefix; all gradient/filter/mask/path IDs and URL/xlink references are rewritten together. Filter-result names remain scoped inside their original filter. Rendering all 16 eyes together produces no duplicate IDs and no unresolved resource references. Changing geometry props regenerates the output; no local animation/state/frame loop is introduced.

Root viewBox, native dimensions, transparent fill=none and xMidYMid meet are retained. Added root accessibility/namespace/default-aspect attributes do not alter source paint. No source artwork is changed.

## Development comparison and layout

The existing collapsed Eye geometry comparison panel now contains a local expression selector offering the seven canonical expressions plus the visibly separate HAPPIER_TRANSITION_PREVIEW. The selected expression shows original/generated left eyes and original/generated right eyes, in two aligned side comparisons. Only local React selection state changes; it does not call the production controller, transition hooks, Anime.js or Zustand.

`EyeEndpointComparison` reads original assets from FACE_LAYER_COMPOSITIONS and external positions from FACE_LAYER_LAYOUTS. Each original/generated pair uses identical logical x/y/width/height and eye z-index. The existing responsive 1490:960 canvas and 800:480 artwork CSS are reused without edits or an additional scale transform. In particular, Cry's unequal source viewport heights and transition artwork's unequal dimensions remain intact.

The component remains guarded by Vite DEV. Tests check DEV=false behavior, then inspect the actual production bundle for absence of layered renderer/validator markers, the preview label and distinctive preset IDs. The initial production build exposed retained preset data; pure initialization scopes fixed elimination. The final eye implementation and data are absent from production JavaScript. No production Eyes or FaceRenderer migration occurred.

## Visual fidelity and raster results

The expanded geometry suite exports actual React SSR SVG alongside its original source for all 16 endpoints to [endpoints.json](eye-multi-expression/endpoints.json). The [SVG comparison matrix](eye-multi-expression/endpoint-comparison.svg) and [PNG comparison matrix](eye-multi-expression/endpoint-comparison.png) display source/generated pairs for every expression and side. The PNG was opened and inspected: body silhouettes, highlight notches, gradients, Sad's lower details, Cry's water/right white blur and transition chevrons agree in the displayed static samples.

The existing `verify-eye-raster.py` additionally checks:

1. Complete XML trees: every child tag, attribute, coordinate, command, mask/filter primitive and document order. Only instance resource IDs, filter-result names and explicit root presentation/accessibility defaults are normalized. Numeric spellings are compared as exact numeric values, not with a tolerance.
2. Transparent RGBA source/generated renders using the existing resvg_py environment at 1x, 1.5x and 2x. All channels, including alpha, are compared.

| Endpoints | XML comparisons | Raster pairs | Differing pixels | Maximum channel difference |
| --- | --- | --- | --- | --- |
| Seven canonical expressions x two sides | 14 | 42 | 0 in every pair | 0 |
| HAPPIER_TRANSITION_PREVIEW x two sides | 2 | 6 | 0 in every pair | 0 |
| Existing standalone Phase-1 regression | Existing checks retained | 6 | 0 in every pair | 0 |

Detailed results are in [raster-validation.json](eye-multi-expression/raster-validation.json). Dimensions are scaled from each endpoint's actual width/height, including nonintegral 1.5x sizes rounded by the renderer. No tolerance was relaxed to obtain a pass. No supported source feature has a remaining static pixel mismatch in these tested renders.

This establishes exact sampled static equivalence in resvg_py 0.5.0, not browser/robot-display approval. No Chrome/Brave interaction or screenshot was performed in this task; browser resizing, SVG-engine differences and target-device performance remain unverified. No FPS/latency claim is made.

Reproduce from frontend, using the already available external Python asset-tool environment:

```powershell
python scripts/extract-eye-presets.py
npm run typecheck
npm run build
node scripts/verify-eye-geometry.mjs
$env:PYTHONPATH = "$env:TEMP/brone-asset-tools"
python scripts/verify-eye-raster.py
```

The extractor uses only Python's standard library. Optional raster QA uses the pre-existing resvg_py 0.5.0 and Pillow 13.0.0; no packages were installed or added to frontend/backend dependencies.

## Executed verification

Windows development host, Node 24.14.1, Vite 7.3.7, installed Anime.js 4.5.0. Commands from frontend except git. Final results:

| Check | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS |
| node scripts/verify-eye-geometry.mjs, including verify-eye-expressions.mjs | PASS |
| python scripts/verify-eye-raster.py with established asset-tool PYTHONPATH | PASS; 16 full XML matches, 48 expanded zero-difference raster pairs plus 6 Phase-1 pairs |
| node scripts/verify-mouth-geometry.mjs | PASS |
| node scripts/verify-mouth-morphing.mjs | PASS |
| node scripts/verify-mouth-expressions.mjs | PASS |
| node scripts/verify-face-layers.mjs | PASS |
| node scripts/verify-expression-controller.mjs | PASS |
| node scripts/verify-animation-engine.mjs | PASS |
| node scripts/verify-expression-transitions.mjs | PASS |
| node scripts/verify-element-transitions.mjs | PASS |
| git diff --check | PASS; existing LF/CRLF warnings |
| Real browser / robot-display checks | Not run |
| Backend tests | Not run; backend/protocol unchanged by this task |

All Phase-1 source-control, style, gradient/filter, optional-highlight, updated-props, determinism, validation, original-hash and production-renderer tests remain. Comparison assertions were updated for the requested selector showing one selected pair instead of all Idle/Happy rows simultaneously. The expanded suite separately tests all selections, invokes the actual onChange handler in a shallow hook harness, verifies invalid SHY selection rejection and checks that the canonical store object is unchanged. It validates exact path coordinates/commands and paint ordering, feature counts, left/right independence, blue sixteen-cubic water, right Cry details, Thinking asymmetry, Sad transforms, reference validity/cycles and all-expression layout equality. Existing production renderer checks cover every canonical expression and the existing frontend transition preview.

During development, TypeScript caught a union-property indexing error in filter validation; explicit entry iteration fixed it. The initial Phase-1 panel-count assertions correctly failed after the requested selector changed the visible row count; they now assert the new selected-expression structure, with every expression separately covered. An exploratory rg call used a Windows glob path that was rejected; using rg's `-g` file filter resolved the inspection. The shell sandbox helper could not start, so approved escalated execution was used. Final required commands completed; failed intermediate attempts are not counted as passes.

## Files added or updated

Added:

- src/geometry/eyes/layerGenerator.ts
- src/geometry/eyes/sourcePresets.ts
- scripts/extract-eye-presets.py
- scripts/verify-eye-expressions.mjs
- reports/EYE_MULTI_EXPRESSION_IMPLEMENTATION.md
- reports/eye-multi-expression/{endpoints.json,endpoint-comparison.svg,endpoint-comparison.png,raster-validation.json}

Updated:

- src/geometry/eyes/types.ts: additional typed scene/command/reference structures and compatibility union.
- src/geometry/eyes/presets.ts: canonical aliases/new pairs and separate transition reference.
- src/geometry/eyes/pathGenerator.ts: public validator delegates layered data; Phase-1 path behavior preserved.
- src/geometry/eyes/index.ts: expose new typed APIs.
- src/components/face/eyes/ProceduralEye.tsx: layered dispatch/rendering with scoped IDs.
- src/components/face/eyes/EyeGeometryComparison.tsx: local selector and selected endpoint comparisons.
- scripts/verify-eye-geometry.mjs: updated panel structure assertions and invoke expanded suite.
- scripts/verify-eye-raster.py: all-expression complete-XML and raster comparison.
- tsconfig.tsbuildinfo: regenerated by TypeScript checks.

Existing standalone Phase-1 eye SVG/PNG/JSON comparison artifacts were regenerated by their existing checks. No App, CSS, production renderer, face asset/layout mapping, mouth, animation, canonical-state, backend, shared protocol or dependency file edits were needed in this phase. Original SVGs and the inventory hash baseline are unchanged.

## Limitations and readiness for eye morphing

Static endpoint coverage and deterministic source reproduction are complete. The model is suitable for accepting future geometry props, but it intentionally establishes no interpolation or shared topology policy. Different families contain ellipses, five/six/eight-cubic contours, straight segments, separate outline paths, masks, referenced lower details, water and differing filters/viewports. Source command order is preserved even when starts/directions differ. Zero raster difference at endpoints does not prove morph compatibility.

Before a morphing task, define semantic landmarks and traversal/start correspondence independently for each side and each painted contour. Decide separately how ellipse/path bodies, highlight positions, masks, water, optional blur details and layout changes should move. Exact subdivision can help compatible cubic sectors; it does not resolve ellipse-to-path correspondence, angular chevrons or appearance/disappearance of water/details. No arbitrary index matching, cubic fitting, fading, blinking closure or animation was added here.

Next step: review these static comparisons in a real browser and on the robot display. Eye morphing and production migration remain separate work.
