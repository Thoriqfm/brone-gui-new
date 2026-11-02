// Invoked by verify-eye-geometry.mjs; static all-expression expansion checks.
import assert from "node:assert/strict";
import { readFile, realpath, readdir, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
try {
    const eye = await server.ssrLoadModule("/src/geometry/eyes/index.ts");
    const { EYE_PRESETS, EYE_EXPRESSION_PRESETS, EYE_EXPRESSIONS, HAPPIER_TRANSITION_PREVIEW,
        generateEyeLayers, generateEyePath, validateEyeGeometry, validateLayeredEye } = eye;
    const { default: ProceduralEye } = await server.ssrLoadModule("/src/components/face/eyes/ProceduralEye.tsx");
    const comparisonModule = await server.ssrLoadModule("/src/components/face/eyes/EyeGeometryComparison.tsx");
    const { FACE_LAYER_ASSETS, FACE_LAYER_COMPOSITIONS } = await server.ssrLoadModule("/src/config/faceLayerAssets.ts");
    const { FACE_LAYER_LAYOUTS, FACE_LAYER_ORDER } = await server.ssrLoadModule("/src/config/faceLayerLayouts.ts");
    const { useFaceStore } = await server.ssrLoadModule("/src/stores/faceStore.ts");
    const { default: FaceLayer } = await server.ssrLoadModule("/src/components/face/FaceLayer.tsx");
    const react = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const jsx = await import(pathToFileURL(await realpath("node_modules/react/jsx-runtime.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const render = (component, props) => renderToStaticMarkup(react.createElement(component, props));
    const before = useFaceStore.getState();
    const endpoints = [];
    const configurations = [...EYE_EXPRESSIONS, "happier-transition"];
    assert.equal(Object.keys(EYE_PRESETS).length, 14);
    assert.ok(!("happier-transition" in EYE_EXPRESSION_PRESETS));
    assert.ok(!("shy" in EYE_EXPRESSION_PRESETS));
    const flatten = (nodes) => nodes.flatMap((n) => [n, ...flatten(n.children)]);
    const sourceInventory = JSON.parse((await readFile("reports/eye-svg-inventory.json", "utf8")).replace(/^\uFEFF/, ""));
    const numericTokens = (s) => s.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)
        .map((v) => Number.isNaN(Number(v)) ? v : Number(v));
    for (const expression of configurations) {
        const pair = expression === "happier-transition" ? HAPPIER_TRANSITION_PREVIEW : EYE_EXPRESSION_PRESETS[expression];
        for (const side of ["left", "right"]) {
            const g = pair[side];
            assert.equal(g.side, side); validateEyeGeometry(g);
            const assetKey = FACE_LAYER_COMPOSITIONS[expression][side + "Eye"];
            const asset = FACE_LAYER_ASSETS[assetKey];
            const path = "public/" + asset.src.replace(/^\//, "");
            const original = await readFile(path, "utf8");
            const inventory = sourceInventory.find((item) => item.file === path.replaceAll("\\", "/"));
            assert.ok(inventory, path);
            assert.equal(createHash("sha256").update(original).digest("hex"), inventory.sha256);
            assert.equal(g.width, asset.width); assert.equal(g.height, asset.height);
            const position = FACE_LAYER_LAYOUTS[expression][side + "Eye"];
            assert.equal(position.width, g.width); assert.equal(position.height, g.height);
            const snapshot = JSON.stringify(g);
            const procedural = render(ProceduralEye, { geometry: g });
            assert.ok(procedural.includes(`viewBox="0 0 ${g.width} ${g.height}"`));
            const expectedPaths = [...original.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)].map((m) => m[1]);
            const actualPaths = [...procedural.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)].map((m) => m[1]);
            assert.equal(actualPaths.length, expectedPaths.length);
            actualPaths.forEach((d, i) => assert.deepEqual(numericTokens(d), numericTokens(expectedPaths[i]), expression + "/" + side + " exact commands/coordinates/order"));
            for (const tag of ["ellipse", "mask", "filter", "linearGradient", "stop", "use", "feGaussianBlur"]) {
                const count = (svg) => [...svg.matchAll(new RegExp("<" + tag + "\\b", "g"))].length;
                assert.equal(count(procedural), count(original), expression + "/" + side + " " + tag);
            }
            if ("kind" in g) {
                assert.deepEqual(generateEyeLayers(g, "stable"), generateEyeLayers(g, "stable"));
                assert.ok(Object.isFrozen(g.layers[0].attributes));
                const generated = flatten(generateEyeLayers(g, "stable").layers);
                const source = flatten([inventory.svg]).slice(1);
                assert.deepEqual(generated.map((n) => n.tag), source.map((n) => n.tag), "complete document order including defs/masks/filter primitives");
            }
            assert.equal(JSON.stringify(g), snapshot);
            endpoints.push({ expression, label: expression === "happier-transition" ? "HAPPIER_TRANSITION_PREVIEW" : expression.toUpperCase(),
                side, width: g.width, height: g.height, layout: position, original, procedural });
        }
        const html = render(comparisonModule.EyeEndpointComparison, { expression });
        assert.equal((html.match(/<svg\b/g) ?? []).length, 2);
        assert.equal((html.match(/<img\b/g) ?? []).length, 2);
        for (const side of ["left", "right"]) {
            const p = FACE_LAYER_LAYOUTS[expression][side + "Eye"];
            const layout = `left:${p.x / 800 * 100}%;top:${p.y / 480 * 100}%;width:${p.width / 800 * 100}%;height:${p.height / 480 * 100}%;z-index:20`;
            assert.equal(html.split(layout).length - 1, 2, "original/procedural layout equality");
        }
    }
    assert.strictEqual(useFaceStore.getState(), before);
    for (const side of ["LEFT", "RIGHT"]) {
        assert.strictEqual(EYE_PRESETS["HAPPY_" + side], EYE_PRESETS["IDLE_" + side]);
        assert.strictEqual(EYE_PRESETS["SHOCK_" + side], EYE_PRESETS["IDLE_" + side]);
        assert.deepEqual(FACE_LAYER_LAYOUTS.shock[side.toLowerCase() + "Eye"], FACE_LAYER_LAYOUTS.idle[side.toLowerCase() + "Eye"]);
    }
    for (const expression of ["happier", "sad", "cry", "thinking"]) {
        assert.notStrictEqual(EYE_EXPRESSION_PRESETS[expression].left, EYE_EXPRESSION_PRESETS[expression].right);
        assert.notStrictEqual(EYE_EXPRESSION_PRESETS[expression].left.layers, EYE_EXPRESSION_PRESETS[expression].right.layers);
    }
    const nodes = (g) => flatten(g.layers);
    assert.equal(EYE_PRESETS.CRY_LEFT.height, 145); assert.equal(EYE_PRESETS.CRY_RIGHT.height, 183);
    for (const side of ["LEFT", "RIGHT"]) {
        const water = nodes(EYE_PRESETS["CRY_" + side]).find((n) => n.attributes.fill === "#76C5FD");
        assert.equal(water.commands.filter((c) => c[0] === "C").length, 16);
        assert.equal(nodes(EYE_PRESETS["SAD_" + side]).filter((n) => n.tag === "mask").length, 2);
        assert.equal(nodes(EYE_PRESETS["HAPPIER_" + side]).find((n) => n.tag === "path").commands.filter((c) => c[0] === "C").length, 5);
    }
    assert.ok(nodes(EYE_PRESETS.CRY_RIGHT).some((n) => n.tag === "ellipse" && n.attributes.fillOpacity === 0.8));
    assert.ok(nodes(EYE_PRESETS.CRY_RIGHT).some((n) => n.tag === "feGaussianBlur" && n.attributes.stdDeviation === 15));
    assert.ok(nodes(EYE_PRESETS.THINKING_RIGHT).some((n) => n.tag === "ellipse" && n.attributes.cx === 27.2 && n.attributes.cy === 94.6));
    assert.equal(EYE_PRESETS.THINKING_LEFT.width, 142); assert.equal(EYE_PRESETS.THINKING_RIGHT.width, 129);
    assert.ok(nodes(EYE_PRESETS.SAD_LEFT).some((n) => n.attributes.transform?.kind === "matrix"));
    assert.ok(nodes(EYE_PRESETS.SAD_RIGHT).some((n) => n.attributes.transform?.kind === "rotate"));
    assert.equal(HAPPIER_TRANSITION_PREVIEW.left.width, 156); assert.equal(HAPPIER_TRANSITION_PREVIEW.right.width, 160);
    assert.ok(nodes(HAPPIER_TRANSITION_PREVIEW.left).some((n) => n.commands?.some((c) => c[0] === "L")));

    const multiple = render(() => react.createElement(react.Fragment, null,
        ...endpoints.map((e, i) => react.createElement(ProceduralEye, { key: i, geometry:
            (e.expression === "happier-transition" ? HAPPIER_TRANSITION_PREVIEW : EYE_EXPRESSION_PRESETS[e.expression])[e.side] }))));
    const ids = [...multiple.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(ids.length, new Set(ids).size, "all simultaneous eye resource IDs unique");
    for (const match of multiple.matchAll(/(?:url\(#([^)]*)\)|xlink:href="#([^"]+)")/g))
        assert.ok(ids.includes(match[1] ?? match[2]), "local resource reference resolves");

    const mutate = (fn) => { const g = structuredClone(EYE_PRESETS.SAD_LEFT); fn(g); return g; };
    const first = (g, tag) => nodes(g).find((n) => n.tag === tag);
    const invalid = [null, {}, { ...EYE_PRESETS.SAD_LEFT, layers: [] },
        mutate((g) => g.width = Infinity), mutate((g) => g.height = 0), mutate((g) => g.side = "mirror"),
        mutate((g) => g.layers[0].tag = "script"), mutate((g) => g.layers[0].attributes.onLoad = "bad"),
        mutate((g) => first(g, "path").commands[1] = ["Q", 1, 2, 3, 4]),
        mutate((g) => first(g, "path").commands[1] = ["C", 1, 2]),
        mutate((g) => first(g, "path").commands[1][1] = NaN),
        mutate((g) => first(g, "path").commands = new Array(3)),
        mutate((g) => first(g, "path").commands.pop()),
        mutate((g) => first(g, "ellipse").attributes.rx = -1),
        mutate((g) => first(g, "ellipse").attributes.opacity = 2),
        mutate((g) => first(g, "ellipse").attributes.cx = undefined),
        mutate((g) => first(g, "ellipse").attributes.transform = { kind: "matrix", values: [1, 2] }),
        mutate((g) => first(g, "ellipse").attributes.fill = "<svg/>"),
        mutate((g) => first(g, "ellipse").attributes.fill = { ref: "missing" }),
        mutate((g) => first(g, "mask").attributes.width = 0),
        mutate((g) => first(g, "mask").attributes.mask = { ref: first(g, "mask").attributes.id }),
        mutate((g) => first(g, "use").attributes.xlinkHref = { ref: first(g, "mask").attributes.id }),
        mutate((g) => first(g, "filter").attributes.id = first(g, "mask").attributes.id),
        mutate((g) => first(g, "filter").attributes.width = Infinity),
        mutate((g) => first(g, "filter").children[0] = null),
        mutate((g) => first(g, "linearGradient").children[0].attributes = null),
        mutate((g) => first(g, "feGaussianBlur").attributes.stdDeviation = -1),
        mutate((g) => first(g, "feColorMatrix").attributes.values = [1, 2]),
        mutate((g) => first(g, "feBlend").attributes.in2 = "missingResult"),
        mutate((g) => first(g, "linearGradient").children.reverse()),
        mutate((g) => first(g, "stop").attributes.offset = -1),
        mutate((g) => first(g, "path").children = [{ tag: "script", attributes: {}, children: [] }]),
        mutate((g) => g.layers = new Array(1)),
        mutate((g) => g.layers[0].children.push(g.layers[0])),
    ];
    for (const g of invalid) assert.throws(() => validateLayeredEye(g), RangeError);
    const changed = mutate((g) => first(g, "ellipse").attributes.cx = 43);
    assert.ok(render(ProceduralEye, { geometry: changed }).includes('cx="43"'), "layered renderer accepts updated props");
    assert.throws(() => generateEyeLayers(EYE_PRESETS.SAD_LEFT, "bad scope"), RangeError);
    assert.equal(generateEyePath([["M", 1, 2], ["L", 3, 4], ["C", 5, 6, 7, 8, 1, 2], ["Z"]]), "M1 2L3 4C5 6 7 8 1 2Z");

    // Execute the actual local selector handler with a shallow hook harness.
    const code = ts.transpileModule((await readFile("src/components/face/eyes/EyeGeometryComparison.tsx", "utf8"))
        .replaceAll("import.meta.env.DEV", "true"), { compilerOptions: {
            module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
        } }).outputText;
    let selection = "idle";
    const imports = { react: { useState: () => [selection, (v) => { selection = v; }] }, "react/jsx-runtime": jsx,
        "../../../config/faceLayerAssets": { FACE_LAYER_COMPOSITIONS },
        "../../../config/faceLayerLayouts": { FACE_LAYER_LAYOUTS, FACE_LAYER_ORDER },
        "../../../geometry/eyes": eye, "../FaceLayer": { default: FaceLayer }, "./ProceduralEye": { default: ProceduralEye },
        "./EyeMorphPreview": { default: () => null }, "./EyeBlinkPreview": { default: () => null } };
    const module = { exports: {} };
    compileFunction(code, ["require", "module", "exports"])((name) => { assert.ok(name in imports, name); return imports[name]; }, module, module.exports);
    const find = (tree, tag) => {
        if (!react.isValidElement(tree)) return;
        if (tree.type === tag) return tree;
        for (const child of react.Children.toArray(tree.props.children)) { const found = find(child, tag); if (found) return found; }
    };
    for (const expression of configurations) {
        const tree = module.exports.EyeGeometryComparisonView();
        find(tree, "select").props.onChange({ target: { value: expression } });
        assert.equal(selection, expression);
        const html = renderToStaticMarkup(module.exports.EyeGeometryComparisonView());
        assert.ok(html.includes(expression === "happier-transition" ? "HAPPIER_TRANSITION_PREVIEW" : expression.toUpperCase()));
    }
    find(module.exports.EyeGeometryComparisonView(), "select").props.onChange({ target: { value: "shy" } });
    assert.equal(selection, "happier-transition", "invalid selection cannot enter preview");
    assert.strictEqual(useFaceStore.getState(), before);
    const dist = (await Promise.all((await readdir("dist/assets")).filter((f) => f.endsWith(".js"))
        .map((f) => readFile("dist/assets/" + f, "utf8")))).join("");
    assert.doesNotMatch(dist, /HAPPIER_TRANSITION_PREVIEW|Eye geometry comparison/);
    assert.match(dist, /data-procedural-eye/, "all-expression geometry is available to the production adapter");
    await mkdir("reports/eye-multi-expression", { recursive: true });
    await writeFile("reports/eye-multi-expression/endpoints.json", JSON.stringify(endpoints, null, 2) + "\n");
    const image = (s) => "data:image/svg+xml;base64," + Buffer.from(s).toString("base64");
    const gallery = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${configurations.length * 230}"><rect width="100%" height="100%" fill="#080f1d"/>` +
        endpoints.map((e, i) => { const x = i % 2 * 400, y = Math.floor(i / 2) * 230;
            return `<g transform="translate(${x} ${y})"><text x="12" y="22" fill="white" font-size="12">${e.label} / ${e.side}: source | generated</text><image x="15" y="35" width="${e.width}" height="${e.height}" href="${image(e.original)}"/><image x="210" y="35" width="${e.width}" height="${e.height}" href="${image(e.procedural)}"/></g>`;
        }).join("") + "</svg>";
    await writeFile("reports/eye-multi-expression/endpoint-comparison.svg", gallery);
    console.log("PASS: 16 canonical/preview endpoints, exact path commands and coordinates, layer order, feature counts, independent sides/asymmetry/tears/transforms, immutable deterministic data, invalid structures/references/filter inputs, unique IDs, actual selector handlers/layout/store isolation and production tree-shaking. Full XML/raster comparison runs separately in Python.");
} finally { await server.close(); }
