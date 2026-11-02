# Element-Based Transition Implementation — Idle to Happy

Date: 2026-10-31. Scope: one request-triggered Idle -> Happy prototype. Other transitions retain the existing crossfade fallback. No idle behavior, blinking, gaze tracking, anisotropic squash/stretch, visemes, audio or intensity-based appearance was added.

## 1. Element-based architecture

Inspection confirmed that Idle and Happy share face-base.svg, face-lines.svg, idle-eye-left.svg, idle-eye-right.svg and identical base/line/eye layouts. Their mouths differ: Idle uses idle-mouth.svg (282×96); Happy uses happier-mouth.svg (282×155). Happy has no effect assets. No artwork was invented or edited.

The existing [expressionTransition.ts](../src/animation/expressionTransition.ts) coordinator now selects between three strategies through [transitionStrategy.ts](../src/animation/transitionStrategy.ts). It still owns temporary visual state only; canonical Zustand request state and Expression Controller semantics are unchanged. All animations still belong to the existing Animation Engine. There is no second driver, frame loop or lifecycle manager.

[FaceRenderer.tsx](../src/components/face/FaceRenderer.tsx) keeps FaceBase mounted once outside the changing foreground. All eight configured compositions share these same base/line assets and coordinates. Static Idle/Happy and their element transition use the same [ElementExpressionLayer.tsx](../src/components/face/ElementExpressionLayer.tsx) component, retaining the eye nodes through the transition. It renders one eye pair and only overlaps mouths whose asset IDs differ. Once settled, only the Happy mouth remains.

Crossfade foreground groups continue to use ExpressionTransitionLayer and the existing opacity implementation. Because the base/lines are identical, they are now held steady for fallback transitions too rather than duplicated and faded. Other expressions' approved resting artwork/layout is unchanged; this deliberately changes the base's transient opacity behavior to satisfy the shared-base rule.

## 2. DOM target registration

FaceLayer accepts optional motion-ref/role/initial-opacity props. Without a motion ref, it preserves the existing positioned img rendering. With a motion ref, the same percentage layout positions a div around the unchanged SVG img; only that wrapper's transform/opacity is animated. Its transform origin is its own center, rather than the full canvas center.

Eyes exposes independent optional left/right refs. Mouth exposes an optional motion ref. FaceEffects exposes an optional callback per effect ID, using a keyed component and stable callback ref for each effect. Happy has no effects, so no effect node or effect animation is mounted for the prototype.

| Role | Prototype ownership |
| --- | --- |
| left-eye | One retained positioned motion wrapper around the shared left-eye SVG. |
| right-eye | One retained positioned motion wrapper around the shared right-eye SVG. |
| mouth-outgoing | Existing Idle mouth during replacement, removed after completion. |
| mouth | Incoming Happy mouth; retained as the settled mouth. |
| effect:ID | Optional independently addressable effect wrappers; none for Happy. |

The hook caches refs that attach before coordinator/driver readiness, then registers them with that renderer's engine. Ref detachment unregisters the matching role. Engine names are internal registry keys, not CSS selectors. No global document queries or dynamically constructed CSS selectors were added.

The logical 800×480 coordinate system and responsive 1490×960 display canvas are preserved. Foreground groups sit above the shared line layer; their existing eye/mouth/effect order remains intact. Cry strip overflow, image aspect ratios and line clipping remain unchanged at rest.

## 3. Idle-to-Happy sequence

1. The existing controller accepts Happy and stores the supplied duration.
2. The coordinator selects ELEMENT_BASED only when the retained outgoing endpoint is Idle and the requested endpoint is Happy.
3. The renderer retains the shared base, line layer and eye pair. It keeps the Idle mouth at its approved location and mounts the Happy mouth at its own approved location, initially transparent.
4. Incoming image preparation waits for decode promises, as in the crossfade implementation. No element animation begins before required refs and preparation are ready.
5. Four engine-managed animations run: left-eye reaction, right-eye reaction, outgoing mouth fade, incoming mouth scale/fade entrance. No whole-composition opacity animation runs for this pair.
6. After all four completions, the coordinator restores baseline transforms, removes the Idle mouth and retains the approved Happy composition.

There is no continuous motion. The optional vertical motion was omitted; the prototype uses uniform scale and opacity only, with no rotation or independent X/Y scale.

## 4. Animation timing configuration

[presets/idleToHappy.ts](../src/animation/presets/idleToHappy.ts) contains the editable preset constants and the duration-dependent recipe. Timing is expressed as fractions of the existing accepted transitionMs, not new protocol fields.

| Element | Motion | Delay | Active duration | At manual 300 ms |
| --- | --- | --- | --- | --- |
| Left eye | Uniform scale 1 -> 1.025 -> 1, inOutSine | 0 | 100% | 0–300 ms |
| Right eye | Uniform scale 1 -> 1.022 -> 1, inOutSine | 6% | 94% | 18–300 ms |
| Idle mouth | Opacity 1 -> 0, outQuad | 0 | 40% | 0–120 ms |
| Happy mouth | Uniform scale 0.97 -> 1 and opacity 0 -> 1, outQuad | 12% | 88% | 36–300 ms |

All animations finish within the accepted duration, measured after preparation. Manual requests remain 300 ms by default; WebSocket-supplied durations follow the same scaling. Intensity is not read by the preset. No undocumented duration maximum was introduced.

These values define a restrained prototype, not a claim of browser-reviewed perceptual quality. The right-eye offset is 18 ms at the default duration, with a closely matched scale range.

## 5. Anime.js implementation

The installed package remains Anime.js 4.5.0. Its installed type definitions were inspected for scale/property array syntax, delay/duration and the exact easing names inOutSine and outQuad. The production adapter still invokes the v4 named animate function. The coordinator passes the recipe to engine.start, with existing callback guards and mount-owned driver loading.

The uniform scale arrays return eyes to 1. Mouth scale ends at 1 and incoming opacity at 1. No SVG paths, approved positions or dimensions are animated. No v3 syntax or new package is used.

The new verifier exercises the actual installed adapter with object targets/accessors and manual seek, including intermediate eye/mouth scale and final identity values. This validates the v4 recipe/API, not native DOM rasterization or visual timing on the robot display.

## 6. Transition strategy selection

| Condition | Strategy |
| --- | --- |
| Duration zero, reduced motion, or preview entry/exit | IMMEDIATE |
| Idle -> Happy with nonzero duration and driver ready | ELEMENT_BASED |
| Other supported expression pairs | CROSSFADE |
| Driver not ready | Existing immediate rendering fallback |

Selection uses the coordinator's temporary retained endpoint and the newest canonical request; it does not add a second semantic expression store. Semantic duplicate handling remains in the Expression Controller. Intensity-only changes produce no appearance change and do not restart motion to an unchanged visual target.

happier-transition remains a static preview-only asset, never a production expression or an automatically inserted animation step. shy remains unsupported. Happy -> Idle is deliberately still a fallback crossfade; no other element preset was implemented.

## 7. Interruption and lifecycle handling

Element work uses the same generation and pending-transition identity checks as existing transitions. Obsolete completions cannot settle a newer request.

A request that interrupts Idle -> Happy unregisters/reverts the element runs, explicitly clears their wrapper transforms, and establishes the approved Happy endpoint before choosing the next strategy. For example, Idle -> Happy -> Cry resets the element pose and then crossfades Happy -> Cry. This bounded policy may visibly snap to the Happy endpoint at interruption; it does not attempt continuous interpolation from an arbitrary partially scaled/mixed pose.

Zero-duration and reduced-motion changes cancel/reset and settle immediately. Repeated visual requests for Happy do not create more runs. Component unmount releases all role registrations and the existing engine disposes its owned resources. Repeated disposal and stale callbacks remain harmless. Effects remain independent from mouth/eye roles.

Completed/interrupted element instances are released through the engine's established unregister/revert mechanism, then mounted static targets may be registered again with no old animation history. The prototype does not accumulate motion handles across repeated runs.

## 8. Final transform and composition restoration

On successful completion and interruption, the coordinator unregisters the relevant engine targets, allowing Anime.js to revert owned mutations. It then clears wrapper transform strings to the known baseline. Incoming mouth opacity is explicitly normalized to 1 and outgoing mouth opacity to 0 before the outgoing node is removed. This avoids retaining the incoming mouth's initial transparent seed after reversion.

Happy still uses the approved idle-style eyes at left (115,154,129,171), right (556,154,129,171), and happier mouth at (259.5,287.75,282,155), with no effects. Tests confirm those logical mouth coordinates numerically, image identities, one base/line/eye set and neutral final transforms. This proves unchanged configuration and deterministic endpoint behavior; pixel-identical target-browser output was not visually tested.

## 9. Verification results

Executed on Windows with Node.js 24.14.1, TypeScript 5.9.3, Vite 7.3.7 and installed Anime.js 4.5.0. No dependencies were installed. Commands ran from frontend using native child-process execution.

| Command | Actual result |
| --- | --- |
| npm run typecheck | PASS, exit 0. |
| npm run build | PASS, exit 0; 104 modules transformed. |
| node scripts/verify-face-layers.mjs | PASS, exit 0; all 8 compositions, 27 assets, ratios/bounds/order, SSR and fixtures. |
| node scripts/verify-expression-controller.mjs | PASS, exit 0; controller/parser/socket/preview regressions. |
| node scripts/verify-animation-engine.mjs | PASS, exit 0; existing ownership/cancellation/disposal/adapter/hook checks. |
| node scripts/verify-expression-transitions.mjs | PASS, exit 0; existing crossfade, reduced-motion, immediate, interruption and cleanup behavior. |
| node scripts/verify-element-transitions.mjs | PASS, exit 0; new element prototype checks. |
| git diff --check | PASS, exit 0; Git emitted existing LF/CRLF normalization warnings. |
| Real browser visual / live backend verification | NOT RUN. |

The new script covers strategy selection, distinct eye/mouth/effect target registration, timing budgets and offsets, recipe restraints, accepted durations, image-preparation gating, completion of all independent targets, exact transform reset, repeated requests, rapid interruption, immediate/reduced-motion selection, engine teardown and stale callbacks. Twenty interrupted prototype cycles verify obsolete handles are reverted. It also tests the actual Anime.js adapter, shared-base/eye markup, both mouth images only during replacement, all seven static endpoints and fallback crossfades.

The existing crossfade verifier now uses Idle -> Happier for the ordinary crossfade-specific assertions because Idle -> Happy intentionally selects a different strategy. It still covers all seven endpoints and rapid fallback switching. Its paired markup includes one shared FaceBase rather than requiring duplicate bases. Coverage was adapted to the new contract rather than disabling the fallback checks.

During test development, an exact CSS string assertion failed due to floating-point serialization. It was replaced with a numerical logical-coordinate check; the final complete suite above passed. Fake-driver tests and SSR do not prove real browser layout timing or native CSS transform/rasterization behavior.

## 10. Browser visual testing limitations and review procedure

Browser visual tests were not executed. Review the prototype on the target browser/display before treating its motion as visually approved:

1. Start the existing frontend with npm run dev. In layers-only or comparison mode, wait for initial assets/driver readiness, settle on Idle, then click Happy. Confirm separate small eye reactions and a slightly delayed mouth entrance, without any base or line fade.
2. In Elements, confirm the base and line nodes remain mounted once, one node per eye persists, and only the Idle/Happy mouths overlap. At rest, only the Happy mouth remains and all motion wrappers have no residual transform.
3. Compare the final Happy endpoint with the existing original PNG reference. Check native eye highlights, mouth size/location, edge rendering and responsive alignment at the target DPR.
4. Repeat Idle -> Happy -> Cry and Idle -> Happy -> Shock rapidly. Confirm transform reset, documented endpoint settlement on interruption, latest target visibility and no persistent ghost mouths or eye scaling.
5. Test zero duration and prefers-reduced-motion: reduce, including changing the preference during motion. Both should settle immediately. Switch to reference-only during the preset, then return, checking cleanup and current state.
6. Review all other expressions, their crossfades, cry tear order/overflow and happier-transition preview. The shared base is intentionally stable throughout fallback fades.

For a slower local development inspection, use the existing controller from the Vite browser console:

~~~js
const { requestExpression } = await import('/src/animation/expressionController.ts');
requestExpression({ emotion: 'idle', intensity: 0.5, transitionMs: 0, source: 'manual' });
requestExpression({ emotion: 'happy', intensity: 0.5, transitionMs: 1200, source: 'manual' });
~~~

This adds no production global control interface. Record browser/device/DPR and observations; no FPS or latency measurement is claimed here.

## 11. Modified files

| File | Change |
| --- | --- |
| src/animation/presets/idleToHappy.ts | New editable per-element timing and v4 recipe. |
| src/animation/transitionStrategy.ts | New small strategy selector. |
| src/animation/expressionTransition.ts | Existing coordinator extended with role refs, element execution, reset and interruption handling. |
| src/animation/useExpressionTransition.ts | Caches/binds role refs through the existing mounted coordinator. |
| src/components/face/ElementExpressionLayer.tsx | New shared-eye, dual-mouth prototype composition. |
| src/components/face/FaceRenderer.tsx | Keeps FaceBase once and selects the appropriate rendering strategy. |
| src/components/face/ExpressionTransitionLayer.tsx | Foreground composition only; shared FaceBase moved to parent. |
| src/components/face/FaceLayer.tsx | Optional positioned motion wrapper around unchanged image. |
| src/components/face/Eyes.tsx | Optional independent eye refs. |
| src/components/face/Mouth.tsx | Optional mouth ref/role/initial opacity. |
| src/components/face/FaceEffects.tsx | Optional stable per-effect ref binding. |
| src/style.css | Shared foreground stacking and motion-image sizing/origin rules. |
| src/App.tsx | Development copy describes the prototype and fallback accurately. |
| scripts/verify-element-transitions.mjs | New focused verification. |
| scripts/verify-expression-transitions.mjs | Adapted crossfade regression cases and shared-base expectation. |
| reports/ELEMENT_BASED_TRANSITION_IMPLEMENTATION.md | This report. |
| tsconfig.tsbuildinfo | Generated TypeScript metadata from required checks. |

Production dist output was regenerated. The static verifier regenerated runtime-config.json without content changes. Task-baseline hashes distinguish these edits from pre-existing working-tree changes. Core animationEngine.ts, useAnimationEngine.ts, FaceBase.tsx, approved asset/layout configuration, source SVG/PNG/WebP artwork, controller/store/parser/transport, dependency manifests/lockfile, Python backend and shared protocol remain unchanged.

## 12. Remaining limitations

Only Idle -> Happy has element motion. Prototype scale/timing and interruption appearance still need browser visual approval. Interruption snaps to an approved endpoint before fallback; no pose-continuous blend system was introduced. Image decoding may delay animation start, and a request before driver readiness uses immediate fallback.

Happy has no effect artwork; the reusable effect ref path is prepared/tested without creating an effect or another preset. All other expression endpoints retain their approved artwork, with shared base/lines now steady during crossfades. No further expression presets, idle animation, blinking or viseme work was started. The next step is the browser review above.
