# Face Effects Audit & Integration Gap Analysis

Date: 2026-11-02. Scope: inspection and report only. No application source, artwork, geometry, blinking, layouts, canonical state, backend or protocol was changed. Existing working-tree changes predate this audit.

**Finding:** face effects are already integrated into both renderers. A separate phase to implement the same effects again is unnecessary. Remaining work is visual acceptance, a known Cry asset/reference discrepancy, transition review and targeted robustness/verification refinements.

## 1. Existing effect inventory

All five standalone effect SVGs in `public/assets/face-layers/effects/` are mapped and used. Positions below are logical `(x, y, width, height)` on the 800 × 480 artwork; the display canvas remains 1490 × 960. Each instance renders through `FaceEffects → Effect → FaceLayer` as an external SVG `<img>`, with z-index 40.

| Asset / configuration key | Intended expression and instance IDs | Current positions | Artwork / animation / transition |
| --- | --- | --- | --- |
| `blushing.svg` / `blushing` | Happier: `blushLeft`, `blushRight` | Left `(135,271.25,61,36)`; right `(604,271.25,61,36)` | Pink `#FBC8F2` ellipse with three embedded `#FF6DB6` hatch strokes at 0.8 stroke opacity. Static SVG; fades with expression effects/composition. |
| `line-for-blushing.svg` / `blushLine` | Happier: `blushLineLeft`, `blushLineRight` | Left `(114,267.5,103,8)`; right `(583,267.5,103,8)` | Black curved line, stroke width 4, rounded caps. This is an additional under-eye line, not another copy of the pink hatching. Static SVG; fades with expression effects/composition. |
| `cry-effect.svg` / `cryEffect` | Cry: `tearLeft`, `tearRight` | Left `(138,227,81,269)`; right `(581,227,81,269)` | Solid `#76C5FD` irregular vertical strip with rounded termination. Same asset used once per side; no gradient/filter or flowing/particle animation. Fades with expression effects/composition. |
| `shock-effect.svg` / `shockEffect` | Shock: `mark` | `(687,53,77,88)` | One SVG contains all three yellow `#FFCC00` exclamation marks, black width-8 outline with mask. One instance is correct, not three separate renderers. Static; fades with expression effects/composition. |
| `question-mark.svg` / `questionMark` | Thinking: `mark` | `(700,43.25,60,89)` | Red `#FF4646` question mark with black width-8 masked outline. Static; fades with expression effects/composition. |

Visibility is determined exclusively by `FACE_LAYER_COMPOSITIONS[expression].effects`, then the visibility/opacity of its active transition composition. There is no separate effect enable store, intensity-driven effect opacity or independent effect timeline. All SVGs were read: no embedded script, animate or animateTransform element was found. Mask/use references in the two mark assets resolve locally. External image documents isolate their SVG IDs across instances, including repeated tear/blush images and simultaneous source/target scenes.

Other expressive details are already inside eye artwork: Sad lower attachments/outlines, Cry internal water and the right-eye blurred white detail, highlights and gradients. These are not omitted standalone FaceEffects assets. Face base/lines are also separate composition artwork, not expression-specific effects. No unused standalone effect was identified in the configured effect directory.

## 2. Expression-to-effect mapping

| Canonical expression | Active face-level effects | Count |
| --- | --- | ---: |
| Idle | None | 0 |
| Happy | None | 0 |
| Happier | Left/right pink cheeks plus left/right black curved under-eye lines | 4 |
| Sad | None; lower eye details belong to the eye geometry | 0 |
| Cry | Left/right vertical tear strips; internal eye water remains inside each eye | 2 |
| Shock | One three-exclamation-mark SVG | 1 |
| Thinking | One question-mark SVG | 1 |

Happy and Happier are deliberately distinct: Happy has Idle eyes and the larger happy mouth without blush; Happier has its own eyes and four effect instances. Cry water is not rendered a second time by FaceEffects. Thinking keeps its question mark and Shock keeps all three exclamation marks inside its single asset.

The read-only React SSR audit checked exact effect asset counts in both renderer modes for all seven expressions, unique per-expression effect IDs, layout presence and readable asset files. No unrelated canonical endpoint effects, duplicate instance IDs or missing configured SVGs were found. Shared left/right assets are intentional instances at different positions. `mark` is reused only within separate expression compositions; React keys remain local to their lists.

`happier-transition` is an existing static development reference with no effects, not an eighth canonical emotion. Shy is absent from the canonical mapping and is rejected by runtime expression validation. No expression fallback to Idle exists in FaceEffects.

## 3. Current rendering architecture

Relevant inspected sources:

- [FaceEffects](../src/components/face/FaceEffects.tsx), [FaceLayer](../src/components/face/FaceLayer.tsx), [FaceBase](../src/components/face/FaceBase.tsx), [FaceRenderer](../src/components/face/FaceRenderer.tsx).
- [Asset mappings](../src/config/faceLayerAssets.ts), [layouts and order](../src/config/faceLayerLayouts.ts).
- [ExpressionTransitionLayer](../src/components/face/ExpressionTransitionLayer.tsx), [GeometryTransitionLayer](../src/components/face/GeometryTransitionLayer.tsx), [ElementExpressionLayer](../src/components/face/ElementExpressionLayer.tsx).
- [Expression controller](../src/animation/expressionController.ts), [transition coordinator](../src/animation/expressionTransition.ts), [transition strategy](../src/animation/transitionStrategy.ts), [React hook](../src/animation/useExpressionTransition.ts).

The controller runtime-validates expression requests, then updates the existing Zustand expression state. FaceRenderer reads expression and transition duration, or accepts the comparison's local expression props. Effects consume the same composition expression as eyes/mouth. No competing canonical effect/expression store exists.

FaceBase is outside expression transition compositions. At rest, ExpressionTransitionLayer renders Eyes, Mouth and the existing FaceEffects. The asset Idle/Happy element branch also renders FaceEffects with attachable effect refs, but its actual Idle → Happy recipe animates eyes/mouth only; neither expression has effects.

During procedural morphs GeometryTransitionLayer mounts exact source and target endpoint scenes and a separate intermediate overlay. Its overlay contains one source effect group and one target effect group. Endpoint scenes are hidden in the interior; the intermediate overlay is hidden at the exact endpoints. Multiple effect images can therefore exist in the DOM without being simultaneously visible duplicates.

The development [ProductionGeometryComparison](../src/components/face/ProductionGeometryComparison.tsx) offers all seven expressions, reference/asset/procedural comparison, local transition durations, automatic blink and manual blink controls. Its controls use local state and do not request canonical expression changes. Automatic blink starts while the panel is open and visible, unless asset-only view is selected. MorphBlinkPreview remains a separate eye-only diagnostic; it is not a missing full-face effect implementation.

## 4. Effect transition behavior

| Situation | Observed implementation | Assessment |
| --- | --- | --- |
| Procedural geometry transition | At interior progress `p`, source effect group opacity is `1-p`, target effect group opacity is `p`. Coordinator uses the requested duration and linear progress. | Smooth numeric fade-in/out by design; no path morph, effect movement or independent timing curve. Browser visual smoothness remains unverified. |
| Routed morph through Idle | Eye/mouth channels may reach their internal Idle bridge at `p=.5`; effects still crossfade directly between semantic source and target groups over the full duration. | No semantic Idle store change. At the bridge, outgoing/incoming semantic effects can both be visible. This is existing policy, not an unrelated persistent endpoint effect. Artistic acceptance is outstanding. |
| Asset renderer | Idle → Happy uses its existing element recipe; other distinct canonical pairs crossfade complete compositions, including effects. | Effects inherit composition opacity. No effect-specific animation is missing from the code path. |
| Unsupported procedural pair | Current `supportsProductionMorph` accepts every distinct canonical pair; a read-only check confirms all 42 directed pairs select GEOMETRY. Five direct eye correspondences are reused, with aliases/Idle routing for the rest. | The older assumption that some canonical procedural pairs still crossfade is stale. The generic strategy has a CROSSFADE fallback, but no current distinct canonical pair reaches it. |
| Static transition reference / zero duration / reduced motion / no engine | Immediate canonical scene settlement. | Fade is intentionally bypassed; no guarantee of animated appearance in these conditions. |
| Rapid procedural requests with blink channel | Current geometry transition finishes, then only the latest queued request is consumed. | Preserves current geometry/effect progress within that transition, with added response delay. This includes the automatic-blink comparison's default channel. |
| Rapid procedural requests without blink channel | Current morph settles its previous target, then a new transition begins. | Can visibly snap effect opacity to that endpoint; safe cancellation does not mean visually continuous interruption. |
| Interrupted asset crossfade | More-visible endpoint is retained (incoming wins ties), opacity restored to 1, obsolete runs cancelled, newest transition starts. | Bounded to two compositions but can cause an opacity jump; requires visual review. |

The coordinator's generation/pending checks reject stale completion callbacks; the engine owns cancellation. Ref detachment, frame callback cleanup, stopped image-decode callbacks and hook disposal prevent obsolete owners from updating unmounted compositions. Existing transition and element regression suites passed during this audit, including real installed Anime.js tests and cleanup/interruption checks. These do not substitute for all-pair browser effect playback.

No effect continuously animates at rest. The `attachEffect` extension point supports registering effect targets; it does not itself create an effect animation. No new animation is proposed as a prerequisite for integration.

## 5. Layer stacking and clipping

| Layer | Local z-index | Notes |
| --- | ---: | --- |
| Face base | 0 | Stable across expression changes. |
| Face lines window | 10 | Intentionally clips oversized line artwork to the logical face window. |
| Expression composition | 15 | Isolated stacking context above base/lines. During crossfade, incoming composition occurs later in DOM order. |
| Reserved underEyes level | 15 within composition | Available in configuration; none of the current effect instances uses it. |
| Eyes | 20 within composition | Procedural or asset branch. |
| Mouth | 30 within composition | Above eyes if overlapping. |
| Face effects | 40 within composition | All mapped effects; geometry overlay also wraps its two effect groups at z-index 40, target group after source. |

Happier effects render in configuration order: cheeks first, black lines after them. Cry strips deliberately cover the lower eye outline. Their top is y=227, below the original eye highlights (approximately y=225.4 bottom).

Face artwork has `overflow: visible`; only the face-lines window intentionally clips its content. Tear strips reach logical y=496, extending 16 units below the 480-unit face. The centered 1490 × 960 display provides approximately 17.72 logical units of vertical margin on each side, so this extension fits the established canvas. Other mapped effects fit the logical face bounds. Mark masks are part of source SVG styling and are not replaced by eye aperture masks. No unintended static clipping was evident in the reviewed exports; browser/responsive embedding remains unverified.

## 6. Cry effects and blinking compatibility

There are two independent layers:

1. Eye geometry contains its internal water, highlights and supplementary white/blur detail. Canonical and morph-aware blink paths clip eye artwork with the current aperture and hide interiors at full closure.
2. FaceEffects renders two external tear strips at z-index 40. It has no blink subscription and is outside the eye SVG/aperture. Blinking does not remove, duplicate, scale or reposition these strips.

Consequently, face-level Cry tears remain visible during blink, by architecture. During an expression transition their opacity still follows expression progress independently of blink progress. At closure strips may remain in front of the closed eye region; their existing position is fixed, rather than attached to a changing eyelid contour. Whether this junction looks acceptable through partial/closed morph states needs full-face browser/art review. Do not infer that blink water-containment tests validate this external-strip junction.

The later morph-aware blinking report and automatic scheduler follow-up supersede the earlier production integration report's blanket statement that development blinking is disabled. Development comparison supports blinking; release blinking remains gated off and the original asset renderer remains the default. This audit made no blink changes.

## 7. Visual validation and measurements

Browser verification was attempted using computer-use inventory. Result: no available apps/browsers; native pipe and browser access host unavailable. **The live development preview and all expression transitions could not be visually played in a browser during this audit.** Preview source and actual React SSR output were inspected instead. All-transition visual validation is therefore incomplete, not a passing gate.

Existing actual-renderer artifacts were opened and visually inspected:

- [Seven-expression reference / asset / procedural sheet](production-geometry/full-face-comparison.png).
- [Cry original reference](production-geometry/cry-reference.png) and [Cry procedural export](production-geometry/cry-procedural.png), separately at full image size.

These are static exported/rasterized compositions, not browser screenshots. On the seven-row sheet: Idle and Happy correctly lack effects; Happier has both pink cheeks and black lines; Sad's small lower details remain attached to eye artwork; Cry has two strips; Shock shows three exclamation marks; Thinking shows its question mark and asymmetric eyes. No gross extra/missing effect or effect position shift between asset and procedural exports was visible at this inspection scale.

**Actual visible difference:** Cry's original reference has soft vertical tear shading/highlights and strips terminating at the lower face edge. Both composed renderers use flat blue SVG strips with rounded ends extending into the transparent bottom margin. This predates procedural integration and is not evidence that FaceEffects failed to render. Other effects show no obvious gross discrepancy on the sheet; that observation is not a pixel-parity claim.

Previously measured full-face RGBA differences from [raster-validation.json](production-geometry/raster-validation.json), read during this audit, at 1490 × 960:

| Expression | Asset vs procedural differing pixels | Reference vs procedural differing pixels |
| --- | ---: | ---: |
| Idle | 130 | 59,078 |
| Happy | 141 | 59,652 |
| Happier | 80 | 46,434 |
| Sad | 95 | 44,163 |
| Cry | 95 | 145,327 |
| Shock | 189 | 60,611 |
| Thinking | 138 | 52,785 |

These are prior whole-face measurements, not freshly rerun raster tests or effect-only metrics. They include eyes, mouth, base, positioning, antialiasing and effects; no effect-only error attribution is justified. The source code currently renders identical effect assets/layouts in both modes. Prior transition-route sheets explicitly omit effects and cannot prove effect transition appearance. Existing eye-only blink sheets likewise do not establish full-face Cry tear junction quality. No full-face or intermediate pixel parity is claimed.

## 8. Existing gaps and recommended refinements

| Priority / gap | Evidence and consequence | Recommended next action, without implementation in this audit |
| --- | --- | --- |
| Visual acceptance incomplete | Browser unavailable; static endpoints do not demonstrate temporal smoothness, rapid switching or blink/tear attachment. | Review all seven endpoints and all 42 directions in the existing comparison, with blink on/off, immediate/300/1000 ms timing, reduced motion, rapid requests and renderer switching; include robot display and responsive sizes. |
| Cry SVG/reference discrepancy | Flat fill/no gradient in `cry-effect.svg`; visible shading and termination difference in original PNG. | Decide whether current SVG is the approved production source. If exact master fidelity is required, request a separately approved asset correction; do not invent gradients or redesign strips in renderer code. |
| Fixed effects during morph | Whole-group endpoint fades; positions do not follow intermediate eye landmarks. Both Shock/Thinking marks can coexist transiently, as can blush and tears on corresponding transitions. | Obtain acceptance of current crossfade/anchor policy. Refine only specific observed problems in a separately scoped change using existing FaceEffects. |
| Interruption continuity is conditional | Non-blink morph settles its target; asset crossfade restores retained endpoint opacity to 1. | Visually reproduce objectionable jumps before choosing a targeted continuity refinement. Current cancellation is bounded/safe, not necessarily seamless. |
| Missing-image handling is limited | All configured assets currently exist. Decode rejection settles immediately to the requested scene; FaceLayer has no image-error fallback. | Add a future explicit loading/error policy if required. A broken requested asset would remain broken; it is not silently replaced with Idle or another effect. |
| Mapping assumptions are unchecked at the component boundary | FaceEffects uses a non-null assertion for configured effect lookup; layout keys are expected to match. Current mapping/SSR audit passes. | Preserve/add focused config checks for effect IDs, exact counts, positions and references. No generic effect system rewrite is warranted. |
| Effect-specific integration coverage | Existing suites cover static effects and common transition lifecycle, but not measured all-pair full-face effect frames with blinking. | Add focused transition snapshots/browser coverage for effect-only opacity, correct hidden endpoint visibility, Cry closure junction and no visible duplication. Reuse current renderer instead of building another preview pipeline. |
| Stale documentation / status | `docs/IMPLEMENTATION_PLAN.md` is empty; architecture/animation documents remain scaffold-level. Earlier production report and generated verification metadata retain pre-blink statements. FaceRenderer's development blink status still says `manual-validation` with an automatic channel. | Synchronize documentation/status in a separately authorized follow-up. Distinguish historical test results from current capability. |

Intensity does not currently change effects. No task requirement establishes that this is a defect; effect intensity controls, particles, bobbing marks and other new animations should not be added under an integration fix.

## 9. Verification record and scope

Run from `frontend` during this audit:

| Check | Result |
| --- | --- |
| Read-only Vite/React SSR audit, executed inline without adding script files | PASS: seven expressions × two renderer modes; exact effect counts/assets, unique effect IDs, valid layout keys and readable paths. |
| Read-only strategy audit | PASS: 42 distinct directed canonical pairs select procedural GEOMETRY. |
| Read-only SVG inspection/reference checks | PASS: all five effect files inspected; local IDs/references valid, no embedded animations/scripts found. |
| `node scripts/verify-expression-transitions.mjs` | PASS: readiness, crossfade, duplicates, interruption, stale callbacks, reduced motion and cleanup. |
| `node scripts/verify-element-transitions.mjs` | PASS: strategy, attachable effects, actual Anime.js adapter, endpoint markup and crossfade fallback. |
| `git diff --check` | PASS after report creation; existing LF/CRLF notices only. |
| Browser/live preview | UNAVAILABLE; access host/native pipe missing. |
| New raster comparisons, typecheck/build, geometry/blink regression, backend/socket/hardware tests | NOT RUN in this report-only task. Prior raster metrics are explicitly historical. |

The inline audit did not write generated renderer reports or application files. Existing broad production/face-layer verification scripts were inspected rather than rerun because they write artifacts unnecessary for this read-only audit. No dependencies were installed. No performance improvements or hardware results are claimed.

## 10. Is a separate Face Effects Integration phase necessary?

**No, if the phase means connecting the existing blush, tears, exclamation marks and question mark to procedural expression rendering: that integration already exists.** FaceEffects is reused in static endpoints, procedural geometry transitions and asset composition transitions, with explicit canonical mappings and preserved layouts.

A smaller **effects validation and refinement** follow-up is justified after browser access is available: approve the Cry source asset/termination, inspect full-face blink junctions and transition overlap, and address only reproduced issues. Keep the current renderer, assets and canonical state as the foundation. Do not implement a second effect renderer or assume that the absence of continuous effect animation means the effect is unimplemented.
