// Run from frontend: node scripts/verify-expression-controller.mjs
// Uses installed Vite/React/TypeScript and Node assertions; no new dependencies.
import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const originalSocket = globalThis.WebSocket;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalWarn = console.warn;
let unsubscribe;
let dispose;
try {
    const { requestExpression, MANUAL_TRANSITION_MS } = await server.ssrLoadModule("/src/animation/expressionController.ts");
    const { useFaceStore } = await server.ssrLoadModule("/src/stores/faceStore.ts");
    const { parseFaceMessage, EMOTIONS } = await server.ssrLoadModule("/src/schemas/faceMessages.ts");
    const { connectFaceSocket } = await server.ssrLoadModule("/src/services/websocketClient.ts");
    const { default: FaceRenderer } = await server.ssrLoadModule("/src/components/face/FaceRenderer.tsx");
    const { default: FullImageFaceRenderer } = await server.ssrLoadModule("/src/components/face/FullImageFaceRenderer.tsx");
    const { default: MouthGeometryComparison } = await server.ssrLoadModule("/src/components/face/mouth/MouthGeometryComparison.tsx");
    const { default: EyeGeometryComparison } = await server.ssrLoadModule("/src/components/face/eyes/EyeGeometryComparison.tsx");
    const react = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const jsx = await import(pathToFileURL(await realpath("node_modules/react/jsx-runtime.js")));

    assert.equal(useFaceStore.getState().emotion, "idle");
    assert.equal(useFaceStore.getState().intensity, 0.5);
    assert.equal(useFaceStore.getState().transitionMs, 0);
    assert.equal(useFaceStore.getState().source, null);
    assert.equal(useFaceStore.getState().requestId, undefined);
    assert.equal(MANUAL_TRANSITION_MS, 300);
    let updates = 0;
    unsubscribe = useFaceStore.subscribe(() => updates++);
    const request = (changes = {}) => ({ emotion: "happy", intensity: 0.5,
        transitionMs: 300, source: "manual", ...changes });
    const accepted = (changes) => assert.equal(requestExpression(request(changes)), "accepted");
    accepted({ requestId: "first" });
    assert.equal(useFaceStore.getState().transitionMs, 300);
    assert.equal(useFaceStore.getState().requestId, "first");
    assert.equal(useFaceStore.getState().source, "manual");
    const same = useFaceStore.getState();
    const beforeDuplicate = updates;
    assert.equal(requestExpression(request({ transitionMs: 999, requestId: "other", source: "websocket" })), "duplicate");
    assert.strictEqual(useFaceStore.getState(), same);
    assert.equal(updates, beforeDuplicate, "Duplicate must not notify subscribers or replace metadata");
    for (const intensity of [0, 1]) {
        accepted({ intensity, transitionMs: 0 });
        assert.equal(useFaceStore.getState().intensity, intensity);
        assert.equal(useFaceStore.getState().transitionMs, 0);
        assert.equal(useFaceStore.getState().requestId, undefined, "Manual request clears stale requestId");
    }
    const invalidRequests = [null, [], "happy", {},
        ...["shy", "happier-transition", "unknown", 7, null].map((emotion) => request({ emotion })),
        ...[NaN, Infinity, -Infinity, -0.1, 1.1, "0.5", null].map((intensity) => request({ intensity })),
        ...[NaN, Infinity, -Infinity, -1, 0.5, "300", null].map((transitionMs) => request({ transitionMs })),
        request({ requestId: 123 }), request({ source: "unknown" }),
        request({ source: undefined }), request({ transitionMs: undefined })];
    for (const value of invalidRequests) {
        const before = useFaceStore.getState();
        const count = updates;
        assert.equal(requestExpression(value), "rejected");
        assert.strictEqual(useFaceStore.getState(), before);
        assert.equal(updates, count);
    }
    accepted({ emotion: "sad", intensity: 0.2, transitionMs: 10, requestId: "z", source: "websocket" });
    assert.equal(requestExpression(request({ emotion: "shy" })), "rejected");
    accepted({ emotion: "shock", intensity: 0.7, transitionMs: 20, requestId: "a", source: "websocket" });
    assert.equal(useFaceStore.getState().emotion, "shock");
    assert.equal(useFaceStore.getState().requestId, "a", "IDs do not establish ordering");
    accepted({ emotion: "shock", intensity: 0.8, transitionMs: 1e20 });
    assert.equal(useFaceStore.getState().transitionMs, 1e20, "No invented maximum duration");
    assert.equal(useFaceStore.getState().intensity, 0.8);
    unsubscribe();
    unsubscribe = undefined;

    const wire = (changes = {}, envelope = {}) => ({ type: "SET_EXPRESSION", request_id: "wire-id",
        payload: { emotion: "happy", intensity: 0.5, transition_ms: 456, ...changes }, ...envelope });
    const schema = JSON.parse(await readFile("../shared/face-protocol.schema.json", "utf8"));
    assert.deepEqual(EMOTIONS, schema.properties.payload.properties.emotion.enum);
    const fixtures = JSON.parse(await readFile("scripts/fixtures/expression-messages.json", "utf8"));
    for (const fixture of fixtures) assert.equal(parseFaceMessage(fixture.message) !== null, fixture.valid, fixture.name);
    for (const emotion of EMOTIONS) {
        const parsed = parseFaceMessage(wire({ emotion }));
        assert.equal(parsed.payload.emotion, emotion);
        assert.equal(parsed.payload.transition_ms, 456);
        assert.equal(parsed.request_id, "wire-id");
    }
    for (const intensity of [0, 1]) assert.ok(parseFaceMessage(wire({ intensity, transition_ms: 0 })));
    assert.ok(parseFaceMessage(wire({}, { request_id: "" })), "Schema allows empty string ID");
    const inherited = Object.assign(Object.create({ request_id: "inherited" }), {
        type: "SET_EXPRESSION", payload: wire().payload });
    const invalidMessages = [null, [], "happy", {}, inherited,
        wire({}, { type: "PLAY_VISEMES" }), wire({}, { request_id: 1 }),
        wire({}, { request_id: undefined }), wire({}, { payload: [] }), wire({}, { payload: null }),
        wire({}, { extra: true }), wire({ extra: true }), wire({ emotion: undefined }),
        wire({ intensity: undefined }), wire({ transition_ms: undefined }),
        ...["shy", "happier-transition", "unknown", 1, null].map((emotion) => wire({ emotion })),
        ...[NaN, Infinity, -Infinity, -1, 1.1, "0.5", null].map((intensity) => wire({ intensity })),
        ...[NaN, Infinity, -Infinity, -1, 0.5, "300", null].map((transition_ms) => wire({ transition_ms })),
        JSON.parse('{"type":"SET_EXPRESSION","request_id":"overflow","payload":{"emotion":"happy","intensity":0.5,"transition_ms":1e400}}')];
    for (const value of invalidMessages) assert.equal(parseFaceMessage(value), null);
    // Explicit legacy exception: reset is NOT part of shared v0.1; its duration was ignored.
    for (const duration of [0, 250, -1, 0.5, NaN, Infinity]) {
        assert.ok(parseFaceMessage({ type: "RESET_FACE", request_id: "reset", payload: { transition_ms: duration } }));
    }
    assert.equal(parseFaceMessage({ type: "RESET_FACE", request_id: "reset", payload: { transition_ms: "bad" } }), null);
    assert.ok(parseFaceMessage({ type: "RESET_FACE", request_id: "reset", extra: true,
        payload: { transition_ms: 250, extra: true } }), "Legacy reset retains its permissive fields");

    const sockets = [];
    class FakeSocket {
        constructor(url) { this.url = url; sockets.push(this); }
        close() { this.closed = true; this.onclose?.({}); }
        sendMessage(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
    }
    globalThis.WebSocket = FakeSocket;
    const timers = new Map();
    let nextTimer = 0;
    globalThis.setTimeout = (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; };
    globalThis.clearTimeout = (id) => timers.delete(id);
    console.warn = () => {};
    let forwarded = 0;
    dispose = connectFaceSocket((value) => { forwarded++; requestExpression(value); });
    let socket = sockets.at(-1);
    assert.equal(socket.url, server.config.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws/face");
    socket.onopen();
    assert.equal(useFaceStore.getState().connected, true);
    socket.sendMessage(wire({ emotion: "thinking", intensity: 0.3, transition_ms: 0 }));
    assert.equal(forwarded, 1);
    assert.equal(useFaceStore.getState().emotion, "thinking");
    assert.equal(useFaceStore.getState().intensity, 0.3);
    assert.equal(useFaceStore.getState().transitionMs, 0);
    assert.equal(useFaceStore.getState().requestId, "wire-id");
    assert.equal(useFaceStore.getState().source, "websocket");
    const beforeInvalidWire = useFaceStore.getState();
    for (const value of invalidMessages) socket.sendMessage(value);
    socket.onmessage({ data: "{invalid JSON" });
    socket.onmessage({ data: '{"type":"SET_EXPRESSION","request_id":"overflow","payload":{"emotion":"happy","intensity":0.5,"transition_ms":1e400}}' });
    assert.equal(forwarded, 1);
    assert.strictEqual(useFaceStore.getState(), beforeInvalidWire);
    assert.equal(useFaceStore.getState().emotion, "thinking");
    socket.sendMessage({ type: "RESET_FACE", request_id: "legacy", payload: { transition_ms: -99 } });
    assert.equal(useFaceStore.getState().emotion, "idle");
    assert.equal(useFaceStore.getState().intensity, 0.5);
    assert.equal(useFaceStore.getState().transitionMs, 0);
    assert.equal(useFaceStore.getState().source, "reset");
    assert.equal(useFaceStore.getState().requestId, "legacy");
    const oldMessage = socket.onmessage;
    const oldOpen = socket.onopen;
    const oldClose = socket.onclose;
    const oldError = socket.onerror;
    socket.close();
    assert.equal(useFaceStore.getState().connected, false);
    assert.equal(timers.size, 1);
    oldClose();
    assert.equal(timers.size, 1, "Stale close must not create another reconnect timer");
    const [timerId, timer] = [...timers][0];
    assert.equal(timer.delay, 1500);
    timers.delete(timerId);
    timer.fn();
    const nextSocket = sockets.at(-1);
    nextSocket.onopen();
    oldMessage({ data: JSON.stringify(wire({ emotion: "cry" })) });
    oldOpen(); oldClose(); oldError();
    assert.equal(useFaceStore.getState().emotion, "idle");
    assert.equal(useFaceStore.getState().connected, true);
    assert.equal(nextSocket.closed, undefined);
    dispose(); dispose(); dispose = undefined;
    assert.equal(nextSocket.closed, true);
    const disposedMessage = nextSocket.onmessage;
    assert.equal(disposedMessage, null);
    assert.equal(timers.size, 0);
    assert.equal(useFaceStore.getState().connected, false);

    // Shallow hook harness: execute actual App handlers/effect with deterministic
    // state. This verifies routing/preview behavior, not browser DOM scheduling.
    const states = [];
    let stateIndex = 0;
    let mounted = false;
    const effects = [];
    const hooks = {
        useState(initial) {
            const index = stateIndex++;
            if (!(index in states)) states[index] = initial;
            return [states[index], (value) => { states[index] = value; }];
        },
        useEffect(effect) { if (!mounted) effects.push(effect); },
    };
    const appSource = (await readFile("src/App.tsx", "utf8"))
        .replace('import.meta.env.VITE_WS_ENABLED', '"true"').replaceAll('import.meta.env.DEV', 'true');
    const appCode = ts.transpileModule(appSource, { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    const imports = {
        "react": hooks,
        "react/jsx-runtime": jsx,
        "./components/face/mouth/MouthGeometryComparison": { default: MouthGeometryComparison },
        "./components/face/eyes/EyeGeometryComparison": { default: EyeGeometryComparison },
        "./components/face/FaceRenderer": { default: FaceRenderer },
        "./components/face/FullImageFaceRenderer": { default: FullImageFaceRenderer },
        "./components/face/ProductionGeometryComparison": { default: () => null },
        "./services/websocketClient": { connectFaceSocket },
        "./stores/faceStore": { useFaceStore: (selector) => selector(useFaceStore.getState()) },
        "./schemas/faceMessages": { EMOTIONS },
        "./animation/expressionController": { requestExpression, MANUAL_TRANSITION_MS },
    };
    const module = { exports: {} };
    compileFunction(appCode, ["require", "module", "exports"])((name) => {
        assert.ok(name in imports, "Unexpected App dependency: " + name);
        return imports[name];
    }, module, module.exports);
    const render = () => { stateIndex = 0; return module.exports.default(); };
    const find = (tree, predicate) => {
        if (!react.isValidElement(tree)) return undefined;
        if (predicate(tree)) return tree;
        for (const child of react.Children.toArray(tree.props.children)) {
            const match = find(child, predicate);
            if (match) return match;
        }
    };
    const button = (tree, label) => find(tree, (e) => e.type === "button" && e.props.children === label);
    const isPreview = (tree) => find(tree, (e) => e.type === FaceRenderer).props.transition;
    let tree = render();
    const stateBeforeRendererSwitch = useFaceStore.getState();
    for (const renderer of ["procedural", "asset"]) {
        find(tree, (e) => e.type === "select" && e.props["aria-label"] === "Live renderer")
            .props.onChange({ target: { value: renderer } });
        tree = render();
        assert.equal(find(tree, (e) => e.type === FaceRenderer).props.renderer, renderer);
        assert.strictEqual(useFaceStore.getState(), stateBeforeRendererSwitch);
    }
    mounted = true;
    dispose = effects[0]();
    socket = sockets.at(-1);
    const stateBeforePreview = useFaceStore.getState();
    button(tree, "happier-transition (preview only)").props.onClick();
    tree = render();
    assert.equal(isPreview(tree), true);
    assert.strictEqual(useFaceStore.getState(), stateBeforePreview);
    button(tree, "happy").props.onClick();
    tree = render();
    assert.equal(isPreview(tree), false);
    assert.equal(useFaceStore.getState().emotion, "happy");
    assert.equal(useFaceStore.getState().transitionMs, 300);
    assert.equal(useFaceStore.getState().source, "manual");
    button(tree, "happier-transition (preview only)").props.onClick();
    tree = render();
    socket.sendMessage(wire({ emotion: "shy" }));
    tree = render();
    assert.equal(isPreview(tree), true, "Rejected live input leaves preview unchanged");
    const beforeLiveDuplicate = useFaceStore.getState();
    socket.sendMessage(wire({ emotion: "happy", intensity: beforeLiveDuplicate.intensity }));
    tree = render();
    assert.equal(isPreview(tree), false, "Valid semantic duplicate still exits preview");
    assert.strictEqual(useFaceStore.getState(), beforeLiveDuplicate);
    button(tree, "happier-transition (preview only)").props.onClick();
    socket.sendMessage(wire({ emotion: "cry", intensity: 1, transition_ms: 789 }));
    tree = render();
    assert.equal(isPreview(tree), false);
    assert.equal(useFaceStore.getState().emotion, "cry");
    assert.equal(useFaceStore.getState().source, "websocket");
    assert.equal(useFaceStore.getState().requestId, "wire-id");
    assert.equal(useFaceStore.getState().transitionMs, 789);
    button(tree, "sad").props.onClick();
    tree = render();
    assert.equal(useFaceStore.getState().intensity, 1, "Manual request retains current intensity");
    assert.equal(useFaceStore.getState().requestId, undefined);
    assert.equal(useFaceStore.getState().source, "manual");
    assert.ok(find(tree, (e) => e.type === FullImageFaceRenderer));
    for (const emotion of EMOTIONS) assert.ok(button(tree, emotion));
    assert.equal(button(tree, "shy"), undefined);
    dispose(); dispose = undefined;
    assert.equal(timers.size, 0);
    console.log("PASS: controller defaults/validation/metadata/deduplication/latest-wins; strict parser; WebSocket routing/reset/reconnect/cleanup; App manual/live preview isolation (shallow hook harness).");
} finally {
    dispose?.();
    unsubscribe?.();
    globalThis.WebSocket = originalSocket;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    console.warn = originalWarn;
    await server.close();
}
