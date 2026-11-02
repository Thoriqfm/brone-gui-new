// Run from frontend: node scripts/verify-expression-transitions.mjs
import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { createServer } from "vite";

const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null }, appType: "custom" });
try {
    const { createAnimationEngine, loadAnimeDriver } = await server.ssrLoadModule("/src/animation/animationEngine.ts");
    const { createExpressionTransition } = await server.ssrLoadModule("/src/animation/expressionTransition.ts");
    const { useFaceStore } = await server.ssrLoadModule("/src/stores/faceStore.ts");
    const { requestExpression } = await server.ssrLoadModule("/src/animation/expressionController.ts");
    const { EMOTIONS } = await server.ssrLoadModule("/src/schemas/faceMessages.ts");
    const { default: FaceBase } = await server.ssrLoadModule("/src/components/face/FaceBase.tsx");
    const { default: Layer } = await server.ssrLoadModule("/src/components/face/ExpressionTransitionLayer.tsx");
    const { createElement } = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const pairedHtml = renderToStaticMarkup(createElement("div", { className: "face-artwork" },
        createElement(FaceBase, { expression: "idle" }),
        ...["idle", "cry"].map((expression, id) => createElement(Layer, {
            key: id, layer: { id, expression, initialOpacity: id === 0 ? 1 : 0 }, attach() {}, prepared() {},
        }))));
    assert.equal((pairedHtml.match(/class="expression-composition"/g) ?? []).length, 2);
    assert.ok(pairedHtml.includes('data-expression="idle" style="opacity:1"'));
    assert.ok(pairedHtml.includes('data-expression="cry" style="opacity:0"'));
    assert.equal((pairedHtml.match(/data-layer="faceBase"/g) ?? []).length, 1);
    assert.equal((pairedHtml.match(/data-layer="cryEffect"/g) ?? []).length, 2);
    const initial = { id: 0, expression: "idle", initialOpacity: 1 };
    const node = (opacity) => ({ isConnected: true, style: { opacity: String(opacity) } });
    function driverFixture() {
        const instances = [];
        return { instances, create(target, parameters) {
            assert.equal(parameters.autoplay, false);
            assert.deepEqual(Object.keys(parameters).filter((key) => !key.startsWith("on")).sort(),
                ["autoplay", "duration", "ease", "opacity"]);
            assert.equal(parameters.ease, "linear");
            const original = target.style.opacity;
            const instance = { target, parameters, cancelled: false, reverts: 0,
                play() {},
                cancel() { instance.cancelled = true; parameters.onPause?.(instance); },
                revert() { instance.cancelled = true; instance.reverts++; target.style.opacity = original; },
                seek(progress) {
                    if (instance.cancelled) return;
                    parameters.onBeforeUpdate?.(instance);
                    if (instance.cancelled) return;
                    const [from, to] = parameters.opacity;
                    target.style.opacity = String(from + (to - from) * progress);
                    parameters.onUpdate?.(instance);
                },
                complete() { instance.seek(1); parameters.onComplete(instance); },
            };
            instances.push(instance);
            return instance;
        } };
    }
    function reconcile(nodes, layers, attach) {
        for (const [id, item] of nodes) if (!layers.some((layer) => layer.id === id)) {
            attach(id, null); item.element.isConnected = false; nodes.delete(id);
        }
        for (const layer of layers) {
            const existing = nodes.get(layer.id);
            if (!existing) {
                const element = node(layer.initialOpacity);
                nodes.set(layer.id, { element, initialOpacity: layer.initialOpacity });
                attach(layer.id, element);
            } else if (existing.initialOpacity !== layer.initialOpacity) {
                existing.element.style.opacity = String(layer.initialOpacity);
                existing.initialOpacity = layer.initialOpacity;
            }
        }
        assert.ok(nodes.size <= 2, "Only two compositions may be retained");
    }
    function fixture(connected = true) {
        const driver = driverFixture();
        const engine = createAnimationEngine(driver);
        let notifications = 0;
        const coordinator = createExpressionTransition(initial, () => notifications++);
        const nodes = new Map();
        const render = (prepared = true) => {
            reconcile(nodes, coordinator.layers, coordinator.attach);
            if (prepared) for (const layer of coordinator.layers) coordinator.prepared(layer.id);
            coordinator.commit();
        };
        render();
        if (connected) coordinator.connect(engine);
        const complete = () => { driver.instances.slice(-2).forEach((run) => run.complete()); render(); };
        return { driver, engine, coordinator, nodes, render, complete,
            get notifications() { return notifications; },
            dispose() { coordinator.dispose(); engine.dispose(); },
        };
    }
    const semanticBefore = useFaceStore.getState();
    const f = fixture();
    assert.deepEqual(f.coordinator.layers, [initial]);
    assert.equal(f.driver.instances.length, 0);
    f.coordinator.request("happier", 300);
    assert.deepEqual(f.coordinator.layers.map((l) => l.expression), ["idle", "happier"]);
    assert.deepEqual(f.coordinator.layers.map((l) => l.initialOpacity), [1, 0]);
    f.render(false);
    assert.equal(f.driver.instances.length, 0, "Crossfade waits for incoming image readiness");
    f.render();
    assert.equal(f.driver.instances.length, 2);
    assert.deepEqual(f.driver.instances.map((i) => i.parameters.duration), [300, 300]);
    const [outgoing, incoming] = f.driver.instances;
    outgoing.seek(0.5); incoming.seek(0.5);
    assert.equal(Number(outgoing.target.style.opacity), 0.5);
    assert.equal(Number(incoming.target.style.opacity), 0.5);
    const publications = f.notifications;
    outgoing.seek(0.6); incoming.seek(0.6);
    assert.equal(f.notifications, publications, "Progress must not publish React state");
    outgoing.complete();
    assert.equal(f.coordinator.layers.length, 2, "Both opacity runs must complete");
    incoming.complete();
    f.render();
    assert.equal(f.coordinator.layers.length, 1);
    assert.equal(f.coordinator.layers[0].expression, "happier");
    assert.equal(f.nodes.size, 1);
    assert.equal(incoming.target.style.opacity, "1");
    assert.equal(outgoing.reverts, 1);
    const beforeDuplicate = f.notifications;
    f.coordinator.request("happier", 999);
    f.render();
    assert.equal(f.notifications, beforeDuplicate);
    assert.equal(f.driver.instances.length, 2);
    f.coordinator.request("cry", 0); f.render();
    assert.equal(f.coordinator.layers[0].expression, "cry");
    assert.equal(f.coordinator.layers.length, 1);
    assert.equal(f.driver.instances.length, 2, "Zero duration creates no animation");
    f.coordinator.request("sad", 600); f.render();
    const interrupted = f.driver.instances.slice(-2);
    interrupted[0].seek(0.2); interrupted[1].seek(0.2);
    f.coordinator.request("shock", 120); f.render(false);
    assert.equal(f.nodes.get(f.coordinator.layers[0].id).element.style.opacity, "1",
        "Retained outgoing face stays fully visible while new images decode");
    f.render();
    assert.deepEqual(f.coordinator.layers.map((l) => l.expression), ["cry", "shock"]);
    assert.ok(interrupted.every((run) => run.cancelled));
    const currentLayers = f.coordinator.layers;
    interrupted.forEach((run) => run.parameters.onComplete(run));
    assert.strictEqual(f.coordinator.layers, currentLayers);
    f.driver.instances.slice(-2).forEach((run) => run.seek(0.8));
    f.coordinator.request("thinking", 450); f.render();
    assert.deepEqual(f.coordinator.layers.map((l) => l.expression), ["shock", "thinking"]);
    const zeroInterrupted = f.driver.instances.slice(-2);
    f.coordinator.request("thinking", 0); f.render();
    assert.equal(f.coordinator.layers.length, 1);
    assert.equal(f.coordinator.layers[0].expression, "thinking");
    assert.ok(zeroInterrupted.every((run) => run.cancelled));
    for (const emotion of EMOTIONS) {
        f.coordinator.request(emotion, 0); f.render();
        if (f.coordinator.layers.length === 2) f.complete();
        assert.equal(f.coordinator.layers[0].expression, emotion);
    }
    const fallbackExpressions = EMOTIONS.filter((emotion) => emotion !== "idle");
    for (let i = 0; i < 50; i++) {
        f.coordinator.request(fallbackExpressions[i % fallbackExpressions.length], 75); f.render();
        assert.ok(f.coordinator.layers.length <= 2);
        assert.ok(f.driver.instances.filter((run) => run.reverts === 0).length <= 2,
            "Transition target renewal must bound engine undo history");
    }
    f.coordinator.request("happier-transition", 300, true); f.render();
    assert.equal(f.coordinator.layers.length, 1);
    assert.equal(f.coordinator.layers[0].expression, "happier-transition");
    assert.ok(!EMOTIONS.includes("happier-transition"));
    f.coordinator.request("happy", 300, true); f.render();
    assert.equal(f.coordinator.layers.length, 1, "Exiting preview also settles immediately");
    f.coordinator.request("sad", 300); f.render();
    const unmountedRuns = f.driver.instances.slice(-2);
    const beforeDispose = f.notifications;
    f.dispose(); f.dispose();
    unmountedRuns.forEach((run) => run.parameters.onComplete(run));
    assert.equal(f.notifications, beforeDispose);
    assert.ok(f.driver.instances.every((run) => run.reverts === 1));
    assert.equal(f.engine.disposed, true);
    assert.strictEqual(useFaceStore.getState(), semanticBefore);

    const cold = fixture(false);
    cold.coordinator.request("happy", 300); cold.render();
    assert.equal(cold.coordinator.layers.length, 1, "No-driver fallback is immediate");
    cold.coordinator.connect(cold.engine);
    assert.equal(cold.driver.instances.length, 0, "Readiness does not replay obsolete requests");
    cold.coordinator.request("cry", 100); cold.render(false);
    cold.coordinator.prepared(cold.coordinator.layers[1].id, false); cold.render();
    assert.equal(cold.coordinator.layers[0].expression, "cry");
    assert.equal(cold.coordinator.layers.length, 1, "Failed decoding uses immediate latest target");
    assert.equal(cold.driver.instances.length, 0);
    cold.dispose();

    // Real installed Anime.js v4 opacity arrays and duration, using JS object
    // accessors instead of a browser DOM. This is not visual verification.
    const realDriver = await loadAnimeDriver();
    const realRuns = [];
    const realEngine = createAnimationEngine({ create(target, parameters) {
        const run = realDriver.create(target, parameters); realRuns.push(run); return run;
    } });
    const realCoordinator = createExpressionTransition(initial, () => {});
    const realNodes = new Map();
    function realRender() {
        reconcile(realNodes, realCoordinator.layers, (id, element) => {
            if (element) Object.defineProperty(element, "opacity", {
                get: () => Number(element.style.opacity),
                set: (value) => { element.style.opacity = String(value); },
            });
            realCoordinator.attach(id, element);
        });
        for (const layer of realCoordinator.layers) realCoordinator.prepared(layer.id);
    }
    realRender(); realCoordinator.connect(realEngine);
    try {
        realCoordinator.request("happier", 300); realRender();
        assert.equal(realRuns.length, 2);
        realRuns.forEach((run) => run.seek(150));
        assert.deepEqual([...realNodes.values()].map((entry) => Number(entry.element.style.opacity)), [0.5, 0.5]);
        realRuns.forEach((run) => run.seek(300));
        realRender();
        assert.equal(realCoordinator.layers.length, 1);
        assert.equal([...realNodes.values()][0].element.style.opacity, "1");
    } finally { realCoordinator.dispose(); realEngine.dispose(); }

    // Real controller duplicates do not notify the renderer or replace duration.
    let updates = 0;
    const unsubscribe = useFaceStore.subscribe(() => updates++);
    requestExpression({ emotion: "happy", intensity: 0.5, transitionMs: 300, source: "manual" });
    const accepted = useFaceStore.getState();
    const before = updates;
    assert.equal(requestExpression({ emotion: "happy", intensity: 0.5, transitionMs: 999,
        requestId: "duplicate", source: "websocket" }), "duplicate");
    assert.strictEqual(useFaceStore.getState(), accepted);
    assert.equal(updates, before);
    unsubscribe();

    // Actual React-adapter logic with deterministic ref/effect/state primitives.
    const source = await readFile("src/animation/useExpressionTransition.ts", "utf8");
    const code = ts.transpileModule(source, { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    } }).outputText;
    function hookHarness(matches = false) {
        const cells = [];
        const nodes = new Map();
        const driver = driverFixture();
        const engine = createAnimationEngine(driver);
        const listeners = new Set();
        const media = { matches, addEventListener(_name, fn) { listeners.add(fn); },
            removeEventListener(_name, fn) { listeners.delete(fn); } };
        let index = 0, dirty = false, scheduled = [], output, onReady, release;
        let props = ["idle", 0, false];
        const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
        const hooks = {
            useState(value) {
                const i = index++;
                cells[i] ??= { value: typeof value === "function" ? value() : value };
                return [cells[i].value, (next) => { if (!Object.is(next, cells[i].value)) { cells[i].value = next; dirty = true; } }];
            },
            useRef(value) { const i = index++; return cells[i] ??= { current: value }; },
            useCallback(fn, deps) { const i = index++; if (!same(cells[i]?.deps, deps)) cells[i] = { fn, deps }; return cells[i].fn; },
            useLayoutEffect(effect, deps) {
                const i = index++;
                if (!same(cells[i]?.deps, deps)) scheduled.push(() => {
                    cells[i]?.cleanup?.(); cells[i] = { deps, cleanup: effect() };
                });
            },
        };
        const rootRef = { current: node(1) };
        const imports = { react: hooks, "./expressionTransition": { createExpressionTransition },
            "./useAnimationEngine": { useAnimationEngine(ready) { onReady = ready; return { rootRef }; } } };
        const module = { exports: {} };
        compileFunction(code, ["require", "module", "exports", "window"])((name) => {
            assert.ok(name in imports); return imports[name];
        }, module, module.exports, { matchMedia: () => media });
        function flush(nextProps = props) {
            props = nextProps;
            for (let n = 0; n < 15; n++) {
                dirty = false; index = 0; scheduled = [];
                output = module.exports.useExpressionTransition(...props);
                reconcile(nodes, output.layers, output.attach);
                for (const effect of scheduled) effect();
                if (!dirty) return output;
            }
            throw new Error("Hook did not settle");
        }
        return { driver, engine, media, listeners, flush,
            ready() { release = onReady(engine); },
            prepared() { for (const layer of output.layers) output.prepared(layer.id, true); },
            motion(value) { media.matches = value; for (const fn of listeners) fn(); },
            unmount() { release?.(); for (const cell of cells) cell?.cleanup?.(); engine.dispose(); },
        };
    }
    const hook = hookHarness();
    assert.equal(hook.flush().layers[0].expression, "idle");
    hook.ready();
    assert.equal(hook.flush(["happier", 321, false]).layers.length, 2);
    hook.prepared();
    assert.deepEqual(hook.driver.instances.map((run) => run.parameters.duration), [321, 321]);
    const active = hook.driver.instances.slice(-2);
    hook.motion(true);
    assert.equal(hook.flush().layers.length, 1);
    assert.equal(hook.flush().layers[0].expression, "happier");
    assert.ok(active.every((run) => run.cancelled));
    assert.equal(hook.flush(["cry", 999, false]).layers.length, 1);
    const motionCount = hook.driver.instances.length;
    hook.prepared();
    assert.equal(hook.driver.instances.length, motionCount);
    hook.motion(false);
    assert.equal(hook.flush(["shock", 300, false]).layers.length, 2);
    hook.prepared();
    assert.equal(hook.flush(["happier-transition", 300, true]).layers.length, 1);
    assert.equal(hook.flush(["thinking", 300, false]).layers.length, 1);
    hook.unmount();
    assert.equal(hook.listeners.size, 0);
    assert.equal(hook.engine.disposed, true);
    const reducedInitially = hookHarness(true);
    reducedInitially.flush(); reducedInitially.ready();
    assert.equal(reducedInitially.flush(["sad", 300, false]).layers.length, 1);
    assert.equal(reducedInitially.driver.instances.length, 0);
    reducedInitially.unmount();
    console.log("PASS: initial/static rendering, decode readiness, crossfade start/completion, duration/zero, duplicates, all seven expressions, bounded rapid interruption, stale callbacks, preview isolation, reduced motion and hook/unmount cleanup. Browser visuals not tested.");
} finally { await server.close(); }
