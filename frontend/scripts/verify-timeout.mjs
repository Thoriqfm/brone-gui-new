// Run from frontend: node scripts/verify-timeout.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import ts from "typescript";
import { compileFunction } from "node:vm";
import { parse, normalize } from "./production-renderer-test-dom.mjs";

const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
    const load = name => server.ssrLoadModule("/src/" + name);
    const { default: FaceRenderer } = await load("components/face/FaceRenderer.tsx");
    const { createBlinkChannel } = await load("animation/morphBlinkPlayback.ts");
    const { EMOTIONS, parseFaceMessage } = await load("schemas/faceMessages.ts");
    const geometry = await load("animation/productionGeometry.ts");
    const { selectTransitionStrategy } = await load("animation/transitionStrategy.ts");
    const { requestExpression } = await load("animation/expressionController.ts");
    const { useFaceStore } = await load("stores/faceStore.ts");
    const { default: GeometryLayer } = await load("components/face/GeometryTransitionLayer.tsx");
    const { default: Eye } = await load("components/face/eyes/ProceduralEye.tsx");
    const { default: Mouth } = await load("components/face/mouth/ProceduralMouth.tsx");
    const dom = await load("animation/productionGeometryDom.ts");
    const { createExpressionTransition } = await load("animation/expressionTransition.ts");
    const { createAnimationEngine } = await load("animation/animationEngine.ts");
    const { EYE_EXPRESSION_PRESETS } = await load("geometry/eyes/index.ts");
    const render = (component, props) => renderToStaticMarkup(createElement(component, props));
    const { createElement } = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const jsx = await import(pathToFileURL(await realpath("node_modules/react/jsx-runtime.js")));
    const near = (a, b) => {
        if (typeof a === "number") assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
        else if (a && typeof a === "object") for (const key of Object.keys(a)) near(a[key], b[key]);
        else assert.equal(a, b);
    };
    for (const side of ["left", "right"]) {
        const source = await readFile(`public/assets/face-layers/eyes/${side}/timeout-eye-${side}.svg`, "utf8");
        const raw = [...source.matchAll(/<path[^>]* d="([^"]+)"/g)][0][1].match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g).map(Number);
        assert.deepEqual(EYE_EXPRESSION_PRESETS.timeout[side].layers[1].commands.flatMap(c => c.slice(1)), raw, "spiral controls are copied exactly from the approved SVG");
    }
    const mouthSvg = await readFile("public/assets/face-layers/mouth/timeout-mouth.svg", "utf8");
    const originalMouth = mouthSvg.match(/d="([^"]+)"/)[1].match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g).map(Number);
    const timeoutMouth = geometry.canonicalProductionGeometry("timeout").mouth;
    near([timeoutMouth.cavity.start, ...timeoutMouth.cavity.curves.flat()].flatMap(([x, y]) => [x * timeoutMouth.width, y * timeoutMouth.height]), originalMouth);
    const channel = createBlinkChannel();
    for (const renderer of ["asset", "procedural"]) {
        let open;
        for (const progress of [0, .5, 1, 0]) {
            channel.set(progress);
            const html = renderToStaticMarkup(createElement(FaceRenderer, { expression: "timeout", renderer, blinkChannel: channel }));
            for (const part of ["timeoutLeft", "timeoutRight", "timeoutMouth"]) assert.ok(html.includes(`data-layer="${part}"`));
            assert.doesNotMatch(html, /data-procedural-eye=|data-geometry-mouth=/);
            open ??= html;
            assert.equal(html, open, "blink progress must not replace or distort spiral artwork");
        }
    }
    const frames = [];
    for (const expression of EMOTIONS.filter(e => e !== "timeout")) {
        for (const pair of [[expression, "timeout"], ["timeout", expression]]) {
            assert.equal(geometry.supportsProductionMorph(...pair), true);
            for (const procedural of [false, true]) {
                assert.equal(selectTransitionStrategy(...pair, 700, false, procedural), "GEOMETRY");
                assert.equal(selectTransitionStrategy(...pair, 0, false, procedural), "IMMEDIATE");
            }
            const [from, to] = pair;
            const layers = [{ id: 0, expression: from, initialOpacity: 1 }, { id: 1, expression: to, initialOpacity: 0, strategy: "GEOMETRY" }];
            const markup = render(GeometryLayer, { layers, blinkChannel: channel, attach() {}, attachFrame() {}, prepared() {} });
            assert.match(markup, /data-transition="geometry"/);
            assert.doesNotMatch(markup, /data-active-eye/, "spiral morph legs suspend blinking");
            assert.strictEqual(geometry.sampleProductionGeometry(from, to, 0).eyes, EYE_EXPRESSION_PRESETS[from]);
            assert.strictEqual(geometry.sampleProductionGeometry(from, to, 1).eyes, EYE_EXPRESSION_PRESETS[to]);
            const middle = geometry.sampleProductionGeometry(from, to, .5);
            const eyeNodes = Object.fromEntries(["left", "right"].map(side => [side, parse(render(Eye, { geometry: middle.eyes[side] })).querySelector("svg")]));
            const mouthNode = parse(render(Mouth, { geometry: middle.mouth })).querySelector("svg");
            for (const p of [.0001, .1, .25, .4999, .5, .5001, .75, .9, .9999]) {
                const frame = geometry.sampleProductionGeometry(from, to, p);
                const reverse = geometry.sampleProductionGeometry(to, from, 1 - p);
                near(frame.mouth, reverse.mouth);
                for (const side of ["left", "right"]) {
                    const template = parse(render(Eye, { geometry: EYE_EXPRESSION_PRESETS.idle[side] })).querySelector("svg");
                    dom.updateProductionEye(eyeNodes[side], frame.eyes[side], "test-" + side, template);
                    assert.deepEqual(normalize(eyeNodes[side]), normalize(parse(render(Eye, { geometry: frame.eyes[side], scope: "test-" + side })).querySelector("svg")));
                    assert.ok(Math.abs(frame.eyes[side].width - reverse.eyes[side].width) < 1e-8);
                }
                dom.updateProductionMouth(mouthNode, frame.mouth);
                assert.deepEqual(normalize(mouthNode), normalize(parse(render(Mouth, { geometry: frame.mouth })).querySelector("svg")));
                assert.equal(frame.layout.mouth.x, geometry.canonicalProductionGeometry(from).layout.mouth.x * (1-p) + geometry.canonicalProductionGeometry(to).layout.mouth.x * p);
            }
            assert.throws(() => geometry.sampleProductionGeometry(from, to, NaN), RangeError);
            for (const p of [0, .25, .5, .75, 1]) {
                const frame = geometry.sampleProductionGeometry(from, to, p);
                frames.push({ from, to, p, layout: frame.layout,
                    left: render(Eye, { geometry: frame.eyes.left }), right: render(Eye, { geometry: frame.eyes.right }), mouth: render(Mouth, { geometry: frame.mouth }) });
            }
        }
    }
    // The outgoing live rotation survives replacing the asset DOM with geometry.
    const computedStyle = globalThis.getComputedStyle;
    try {
        globalThis.getComputedStyle = image => ({ transform: image.side === "left" ? "matrix(0,1,-1,0,0,0)" : "matrix(0,-1,1,0,0,0)" });
        for (const procedural of [false, true]) {
            const engine = createAnimationEngine({ create() { throw new Error("Must wait for the geometry mount"); } });
            const coordinator = createExpressionTransition({ id: 0, expression: "timeout", initialOpacity: 1 }, () => {}, procedural);
            coordinator.attach(0, { isConnected: true, style: { opacity: "1" }, querySelector: selector => ({ side: selector.includes("Left") ? "left" : "right" }) });
            coordinator.connect(engine); coordinator.request("idle", 700);
            assert.deepEqual(coordinator.layers[0].timeoutRotation, { left: 90, right: -90 });
            assert.equal(coordinator.layers[1].strategy, "GEOMETRY");
            coordinator.dispose(); engine.dispose();
        }
    } finally { globalThis.getComputedStyle = computedStyle; }

    // Execute the real geometry component's mounted frame callback, not only SSR.
    for (const [from, to] of [["timeout", "idle"], ["idle", "timeout"]]) {
        const layers = [{ id: 0, expression: from, initialOpacity: 1, timeoutRotation: { left: 90, right: -90 } }, { id: 1, expression: to, initialOpacity: 0, strategy: "GEOMETRY" }];
        const props = { layers, blinkChannel: channel, attach() {}, prepared() {} };
        const root = parse(render(GeometryLayer, { ...props, attachFrame() {} })).querySelector('[data-transition="geometry"]');
        root.getElementsByTagName = tag => root.querySelectorAll(tag);
        const effects = [], frames = new Map();
        const imports = { react: { useRef: () => ({ current: root }), useId: () => "timeout-test", useMemo: f => f(), useLayoutEffect: f => effects.push(f) }, "react/jsx-runtime": jsx };
        const code = ts.transpileModule(await readFile("src/components/face/GeometryTransitionLayer.tsx", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
        for (const match of code.matchAll(/require\("([^"]+)"\)/g)) {
            const name = match[1];
            if (!(name in imports)) imports[name] = await server.ssrLoadModule(new URL(name + (/Effects$|\/Eyes$|\/Mouth$|MorphBlinkEye$/.test(name) ? ".tsx" : ".ts"), "file:///src/components/face/").pathname);
        }
        const mod = { exports: {} };
        compileFunction(code, ["require", "module", "exports"])(name => imports[name], mod, mod.exports);
        mod.exports.default({ ...props, attachFrame: (id, frame) => frame ? frames.set(id, frame) : frames.delete(id) });
        const cleanups = effects.map(f => f());
        const draw = frames.get(1);
        for (const p of [0, .001, .25, .5, .75, .999, 1]) {
            draw(p);
            const endpoints = root.querySelectorAll("[data-geometry-endpoint]");
            assert.equal(endpoints[0].style.display, p <= 0 ? "contents" : "none");
            assert.equal(endpoints[1].style.display, p >= 1 ? "contents" : "none");
            if (p > 0 && p < 1) {
                const overlay = root.querySelector("[data-geometry-overlay]");
                assert.equal(overlay.style.display, "contents");
                if (from === "timeout") assert.equal(overlay.querySelector('[data-geometry-eye="left"]').style.transform, `rotate(${90 * (1-p)}deg)`);
            }
        }
        await Promise.resolve(); cleanups.forEach(f => f?.());
        assert.equal(frames.size, 0);
    }
    const wire = { type: "SET_EXPRESSION", request_id: "timeout-check", payload: { emotion: "timeout", intensity: 1, transition_ms: 700 } };
    assert.ok(parseFaceMessage(wire));
    for (const invalid of ["time-out", "TIMEOUT", "", null])
        assert.equal(parseFaceMessage({ ...wire, payload: { ...wire.payload, emotion: invalid } }), null);
    assert.equal(requestExpression({ emotion: "timeout", intensity: 1, transitionMs: 700, source: "websocket", requestId: wire.request_id }), "accepted");
    assert.equal(useFaceStore.getState().emotion, "timeout");
    assert.equal(requestExpression({ emotion: "idle", intensity: 1, transitionMs: 700, source: "websocket" }), "accepted");
    assert.equal(useFaceStore.getState().emotion, "idle");
    await mkdir("reports/timeout", { recursive: true });
    await writeFile("reports/timeout/morph-frames.json", JSON.stringify(frames));
    console.log("PASS: timeout exact SVG endpoints, 14 geometry morph routes in both renderers, 126 DOM/React intermediate samples, spiral blink isolation, immediate transitions, strict messages and recovery. Browser motion unverified.");
} finally {
    await server.close();
}
