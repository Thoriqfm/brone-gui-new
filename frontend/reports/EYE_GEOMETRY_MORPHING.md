# Eye Geometry Morphing — Idle to Happier

## Result and scope

The development eye panel now has a working direct Idle → Happier geometric morph for both eyes, with Play, Reverse, Reset, scrubbing, progress/status/phase and 0/10/25/50/75/90/100-percent sample buttons. The original all-expression static comparison and transition-artwork reference remain below the animated preview.

Production Eyes/FaceRenderer, original SVG assets, canonical eye presets, mouth geometry/preview, animation controllers, backend, shared protocol and canonical Zustand semantics were not edited in this task. No dependencies were installed or added. No blinking, gaze, visemes, Sad/Cry/Thinking morphing, whole-eye crossfade or production migration was introduced. Existing unrelated workspace changes were preserved.

## 1. Source inspection

The six inspected originals live under `public/assets/face-layers/eyes/{left,right}/`: idle-eye-{side}.svg, happier-eye-{side}.svg and happier-transition-eye-{side}.svg. Their exact controls/styles are retained in the existing [inventory](eye-svg-inventory.json) and static eye presets. See [Phase-1 analysis](EYE_GEOMETRY_ENGINE_IMPLEMENTATION.md), [multi-expression analysis](EYE_MULTI_EXPRESSION_IMPLEMENTATION.md) and [mouth animation conventions](MOUTH_GEOMETRY_MORPHING.md).

| Feature | Idle | Happier | happier-transition reference |
| --- | --- | --- | --- |
| Viewport | 129 x 171, both sides | 123 x 139, both sides | Left 156 x 153; right 160 x 163 |
| Main fill | Exact ellipse, center (64.5,85.5), radii (60.5,81.5) | Five cubic segments, native top (61.3243,2) | Concave angular chevron with mixed lines/cubics |
| Outline | Independent eight-cubic path, black width 4 | Black width 4 stroke on body | Black width 4 stroke on chevron |
| Highlights | Small ellipse plus eight-cubic notched path, white opacity 0.96 | Same highlight shapes, translated locally by (-2,-2) | None |
| Gradient | Vertical (64.5,4) → (64.5,167) | Vertical (61.3243,2) → (61.3243,136.416) | Different sloping endpoints per side |
| Shadow | Fixed inner-shadow primitive pipeline | None | None |

The original Idle body and outline are distinct. The outline's cardinal extrema are (64.5,2), (127,85.5), (64.5,169), (2,85.5); the filled ellipse has the corresponding inward extrema (64.5,4), (125,85.5), (64.5,167), (4,85.5). Replacing both by one identical stroked curve would alter the source near Idle.

Happier's eight-cubic path is its notched highlight, not an outline. Its body starts at top, reaches right (120.649,81.3073), rolls through lower-right shoulder (98.1679,131.265), crosses a shallow lower bridge to (24.4808,131.265), reaches left (2,81.3073), then returns to top. The bridge's y-extremum occurs at its midpoint, y=136.41675. The tiny difference from gradient y2=136.416 is retained.

Left/right Idle geometry is locally identical, including highlight positions; left/right Happier artwork is also locally identical. Neither side is created by mirroring. Preparation and returned configurations are independent by side; actual layouts differ:

| Side | Idle x/y/width/height | Happier x/y/width/height |
| --- | --- | --- |
| Left | 115 / 154 / 129 / 171 | 104 / 133 / 123 / 139 |
| Right | 556 / 154 / 129 / 171 | 573 / 133 / 123 / 139 |

## 2. Intermediate-keyframe decision

The implementation uses **direct Idle → Happier**. HAPPIER_TRANSITION_PREVIEW remains separate and selectable in the static references; it is not inserted into the morph.

The chevron is a narrow concave bent-ribbon silhouette with an inward angular vertex, absent highlights, sloping gradients and different left/right viewports. The endpoints are full convex eye bodies. An equal command count would not pair these landmarks, and the repository does not supply a confirmed semantic mapping from an eyeball perimeter to the chevron's inner/outer arm edges or a highlight-collapse policy. Forcing it into the current four-cardinal correspondence would introduce substantial concavity and an unsupported appearance transition. This does not establish that a chevron transition is impossible; it establishes that it is not justified by the inspected correspondence for this bounded phase.

The direct transition has clear shared cardinal landmarks and highlights and therefore supplies the most reliable first prototype. Calls attempting to morph through the chevron are explicitly rejected rather than silently approximated or swapped to images.

## 3. Contour correspondence and ellipse conversion

`src/geometry/eyes/geometryInterpolator.ts` prepares each side independently, preserving native SVG coordinates and positive signed area in SVG's downward-y system. Every prepared body/outline starts at the top and traverses top → right → bottom → left → top. Cardinal points are starts of segments 0,2,4,6.

Idle's outline already has eight cubic pieces in this order. For the body ellipse, eight 45-degree tangent-matched cubics use `k = 4/3 * tan(pi/16)`. Cardinal points are pinned exactly to avoid trigonometric closure noise. No polygon fitting or sampled-point reconstruction is used.

Happier's five-cubic source body becomes eight pieces by exact De Casteljau subdivision at t=0.5 of source segments 0,2,4. These are the upper-right arch, the lower bridge and the upper-left arch. The original lower shoulders remain vertices; the bridge split supplies the actual bottom y-extremum. This creates two pieces in each semantic quadrant. Its entire original curve is preserved by subdivision, without control fitting or changed corners. Upper-arch midpoint controls and lower shoulder controls are paired after cardinal/sector alignment, not by matching raw five-versus-eight array indices. Equal counts in unrelated eye expressions are never accepted as correspondence.

Body and outline interpolate separately toward this same target control net. Thus the inner fill joins the Happier contour while the independently stroked outline remains a single continuous path. The source shoulder shape and any small source tangent differences are retained; no artificial C1 smoothing is applied to approved artwork.

### Measured ellipse approximation error

The tests evaluate 10,001 parameter values on each of the eight arcs: 80,008 samples per side. Maximum measured normalized radial error is **0.000004245528637758511**. Multiplying by the maximum ellipse radius 81.5 gives a conservative radial distance bound for those samples of **0.00034601058397731865 logical SVG units**. The assertion limits are 4.25e-6 normalized and 0.00035 logical units. Results are recorded in [geometry-metrics.json](eye-morphing/geometry-metrics.json).

This is a dense sampled error measurement, not an analytic global Hausdorff/extrema proof. Crucially, the approximation is used only for intermediate progress. At progress 0 the API returns the exact original ellipse-based Idle object; at progress 1 it returns the original five-cubic Happier object. No approved endpoint is replaced by the approximation. The intermediate representation's near-Idle geometric difference is bounded by the measured sub-millipixel error; no claim of exact path identity for interior ellipse conversion is made.

## 4. Interpolation API and compatibility

`interpolateEyeGeometry(from, to, progress)` accepts the inspected same-side Idle/Happier pair in either direction. Exact data-equivalent clones are accepted; modified endpoints, unrelated expressions, swapped sides and unprepared topologies are rejected, even when progress would clamp to an endpoint. Inputs are runtime-validated before correspondence checks. Restricting this API to confirmed source pairs avoids pretending that a generic layered-SVG interpolator can infer semantics.

Finite progress clamps to [0,1]; NaN, infinity and nonnumbers throw RangeError. At clamped endpoints the exact caller object is returned. Interior output is a valid LayeredEyeGeometry using the existing rendering model and ID-scoping generator. Positions/control coordinates, viewport dimensions and meaningful gradient endpoints interpolate numerically. Native coordinate systems are not normalized or double-scaled. Prepared data is cached lazily by side and frozen; canonical presets are unchanged. Results are deterministic and inputs are not mutated.

The module also exposes `ellipseEyeContour`, `splitEyeCubic`, `prepareIdleHappierEye`, `eyeProgress` and `interpolateEyeLayout`. The latter handles external x/y/width/height separately, validating finite positive dimensions. It reads no store and introduces no transform scale. Layout source values come from FACE_LAYER_LAYOUTS at the preview call site. No mouth module is imported or modified to implement this algorithm.

## 5. Outline, highlights, gradients and effects

Interior paint order is filtered body fill, one black width-4 outline, small white ellipse, notched white path, resource defs. The body is not separately stroked, so there is no doubled outline. Source endpoint paint is delegated to the existing exact renderer branches. Rendered shape samples show no visible seam or broken outline.

The two notched highlight nets have the same eight semantic pieces: outer upper arc, notch approach/entry/inner arc/exit, lower outer arc and left-side arcs. Their controls interpolate to their source-matched counterparts; the local result is a (-2,-2) translation over the transition. The small highlight center makes the same translation while radii 9.2/9.6 and opacity 0.96 remain fixed. No highlight disappears for this pair, so collapse or highlight fading is unnecessary. A future chevron transition would need a separately approved treatment.

Both source gradients run vertically from top toward bottom, with identical stop offsets/colors. Their endpoints interpolate in native units; stops remain 0.0625/#6260B0 and 0.533654/#29284A. There is no color shift, gradient-type change or arbitrary resource pairing.

Idle has a shadow and Happier has none. A fixed copy of Idle's source inner-shadow pipeline is retained for interior frames: same source region (0,0,129,175), sRGB, hard-alpha matrix, dy=4, blur=2 and compositing. Only its black shadow alpha is deliberately reduced as `0.25 * (1-progress)`, reaching zero at Happier. No blur, offset, mask, filter topology or other matrix coefficient is interpolated. This is isolated effect-strength handling; body, outline and highlights do not undergo an opacity crossfade. There are no masks in this morph pair. Existing React useId rewriting keeps gradient/filter references valid across both eyes and all static comparison instances.

## 6. Development animation and controls

`EyeMorphPreview.tsx` follows the existing mouth preview convention: dynamically import installed Anime.js 4.5.0 after mount, animate a local object `{ progress }` with duration=1000 ms, ease=inOutSine, autoplay=false, then play(). Play moves toward 1, Reverse toward 0 from the current value. Manual scrubbing, inspection samples and Reset cancel the owned run. Completion pins the exact endpoint.

The component's generation token invalidates stale callbacks before cancellation. Cleanup cancels playback and prevents late imports or completions from updating the unmounted preview. Load failure has a visible status. Play is disabled at Happier and Reverse at Idle. Progress, animation status and current phase identify Idle endpoint, direct interpolation or Happier endpoint.

Both eyes render from independent calls at their actual interpolated FACE_LAYER_LAYOUTS positions. The shared animated canvas is limited to 640 CSS pixels, reusing the unchanged 800:480 artwork and 1490:960 display ratios so the controls and result stay nearby. Each eye has a separate data-eye-morph side marker. Static original/generated references for every expression remain below the animation and retain their independent selector. HAPPIER_TRANSITION_PREVIEW is clearly labelled there.

Per-frame React state is confined to this development preview; no Zustand update, production expression request or global engine was added. The Vite DEV guard remains, and actual production build output is checked for absence of morphing code/data/UI markers. The production face remains asset-based.

## 7. Visual validation and artifacts

Actual React-rendered SVGs were generated for both eyes at 0,10,25,50,75,90,100 percent. The resulting shape and layout PNG sheets were opened and inspected:

- [Shape progress matrix](eye-morphing/morph-grid.png): progressive reduction in height and gradual lower-curve flattening; continuous outlines, stable highlights and gradual shadow/gradient change. No visible spikes, unexpected bulges, broken outlines or highlight jumps were observed in these samples.
- [Approved-placement matrix](eye-morphing/layout-grid.png): eyes move independently outward/upward according to their separate source layouts, with endpoint dimensions preserved and no added scale transform.
- [Samples and layout data](eye-morphing/samples.json), plus matching SVG sheets, support reproduction.

`scripts/render-eye-morphing.py` renders with the pre-existing resvg_py 0.5.0 and Pillow 13.0.0 tools. The actual morph API's four endpoints (Idle/Happier x left/right) were compared with original approved SVGs as transparent RGBA at 1x,1.5x,2x: **all 12 pairs have zero differing pixels and zero maximum channel difference**. See [endpoint-raster-validation.json](eye-morphing/endpoint-raster-validation.json). Existing static-eye QA additionally retains six Phase-1 raster pairs and 48 all-expression pairs, all with zero differences.

Intermediate samples have no original pixel target; their visual assessment is the bounded inspection described above, plus sampled geometry tests. These static images do not prove naturalness at every continuous time or browser behavior.

Real browser verification was attempted using the [Computer Use skill](C:/Users/User/.codex/plugins/cache/openai-bundled/computer-use/26.1027.30824/skills/computer-use/SKILL.md). Browser inventory returned **“The browser access host is unavailable”**. A native Chrome fallback was then rejected by automatic approval review: **“Computer Use was not approved to use Google Chrome”**. No browser interaction or screenshot pass is claimed. Playback timing in Chrome/Brave, responsive live inspection and robot-display approval remain outstanding. No robot FPS/latency/performance improvement is asserted.

## 8. Executed tests

Windows development host; Node 24.14.1, Vite 7.3.7, installed Anime.js 4.5.0. Commands from frontend except git. Final results:

| Check | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS |
| node scripts/verify-eye-geometry.mjs, including all static expressions | PASS |
| Existing python scripts/verify-eye-raster.py with asset-tool PYTHONPATH | PASS; all existing XML and raster comparisons |
| node scripts/verify-eye-morphing.mjs | PASS |
| python scripts/render-eye-morphing.py with asset-tool PYTHONPATH | PASS; 12 zero-difference endpoint pairs and visual sheets |
| node scripts/verify-mouth-geometry.mjs | PASS |
| node scripts/verify-mouth-morphing.mjs | PASS |
| node scripts/verify-mouth-expressions.mjs | PASS |
| node scripts/verify-face-layers.mjs | PASS |
| node scripts/verify-expression-controller.mjs | PASS |
| node scripts/verify-animation-engine.mjs | PASS |
| node scripts/verify-expression-transitions.mjs | PASS |
| node scripts/verify-element-transitions.mjs | PASS |
| git diff --check | PASS; existing LF/CRLF normalization warnings |
| Real browser preview | Blocked by browser-host unavailability and Chrome automatic approval rejection |
| Backend tests / robot-device measurements | Not run; no backend/protocol change or performance claim |

The new suite verifies exact endpoint identity in both directions, per-side preparation, cardinal landmarks, positive contour direction, analytic source subdivision evaluation, measured ellipse accuracy, all interpolated controls/dimensions/layout at 101 progress values per side, deterministic immutable inputs, finite paths, closure and unsupported source/topology rejection. At 99 interior values per side, sampled body/outline/highlight polygons are checked for self-intersections; body/outline convexity and highlight containment are checked as well. Tests check one black outline, fixed highlight opacity/radii, changing highlight positions, unchanged gradient stops and deliberate shadow-alpha behavior.

Actual preview handlers are exercised with a mounted shallow-hook harness for Play, Reverse, Reset, scrub, all inspection samples, callback cancellation, unmount, early async cleanup and load failure. The tests inspect the actual geometry passed to ProceduralEye, not just the displayed progress. Real installed Anime.js is exercised with deterministic object-target seeks and automatic forward/reverse component playback; an interior geometry change is observed and Reset remains Idle past the cancelled run's original completion time. All interactions leave the canonical store object unchanged. These harnesses do not simulate browser DOM scheduling.

The existing static panel-count assertions were updated for the extra animated pair/canvas. Their original static endpoint, source-hash, styling and production compatibility checks remain. The all-expression selector harness recognizes the new preview import; the dedicated morphing suite separately tests its actual behavior.

During development, a test initially treated the source highlights' required opacity=0.96 as prohibited whole-eye fading. It was corrected to assert absence of body/outline opacity while separately checking constant source highlight opacity. A shallow-harness button lookup was corrected to combine numeric/text React children for percentage buttons. Final tests pass; no failed intermediate run is counted as a pass. The shell sandbox helper failed to start, so approved escalated shell execution was used for verification.

Reproduce visual artifacts after the standard frontend checks:

```powershell
node scripts/verify-eye-morphing.mjs
$env:PYTHONPATH = "$env:TEMP/brone-asset-tools"
python scripts/render-eye-morphing.py
python scripts/verify-eye-raster.py
```

No raster dependencies were installed; these commands use the already established local asset-tool environment.

## 9. Files changed

Added:

- src/geometry/eyes/geometryInterpolator.ts
- src/components/face/eyes/EyeMorphPreview.tsx
- scripts/verify-eye-morphing.mjs
- scripts/render-eye-morphing.py
- reports/EYE_GEOMETRY_MORPHING.md
- reports/eye-morphing/{samples.json,geometry-metrics.json,morph-grid.svg,morph-grid.png,layout-grid.svg,layout-grid.png,endpoint-raster-validation.json}

Updated:

- src/geometry/eyes/index.ts: export morphing/preparation/layout APIs.
- src/components/face/eyes/EyeGeometryComparison.tsx: mount animated preview before unchanged static references.
- src/style.css: scoped eye-preview canvas and disabled-button styles.
- scripts/verify-eye-geometry.mjs: account for animated pair while retaining static tests.
- scripts/verify-eye-expressions.mjs: resolve new preview import in the existing selector harness.
- tsconfig.tsbuildinfo: regenerated by TypeScript checks.

Existing static eye report artifacts were regenerated by their existing suites. Canonical eye geometry definitions, approved artwork, production renderers, mouth modules, animation source, backend and protocol were not changed by this task.

## 10. Limitations and next step

This API intentionally supports only the inspected same-side Idle/Happier endpoints, with direct reverse playback. It does not infer semantic correspondence for arbitrary edited eyes, equal-count contours, other expressions or the chevron reference. The ellipse conversion has the documented sampled interior error, while exact endpoint artwork is retained. Sampled geometry and static visual evidence are not analytic proofs of every possible shape or browser raster equivalence.

The prototype is ready for browser/robot-display review of this pair. Before multi-expression eye morphing, each new family needs its own body/outline landmarks, topology/appearance policy, highlight handling and treatment of masks, tears and missing details. A chevron keyframe would require separate inner/outer-arm correspondence and controlled highlight treatment. Production integration would additionally need explicit animation ownership and runtime/device verification. None of those migrations, blinking or visemes is part of this task.
