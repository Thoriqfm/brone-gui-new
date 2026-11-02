// Run from frontend: node scripts/verify-element-transitions.mjs
import assert from "node:assert/strict";
import { realpath, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";

const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null }, appType: "custom" });
try {
    const { createAnimationEngine, loadAnimeDriver } = await server.ssrLoadModule("/src/animation/animationEngine.ts");
    const { createExpressionTransition } = await server.ssrLoadModule("/src/animation/expressionTransition.ts");
    const { selectTransitionStrategy } = await server.ssrLoadModule("/src/animation/transitionStrategy.ts");
    const { idleToHappy, IDLE_TO_HAPPY } = await server.ssrLoadModule("/src/animation/presets/idleToHappy.ts");
    const { FACE_LAYER_COMPOSITIONS: compositions } = await server.ssrLoadModule("/src/config/faceLayerAssets.ts");
    const { FACE_LAYER_LAYOUTS: layouts } = await server.ssrLoadModule("/src/config/faceLayerLayouts.ts");
    const { EMOTIONS } = await server.ssrLoadModule("/src/schemas/faceMessages.ts");
    const { useFaceStore } = await server.ssrLoadModule("/src/stores/faceStore.ts");
    const canonical = useFaceStore.getState();
    assert.equal(selectTransitionStrategy("idle", "happy", 300), "ELEMENT_BASED");
    for (const from of EMOTIONS) for (const to of EMOTIONS) {
        if (from !== "idle" || to !== "happy") assert.equal(selectTransitionStrategy(from, to, 300), "CROSSFADE");
        assert.equal(selectTransitionStrategy(from, to, 0), "IMMEDIATE");
        assert.equal(selectTransitionStrategy(from, to, 300, true), "IMMEDIATE");
    }
    assert.equal(selectTransitionStrategy("happier-transition", "happy", 300), "IMMEDIATE");
    assert.equal(compositions.idle.leftEye, compositions.happy.leftEye);
    assert.equal(compositions.idle.rightEye, compositions.happy.rightEye);
    assert.deepEqual(layouts.idle.leftEye, layouts.happy.leftEye);
    assert.deepEqual(layouts.idle.rightEye, layouts.happy.rightEye);
    assert.deepEqual(layouts.idle.faceBase, layouts.happy.faceBase);
    assert.deepEqual(layouts.idle.faceLines, layouts.happy.faceLines);
    assert.notEqual(compositions.idle.mouth, compositions.happy.mouth);
    assert.equal(compositions.happy.effects.length, 0);

    for (const duration of [1, 300, 777]) {
        const preset = idleToHappy(duration);
        assert.deepEqual(preset.map((entry) => entry.target), ["left-eye", "right-eye", "mouth-outgoing", "mouth"]);
        assert.equal(preset[0].parameters.delay, 0);
        assert.ok(preset[1].parameters.delay > preset[0].parameters.delay);
        assert.ok(preset[3].parameters.delay > preset[1].parameters.delay);
        for (const entry of preset) {
            const p = entry.parameters;
            assert.ok(Math.abs((p.delay ?? 0) + p.duration - duration) < 1e-8 || entry.target === "mouth-outgoing");
            assert.ok((p.delay ?? 0) + p.duration <= duration + 1e-8);
            for (const forbidden of ["x", "y", "rotate", "scaleX", "scaleY", "width", "height", "left", "top"]) {
                assert.ok(!(forbidden in p), "Only uniform scale and opacity are allowed");
            }
        }
    }
    assert.ok(IDLE_TO_HAPPY.leftEye.peakScale < 1.03);
    assert.ok(IDLE_TO_HAPPY.incomingMouth.startScale >= 0.95);
    function node(key, opacity = 1) {
        let scale = 1;
        const element = { key, isConnected: true, style: { opacity: String(opacity), transform: "" } };
        Object.defineProperties(element, {
            scale: { get: () => scale, set(value) { scale = Number(value); element.style.transform = "scale(" + value + ")"; } },
            opacity: { get: () => Number(element.style.opacity), set(value) { element.style.opacity = String(value); } },
        });
        return element;
    }
    function fakeDriver() {
        const runs = [];
        return { runs, create(target, parameters) {
            const original = { scale: target.scale, opacity: target.style.opacity, transform: target.style.transform };
            const run = { target, parameters, cancelled: false, reverts: 0,
                play() { for (const property of ["scale", "opacity"]) if (parameters[property]) target[property] = parameters[property][0]; },
                cancel() { run.cancelled = true; },
                revert() { run.reverts++; run.cancelled = true; target.scale = original.scale;
                    target.style.opacity = original.opacity; target.style.transform = original.transform; },
                seek(time) {
                    if (run.cancelled) return;
                    const progress = Math.max(0, Math.min(1, (time - (parameters.delay ?? 0)) / parameters.duration));
                    for (const property of ["scale", "opacity"]) {
                        const values = parameters[property];
                        if (!values) continue;
                        const segment = Math.min(values.length - 2, Math.floor(progress * (values.length - 1)));
                        const fraction = progress * (values.length - 1) - segment;
                        target[property] = values[segment] + (values[segment + 1] - values[segment]) * fraction;
                    }
                },
                finish() { run.seek((parameters.delay ?? 0) + parameters.duration); parameters.onComplete(run); },
            };
            runs.push(run); return run;
        } };
    }
    function fixture(driver = fakeDriver()) {
        const engine = createAnimationEngine(driver);
        let publications = 0;
        const c = createExpressionTransition({ id: 0, expression: "idle", initialOpacity: 1 }, () => publications++);
        const parts = new Map(), bindings = new Map(), groups = new Map();
        function render(prepare = true) {
            const layers = c.layers, incoming = layers.at(-1);
            const elementLayout = layers.length === 1 ? ["idle", "happy"].includes(incoming.expression)
                : incoming.strategy === "ELEMENT_BASED";
            const desired = new Map();
            if (elementLayout) {
                for (const role of ["left-eye", "right-eye"]) {
                    if (!parts.has(role)) parts.set(role, node(role));
                    desired.set(role, parts.get(role));
                }
                for (const [index, layer] of layers.entries()) {
                    const key = compositions[layer.expression].mouth;
                    const role = index < layers.length - 1 ? "mouth-outgoing" : "mouth";
                    if (!parts.has(key)) parts.set(key, node(key, role === "mouth" && layers.length > 1 ? 0 : 1));
                    desired.set(role, parts.get(key));
                }
            }
            for (const [role, element] of bindings) if (desired.get(role) !== element) {
                c.attachElement(role, null); bindings.delete(role);
            }
            for (const [role, element] of desired) if (bindings.get(role) !== element) {
                c.attachElement(role, element); bindings.set(role, element);
            }
            for (const [id, element] of groups) if (elementLayout || !layers.some((layer) => layer.id === id)) {
                c.attach(id, null); element.isConnected = false; groups.delete(id);
            }
            if (!elementLayout) for (const layer of layers) if (!groups.has(layer.id)) {
                const element = node("composition-" + layer.id, layer.initialOpacity);
                groups.set(layer.id, element); c.attach(layer.id, element);
            }
            if (prepare) c.prepared(incoming.id, true);
            c.commit();
        }
        render(); c.connect(engine);
        return { driver, engine, c, parts, bindings, groups, render,
            get publications() { return publications; },
            dispose() { c.dispose(); engine.dispose(); },
        };
    }
    const f = fixture();
    const left = f.parts.get("left-eye"), right = f.parts.get("right-eye");
    assert.notStrictEqual(left, right);
    assert.equal(f.engine.hasTarget("expression-element-left-eye"), true);
    assert.equal(f.engine.hasTarget("expression-element-right-eye"), true);
    assert.equal(f.engine.hasTarget("expression-element-mouth"), true);
    assert.equal(f.engine.hasTarget("expression-element-effect:mark"), false, "Happy has no effect to register");
    const effect = node("test-effect");
    f.c.attachElement("effect:test", effect);
    assert.equal(f.engine.hasTarget("expression-element-effect:test"), true);
    f.c.attachElement("effect:test", null);
    assert.equal(f.engine.hasTarget("expression-element-effect:test"), false);
    f.c.request("happy", 300); f.render(false);
    assert.equal(f.driver.runs.length, 0, "Preparation is required");
    f.render();
    assert.equal(f.groups.size, 0, "Element mode must not mount two face compositions");
    assert.equal(f.driver.runs.length, 4);
    assert.strictEqual(f.parts.get("left-eye"), left);
    assert.strictEqual(f.parts.get("right-eye"), right);
    assert.ok(f.engine.hasTarget("expression-element-mouth-outgoing"));
    const count = f.publications;
    f.driver.runs.forEach((run) => run.seek(150));
    assert.equal(f.publications, count);
    assert.ok(left.scale > 1 && right.scale > 1);
    const beforeRepeat = f.driver.runs.length;
    f.c.request("happy", 999); f.render();
    assert.equal(f.driver.runs.length, beforeRepeat, "Repeated target must not restart");
    f.driver.runs.slice(0, 3).forEach((run) => run.finish());
    assert.equal(f.c.layers.length, 2, "All independent targets must finish");
    f.driver.runs[3].finish(); f.render();
    assert.equal(f.c.layers.length, 1);
    assert.equal(f.c.layers[0].expression, "happy");
    for (const element of f.bindings.values()) {
        assert.equal(element.scale, 1); assert.equal(element.style.transform, "");
    }
    assert.equal(f.bindings.get("mouth").style.opacity, "1");
    assert.equal(f.bindings.has("mouth-outgoing"), false);
    assert.ok(f.driver.runs.every((run) => run.reverts === 1));
    f.dispose(); f.dispose();

    const interrupted = fixture();
    interrupted.c.request("happy", 777); interrupted.render();
    const oldRuns = [...interrupted.driver.runs];
    oldRuns.forEach((run) => run.seek(388));
    const oldNodes = [...interrupted.bindings.values()];
    interrupted.c.request("cry", 400);
    assert.deepEqual(interrupted.c.layers.map((layer) => layer.expression), ["happy", "cry"]);
    for (const element of oldNodes) assert.equal(element.style.transform, "");
    assert.ok(oldRuns.every((run) => run.cancelled && run.reverts === 1));
    interrupted.render();
    assert.equal(interrupted.groups.size, 2, "Other transitions use the existing crossfade fallback");
    const activeLayers = interrupted.c.layers;
    oldRuns.forEach((run) => run.parameters.onComplete(run));
    assert.strictEqual(interrupted.c.layers, activeLayers);
    const crossfade = interrupted.driver.runs.slice(-2);
    assert.ok(crossfade.every((run) => run.parameters.opacity && !run.parameters.scale));
    crossfade.forEach((run) => run.finish()); interrupted.render();
    assert.equal(interrupted.c.layers[0].expression, "cry");
    interrupted.dispose();

    for (const immediate of [false, true]) {
        const fallback = fixture();
        fallback.c.request("happy", immediate ? 300 : 0, immediate); fallback.render();
        assert.equal(fallback.c.layers.length, 1);
        assert.equal(fallback.driver.runs.length, 0);
        fallback.dispose();
    }
    const rapid = fixture();
    for (let i = 0; i < 20; i++) {
        rapid.c.request("idle", 0); rapid.render();
        rapid.c.request("happy", 300); rapid.render();
        rapid.driver.runs.slice(-4).forEach((run) => run.seek(150));
        rapid.c.request("happy", 0, true); rapid.render();
        assert.equal(rapid.c.layers.length, 1);
        assert.ok(rapid.driver.runs.every((run) => run.reverts === 1));
        for (const element of rapid.bindings.values()) assert.equal(element.style.transform, "");
    }
    rapid.c.request("idle", 0); rapid.render();
    rapid.c.request("happy", 300); rapid.render();
    const unmountRuns = rapid.driver.runs.slice(-4);
    rapid.dispose();
    const disposedLayers = rapid.c.layers;
    unmountRuns.forEach((run) => run.parameters.onComplete(run));
    assert.strictEqual(rapid.c.layers, disposedLayers);
    assert.ok(rapid.driver.runs.every((run) => run.reverts === 1));
    assert.equal(rapid.engine.hasTarget("expression-element-left-eye"), false);

    // Actual v4 adapter with object targets/accessors, not a browser DOM.
    const packageInfo = JSON.parse(await readFile("node_modules/animejs/package.json", "utf8"));
    assert.equal(packageInfo.version, "4.5.0");
    const production = await loadAnimeDriver();
    const realRuns = [];
    const real = fixture({ create(target, parameters) {
        const instance = production.create(target, parameters); realRuns.push(instance); return instance;
    } });
    try {
        real.c.request("happy", 300); real.render();
        assert.equal(realRuns.length, 4);
        realRuns.forEach((run) => run.seek(150));
        assert.ok(real.parts.get("left-eye").scale > 1 && real.parts.get("left-eye").scale <= 1.025);
        assert.ok(real.parts.get("right-eye").scale > 1 && real.parts.get("right-eye").scale <= 1.022);
        assert.ok(real.bindings.get("mouth").scale >= 0.97 && real.bindings.get("mouth").scale <= 1);
        realRuns.forEach((run) => run.seek(300)); real.render();
        assert.equal(real.c.layers.length, 1);
        for (const element of real.bindings.values()) {
            assert.equal(element.scale, 1); assert.equal(element.style.transform, "");
        }
        assert.equal(real.bindings.get("mouth").style.opacity, "1");
    } finally { real.dispose(); }

    // Actual composition markup: one shared base/line/eye set, only mouth overlap.
    const { createElement } = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const { default: ElementLayer } = await server.ssrLoadModule("/src/components/face/ElementExpressionLayer.tsx");
    const { default: FaceBase } = await server.ssrLoadModule("/src/components/face/FaceBase.tsx");
    const { default: Effects } = await server.ssrLoadModule("/src/components/face/FaceEffects.tsx");
    const { default: Renderer } = await server.ssrLoadModule("/src/components/face/FaceRenderer.tsx");
    const pair = [{ id: 0, expression: "idle", initialOpacity: 1 },
        { id: 1, expression: "happy", initialOpacity: 0, strategy: "ELEMENT_BASED" }];
    const html = renderToStaticMarkup(createElement("div", { className: "face-artwork" },
        createElement(FaceBase, { expression: "happy" }),
        createElement(ElementLayer, { layers: pair, attachElement() {}, prepared() {} })));
    for (const asset of ["faceBase", "faceLines", "idleLeft", "idleRight", "idleMouth", "happierMouth"]) {
        assert.equal((html.match(new RegExp('data-layer="' + asset + '"', "g")) ?? []).length, 1, asset);
    }
    assert.ok(!html.includes('class="expression-composition"'));
    const finalHtml = renderToStaticMarkup(createElement(ElementLayer, {
        layers: [pair[1]], attachElement() {}, prepared() {},
    }));
    assert.ok(finalHtml.includes('data-layer="happierMouth"'));
    assert.ok(!finalHtml.includes('data-layer="idleMouth"'));
    const mouthStyle = finalHtml.match(/data-element-role="mouth" style="([^"]+)"/)?.[1];
    assert.ok(mouthStyle, "Final mouth must have approved layout");
    const css = Object.fromEntries(mouthStyle.split(";").filter(Boolean).map((part) => part.split(":")));
    for (const [property, logical, extent] of [["left", 259.5, 800], ["top", 287.75, 480], ["width", 282, 800], ["height", 155, 480]]) {
        assert.ok(Math.abs(parseFloat(css[property]) / 100 * extent - logical) < 1e-9, property);
    }
    const effectsHtml = renderToStaticMarkup(createElement(Effects, { expression: "cry", attachEffect() {} }));
    assert.ok(effectsHtml.includes('data-element-role="effect:tearLeft"'));
    assert.ok(effectsHtml.includes('data-element-role="effect:tearRight"'));
    for (const expression of EMOTIONS) {
        // SSR uses its initial store snapshot; seed only that test snapshot.
        const initialSnapshot = useFaceStore.getInitialState();
        const prior = { ...initialSnapshot };
        Object.assign(initialSnapshot, { emotion: expression, transitionMs: 0 });
        const staticHtml = renderToStaticMarkup(createElement(Renderer));
        Object.assign(initialSnapshot, prior);
        assert.ok(staticHtml.includes("Brone " + expression));
        assert.equal((staticHtml.match(/data-layer="faceBase"/g) ?? []).length, 1);
        assert.equal((staticHtml.match(/data-layer="faceLines"/g) ?? []).length, 1);
        assert.ok(staticHtml.includes('data-layer="' + compositions[expression].mouth + '"'));
    }
    assert.strictEqual(useFaceStore.getState(), canonical, "Animation must not mutate semantic state");
    console.log("PASS: strategy, independent targets/effects, restrained preset/timing, completion/reset, interruption/immediate/reduced motion, bounded cleanup, actual Anime.js 4.5.0 adapter, shared-base/eye markup, all seven static endpoints and crossfade fallback. Browser visuals not tested.");
} finally { await server.close(); }
