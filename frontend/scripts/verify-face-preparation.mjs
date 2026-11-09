// Run from frontend: node scripts/verify-face-preparation.mjs
import assert from "node:assert/strict";
import { createServer } from "vite";
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,watch:null},appType:"custom"});
const originalImage=globalThis.Image, originalTimeout=globalThis.setTimeout;
try {
    const sources=[];
    globalThis.Image=class {
        set src(value) { this.source=value; sources.push(value); }
        decode() { return this.source.endsWith("timeout-mouth.svg") ? Promise.reject(new Error("simulated asset failure")) : Promise.resolve(); }
    };
    const {useFaceStore}=await server.ssrLoadModule("/src/stores/faceStore.ts");
    const before=useFaceStore.getState();
    let yields=0;
    globalThis.setTimeout=(fn,delay,...args)=>{ if(delay===0)yields++; return originalTimeout(fn,delay,...args); };
    const {prepareFaceRenderer}=await server.ssrLoadModule("/src/animation/prepareFaceRenderer.ts");
    const start=performance.now();
    const first=prepareFaceRenderer();
    assert.strictEqual(prepareFaceRenderer(),first,"concurrent startup calls share one preparation");
    await first;
    const elapsed=performance.now()-start;
    const count=yields;
    assert.ok(count>=73,"startup yields between geometry routes");
    assert.strictEqual(prepareFaceRenderer(),first,"prepared startup does not repeat calculations or requests");
    await prepareFaceRenderer();
    assert.equal(yields,count);
    assert.equal(sources.length,new Set(sources).size,"each SVG is loaded once");
    assert.ok(sources.some(src=>src.endsWith("cry-effect-flow.svg")),"animated effect is predecoded too");
    assert.ok(sources.some(src=>src.endsWith("timeout-mouth.svg")),"decode failure cannot block preparation");
    assert.strictEqual(useFaceStore.getState(),before,"startup does not change expression or connection state");
    const {LAYER_EXPRESSIONS}=await server.ssrLoadModule("/src/config/faceLayerAssets.ts");
    const {sampleProductionGeometry}=await server.ssrLoadModule("/src/animation/productionGeometry.ts");
    let frames=0;
    const warmStart=performance.now();
    for(const from of LAYER_EXPRESSIONS)for(const to of LAYER_EXPRESSIONS)if(from!==to)for(const p of [.25,.75]) {
        const frame=sampleProductionGeometry(from,to,p);
        assert.ok(Number.isFinite(frame.eyes.left.width));frames++;
    }
    console.log(`PASS: one shared preparation, ${yields} event-loop yields, ${sources.length} unique SVG preloads, failed asset fallback, unchanged semantic state, ${frames} warmed geometry samples.`);
    console.log(JSON.stringify({environment:`Node ${process.version} / ${process.platform} / ${process.arch}`,method:"one preparation; one sweep of 144 warm samples; mocked image decode, no browser/GPU/Jetson measurement",preparationMs:+elapsed.toFixed(2),warmSweepMs:+(performance.now()-warmStart).toFixed(2)}));
}finally{globalThis.Image=originalImage;globalThis.setTimeout=originalTimeout;await server.close()}
