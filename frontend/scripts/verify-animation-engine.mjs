// Run from frontend: node scripts/verify-animation-engine.mjs
// Deterministic lifecycle checks, installed Anime.js object-target API smoke test,
// and a shallow hook lifecycle harness. No browser animation claim.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { createServer } from "vite";

const server = await createServer({
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null }, appType: "custom",
});
try {
    const { createAnimationEngine, loadAnimeDriver } = await server.ssrLoadModule("/src/animation/animationEngine.ts");
    const { useFaceStore } = await server.ssrLoadModule("/src/stores/faceStore.ts");
    const semanticSnapshot = useFaceStore.getState();
    const callbacks = ["onBegin", "onBeforeUpdate", "onUpdate", "onLoop", "onPause", "onComplete", "onRender"];
    function fakeDriver() {
        const instances = [];
        const events = [];
        return {
            instances, events,
            create(target, parameters) {
                assert.equal(parameters.autoplay, false, "Ownership must attach before playback");
                const original = target.value;
                const id = instances.length;
                const instance = {
                    target, parameters, cancelled: false, cancels: 0, reverts: 0, plays: 0,
                    emit(name) { parameters[name]?.(instance); },
                    play() { instance.plays++; events.push([id, "play"]); instance.emit("onBegin"); },
                    cancel() { instance.cancelled = true; instance.cancels++; events.push([id, "cancel"]); instance.emit("onPause"); },
                    revert() { instance.reverts++; target.value = original; events.push([id, "revert"]); instance.emit("onComplete"); },
                };
                instances.push(instance);
                events.push([id, "create"]);
                instance.emit("onRender"); // Construction-time callbacks must be suppressed.
                return instance;
            },
        };
    }
    const node = () => ({ isConnected: true, value: 0 });
    const driver = fakeDriver();
    const engine = createAnimationEngine(driver);
    assert.equal(engine.disposed, false);
    assert.equal(engine.hasTarget("eyes"), false);
    assert.equal(engine.start("missing", {}), false);
    const eyes = node();
    const mouth = node();
    const unregisterEyes = engine.registerTarget("eyes", eyes);
    const unregisterMouth = engine.registerTarget("mouth", mouth);
    assert.equal(engine.hasTarget("eyes"), true);
    assert.equal(engine.isAnimating("eyes"), false);
    assert.throws(() => engine.registerTarget("eyes", node()), /already registered/);
    assert.throws(() => engine.registerTarget("alias", eyes), /already registered/);
    assert.throws(() => engine.registerTarget("detached", { isConnected: false }), /connected/);
    let invoked = 0;
    const parameters = Object.fromEntries(callbacks.map((name) => [name, () => invoked++]));
    assert.equal(engine.start("eyes", parameters), true);
    const first = driver.instances[0];
    assert.strictEqual(first.target, eyes);
    assert.equal(first.plays, 1);
    assert.equal(invoked, 1, "Only play's onBegin should have fired, not create's onRender");
    assert.equal(engine.isAnimating("eyes"), true);
    eyes.value = 4;
    assert.equal(engine.start("eyes", {}), true);
    const replacement = driver.instances[1];
    assert.equal(first.cancels, 1);
    assert.equal(first.reverts, 0, "Interruption must not rewind");
    assert.equal(eyes.value, 4);
    assert.deepEqual(driver.events.slice(1, 4), [[0, "play"], [0, "cancel"], [1, "create"]]);
    assert.equal(invoked, 1, "Cancellation must suppress onPause before touching the driver");
    const afterReplacement = invoked;
    for (const name of callbacks) first.emit(name);
    assert.equal(invoked, afterReplacement, "Stale callbacks must not reach callers");
    assert.equal(engine.isAnimating("eyes"), true, "Stale completion cannot clear its replacement");
    assert.equal(engine.start("mouth", {}), true);
    const mouthRun = driver.instances[2];
    engine.cancel("eyes");
    assert.equal(replacement.cancels, 1);
    assert.equal(mouthRun.cancels, 0);
    assert.equal(engine.isAnimating("eyes"), false);
    assert.equal(engine.isAnimating("mouth"), true);
    assert.equal(eyes.value, 4);
    engine.cancel("eyes");
    engine.cancel("missing");
    assert.equal(replacement.cancels, 1);
    engine.cancelAll();
    assert.equal(mouthRun.cancels, 1);
    assert.equal(engine.isAnimating("mouth"), false);
    assert.equal(engine.hasTarget("mouth"), true);

    let completed = 0;
    engine.start("eyes", { onComplete: () => completed++ });
    const finished = driver.instances.at(-1);
    finished.emit("onComplete"); finished.emit("onComplete");
    assert.equal(completed, 1);
    assert.equal(engine.isAnimating("eyes"), false);
    eyes.value = 8;
    unregisterEyes();
    assert.equal(engine.hasTarget("eyes"), false);
    assert.equal(eyes.value, 0, "Reverse revert chain must restore the original state");
    for (const instance of driver.instances.filter((i) => i.target === eyes)) assert.equal(instance.reverts, 1);
    const unregisterNewEyes = engine.registerTarget("eyes", eyes);
    unregisterEyes();
    assert.equal(engine.hasTarget("eyes"), true, "Old cleanup must not unregister a new owner");
    engine.start("eyes", {});
    const removed = driver.instances.at(-1);
    unregisterNewEyes();
    assert.equal(removed.cancels, 1);
    assert.equal(removed.reverts, 1);
    assert.equal(engine.start("eyes", {}), false);
    unregisterNewEyes();

    const detach = node();
    engine.registerTarget("detaching", detach);
    let detachedCallbacks = 0;
    engine.start("detaching", { onBeforeUpdate: () => detachedCallbacks++ });
    const detachedRun = driver.instances.at(-1);
    detach.isConnected = false;
    detachedRun.emit("onBeforeUpdate");
    assert.equal(detachedCallbacks, 0);
    assert.equal(engine.hasTarget("detaching"), false);
    assert.equal(detachedRun.cancels, 1);
    assert.equal(detachedRun.reverts, 1);
    const detachBeforeStart = node();
    engine.registerTarget("already-removed", detachBeforeStart);
    detachBeforeStart.isConnected = false;
    assert.equal(engine.start("already-removed", {}), false);
    assert.equal(engine.hasTarget("already-removed"), false);

    const independentDriver = fakeDriver();
    const independent = createAnimationEngine(independentDriver);
    independent.registerTarget("mouth", node());
    independent.start("mouth", {});
    engine.start("mouth", {});
    const current = driver.instances.at(-1);
    engine.dispose(); engine.dispose(); unregisterMouth();
    assert.equal(engine.disposed, true);
    assert.equal(engine.hasTarget("mouth"), false);
    assert.equal(current.cancels, 1);
    for (const instance of driver.instances) assert.equal(instance.reverts, 1);
    for (const instance of driver.instances) for (const name of callbacks) instance.emit(name);
    assert.equal(completed, 1);
    assert.equal(engine.start("mouth", {}), false);
    assert.throws(() => engine.registerTarget("mouth", node()), /disposed/);
    assert.equal(independent.isAnimating("mouth"), true);
    independent.dispose();

    // A failed creation must not leave an active token, and later requests work.
    let fail = true;
    const recoveryDriver = fakeDriver();
    const recovering = createAnimationEngine({ create(...args) {
        if (fail) throw new Error("creation failure");
        return recoveryDriver.create(...args);
    } });
    recovering.registerTarget("target", node());
    assert.throws(() => recovering.start("target", {}), /creation failure/);
    assert.equal(recovering.isAnimating("target"), false);
    fail = false;
    assert.equal(recovering.start("target", {}), true);
    recovering.dispose();

    // Reentrant callbacks cannot let an old start failure cancel its replacement.
    const reentrantDriver = fakeDriver();
    const reentrant = createAnimationEngine(reentrantDriver);
    reentrant.registerTarget("target", node());
    assert.throws(() => reentrant.start("target", { onBegin() {
        reentrant.start("target", {});
        throw new Error("old callback failure");
    } }), /old callback failure/);
    assert.equal(reentrant.isAnimating("target"), true);
    assert.equal(reentrantDriver.instances[1].cancels, 0);
    reentrant.dispose();

    // One faulty cleanup must not strand other owned targets/resources.
    const cleanupDriver = fakeDriver();
    const cleanupEngine = createAnimationEngine(cleanupDriver);
    cleanupEngine.registerTarget("first", node());
    cleanupEngine.registerTarget("second", node());
    cleanupEngine.start("first", {});
    cleanupEngine.start("second", {});
    cleanupDriver.instances[0].revert = () => { throw new Error("revert failure"); };
    assert.throws(() => cleanupEngine.dispose(), AggregateError);
    assert.equal(cleanupDriver.instances[1].reverts, 1);
    assert.equal(cleanupEngine.hasTarget("first"), false);
    assert.equal(cleanupEngine.hasTarget("second"), false);
    cleanupEngine.dispose();

    // Production adapter: actual installed v4 APIs, plain JS object (no DOM).
    const packageInfo = JSON.parse(await readFile("node_modules/animejs/package.json", "utf8"));
    assert.equal(packageInfo.version, "4.5.0");
    const production = await loadAnimeDriver();
    const object = { value: 0 };
    const real = production.create(object, { value: [0, 10], duration: 100, ease: "linear", autoplay: false });
    try {
        for (const method of ["play", "cancel", "revert", "seek"]) assert.equal(typeof real[method], "function");
        real.seek(40);
        assert.equal(object.value, 4);
        real.cancel();
        assert.equal(object.value, 4, "Real v4 cancellation preserves current values");
    } finally { real.revert(); }
    assert.equal(object.value, 0, "Real v4 revert restores the original value");
    const realRuns = [];
    const productionEngine = createAnimationEngine({ create(target, parameters) {
        const instance = production.create(target, parameters); realRuns.push(instance); return instance;
    } });
    const realTarget = node();
    productionEngine.registerTarget("object", realTarget);
    try {
        productionEngine.start("object", { value: 10, duration: 100, ease: "linear" });
        realRuns[0].seek(40);
        assert.equal(realTarget.value, 4);
        productionEngine.start("object", { value: 20, duration: 100, ease: "linear" });
        assert.equal(realTarget.value, 4, "Real replacement does not rewind the first run");
        realRuns[1].seek(50);
        assert.equal(realTarget.value, 12);
        productionEngine.cancelAll();
        assert.equal(realTarget.value, 12);
    } finally { productionEngine.dispose(); }
    assert.equal(realTarget.value, 0, "Real engine revert chain unwinds both runs");

    // Shallow hook harness: refs, effect setup/cleanup and deferred driver loads.
    // No DOM mounting or browser paint/scheduling is claimed.
    const hookSource = await readFile("src/animation/useAnimationEngine.ts", "utf8");
    const hookCode = ts.transpileModule(hookSource, { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    } }).outputText;
    function hookHarness() {
        const refs = [];
        const pending = [];
        const engines = [];
        const fake = fakeDriver();
        let index = 0;
        let setup;
        const imports = {
            react: {
                useRef(initial) { const i = index++; return refs[i] ??= { current: initial }; },
                useLayoutEffect(effect) { setup ??= effect; },
            },
            "./animationEngine": {
                createAnimationEngine(driver) { const e = createAnimationEngine(driver); engines.push(e); return e; },
                loadAnimeDriver: () => new Promise((resolve) => pending.push(resolve)),
            },
        };
        const module = { exports: {} };
        compileFunction(hookCode, ["require", "module", "exports"])((name) => {
            assert.ok(name in imports); return imports[name];
        }, module, module.exports);
        return {
            pending, engines, fake,
            render(onReady) { index = 0; return module.exports.useAnimationEngine(onReady); },
            setup() { return setup(); },
        };
    }
    const hook = hookHarness();
    const refs = hook.render();
    assert.strictEqual(hook.render().engineRef, refs.engineRef);
    assert.equal(hook.engines.length, 0, "Rendering/import alone must not initialize an engine");
    assert.equal(refs.engineRef.current, null);
    refs.rootRef.current = node();
    const cleanupFirst = hook.setup();
    cleanupFirst(); // StrictMode cleanup before async initialization completes.
    const cleanupSecond = hook.setup();
    hook.pending[0](hook.fake);
    await Promise.resolve();
    assert.equal(hook.engines.length, 0, "Disposed async mount must not initialize");
    hook.pending[1](hook.fake);
    await Promise.resolve();
    const mounted = refs.engineRef.current;
    assert.equal(mounted.hasTarget("face-root"), true);
    assert.equal(hook.fake.instances.length, 0, "Mount must not start facial animation");
    hook.render();
    assert.strictEqual(refs.engineRef.current, mounted, "Rerender must reuse the engine");
    const otherHook = hookHarness();
    const otherRefs = otherHook.render();
    otherRefs.rootRef.current = node();
    const cleanupOther = otherHook.setup();
    otherHook.pending[0](otherHook.fake);
    await Promise.resolve();
    assert.notStrictEqual(otherRefs.engineRef.current, mounted);
    mounted.start("face-root", {});
    const owned = hook.fake.instances.at(-1);
    cleanupSecond(); cleanupSecond();
    assert.equal(refs.engineRef.current, null);
    assert.equal(mounted.disposed, true);
    assert.equal(owned.cancels, 1);
    assert.equal(owned.reverts, 1);
    assert.equal(otherRefs.engineRef.current.disposed, false);
    cleanupOther();
    const cleanupRemount = hook.setup();
    hook.pending[2](hook.fake);
    await Promise.resolve();
    assert.notStrictEqual(refs.engineRef.current, mounted);
    assert.equal(refs.engineRef.current.disposed, false);
    const remounted = refs.engineRef.current;
    cleanupSecond();
    assert.strictEqual(refs.engineRef.current, remounted, "Old cleanup cannot clear a remounted engine");
    cleanupRemount();
    // Root detached while the driver load is pending must not be registered.
    const detachedHook = hookHarness();
    const detachedRefs = detachedHook.render();
    detachedRefs.rootRef.current = node();
    const cleanupDetached = detachedHook.setup();
    detachedRefs.rootRef.current = null;
    detachedHook.pending[0](detachedHook.fake);
    await Promise.resolve();
    assert.equal(detachedHook.engines.length, 0);
    cleanupDetached();
    const consumerHook = hookHarness();
    let released = 0;
    const consumerRefs = consumerHook.render((engine) => {
        assert.equal(engine.hasTarget("face-root"), true);
        return () => { released++; assert.equal(engine.disposed, false, "Consumer releases targets before engine disposal"); };
    });
    consumerRefs.rootRef.current = node();
    const releaseConsumerHook = consumerHook.setup();
    consumerHook.pending[0](consumerHook.fake);
    await Promise.resolve();
    releaseConsumerHook(); releaseConsumerHook();
    assert.equal(released, 1, "Readiness consumer cleanup is idempotent");
    assert.strictEqual(useFaceStore.getState(), semanticSnapshot, "Engine activity must not mutate semantic Zustand state");
    console.log("PASS: engine registry/ownership/replacement/cancellation/disposal/stale callbacks/isolation; Anime.js 4.5.0 adapter object-target smoke test; shallow hook StrictMode-style lifecycle/async cleanup. No facial animations started.");
} finally {
    await server.close();
}
