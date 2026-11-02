# Mouth Geometry Engine Implementation

## 1. Existing SVG geometry analysis (recorded before implementation)

Inspected approved files in public/assets/face-layers/mouth: idle-mouth.svg, happier-mouth.svg, sad-mouth.svg, cry-mouth.svg, shock-mouth.svg and thinking-mouth.svg. The visemes entry is a directory, not an additional mouth SVG. Happy intentionally uses happier-mouth.svg, as configured in faceLayerAssets.ts.

| Asset | ViewBox | Cavity | Tongue | Outline |
| --- | --- | --- | --- | --- |
| idle-mouth.svg | 0 0 282 96 | M + 5 C + Z | M + 10 C + Z | M + 5 C + Z |
| happier-mouth.svg | 0 0 282 155 | M + 5 C + Z | M + 10 C + Z | M + 5 C + Z |
| sad-mouth.svg / cry-mouth.svg | 0 0 276 86 | M + 4 C + Z | M + 6 C + Z | M + 4 C + Z |
| shock-mouth.svg | 0 0 156 148 | M + 4 C + Z | M + 10 C + Z | M + 4 C + Z |
| thinking-mouth.svg | 0 0 271 52 | M + 4 C + Z | None | M + 4 C + Z |

All paths use absolute move/cubic commands and close explicitly. All SVG roots inherit fill none. Idle/Happy paint the dark cavity (#232322, black stroke 5), then a pink tongue (#EF775D, no stroke), then a black outline (stroke 8, fill inherited none). The last path retraces the cavity in the opposite direction from a different starting corner; there is no independent inner-hole path, clipping path, gradient or transform. No line caps/joins are specified: SVG defaults are butt/miter, with default miter limit 4. Shock uses stroke widths 5.93313 and 9.49301 instead.

Idle's upper edge runs from approximately (268.268,4.11362) to (13.1673,4.57189), with controls (167.337,21.6633) and (108.054,22.5806), producing a shallow asymmetric scoop. Its lower cavity reaches (141.121,91.3795). Tongue starts at (139.973,38.5593) and its lower center reaches approximately y=91.3796.

Happy's upper edge runs from (267.864,4.3203) to (14.37,5.00488), with controls (167.749,33.41) and (108.584,34.8994). Its cavity reaches (141.694,150.372); tongue starts at (140.545,61.7982) and reaches y=150.372. Corners have distinct control points and the tongue has several small inflection segments. A single symmetric cartoon curve would lose these characteristics.

The existing logical placements differ: Idle (259.75,325.25,282,96), Happy (259.5,287.75,282,155) in the 800×480 artwork. Shape coordinates and placement must remain separate.

## 2. Geometry parameters and presets

[types.ts](../src/geometry/mouth/types.ts) defines readonly MouthGeometry with width, height, strokeWidth, cavityStrokeWidth, cavity and nullable tongue. Each contour contains a normalized start point and cubic segments (two controls and endpoint). Normalized coordinates belong to [0,1]. This explicit control net preserves asymmetric corners and tongue inflections; width/height plus generic curvature/opening scalars cannot independently reproduce them. No redundant opening/curvature fields were added.

[presets.ts](../src/geometry/mouth/presets.ts) stores measured controls separately from rendering, normalizes once and freezes presets recursively. IDLE is 282×96; HAPPY is 282×155. Both use strokes 8/5, five cavity curves and ten tongue curves. Width/height scale normalized controls; stroke widths are explicit SVG units and must be scaled separately for geometric scaling. Replace immutable geometry props when editing; mutating the same object is unsupported by memoization.

## 3. Generation and validation

[pathGenerator.ts](../src/geometry/mouth/pathGenerator.ts) is browser-independent and deterministic. It emits absolute M/C/Z paths and a viewBox using 15 significant digits, retaining small valid coordinates. There are no React, store, DOM or animation dependencies in geometry generation.

The outline reuses the closed cavity curve. Its direction/start differ from the asset outline, whose independently rounded control points differ by less than 0.002 logical units. No tongue clipping was introduced: the original paint order is retained. Optional tongue=null produces no tongue path.

Validation rejects nonfinite/nonpositive dimensions or strokes, cavity stroke wider than outer stroke, malformed/sparse/nonfinite/out-of-range points, unsupported segment counts, and unclosed contours. Cubic derivative extrema check the outer stroke envelope against the viewBox. Approved source curves slightly overshoot the top: Idle minimum cavity y=3.9931425 and Happy y=3.9952884 with half-stroke 4. Validation therefore allows 0.002×strokeWidth edge tolerance (0.016 at native scale). This preserves the source rather than moving its coordinates. It is an outline-envelope check, not a general arbitrary-path self-intersection or tongue-containment validator.

## 4. Inline SVG rendering

[ProceduralMouth.tsx](../src/components/face/mouth/ProceduralMouth.tsx) accepts geometry and memoizes generated paths by its reference. It renders cavity, optional tongue and outline in original order with explicit colors, stroke widths, butt caps, miter joins/limit 4, root fill none and xMidYMid meet. Numeric viewBox/width/height follow geometry. There is no local state, frame loop or Anime.js behavior. No coordinates are stored in Zustand.

## 5. Development comparison and production compatibility

[MouthGeometryComparison.tsx](../src/components/face/mouth/MouthGeometryComparison.tsx), mounted below the existing App comparison, provides a collapsed “Mouth geometry comparison (development only)” panel with an independent Idle/Happy selector. Original Mouth and procedural SVG appear in separate equal-size canvases, using the same FACE_LAYER_LAYOUTS mouth positions. The existing 1490×960 responsive display and 800×480 logical artwork classes are reused. Only the mouth is shown, so other UI/face elements are not duplicated in this panel.

The approved asset Mouth, FaceRenderer, transition coordinators, animation engine, presets, layouts, request contract and canonical state are unchanged. Production faces still render SVG image assets for all expressions. The new selector never requests an expression or participates in animation. Full-image comparison and preview-only happier-transition remain available. No protocol/backend changes.

## 6. Visual agreement and limitations

Programmatic tests compare cavity and tongue control coordinates to the actual SVG within 0.000001 logical units, and compare the reversed outline segments within 0.002. Colors, viewBox, topology and styling are tested through actual React SSR. This establishes coordinate agreement, not browser rasterization equivalence. Reusing the cavity outline removes tiny independent rounding differences in the source outline; no additional artistic parameter is needed for these endpoints. An independently parameterized outline would be needed only for literal reproduction of that rounding. Inline SVG versus external SVG edge antialiasing remains unverified.

Only Idle/Happy topology is supported. Sad/Cry/Shock/Thinking have different segment structures and are intentionally not approximated or generated. Presets are explicit control nets rather than an ergonomic high-level smile editor. The current normalized [0,1] range would need reconsideration for other assets whose controls extend outside their viewBox.

Browser verification was not performed. To verify visually: run npm run dev, open the frontend, expand the mouth comparison, select Idle then Happy and compare silhouette, strokes, tongue and color at equal widths and several viewport sizes. Check production expression controls/transitions and original full-image comparison independently. No visual pass is claimed.

## 7. Executed verification

Commands executed from frontend unless noted. Final results:

| Command | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS |
| node scripts/verify-face-layers.mjs | PASS |
| node scripts/verify-expression-controller.mjs | PASS |
| node scripts/verify-animation-engine.mjs | PASS |
| node scripts/verify-expression-transitions.mjs | PASS |
| node scripts/verify-element-transitions.mjs | PASS |
| node scripts/verify-mouth-geometry.mjs | PASS |
| git diff --check (repository root) | PASS; Git emitted existing working-tree LF/CRLF normalization warnings |

New tests cover both endpoint paths, valid SVG command output, deterministic results, fractional small dimensions and scaling, invalid dimension/stroke/control boundaries, closure/topology, cavity/tongue/optional tongue, actual SSR styling and prop configurations, comparison placement/isolation, all seven asset mouths plus preview compatibility, and SHA-256 hashes of all six original mouth SVGs. Existing controller harness import mapping was updated to load the actual comparison component. Browser scheduling, screenshots and pixel-difference tests were not run.

During development, typecheck caught an implicit-any callback; the corrected final typecheck passes. Initial geometry validation rejected the approved tiny edge overshoot, so the measured tolerance above was added. A comparison assertion was corrected to allow React's prepended image-preload links. Final suites pass after these fixes.

## 8. Modified files in this task

Added:
- src/geometry/mouth/types.ts
- src/geometry/mouth/presets.ts
- src/geometry/mouth/pathGenerator.ts
- src/geometry/mouth/index.ts
- src/components/face/mouth/ProceduralMouth.tsx
- src/components/face/mouth/MouthGeometryComparison.tsx
- scripts/verify-mouth-geometry.mjs
- reports/MOUTH_GEOMETRY_ENGINE_IMPLEMENTATION.md

Updated:
- src/App.tsx — mount separate static comparison panel.
- src/style.css — scoped panel and procedural SVG sizing.
- scripts/verify-expression-controller.mjs — recognize the new actual App import.
- tsconfig.tsbuildinfo — regenerated by required TypeScript checks.

Content hashes against the pre-task snapshot confirm no changes to existing artwork, backend, shared protocol, animation source, asset mouth renderer or layout configuration. Pre-existing working-tree changes were preserved.

## 9. Readiness for future interpolation

Both presets share control-point cardinality/order and independent immutable parameters. The pure generator can accept newly supplied parameter objects without component remounts. Future work must first verify interpolation validity (stroke envelope, contour closure/shape and tongue containment) and browser appearance; endpoint agreement alone does not prove intermediate shapes are desirable. No interpolation API, SVG morphing, animation integration, visemes or eye geometry was implemented.

