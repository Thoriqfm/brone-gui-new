import assert from "node:assert/strict";
import {mkdir,writeFile,realpath,readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {createServer} from "vite";
import {Element,parse,serialize,normalize} from "./production-renderer-test-dom.mjs";

const server=await createServer({server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},appType:"custom"});
try {
    const load=p=>server.ssrLoadModule("/src/"+p);
    const eye=await load("geometry/eyes/index.ts"), canonical=await load("geometry/eyes/blink/index.ts");
    const {generateMorphAwareBlinkGeometry:generate,MORPH_BLINK_PAIRS:pairs}=canonical;
    const {MorphBlinkGeometryEye:View,applyMorphBlinkEye}=await load("components/face/eyes/MorphBlinkEye.tsx");
    const {default:CanonicalView}=await load("components/face/eyes/ExpressionBlinkEye.tsx");
    const {default:BlinkEye}=await load("components/face/eyes/BlinkEye.tsx");
    const {default:ProceduralEye}=await load("components/face/eyes/ProceduralEye.tsx");
    const {createBlinkChannel,createMorphBlinkPlayback}=await load("animation/morphBlinkPlayback.ts");
    const {MORPH_BLINK_TIMING}=await load("animation/morphBlinkPlayback.ts");
    const {DEFAULT_BLINK_TIMING}=await load("components/face/eyes/EyeBlinkPreview.tsx");
    assert.deepEqual(MORPH_BLINK_TIMING,DEFAULT_BLINK_TIMING,"reuse existing 100/40/150 blink timing");
    const {createAnimationEngine,loadAnimeDriver}=await load("animation/animationEngine.ts");
    const {createExpressionTransition}=await load("animation/expressionTransition.ts");
    const {productionEyeMorphContext,sampleProductionGeometry}=await load("animation/productionGeometry.ts");
    const {useFaceStore}=await load("stores/faceStore.ts");
    const {default:FaceRenderer}=await load("components/face/FaceRenderer.tsx");
    const {FACE_LAYER_LAYOUTS:layouts}=await load("config/faceLayerLayouts.ts");
    const react=await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const {renderToStaticMarkup}=await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const render=(component,props)=>renderToStaticMarkup(react.createElement(component,props));
    const svg=(component,props)=>parse(render(component,props)).querySelector("svg");
    const context=(from,to,side,m,b)=>({from,to,side,morphProgress:m,blinkProgress:b});
    const state=useFaceStore.getState(), snapshot=JSON.stringify(eye.EYE_EXPRESSION_PRESETS);
    const sourceOf=g=>"source" in g?g.source:g;
    const refs=html=>{
        const ids=[...html.matchAll(/\bid="([^"]*)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
        for(const m of html.matchAll(/url\(#([^)]*)\)|xlink:href="#([^"]*)"/g))assert.ok(ids.includes(m[1]??m[2]),"local resource reference");
    };
    const point=(lid,t)=>[0,1].map(k=>(1-t)**3*lid.start[k]+3*(1-t)**2*t*lid.curve[0][k]+3*(1-t)*t*t*lid.curve[1][k]+t**3*lid.curve[2][k]);
    const samples=[],endpoints=[],instances=[];
    let dense=0;
    for(const expression of eye.EYE_EXPRESSIONS)for(const side of ["left","right"])for(const b of [0,.25,.5,.75,.9,1]) {
        const ctx=context(expression,expression,side,.5,b),g=generate(ctx),expected=canonical.generateExpressionBlinkGeometry(expression,side,b);
        assert.deepEqual(g,expected,"canonical behavior preserved exactly");
        const actual=render(View,{context:ctx}),original=render(CanonicalView,{expression,geometry:expected});
        assert.deepEqual(normalize(parse(actual).querySelector("svg")),normalize(parse(original).querySelector("svg")),"canonical rendering delegation");
        endpoints.push({expression,side,b,actual,original});
    }
    for(const [from,to] of pairs.flatMap(([a,b])=>[[a,b],[b,a]]))for(const side of ["left","right"]) {
        const a=eye.EYE_EXPRESSION_PRESETS[from][side],z=eye.EYE_EXPRESSION_PRESETS[to][side];
        for(const [m,expected] of [[0,a],[1,z]])for(const b of [0,.25,.5,.75,.9,1]) {
            const g=generate(context(from,to,side,m,b));
            assert.strictEqual(sourceOf(g),expected,"canonical endpoint source object");
            assert.deepEqual(g,canonical.generateExpressionBlinkGeometry(m===0?from:to,side,b));
        }
        for(let im=0;im<=20;im++) {
            const m=im/20,current=eye.interpolateEyeGeometry(a,z,m);
            const currentSnapshot=JSON.stringify(current);
            assert.strictEqual(generate({...context(from,to,side,m,0),current}),current,"exact current geometry at open");
            for(let ib=0;ib<=20;ib++) {
                const b=ib/20,ctx={...context(from,to,side,m,b),current},g=generate(ctx);
                assert.deepEqual(generate(ctx),g,"determinism");eye.validateEyeGeometry(sourceOf(g));
                if("source" in g) {
                    for(const lid of [g.upper,g.lower])for(const p of [lid.start,...lid.curve])assert.ok(p.every(Number.isFinite));
                    for(let j=0;j<=32;j++) {
                        const u=point(g.upper,j/32),l=point(g.lower,j/32);
                        assert.ok(Math.abs(u[0]-l[0])<1e-9,"shared monotone x parameter");
                        assert.ok(u[1]<=l[1]+1e-9,"noncrossing connected aperture");
                    }
                    for(let j=0;j<3;j++)assert.ok(g.upper.curve[j][0]>(j?g.upper.curve[j-1][0]:g.upper.start[0]),"strict x prevents lid/aperture self intersections");
                    if(b===1){assert.deepEqual(g.upper,g.lower);assert.equal(g.interiorVisible,false);}
                }
                dense++;
            }
            assert.equal(JSON.stringify(current),currentSnapshot,"intermediate input geometry is not mutated");
        }
        const template=svg(BlinkEye,{geometry:eye.EYE_EXPRESSION_PRESETS.idle[side]}).querySelector("[data-blink-interior]");
        const node=svg(View,{context:context(from,to,side,0,0)});
        for(const m of [0,.25,.5,.75,1])for(const b of [0,.25,.5,.75,.9,1]) {
            const ctx=context(from,to,side,m,b),g=generate(ctx),html=render(View,{context:ctx});
            refs(html);assert.doesNotMatch(html,/NaN|Infinity|scaleY/);
            applyMorphBlinkEye(node,ctx,template,"dom-"+side);
            const interior=node.querySelector("[data-blink-interior]");
            assert.equal(interior.getAttribute("visibility"),b===1?"hidden":"visible");
            assert.equal(node.querySelector("[data-blink-upper]").getAttribute("d"),"source" in g?g.upperPath:"");
            assert.equal(node.firstElementChild.children[1].firstElementChild.getAttribute("d"),canonical.eyeBlinkBoundary(sourceOf(g)));
            // Source scene remains structurally intact through clipping, including
            // Cry water/blur and Sad masks/use/transforms. Reopening removes clip.
            if(b===0)assert.equal(interior.getAttribute("clip-path"),"none");
            if(b>0)assert.match(interior.getAttribute("clip-path"),/^url\(#/);
            const pos=eye.interpolateEyeLayout(layouts[from][side==="left"?"leftEye":"rightEye"],layouts[to][side==="left"?"leftEye":"rightEye"],m);
            const originalPaint=render(ProceduralEye,{geometry:sourceOf(g)});
            assert.equal((html.match(/fill="#76C5FD"/g)??[]).length,(originalPaint.match(/fill="#76C5FD"/g)??[]).length,"water scene is neither removed nor duplicated");
            assert.equal((serialize(node).match(/<feGaussianBlur/g)??[]).length,(originalPaint.match(/<feGaussianBlur/g)??[]).length,"source blur/filter primitives remain present");
            samples.push({from,to,side,m,b,width:sourceOf(g).width,height:sourceOf(g).height,layout:pos,svg:html,dom:serialize(node),open:render(View,{context:{...ctx,blinkProgress:0}}),currentOpen:render(ProceduralEye,{geometry:sourceOf(g)}),aperture:"source" in g?g.aperture:null});
        }
        instances.push(react.createElement(View,{key:from+to+side,context:context(from,to,side,.5,.5)}));
    }
    assert.equal(dense,8820);assert.equal(samples.length,600);assert.equal(endpoints.length,84);
    refs(renderToStaticMarkup(react.createElement("div",null,...instances)));
    const valid=context("idle","cry","right",.5,.5);
    for(const key of ["morphProgress","blinkProgress"])for(const value of [NaN,Infinity,-Infinity,".5",null,undefined])assert.throws(()=>generate({...valid,[key]:value}),RangeError);
    for(const bad of [null,{}, {...valid,side:"middle"},{...valid,from:"shy"},{...valid,to:"happier-transition"},{...valid,from:"happy",to:"cry"},{...valid,current:null},{...valid,current:{}},{...valid,current:eye.EYE_EXPRESSION_PRESETS.idle.right}])assert.throws(()=>generate(bad),RangeError);
    assert.deepEqual(generate({...valid,morphProgress:-1}),generate({...valid,morphProgress:0}));
    assert.deepEqual(generate({...valid,morphProgress:2}),generate({...valid,morphProgress:1}));
    assert.deepEqual(generate({...valid,blinkProgress:-1}),generate({...valid,blinkProgress:0}));
    assert.deepEqual(generate({...valid,blinkProgress:2}),generate({...valid,blinkProgress:1}));
    let productionContexts=0;
    for(const from of eye.EYE_EXPRESSIONS)for(const to of eye.EYE_EXPRESSIONS)if(from!==to)for(const m of [0,.25,.5,.75,1])for(const side of ["left","right"]) {
        const frame=sampleProductionGeometry(from,to,m),ctx={...productionEyeMorphContext(from,to,m),side,blinkProgress:.75,current:frame.eyes[side]};
        assert.doesNotThrow(()=>generate(ctx),"production routed legs keep explicit validated contexts");
        productionContexts++;
    }
    const channel=createBlinkChannel(),runs=[];
    const driver={create(target,parameters){const initial=target.getAttribute("data-progress");const run={target,parameters,cancelled:false,
        play(){},cancel(){this.cancelled=true;},revert(){this.cancelled=true;target.setAttribute("data-progress",initial);},
        seek(p){if(this.cancelled)return;const [a,b]=parameters["data-progress"];target.setAttribute("data-progress",String(a+(b-a)*p));parameters.onUpdate?.(run);},complete(){this.seek(1);parameters.onComplete?.(run);}};runs.push(run);return run;}};
    const engine=createAnimationEngine(driver),mNode=new Element("span",{"data-progress":"0"}),bNode=new Element("span",{"data-progress":"0"});
    const frames=[];let playback=createMorphBlinkPlayback(engine,mNode,bNode,(m,b)=>frames.push([m,b]),channel);
    playback.seekMorph(.4);playback.seekBlink(.75);playback.playBlink();assert.deepEqual(runs.at(-1).parameters["data-progress"],[.75,1],"replacement starts at displayed blink progress");
    assert.equal(runs.at(-1).parameters.duration,100);runs.at(-1).complete();
    const opening=runs.at(-1);assert.equal(opening.parameters.delay,40);assert.equal(opening.parameters.duration,150);
    playback.playMorph(1,1000);const morphRun=runs.at(-1);assert.deepEqual(morphRun.parameters["data-progress"],[.4,1]);morphRun.seek(.5);assert.ok(Math.abs(playback.morphProgress-.7)<1e-12);assert.equal(channel.progress,1);
    opening.complete();assert.equal(channel.progress,0);assert.ok(Math.abs(frames.at(-1)[0]-.7)<1e-12,"reopens to current morph, not source");
    playback.playBlink();const stale=runs.at(-1);stale.seek(.3);playback.playBlink();const count=runs.length;stale.parameters.onComplete(stale);assert.equal(runs.length,count,"stale close cannot start opening");
    playback.seekBlink(.25);assert.equal(engine.isAnimating("morph-blink-preview-progress"),true,"blink cancellation does not cancel morph");
    const beforeDispose=frames.length,displayedBeforeDispose=[playback.morphProgress,playback.blinkProgress];playback.dispose();playback.dispose();runs.at(-1).parameters.onUpdate?.(runs.at(-1));assert.equal(frames.length,beforeDispose);
    // StrictMode-style mount/cleanup/setup with the same DOM targets.
    playback=createMorphBlinkPlayback(engine,mNode,bNode,(m,b)=>frames.push([m,b]),channel);assert.deepEqual(frames.at(-1),displayedBeforeDispose,"StrictMode-style remount retains both displayed scalars");playback.playBlink();playback.dispose();engine.dispose();assert.ok(runs.every(r=>r.cancelled));
    // Latest-wins continuity only in manual blink validation; default coordinator
    // behavior is checked unchanged by the existing production/transition suites.
    const continuousEngine=createAnimationEngine(driver);
    const coordinator=createExpressionTransition({id:0,expression:"idle",initialOpacity:1},()=>{},true,true);
    const nodes=new Map();let displayed=0;
    const reconcile=()=>{
        for(const [id,node]of nodes)if(!coordinator.layers.some(l=>l.id===id)){coordinator.attach(id,null);nodes.delete(id);node.isConnected=false;}
        for(const l of coordinator.layers){if(!nodes.has(l.id)){const node=new Element("div",{"data-progress":"0"});node.style.opacity=String(l.initialOpacity);nodes.set(l.id,node);coordinator.attach(l.id,node);}coordinator.attachFrame(l.id,p=>displayed=p);coordinator.prepared(l.id);}
    };
    reconcile();coordinator.connect(continuousEngine);coordinator.request("cry",300);reconcile();const active=runs.at(-1);active.seek(.4);
    coordinator.request("sad",300);coordinator.request("thinking",500);assert.equal(displayed,.4,"new requests do not snap morph during blink");
    assert.equal(active.cancelled,false);active.complete();reconcile();assert.equal(coordinator.layers.at(-1).expression,"thinking","only latest request retained");
    coordinator.dispose();continuousEngine.dispose();
    const realDriver=await loadAnimeDriver(),realRuns=[],realFrames=[];
    const realEngine=createAnimationEngine({create(target,parameters){const run=realDriver.create(target,parameters);realRuns.push(run);return run;}});
    const realM=new Element("span",{"data-progress":".4"}),realB=new Element("span",{"data-progress":".75"});realM.nodeType=realB.nodeType=1;
    const realChannel=createBlinkChannel(),realPlayback=createMorphBlinkPlayback(realEngine,realM,realB,(m,b)=>realFrames.push([m,b]),realChannel);
    realPlayback.playMorph(1,1000);const realMorph=realRuns.at(-1);realMorph.seek(500);
    assert.ok(Math.abs(realPlayback.morphProgress-.7)<1e-9);
    realPlayback.playBlink();realRuns.at(-1).seek(100);assert.equal(realPlayback.blinkProgress,1);
    realMorph.seek(750);const currentMorph=realPlayback.morphProgress;
    // Anime.js seek() is relative to the active phase, excluding its delay;
    // negative time samples the configured hold before opening begins.
    const realOpening=realRuns.at(-1);realOpening.seek(-20);assert.equal(realPlayback.blinkProgress,1,"real Anime hold");
    realOpening.seek(150);assert.equal(realPlayback.blinkProgress,0);assert.equal(realFrames.at(-1)[0],currentMorph,"real Anime reopening preserves evolved morph");
    realPlayback.dispose();realEngine.dispose();
    const html=render(FaceRenderer,{renderer:"procedural",expression:"cry",blinkChannel:channel});assert.match(html,/data-production-blink="enabled"/);refs(html);
    assert.strictEqual(useFaceStore.getState(),state);assert.equal(JSON.stringify(eye.EYE_EXPRESSION_PRESETS),snapshot);
    await mkdir("reports/morph-aware-blinking",{recursive:true});
    await writeFile("reports/morph-aware-blinking/samples.json",JSON.stringify(samples));
    await writeFile("reports/morph-aware-blinking/canonical.json",JSON.stringify(endpoints));
    await writeFile("reports/morph-aware-blinking/check-results.json",JSON.stringify({denseSamples:dense,visualSamples:samples.length,canonicalComparisons:endpoints.length,productionRouteContexts:productionContexts,status:"PASS",browser:"unavailable: browser access host/native pipe"},null,2));
    console.log("PASS: 8820 dense samples, 600 visual/DOM samples, 84 exact canonical delegations, five bidirectional pairs/both sides, identity/open/closed endpoints, connected/noncrossing lids, resources/details/current-source validation, all routed production contexts, independent channels, timings/reopening/replacement/cancellation/StrictMode-style cleanup, continuous latest-wins and store isolation. Raster/browser checks are separate.");
}finally{await server.close();}
