// Run from frontend after npm run build. Source-coordinate and SSR checks, no new dependencies.
import assert from "node:assert/strict";
import { readFile, realpath, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import ts from "typescript";
import { compileFunction } from "node:vm";

const inventory = JSON.parse((await readFile("reports/eye-svg-inventory.json", "utf8")).replace(/^\uFEFF/, ""));
const server = await createServer({ server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
try {
    const { EYE_PRESETS, EYE_EXPRESSION_PRESETS, generateEyePaths, validateEyeGeometry } =
        await server.ssrLoadModule("/src/geometry/eyes/index.ts");
    const { default: ProceduralEye } = await server.ssrLoadModule("/src/components/face/eyes/ProceduralEye.tsx");
    const { default: Comparison } = await server.ssrLoadModule("/src/components/face/eyes/EyeGeometryComparison.tsx");
    const { default: Eyes } = await server.ssrLoadModule("/src/components/face/Eyes.tsx");
    const { default: FaceRenderer } = await server.ssrLoadModule("/src/components/face/FaceRenderer.tsx");
    const { FACE_LAYER_COMPOSITIONS } = await server.ssrLoadModule("/src/config/faceLayerAssets.ts");
    const { FACE_LAYER_LAYOUTS } = await server.ssrLoadModule("/src/config/faceLayerLayouts.ts");
    const { useFaceStore } = await server.ssrLoadModule("/src/stores/faceStore.ts");
    const react = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const jsx = await import(pathToFileURL(await realpath("node_modules/react/jsx-runtime.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const render = (component, props) => renderToStaticMarkup(react.createElement(component, props));
    const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const tags = (svg, tag) => [...svg.matchAll(new RegExp("<" + tag + "\\b[^>]*>", "g"))].map((m) => attrs(m[0]));
    const numbers = (d) => d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g).map(Number);
    const canonical = (svg) => svg.replace(/(?:filter\d_i_|paint\d_linear_|effect\d_innerShadow_)\d+_\d+/g, "REF");
    let sourceLeft;
    const illustrations = [];
    for (const side of ["left", "right"]) {
        const g = EYE_PRESETS["IDLE_" + side.toUpperCase()];
        const source = await readFile(`public/assets/face-layers/eyes/${side}/idle-eye-${side}.svg`, "utf8");
        if (side === "left") sourceLeft = source;
        else assert.equal(canonical(source), canonical(sourceLeft), "both complete SVGs match apart from Figma reference names");
        const generated = generateEyePaths(g);
        const before = JSON.stringify(g);
        assert.equal(g.side, side);
        assert.equal(generated.viewBox, "0 0 129 171");
        assert.equal(generated.viewBox, tags(source, "svg")[0].viewBox);
        const sourcePaths = tags(source, "path");
        for (const [actual, expected] of [[generated.outline, sourcePaths[0].d], [generated.highlight, sourcePaths[1].d]]) {
            assert.match(actual, /^M[-\d. eE+]+(?:C[-\d. eE+]+)+Z$/);
            assert.deepEqual(actual.match(/[MCZ]/g), expected.match(/[MCZ]/g));
            assert.deepEqual(numbers(actual), numbers(expected), "exact source-coordinate agreement, no outline approximation");
        }
        assert.equal(g.outline.curves.length, 8); assert.equal(g.highlights.contour.curves.length, 8);
        assert.deepEqual(generateEyePaths(g), generated);
        assert.equal(JSON.stringify(g), before);
        assert.ok(Object.isFrozen(g.highlights.contour.curves[0][0]));
        const svg = render(ProceduralEye, { geometry: g });
        assert.equal(tags(svg, "svg")[0].preserveAspectRatio, "xMidYMid meet");
        assert.equal(tags(svg, "svg")[0].fill, "none");
        assert.deepEqual(tags(svg, "ellipse")[0], { ...tags(source, "ellipse")[0], fill: tags(svg, "ellipse")[0].fill });
        assert.deepEqual(tags(svg, "ellipse")[1], tags(source, "ellipse")[1]);
        assert.equal(tags(svg, "path")[0].stroke, sourcePaths[0].stroke);
        assert.equal(tags(svg, "path")[0]["stroke-width"], sourcePaths[0]["stroke-width"]);
        assert.equal(tags(svg, "path")[0].fill, undefined, "outline inherits none");
        assert.equal(tags(svg, "path")[1].fill, sourcePaths[1].fill);
        assert.equal(tags(svg, "path")[1].opacity, sourcePaths[1].opacity);
        const withoutId = ({ id, ...rest }) => rest;
        assert.deepEqual(withoutId(tags(svg, "linearGradient")[0]), withoutId(tags(source, "linearGradient")[0]));
        assert.deepEqual(tags(svg, "stop"), tags(source, "stop"));
        assert.deepEqual(withoutId(tags(svg, "filter")[0]), withoutId(tags(source, "filter")[0]));
        for (const tag of ["feFlood", "feColorMatrix", "feOffset", "feGaussianBlur", "feComposite"]) {
            assert.deepEqual(tags(svg, tag), tags(source, tag), tag + " source filter attributes");
        }
        assert.deepEqual(tags(svg, "feBlend").map(({ result, ...rest }) => rest),
            tags(source, "feBlend").map(({ result, ...rest }) => rest));
        const noHighlights = { ...g, highlights: { ...g.highlights, ellipse: null, contour: null } };
        assert.equal(generateEyePaths(noHighlights).highlight, null);
        assert.equal(tags(render(ProceduralEye, { geometry: noHighlights }), "path").length, 1);
        assert.equal(tags(render(ProceduralEye, { geometry: noHighlights }), "ellipse").length, 1);
        const updated = { ...g, body: { ...g.body, center: [65, 86] } };
        assert.equal(tags(render(ProceduralEye, { geometry: updated }), "ellipse")[0].cx, "65");
        illustrations.push({ side, source, svg });
    }
    const g = EYE_PRESETS.IDLE_LEFT;
    for (const key of ["width", "height", "strokeWidth"]) {
        for (const bad of [0, -1, NaN, Infinity, -Infinity, "129", null, undefined])
            assert.throws(() => generateEyePaths({ ...g, [key]: bad }), RangeError);
    }
    const mutations = [null, undefined, {}, { ...g, side: "mirror" }, { ...g, body: null },
        { ...g, body: { center: [NaN, 0], radius: [1, 1] } },
        { ...g, body: { center: new Array(2), radius: [1, 1] } },
        { ...g, body: { center: [1, 1], radius: [0, -1] } },
        { ...g, outline: { ...g.outline, curves: [] } },
        { ...g, outline: { ...g.outline, curves: new Array(1) } },
        { ...g, outline: { ...g.outline, curves: [[new Array(2), [1, 1], [1, 1]]] } },
        { ...g, outline: { ...g.outline, start: [1, 2] } },
        { ...g, stroke: "url(#untrusted)" }, { ...g, gradient: undefined },
        { ...g, gradient: { ...g.gradient, end: g.gradient.start } },
        { ...g, gradient: { ...g.gradient, stops: new Array(2) } },
        { ...g, gradient: { ...g.gradient, stops: [...g.gradient.stops].reverse() } },
        { ...g, gradient: { ...g.gradient, stops: [{ offset: -1, color: "white" }, g.gradient.stops[1]] } },
        { ...g, shadow: { ...g.shadow, region: [0, 0, 0, 175] } },
        { ...g, shadow: { ...g.shadow, blur: -1 } }, { ...g, shadow: { ...g.shadow, offsetY: Infinity } },
        { ...g, shadow: { ...g.shadow, opacity: 2 } },
        { ...g, highlights: { ...g.highlights, opacity: NaN } },
        { ...g, highlights: { ...g.highlights, contour: undefined } }];
    for (const bad of mutations) assert.throws(() => validateEyeGeometry(bad), RangeError);
    const paired = render(() => react.createElement(react.Fragment, null,
        react.createElement(ProceduralEye, { geometry: g }), react.createElement(ProceduralEye, { geometry: EYE_PRESETS.IDLE_RIGHT })));
    const ids = [...paired.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, 4, "unique filter/gradient IDs across instances");
    for (const m of paired.matchAll(/url\(#([^)]*)\)/g)) assert.ok(ids.includes(m[1]));
    assert.strictEqual(EYE_EXPRESSION_PRESETS.happy, EYE_EXPRESSION_PRESETS.idle);
    for (const key of ["leftEye", "rightEye"]) {
        assert.equal(FACE_LAYER_COMPOSITIONS.happy[key], FACE_LAYER_COMPOSITIONS.idle[key]);
        assert.deepEqual(FACE_LAYER_LAYOUTS.happy[key], FACE_LAYER_LAYOUTS.idle[key]);
    }
    const before = useFaceStore.getState();
    const comparison = render(Comparison);
    assert.strictEqual(useFaceStore.getState(), before);
    assert.equal(tags(comparison, "section").length, 4);
    assert.equal(tags(comparison, "svg").length, 6);
    assert.equal(tags(comparison, "img").length, 2);
    assert.equal((comparison.match(/class="face-canvas"/g) || []).length, 6);
    for (const side of ["left", "right"]) {
        const p = FACE_LAYER_LAYOUTS.idle[side + "Eye"];
        const position = `left:${p.x / 800 * 100}%;top:${p.y / 480 * 100}%;width:${p.width / 800 * 100}%;height:${p.height / 480 * 100}%;z-index:20`;
        assert.equal(comparison.split(position).length - 1, 4, side + " matching layout in both references and initial morph");
    }
    const componentSource = await readFile("src/components/face/eyes/EyeGeometryComparison.tsx", "utf8");
    assert.doesNotMatch(componentSource, /useFaceStore|requestExpression|useEffect|animate\(/);
    const compiled = ts.transpileModule(componentSource.replaceAll("import.meta.env.DEV", "false"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
    }).outputText;
    const module = { exports: {} };
    compileFunction(compiled, ["require", "module", "exports"])((name) => name === "react/jsx-runtime" ? jsx : {}, module, module.exports);
    assert.equal(module.exports.default(), null, "production DEV guard");
    const dist = (await Promise.all((await readdir("dist/assets")).filter((f) => f.endsWith(".js"))
        .map((f) => readFile("dist/assets/" + f, "utf8")))).join("");
    assert.doesNotMatch(dist, /Eye geometry comparison/);
    assert.match(dist, /data-procedural-eye/, "production adapter is bundled; asset remains the default");
    for (const expression of Object.keys(FACE_LAYER_COMPOSITIONS)) {
        const html = render(Eyes, { expression });
        assert.equal(tags(html, "img").length, 2); assert.equal(tags(html, "svg").length, 0);
        for (const key of ["leftEye", "rightEye"]) assert.ok(html.includes(`data-layer="${FACE_LAYER_COMPOSITIONS[expression][key]}"`));
        useFaceStore.setState({ emotion: expression === "happier-transition" ? "idle" : expression });
        const face = render(FaceRenderer, { transition: expression === "happier-transition" });
        assert.ok(face.includes("<img")); assert.ok(!face.includes("data-procedural-eye"));
    }
    useFaceStore.setState(before, true);
    for (const item of inventory) {
        assert.equal(createHash("sha256").update(await readFile(item.file)).digest("hex"), item.sha256, item.file + " original integrity");
    }
    assert.equal(inventory.length, 14);
    // Standalone source/inline comparison artifact for raster review, no production code.
    const image = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    await writeFile("reports/eye-endpoint-comparison.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="260" viewBox="0 0 800 260">
<rect width="800" height="260" fill="#080f1d"/>
${illustrations.map(({ side, source, svg }, i) => `<g transform="translate(${i * 400} 0)"><text x="30" y="30" fill="white">${side}: original / procedural</text><image x="30" y="55" width="129" height="171" href="${image(source)}"/><image x="210" y="55" width="129" height="171" href="${image(svg)}"/></g>`).join("\n")}</svg>`);
    console.log("PASS: exact left/right source controls, viewBox, validation/rejection, deterministic paths, optional highlights, source gradient/filter pipeline, unique IDs, Happy reuse, SSR props/layout/isolation, production guard/build/asset renderer, and 14 original asset hashes. Raster/browser equivalence is a separate review.");
} finally { await server.close(); }
await import("./verify-eye-expressions.mjs");
