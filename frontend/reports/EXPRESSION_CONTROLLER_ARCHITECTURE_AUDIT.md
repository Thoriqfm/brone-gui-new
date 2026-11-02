# Expression Controller Architecture Audit

Date: 2026-10-31. Scope: frontend architecture inspection only. Existing behavior and recommendations are explicitly separated below. The only deliverable changed by this audit is this report; no application, backend, protocol, dependency, or artwork changes are proposed as part of this task.

**Readiness verdict: ready to begin a small Expression Controller and Animation Engine implementation, but not ready to attach animations directly to the present state/renderer wiring.** The approved static compositions provide usable endpoints. Request ownership, renderer target registration, transition semantics, cancellation, and runtime validation need explicit contracts first. There is no implemented animation subsystem to extend.

The user's current approval of visual composition is accepted. This audit does not reopen artwork approval or equate approved composition with proven animation behavior or target-device performance.

## 1. Current architecture overview

Existing flow:

~~~text
App expression buttons ----------------------> Zustand setEmotion
                                                    |
FastAPI SET_EXPRESSION -> WebSocket -> JSON.parse -> parser
                                                    |
                                                    v
                                      Zustand emotion + intensity
                                                    |
                        +---------------------------+-------------------+
                        v                                               v
                 FaceRenderer                                  FullImageFaceRenderer
                        |                                               |
          FaceBase / Eyes / Mouth / FaceEffects                  Original master PNG
                        |
          composition assets + measured layouts -> FaceLayer <img>

App local transition boolean -> overrides BOTH renderers with happier-transition
~~~

Source: [App.tsx:10–19, 31–42, 57–65](../src/App.tsx), [websocketClient.ts:13–24](../src/services/websocketClient.ts), [faceStore.ts:3–16](../src/stores/faceStore.ts), [FaceRenderer.tsx:7–17](../src/components/face/FaceRenderer.tsx).

There is no controller between command reception and the store. React immediately selects new assets and layouts when emotion changes. A file named controller does not currently provide a controller.

### Documentation compared with implementation

| Document | Actual code comparison |
| --- | --- |
| [AGENTS.md](../../AGENTS.md), Mission | Its placeholder-artwork description is stale relative to the current supplied layer composition and this task's visual approval. Its separation, validation, and no-per-frame-store rules remain applicable. |
| [ARCHITECTURE.md](../../docs/ARCHITECTURE.md):3 | React/Python/WebSocket boundary matches frontend integration. Separate emotion/viseme controllers remain a plan, not implemented behavior. |
| [TECH_STACK.md](../../docs/TECH_STACK.md):3 | React, TypeScript, Vite, Zustand and Anime.js are declared. Anime.js is installed but unused. Linux Brave kiosk readiness was not verified here. |
| [PROTOCOL.md](../../docs/PROTOCOL.md):3–5 | Seven expression names match the parser and shared schema. Intensity and duration exist on the wire; intensity is only stored and duration is discarded. happier-transition is correctly outside the protocol. |
| [ANIMATION_SPEC.md](../../docs/ANIMATION_SPEC.md):3 | Only a placeholder-era sentence exists. It supplies no current motion, intensity, interrupt, blink, or viseme mapping specification. Current renderers use supplied SVG images. |
| [IMPLEMENTATION_PLAN.md](../../docs/IMPLEMENTATION_PLAN.md) | Empty at inspection. No milestone or animation acceptance criteria can be inferred from it. |
| [BENCHMARK_PLAN.md](../../docs/BENCHMARK_PLAN.md):3 | Lists future scenarios, not measurements. [performanceMonitor.ts:1–2](../src/benchmark/performanceMonitor.ts) is also a placeholder. |
| [RESEARCH_BASELINE.md](../../docs/RESEARCH_BASELINE.md):3 | Describes inspirations, not evidence that current runtime performance or architecture has been validated. |

The more detailed [composition validation report](face-decomposition/EXPRESSION_VALIDATION.md), especially lines 244–286, documents asset completeness and historical static checks. Its historical request for visual approval is superseded by the user's approval in this task. Historical test passes are not rerun results from this audit. README.md:26 also describes automatic WebSocket cycling without noting the current frontend opt-in gate.

## 2. Existing implementation inventory

Locations below refer to source line numbers inspected for this audit.

| Area / source | Existing functionality | Missing or limited |
| --- | --- | --- |
| [FaceRenderer.tsx:7–17](../src/components/face/FaceRenderer.tsx) | Selects store emotion, applies preview override, composes base/eyes/mouth/effects. | No engine, refs, transition lifecycle, intensity, or speaking composition. |
| [FullImageFaceRenderer.tsx:4–12](../src/components/face/FullImageFaceRenderer.tsx) | Original PNG reference selected from emotion or preview. | Static reference, not the optimized WebP map or a motion renderer. |
| [FaceBase.tsx:5–12](../src/components/face/FaceBase.tsx) | Base image plus intentionally clipped oversized line layer. | No motion interface. Preserve its clipping and approved dimensions. |
| [Eyes.tsx:5–10](../src/components/face/Eyes.tsx) | Left/right image and layout selection. | No blink/gaze targets, timing, or controller. |
| [Mouth.tsx:5–9](../src/components/face/Mouth.tsx) | One mouth image selected solely by expression. | No independent viseme selection or mouth ownership policy. |
| [FaceEffects.tsx:5–11](../src/components/face/FaceEffects.tsx) | Maps expression effect IDs to positioned, ordered images. | Effect nodes can appear/disappear on expression changes; no retained outgoing effects. |
| [FaceLayer.tsx:4–27](../src/components/face/FaceLayer.tsx) | External SVG img, percentage layout from 800×480 coordinates, asset-based data-layer attribute. | No role refs or animation wrapper; data-layer is not a unique instance identifier. |
| [faceLayerAssets.ts:6–77](../src/config/faceLayerAssets.ts) | Typed metadata for 27 SVGs; seven protocol expressions plus one static preview composition. | No motion presets, intensity mapping, visemes, preload/decode lifecycle, or runtime guard. |
| [faceLayerLayouts.ts:3–95](../src/config/faceLayerLayouts.ts) | Measured endpoint coordinates, dimensions, and z-order. | Layout is not an animation specification. Effects use an unrestricted string-keyed record. |
| [expressionAssets.ts:5–15](../src/components/face/expressionAssets.ts) | Typed seven-expression production WebP map retained. | Not imported by current application renderers; verification script imports it. |
| [faceStore.ts:3–16](../src/stores/faceStore.ts) | emotion, intensity, connected, and two setters. | No transition request, status, runtime validation, speaking state, or deduplication. |
| [websocketClient.ts:3–42](../src/services/websocketClient.ts) | Loopback default, parsing, direct store updates, 1500 ms reconnect, cleanup closure. | Drops duration and request ID; module-global lifecycle can admit stale socket callbacks. |
| [faceMessages.ts:1–49](../src/schemas/faceMessages.ts) | Emotion allowlist, message types, runtime parser for SET_EXPRESSION and frontend-only RESET_FACE. | Does not fully enforce shared schema; details in section 6. |
| [App.tsx:8–19, 28–65](../src/App.tsx) | Manual expression preview, comparison views, socket opt-in, connection status. | Preview state can mask incoming expressions; comparison remains a development UI. |

Relevant imports were traced across all frontend src files. No application source imports Anime.js or any of the four controller/engine placeholders. No requestAnimationFrame or interval-based animation loop was found in application source. CSS [style.css:31–64](../src/style.css) provides static positioning and clipping, with no animation or transition rules.

## 3. Implemented versus placeholder components

**Implemented:** static PNG comparison; composed SVG-image rendering; approved endpoint configurations; immediate manual expression selection; Zustand semantic state; conditional WebSocket receiving/reconnection; limited runtime message parsing.

**Placeholders:** [expressionController.ts:1–2](../src/animation/expressionController.ts), [animationEngine.ts:1–2](../src/animation/animationEngine.ts), [idleController.ts:1–2](../src/animation/idleController.ts), and [visemeController.ts:1–2](../src/animation/visemeController.ts) each contain only a reservation comment and export {}. [audioPlayer.ts:1–2](../src/services/audioPlayer.ts) and performanceMonitor.ts are placeholders too. The presets directory has only a .gitkeep.

**Partial:** protocol intensity/duration handling and WebSocket lifecycle safety. Do not describe the static happier-transition preview as an implemented transition animation. No playback or viseme messages are supported by the current shared protocol.

## 4. Current state management analysis

| Question | Existing answer |
| --- | --- |
| Where is expression stored? | Zustand emotion, initially idle (faceStore.ts:4, 11). |
| How are changes triggered? | App buttons call setEmotion(e, intensity); valid WebSocket messages call the same setter; parser-accepted RESET_FACE sets idle and intensity 0.5. |
| How does FaceRenderer receive expression? | Direct scalar store selector for emotion, followed by a local prop override. Child components receive the derived expression as a prop. |
| Are expression and animation separated? | No animation state exists. Nothing currently mixes per-frame values into Zustand, but there is no ownership contract protecting future integration. |
| Can speaking/viseme coexist with happy? | No speaking/viseme implementation or state exists. The static mouth only follows expression. Coexistence remains a requirement. |
| Is intensity implemented? | Stored at default 0.5 and accepted from commands. No renderer reads it. App reads and reuses it for button commands; no intensity control or visual mapping exists. |
| Is duration supported? | Typed and partially parsed as transition_ms, then ignored by the socket dispatcher. Store and renderers have no duration field. |
| Is previous expression retained? | No. Asset/layout switching occurs immediately. |
| Is there an animation status? | No. connected is transport status, not animation status. |

There is one canonical stored emotion, but two effective selection responsibilities: store emotion and App's transition boolean. If a preview is active, an incoming happy command changes Zustand while both renderers continue showing happier-transition. The boolean stays true until a regular expression button clears it (App.tsx:33, 39). The view selector can unmount FaceRenderer entirely, so a future engine cannot assume permanent DOM attachment.

Repeated identical setEmotion calls create store updates without an equality guard. Scalar Zustand selectors normally suppress rerenders when their selected primitive is unchanged; they do not prevent store subscriber notification. App parent updates from intensity, connection, or preview/view state can also rerender its children. There is no current per-frame render problem because there is no animation loop.

## 5. Animation readiness assessment

### Dependency and DOM capabilities — existing

[package.json:12–23](../package.json) declares Anime.js ^4.0.0, React ^19, Zustand ^5, TypeScript ~5.9 and Vite ^7. The lockfile resolves Anime.js 4.5.0, React 19.3.1, Zustand 5.0.16, TypeScript 5.9.3 and Vite 7.3.7. The installed Anime.js package also reports 4.5.0. No dependency installation is needed to start this phase.

Installed does not mean configured: there is no Anime.js import, scope, timeline, instance, preset, or effect cleanup in application code. The locally installed v4 declarations expose createScope / Scope.revert in node_modules/animejs/dist/modules/scope/scope.d.ts:17–106, and pause / cancel / revert in timer/timer.d.ts:97–126; animation/animation.d.ts:32–35 documents revert restoring affected values. These local declarations were inspected; no v3 API is assumed.

Each SVG is an external img. Its element-level opacity and wrapper transforms can be animated; SVG path geometry inside that image is not available as child DOM to the page. Path morphing is therefore not available through the current renderer structure. Inline-SVG conversion would be a separate, unnecessary scope expansion for initial transitions.

Targets are insufficiently stable for motion today:

- Eyes and mouth change src and inline layout immediately with expression. Outgoing image content is lost unless retained deliberately.
- Effects mount/unmount, with keys such as mark reused across shock/thinking. Same key does not mean same artwork.
- data-layer identifies an asset, not a role: both cry tears share cryEffect and both blush patches share blushing. Selectors must not assume uniqueness.
- React owns left/top/width/height/z-index. An engine writing those same properties would compete with React updates.
- Static image selection has no explicit decode/preload/failure policy; browser cache behavior is not proof of glitch-free first transition.

### Recommended lifecycle and rendering boundary

Use one renderer-scoped engine instance, attached after DOM commit through a small React adapter. Register stable roles (leftEye, rightEye, mouth and each effect instance) using refs/wrappers under that renderer's root. Do not use global document selectors or create animation instances during rendering. Preserve approved layout as the resting geometry; animate dedicated wrapper properties or temporary layers owned by the engine.

Start with an approved image crossfade between endpoint compositions if acceptable to design. Retain outgoing and incoming non-base artwork only for the active transition, with base/line layers stable and each composition's z-order intact. A transient outgoing/incoming grouping may be needed to preserve tear occlusion. Verify the original clipping, overflow and cry-eye ordering. This is a proposed technique, not an existing behavior or approval of a new motion style. Do not infer a mandatory happier-transition intermediate for every route.

On interruption, preserve the currently displayed pose before stopping the old instance; retarget from that pose to the latest request. For crossfades, freeze/retarget the existing blend rather than keeping an unbounded chain of old compositions. Define a bounded retention/collapse strategy and verify visual continuity. cancel and revert have different purposes: interruption should not blindly restore initial styles and create a snap; unmount teardown should revert the engine-owned scope.

Keep frame progress, animation handles, blend weights and sampled values in engine memory/DOM. Update Zustand only for accepted semantic requests and coarse start/settle/failure events. Avoid per-frame onUpdate store writes. Scalar selectors remain useful; memoization is optional only if profiling shows a need.

## 6. Identified architectural issues

| Priority | Finding and evidence | Recommendation for a later implementation |
| --- | --- | --- |
| First slice | No shared request owner; App and socket mutate store directly (App.tsx:33; websocketClient.ts:17–24). Duration/request ID are lost. | Route both through a single Expression Controller accepting a validated internal request. Preserve existing wire shape. |
| First slice | Renderer commits target assets immediately; no persistent outgoing pose or role refs (FaceRenderer.tsx:8–16; FaceLayer.tsx:19–25). | Add a narrow renderer/engine adapter and explicit transient visual ownership before adding motion. |
| First slice | Parser is weaker than shared schema (faceMessages.ts:26–48 vs shared schema). SET_EXPRESSION accepts fractional or non-finite positive duration and extra keys. | Enforce finite nonnegative integer transition_ms and exact allowed keys. Keep intensity finite and within 0..1, with malformed values rejected. Positive infinity can also result from JSON numeric overflow such as 1e400. These findings are from code inspection, not executed runtime probes. |
| First slice | RESET_FACE is frontend-only and accepts any numeric duration, including negative/NaN values for direct JS callers (faceMessages.ts:36–37). | Explicitly distinguish local compatibility handling from v0.1 wire support. Do not advertise RESET_FACE as a backend feature; decide its later treatment with compatibility tests. No protocol change in this audit. |
| First slice | setEmotion has only TypeScript typing (faceStore.ts:7, 14); invalid runtime values can reach unchecked map lookups. | Validate every external input and controller request. Retain EMOTIONS as canonical protocol allowlist; reject shy, unknown names and happier-transition without idle fallback. |
| First slice | No specified intensity-to-appearance behavior. | Preserve numeric state, but do not claim a visual effect until mapping and acceptance criteria are approved. Never invent geometry or treat happy/happier as interchangeable intensity samples. |
| Integration | WebSocket socket/timer/stopped are module globals (websocketClient.ts:4–6). Old close/open/message events can affect a later connection, including StrictMode setup-cleanup-setup. onerror closes the current global socket rather than its originating socket. | Make connection lifetime local and generation-guard callbacks; dispose listeners/timers and allow one reconnect timer per lifetime. A code-derived race risk, not a reproduced browser failure here. |
| Integration | Static preview overrides live commands (App.tsx:15, 33–41). | Keep explicit development preview outside production command semantics. Disable live transport while previewing or explicitly exit preview on a command; choose one observable policy. |
| Before idle/visemes | No property ownership or mouth resolution rules. | Define expression, idle and viseme channels before introducing competing effects. |
| Acceptance | Animation specification is minimal and implementation plan empty. Existing tests focus on static output. | Record request, timing, interruption, cleanup and approved visual policies before broadening implementation. |

A safe maximum accepted duration may be a useful local resource policy, but v0.1 defines no upper bound. Do not silently introduce one as though it were the protocol contract. Decide and document local handling explicitly. No duration limit is added by this audit.

## 7. Recommended Expression Controller architecture

**Recommendation, not implemented.** Reuse expressionController.ts as the sole entry point for semantic expression requests. It should not render, query the DOM, own Anime.js handles, or run a frame loop.

Responsibilities:

1. Validate/normalize a local request containing emotion, intensity, transitionMs and optional requestId/source metadata. The transport adapter maps transition_ms to transitionMs; this is an internal name, not a wire change.
2. Use EMOTIONS / Emotion for supported expressions. LAYER_EXPRESSIONS additionally permits a development preview and must not become the command allowlist. Keep composition/layout coverage checks as an invariant.
3. Initialize to existing idle and intensity 0.5. For local controls, choose an explicit documented duration default; the existing 250 ms fixtures are examples, not a global default. Preserve zero as a valid immediate request.
4. Make same emotion/intensity requests idempotent: a different duration alone should not restart motion to an already requested endpoint. A changed intensity is a new request even for the same emotion, subject to the approved intensity mapping.
5. Accept latest valid request immediately and invalidate any earlier transition generation. Do not build an expression command queue for rapid switching.
6. Treat returning to idle as a regular SET_EXPRESSION with emotion idle. Do not automatically reset after a timeout or after speech; no hold duration exists in v0.1.
7. Publish semantic state once per accepted request. Let the engine adapter consume that request after the matching renderer preparation/DOM commit. Engine completion may publish status only if its generation is still current.

Semantic equality should handle ordinary duplicates. request_id can correlate diagnostics but currently has no documented ordering/replay guarantees. Do not infer time ordering from it or add an unbounded deduplication history. An explicit restart operation, if later needed, requires local semantics rather than overloading duplicate messages.

Intensity needs a separate design decision: retain exact approved endpoints and define what 0, 0.5 and 1 mean per expression. Until then, document intensity as accepted/stored but visually inactive. A crossfade used for transitioning is not automatically an intensity definition.

## 8. Recommended Animation Engine and future controller responsibilities

**Animation Engine:** own renderer-scoped Anime.js scopes/handles, transition execution, cancellation, coarse status, target preparation and disposal. It receives validated requests/resolved visual endpoints and must not parse network messages. Maintain an incrementing request generation and a disposed flag; completion/cancel/decode callbacks cannot settle a superseded or detached renderer. Decode the incoming images before starting visible motion; a newer request supersedes any pending decode. On load failure preserve the last valid displayed face and report failure without committing a false settled state. No fabricated expression fallback.

One active expression transition per renderer is sufficient. On transition_ms=0, stop the old transition and commit the endpoint immediately after preparation. When no animated renderer is attached (reference-only view), keep the latest semantic request; on reattachment show that target deterministically rather than replaying all missed commands. Connection status must remain independent of whether a renderer is attached or an animation has completed.

**Idle Controller:** future scheduler for blinks and subtle gaze, independent of emotion selection. Startup idle expression and idle motion are different concepts: a blink must not call setEmotion(idle). Use approved motions/assets only; no blink asset or approved gaze/blink deformation is presently specified. Yield conflicting eye channels to expression transitions and resume from a neutral offset. Timers and animation handles are disposable; no per-frame store updates.

**Viseme Controller:** future selector/timeline for independent mouth shapes. Keep emotion intact while speaking. Resolve mouth from expression plus currentViseme through an explicit approved mapping; expression eyes/effects remain active. When speech ends, return to the mouth for the latest expression, including an expression changed during speech. Keep speech selection separate from audio synchronization, which is still a placeholder. No viseme IDs, assets, timelines or wire message types are invented here.

Property ownership recommendation:

| Channel | Owner | Composition rule |
| --- | --- | --- |
| Baseline expression assets/layout and transient expression blend | Expression renderer + engine | React owns approved resting layout; engine owns dedicated transition properties/layers. |
| Eye blink/gaze offset | Idle Controller through engine | Separate transform wrapper; expression transition suspends conflicting eye motion. |
| Mouth selection/shape while speaking | Viseme Controller through mouth resolver/engine | Viseme takes mouth priority; expression remains the baseline context. |
| Timing handles and cancellation | Animation Engine | Controllers request motion; they do not independently write the same DOM property. |

Unmount: invalidate callbacks, unsubscribe controller/store listeners, clear idle timers, stop owned transitions, revert scopes, remove transient layers and release refs. Make disposal idempotent for React StrictMode ([main.tsx:5–8](../src/main.tsx)). Renderer teardown must not reset global emotion or disconnect the App-owned socket just because the view switches. App teardown owns its socket cleanup separately.

## 9. Proposed state and data flow

**Proposed future state; no Zustand changes made.** Keep existing names when they already express the domain clearly.

| State | Owner and meaning | Recommendation |
| --- | --- | --- |
| emotion | Zustand / Expression Controller: latest accepted requested endpoint | Keep it; currentExpression would duplicate it. During transition it means target, not the instantaneous visible blend. |
| intensity | Zustand: intensity of that accepted request | Keep existing 0.5 initialization; do not imply visual support until mapping exists. |
| transitionMs | Accepted request snapshot in Zustand or a single co-located request object | Add once when implementing. Represents requested transition duration, not elapsed time. Avoid a second transitionDuration alias. |
| animationStatus | Coarse renderer transition status, if UI/diagnostics need it | settled, transitioning, and optionally unavailable/error; define it for expression transitions, not blink/speech. No frame progress. No target settlement claimed while detached. |
| connected | Zustand / transport | Retain current role. Does not indicate animation or speech readiness. |
| previousExpression | Engine-local transition context | Do not add a second canonical store field. A single previous name cannot describe an interrupted blend. Retain the actual outgoing visual snapshot/weights internally. |
| settledExpression | Engine-local diagnostic value | Optional last completed endpoint; avoid storing unless a consumer actually needs it. Distinct from current target. |
| request generation, handles, decoded targets, blend progress | Engine memory | Never per-frame Zustand state. |
| isSpeaking, currentViseme | Future independent speech state | Add together only when implementing speech. Inactive mouth selection can be null. isSpeaking can cover speech start/end intervals with no selected shape, so it is not necessarily derived from currentViseme. |
| preview override and view | App development UI | Remain outside production expression state, with explicit live-command interaction policy. |

Do not keep separate controller state and store copies of the same semantic target. The controller operates on the canonical store/request snapshot; engine state describes the transient rendering process. A generation counter is internal coordination, not a new protocol field.

Future command flow, using the unchanged v0.1 SET_EXPRESSION message:

~~~text
Python FastAPI sends existing JSON command
  -> WebSocket client parses JSON and validates the wire message
  -> adapter passes emotion/intensity/transition_ms/request_id to Expression Controller
  -> controller validates local invariants, checks duplicate policy, accepts latest request
  -> canonical semantic state updates once
  -> mounted renderer adapter prepares target assets and stable DOM roles
  -> Animation Engine executes/cancels transition without per-frame React updates
  -> current-generation completion publishes coarse settled status if needed
~~~

Manual controls enter the same controller path. No Python implementation change is required to route existing expression commands this way. Speaking/viseme command delivery is intentionally unspecified because v0.1 does not define it. RESET_FACE remains a known frontend-only divergence, not a claimed FastAPI route.

### Edge-case policies

| Case | Recommended observable behavior |
| --- | --- |
| Repeated same expression/intensity | Preserve existing target/motion; no restart or allocation growth. |
| Same expression, changed intensity | Accept a new semantic request; visual effect depends on approved mapping. |
| Rapid switching | Latest valid request wins; cancel/retarget previous visual work, bound retained layers. |
| Invalid name/value | Reject without changing current face, intensity or transition; no silent idle fallback. |
| Interrupted transition | Continue from displayed pose/blend; obsolete completion cannot overwrite current status/target. |
| Return to idle | Explicit regular expression request; retain independent speaking state. |
| Speaking while happy | Happy remains canonical; mouth resolver applies viseme over happy baseline; restore latest expression mouth on speech end. |
| Zero duration | Deterministic immediate endpoint after asset readiness; no stale transition callback. |
| Renderer unmount/remount | Dispose owned work, preserve semantic request, attach latest endpoint without backlog. |
| Socket reconnect/unmount | Generation-guard stale callbacks; do not reset expression automatically on disconnection. |

## 10. Recommended implementation sequence

1. Specify acceptance rules for local duration default, duplicate semantics, visual transition style, intensity, interruption and preview/live command interaction. Update stale architecture/animation/plan prose in a separate implementation task.
2. Tighten parser conformity for existing SET_EXPRESSION without changing the shared schema, backend or expression list. Add malformed-duration and extra-key cases. Explicitly test frontend-only RESET_FACE compatibility.
3. Implement the smallest controller slice: validated requests from manual and socket paths, duration preserved, idle defaults, semantic idempotency, latest-request policy. Keep immediate rendering available while proving command handling.
4. Add renderer-scoped stable target registration and transient layer ownership. Preserve all approved static endpoint compositions and the PNG reference renderer.
5. Implement one bounded expression transition through Anime.js, with zero-duration, interruption, stale completion, image readiness and StrictMode/unmount cleanup. Then apply the same mechanism to remaining expressions.
6. Add visual intensity only after its mapping is approved. If deferred, expose its limitation explicitly rather than pretending the stored value animates.
7. Implement idle motion as a separate subsequent slice after approved blink/gaze behavior exists. Implement viseme selection/mouth mapping and audio synchronization later, with independent speech state and a separately authorized protocol design when needed.
8. Validate target-browser behavior and collect reproducible performance evidence after animation exists. Do not claim target FPS/latency from static checks.

The next concrete step is acceptance contracts plus controller request routing, not a broad renderer rewrite or an extra framework.

## 11. Testing recommendations and audit verification

### Existing coverage inspected

- [verify-face-layers.mjs:8–106](../scripts/verify-face-layers.mjs) loads actual components/config through Vite SSR, verifies all eight compositions and 27 SVG assets, aspect ratios/bounds, selected mouth/eye/effect mappings, cry ordering, emotion/schema parity, fixtures, and preview isolation. It seeds Zustand's SSR initial snapshot (lines 18–22); it is not a browser interaction or live subscription test.
- The same script writes reports/face-layers/runtime-config.json (lines 107–111). It was intentionally not run in this read-only audit.
- [expression-messages.json:1–106](../scripts/fixtures/expression-messages.json) has eight fixtures: seven valid expression names and one rejected shy. It does not cover timing bounds, unexpected fields, RESET_FACE, malformed structure, duplicates or interruptions.
- [verify-expression-protocol.py:13–26](../scripts/verify-expression-protocol.py) checks Python model/shared emotion parity and fixtures; it does not establish frontend parser parity for all schema constraints. Not run: backend execution is outside this task.
- Image analysis/refinement/validation scripts generate diagnostic artifacts and compare static composition/source integrity. They do not test animation lifecycle or communication races.
- package.json:6–10 has no test script or dedicated unit/browser test runner. This does not mean there are no checks: the standalone scripts above exist.

### Focused future tests

| Layer | Required proof |
| --- | --- |
| Parser | Existing seven expressions; reject shy/preview/unknown names; finite intensity 0..1; integer finite duration >=0 including zero; missing/wrong fields; reject extra keys consistent with schema; JSON overflow; explicit RESET_FACE compatibility cases. |
| Controller/store | Idle defaults; manual/network parity; duration retained; duplicate no-op; same-emotion intensity change; invalid input leaves state unchanged; latest request wins. |
| Engine | One active expression transition; zero duration; interruption without snap; bounded layers; superseded completion/decode ignored; failure preserves valid face; no per-frame store notifications. |
| Renderer | Stable per-role refs, two independent tears/blushes, preserved z-order/clipping/overflow and approved resting coordinates; reference-only unmount/remount shows latest request. |
| Lifecycle/transport | StrictMode setup-cleanup-setup; repeated disposal; no orphan timers/listeners; stale socket close/open/error/message does not affect new session; reconnect timer uniqueness. |
| Future speaking/idle | Happy survives viseme playback and expression changes during speech; expression mouth restored afterward; blink/gaze yield conflicts; no motion after disposal. |
| Browser and performance | Real click/command switching, first-load decoding, rapid switching, responsive views, reconnect and target Linux Brave checks. Measure FPS/latency/CPU/RAM with device/software/sample size/methodology per benchmark plan; no measurements claimed here. |

### Checks actually performed in this audit

| Check | Result |
| --- | --- |
| Requested documentation, actual source/imports, dependency declarations/lockfile and existing check scripts inspected | Completed. Implementation plan is empty; animation spec lacks motion contracts. |
| Installed Anime.js package and lifecycle type declarations inspected | PASS: 4.5.0 installed; no application imports/configuration. |
| Read-only TypeScript compiler API using installed TypeScript 5.9.3 and frontend tsconfig, noEmit and incremental disabled | PASS: 22 configured source/config files, zero diagnostics with compiler host rooted at frontend. No build outputs or tsbuildinfo written. This was not npm run typecheck. |
| npm commands / shell checks | UNAVAILABLE: shell process startup failed with helper_unknown_error / setup refresh had errors. No dependencies installed. |
| Existing SSR verifier and image-generation verification scripts | NOT RUN: these write unrelated reports/artifacts. Their source was inspected. |
| Parser fixtures / adversarial runtime probes | NOT RUN successfully: in-memory harness attempts were blocked by module/code-generation restrictions. Parser weaknesses above are static code findings, not claimed runtime passes. |
| npm run build / browser/manual/WebSocket checks / backend tests | NOT RUN. No new runtime or target performance evidence. |

Report integrity: PASS, all 39 relative Markdown links resolve. SHA-256 comparison: PASS, all 210 baseline files across frontend (excluding installed dependencies/build output), backend source (excluding virtualenv/caches), shared, docs, AGENTS.md and README.md are unchanged; this report is the sole added file in those inspected trees. Standard install/build/manual instructions do not override this task's no-install/no-source-change scope. Existing historical passes are not counted as current verification.

### Limitations and completion

This is a source-level architecture audit. It cannot establish smoothness, browser race reproduction, image-decoding behavior, Linux display results, or a valid visual intensity/blink/viseme mapping. The backend was not audited or changed; shared schema was read only to compare the frontend boundary. Working-tree status could not be obtained through the unavailable shell, so no claims are made about pre-existing changes.

Changed file: this report only. Observable application behavior: unchanged. Protocol changes: none. Next step: agree on motion/intensity and request lifecycle acceptance criteria, then implement the controller request-routing slice described in section 10.
