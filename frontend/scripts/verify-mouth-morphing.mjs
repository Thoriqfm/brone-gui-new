// Run from frontend: node scripts/verify-mouth-morphing.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileFunction } from "node:vm";
import ts from "typescript";
import * as react from "react";
import * as jsx from "react/jsx-runtime";
import { createServer } from "vite";
import { animate } from "animejs";
const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
    const { MOUTH_PRESETS: { IDLE: a, HAPPY: b }, interpolateMouthGeometry: morph,
        interpolateMouthLayout: layout, generateMouthPaths, validateMouthGeometry } = await server.ssrLoadModule("/src/geometry/mouth/index.ts");
    const { FACE_LAYER_LAYOUTS: positions } = await server.ssrLoadModule("/src/config/faceLayerLayouts.ts");
    const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, actual + " != " + expected);
    const snapshot = JSON.stringify([a, b, positions]);
    assert.strictEqual(morph(a, b, 0), a);
    assert.strictEqual(morph(a, b, 1), b);
    assert.strictEqual(morph(a, b, -2), a);
    assert.strictEqual(morph(a, b, 2), b);
    for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const g = morph(a, b, t);
        for (const key of ["width", "height", "strokeWidth", "cavityStrokeWidth"]) near(g[key], a[key] * (1 - t) + b[key] * t);
        for (const key of ["cavity", "tongue"]) {
            assert.equal(g[key].curves.length, a[key].curves.length);
            const points = (c) => [c.start, ...c.curves.flat()];
            const aa = points(a[key]), bb = points(b[key]);
            points(g[key]).forEach((point, i) => point.forEach((n, axis) => {
                assert.ok(Number.isFinite(n)); near(n, aa[i][axis] * (1 - t) + bb[i][axis] * t);
            }));
            assert.deepEqual(g[key].curves.at(-1)[2], g[key].start);
        }
        assert.deepEqual(morph(a, b, t), g);
        const paths = generateMouthPaths(g);
        for (const key of ["cavity", "tongue", "outline"]) {
            assert.match(paths[key], /^M[-+0-9.eE C]+Z$/);
            assert.ok(!/NaN|Infinity|undefined/.test(paths[key]));
            assert.equal((paths[key].match(/C/g) || []).length, key === "tongue" ? 10 : 5);
        }
        const pos = layout(positions.idle.mouth, positions.happy.mouth, t);
        for (const key of ["x", "y", "width", "height"]) near(pos[key], positions.idle.mouth[key] * (1 - t) + positions.happy.mouth[key] * t);
        assert.equal(pos.width, g.width); assert.equal(pos.height, g.height);
    }
    // Cubic sampling is evidence for these presets, not a general geometric proof.
    const polygon = (c, g) => {
        let p = c.start; const points = [];
        for (const [u, v, q] of c.curves) {
            for (let j = 0; j < 32; j++) {
                const t = j / 32, s = 1 - t;
                points.push([0, 1].map((axis) => (s ** 3 * p[axis] + 3 * s * s * t * u[axis] + 3 * s * t * t * v[axis] + t ** 3 * q[axis]) * (axis ? g.height : g.width)));
            }
            p = q;
        }
        return points;
    };
    const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const simple = (points) => {
        for (let i = 0; i < points.length; i++) for (let j = i + 2; j < points.length; j++) {
            if (i === 0 && j === points.length - 1) continue;
            const p = points[i], q = points[(i + 1) % points.length], r = points[j], s = points[(j + 1) % points.length];
            assert.ok(!(cross(p, q, r) * cross(p, q, s) < -1e-12 && cross(r, s, p) * cross(r, s, q) < -1e-12), "sampled self-intersection");
        }
    };
    const inside = (p, poly) => {
        let yes = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i], b = poly[j];
            if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
        }
        return yes;
    };
    const distance = (p, a, b) => {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    };
    for (let i = 0; i <= 100; i++) {
        const g = morph(a, b, i / 100);
        validateMouthGeometry(g); generateMouthPaths(g);
        if (i % 5) continue;
        const cavity = polygon(g.cavity, g), tongue = polygon(g.tongue, g);
        simple(cavity); simple(tongue);
        for (const p of tongue) assert.ok(inside(p, cavity) || cavity.some((a, i) => distance(p, a, cavity[(i + 1) % cavity.length]) <= g.strokeWidth / 2), "tongue stays within cavity or its outline");
        assert.ok(tongue.some((p) => cavity.some((a, i) => distance(p, a, cavity[(i + 1) % cavity.length]) < g.strokeWidth / 2)), "tongue remains connected to lower outline");
    }
    // Exercise dimensions and both stroke interpolations with distinct valid values.
    const scaled = { ...b, width: b.width * 2, height: b.height * 2, strokeWidth: 16, cavityStrokeWidth: 10 };
    const middle = morph(a, scaled, 0.5);
    assert.equal(middle.strokeWidth, 12); assert.equal(middle.cavityStrokeWidth, 7.5); assert.equal(middle.width, 423);
    assert.equal(morph({ ...a, tongue: null }, { ...b, tongue: null }, 0.5).tongue, null);
    for (const p of [NaN, Infinity, -Infinity, undefined, null, "0.5"]) {
        assert.throws(() => morph(a, b, p), /progress/);
        assert.throws(() => layout(positions.idle.mouth, positions.happy.mouth, p), /progress/);
    }
    assert.deepEqual(layout(positions.idle.mouth, positions.happy.mouth, -1), positions.idle.mouth);
    assert.deepEqual(layout(positions.idle.mouth, positions.happy.mouth, 2), positions.happy.mouth);
    for (const key of ["x", "y", "width", "height"]) assert.throws(() => layout({ ...positions.idle.mouth, [key]: NaN }, positions.happy.mouth, 0.5));
    for (const key of ["width", "height"]) assert.throws(() => layout({ ...positions.idle.mouth, [key]: 0 }, positions.happy.mouth, 0.5));
    const invalid = [null, {}, { ...b, tongue: null }, { ...b, width: Infinity }, { ...b, height: -1 },
        { ...b, strokeWidth: 0 }, { ...b, cavityStrokeWidth: NaN },
        { ...b, cavity: { ...b.cavity, curves: b.cavity.curves.slice(1) } },
        { ...b, tongue: { ...b.tongue, curves: b.tongue.curves.slice(1) } },
        { ...b, cavity: { ...b.cavity, start: [NaN, 0] } },
        { ...b, tongue: { ...b.tongue, start: [0, 0] } },
        { ...b, cavity: { ...b.cavity, curves: [[b.cavity.start], ...b.cavity.curves.slice(1)] } }];
    for (const bad of invalid) for (const t of [0, 0.5, 1]) {
        assert.throws(() => morph(a, bad, t), /mouth|Mouth/);
        assert.throws(() => morph(bad, a, t), /mouth|Mouth/);
    }
    assert.equal(JSON.stringify([a, b, positions]), snapshot, "no input mutation");

    // Real Anime.js 4.5 object animation, deterministic seeks independent of browser timing.
    const value = { progress: 0 };
    const realAnimation = animate(value, { progress: 1, duration: 1000, ease: "inOutSine", autoplay: false });
    for (const [time, expected] of [[0, 0], [500, 0.5], [1000, 1]]) {
        realAnimation.seek(time); near(value.progress, expected); generateMouthPaths(morph(a, b, value.progress));
    }
    realAnimation.cancel();

    // Shallow mounted hook harness invokes actual component handlers and callbacks.
    let states = [], refs = [], si = 0, ri = 0, mounted = false, effects = [], runs = [];
    const hooks = {
        useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], (v) => { states[i] = v; }]; },
        useRef(initial) { const i = ri++; return refs[i] ??= { current: initial }; },
        useEffect(fn) { if (!mounted) effects.push(fn); },
    };
    const fakeAnimate = (target, options) => {
        const run = { target, options, cancelled: false, playing: false,
            cancel() { this.cancelled = true; }, play() { this.playing = true; },
            frame(p) { this.target.progress = p; this.options.onUpdate(); },
            complete() { this.options.onComplete(); } };
        runs.push(run); return run;
    };
    const source = (await readFile("src/components/face/mouth/MouthMorphPreview.tsx", "utf8")).replace('import("animejs")', 'Promise.resolve(require("animejs"))');
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const geometry = await server.ssrLoadModule("/src/geometry/mouth/index.ts");
    const layouts = await server.ssrLoadModule("/src/config/faceLayerLayouts.ts");
    const { default: ProceduralMouth } = await server.ssrLoadModule("/src/components/face/mouth/ProceduralMouth.tsx");
    const imports = { react: hooks, "react/jsx-runtime": jsx, animejs: { animate: fakeAnimate },
        "../../../geometry/mouth": geometry, "../../../config/faceLayerLayouts": layouts, "./ProceduralMouth": { default: ProceduralMouth } };
    const module = { exports: {} };
    compileFunction(code, ["require", "module", "exports"])((name) => { assert.ok(name in imports, name); return imports[name]; }, module, module.exports);
    const render = () => { si = 0; ri = 0; return module.exports.default(); };
    const find = (tree, match) => {
        if (!react.isValidElement(tree)) return undefined;
        if (match(tree)) return tree;
        for (const child of react.Children.toArray(tree.props.children)) { const result = find(child, match); if (result) return result; }
    };
    const button = (tree, text) => find(tree, (e) => e.type === "button" && e.props.children === text);
    const progress = (tree) => find(tree, (e) => e.type === "input").props.value;
    const currentGeometry = (tree) => find(tree, (e) => e.type === ProceduralMouth).props.geometry;
    render(); mounted = true;
    const cleanup = effects[0](); await Promise.resolve();
    let tree = render(); assert.equal(button(tree, "Play Idle → Happy").props.disabled, false);
    assert.equal(button(tree, "Reverse Happy → Idle").props.disabled, true);
    button(tree, "Play Idle → Happy").props.onClick();
    const first = runs.at(-1); assert.ok(first.playing); assert.equal(first.options.duration, 1000); assert.equal(first.options.ease, "inOutSine");
    first.frame(0.5); tree = render(); assert.equal(progress(tree), 0.5); assert.deepEqual(currentGeometry(tree), morph(a, b, 0.5));
    button(tree, "Reset to Idle").props.onClick(); assert.ok(first.cancelled);
    first.options.onUpdate(); first.complete(); tree = render(); assert.equal(progress(tree), 0); assert.strictEqual(currentGeometry(tree), a);
    button(tree, "Play Idle → Happy").props.onClick(); runs.at(-1).frame(1); runs.at(-1).complete();
    tree = render(); assert.equal(progress(tree), 1); assert.strictEqual(currentGeometry(tree), b);
    assert.equal(button(tree, "Play Idle → Happy").props.disabled, true);
    assert.equal(button(tree, "Reverse Happy → Idle").props.disabled, false);
    button(tree, "Reverse Happy → Idle").props.onClick(); assert.equal(runs.at(-1).target.progress, 1);
    runs.at(-1).frame(0.6); tree = render(); assert.equal(progress(tree), 0.6);
    find(tree, (e) => e.type === "input").props.onChange({ target: { value: "0.25" } }); assert.ok(runs.at(-1).cancelled);
    tree = render(); assert.equal(progress(tree), 0.25);
    button(tree, "Reverse Happy → Idle").props.onClick(); runs.at(-1).complete(); tree = render(); assert.equal(progress(tree), 0);
    button(tree, "Play Idle → Happy").props.onClick(); const last = runs.at(-1); cleanup(); assert.ok(last.cancelled);
    last.complete(); assert.equal(progress(render()), 0, "unmount invalidates callbacks");
    // StrictMode-style mount cleanup before async import resolves.
    states = []; refs = []; effects = []; mounted = false; render(); mounted = true;
    const earlyCleanup = effects[0](); earlyCleanup(); await Promise.resolve();
    assert.equal(button(render(), "Play Idle → Happy").props.disabled, true);
    states = []; refs = []; effects = []; mounted = false; render(); mounted = true;
    const selectorCleanup = effects[0](); await Promise.resolve();
    // Exercise each target selector and the actual local component handlers.
    for (const target of geometry.MOUTH_TARGETS) {
        tree = render();
        find(tree, (e) => e.type === "select").props.onChange({ target: { value: target } });
        tree = render(); assert.equal(progress(tree), 0);
        const label = geometry.MOUTH_LABELS[target];
        button(tree, "Play Idle → " + label).props.onClick();
        const run = runs.at(-1); run.frame(0.5); tree = render();
        assert.deepEqual(currentGeometry(tree), geometry.sampleIdleMouthTransition(target, 0.5));
        run.frame(1); run.complete(); tree = render();
        assert.strictEqual(currentGeometry(tree), geometry.MOUTH_EXPRESSION_PRESETS[target].geometry);
        button(tree, "Reverse " + label + " → Idle").props.onClick();
        runs.at(-1).frame(0.5); tree = render();
        button(tree, "Reset to Idle").props.onClick();
        assert.equal(progress(render()), 0); assert.ok(runs.at(-1).cancelled);
        button(render(), "Play Idle → " + label).props.onClick();
        const interrupted = runs.at(-1);
        find(render(), (e) => e.type === "select").props.onChange({ target: { value: "happy" } });
        assert.ok(interrupted.cancelled); interrupted.complete();
        assert.equal(progress(render()), 0, "target replacement rejects stale completion");
    }
    selectorCleanup();
    // Regression: execute the component's actual callbacks with real automatic playback.
    // The fake frame harness and seek-only smoke test above cannot establish this.
    imports.animejs.animate = animate;
    states = []; refs = []; effects = []; mounted = false;
    render(); mounted = true;
    const playbackCleanup = effects[0](); await Promise.resolve();
    tree = render(); button(tree, "Play Idle → Happy").props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 350));
    tree = render();
    assert.ok(progress(tree) > 0 && progress(tree) < 1, "real playback advances component state");
    assert.notEqual(generateMouthPaths(currentGeometry(tree)).cavity, generateMouthPaths(a).cavity, "real playback changes SVG cavity");
    await new Promise((resolve) => setTimeout(resolve, 800));
    tree = render(); assert.equal(progress(tree), 1); assert.strictEqual(currentGeometry(tree), b);
    button(tree, "Reverse Happy → Idle").props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 350));
    tree = render(); assert.ok(progress(tree) > 0 && progress(tree) < 1, "real reverse advances component state");
    await new Promise((resolve) => setTimeout(resolve, 800));
    tree = render(); assert.equal(progress(tree), 0); assert.strictEqual(currentGeometry(tree), a);
    button(tree, "Play Idle → Happy").props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 200));
    tree = render(); button(tree, "Reset to Idle").props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.equal(progress(render()), 0, "reset remains Idle after the original completion time");
    playbackCleanup();
    const comparisonSource = (await readFile("src/components/face/mouth/MouthGeometryComparison.tsx", "utf8")).replaceAll("import.meta.env.DEV", "false");
    const productionCode = ts.transpileModule(comparisonSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const productionModule = { exports: {} };
    const productionImports = { ...imports, "../Mouth": { default: () => null }, "./MouthMorphPreview": { default: () => null } };
    compileFunction(productionCode, ["require", "module", "exports"])((name) => { assert.ok(name in productionImports, name); return productionImports[name]; }, productionModule, productionModule.exports);
    assert.equal(productionModule.exports.default(), null, "preview absent when Vite DEV is false");
    console.log("PASS: exact endpoints; every control/scalar/layout at seven progress values; 101 valid path samples; 21 sampled cavity/tongue intersection/containment checks; invalid topology/numbers/progress; deterministic immutable inputs; real Anime.js seeks and automatic component playback; preview play/reset/reverse/scrub/interruption/unmount/early cleanup and endpoint button states. Browser visual quality is separate.");
} finally { await server.close(); }
