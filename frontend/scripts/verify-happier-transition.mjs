// Run from frontend: node scripts/verify-happier-transition.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { createServer } from "vite";
import { parse, normalize } from "./production-renderer-test-dom.mjs";

const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
try {
    const load = path => server.ssrLoadModule("/src/" + path);
    const geometry = await load("animation/productionGeometry.ts");
    const { EMOTIONS } = await load("schemas/faceMessages.ts");
    const { EYE_EXPRESSION_PRESETS: eyes, interpolateEyeGeometry: morph } = await load("geometry/eyes/index.ts");
    const { selectTransitionStrategy } = await load("animation/transitionStrategy.ts");
    const { default: Eye } = await load("components/face/eyes/ProceduralEye.tsx");
    const { default: Mouth } = await load("components/face/mouth/ProceduralMouth.tsx");
    const { default: Face } = await load("components/face/FaceRenderer.tsx");
    const { default: GeometryLayer } = await load("components/face/GeometryTransitionLayer.tsx");
    const dom = await load("animation/productionGeometryDom.ts");
    const { createBlinkChannel } = await load("animation/morphBlinkPlayback.ts");
    const { useFaceStore } = await load("stores/faceStore.ts");
    const before = useFaceStore.getState();
    const react = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const jsx = await import(pathToFileURL(await realpath("node_modules/react/jsx-runtime.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const render = (component, props) => renderToStaticMarkup(react.createElement(component, props));
    const stage = "happier-transition", channel = createBlinkChannel();
    const tokens = d => d.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g).map(v => Number.isNaN(Number(v)) ? v : Number(v));
    const near = (a, b) => {
        if (typeof a === "number") assert.ok(Math.abs(a-b) < 1e-7, `${a} != ${b}`);
        else if (a && typeof a === "object") for (const key of Object.keys(a)) near(a[key], b[key]);
        else assert.equal(a, b);
    };
    const simpleOutline = eye => {
        const path = eye.layers[0].tag === "path" ? eye.layers[0] : eye.layers[1];
        const points = [], commands = path.commands;
        let last = commands[0].slice(1);
        for (const c of commands.slice(1,-1)) {
            assert.equal(c[0],"C");
            for (let i=0;i<6;i++) {
                const t=i/6, u=1-t;
                points.push([0,1].map(k=>u**3*last[k]+3*u*u*t*c[k+1]+3*u*t*t*c[k+3]+t**3*c[k+5]));
            }
            last=c.slice(5);
        }
        const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
        for (let i=0;i<points.length;i++) for(let j=i+2;j<points.length;j++) {
            if(i===0 && j===points.length-1)continue;
            const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
            assert.ok(!(cross(a,b,c)*cross(a,b,d)<-1e-8 && cross(c,d,a)*cross(c,d,b)<-1e-8),"angular morph outline must not fold across itself");
        }
    };
    for (const side of ["left", "right"]) {
        const original = await readFile(`public/assets/face-layers/eyes/${side}/happier-transition-eye-${side}.svg`, "utf8");
        const generated = render(Eye, { geometry: eyes[stage][side] });
        assert.deepEqual(tokens(generated.match(/ d="([^"]+)"/)[1]), tokens(original.match(/ d="([^"]+)"/)[1]));
        for (const source of ["idle", "happier"]) {
            const a = eyes[source][side], b = eyes[stage][side];
            assert.strictEqual(morph(a,b,0), a); assert.strictEqual(morph(a,b,1), b);
            for (const p of [.000001, .1, .25, .5, .75, .9, .999999]) {
                const frame = morph(a,b,p);
                near(frame, morph(b,a,1-p));
                assert.notDeepEqual(frame, a); assert.notDeepEqual(frame, b);
                assert.doesNotMatch(render(Eye, { geometry: frame }), /NaN|Infinity|<image/);
                assert.equal(frame.layers[0].attributes.opacity, undefined, "eye body never crossfades");
                if (source === "idle") {
                    const filter = frame.layers.at(-1).children.find(n => n.tag === "filter").attributes;
                    const fill = frame.layers[0].children[0].commands;
                    let previous = fill[0].slice(1);
                    for (const c of fill.slice(1,-1)) {
                        for (let i=0;i<=20;i++) {
                            const t=i/20, u=1-t;
                            const [x,y]=[0,1].map(k=>u**3*previous[k]+3*u*u*t*c[k+1]+3*u*t*t*c[k+3]+t**3*c[k+5]);
                            assert.ok(x>=filter.x-1e-7 && x<=filter.x+filter.width+1e-7 &&
                                y>=filter.y-1e-7 && y<=filter.y+filter.height+1e-7,
                                `${side} angular fill is clipped by its shadow filter at progress ${p}: (${x},${y})`);
                        }
                        previous=c.slice(5);
                    }
                }
            }
            for (let i=1;i<100;i++) simpleOutline(morph(a,b,i/100));
        }
    }
    let settled;
    for (const p of [0, .5, 1]) {
        channel.set(p);
        const html = render(Face, { expression: stage, renderer: "procedural", blinkChannel: channel });
        assert.equal((html.match(/data-procedural-eye=/g) ?? []).length, 2);
        assert.match(html, /data-geometry-mouth="happier-transition"/);
        assert.doesNotMatch(html, /happier-transition-eye-.*\.svg|data-active-eye/);
        settled ??= html; assert.equal(html, settled, "closed angular pose ignores blink progress");
    }
    const pairs = EMOTIONS.flatMap(e => [[e,stage], [stage,e]]);
    const base = (await readFile("public/assets/face-layers/base/face-base.svg")).toString("base64");
    const rows = [];
    let samples = 0;
    for (const [from, to] of pairs) {
        for (const procedural of [false, true]) assert.equal(selectTransitionStrategy(from,to,700,false,procedural), "GEOMETRY");
        const layers = [{id:0,expression:from,initialOpacity:1}, {id:1,expression:to,initialOpacity:0,strategy:"GEOMETRY"}];
        const props = { layers, blinkChannel: channel, attach() {}, attachFrame() {}, prepared() {} };
        const markup = render(GeometryLayer, props);
        assert.match(markup, /data-transition="geometry"/); assert.doesNotMatch(markup, /data-active-eye/);
        const mid = geometry.sampleProductionGeometry(from,to,.5);
        const nodes = ["left", "right"].map(side => parse(render(Eye,{geometry:mid.eyes[side]})).querySelector("svg"));
        const mouth = parse(render(Mouth,{geometry:mid.mouth})).querySelector("svg");
        const cells = [];
        for (const [col,p] of [0,.000001,.1,.25,.499999,.5,.500001,.75,.9,.999999,1].entries()) {
            const frame = geometry.sampleProductionGeometry(from,to,p);
            const reverse = geometry.sampleProductionGeometry(to,from,1-p);
            near(frame.eyes,reverse.eyes); near(frame.mouth,reverse.mouth);
            for (const part of ["leftEye","rightEye","mouth"]) near(frame.layout[part],reverse.layout[part]);
            for (const [i,side] of ["left","right"].entries()) {
                const template = parse(render(Eye,{geometry:eyes.idle[side]})).querySelector("svg");
                if (p > 0 && p < 1) {
                    dom.updateProductionEye(nodes[i],frame.eyes[side],"test-"+side,template);
                    assert.deepEqual(normalize(nodes[i]),normalize(parse(render(Eye,{geometry:frame.eyes[side]})).querySelector("svg")));
                }
            }
            if (p > 0 && p < 1) {
                dom.updateProductionMouth(mouth,frame.mouth);
                assert.deepEqual(normalize(mouth),normalize(parse(render(Mouth,{geometry:frame.mouth})).querySelector("svg")));
            }
            if (from === stage && to === "happier") assert.strictEqual(frame.mouth, geometry.canonicalProductionGeometry(stage).mouth);
            if ([0,.25,.5,.75,1].includes(p)) {
                const parts = ["left","right"].map(side => {
                    const l = frame.layout[side+"Eye"];
                    return `<g transform="translate(${l.x} ${l.y})">${render(Eye,{geometry:frame.eyes[side]})}</g>`;
                });
                parts.push(`<g transform="translate(${frame.layout.mouth.x} ${frame.layout.mouth.y})">${render(Mouth,{geometry:frame.mouth})}</g>`);
                cells.push(`<svg x="${cells.length*320}" y="24" width="320" height="192" viewBox="0 0 800 480"><image width="800" height="480" href="data:image/svg+xml;base64,${base}"/>${parts.join("")}</svg>`);
            }
            samples++;
        }
        rows.push(`<g transform="translate(0 ${rows.length*220})"><text x="8" y="18" fill="white">${from} → ${to} (0 / .25 / .5 / .75 / 1)</text>${cells.join("")}</g>`);
        // Exercise the actual mounted component callback, including its blink guard.
        const root = parse(markup).querySelector('[data-transition="geometry"]');
        root.getElementsByTagName = tag => root.querySelectorAll(tag);
        const effects = [], frames = new Map();
        const imports = { react: {useRef:()=>({current:root}),useId:()=>"angular-test",useMemo:f=>f(),useLayoutEffect:f=>effects.push(f)}, "react/jsx-runtime":jsx };
        const code = ts.transpileModule(await readFile("src/components/face/GeometryTransitionLayer.tsx","utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
        for (const match of code.matchAll(/require\("([^"]+)"\)/g)) {
            const name=match[1];
            if (!(name in imports)) imports[name]=await server.ssrLoadModule(new URL(name+(/Effects$|\/Eyes$|\/Mouth$|MorphBlinkEye$/.test(name)?".tsx":".ts"),"file:///src/components/face/").pathname);
        }
        const mod={exports:{}};
        compileFunction(code,["require","module","exports"])(name=>imports[name],mod,mod.exports);
        mod.exports.default({...props,attachFrame:(id,frame)=>frame?frames.set(id,frame):frames.delete(id)});
        const cleanup=effects.map(f=>f());
        for (const p of [0,.001,.25,.5,.75,.999,1]) frames.get(1)(p);
        await Promise.resolve(); cleanup.forEach(f=>f?.()); assert.equal(frames.size,0);
    }
    assert.deepEqual(geometry.productionMorphRoute(stage,"happier"),{eyes:"direct",mouth:"unchanged"});
    assert.strictEqual(useFaceStore.getState(),before);
    await mkdir("reports/happier-transition",{recursive:true});
    await writeFile("reports/happier-transition/morph-grid.svg",`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${rows.length*220}"><rect width="100%" height="100%" fill="#080f1d"/>${rows.join("")}</svg>`);
    console.log(`PASS: exact angular source paths, code-rendered eyes/mouth, ${pairs.length} directed routes, ${samples} DOM/React geometry samples, actual frame callbacks, direct happier leg, unchanged mouth and blink isolation.`);
} finally { await server.close(); }
