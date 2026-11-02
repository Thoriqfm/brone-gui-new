# Cry and Sad multi-expression eye morphing

## Result and boundaries

The development preview and geometry API support Idle ↔ Cry and Sad ↔ Cry for independently extracted left/right eyes. Idle ↔ Happier and Idle ↔ Sad remain available. Pre-edit SHA-256 snapshots confirm **404 unchanged generated Happier/Sad samples** (101 per side per pair).

Production Eyes, FaceRenderer, ProceduralEye, canonical presets, asset mappings/layouts, artwork, mouth modules, animation engine, Zustand, backend and protocol were not changed by this task. Existing protected-file hashes still pass. No dependencies were added or installed. Existing unrelated working-tree edits were preserved.

## 1. Source inventory and comparison

Source files are `public/assets/face-layers/eyes/{left,right}/{idle,sad,cry}-eye-{side}.svg`. The complete original attributes, commands, document order, transforms, resource definitions and SHA-256 hashes remain in [eye-svg-inventory.json](eye-svg-inventory.json). Static tests check all fourteen original eye asset hashes and compare all sixteen canonical/reference endpoints.

| Feature | Idle left/right | Sad-left | Sad-right | Cry-left | Cry-right |
| --- | --- | --- | --- | --- | --- |
| Native viewBox | 0 0 129 171 | 0 0 142 156 | 0 0 142 156 | 0 0 142 145 | 0 0 142 183 |
| Main body | Ellipse (64.5,85.5), radii (60.5,81.5) | Six cubics | Independent six cubics | Exactly Sad-left body controls | Exactly Sad-right body controls |
| Primary outline | Independent eight cubics, black width 4 | Eight C plus four L, black width 4 | Independent mixed contour | Exactly Sad-left commands | Exactly Sad-right commands |
| Small highlight | (27.7,94.8559) | (42.9422,90.9853) | (30.1492,90.9853) | Same as Sad-left | Same as Sad-right |
| Notched highlight | Eight cubics | Eight side-specific cubics | Independent eight cubics | Same as Sad-left | Same as Sad-right |
| Supplementary outline | None | Six cubics, width 8, body-exclusion mask | Independent controls | Same left controls | Small source rounding differences from Sad-right |
| Masks | None | Body exclusion and lower-circle mask | Same feature types, independent coordinates | Body exclusion only | Body exclusion; independently rounded controls |
| Lower detail | None | Referenced round path, masked stroke, transformed dark ellipse | Independent round path and rotated dark ellipse | Absent | Absent |
| Water | None | None | None | Sixteen cubics, #76C5FD | Independent sixteen cubics, #76C5FD |
| Filters | Body inner shadow | Two inner shadows | Two inner shadows | Two inner shadows | Two inner shadows plus white-detail blur |
| Additional white detail | None | None | None | None | Ellipse (64.7422,131.546), radii (6.78906,20.5486), fillOpacity .8, group opacity .96, blur 15 |

Both source highlights retain white fill and opacity .96. Water is a solid source blue with implicit opacity 1; it has no gradient or transform in the approved export. Its top has several wave/notch features; the lower portion reaches y=141.546. Left water starts (78.5488,73.3228), right starts (63.291,73.3228). Source water controls are retained verbatim inside an emergence wrapper.

Sad/Cry gradients share the original user-space endpoints per side: left (78.8829,7.85522) → (62.8089,136.38), right (62.8085,7.85522) → (78.8825,136.38). Idle uses (64.5,4) → (64.5,167). All stops remain .0625/#6260B0 and .533654/#29284A.

Cry-right's mask and supplementary outline have differences such as 31.1301 versus Sad's 31.1302 and 62.9023 versus 62.9024. They are prepared independently; shared command counts never authorize replacing those coordinates. Body and primary outline equality are explicitly asserted in the new test.

Sad's original lower ellipse transforms remain `matrix(-0.961592 -0.274482 -0.274482 0.961592 94.1992 124.054)` on the left and `rotate(-15.9311 71.1942 127.572)` on the right. They are preserved within the retreating detail subtree, including use/mask references. These dark details have **no water or Cry-white counterpart**.

Original Cry paint order is filtered body, primary outline, small highlight, notched highlight, blue water, filtered masked supplementary outline, optional right white blur, defs. Interior frames follow that order; Sad's retreating lower-detail subtree follows those painted layers and precedes defs. The shared body is fully opaque throughout.

## 2. Left/right semantic correspondence

The existing Sad sector policy is retained: upper-edge midpoint → upper-right corner → lower y-extremum → upper-left corner, in positive SVG signed-area direction. Idle anchors are `[0,1,4,7]` on its eight-cubic contour. Left/right preparations are cached separately and frozen; neither eye is mirrored.

Body/mask native anchors are left `[1.5,2.5,lowerExtremum(c,4),.5]`, right `[1.5,.5,lowerExtremum(c,4),2.5]`. Primary-outline anchors are left `[11.5,.5,lowerExtremum(c,5),10.5]`, right `[11.5,10.5,lowerExtremum(c,5),.5]`. Supplementary anchors are left `[2.5,1.5,lowerExtremum(c,5),3.5]`, right `[2.5,3.5,lowerExtremum(c,5),1.5]`. Body/primary/mask reverse on the right; the supplementary path reverses on the left. Extrema come from analytic derivative roots.

For Sad/Cry both endpoints use those semantic sectors. Body equality does not justify dropping the independently rounded mask/stroke. The resulting prepared segment counts are:

| Pair / side | Body | Primary outline | Mask | Supplementary outline |
| --- | --- | --- | --- | --- |
| Idle/Cry left | 14 | 20 | 14 | 14 |
| Idle/Cry right | 14 | 20 | 14 | 14 |
| Sad/Cry left | 10 | 16 | 10 | 10 |
| Sad/Cry right | 10 | 16 | 16 | 16 |

Prepared landmark positions, directions, counts and water attachment metadata are exported to [correspondence.json](eye-cry-morphing/correspondence.json).

## 3. Interpolation architecture and subdivision

`geometryInterpolator.ts` adds explicit same-side source-defined Cry branches before the existing Sad/Happier branches. `prepareCryEye` exposes the inspected preparation for tests. Exact canonical data or equivalent clones are accepted; edited endpoints, cross-side pairs, Cry/Happier, Cry/Thinking and same-expression pairs are rejected even at progress 0/1. Finite progress clamps; invalid progress fails. Endpoints return the exact caller object, preserving all original commands, resource references, transforms and paint definitions.

The existing sector alignment helper now optionally accepts source landmarks/direction, defaulting to the exact previous Idle policy. Each sector uses the union of normalized arc-distance knots, 64-step Simpson length estimates and 36-step inverse bisection. De Casteljau subdivision preserves the original curve exactly; length estimation chooses correspondence, not a fitted replacement. Source L segments become exact straight cubics for intermediate preparation only.

The existing eight-arc Idle ellipse conversion is unchanged. Its previously measured radial-distance bound is 0.00034601058397731865 logical units; endpoint Idle still returns the actual ellipse. Native spans are checked at five local parameters to verify exact subdivision for every prepared contour.

## 4. Idle → Cry

Body, independent primary outline, exclusion mask and supplementary outline interpolate independently through their semantic preparations. Small/notched highlights move toward their own source Cry positions. Gradient endpoints interpolate; colors/stops remain fixed. The supplementary outline uses localized smoothstep appearance because Idle has no such layer. The body and primary outline never fade.

This branch directly targets Cry; it does not visit an invisible Sad scene or introduce Sad's lower detail.

## 5. Sad → Cry

The approved main body, primary outline and highlights are identical on each corresponding side, so their geometry remains the same shape through exact subdivisions. Inventing an extra body deformation would alter the artwork without a source basis. Cry-right's mask/supplementary rounding differences interpolate through their own aligned source pieces. Water grows geometrically while Sad's distinct lower details shrink. This is not an opacity-only transition: the visible lower silhouette changes as those geometries emerge/retreat.

The original Sad lower subtree scales by `1-p` about its body-edge attachment and uses localized opacity `1-smoothstep(p)`. Its internal paths, use references, mask and matrix/rotation remain unchanged. Only its required referenced lower-circle path is added to the working defs; unrelated Sad resources are not duplicated.

## 6. Water emergence and attachment

Water has no approved hidden Idle/Sad counterpart. Its procedural starting representation is explicitly a collapsed copy of the original water at a lower-body attachment. Uniform scale `p` preserves its silhouette/proportions while it grows. Smoothstep `p*p*(3-2*p)` controls only the water group's local appearance.

The source water contains the selected attachment, and that point is on the body's lower cubic. The left anchor is approximately (65.9167,135.4540917985); the right is (76.7805,135.0871597353). These side-specific points are inherited from the inspected Sad lower-detail attachment policy, independently verified against the actual water polygon.

For Idle/Cry, the attachment tracks the same parameter on the interpolated body. Its corresponding Idle positions are approximately (44.0965471776,162.2254532197) and (86.0477338650,161.6556219262). Sad/Cry has the same source/target body, so the attachment stays fixed. The wrapper matrix is `[p,0,0,p,currentAttachment.x-p*targetAttachment.x,currentAttachment.y-p*targetAttachment.y]`. It maps the water anchor exactly onto the changing body edge at every tested interior sample. At the final endpoint the original Cry object is returned without a wrapper.

Sampled water points stay inside the interpolated native viewport; there is no extra scaling of the whole eye. The selected anchor is inside the original water, so growth begins connected to the eye edge rather than at an arbitrary face position.

## 7. Cry-right white detail

The right-only original white ellipse and its filtered group are wrapped separately with the same attachment/scale/local appearance schedule as the water. Original opacity .96, fillOpacity .8, ellipse radii and blur=15 remain intact. No Sad dark detail is assigned as its correspondence. The filter primitives and native local filter region remain unchanged; transforming the wrapper scales the rendered detail/effect together.

## 8. Gradient, filter and mask resources

Cry's original two inner-shadow primitive arrays remain unchanged: transparent flood, SourceGraphic blend, hard-alpha matrix, dy=4, blur=2, arithmetic composite, alpha-.25 matrix, final blend. No arbitrary primitive coefficient or operator interpolates. The first two filter regions and body-exclusion mask/white rectangle use the existing fixed padded workspace (-16,-16,180,205) during interior frames. This prevents applying a shorter Sad/Cry working rectangle to tall Idle geometry. Exact endpoint regions return unchanged.

The third right-only blur keeps its complete original definition and region (27.9531,80.9978,73.5781,101.097). Sad/Cry gradients remain identical; Idle/Cry interpolates only meaningful gradient endpoints. Definitions remain typed nodes, and the unchanged ProceduralEye renderer rewrites IDs and references with React useId. Tests render multiple pairs simultaneously and verify unique IDs and resolved mask/filter/use/gradient references.

## 9. Layout and clipping

Untouched FACE_LAYER_LAYOUTS values are interpolated independently for x/y/width/height:

| Side | Idle | Sad | Cry |
| --- | --- | --- | --- |
| Left | 115 / 154 / 129 / 171 | 104 / 148 / 142 / 156 | 104 / 148 / 142 / 145 |
| Right | 556 / 154 / 129 / 171 | 554.25 / 148 / 142 / 156 | 554.25 / 148 / 142 / 183 |

Native geometry dimensions match the interpolated layout dimensions. The 800×480 logical face and 1490×960 display canvas remain unchanged; no main-eye transform adds a second scale. Water belongs inside the eye SVG. The taller original right Cry viewport contains its white blur, retaining source clipping behavior.

The separate 81×269 `cryEffect` face-level tear strips are production FaceEffects artwork, not paths in these eye SVGs. They remain unchanged and are not animated by this eye-only preview. A full Cry face/effect transition remains a separate integration task; this report does not claim to animate those external strips.

## 10. Anime.js and development preview

EyeMorphPreview now offers source Idle/Sad. Idle permits Happier, Sad and Cry; Sad permits only Cry. Changing source to Sad selects Cry automatically. Invalid selections are rejected. Existing static comparison still offers all canonical expressions and the separate transition reference.

Play, Reverse, Reset, slider, seven sample buttons, current source/target/status and phase use the selected pair. Anime.js 4.5.0 drives local normalized progress over 1000 ms using inOutSine. There are no Zustand/controller writes. A generation token rejects stale callbacks; cancellation also detaches the previous Anime target object, preventing a stale driver mutation from corrupting a later playback start. Source/target changes cancel and reset, and pending imports read current selection refs. Real installed Anime.js automatic playback is tested through the component's handlers in a Node hook harness; this is distinct from browser verification.

## 11. Visual validation

Four shape sheets and four layout sheets render the actual API/React SVG results. Both eyes are present at 0%, 10%, 25%, 50%, 75%, 90%, 100% in each direction:

| Direction | Shape sheet | Layout sheet | Endpoint RGBA pairs |
| --- | --- | --- | --- |
| Idle → Cry | [PNG](eye-cry-morphing/idle-cry/morph-grid.png) | [PNG](eye-cry-morphing/idle-cry/layout-grid.png) | 12; zero differing pixels |
| Cry → Idle | [PNG](eye-cry-morphing/cry-idle/morph-grid.png) | [PNG](eye-cry-morphing/cry-idle/layout-grid.png) | 12; zero differing pixels |
| Sad → Cry | [PNG](eye-cry-morphing/sad-cry/morph-grid.png) | [PNG](eye-cry-morphing/sad-cry/layout-grid.png) | 12; zero differing pixels |
| Cry → Sad | [PNG](eye-cry-morphing/cry-sad/morph-grid.png) | [PNG](eye-cry-morphing/cry-sad/layout-grid.png) | 12; zero differing pixels |

Opened rendered shape sheets for all four directions, plus forward Idle/Cry, forward Sad/Cry and reverse Cry/Sad layout sheets. The sampled images show progressive contour flattening for Idle/Cry, attached water growth/retreat, continuous primary outlines, independent side slopes, gradual right blur and lower Sad-detail retreat/emergence. No unexpected bulge, broken outline or clipped water was observed at these sampled states. This is a sampled static visual assessment, not proof of all frames or subjective animation approval. Early water is deliberately a small pool near the lower edge; its appearance is stylized, not fluid simulation.

All new endpoints were compared directly against original SVGs at 1×, 1.5× and 2×: **48 comparisons, zero differing RGBA pixels**. Each transition folder contains `endpoint-raster-validation.json`. Existing static verification also retains sixteen complete XML comparisons, 48 expanded raster pairs and six Phase-1 pairs, all zero difference. Existing Happier and Sad endpoint raster checks each retain twelve zero-difference pairs.

Raster environment: existing resvg_py 0.5.0 and Pillow 13.0.0 via the established local asset-tool PYTHONPATH. No packages were installed. Real browser verification was attempted through the browser connector, which returned **“The browser access host is unavailable.”** No browser interaction, browser screenshot, robot-display FPS or latency measurement is claimed.

## 12. Executed checks

Commands ran from frontend on Windows, Node 24.14.1, installed Anime.js 4.5.0, Vite 7.3.7.

| Command | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS; production JS retains prior index-6BEnCzdN.js hash and preview code is absent |
| node scripts/verify-eye-geometry.mjs | PASS, including expanded eye-expression suite and artwork integrity |
| node scripts/verify-eye-morphing.mjs | PASS, including Sad/Cry suites and real automatic playback for all four pairs |
| node scripts/verify-eye-sad-morphing.mjs | PASS, including protected files and original Happier baseline |
| node scripts/verify-eye-cry-morphing.mjs | PASS; 404 forward and 404 reverse samples, four contour families, native subdivisions, attachment/reveal, resources/layout, determinism/rejection, 404 prior-output hashes |
| python scripts/verify-eye-raster.py | PASS; unchanged XML and raster checks |
| python scripts/render-eye-morphing.py | PASS; Happier raster regression |
| python scripts/render-eye-morphing.py --target sad | PASS; Sad raster regression |
| python scripts/render-eye-morphing.py --target cry [--source sad] [--reverse] | PASS for all four combinations |
| node scripts/verify-mouth-geometry.mjs | PASS |
| node scripts/verify-mouth-morphing.mjs | PASS |
| node scripts/verify-mouth-expressions.mjs | PASS |
| node scripts/verify-face-layers.mjs | PASS |
| node scripts/verify-expression-controller.mjs | PASS |
| node scripts/verify-animation-engine.mjs | PASS |
| node scripts/verify-expression-transitions.mjs | PASS |
| node scripts/verify-element-transitions.mjs | PASS |
| git diff --check | PASS; existing LF/CRLF notices |
| Real browser | Unavailable; connector host error above |
| Backend tests / robot display | Not run; outside this unchanged application boundary |

Some existing Vite-based regression scripts emitted a port-24678-already-in-use HMR warning; their assertions completed successfully. No command was skipped because of it. The shell sandbox helper failed during initial inspection; approved escalated shell execution was used thereafter.

The new test checks all actual interpolation results, not a separate implementation. It verifies exact source/target object identity and modified-endpoint rejection; finite closed positively oriented/sample-simple body, outline, mask and supplementary contours; De Casteljau native-span preservation; source-derived water/white/dark detail data; body-edge attachment/viewport containment; fixed filter primitives; gradients; unique IDs; left/right independence; reverse numerical equivalence; and immutable presets/layouts. Existing endpoint/raster tests were not weakened. Only assertions that previously rejected the newly supported Cry pair and the preview selector lookup were updated for the new allowed behavior.

## 13. Changed files and artifacts

Updated:

- `src/geometry/eyes/geometryInterpolator.ts`: explicit Cry branches, reusable source-sector arguments, source-derived Cry preparation and attached detail policies; prior outputs unchanged.
- `src/geometry/eyes/index.ts`: export prepareCryEye.
- `src/components/face/eyes/EyeMorphPreview.tsx`: supported source/target selectors and detached animation target on cancellation.
- `scripts/verify-eye-morphing.mjs`: new pair handler/automatic-playback/cancellation coverage; target selector selected by accessible label.
- `scripts/verify-eye-sad-morphing.mjs`: newly valid Idle/Cry removed from unsupported-pair assertions; all other Sad checks retained.
- `scripts/render-eye-morphing.py`: Cry source/reverse artifact options, preserving existing defaults.
- `tsconfig.tsbuildinfo`: regenerated by checks.

Added:

- `scripts/verify-eye-cry-morphing.mjs`.
- This report.
- `reports/eye-cry-morphing/existing-baseline.json`: pre-edit 404 geometry hashes.
- `reports/eye-cry-morphing/correspondence.json`.
- Four transition folders under `reports/eye-cry-morphing/`, each with samples.json, morph-grid.svg/png, layout-grid.svg/png and endpoint-raster-validation.json.

Existing eye/mouth report artifacts were regenerated by their existing verification scripts. Their original source artwork was not edited. No protocol changes were made.

## 14. Limits and readiness for Thinking

This remains a source-pair-specific development prototype. Geometric emergence uses affine scaling with localized appearance, not physical fluid behavior. Sampled self-intersection/containment tests are numerical checks rather than analytic proofs. Browser rendering, real display appearance, timing and performance remain unverified. Full-face Cry tear strips are outside this eye preview.

Thinking morphing still requires its own left/right audit: its two eyes have different structures and highlight positions. The current explicit branches must continue rejecting that pair until correspondence, missing-detail policies, layout and endpoint/intermediate visual tests are supplied. No Thinking morphing, blinking, gaze, visemes or production migration was implemented.
