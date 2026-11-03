// Run from frontend. Real SSR markup + production frame callbacks; no new dependencies.
import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { createServer } from "vite";
import { Element, parse, normalize } from "./production-renderer-test-dom.mjs";

const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
    const load = name => server.ssrLoadModule("/src/" + name);
    const motion = await load("animation/faceEffectMotion.ts");
    const { EMOTIONS } = await load("schemas/faceMessages.ts");
    const { FACE_LAYER_COMPOSITIONS } = await load("config/faceLayerAssets.ts");
    const { FACE_LAYER_LAYOUTS } = await load("config/faceLayerLayouts.ts");
    const { useFaceStore } = await load("stores/faceStore.ts");
    const react = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const jsx = await import(pathToFileURL(await realpath("node_modules/react/jsx-runtime.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const render = (component, props) => parse(renderToStaticMarkup(react.createElement(component, props)));
    const { default: Effects } = await load("components/face/FaceEffects.tsx");
    const before = useFaceStore.getState();
    let samples = 0;
    for (const expression of EMOTIONS) for (const other of EMOTIONS) if (expression !== other) {
        for (const phase of ["enter", "exit"]) {
            const root = render(Effects, { expression, motion: true, resting: false });
            const count = FACE_LAYER_COMPOSITIONS[expression].effects.length;
            assert.equal(root.querySelectorAll("[data-element-role]").length, count);
            let previousClip = 100, previousOffset = 0;
            for (let i = 0; i <= 100; i++) {
                const p = i / 100;
                motion.updateFaceEffectMotion(root, expression, phase, p, other);
                const frame = motion.sampleFaceEffectMotion(expression, phase, p, other);
                assert.ok(frame.opacity >= 0 && frame.opacity <= 1);
                assert.ok(frame.scale > 0 && frame.scale <= 1.081);
                for (const node of root.querySelectorAll("[data-element-role]")) {
                    assert.equal(Number(node.style.opacity), frame.opacity);
                    assert.equal(node.querySelector("img").getAttribute("src").includes("assets/face-layers/effects/"), true);
                    if (expression === "cry") {
                        assert.equal(node.style.opacity, "1", "tears never fade");
                        assert.equal(node.style.transform, "translateY(0%) scale(1)", "tear origin and artwork stay fixed");
                        assert.equal(node.querySelector("img").style.transform, `translateY(${frame.tearOffsetPercent}%)`, "tear image falls inside fixed window");
                        assert.match(node.style.clipPath, /^inset\(0 0 [\d.e+-]+% 0\)$/);
                    } else assert.equal(node.style.clipPath, "none", "settled thinking float must not clip the punctuation");
                }
                if (expression === "cry") {
                    assert.ok(frame.clipBottom <= previousClip);
                    assert.ok(frame.tearOffsetPercent >= previousOffset);
                    previousClip = frame.clipBottom;
                    previousOffset = frame.tearOffsetPercent;
                    if (phase === "enter") {
                        if (p <= .6) assert.equal(frame.clipBottom, 100, "no external tears until eyes/water settle");
                        assert.equal(frame.tearOffsetPercent, 0);
                        if (i === 100) assert.equal(frame.clipBottom, 0);
                    } else {
                        assert.equal(frame.clipBottom, 0, "exit never retracts the reveal upward");
                        if (p >= .4) assert.equal(frame.tearOffsetPercent, 100, "tears gone before face changes");
                    }
                }
                if ((expression === "shock" && other === "thinking") || (expression === "thinking" && other === "shock")) {
                    const opposite = motion.sampleFaceEffectMotion(other, phase === "enter" ? "exit" : "enter", p, expression);
                    assert.ok(frame.opacity === 0 || opposite.opacity === 0, "punctuation never overlaps in either direction");
                }
                if (expression === "happier") {
                    const nodes = root.querySelectorAll("[data-element-role]");
                    for (const side of ["Left", "Right"]) {
                        const anchors = nodes.filter(n => n.getAttribute("data-element-role").endsWith(side)).map(n => {
                            const id = n.getAttribute("data-element-role").slice(7), layout = FACE_LAYER_LAYOUTS.happier.effects[id];
                            const [x, y] = n.style.transformOrigin.split(" ").map(parseFloat);
                            return [layout.x + x / 100 * layout.width, layout.y + y / 100 * layout.height];
                        });
                        assert.deepEqual(anchors[0], anchors[1], "blush and cheek line share a pivot");
                    }
                }
                samples++;
            }
        }
    }
    assert.ok(motion.sampleFaceEffectMotion("shock", "enter", .35).scale > 1, "one overshoot");
    assert.equal(motion.sampleFaceEffectMotion("shock", "enter", 1).scale, 1);
    assert.equal(motion.sampleFaceEffectMotion("thinking", "enter", .4).opacity, 0);
    for (const p of [NaN, Infinity, -Infinity]) assert.throws(() => motion.sampleFaceEffectMotion("cry", "enter", p), RangeError);
    for (const other of EMOTIONS.filter(name => name !== "cry")) {
        for (const p of [0, .1, .39, .4]) assert.equal(motion.sampleFaceTransitionProgress("cry", other, p), 0, "cry face held while tears drain");
        for (const p of [.6, .7, .9, 1]) assert.equal(motion.sampleFaceTransitionProgress(other, "cry", p), 1, "cry face complete before external tears");
    }

    // Execute the actual component layout effects with mounted SSR nodes. This
    // checks integration into geometry and asset frame callbacks, not just sampling.
    const geometryModule = await load("components/face/GeometryTransitionLayer.tsx");
    const assetModule = await load("components/face/ExpressionTransitionLayer.tsx");
    async function mountFrames(file, props, root, refs) {
        const effects = [], frames = new Map(); let refIndex = 0;
        const hooks = { useRef: () => ({ current: refs[refIndex++] }), useId: () => "test-effects", useMemo: f => f(), useCallback: f => f,
            useLayoutEffect: f => effects.push(f) };
        const code = ts.transpileModule((await readFile("src/components/face/" + file, "utf8")).replaceAll("import.meta.env.DEV", "false"), {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
        }).outputText;
        const imports = {};
        for (const match of code.matchAll(/require\("([^"]+)"\)/g)) {
            const name = match[1];
            imports[name] = name === "react" ? hooks : name === "react/jsx-runtime" ? jsx :
                await server.ssrLoadModule(new URL(name + (name.endsWith("Effects") || /\/Eyes$|\/Mouth$|MorphBlinkEye$/.test(name) ? ".tsx" : ".ts"), "file:///src/components/face/").pathname);
        }
        const mod = { exports: {} };
        compileFunction(code, ["require", "module", "exports"])(n => imports[n], mod, mod.exports);
        for (const node of [root, ...refs]) if(node) node.getElementsByTagName = tag => node.querySelectorAll(tag);
        mod.exports.default({ ...props, attach() {}, attachFrame: (id, frame) => frame ? frames.set(id, frame) : frames.delete(id), prepared() {} });
        const cleanups = effects.map(f => f());
        await Promise.resolve();
        return { draw: frames.values().next().value, cleanup: () => cleanups.forEach(f => f?.()), frames };
    }
    const geometry = await load("animation/productionGeometry.ts");
    const { default: ProceduralMouth } = await load("components/face/mouth/ProceduralMouth.tsx");
    const { default: ProceduralEye } = await load("components/face/eyes/ProceduralEye.tsx");
    const cryPairs = EMOTIONS.filter(name => name !== "cry").flatMap(name => [[name, "cry"], ["cry", name]]);
    for (const [from, to] of [...cryPairs, ["shock", "thinking"], ["thinking", "shock"]]) {
        const props = { layers: [{ id: 0, expression: from, initialOpacity: 1 }, { id: 1, expression: to, initialOpacity: 0, strategy: "GEOMETRY" }], attach() {}, attachFrame() {}, prepared() {} };
        const root = render(geometryModule.default, props).querySelector('[data-transition="geometry"]');
        const mounted = await mountFrames("GeometryTransitionLayer.tsx", props, root, [root]);
        for (const p of [.1, .35, .4, .5, .6, .65, .75, .99]) {
            mounted.draw(p);
            const frame = geometry.sampleProductionGeometry(from, to, motion.sampleFaceTransitionProgress(from, to, p));
            const overlay = root.querySelector("[data-geometry-overlay]");
            for (const side of ["left", "right"]) assert.deepEqual(
                normalize(overlay.querySelector(`[data-geometry-eye="${side}"]`).querySelector("svg")),
                normalize(render(ProceduralEye, { geometry: frame.eyes[side] }).querySelector("svg")),
                "actual eyes and internal water follow staged face progress");
            assert.deepEqual(normalize(overlay.querySelector("[data-geometry-mouth]").querySelector("svg")),
                normalize(render(ProceduralMouth, { geometry: frame.mouth }).querySelector("svg")), "actual mouth follows staged face progress");
            const groups = root.querySelectorAll("[data-geometry-effects]");
            for (const [i, expression] of [from, to].entries()) for (const node of groups[i].querySelectorAll("[data-element-role]"))
                assert.equal(Number(node.style.opacity), motion.sampleFaceEffectMotion(expression, i ? "enter" : "exit", p, i ? from : to).opacity);
        }
        mounted.cleanup(); assert.equal(mounted.frames.size, 0, "geometry callback detached");
    }
    for (const phase of ["enter", "exit"]) {
        const props = { layer: { id: 9, expression: "cry", initialOpacity: phase === "enter" ? 0 : 1 }, effectPhase: phase, attach() {}, prepared() {} };
        const root = render(assetModule.default, props), [composition, group] = root.children.filter(n => n.localName === "div");
        assert.equal(composition.querySelectorAll('[data-layer="cryEffect"]').length, 0, "tears are outside the crossfading face");
        assert.equal(group.querySelectorAll('[data-layer="cryEffect"]').length, 2);
        const mounted = await mountFrames("ExpressionTransitionLayer.tsx", props, root, [composition, group]);
        for (const p of [0, .25, .5, .75, 1]) {
            mounted.draw(p);
            assert.ok(group.querySelectorAll("[data-element-role]").every(n => n.style.opacity === "1"));
        }
        mounted.cleanup(); assert.equal(mounted.frames.size, 0, "asset callback detached");
    }
    // The asset coordinator must deliver the SAME normalized progress to both
    // effect callbacks even though its two visual opacities run in reverse.
    const { createExpressionTransition } = await load("animation/expressionTransition.ts");
    const { createAnimationEngine } = await load("animation/animationEngine.ts");
    for (const [from, to] of cryPairs) {
    const runs = [], values = new Map(), nodes = []; let publications = 0;
    const engine = createAnimationEngine({ create(target, parameters) {
        const run = { play() {}, cancel() {}, revert() {}, seek(p) {
            if (parameters["data-progress"]) target.setAttribute("data-progress", String(p));
            else target.style.opacity = String(parameters.opacity[0] * (1-p) + parameters.opacity[1] * p);
            parameters.onUpdate?.(run);
        } };
        runs.push(run); return run;
    } });
    const coordinator = createExpressionTransition({ id: 0, expression: from, initialOpacity: 1 }, () => publications++);
    coordinator.connect(engine); coordinator.request(to, 1000);
    for (const layer of coordinator.layers) {
        const node = new Element("div"); node.style.opacity = String(layer.initialOpacity);
        nodes.push(node);
        coordinator.attach(layer.id, node);
        coordinator.attachFrame(layer.id, p => values.set(layer.id, p));
        coordinator.prepared(layer.id);
    }
    assert.equal(runs.length, 2);
    const published = publications;
    for (const p of [0, .25, .5, .75, 1]) {
        runs.forEach(run => run.seek(p));
        assert.deepEqual([...values.values()], [p, p]);
        const faceProgress = motion.sampleFaceTransitionProgress(from, to, p);
        assert.deepEqual(nodes.map(node => Number(node.style.opacity)), [1 - faceProgress, faceProgress], "asset faces wait for staged cry timing");
    }
    assert.equal(publications, published, "effect updates do not publish React state");
    coordinator.request("thinking", 0, true);
    values.clear(); runs.forEach(run => run.seek(.3));
    assert.equal(values.size, 0, "stale effect updates ignored after replacement");
    assert.equal(coordinator.layers.length, 1, "zero duration settles immediately");
    coordinator.dispose(); engine.dispose();
    }
    assert.strictEqual(useFaceStore.getState(), before, "no per-frame store writes");
    console.log(`PASS: ${samples} effect samples; staged cry eyes/water before tears, downward drainage before face exit, no fade/fixed window; blush grouping; punctuation handoff; actual geometry/asset callbacks and cleanup; unchanged store.`);
} finally { await server.close(); }
