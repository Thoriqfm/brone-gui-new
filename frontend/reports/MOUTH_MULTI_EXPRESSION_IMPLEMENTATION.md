# Mouth Multi-Expression Implementation

## 1. Scope and result

The development mouth engine now has six source-derived presets: IDLE, HAPPY, SAD, CRY, SHOCK and THINKING. The preview starts from Idle and supports every other preset as a target, with Play, Reverse, Reset, scrubbing, current expression and animation status. The static approved-SVG comparison supports all six presets. SHY, happier-transition and an independent HAPPIER preset were not added.

Production Mouth, FaceRenderer, FaceBase, eyes, animation engine/controllers, approved SVG assets, layouts, backend and shared protocol were preserved. No dependencies were installed or added. Existing working-tree changes were preserved. SHA-256 snapshots taken before this task confirm the protected renderer/controller/layout/backend/schema files did not change. The existing artwork-hash suite still passes.

## 2. Original SVG inventory

Sources are public/assets/face-layers/mouth/*.svg. Every path is an absolute M, cubic C sequence, Z closure. All roots have fill=none. Paint order is cavity, tongue where present, outer outline. Colors are cavity #232322, tongue #EF775D, black strokes. Tongues have no stroke. Defaults are butt caps, miter joins and miter limit 4; the procedural renderer sets these explicitly.

| Preset | Source | ViewBox | Cavity / tongue / outline segments | Outer / cavity strokes |
| --- | --- | --- | --- | --- |
| IDLE | idle-mouth.svg | 0 0 282 96 | 5 / 10 / 5 | 8 / 5 |
| HAPPY | happier-mouth.svg | 0 0 282 155 | 5 / 10 / 5 | 8 / 5 |
| SAD | sad-mouth.svg | 0 0 276 86 | 4 / 6 / 4 | 8 / 5 |
| CRY | cry-mouth.svg | 0 0 276 86 | 4 / 6 / 4 | 8 / 5 |
| SHOCK | shock-mouth.svg | 0 0 156 148 | 4 / 10 / 4 | 9.49301 / 5.93313 |
| THINKING | thinking-mouth.svg | 0 0 271 52 | 4 / absent / 4 | 8 / 5 |

Native starts below are logical SVG coordinates. Signs are signed-area signs calculated directly in the SVG x/y coordinate system, avoiding clockwise terminology that changes with the y-axis convention.

| Preset | Cavity start / sign | Tongue start / sign | Outline start / sign |
| --- | --- | --- | --- |
| IDLE | (268.268,4.11362) / negative | (139.973,38.5593) / positive | (13.1673,4.57189) / positive |
| HAPPY | (267.864,4.3203) / negative | (140.545,61.7982) / positive | (14.37,5.00488) / positive |
| SAD | (13.9782,77.3988) / positive | (137.816,33.4229) / positive | (268.601,72.3941) / negative |
| CRY | (13.9782,77.3988) / positive | (137.816,33.4229) / positive | (268.601,72.3941) / negative |
| SHOCK | (150.805,70.2029) / negative | (77.7725,54.6711) / positive | (77.7755,4.74658) / positive |
| THINKING | (11.3555,44) / positive | absent | (11.3555,44) / positive |

All cubic control pairs and endpoints were extracted without rounding into sourcePresets.ts for the added expressions; existing Idle/Happy controls remain in presets.ts. Coordinates are divided by the source width/height once. SAD/CRY upper controls include negative y values (for example -16.7466 and outline -19.0641); the actual curves remain inside their SVG envelopes. Validation therefore permits finite controls outside [0,1], retaining normalized starts, finite tuples, closure, bounded segment counts and exact cubic extrema checks.

SAD and CRY SVG files are byte-identical, including their independent outlines and tongue. Their separate preset objects share the measured source data. Making these mouth-only previews distinguishable would redesign the approved artwork. The full face distinguishes Sad and Cry through other existing assets; this task does not change those assets.

## 3. Presets, layout and style

MOUTH_PRESETS retains its existing IDLE/HAPPY objects and adds SAD/CRY/SHOCK/THINKING. Added source geometries retain independent outline contours. This is essential for SAD/CRY: their lower outline arch materially differs from the cavity, so reusing the cavity would lose the approved silhouette. SHOCK and THINKING also retain their literal source outline coordinates. Idle/Happy keep the previous cavity-as-outline behavior, including its documented less-than-0.002-unit source rounding tolerance.

MOUTH_EXPRESSION_PRESETS associates each geometry with FACE_LAYER_LAYOUTS and the common approved MOUTH_STYLE. Stroke widths and optional tongue/outline configuration live in geometry. All assets use the same colors, so color interpolation is unnecessary.

| Expression | x | y | Width | Height |
| --- | --- | --- | --- | --- |
| Idle | 259.75 | 325.25 | 282 | 96 |
| Happy | 259.5 | 287.75 | 282 | 155 |
| Sad | 262 | 303.5 | 276 | 86 |
| Cry | 262 | 303.5 | 276 | 86 |
| Shock | 322.25 | 304 | 156 | 148 |
| Thinking | 265.5 | 338 | 271 | 52 |

The same progress interpolates geometry dimensions and x/y/width/height placement. Wrapper dimensions match the current viewBox dimensions, with no scale transform. The existing 800 x 480 logical artwork and responsive 1490:960 display canvas are preserved. The prior 640-CSS-pixel limit on the development animated canvas remains, keeping controls and the animated mouth together.

## 4. Exact subdivision and bounded compatibility

The new topology.ts implements De Casteljau splitting. Three interpolated edge points produce two second-level points and a shared point on the cubic. The left and right cubic segments reproduce the original at parameter ranges [0,t] and [t,1]. There is no path fitting, polygon-to-curve reconstruction or generic cartoon-mouth approximation.

Contour reversal swaps control order and walks segment starts backward. Source curves are split at explicit anatomical landmarks before pairing. Each paired sector uses the union of its existing normalized arc-distance knots. With m and n source pieces in that sector, at most m+n-1 output pieces are needed. This avoids an LCM explosion.

Arc distance is estimated with 64-step Simpson integration of cubic speed. A 36-iteration bisection chooses subdivision parameters at corresponding distances. This numerical approximation affects correspondence only: every resulting cubic remains an exact subdivision of its own original curve. Endpoint artwork is not approximated by the distance estimate. Tests analytically check subdivision evaluation and compare prepared contours with dense samples of their source curves.

| Transition | Prepared cavity segments | Prepared tongue segments |
| --- | --- | --- |
| Idle to Happy | 5 | 10 |
| Idle to Sad | 12 | 16 |
| Idle to Cry | 12 | 16 |
| Idle to Shock | 8 | 20 |
| Idle to Thinking | 8 | 10 |

Cavity and independent outline pairs are aligned separately. Geometry validation allows 1 through 32 segments per contour; the prepared preset transitions stay below that bound. Degenerate landmark sectors, malformed controls, invalid landmark ordering, nonfinite inputs, incompatible interpolation structures and invalid opacity/clipping configuration are rejected.

## 5. Explicit contour correspondence

Cavity and outline traversal is canonicalized to top center, left corner, lower center, right corner, back to top center, with negative signed area. Tongues traverse top center, right side, lower center, left side, back to top center with positive signed area. Top/lower centers are source vertices or midpoints of the inspected long cubic arches. Rounded lateral landmarks use exact x derivative extrema on explicitly selected source corner segments.

The source maps are declared in expressionPresets.ts:

- Idle/Happy cavity: midpoint of segment 0; minimum x of segment 1; vertex after segment 2; maximum x of segment 4.
- Sad/Cry cavity: reverse native traversal; midpoint of upper segment 1; minimum x on segment 0; midpoint of lower segment 3; maximum x on segment 2.
- Sad/Cry outline: midpoint of segment 0; minimum x on segment 1; midpoint of segment 2; maximum x on segment 3. Its native direction is already canonical.
- Shock cavity: native top/left/bottom/right vertices at contour positions 1/2/3/0. Its outline is reversed and starts at the native top vertex.
- Thinking: reverse native traversal; top/left/lower/right vertices at native positions 1/0/3/2.
- Tongues: native top start, exact right x extremum on segment 1, lower-center vertex (5 for Idle/Happy/Shock, 3 for Sad/Cry), exact left x extremum on segment 8 or 4.

Matching indices are never inferred solely from equal segment counts. These maps support the inspected Idle-to-target transitions; automatic correspondence for arbitrary new artwork is not claimed. Happy bypasses preparation entirely, preserving every previous interpolated parameter and its original 5/10 topology. A 101-sample regression checks this equality.

## 6. Tongue transitions and independent outlines

Present-to-present tongues retain their own measured curves and interpolate compatible prepared controls. During new intermediate transitions the tongue is clipped to the current mouth silhouette: the union of cavity fill and outer-outline fill/stroke. The clip follows both generated paths each frame, uses user-space units and a React useId identifier so multiple previews cannot collide. The outer outline is painted last. Neither the whole mouth nor its cavity fades.

This clipping is deliberate. Initial equal-segment correspondence produced intermediate tongue protrusions of about 8 logical units; later arc-distance correspondence improves the trajectory, and clipping guarantees that tongue paint stays within the mouth silhouette. Endpoint source objects have no added clipping, preserving their original paint exactly. Happy retains its old unclipped behavior.

Thinking has no source tongue. Its transition target uses a degenerate tongue contour collapsed to the original Thinking lower-center cavity landmark (135.086,29). The existing ten tongue segments shrink toward that point while tongue-only opacity decreases as 1-progress. At progress 1 the original Thinking geometry with tongue=null is returned. Thus the tongue does not abruptly disappear at visible size. Geometry interpolation remains finite, including the degenerate target; alignment itself rejects degenerate sectors because they cannot define arc-distance correspondence.

sampleIdleMouthTransition returns original Idle at 0 and the original target at 1, including clamped out-of-range finite progress. Intermediate frames use prepared control nets. Reparameterization changes path-string ordering/counts near endpoints but preserves their rendered curves. Low-level interpolateMouthGeometry still requires compatible structures; the expression preparation layer owns alignment and absent-tongue handling.

## 7. Development preview

MouthMorphPreview keeps local Anime.js 4.5.0 object animation: 1000 ms, inOutSine, autoplay:false followed by play(). The animated scalar is progress. No per-frame Zustand writes occur and production expression controllers are not invoked.

The target selector offers Happy, Sad, Cry, Shock and Thinking. Switching targets cancels playback, invalidates stale callbacks and resets to Idle. Play/reverse labels and current-expression status follow the selected target. Play is disabled at the target and Reverse at Idle. Reset, scrubbing, async load failure and unmount cancellation are preserved. Original SVG versus procedural static comparisons now offer all six expressions. The Vite DEV guard remains; actual production JavaScript was checked for the absence of preview UI markers and topology-preparation error strings.

## 8. Visual validation matrix

Actual React renderer markup was exported to SVG and rasterized with the existing local resvg_py 0.5.0 asset tool; no package was installed. The resulting PNGs were opened and visually inspected. These are static SVG renders, not screenshots of Chrome playback.

| Target | 0 / 10 / 25 / 50 / 75 / 90 / 100 percent | Findings in final static renders |
| --- | --- | --- |
| Happy | All inspected | Existing scoop, tongue, outline and opening preserved. |
| Sad | All inspected | Smooth change through a shallow middle contour into the approved downturned arch; separate outline retained. |
| Cry | All inspected | Matches Sad because the approved mouth files are identical. |
| Shock | All inspected | Width narrows and opening grows into the approved rounded mouth; initial corner shoulders were removed by arc-distance correspondence. |
| Thinking | All inspected | Mouth becomes shallow and downturned; tongue shrinks/fades, with initial premature corner spikes removed by arc-distance correspondence. |

Endpoint comparison was visually inspected for all six expressions. The newly extracted endpoints visually agree with their approved SVGs at the rendered size. The placement grid was also inspected using actual FACE_LAYER_LAYOUTS positions. No visible floating tongue, external tongue spill or broken outline was observed in the final inspected samples. This is a bounded static review, not a claim of analytic curvature guarantees, browser raster identity or approved perceptual naturalness at every time value.

Review artifacts:

- [Shape progress matrix](mouth-multi-expression/morph-grid.png)
- [Original versus generated endpoints](mouth-multi-expression/endpoint-comparison.png)
- [Logical placement matrix](mouth-multi-expression/layout-grid.png)

Matching SVG versions are provided beside those PNGs. Reproduce SVG sheets with node scripts/render-mouth-expressions.mjs. PNGs were generated with the existing temporary asset-tool Python path and resvg_py.svg_to_bytes(svg_path=...).

Browser automation was attempted; cua.listBrowsers reported "The browser access host is unavailable". Chrome playback, resizing, DOM scheduling and live visual review remain outstanding. No browser visual pass or FPS/latency improvement is claimed.

## 9. Executed tests

Functional tests ran on the Windows development host, Node 24.14.1, Vite 7.3.7 and installed Anime.js 4.5.0. No robot-hardware benchmark was performed.

| Command, from frontend unless noted | Final result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS |
| node scripts/verify-mouth-geometry.mjs | PASS |
| node scripts/verify-mouth-morphing.mjs | PASS |
| node scripts/verify-mouth-expressions.mjs | PASS |
| node scripts/verify-expression-controller.mjs | PASS |
| node scripts/verify-animation-engine.mjs | PASS |
| node scripts/verify-expression-transitions.mjs | PASS |
| node scripts/verify-element-transitions.mjs | PASS |
| node scripts/verify-face-layers.mjs | PASS |
| node scripts/render-mouth-expressions.mjs | PASS; review sheets rendered and inspected |
| git diff --check, repository root | PASS; existing LF/CRLF normalization warnings |
| Browser verification | Unavailable; outstanding |

The new suite validates all six native presets against source controls, colors, strokes, dimensions and outlines; source normalization including negative controls; analytic subdivision; double reversal; signed area and explicit lateral landmarks; bounded compatible topology; independent outline interpolation; tongue-present/absent handling; finite valid paths, all intermediate controls and layouts at 101 progress samples per target (505 total); sampled contour self-intersections at every sample; tongue containment or actual renderer clip usage where needed; original Happy equality at all 101 samples; determinism, input preservation, invalid data and production asset-renderer compatibility.

The existing morphing suite now also invokes actual selector/play/reverse/reset handlers for every target and verifies cancellation on target replacement. Its real automatic Anime.js component playback regression remains, alongside fake-frame and seek-based checks. These harnesses establish logic, not browser scheduling. Existing geometry tests retain all six approved artwork hashes and production img rendering checks.

During implementation, a new containment assertion exposed intermediate tongue spill, leading to silhouette clipping rather than weakening the required visible containment. Initial static renders exposed corner shoulders/spikes, leading to arc-distance correspondence. A selector test initially ran after an intentionally cleaned-up mount; initializing a fresh live mount corrected the harness. Some concurrent Vite SSR harnesses emitted an HMR-port-in-use warning; their assertions passed. Failed intermediate runs are not reported as final passes.

## 10. Files added or modified in this task

Added:
- src/geometry/mouth/sourcePresets.ts
- src/geometry/mouth/topology.ts
- src/geometry/mouth/expressionPresets.ts
- scripts/verify-mouth-expressions.mjs
- scripts/render-mouth-expressions.mjs
- reports/MOUTH_MULTI_EXPRESSION_IMPLEMENTATION.md
- reports/mouth-multi-expression/{morph-grid,layout-grid,endpoint-comparison}.{svg,png}

Modified:
- src/geometry/mouth/types.ts: independent outline, tongue visibility and clipping.
- src/geometry/mouth/presets.ts: include source-derived added presets; retain Idle/Happy controls.
- src/geometry/mouth/pathGenerator.ts: generalized bounded contours, independent outlines and validation.
- src/geometry/mouth/geometryInterpolator.ts: interpolate outline and tongue-only visibility.
- src/geometry/mouth/index.ts: export expression/preparation APIs.
- src/components/face/mouth/ProceduralMouth.tsx: independent outline and optional tongue clip/opacity.
- src/components/face/mouth/MouthMorphPreview.tsx: target selector, sample prepared transitions and dynamic status.
- src/components/face/mouth/MouthGeometryComparison.tsx: all six static references.
- scripts/verify-mouth-morphing.mjs: multi-target handler/cancellation regressions.
- tsconfig.tsbuildinfo: regenerated by required checks.

## 11. Limitations and next step

Only inspected Idle-to-target transitions have explicit semantic correspondence. The lower-level helpers are reusable, but arbitrary expression-to-expression pairing is not approved or automatically inferred. Numerical arc-length estimation is a correspondence aid; exact subdivision preserves source silhouettes. Runtime validation checks finite structures, closure and cubic stroke envelopes, not arbitrary analytic self-intersection, tangent continuity or miter envelopes. Sampled tests and static images bound the evidence.

New intermediate tongues use silhouette clipping, and Thinking uses tongue-only fade plus collapse. Idle/Happy retain the prior tiny outline-rounding tolerance. Sad and Cry cannot be distinguished from their approved mouth artwork alone. Browser animation and target-device rendering/performance remain unverified.

This is ready for multi-expression mouth development review. Production integration is deferred and the asset-based renderer remains active. The subdivision and correspondence approach can inform a future eye-geometry design, but this task does not establish eye landmarks, eye artwork fidelity or eye-animation readiness. Complete Chrome/target-display mouth review before advancing; no eye geometry, visemes or unrelated effects were implemented.
