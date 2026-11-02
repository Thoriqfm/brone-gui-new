// Run: node scripts/verify-face-layers.mjs
// Uses existing Vite/React tooling; no browser or added app dependencies.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
    const assets = await server.ssrLoadModule("/src/config/faceLayerAssets.ts");
    const layouts = await server.ssrLoadModule("/src/config/faceLayerLayouts.ts");
    const { default: Renderer } = await server.ssrLoadModule("/src/components/face/FaceRenderer.tsx");
    const { default: Reference } = await server.ssrLoadModule("/src/components/face/FullImageFaceRenderer.tsx");
    const { useFaceStore } = await server.ssrLoadModule("/src/stores/faceStore.ts");
    const { requestExpression } = await server.ssrLoadModule("/src/animation/expressionController.ts");
    // Load React and its renderer through the same resolver (Windows path casing).
    const { createElement } = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const selectEmotion = (emotion) => {
        assert.notEqual(requestExpression({ emotion, intensity: 0.5, transitionMs: 0, source: "manual" }), "rejected");
        // Zustand SSR reads the initial snapshot. Seed that test-only snapshot
        // to verify each state without adding a browser dependency.
        Object.assign(useFaceStore.getInitialState(), useFaceStore.getState());
    };
    const used = new Set(["faceBase", "faceLines"]);
    for (const expression of assets.LAYER_EXPRESSIONS) {
        const transition = expression === "happier-transition";
        selectEmotion(transition ? "happier" : expression);
        const stateBefore = useFaceStore.getState().emotion;
        const html = renderToStaticMarkup(createElement(Renderer, { transition }));
        const ref = renderToStaticMarkup(createElement(Reference, { transition }));
        assert.equal(useFaceStore.getState().emotion, stateBefore);
        assert.ok(html.includes(`Brone ${expression}`));
        assert.ok(ref.includes(`/assets/expressions/${expression}.png`));
        assert.ok(html.includes('class="face-artwork"'));
        const composition = assets.FACE_LAYER_COMPOSITIONS[expression];
        const layout = layouts.FACE_LAYER_LAYOUTS[expression];
        const parts = [
            ["faceBase", layout.faceBase], ["faceLines", layout.faceLines],
            [composition.leftEye, layout.leftEye], [composition.rightEye, layout.rightEye],
            [composition.mouth, layout.mouth],
            ...composition.effects.map((e) => [e.asset, layout.effects[e.id]]),
        ];
        assert.equal(new Set(composition.effects.map((e) => e.id)).size, composition.effects.length);
        assert.equal((html.match(/data-layer=/g) ?? []).length, parts.length);
        for (const [key, position] of parts) {
            used.add(key);
            const asset = assets.FACE_LAYER_ASSETS[key];
            assert.ok(position, `${expression}: missing layout for ${key}`);
            assert.ok(Object.values(position).every(Number.isFinite));
            assert.ok(position.width > 0 && position.height > 0);
            assert.equal(position.width * asset.height, position.height * asset.width, `${key}: distorted ratio`);
            const path = new URL(`../public${asset.src}`, import.meta.url);
            const svg = await readFile(path, "utf8");
            assert.ok(svg.includes(`viewBox="0 0 ${asset.width} ${asset.height}"`), key);
            assert.ok(html.includes(`data-layer="${key}"`));
            if (key !== "faceLines") {
                // Cry strips intentionally extend into the centered canvas margin.
                const bottomLimit = key === "cryEffect" ? 480 + (800 * 960 / 1490 - 480) / 2 : 480;
                assert.ok(position.x >= 0 && position.y >= 0 && position.x + position.width <= 800 && position.y + position.height <= bottomLimit, `${expression}/${key}: unintended overflow`);
            }
        }
    }
    selectEmotion("cry");
    const cry = renderToStaticMarkup(createElement(Renderer));
    const tears = cry.match(/<img\b[^>]*data-layer="cryEffect"[^>]*>/g) ?? [];
    assert.equal(tears.length, 2);
    for (const tear of tears) {
        const zIndex = Number(tear.match(/z-index:(\d+)/)?.[1]);
        assert.ok(zIndex > layouts.FACE_LAYER_ORDER.eyes, "Cry effect must cover eye outlines");
    }
    for (const id of ["tearLeft", "tearRight"]) {
        assert.ok(layouts.FACE_LAYER_LAYOUTS.cry.effects[id].y >= 226,
            "Cry effect must start below the white eye highlights (bottom ~225.4)");
    }
    selectEmotion("happy");
    const happy = renderToStaticMarkup(createElement(Renderer));
    assert.ok(happy.includes('data-layer="happierMouth"'));
    assert.ok(!happy.includes('data-layer="idleMouth"'));
    assert.ok(happy.includes('data-layer="idleLeft"'));
    assert.ok(happy.includes('data-layer="idleRight"'));
    assert.deepEqual(layouts.FACE_LAYER_LAYOUTS.happy.mouth, layouts.FACE_LAYER_LAYOUTS.happier.mouth);
    assert.notEqual(assets.FACE_LAYER_COMPOSITIONS.happy.leftEye, assets.FACE_LAYER_COMPOSITIONS.happier.leftEye);
    assert.notEqual(assets.FACE_LAYER_COMPOSITIONS.happy.rightEye, assets.FACE_LAYER_COMPOSITIONS.happier.rightEye);
    assert.equal(assets.FACE_LAYER_COMPOSITIONS.happy.effects.length, 0);
    assert.equal(assets.FACE_LAYER_COMPOSITIONS.happier.effects.length, 4);
    assert.equal(assets.FACE_LAYER_COMPOSITIONS["happier-transition"].effects.length, 0);
    assert.equal(used.size, Object.keys(assets.FACE_LAYER_ASSETS).length, "Unused supplied SVG");
    const { EMOTIONS, parseFaceMessage } = await server.ssrLoadModule("/src/schemas/faceMessages.ts");
    assert.deepEqual(EMOTIONS, ["idle", "happy", "happier", "sad", "cry", "shock", "thinking"]);
    assert.deepEqual([...assets.LAYER_EXPRESSIONS].sort(), [...EMOTIONS, "happier-transition"].sort());
    const schema = JSON.parse(await readFile(new URL("../../shared/face-protocol.schema.json", import.meta.url), "utf8"));
    assert.deepEqual(EMOTIONS, schema.properties.payload.properties.emotion.enum);
    const fixtures = JSON.parse(await readFile(new URL("./fixtures/expression-messages.json", import.meta.url), "utf8"));
    for (const fixture of fixtures) {
        assert.equal(parseFaceMessage(fixture.message) !== null, fixture.valid, fixture.name);
    }
    const { EXPRESSION_ASSETS } = await server.ssrLoadModule("/src/components/face/expressionAssets.ts");
    assert.deepEqual(Object.keys(EXPRESSION_ASSETS), EMOTIONS);
    assert.ok(!EMOTIONS.includes("happier-transition"));
    const { default: App } = await server.ssrLoadModule("/src/App.tsx");
    selectEmotion("idle");
    const app = renderToStaticMarkup(createElement(App));
    assert.ok(app.includes("Original full-image PNG reference"));
    assert.ok(app.includes("Composed SVG layers"));
    assert.ok(app.includes("happier-transition (preview only)"));
    assert.ok(!app.includes("shy"));
    await mkdir("reports/face-layers", { recursive: true });
    await writeFile("reports/face-layers/runtime-config.json", JSON.stringify({
        assets: assets.FACE_LAYER_ASSETS, compositions: assets.FACE_LAYER_COMPOSITIONS,
        layouts: layouts.FACE_LAYER_LAYOUTS, order: layouts.FACE_LAYER_ORDER,
    }, null, 2) + "\n");
    console.log(`PASS: ${assets.LAYER_EXPRESSIONS.length} compositions, ${used.size} SVGs, ratios, paths, bounds, React SSR switching, finalized expression fixtures, schema parity, and transition protocol isolation.`);
} finally {
    await server.close();
}
