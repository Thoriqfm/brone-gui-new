// Run from frontend. No additional dependencies; browser QA is reported separately.
import assert from "node:assert/strict";
import { mkdir, readFile, realpath, readdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import ts from "typescript";
import { compileFunction } from "node:vm";
import { Element, parse, serialize, normalize } from "./production-renderer-test-dom.mjs";

const server = await createServer({ optimizeDeps:{noDiscovery:true,include:[]}, server:{middlewareMode:true,hmr:false},appType:"custom" });
try {
    const load = name => server.ssrLoadModule("/src/" + name);
    const geometry = await load("animation/productionGeometry.ts");
    const dom = await load("animation/productionGeometryDom.ts");
    const { createExpressionTransition } = await load("animation/expressionTransition.ts");
    const { createAnimationEngine, loadAnimeDriver } = await load("animation/animationEngine.ts");
    const { selectTransitionStrategy } = await load("animation/transitionStrategy.ts");
    const { useFaceStore } = await load("stores/faceStore.ts");
    const { requestExpression } = await load("animation/expressionController.ts");
    const schemas = await load("schemas/faceMessages.ts");
    const { FACE_LAYER_COMPOSITIONS, FACE_LAYER_ASSETS } = await load("config/faceLayerAssets.ts");
    const { FACE_LAYER_LAYOUTS, FACE_LAYER_ORDER } = await load("config/faceLayerLayouts.ts");
    const { default: FaceRenderer } = await load("components/face/FaceRenderer.tsx");
    const { default: FullImage } = await load("components/face/FullImageFaceRenderer.tsx");
    const { default: Eye } = await load("components/face/eyes/ProceduralEye.tsx");
    const { default: Mouth } = await load("components/face/mouth/ProceduralMouth.tsx");
    const { default: Comparison } = await load("components/face/ProductionGeometryComparison.tsx");
    const { default: GeometryLayer } = await load("components/face/GeometryTransitionLayer.tsx");
    const { EYE_EXPRESSION_PRESETS } = await load("geometry/eyes/index.ts");
    const { MOUTH_EXPRESSION_PRESETS } = await load("geometry/mouth/index.ts");
    const { generateExpressionBlinkGeometry } = await load("geometry/eyes/blink/expressionBlinkGeometry.ts");
    const react = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const jsx = await import(pathToFileURL(await realpath("node_modules/react/jsx-runtime.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const render = (component, props) => renderToStaticMarkup(react.createElement(component, props));
    const out = "reports/production-geometry";
    await mkdir(out,{recursive:true});
    const endpoints = [], faces = [], illustrations = [];
    const before = useFaceStore.getState();
    const walk = (root,predicate) => [root,...root.children.flatMap(n => walk(n,predicate))].filter(predicate);
    const svgIn = (component,props) => parse(render(component,props)).querySelector("svg");
    const checkRefs = html => {
        const ids = [...html.matchAll(/\bid="([^"]*)"/g)].map(m=>m[1]);
        assert.equal(ids.length,new Set(ids).size,"resource IDs unique across simultaneous expressions/eyes/mouths");
        for(const m of html.matchAll(/url\(#([^)]*)\)|xlink:href="#([^"]*)"/g)) assert.ok(ids.includes(m[1]??m[2]),"resource reference resolves");
    };
    // Convert the actual production markup's positioned layers into a portable SVG.
    // The same 1490:960 canvas / 800:480 artwork centering is preserved.
    async function portableFace(html) {
        const tree = parse(html), layers = walk(tree,n => (n.props.class??"").split(" ").includes("face-layer"));
        const height = 800*960/1490, offset=(height-480)/2;
        const parts=[];
        for(const [index,node] of layers.entries()) {
            const style=Object.fromEntries((node.props.style??"").split(";").filter(Boolean).map(s=>s.split(":")));
            const [x,y,w,h]=["left","top","width","height"].map((k,i)=>parseFloat(style[k])*(i%2===0?8:4.8));
            let markup;
            if(node.localName==="img" || node.querySelector("img")) {
                const image=node.localName==="img"?node:node.querySelector("img");
                const src=image.props.src.replace(/^.*?assets\//,"public/assets/");
                markup=`<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/svg+xml;base64,${Buffer.from(await readFile(src)).toString("base64")}"/>`;
                if(image.props["data-layer"]==="faceLines") markup=`<g clip-path="url(#lines-window)">${markup}</g>`;
            } else {
                const svg=node.querySelector("svg");
                svg.setAttribute("x",String(x)); svg.setAttribute("y",String(y));
                svg.setAttribute("width",String(w)); svg.setAttribute("height",String(h));
                markup=serialize(svg);
            }
            parts.push({order:Number(style["z-index"]),index,markup});
        }
        parts.sort((a,b)=>a.order-b.order||a.index-b.index);
        return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1490" height="960" viewBox="0 0 800 ${height}"><defs><clipPath id="lines-window"><rect width="800" height="480"/></clipPath></defs><g transform="translate(0 ${offset})">${parts.map(p=>p.markup).join("")}</g></svg>`;
    }
    for(const expression of schemas.EMOTIONS) {
        requestExpression({emotion:expression,intensity:.5,transitionMs:300,source:"manual"});
        const state=useFaceStore.getState(), frame=geometry.canonicalProductionGeometry(expression);
        assert.strictEqual(frame.eyes,EYE_EXPRESSION_PRESETS[expression]);
        assert.strictEqual(frame.mouth,MOUTH_EXPRESSION_PRESETS[geometry.PRODUCTION_MOUTH_MAP[expression]].geometry);
        assert.strictEqual(frame.layout,FACE_LAYER_LAYOUTS[expression]);
        // Zustand SSR deliberately reads the initial server snapshot. Supply the
        // local prop for SSR artifacts; the live store adapter is exercised below.
        const asset=render(FaceRenderer,{expression}), procedural=render(FaceRenderer,{renderer:"procedural",expression});
        assert.match(asset,/data-renderer="asset"/); assert.doesNotMatch(asset,/data-procedural-eye/);
        assert.match(procedural,new RegExp('aria-label="Brone '+expression+'"'));
        assert.equal((procedural.match(/data-procedural-eye=/g)??[]).length,2);
        assert.equal((procedural.match(/data-geometry-mouth=/g)??[]).length,1);
        assert.match(procedural,/data-production-blink="disabled"/);
        assert.strictEqual(useFaceStore.getState(),state,"renderer switching preserves canonical state and metadata");
        assert.equal((procedural.match(/data-layer="faceBase"/g)??[]).length,1);
        assert.equal((procedural.match(/data-layer="faceLines"/g)??[]).length,1);
        const tree=parse(procedural), positioned=walk(tree,n=>(n.props.class??"").split(" ").includes("face-layer"));
        const eyes=positioned.filter(n=>n.props["data-geometry-eye"]);
        for(const [i,side] of ["left","right"].entries()) {
            const g=frame.eyes[side], p=frame.layout[side==="left"?"leftEye":"rightEye"];
            assert.equal(g.side,side);
            for(const [key,value] of Object.entries({left:p.x/8,top:p.y/4.8,width:p.width/8,height:p.height/4.8})) {
                const measured=Number(eyes[i].props.style.match(new RegExp(key+":([-+.\\deE]+)%"))[1]);
                assert.ok(Math.abs(measured-value)<1e-10,"no extra scaling/layout shift");
            }
            const svg=serialize(eyes[i].querySelector("svg"));
            const file=FACE_LAYER_ASSETS[FACE_LAYER_COMPOSITIONS[expression][side==="left"?"leftEye":"rightEye"]].src.replace(/^.*?assets\//,"public/assets/");
            endpoints.push({expression,part:side,original:await readFile(file,"utf8"),procedural:svg,width:g.width,height:g.height,exact:true});
            assert.equal(generateExpressionBlinkGeometry(expression,side,0),g,"canonical blink open endpoint remains exact");
        }
        const mouth=positioned.find(n=>n.props["data-geometry-mouth"]);
        const mouthFile=FACE_LAYER_ASSETS[FACE_LAYER_COMPOSITIONS[expression].mouth].src.replace(/^.*?assets\//,"public/assets/");
        endpoints.push({expression,part:"mouth",original:await readFile(mouthFile,"utf8"),procedural:serialize(mouth.querySelector("svg")),width:frame.mouth.width,height:frame.mouth.height,exact:!["idle","happy","happier"].includes(expression)});
        for(const effect of FACE_LAYER_COMPOSITIONS[expression].effects) assert.ok(procedural.includes(`data-layer="${effect.asset}"`));
        assert.ok(procedural.indexOf('data-layer="faceBase"')<procedural.indexOf('data-layer="faceLines"'));
        assert.ok(FACE_LAYER_ORDER.faceLines<FACE_LAYER_ORDER.eyes && FACE_LAYER_ORDER.eyes<FACE_LAYER_ORDER.mouth && FACE_LAYER_ORDER.mouth<FACE_LAYER_ORDER.effects);
        checkRefs(procedural);
        for(const [mode,html] of [["asset",asset],["procedural",procedural]]) await writeFile(`${out}/${expression}-${mode}.svg`,await portableFace(html));
        const image=await readFile(`public/assets/expressions/${expression}.png`);
        const height=800*960/1490;
        const reference=`<svg xmlns="http://www.w3.org/2000/svg" width="1490" height="960" viewBox="0 0 800 ${height}"><image x="0" y="${(height-480)/2}" width="800" height="480" href="data:image/png;base64,${image.toString("base64")}"/></svg>`;
        await writeFile(`${out}/${expression}-reference.svg`,reference);
        faces.push({expression});
        illustrations.push(react.createElement(FaceRenderer,{key:expression,renderer:"procedural",expression}));
    }
    checkRefs(renderToStaticMarkup(react.createElement("div",null,...illustrations)));
    assert.notDeepEqual(geometry.canonicalProductionGeometry("thinking").eyes.left,geometry.canonicalProductionGeometry("thinking").eyes.right);
    assert.throws(()=>geometry.canonicalProductionGeometry("shy"),RangeError);
    const rejectState=useFaceStore.getState();
    assert.equal(requestExpression({emotion:"shy",intensity:.5,transitionMs:0,source:"manual"}),"rejected");
    assert.strictEqual(useFaceStore.getState(),rejectState);
    // Every distinct canonical pair must morph; existing direct legs are reused
    // independently by eyes/mouth, with an explicit Idle bridge where needed.
    let directions=0, samples=0;
    for(const from of schemas.EMOTIONS) for(const to of schemas.EMOTIONS) {
        const supported=geometry.supportsProductionMorph(from,to);
        assert.equal(selectTransitionStrategy(from,to,300,false,true),supported?"GEOMETRY":"CROSSFADE");
        if(!supported) { assert.throws(()=>geometry.sampleProductionGeometry(from,to,.5),RangeError); continue; }
        directions++;
        const transitionMarkup=render(GeometryLayer,{layers:[{id:0,expression:from,initialOpacity:1},{id:1,expression:to,initialOpacity:0,strategy:"GEOMETRY"}],attach(){},attachFrame(){},prepared(){}});
        assert.match(transitionMarkup,/data-transition="geometry"/);
        assert.equal((transitionMarkup.match(/data-geometry-endpoint=/g)??[]).length,2);
        assert.equal((transitionMarkup.match(/data-geometry-overlay=/g)??[]).length,1);
        checkRefs(transitionMarkup);
        assert.strictEqual(geometry.sampleProductionGeometry(from,to,0).eyes,EYE_EXPRESSION_PRESETS[from]);
        assert.strictEqual(geometry.sampleProductionGeometry(from,to,1).eyes,EYE_EXPRESSION_PRESETS[to]);
        assert.throws(()=>geometry.sampleProductionGeometry(from,to,NaN),RangeError);
        const middle=geometry.sampleProductionGeometry(from,to,.5);
        const eyeNodes=Object.fromEntries(["left","right"].map(side=>[side,svgIn(Eye,{geometry:middle.eyes[side],scope:"test-"+side})]));
        const mouthNode=svgIn(Mouth,{geometry:middle.mouth});
        let defs, previousKind;
        for(const progress of [.01,.1,.25,.49,.499,.5,.501,.51,.75,.9,.99]) {
            const frame=geometry.sampleProductionGeometry(from,to,progress);
            for(const side of ["left","right"]) {
                dom.updateProductionEye(eyeNodes[side],frame.eyes[side],"test-"+side,svgIn(Eye,{geometry:EYE_EXPRESSION_PRESETS.idle[side]}));
                assert.deepEqual(normalize(eyeNodes[side]),normalize(svgIn(Eye,{geometry:frame.eyes[side],scope:"test-"+side})),"DOM patch equals React SVG scene");
            }
            const currentDefs=eyeNodes.left.querySelector("defs");
            const kind="kind" in frame.eyes.left?"layered":"ellipse";
            if(defs && kind===previousKind) assert.strictEqual(currentDefs,defs,"stable SVG resource nodes within a topology branch");
            defs=currentDefs;previousKind=kind;
            dom.updateProductionMouth(mouthNode,frame.mouth,"test-mouth");
            assert.deepEqual(normalize(mouthNode),normalize(svgIn(Mouth,{geometry:frame.mouth})),"DOM mouth/clip equals React renderer");
            const wrapper=new Element("div"); dom.positionGeometry(wrapper,frame.layout.leftEye);
            assert.equal(wrapper.style.left,frame.layout.leftEye.x/800*100+"%");
            if(JSON.stringify(frame.eyes.left)===JSON.stringify(EYE_EXPRESSION_PRESETS[from].left))
                assert.doesNotThrow(()=>generateExpressionBlinkGeometry(from,"left",.5,frame.eyes.left),"unchanged canonical eyes retain their existing blink contract");
            else assert.throws(()=>generateExpressionBlinkGeometry(from,"left",.5,frame.eyes.left),RangeError,"morph-modified source remains rejected by blink");
            samples++;
        }
    }
    assert.equal(directions,42); assert.equal(samples,462);
    const routes = {
        "idle-happy":{eyes:"unchanged",mouth:"direct"},
        "idle-shock":{eyes:"unchanged",mouth:"direct"},
        "happier-happy":{eyes:"direct",mouth:"unchanged"},
        "thinking-sad":{eyes:"via idle",mouth:"via idle"},
        "sad-cry":{eyes:"direct",mouth:"unchanged"},
    };
    for(const [pair,expected] of Object.entries(routes))assert.deepEqual(geometry.productionMorphRoute(...pair.split("-")),expected);
    for(const p of [.1,.25,.5,.75,.9]) {
        assert.strictEqual(geometry.sampleProductionGeometry("idle","happy",p).eyes.left,EYE_EXPRESSION_PRESETS.idle.left);
        assert.strictEqual(geometry.sampleProductionGeometry("idle","shock",p).eyes.right,EYE_EXPRESSION_PRESETS.idle.right);
        assert.strictEqual(geometry.sampleProductionGeometry("happier","happy",p).mouth,MOUTH_EXPRESSION_PRESETS.happy.geometry);
    }
    const bridge=geometry.sampleProductionGeometry("thinking","sad",.5);
    assert.strictEqual(bridge.eyes.left,EYE_EXPRESSION_PRESETS.idle.left);
    assert.strictEqual(bridge.mouth,MOUTH_EXPRESSION_PRESETS.idle.geometry);
    for(const from of schemas.EMOTIONS)for(const to of schemas.EMOTIONS)if(from!==to) {
        const positions=[.5-1e-6,.5,.5+1e-6].map(p=>geometry.sampleProductionGeometry(from,to,p).layout);
        for(const key of ["leftEye","rightEye","mouth"])for(const property of ["x","y","width","height"])
            assert.ok(Math.abs(positions[0][key][property]-positions[2][key][property])<.01,"bridge layout stays continuous");
    }
    // Actual procedural SVGs at placed geometry samples; effects are omitted so
    // the existing eye/mouth morph routes can be inspected without overlay fades.
    const routePairs=[["idle","happy"],["idle","shock"],["happier","happy"],["thinking","sad"],["sad","thinking"],["happier","cry"],["cry","happier"]];
    const points=[0,.1,.25,.5,.75,.9,1];
    let routeSheet=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="2240" height="1680"><rect width="100%" height="100%" fill="#e4e8ef"/>`;
    for(const [row,[from,to]] of routePairs.entries())for(const [col,p] of points.entries()) {
        const frame=geometry.sampleProductionGeometry(from,to,p), x=col*320, y=row*240;
        const scene=[];
        for(const side of ["left","right"]) {
            const node=svgIn(Eye,{geometry:frame.eyes[side]}),pos=frame.layout[side==="left"?"leftEye":"rightEye"];
            for(const [key,value] of Object.entries({x:pos.x,y:pos.y,width:pos.width,height:pos.height}))node.setAttribute(key,String(value));
            scene.push(serialize(node));
        }
        const node=svgIn(Mouth,{geometry:frame.mouth}),pos=frame.layout.mouth;
        for(const [key,value] of Object.entries({x:pos.x,y:pos.y,width:pos.width,height:pos.height}))node.setAttribute(key,String(value));
        scene.push(serialize(node));
        const encoded=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="800" height="480">${scene.join("")}</svg>`).toString("base64");
        routeSheet+=`<text x="${x+8}" y="${y+22}" font-family="Arial" font-size="13" fill="#152b43">${from} → ${to}: ${Math.round(p*100)}%</text><image x="${x}" y="${y+32}" width="320" height="192" href="data:image/svg+xml;base64,${encoded}"/>`;
    }
    await writeFile(`${out}/transition-routes.svg`,routeSheet+"</svg>");
    // Reuse the real coordinator and animation engine with a deterministic driver.
    const runs=[];
    const driver={create(target,parameters) {
        const initial=target.getAttribute("data-progress");
        const run={target,parameters,cancelled:false,play(){},cancel(){this.cancelled=true;},revert(){this.cancelled=true;target.setAttribute("data-progress",initial??"0");},
            seek(p){if(this.cancelled)return; if(parameters["data-progress"])target.setAttribute("data-progress",String(p)); else target.style.opacity=String(parameters.opacity[0]+(parameters.opacity[1]-parameters.opacity[0])*p); parameters.onUpdate?.(run);},
            complete(){this.seek(1);parameters.onComplete?.(run);}};
        runs.push(run);return run;
    }};
    const engine=createAnimationEngine(driver), nodes=new Map();
    let publications=0, frames=0, lastFrame;
    const coordinator=createExpressionTransition({id:0,expression:"idle",initialOpacity:1},()=>publications++,true);
    function reconcile(ready=true) {
        for(const [id,node] of nodes) if(!coordinator.layers.some(l=>l.id===id)) {coordinator.attachFrame(id,null);coordinator.attach(id,null);node.isConnected=false;nodes.delete(id);}
        for(const layer of coordinator.layers) {
            if(!nodes.has(layer.id)) {const node=new Element("div");node.style.opacity=String(layer.initialOpacity);nodes.set(layer.id,node);coordinator.attach(layer.id,node);}
            if(layer.strategy==="GEOMETRY")coordinator.attachFrame(layer.id,p=>{frames++;lastFrame=p;});
            if(ready)coordinator.prepared(layer.id,true);
        }
        coordinator.commit();
    }
    reconcile();coordinator.connect(engine);
    coordinator.request("sad",321);reconcile(false);
    assert.equal(runs.length,0,"wait for decode readiness");reconcile();
    assert.equal(runs.length,1);assert.equal(runs[0].parameters.duration,321);
    const published=publications, state=useFaceStore.getState();
    runs[0].seek(.37); assert.equal(lastFrame,.37);assert.equal(publications,published,"no per-frame React publication");assert.strictEqual(useFaceStore.getState(),state);
    const stale=runs[0];coordinator.request("cry",450);reconcile();
    assert.ok(stale.cancelled);assert.deepEqual(coordinator.layers.map(l=>l.expression),["sad","cry"],"interruption settles previous canonical target");
    const frameCount=frames;stale.parameters.onUpdate(stale);stale.parameters.onComplete(stale);assert.equal(frames,frameCount,"engine ignores stale callbacks");
    runs.at(-1).complete();reconcile();assert.equal(coordinator.layers[0].expression,"cry");assert.equal(coordinator.layers.length,1);
    coordinator.request("shock",300);reconcile();assert.equal(coordinator.layers[1].strategy,"GEOMETRY");
    assert.ok(runs.at(-1).parameters["data-progress"],"formerly unsupported canonical pair does not fade");
    coordinator.request("idle",0);reconcile();assert.equal(coordinator.layers.length,1);
    for(let i=0;i<30;i++){coordinator.request(i%2?"idle":"thinking",100);reconcile();assert.ok(coordinator.layers.length<=2);}
    coordinator.request("thinking",0,true);reconcile();assert.equal(coordinator.layers.length,1,"reduced motion/immediate settles target");
    coordinator.request("happier-transition",300,true);reconcile();assert.equal(coordinator.layers[0].expression,"happier-transition");
    coordinator.dispose();engine.dispose();assert.ok(runs.every(r=>r.cancelled));
    // Installed Anime.js attribute interpolation, using a DOM fixture (not a browser).
    const realDriver=await loadAnimeDriver(), realRuns=[];
    const realEngine=createAnimationEngine({create(target,p){const run=realDriver.create(target,p);realRuns.push(run);return run;}});
    const realNode=new Element("div");realNode.nodeType=1;realNode.setAttribute("data-progress","0");
    realEngine.registerTarget("geometry-test",realNode);
    realEngine.start("geometry-test",{"data-progress":[0,1],duration:300,ease:"linear"});
    realRuns[0].seek(150);assert.equal(Number(realNode.getAttribute("data-progress")),.5);
    realRuns[0].seek(300);assert.equal(Number(realNode.getAttribute("data-progress")),1);realEngine.dispose();
    // Exercise the actual FaceRenderer live-store binding separately from SSR's initial snapshot.
    const rendererModule={exports:{}};
    const rendererCode=ts.transpileModule((await readFile("src/components/face/FaceRenderer.tsx","utf8")).replaceAll("import.meta.env.DEV","true"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    compileFunction(rendererCode,["require","module","exports"])(name=>name==="react/jsx-runtime"?jsx:
        name==="../../stores/faceStore"?{useFaceStore:select=>select(useFaceStore.getState())}:{default:()=>null},rendererModule,rendererModule.exports);
    for(const expression of schemas.EMOTIONS) {
        requestExpression({emotion:expression,intensity:.5,transitionMs:321,source:"manual"});
        const state=useFaceStore.getState();
        for(const renderer of ["asset","procedural","asset"]) {
            const bound=rendererModule.exports.default({renderer});
            assert.equal(bound.props.expression,expression);assert.equal(bound.props.duration,321);assert.equal(bound.props.renderer,renderer);
            assert.strictEqual(useFaceStore.getState(),state);
        }
    }
    // Execute actual isolated comparison selectors; rendering and switching must not write state.
    const source=(await readFile("src/components/face/ProductionGeometryComparison.tsx","utf8")).replaceAll("import.meta.env.DEV","true");
    const cells=[];let index=0;
    const imports={react:{useState(initial){const i=index++;if(!(i in cells))cells[i]=typeof initial==="function"?initial():initial;return[cells[i],v=>cells[i]=v];},useRef(value){const i=index++;if(!(i in cells))cells[i]={current:value};return cells[i];}},"react/jsx-runtime":jsx,
        "../../schemas/faceMessages":schemas,"../../animation/productionGeometry":geometry,"./FaceRenderer":{default:FaceRenderer},"./FullImageFaceRenderer":{default:FullImage}};
    let automaticEffect, schedules=0, stops=0;
    imports.react.useEffect=effect=>{automaticEffect=effect;};
    imports["../../animation/automaticBlink"]={startAutomaticBlink:()=>{schedules++;return()=>{stops++;};}};
    imports["../../animation/useAnimationEngine"]={useAnimationEngine:()=>({rootRef:{current:null}})};
    imports["../../animation/morphBlinkPlayback"]=await load("animation/morphBlinkPlayback.ts");
    imports["./eyes/MorphBlinkPreview"]={default:()=>null};
    const module={exports:{}};
    compileFunction(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,["require","module","exports"])(n=>{assert.ok(n in imports,n);return imports[n];},module,module.exports);
    const find=(tree,predicate)=>{if(!react.isValidElement(tree))return; if(predicate(tree))return tree;for(const child of react.Children.toArray(tree.props.children)){const result=find(child,predicate);if(result)return result;}};
    const inspect=()=>{index=0;return module.exports.default();};
    const isolated=useFaceStore.getState();
    for(const expression of schemas.EMOTIONS){const tree=inspect();find(tree,e=>e.type==="select").props.onChange({target:{value:expression}});assert.equal(cells[0],expression);renderToStaticMarkup(inspect());assert.strictEqual(useFaceStore.getState(),isolated);}
    find(inspect(),e=>e.type==="select").props.onChange({target:{value:"shy"}});assert.equal(cells[0],"thinking");
    // Automatic mode is enabled without a manual checkbox, with no store writes.
    let tree=inspect();
    assert.equal(find(tree,e=>e.type==="input").props.checked,true);
    assert.ok(find(tree,e=>e.type===FaceRenderer && e.props.renderer==="procedural").props.blinkChannel);
    const details={open:true};tree.props.onToggle({target:details,currentTarget:details});
    cells[8]=true; // Engine readiness state in this hook fixture.
    cells[11].current={}; // Mounted playback ref; scheduler is stubbed above.
    const oldDocument=globalThis.document;
    let visibility;
    const fixture={hidden:false,addEventListener(name,fn){assert.equal(name,"visibilitychange");visibility=fn;},removeEventListener(name,fn){assert.equal(fn,visibility);visibility=undefined;}};
    globalThis.document=fixture;
    try {
        inspect();let cleanup=automaticEffect();assert.equal(schedules,1);
        fixture.hidden=true;visibility();assert.equal(stops,1);
        fixture.hidden=false;visibility();assert.equal(schedules,2);
        cleanup();assert.equal(stops,2);assert.equal(visibility,undefined);
        inspect();cleanup=automaticEffect();assert.equal(schedules,3,"setup replay schedules once");cleanup();
        tree=inspect();find(tree,e=>e.type==="input").props.onChange({target:{checked:false}});
        inspect();assert.equal(automaticEffect(),undefined,"disabled mode has no schedule");
        find(inspect(),e=>e.type==="input").props.onChange({target:{checked:true}});
        cells[3]="asset";inspect();assert.equal(automaticEffect(),undefined,"asset-only view has no schedule");
        cells[3]="all";
        const closed={open:false};inspect().props.onToggle({target:closed,currentTarget:closed});
        inspect();assert.equal(automaticEffect(),undefined,"collapsed panel has no schedule");
        assert.strictEqual(useFaceStore.getState(),isolated);
    } finally {globalThis.document=oldDocument;}
    const compareMarkup=render(Comparison,{});assert.match(compareMarkup,/Production renderer comparison/);
    const bundle=(await Promise.all((await readdir("dist/assets")).filter(n=>n.endsWith(".js")).map(n=>readFile("dist/assets/"+n,"utf8")))).join("");
    assert.doesNotMatch(bundle,/Production renderer comparison|Comparison expression:|Eye morph progress|Blink expression:/,"development UI remains excluded");
    assert.match(bundle,/data-production-blink/);assert.match(bundle,/data-transition/);
    await writeFile(`${out}/endpoints.json`,JSON.stringify(endpoints,null,2));
    await writeFile(`${out}/faces.json`,JSON.stringify(faces,null,2));
    await writeFile(`${out}/verification.json`,JSON.stringify({canonicalExpressions:7,directedMorphBranches:directions,domSamples:samples,blink:"disabled: canonical-only source contract rejects morph geometry",browser:"unavailable: browser access host and native pipe unavailable",checks:"SSR composition, exact preset identity, layout, IDs/resources, DOM/React SVG equivalence, coordinator cancellation/readiness/cleanup, real Anime.js scalar progression, local comparison isolation",statePreserved:true},null,2));
    useFaceStore.setState(before,true);
    console.log("PASS: seven production expressions, asset default/fallback, canonical state/controller, independent eye/mouth routes, composition/layout/resources, all 42 directed morphs, 462 DOM-adapter/React SVG samples including Idle topology crossings, continuous layouts, no canonical full-face fades, interruption/readiness/cleanup, renderer/local preview state preservation and unchanged blink guards. Browser QA unavailable.");
} finally {await server.close();}
