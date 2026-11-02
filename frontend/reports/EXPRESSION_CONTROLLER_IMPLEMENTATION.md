# Expression Controller Contract and Request Routing

Date: 2026-10-31. This implements semantic request handling only. Approved static compositions and immediate rendering are preserved. No visual animation, crossfade, intensity mapping, idle motion, visemes, or audio synchronization was implemented.

## 1. Implemented architecture

~~~text
Manual expression buttons --------> requestExpression(unknown)
                                        |
WebSocket JSON -> strict parser          |
  -> injected request callback ---------+
                                        v
                            runtime validation + normalization
                                        |
                       reject / semantic duplicate / accept
                                        |
                              canonical Zustand snapshot
                                        |
                              existing immediate renderers
~~~

[expressionController.ts](../src/animation/expressionController.ts) is the only application-level writer of expression state. [App.tsx](../src/App.tsx) routes both manual controls and the injected WebSocket callback through it. The socket client only updates connection status directly; it no longer mutates expression fields.

No Animation Engine wiring was added. animationEngine.ts, idleController.ts, visemeController.ts and audioPlayer.ts remain placeholders. FaceRenderer, all child face components, layout configuration, composition configuration and artwork were not edited.

## 2. Controller request contract

~~~ts
type ExpressionRequestSource = "manual" | "websocket" | "reset";
interface ExpressionRequest {
    emotion: Emotion;
    intensity: number;
    transitionMs: number;
    requestId?: string;
    source: ExpressionRequestSource;
}
~~~

requestExpression accepts unknown at its runtime boundary and returns accepted, duplicate, or rejected. An accepted request is copied into a normalized snapshot containing only these fields. Application callers do not supply executable behavior or visual instructions.

Validation reuses the parser's canonical guards:

- Emotion must be one of idle, happy, happier, sad, cry, shock or thinking. shy, happier-transition, unknown strings and non-strings are rejected.
- Intensity must be a finite number in the inclusive range 0..1.
- transitionMs must be a finite integer >= 0. Zero is valid; no maximum was introduced.
- Optional requestId must be a string when supplied. Empty strings are valid under the shared schema.
- Source must be manual, websocket or reset.

There is no coercion, clamping or idle fallback for invalid input. Rejection preserves the whole store snapshot, including accepted duration and metadata, and emits no store notification.

## 3. Zustand state changes

[faceStore.ts](../src/stores/faceStore.ts) retains emotion, intensity and connected. The obsolete setEmotion action was removed; no application caller remains. The controller commits accepted fields atomically using Zustand setState. setConnected remains exclusively a transport-status action.

| Field | Initial value | Meaning |
| --- | --- | --- |
| emotion | idle | Latest accepted semantic expression. |
| intensity | 0.5 | Accepted numeric intensity; no visual effect in this phase. |
| transitionMs | 0 | Accepted duration metadata, not running animation time. Initial state requests no transition. |
| requestId | undefined | Correlation ID of the accepted request, if any. |
| source | null | Source of the accepted request; null means no request has changed the initialized state. |
| connected | false | WebSocket connectivity, independent of expression. |

The expression fields and metadata form one flat canonical snapshot. No currentExpression alias, second duration field, history, frame progress, animationStatus or speaking state was added. The store's source type imports the controller contract using a type-only import, so this creates no runtime module cycle.

A newly accepted manual request clears a previous WebSocket requestId. A duplicate retains the prior accepted request metadata deliberately; it does not become a new accepted transition request merely to record a newer ID.

## 4. Manual request flow

Each of the seven existing expression buttons first exits development preview, then calls requestExpression with its emotion, the currently selected intensity, source manual and MANUAL_TRANSITION_MS = 300. The original full-image reference and SVG composition comparison remain available.

300 ms is metadata for a future engine. The visible face still switches immediately. Clicking an expression that is already selected remains a semantic duplicate, including when it exits preview; no metadata-only store update is emitted.

## 5. WebSocket request flow

[websocketClient.ts](../src/services/websocketClient.ts) now requires an injected onRequest callback. For SET_EXPRESSION it maps:

| Wire field | Internal field |
| --- | --- |
| payload.emotion | emotion |
| payload.intensity | intensity |
| payload.transition_ms | transitionMs |
| request_id | requestId |
| Transport origin | source = websocket |

App passes that request to the same controller used by manual controls. A non-rejected result exits preview, including a valid semantic duplicate. Malformed JSON and rejected parser input are not forwarded and cannot change expression state or preview.

VITE_WS_ENABLED remains opt-in. VITE_WS_URL and its ws://127.0.0.1:8000/ws/face fallback are unchanged. Reconnection remains 1500 ms. A narrow lifecycle correction moves socket/timer/stopped state inside each connection lifetime and guards every socket callback against stale or disposed sockets. Cleanup clears its timer, detaches handlers, closes its own socket and is idempotent. This prevents old callbacks from delivering requests or closing a newer socket during reconnect/StrictMode lifetimes. Connection/disconnection does not reset the face.

### Frontend-only RESET_FACE compatibility

RESET_FACE remains outside the shared v0.1 schema and is not claimed as Python support. Its legacy parser exception still accepts a string request_id, an object payload and a numeric transition_ms, including historical permissiveness for extra fields and otherwise invalid numeric durations. Non-numeric durations remain rejected.

This exception is safe to route through the controller because its historical duration was ignored. The adapter creates a valid internal request: idle, intensity 0.5, transitionMs 0, original requestId and source reset. The raw legacy duration never enters accepted transition metadata. Tests cover this mapping and the parser exception. As with all requests, resetting an already-idle/0.5 face is a duplicate and produces no state update.

## 6. Parser validation changes

[faceMessages.ts](../src/schemas/faceMessages.ts) enforces the existing SET_EXPRESSION schema without changing it:

- Non-array object envelope with exactly type, request_id and payload as own enumerable fields.
- Type exactly SET_EXPRESSION and string request_id.
- Non-array object payload with exactly emotion, intensity and transition_ms.
- Canonical seven-expression allowlist.
- Finite, bounded intensity and finite, integer, nonnegative transition_ms.
- No unexpected envelope or payload fields.

Finite-number checks reject JSON numeric overflow such as 1e400, which JSON.parse can turn into Infinity. No string-to-number coercion is performed. Required fields cannot be supplied only through an object's prototype. The returned message is a fresh normalized object rather than an unchecked cast.

The explicit RESET_FACE exception above remains more permissive than v0.1. It is documented separately rather than represented as schema conformance. No message names, wire fields, shared schema or Python models were changed.

## 7. Duplicate and rapid-switch behavior

Validation runs before duplicate comparison. Same emotion plus same intensity returns duplicate even if duration, ID or source differs. The store retains the exact same object and subscribers receive no notification. A malformed duplicate is rejected rather than accepted simply because its emotion matches.

A changed intensity is a new accepted request even with the same emotion. Valid requests synchronously replace accepted fields in call order; invalid requests leave the latest valid snapshot untouched. There is no queue, request-ID ordering or animation cancellation. Tests use IDs in reverse lexical order to prove the ID does not control acceptance order.

## 8. Preview isolation behavior

The existing App-local preview boolean remains separate from canonical state. happier-transition only overrides the two renderers while preview is active; selecting it never sends a controller request. It remains outside the production allowlist.

Manual expression selection exits preview before requesting the expression. Valid live commands exit preview after the controller validates them. Valid duplicates also exit preview without changing store metadata. Invalid live input leaves both preview and canonical state untouched. Seven expression controls, all three comparison views and the original full-image renderer remain present; shy remains excluded.

## 9. Verification results

Executed on Windows using Node.js 24.14.1, installed TypeScript 5.9.3 and Vite 7.3.7. No dependencies were installed. The regular exec tool could not start its shell (helper_unknown_error: setup refresh had errors); native child-process execution through the Node tool successfully ran the actual requested commands from frontend.

| Command / check | Result |
| --- | --- |
| npm run typecheck | PASS, exit 0. |
| npm run build | PASS, exit 0; 45 modules transformed, production output generated. |
| node scripts/verify-face-layers.mjs | PASS, exit 0; 8 compositions, 27 SVGs, ratios/paths/bounds, React SSR switching, protocol fixtures and preview isolation. |
| node scripts/verify-expression-controller.mjs | PASS, exit 0; controller, parser, socket routing/lifecycle and actual App handler checks. |
| git diff --check | PASS, exit 0; Git emitted existing LF/CRLF normalization warnings. |
| Live browser / live FastAPI integration | NOT RUN. |
| Backend tests | NOT RUN; backend was not changed. |

The new deterministic verification script uses installed Vite SSR, React, TypeScript and Node assertions. It checks defaults, accepted metadata, intensity boundaries, zero/large duration, invalid inputs, no-op duplicate identity/subscriber counts, changed intensity and latest-valid-request wins. Parser tests cover all seven names, shared emotion parity, existing fixtures, unexpected fields, missing/wrong fields, unsupported names, non-finite values and JSON overflow. A fake WebSocket exercises the actual adapter, malformed messages, reset mapping, connectivity, stale callbacks, 1500 ms reconnect and disposal.

For App interaction checks, a shallow hook harness transpiles the actual App source using installed TypeScript and substitutes only its React hooks and the WebSocket-enable environment expression. Production controller, parser, socket adapter and store are real. It invokes actual button handlers and the actual effect callback to verify manual routing, retained intensity, preview isolation, invalid live input, valid duplicate preview exit and new live-command visibility. This does not mount React DOM or prove browser scheduling, StrictMode execution, CSS, decoding, visual smoothness or live network behavior. Existing SSR composition checks provide separate static rendering regression coverage.

During test development an initial URL-assertion syntax error and a transient Vite integration assertion failed. The final script passed repeated standalone runs and the final verification run; no earlier failed attempt is counted as a pass.

## 10. Modified files

| File | Change |
| --- | --- |
| src/animation/expressionController.ts | Request contract, shared-guard validation, normalized canonical commits and semantic deduplication. |
| src/stores/faceStore.ts | Added transitionMs/requestId/source, removed direct setEmotion action. |
| src/schemas/faceMessages.ts | Reusable guards, strict SET_EXPRESSION parsing, documented reset compatibility exception. |
| src/services/websocketClient.ts | Injected request forwarding, metadata mapping, local lifecycle ownership and cleanup guards. |
| src/App.tsx | Centralized manual/live routing and accepted-live preview exit. |
| scripts/verify-face-layers.mjs | Static regression setup now uses the controller instead of removed setEmotion. |
| scripts/verify-expression-controller.mjs | New deterministic controller/parser/adapter/App-handler verification. |
| reports/EXPRESSION_CONTROLLER_IMPLEMENTATION.md | This implementation record. |

Build output in dist was regenerated by the required production build. The existing layer verifier regenerated its runtime-config.json with identical contents. Pre-existing working-tree changes were preserved. A task-baseline SHA-256 comparison found only the six existing source/script files listed above changed before this report was added; the new verifier and this report are the two added files. Backend source, shared protocol, dependencies/lockfile, approved renderers/configuration and all source artwork remain unchanged from that baseline.

## 11. Remaining limitations and next step

Duration and intensity are accepted semantic metadata only. No Anime.js instance, transition, frame loop, cancellation, preload/decode handling, blink, gaze, viseme or speech state exists. The controller/store boundary is an application convention: Zustand's low-level setState API remains available, but the controller is its sole expression writer in application source.

RESET_FACE is intentionally still a frontend-only legacy parsing exception. The new tests use fake sockets and a shallow component harness; a target-browser/live-backend check remains outstanding. No FPS, latency or target-display performance was measured.

The next phase may define approved motion/intensity behavior and a renderer-scoped Animation Engine lifecycle. That phase was not started here.
