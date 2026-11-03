// Actual robot-stage hook callbacks, scheduler, playback and animation engine.
// A deterministic clock/driver replaces browser scheduling, not the blink logic.
import assert from "node:assert/strict";
import { readFile, realpath, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { createServer } from "vite";
import { Element } from "./production-renderer-test-dom.mjs";

const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
    const load = name => server.ssrLoadModule("/src/" + name);
    const playbackApi = await load("animation/morphBlinkPlayback.ts");
    const { startAutomaticBlink } = await load("animation/automaticBlink.ts");
    const { createAnimationEngine } = await load("animation/animationEngine.ts");
    const { useFaceStore } = await load("stores/faceStore.ts");
    const { default: FaceRenderer } = await load("components/face/FaceRenderer.tsx");
    const jsx = await import(pathToFileURL(await realpath("node_modules/react/jsx-runtime.js")));
    const { createElement } = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const before = useFaceStore.getState();
    const cells = [], timers = new Map(), visibility = new Set(), motionChanges = new Set(), runs = [];
    const morph = new Element("span", { "data-progress": "0" }), blink = morph.cloneNode(true);
    const media = { matches: false, addEventListener(_type, fn) { motionChanges.add(fn); }, removeEventListener(_type, fn) { motionChanges.delete(fn); } };
    const documentFixture = { hidden: false, addEventListener(type, fn) { assert.equal(type, "visibilitychange"); visibility.add(fn); },
        removeEventListener(_type, fn) { visibility.delete(fn); } };
    let index = 0, pending, ready, timerId = 0;
    const clock = { random: () => .5, schedule(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, cancel(id) { timers.delete(id); } };
    const imports = {
        react: {
            useState(initial) { const i = index++; if (!(i in cells)) cells[i] = typeof initial === "function" ? initial() : initial; return [cells[i], v => cells[i] = v]; },
            useRef(initial) { const i = index++; return cells[i] ??= { current: i === 2 ? morph : i === 3 ? blink : initial }; },
            useEffect(effect, deps) { const i = index++, old = cells[i]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) pending = () => {
                old?.cleanup?.(); cells[i] = { deps, cleanup: effect() };
            }; },
        },
        "react/jsx-runtime": jsx,
        "../../animation/automaticBlink": { startAutomaticBlink: p => startAutomaticBlink(p, clock) },
        "../../animation/morphBlinkPlayback": playbackApi,
        "../../animation/useAnimationEngine": { useAnimationEngine(callback) { ready = callback; return { rootRef: { current: new Element("div") } }; } },
        "./FaceRenderer": { default: FaceRenderer },
    };
    const code = ts.transpileModule(await readFile("src/components/face/RobotFaceStage.tsx", "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const mod = { exports: {} };
    compileFunction(code, ["require", "module", "exports", "document", "window"])(n => { assert.ok(n in imports, n); return imports[n]; },
        mod, mod.exports, documentFixture, { matchMedia: () => media });
    const render = (renderer = "procedural", active = true) => {
        index = 0; pending = undefined;
        const tree = mod.exports.default({ renderer, active });
        pending?.(); return tree;
    };
    const engine = createAnimationEngine({ create(target, params) {
        const run = { params, cancelled: false, play() {}, cancel() { this.cancelled = true; }, revert() { this.cancelled = true; },
            seek(p) { target.setAttribute("data-progress", String(params["data-progress"][0] * (1-p) + params["data-progress"][1] * p)); params.onUpdate?.(run); },
            complete() { this.seek(1); params.onComplete?.(run); } };
        runs.push(run); return run;
    } });
    let tree = render(); assert.equal(timers.size, 0, "wait for animation-engine readiness");
    let release = ready(engine);
    tree = render();
    assert.equal(timers.size, 1, "main stage schedules without development panels");
    assert.equal([...timers.values()][0].delay, 4500);
    const face = tree.props.children.at(-1), channel = face.props.blinkChannel;
    assert.ok(channel); assert.equal(visibility.size, 1); assert.equal(motionChanges.size, 1);
    const tick = () => { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn(); };
    tick(); assert.equal(runs.at(-1).params.duration, 100);
    runs.at(-1).seek(.5); assert.equal(channel.progress, .5);
    runs.at(-1).complete(); assert.equal(channel.progress, 1);
    assert.equal(runs.at(-1).params.delay, 40); assert.equal(runs.at(-1).params.duration, 150);
    runs.at(-1).complete(); assert.equal(channel.progress, 0, "blink reopens");
    tick(); runs.at(-1).seek(.5);
    const stale = runs.at(-1), staleTimer = [...timers.values()][0].fn;
    documentFixture.hidden = true; visibility.forEach(fn => fn());
    assert.equal(timers.size, 0); assert.equal(channel.progress, 0, "hidden tab cancels blink and opens eyes");
    stale.params.onUpdate(stale); stale.params.onComplete(stale); staleTimer();
    assert.equal(channel.progress, 0); assert.equal(timers.size, 0);
    documentFixture.hidden = false; visibility.forEach(fn => fn()); assert.equal(timers.size, 1);
    media.matches = true; motionChanges.forEach(fn => fn()); assert.equal(timers.size, 0);
    media.matches = false; motionChanges.forEach(fn => fn()); assert.equal(timers.size, 1);
    render("procedural", false); assert.equal(timers.size, 0, "development overlay pauses main face");
    tree = render("asset"); assert.equal(timers.size, 0); assert.equal(tree.props.children.at(-1).props.blinkChannel, undefined);
    render(); assert.equal(timers.size, 1, "procedural mode resumes");
    tick(); runs.at(-1).seek(.5); release();
    assert.equal(channel.progress, 0, "engine cleanup never preserves a half-closed blink");
    release = ready(engine); render(); assert.equal(timers.size, 1, "setup replay has one schedule");
    const scheduled = [...timers.values()][0].fn;
    cells[4].cleanup(); release(); engine.dispose();
    assert.equal(timers.size, 0); assert.equal(visibility.size, 0); assert.equal(motionChanges.size, 0);
    scheduled(); assert.equal(timers.size, 0);
    assert.strictEqual(useFaceStore.getState(), before, "blinking never writes expression state");
    const { EMOTIONS } = await load("schemas/faceMessages.ts");
    for (const expression of EMOTIONS) {
        const html = renderToStaticMarkup(createElement(FaceRenderer, { renderer: "procedural", expression, blinkChannel: channel }));
        assert.match(html, /data-production-blink="enabled"/); assert.match(html, /data-active-eye/);
    }
    const bundle = (await Promise.all((await readdir("dist/assets")).filter(f => f.endsWith(".js")).map(f => readFile("dist/assets/" + f, "utf8")))).join("");
    assert.match(bundle, /data-active-eye/); assert.match(bundle, /visibilitychange/);
    console.log("PASS: robot automatic blink readiness/close/hold/open, visibility, reduced motion, renderer/overlay pause, setup replay, cleanup/stale callbacks, seven expressions, production bundle and store isolation.");
} finally { await server.close(); }
