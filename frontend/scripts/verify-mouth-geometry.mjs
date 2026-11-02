// Run from frontend. Pure geometry + React SSR, no browser or new dependencies.
import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
const assetHashes = {
    "cry-mouth.svg": "0b031b3493132420e408b654f10ce779e8af91d8171478971860e95b9109d139",
    "happier-mouth.svg": "73c048221c6da26b212bab4476619b1b75451836ac28657eec22ec7fc52936ec",
    "idle-mouth.svg": "f3b0bcf0029cff3cc93e727f3108e7f56dfb5aefd1520ff0337328bd13895cbe",
    "sad-mouth.svg": "0b031b3493132420e408b654f10ce779e8af91d8171478971860e95b9109d139",
    "shock-mouth.svg": "4cdd64086ca9c93e4875e2a3163383dd28f2c32429cd7b542c2c4ac36775d057",
    "thinking-mouth.svg": "8a3a1c898f0ad50728158b7ab6307ba3238275dce37dd19d4a6eedf29712703a"
};
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
    const { MOUTH_PRESETS, generateMouthPaths, validateMouthGeometry } = await server.ssrLoadModule("/src/geometry/mouth/index.ts");
    const { default: ProceduralMouth } = await server.ssrLoadModule("/src/components/face/mouth/ProceduralMouth.tsx");
    const { default: Mouth } = await server.ssrLoadModule("/src/components/face/Mouth.tsx");
    const { default: Comparison } = await server.ssrLoadModule("/src/components/face/mouth/MouthGeometryComparison.tsx");
    const { FACE_LAYER_COMPOSITIONS } = await server.ssrLoadModule("/src/config/faceLayerAssets.ts");
    const { FACE_LAYER_LAYOUTS } = await server.ssrLoadModule("/src/config/faceLayerLayouts.ts");
    const { useFaceStore } = await server.ssrLoadModule("/src/stores/faceStore.ts");
    const { createElement } = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const render = (component, props) => renderToStaticMarkup(createElement(component, props));
    const numbers = (d) => d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g).map(Number);
    const contour = (d) => {
        const ns = numbers(d); const curves = [];
        for (let i = 2; i < ns.length; i += 6) curves.push(ns.slice(i, i + 6));
        return { start: ns.slice(0, 2), curves };
    };
    const segments = (d) => {
        const c = contour(d); let previous = c.start;
        return c.curves.map((curve) => { const segment = [...previous, ...curve]; previous = curve.slice(4); return segment; });
    };
    for (const [name, filename, expression] of [["IDLE", "idle-mouth.svg", "idle"], ["HAPPY", "happier-mouth.svg", "happy"]]) {
        const g = MOUTH_PRESETS[name]; const result = generateMouthPaths(g);
        const svg = await readFile("public/assets/face-layers/mouth/" + filename, "utf8");
        const sourcePaths = [...svg.matchAll(/<path\b[^>]*d="([^"]+)"[^>]*>/g)].map((m) => m[1]);
        assert.equal(sourcePaths.length, 3);
        for (const [generated, original] of [[result.cavity, sourcePaths[0]], [result.tongue, sourcePaths[1]]]) {
            assert.match(generated, /^M[\d .C-]+Z$/);
            const actual = numbers(generated), expected = numbers(original);
            assert.equal(actual.length, expected.length);
            actual.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) <= 0.000001, name + " measured path agreement"));
        }
        // Original outline is the same curve traversed backwards with a rotated start.
        for (const s of segments(sourcePaths[2])) {
            const reversed = [...s.slice(6, 8), ...s.slice(4, 6), ...s.slice(2, 4), ...s.slice(0, 2)];
            assert.ok(segments(result.outline).some((candidate) => candidate.every((n, i) => Math.abs(n - reversed[i]) < 0.002)), "outline curve agreement");
        }
        assert.deepEqual(generateMouthPaths(g), result, "determinism");
        assert.equal(result.width, FACE_LAYER_LAYOUTS[expression].mouth.width);
        assert.equal(result.height, FACE_LAYER_LAYOUTS[expression].mouth.height);
        assert.equal((result.cavity.match(/C/g) || []).length, 5);
        assert.equal((result.tongue.match(/C/g) || []).length, 10);
        const html = render(ProceduralMouth, { geometry: g });
        assert.ok(html.includes('viewBox="0 0 ' + g.width + ' ' + g.height + '"'));
        for (const style of ['fill="#232322"', 'fill="#EF775D"', 'stroke="black"', 'stroke-width="5"', 'stroke-width="8"', 'stroke-linecap="butt"', 'stroke-linejoin="miter"', 'stroke-miterlimit="4"', 'preserveAspectRatio="xMidYMid meet"']) assert.ok(html.includes(style), style);
        const scaled = { ...g, width: g.width * 2, height: g.height * 2, strokeWidth: 16, cavityStrokeWidth: 10 };
        const scalePaths = generateMouthPaths(scaled);
        numbers(scalePaths.cavity).forEach((n, i) => assert.ok(Math.abs(n - numbers(result.cavity)[i] * 2) < 0.000002));
        assert.notEqual(render(ProceduralMouth, { geometry: scaled }), html, "props control geometry");
        assert.equal(generateMouthPaths({ ...g, tongue: null }).tongue, null);
        assert.equal((render(ProceduralMouth, { geometry: { ...g, tongue: null } }).match(/<path/g) || []).length, 2);
    }
    const tiny = generateMouthPaths({ ...MOUTH_PRESETS.IDLE, width: 282e-8, height: 96e-8, strokeWidth: 8e-8, cavityStrokeWidth: 5e-8 });
    assert.ok(numbers(tiny.cavity).every((n) => Number.isFinite(n) && n > 0), "small valid geometries retain coordinates");
    const g = MOUTH_PRESETS.IDLE;
    for (const key of ["width", "height", "strokeWidth", "cavityStrokeWidth"]) {
        for (const invalid of [0, -1, NaN, Infinity, -Infinity, "10", undefined]) assert.throws(() => generateMouthPaths({ ...g, [key]: invalid }), RangeError);
    }
    for (const invalid of [null, undefined, {}, { ...g, width: 1 }, { ...g, height: 1 },
        { ...g, cavityStrokeWidth: 9 }, { ...g, strokeWidth: 100 },
        { ...g, cavity: null }, { ...g, tongue: undefined },
        { ...g, cavity: { ...g.cavity, curves: [] } },
        { ...g, tongue: { ...g.tongue, curves: [] } },
        { ...g, cavity: { ...g.cavity, start: [NaN, 0] } },
        { ...g, cavity: { ...g.cavity, start: [-0.1, 0] } },
        { ...g, cavity: { ...g.cavity, start: [1.1, 0] } },
        { ...g, cavity: { ...g.cavity, start: new Array(2) } },
        { ...g, cavity: { ...g.cavity, start: [0.5, 0.5] } }]) assert.throws(() => validateMouthGeometry(invalid), RangeError);
    for (const expression of ["idle", "happy", "happier", "sad", "cry", "shock", "thinking", "happier-transition"]) {
        const html = render(Mouth, { expression });
        assert.ok(html.includes('data-layer="' + FACE_LAYER_COMPOSITIONS[expression].mouth + '"'));
        assert.ok(html.includes("<img")); assert.ok(!html.includes("<svg"));
    }
    const before = useFaceStore.getState();
    const comparison = render(Comparison);
    assert.strictEqual(useFaceStore.getState(), before);
    assert.ok(comparison.indexOf("Mouth geometry morph preview") < comparison.indexOf("Static endpoint references"), "animated preview precedes static references");
    assert.ok(comparison.includes("Animated mouth"));
    assert.ok(comparison.includes("Original SVG mouth (static)"));
    assert.ok(comparison.includes("<details")); assert.ok(!comparison.includes(" open="));
    assert.equal((comparison.match(/class="face-canvas"/g) || []).length, 3);
    assert.equal((comparison.match(/class="face-artwork"/g) || []).length, 3);
    assert.ok(comparison.includes('value="idle"')); assert.ok(comparison.includes('value="happy"'));
    const left = FACE_LAYER_LAYOUTS.idle.mouth.x / 800 * 100 + "%";
    assert.equal((comparison.match(new RegExp("left:" + left.replace(".", "\\."), "g")) || []).length, 3, "matching comparison position");
    for (const [file, hash] of Object.entries(assetHashes)) assert.equal(createHash("sha256").update(await readFile("public/assets/face-layers/mouth/" + file)).digest("hex"), hash, file + " unchanged");
    console.log("PASS: Idle/Happy measured paths, outline agreement, topology, dimensions, validation/bounds, deterministic output, cavity/tongue, SSR styling/props, isolated comparison, asset renderer and six immutable artwork hashes. No browser visual test.");
} finally { await server.close(); }
