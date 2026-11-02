# Expression Transition Implementation

Date: 2026-10-31. Scope: opacity crossfades between approved SVG layer compositions. No blinking, gaze, squash/stretch, idle animation, visemes, intensity-based visuals or audio synchronization was added.

## 1. Transition architecture

The old FaceRenderer rendered only one set of base/eyes/mouth/effects. It could not retain an outgoing expression. The implementation adds one small positioned wrapper per temporary composition, with at most two present at once.

[FaceRenderer.tsx](../src/components/face/FaceRenderer.tsx) still reads the canonical expression and preview override, and now also reads the accepted transitionMs. [useExpressionTransition.ts](../src/animation/useExpressionTransition.ts) owns coarse local rendering state and browser preference integration. [expressionTransition.ts](../src/animation/expressionTransition.ts) coordinates visible composition IDs, incoming/outgoing selection, preparation, completion and interruption. This state describes temporary rendering; Zustand remains the single accepted expression/request state.

~~~text
Existing manual/WebSocket request -> Expression Controller -> canonical Zustand state
  -> FaceRenderer selects expression + accepted duration
  -> local composition coordinator publishes one or two keyed compositions
  -> mounted wrapper refs register with the existing Animation Engine
  -> engine animates opacity without per-frame React/Zustand writes
  -> both completions remove the outgoing composition
~~~

No second animation driver, scheduler or animation instance manager was created. The coordinator never creates Anime.js handles: all animations go through the existing engine.

## 2. Crossfade implementation

[ExpressionTransitionLayer.tsx](../src/components/face/ExpressionTransitionLayer.tsx) renders the existing FaceBase, Eyes, Mouth and FaceEffects components for an explicit expression. It supplies a stable wrapper ref and initial opacity. Existing face components, assets, compositions and measured layouts are unchanged.

The new expression-composition CSS rule uses absolute positioning with inset 0 inside the existing face-artwork box. Both compositions share its logical 800×480 coordinate system, responsive 800:480 artwork ratio and centered 1490:960 display canvas. Each wrapper isolates its child stacking order. No background, clipping mask or transform was added. Native SVG ratios, line clipping and intentional cry-tear overflow remain intact.

For an ordinary A -> B request, A stays at opacity 1 while B mounts at opacity 0. The wrapper waits for incoming images' decode promises before starting. It uses scoped getElementsByTagName on its own wrapper for preparation; targets themselves are registered by refs, not selectors. After readiness, the engine starts two linear animations: outgoing [1, 0] and incoming [0, 1], both with the accepted duration. Both completion callbacks must finish before A is removed. B retains its DOM node and final opacity 1.

Only opacity is animated. React owns initial opacity and composition mounting; the engine owns frame updates. Coordinator publications occur at request/settlement boundaries, never per frame. FullImageFaceRenderer remains an immediate original-PNG reference rather than an animated renderer.

## 3. Animation Engine integration

The existing animationEngine.ts and production Anime.js adapter are unchanged. The installed 4.5.0 named animate API, duration, opacity arrays and ease: linear are used through engine.start. Existing cancellation guards, ownership and revert semantics are preserved.

The only foundation extension is an optional readiness callback in [useAnimationEngine.ts](../src/animation/useAnimationEngine.ts). Once its mount-owned asynchronous driver load completes, the callback receives that renderer's engine and may return a consumer cleanup function. The latest callback is held in a ref; expression rerenders do not recreate the engine. Cleanup invokes the consumer once before disposing the engine, including repeated-cleanup protection.

If a request arrives before the driver is available, rendering switches immediately. Readiness does not replay old requests. No browser APIs or animation work are started at module evaluation or during SSR.

## 4. Target ownership

Each mounted wrapper gets a distinct expression-composition-ID target in its renderer's existing engine. The stable React ref binds/unbinds that ID to the actual element. IDs are local to a renderer/coordinator lifetime; unrelated engines remain isolated.

Ref detachment unregisters the matching target. At each new crossfade boundary, the coordinator releases previous registrations for retained wrappers, seeds opacity and registers them again before starting work. This uses the established unregister/revert behavior and bounds retained engine undo history to the current compositions rather than extending history indefinitely on a repeatedly retained outgoing node. The root target is not animated.

The engine is responsible for all underlying instances and cancellation. The coordinator keeps only temporary composition records and target unregister closures. No global document queries or dynamically constructed target selectors are used. No layout positions or dimensions are passed to Anime.js.

## 5. Interruption and rapid switching

A newer visual request cancels both existing opacity runs through engine.cancel before choosing a replacement. A generation/pending-transition identity guard prevents stale completion callbacks from settling an obsolete target. Existing engine callback guards provide another layer of protection.

To keep a strict two-composition bound, interruption retains the currently more opaque endpoint; the incoming endpoint wins a tie. It becomes fully opaque before replacement images decode, and a fresh crossfade then runs toward the newest requested expression. If the newest expression is already that dominant endpoint, it settles directly. Obsolete composition refs and targets are released when React removes them.

This is a coherent bounded interruption policy, **not continuous interpolation of an arbitrary partially blended image**. Collapsing to the dominant endpoint can produce a brief visible snap. Normal uninterrupted transitions are smooth opacity interpolation; target-browser approval of interruption appearance remains outstanding. No raster snapshots, nested blend history or extra composition queue was introduced.

Intensity-only requests do not add a visual effect or restart a fade to the same expression. Production semantic duplicates remain governed by the unchanged controller: identical emotion/intensity does not notify state, replace accepted metadata or restart the transition merely because duration/ID differs.

## 6. Zero duration and preparation fallbacks

transitionMs comes directly from the accepted state: manual requests retain the controller's 300 ms default and WebSocket requests retain their supplied duration. Duration measures the opacity animation after preparation; image decoding can add time before the fade starts.

Zero duration immediately cancels active work and selects one fully opaque latest composition without creating a new animation. A zero-duration request with the same emotion/intensity as the current canonical request is still a semantic duplicate and is ignored by the controller, as before. To issue a distinct same-emotion request during a test, its intensity must change; intensity still has no visual mapping.

A decoding failure uses the same immediate latest-target fallback rather than waiting indefinitely or silently resetting to idle. It cannot repair a missing image; a failed asset may still be visibly incomplete. If image.decode is unavailable, preparation proceeds without an explicit decode wait. Engine-start failure logs an error and falls back to the latest composition immediately.

## 7. Reduced motion and preview behavior

The mounted transition hook observes prefers-reduced-motion: reduce with matchMedia. When enabled initially, expression changes use the immediate path. Enabling it during a crossfade cancels and settles the current requested expression. Disabling it permits subsequent requests to animate; it does not replay earlier requests. The listener is removed on unmount.

Entering and exiting happier-transition preview both use an immediate static selection. The preview asset is never inserted as an automatic intermediate and remains outside the production allowlist. Preview does not write canonical state. A valid live command still exits preview through the existing App/controller path, including valid semantic duplicates. shy remains unsupported.

## 8. Verification results

Executed on Windows using Node.js 24.14.1, installed TypeScript 5.9.3, Vite 7.3.7 and Anime.js 4.5.0. No packages were installed. Commands ran from frontend through native child-process execution.

| Command | Result |
| --- | --- |
| npm run typecheck | PASS, exit 0. |
| npm run build | PASS, exit 0; 101 modules transformed. |
| node scripts/verify-face-layers.mjs | PASS, exit 0; all 8 static compositions and 27 SVGs, bounds/ratios/order, SSR switching and protocol fixtures. |
| node scripts/verify-expression-controller.mjs | PASS, exit 0; unchanged request/parser/socket/preview semantics. |
| node scripts/verify-animation-engine.mjs | PASS, exit 0; existing lifecycle tests plus readiness-consumer cleanup ordering/idempotence. |
| node scripts/verify-expression-transitions.mjs | PASS, exit 0; new transition tests. |
| git diff --check | PASS, exit 0; Git emitted working-tree LF/CRLF normalization warnings. |
| Real browser visual / live backend tests | NOT RUN. |

The new deterministic verifier covers initial idle, immediate/no-driver switching, incoming decode readiness/failure, paired composition SSR markup, crossfade start/progress/completion, accepted durations, zero-duration interruption, rapid switching, dominant selection, stale completions, duplicate controller notifications, all seven expressions, preview isolation, reduced motion and unmount cleanup. Fifty rapid switches assert at most two retained compositions and at most two non-reverted test handles. Progress sampling does not publish React state or mutate Zustand.

A real installed Anime.js adapter test uses JS opacity accessors and manual seek: at 150 ms of a 300 ms transition both opacities are 0.5; at completion only the incoming composition remains at 1. These are deterministic object-target/API checks, not browser visual tests. React adapter tests execute the actual hook with shallow ref/state/effect primitives and fake matchMedia. Existing SSR checks separately prove approved static endpoint output. Real React DOM timing, native SVG decode/rasterization, monitor presentation and browser smoothness remain unverified.

## 9. Browser verification procedure and limitations

Run the existing frontend with npm run dev from frontend and open http://127.0.0.1:5173 in the target browser. Allow initial assets and the lazy animation driver to load. This task did not execute the following procedure:

1. Confirm initial idle, then click each of the seven expression buttons. Verify approximately 300 ms opacity blending and exact approved resting composition afterward. The original PNG reference should switch immediately while the layered panel animates.
2. Check equal-sized comparison, layers-only and original-image-only modes at narrow and wide widths. Confirm eye/mouth/mark alignment, line clipping, cry tear ordering and overflow remain correct. Returning from reference-only should show the current target without replaying missed transitions.
3. Use browser DevTools Elements to observe the layered face: one expression-composition at rest, two during a fade, one after completion. No obsolete composition should remain after repeated rapid clicks.
4. Rapidly select idle -> happy -> cry and happy -> sad -> shock. Confirm latest selection wins, no old completion restores an older face, and no persistent ghost layer remains. Specifically review whether the documented dominant-endpoint interruption snap is acceptable.
5. In Chromium/Brave DevTools Rendering, emulate prefers-reduced-motion: reduce. Expression changes should become immediate. Toggle it on during a longer fade and confirm immediate settlement. Turn it off and verify subsequent fades resume.
6. Exercise the static happier-transition preview, then a normal expression. Both preview changes should be immediate and the canonical expression should remain unchanged on entering preview. Keep shy absent.
7. Start a longer fade, then switch to original-image-only to unmount FaceRenderer. Confirm no console errors or leftover work; returning to layers should show the latest canonical expression. Repeat with React StrictMode in development.
8. Disable browser cache and switch to an expression whose SVGs have not decoded. The outgoing face should stay fully visible during preparation, then fade. Test image-load failure separately if desired; the immediate failure fallback does not repair missing files.

For deterministic custom-duration requests in the Vite development browser console, import the existing controller locally:

~~~js
const { requestExpression } = await import('/src/animation/expressionController.ts');
requestExpression({ emotion: 'happy', intensity: 0.5, transitionMs: 1500, source: 'manual' });
// During that fade, use a distinct semantic request for an immediate switch:
requestExpression({ emotion: 'cry', intensity: 0.5, transitionMs: 0, source: 'manual' });
~~~

This uses trusted local frontend code and adds no production global command interface. To verify live routing, use the already-supported local backend with VITE_WS_ENABLED=true and confirm supplied durations/preview exit in that existing integration. No backend modification is needed or was performed. Record browser/device/DPR and observations; do not infer measured FPS/latency from these checks.

## 10. Modified files

| File | Change |
| --- | --- |
| src/animation/expressionTransition.ts | New bounded visual coordinator and engine-backed opacity transition requests. |
| src/animation/useExpressionTransition.ts | New coarse React visual state, ref integration and reduced-motion observation. |
| src/components/face/ExpressionTransitionLayer.tsx | New explicit composition wrapper, stable ref and image decoding preparation. |
| src/components/face/FaceRenderer.tsx | Reads accepted duration and renders the coordinator's keyed compositions. |
| src/animation/useAnimationEngine.ts | Optional readiness consumer/cleanup callback; engine ownership remains unchanged. |
| src/style.css | One absolute, isolated, transparent composition wrapper rule. |
| src/App.tsx | Corrected development UI text to describe crossfades rather than claim animation is absent. |
| scripts/verify-expression-transitions.mjs | New transition verification script. |
| scripts/verify-animation-engine.mjs | Readiness consumer teardown regression. |
| reports/EXPRESSION_TRANSITION_IMPLEMENTATION.md | This report. |
| tsconfig.tsbuildinfo | Generated metadata from required TypeScript checks. |

Production dist output was regenerated by the build. The existing layer verifier regenerated runtime-config.json without content changes. Task-baseline hash verification is used to distinguish these changes from pre-existing working-tree edits. FullImageFaceRenderer, child face components, measured layouts, composition mappings, source artwork, dependency manifests/lockfile, core animationEngine.ts, Expression Controller, canonical Zustand, parser/transport, Python backend and shared protocol were not modified.

## 11. Remaining limitations

Browser visual approval is outstanding. Bounded interruptions can snap to a dominant endpoint. Native alpha compositing of transparent full compositions may change coverage/brightness during a blend; approved endpoints are unchanged. Image preparation can delay fade start; a command before driver readiness settles immediately. Missing artwork cannot be repaired by animation fallback.

Only complete-expression opacity is animated. There is no visual intensity mapping, blink, gaze, idle, mouth/viseme or audio behavior. No performance target or latency measurement is claimed. The next step is the browser procedure above and review of interruption appearance; no idle or viseme implementation was started.
