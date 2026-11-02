// Run from frontend. Static geometry + actual local preview handlers + real Anime.js.
import assert from "node:assert/strict";
import { readFile, realpath, mkdir, writeFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { animate } from "animejs";
import { createServer } from "vite";

const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
    const eye = await server.ssrLoadModule("/src/geometry/eyes/index.ts");
    const { EYE_EXPRESSION_PRESETS: presets, HAPPIER_TRANSITION_PREVIEW,
        interpolateEyeGeometry: morph, interpolateEyeLayout: layout, prepareIdleHappierEye: prepare,
        ellipseEyeContour, splitEyeCubic, generateEyeLayers, validateEyeGeometry } = eye;
    const layouts = await server.ssrLoadModule("/src/config/faceLayerLayouts.ts");
    const { FACE_LAYER_LAYOUTS: positions } = layouts;
    const { default: ProceduralEye } = await server.ssrLoadModule("/src/components/face/eyes/ProceduralEye.tsx");
    const { default: Preview } = await server.ssrLoadModule("/src/components/face/eyes/EyeMorphPreview.tsx");
    const { useFaceStore } = await server.ssrLoadModule("/src/stores/faceStore.ts");
    const react = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const jsx = await import(pathToFileURL(await realpath("node_modules/react/jsx-runtime.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const render = (component, props) => renderToStaticMarkup(react.createElement(component, props));
    const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
    const deepNear = (a, b) => {
        if (typeof a === "number") { near(a, b); return; }
        if (!a || typeof a !== "object") { assert.equal(a, b); return; }
        assert.deepEqual(Object.keys(a), Object.keys(b));
        for (const key of Object.keys(a)) deepNear(a[key], b[key]);
    };
    const evaluate = (p, [a, b, q], t) => [0, 1].map((k) => (1-t)**3*p[k] + 3*(1-t)**2*t*a[k] + 3*(1-t)*t*t*b[k] + t**3*q[k]);
    const contourFromCommands = (commands) => ({ start: commands[0].slice(1), curves: commands.slice(1, -1).map((c) => [c.slice(1,3), c.slice(3,5), c.slice(5,7)]) });
    const polygon = (contour, steps = 24) => {
        let start = contour.start; const points = [];
        for (const c of contour.curves) {
            for (let j = 0; j < steps; j++) points.push(evaluate(start, c, j / steps));
            start = c[2];
        }
        return points;
    };
    const area = (points) => points.reduce((sum, p, i) => {
        const q = points[(i+1)%points.length]; return sum + p[0]*q[1] - q[0]*p[1];
    }, 0) / 2;
    const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
    const simple = (points) => {
        for (let i = 0; i < points.length; i++) for (let j = i+2; j < points.length; j++) {
            if (i === 0 && j === points.length-1) continue;
            const a=points[i], b=points[(i+1)%points.length], c=points[j], d=points[(j+1)%points.length];
            assert.ok(!(cross(a,b,c)*cross(a,b,d) < -1e-10 && cross(c,d,a)*cross(c,d,b) < -1e-10), "sampled contour self-intersection");
        }
    };
    const inside = (p, poly) => {
        let yes=false;
        for (let i=0,j=poly.length-1;i<poly.length;j=i++) {
            const a=poly[i], b=poly[j];
            if ((a[1]>p[1]) !== (b[1]>p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) yes=!yes;
        }
        return yes;
    };
    const samples = [0,0.1,0.25,0.5,0.75,0.9,1], renders = [], metrics = [];
    const snapshot = JSON.stringify([presets, positions]);
    assert.notStrictEqual(prepare("left"),prepare("right"),"prepare each side independently");
    for (const side of ["left", "right"]) {
        const a = presets.idle[side], b = presets.happier[side], m = prepare(side);
        assert.strictEqual(morph(a,b,0),a); assert.strictEqual(morph(a,b,1),b);
        assert.strictEqual(morph(a,b,-1),a); assert.strictEqual(morph(a,b,2),b);
        assert.strictEqual(morph(b,a,0),b); assert.strictEqual(morph(b,a,1),a);
        assert.ok(Object.isFrozen(m.targetBody.curves[0][0]));
        assert.deepEqual(m.cardinalIndices,[0,2,4,6]);
        for (const c of [m.sourceBody,m.sourceOutline,m.targetBody]) {
            assert.equal(c.curves.length,8); assert.ok(area(polygon(c))>0);
            assert.deepEqual(c.curves.at(-1)[2], c.start);
        }
        const anchors = (c) => [c.start,c.curves[1][2],c.curves[3][2],c.curves[5][2]];
        assert.deepEqual(anchors(m.sourceBody), [[64.5,4],[125,85.5],[64.5,167],[4,85.5]]);
        const targetAnchors=anchors(m.targetBody);
        deepNear(targetAnchors[0],[61.3243,2]); deepNear(targetAnchors[1],[120.649,81.3073]);
        near(targetAnchors[2][1],136.41675); deepNear(targetAnchors[3],[2,81.3073]);
        // Analytic evaluation of each exact source split at arbitrary parameters.
        const native=contourFromCommands(b.layers[0].commands);
        let current=native.start, preparedIndex=0;
        for (let i=0;i<native.curves.length;i++) {
            const split=[0,2,4].includes(i), parts=split ? splitEyeCubic(current,native.curves[i],0.5) : [native.curves[i]];
            let p=current;
            parts.forEach((curve,j) => {
                deepNear(curve,m.targetBody.curves[preparedIndex++]);
                for (const t of [0,0.13,0.5,0.91,1]) deepNear(evaluate(p,curve,t),evaluate(current,native.curves[i],split ? (j+t)/2 : t));
                p=curve[2];
            });
            current=native.curves[i][2];
        }
        let radial=0; current=m.sourceBody.start;
        for (const c of m.sourceBody.curves) {
            for (let j=0;j<=10000;j++) {
                const p=evaluate(current,c,j/10000);
                radial=Math.max(radial,Math.abs(Math.hypot((p[0]-a.body.center[0])/a.body.radius[0],(p[1]-a.body.center[1])/a.body.radius[1])-1));
            }
            current=c[2];
        }
        assert.ok(radial < 4.25e-6);
        const bound=radial*Math.max(...a.body.radius);
        assert.ok(bound<0.00035);
        metrics.push({side,ellipseSamples:80008,maxNormalizedRadialError:radial,radialDistanceBoundLogicalUnits:bound});
        for (let i=0;i<=100;i++) {
            const t=i/100, g=morph(a,b,t);
            assert.equal(g.side,side);
            validateEyeGeometry(g); assert.deepEqual(morph(a,b,t),g);
            deepNear(morph(b,a,1-t),g);
            const position=layout(positions.idle[side+"Eye"],positions.happier[side+"Eye"],t);
            near(position.width,g.width); near(position.height,g.height);
            for (const key of ["x","y","width","height"]) near(position[key],positions.idle[side+"Eye"][key]*(1-t)+positions.happier[side+"Eye"][key]*t);
            if (i>0 && i<100) {
                generateEyeLayers(g,"test");
                const body=contourFromCommands(g.layers[0].children[0].commands), outline=contourFromCommands(g.layers[1].commands);
                const highlight=contourFromCommands(g.layers[3].commands);
                for (const c of [body,outline,highlight]) {
                    assert.deepEqual(c.curves.at(-1)[2],c.start); simple(polygon(c));
                }
                for (const c of [body,outline]) {
                    const p=polygon(c); assert.ok(area(p)>0);
                    for (let j=0;j<p.length;j++) assert.ok(cross(p[j],p[(j+1)%p.length],p[(j+2)%p.length])>=-1e-6,"no unexpected concave body bulge");
                }
                const poly=polygon(body,48);
                for (const p of polygon(highlight)) assert.ok(inside(p,poly),"highlight remains in body");
                for (const key of ["sourceBody","sourceOutline","sourceHighlight"]) {
                    const result=key==="sourceBody"?body:key==="sourceOutline"?outline:highlight;
                    const target=key==="sourceHighlight"?m.targetHighlight:m.targetBody;
                    const aa=[m[key].start,...m[key].curves.flat()], bb=[target.start,...target.curves.flat()];
                    [result.start,...result.curves.flat()].forEach((p,j)=>p.forEach((n,k)=>{ assert.ok(Number.isFinite(n)); near(n,aa[j][k]*(1-t)+bb[j][k]*t); }));
                }
                const small=g.layers[2].attributes;
                near(small.cx,27.7-2*t); near(small.cy,94.8559-2*t);
                assert.equal(small.opacity,0.96); assert.equal(small.rx,9.2); assert.equal(small.ry,9.6);
                assert.equal(g.layers[1].attributes.stroke,"black"); assert.equal(g.layers[1].attributes.strokeWidth,4);
                const [gradient,filter]=g.layers[4].children;
                near(gradient.attributes.x1,64.5*(1-t)+61.3243*t); near(gradient.attributes.y2,167*(1-t)+136.416*t);
                assert.deepEqual(gradient.children.map(n=>n.attributes),a.gradient.stops.map(s=>({offset:s.offset,stopColor:s.color})));
                assert.equal(filter.children[3].attributes.dy,4); assert.equal(filter.children[4].attributes.stdDeviation,2);
                near(filter.children[6].attributes.values[18],0.25*(1-t));
                assert.equal(g.layers[0].attributes.opacity,undefined,"no body opacity crossfade");
                assert.equal(g.layers[1].attributes.opacity,undefined,"no outline opacity crossfade");
            }
            if (samples.includes(t)) renders.push({side,progress:t,width:g.width,height:g.height,layout:position,svg:render(ProceduralEye,{geometry:g})});
        }
        assert.notDeepEqual(morph(a,b,0.25),morph(a,b,0.75));
        deepNear(morph(structuredClone(a),structuredClone(b),0.5),morph(a,b,0.5));
        const almostIdle=morph(a,b,1e-7);
        contourFromCommands(almostIdle.layers[1].commands).start.forEach((n,i)=>near(n,m.sourceOutline.start[i],1e-5));
        // No unsupported endpoint is accepted even when progress clamps to an endpoint.
        for (const other of [HAPPIER_TRANSITION_PREVIEW[side],{...b,width:b.width+1}])
            for (const t of [0,0.5,1]) assert.throws(()=>morph(a,other,t),/correspondence/);
        for (const t of [NaN,Infinity,-Infinity,"0.5",undefined,null]) {
            assert.throws(()=>morph(a,b,t),/progress/); assert.throws(()=>layout(positions.idle.leftEye,positions.happier.leftEye,t),/progress/);
        }
        assert.throws(()=>morph(a,presets.happier[side==="left"?"right":"left"],0.5),/sides/);
        assert.throws(()=>morph(null,b,0.5),RangeError);
        assert.throws(()=>layout({...positions.idle.leftEye,width:0},positions.happier.leftEye,0.5));
    }
    assert.equal(JSON.stringify([presets,positions]),snapshot,"canonical presets/layouts unchanged");
    for (const ellipse of [null,{}, {center:[NaN,0],radius:[1,1]}, {center:[0,0],radius:[0,1]}, {center:new Array(2),radius:[1,1]}])
        assert.throws(()=>ellipseEyeContour(ellipse),RangeError);
    assert.throws(()=>prepare("mirror"),RangeError);
    assert.throws(()=>splitEyeCubic([0,0],[[1,1],[2,2],[3,3]],0),RangeError);

    const before=useFaceStore.getState();
    const previewHtml=render(Preview);
    assert.ok(previewHtml.includes('data-eye-morph="left"')); assert.ok(previewHtml.includes('data-eye-morph="right"'));
    assert.ok(previewHtml.includes("Idle endpoint")); assert.strictEqual(useFaceStore.getState(),before);
    // Real Anime.js object-target seeks exercise the installed 4.5 API.
    const value={progress:0}, animation=animate(value,{progress:1,duration:1000,ease:"inOutSine",autoplay:false});
    for (const [time,expected] of [[0,0],[500,0.5],[1000,1]]) {
        animation.seek(time); near(value.progress,expected); morph(presets.idle.left,presets.happier.left,value.progress);
    }
    animation.cancel();

    const originalSource=await readFile("src/components/face/eyes/EyeMorphPreview.tsx","utf8");
    function harness(driverPromise) {
        let states=[],refs=[],si=0,ri=0,mounted=false,effects=[];
        const hooks={
            useState(initial){const i=si++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=v;}];},
            useRef(initial){const i=ri++;return refs[i]??={current:initial};},
            useEffect(fn){if(!mounted)effects.push(fn);},
        };
        const source=originalSource.replace('import("animejs")','require("driverPromise")');
        const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
        const imports={react:hooks,"react/jsx-runtime":jsx,driverPromise,"../../../geometry/eyes":eye,
            "../../../config/faceLayerLayouts":layouts,"./ProceduralEye":{default:ProceduralEye}};
        const module={exports:{}};
        compileFunction(code,["require","module","exports"])(name=>{assert.ok(name in imports,name);return imports[name];},module,module.exports);
        const render=()=>{si=0;ri=0;return module.exports.default();};
        let tree=render();mounted=true;const cleanup=effects[0]();
        return{render,cleanup,initial:tree};
    }
    const find=(tree,fn)=>{if(!react.isValidElement(tree))return;if(fn(tree))return tree;for(const c of react.Children.toArray(tree.props.children)){const n=find(c,fn);if(n)return n;}};
    const button=(tree,text)=>find(tree,e=>e.type==="button"&&react.Children.toArray(e.props.children).join("")===text);
    const slider=tree=>find(tree,e=>e.type==="input");
    const progress=tree=>slider(tree).props.value;
    const visibleEye=(tree,side="left")=>find(tree,e=>e.type===ProceduralEye&&e.props.geometry.side===side).props.geometry;
    const tick=()=>new Promise(resolve=>setImmediate(resolve));
    const runs=[];
    const fakeAnimate=(target,options)=>{const run={target,options,cancelled:false,playing:false,
        cancel(){this.cancelled=true;},play(){this.playing=true;},frame(p){target.progress=p;options.onUpdate();},complete(){options.onComplete();}};runs.push(run);return run;};
    const h=harness(Promise.resolve({animate:fakeAnimate}));
    assert.equal(button(h.initial,"Play Idle → Happier").props.disabled,true);
    await tick();let tree=h.render();assert.equal(button(tree,"Play Idle → Happier").props.disabled,false);
    button(tree,"Play Idle → Happier").props.onClick();let run=runs.at(-1);assert.ok(run.playing);assert.equal(run.options.duration,1000);assert.equal(run.options.ease,"inOutSine");
    run.frame(0.25);near(progress(h.render()),0.25);
    assert.deepEqual(visibleEye(h.render()),morph(presets.idle.left,presets.happier.left,0.25),"actual preview receives changed geometry");
    run.complete();tree=h.render();assert.equal(progress(tree),1);assert.strictEqual(visibleEye(tree),presets.happier.left);
    assert.equal(button(tree,"Play Idle → Happier").props.disabled,true);
    button(tree,"Reverse Happier → Idle").props.onClick();run=runs.at(-1);run.frame(0.75);near(progress(h.render()),0.75);
    slider(h.render()).props.onChange({target:{value:"0.5"}});assert.ok(run.cancelled);run.options.onUpdate();run.complete();near(progress(h.render()),0.5);
    button(h.render(),"Reset eyes to Idle").props.onClick();assert.equal(progress(h.render()),0);
    for(const p of samples){button(h.render(),Math.round(p*100)+"%").props.onClick();near(progress(h.render()),p);
        assert.deepEqual(visibleEye(h.render()),morph(presets.idle.left,presets.happier.left,p));}
    slider(h.render()).props.onChange({target:{value:"NaN"}});assert.equal(progress(h.render()),1);
    button(h.render(),"Reverse Happier → Idle").props.onClick();run=runs.at(-1);h.cleanup();assert.ok(run.cancelled);run.options.onUpdate();run.complete();assert.equal(progress(h.render()),1);
    let resolveEarly;const early=harness(new Promise(resolve=>{resolveEarly=resolve;}));early.cleanup();resolveEarly({animate:fakeAnimate});await tick();assert.equal(button(early.render(),"Play Idle → Happier").props.disabled,true);
    const failed=harness(Promise.reject(new Error("expected load failure")));await tick();assert.ok(renderToStaticMarkup(failed.render()).includes("Animation failed to load"));failed.cleanup();

    // Target changes own cancellation/reset, including while a run or import is pending.
    const selector=tree=>find(tree,e=>e.type==="select"&&e.props["aria-label"]==="Animated eye target");
    const sourceSelector=tree=>find(tree,e=>e.type==="select"&&e.props["aria-label"]==="Animated eye source");
    const selected=harness(Promise.resolve({animate:fakeAnimate}));await tick();
    button(selected.render(),"Play Idle → Happier").props.onClick();let previous=runs.at(-1);previous.frame(.3);
    selector(selected.render()).props.onChange({target:{value:"happier"}});near(progress(selected.render()),.3);assert.equal(previous.cancelled,false);
    selector(selected.render()).props.onChange({target:{value:"sad"}});assert.ok(previous.cancelled);assert.equal(progress(selected.render()),0);
    previous.options.onUpdate();previous.complete();assert.equal(progress(selected.render()),0);
    assert.equal(selector(selected.render()).props.value,"sad");
    selector(selected.render()).props.onChange({target:{value:"shy"}});assert.equal(selector(selected.render()).props.value,"sad");
    for(const p of samples){button(selected.render(),Math.round(p*100)+"%").props.onClick();near(progress(selected.render()),p);
        for(const side of["left","right"])assert.deepEqual(visibleEye(selected.render(),side),morph(presets.idle[side],presets.sad[side],p));}
    button(selected.render(),"Reverse Sad → Idle").props.onClick();let sadRun=runs.at(-1);sadRun.frame(.4);
    near(progress(selected.render()),.4);sadRun.complete();assert.strictEqual(visibleEye(selected.render()),presets.idle.left);
    button(selected.render(),"Play Idle → Sad").props.onClick();sadRun=runs.at(-1);sadRun.frame(.5);
    slider(selected.render()).props.onChange({target:{value:".75"}});assert.ok(sadRun.cancelled);sadRun.complete();near(progress(selected.render()),.75);
    button(selected.render(),"Reset eyes to Idle").props.onClick();assert.equal(progress(selected.render()),0);
    button(selected.render(),"Play Idle → Sad").props.onClick();sadRun=runs.at(-1);sadRun.complete();assert.strictEqual(visibleEye(selected.render()),presets.sad.left);
    selector(selected.render()).props.onChange({target:{value:"happier"}});assert.equal(progress(selected.render()),0);selected.cleanup();
    let resolveTarget;const pending=harness(new Promise(resolve=>{resolveTarget=resolve;}));
    selector(pending.render()).props.onChange({target:{value:"sad"}});button(pending.render(),"100%").props.onClick();
    resolveTarget({animate:fakeAnimate});await tick();assert.ok(renderToStaticMarkup(pending.render()).includes('role="status">Sad<'));pending.cleanup();

    // Every new pair through actual handlers, both eyes, both directions, stale
    // completion after source/target changes, scrub cancellation and reset.
    const crying=harness(Promise.resolve({animate:fakeAnimate}));await tick();
    for(const source of ["idle","sad"]){
        sourceSelector(crying.render()).props.onChange({target:{value:source}});
        selector(crying.render()).props.onChange({target:{value:"cry"}});
        const title=source==="idle"?"Idle":"Sad";
        for(const p of samples){button(crying.render(),Math.round(p*100)+"%").props.onClick();
            for(const side of["left","right"])assert.deepEqual(visibleEye(crying.render(),side),morph(presets[source][side],presets.cry[side],p));}
        button(crying.render(),`Reverse Cry → ${title}`).props.onClick();let run=runs.at(-1);run.frame(.4);
        for(const side of["left","right"])assert.deepEqual(visibleEye(crying.render(),side),morph(presets[source][side],presets.cry[side],.4));
        run.complete();assert.strictEqual(visibleEye(crying.render()),presets[source].left);
        button(crying.render(),`Play ${title} → Cry`).props.onClick();run=runs.at(-1);run.frame(.2);
        slider(crying.render()).props.onChange({target:{value:".75"}});assert.ok(run.cancelled);run.frame(.9);run.complete();near(progress(crying.render()),.75);
        button(crying.render(),`Reset eyes to ${title}`).props.onClick();assert.equal(progress(crying.render()),0);
        button(crying.render(),`Play ${title} → Cry`).props.onClick();run=runs.at(-1);run.frame(.5);
        sourceSelector(crying.render()).props.onChange({target:{value:source==="idle"?"sad":"idle"}});
        assert.ok(run.cancelled);run.complete();run.frame(.8);assert.equal(progress(crying.render()),0);
    }
    sourceSelector(crying.render()).props.onChange({target:{value:"sad"}});
    for(const invalid of["happier","sad","thinking"]){selector(crying.render()).props.onChange({target:{value:invalid}});assert.equal(selector(crying.render()).props.value,"cry");}
    assert.deepEqual(react.Children.toArray(selector(crying.render()).props.children).filter(e=>react.isValidElement(e)).map(e=>e.props.value),["cry"]);
    sourceSelector(crying.render()).props.onChange({target:{value:"cry"}});assert.equal(sourceSelector(crying.render()).props.value,"sad");crying.cleanup();
    const changedCry=harness(Promise.resolve({animate:fakeAnimate}));await tick();
    selector(changedCry.render()).props.onChange({target:{value:"cry"}});
    button(changedCry.render(),"Play Idle → Cry").props.onClick();const staleCry=runs.at(-1);staleCry.frame(.4);
    selector(changedCry.render()).props.onChange({target:{value:"happier"}});assert.ok(staleCry.cancelled);
    staleCry.frame(.9);staleCry.complete();assert.equal(progress(changedCry.render()),0);
    button(changedCry.render(),"Play Idle → Happier").props.onClick();assert.equal(runs.at(-1).target.progress,0,"stale driver target detached");changedCry.cleanup();
    let resolveCry;const loadingCry=harness(new Promise(resolve=>{resolveCry=resolve;}));
    sourceSelector(loadingCry.render()).props.onChange({target:{value:"sad"}});
    resolveCry({animate:fakeAnimate});await tick();assert.ok(renderToStaticMarkup(loadingCry.render()).includes('role="status">Sad<'));loadingCry.cleanup();

    const thinking=harness(Promise.resolve({animate:fakeAnimate}));await tick();
    selector(thinking.render()).props.onChange({target:{value:"thinking"}});
    for(const p of samples){button(thinking.render(),Math.round(p*100)+"%").props.onClick();
        for(const side of["left","right"])assert.deepEqual(visibleEye(thinking.render(),side),morph(presets.idle[side],presets.thinking[side],p));}
    button(thinking.render(),"Reverse Thinking → Idle").props.onClick();const backward=runs.at(-1);backward.frame(.4);backward.complete();assert.equal(progress(thinking.render()),0);
    button(thinking.render(),"Play Idle → Thinking").props.onClick();let thinkRun=runs.at(-1);thinkRun.frame(.5);
    slider(thinking.render()).props.onChange({target:{value:".75"}});assert.ok(thinkRun.cancelled);thinkRun.frame(.9);thinkRun.complete();near(progress(thinking.render()),.75);
    button(thinking.render(),"Reset eyes to Idle").props.onClick();assert.equal(progress(thinking.render()),0);
    button(thinking.render(),"Play Idle → Thinking").props.onClick();thinkRun=runs.at(-1);thinkRun.complete();assert.strictEqual(visibleEye(thinking.render()),presets.thinking.left);
    button(thinking.render(),"Reverse Thinking → Idle").props.onClick();thinkRun=runs.at(-1);thinkRun.frame(.4);
    selector(thinking.render()).props.onChange({target:{value:"cry"}});assert.ok(thinkRun.cancelled);thinkRun.complete();thinkRun.frame(.8);assert.equal(progress(thinking.render()),0);
    selector(thinking.render()).props.onChange({target:{value:"thinking"}});button(thinking.render(),"Play Idle → Thinking").props.onClick();thinkRun=runs.at(-1);
    sourceSelector(thinking.render()).props.onChange({target:{value:"sad"}});assert.ok(thinkRun.cancelled);thinkRun.frame(.9);thinkRun.complete();assert.equal(selector(thinking.render()).props.value,"cry");assert.equal(progress(thinking.render()),0);thinking.cleanup();
    let resolveThink;const loadingThink=harness(new Promise(resolve=>{resolveThink=resolve;}));
    selector(loadingThink.render()).props.onChange({target:{value:"thinking"}});button(loadingThink.render(),"100%").props.onClick();
    resolveThink({animate:fakeAnimate});await tick();assert.ok(renderToStaticMarkup(loadingThink.render()).includes('role="status">Thinking<'));loadingThink.cleanup();

    // Actual automatic playback through the real component handlers, not fake frames/seeks.
    const live=harness(Promise.resolve({animate}));await tick();
    button(live.render(),"Play Idle → Happier").props.onClick();
    let observed=false;
    const waitUntil=async(predicate)=>{const deadline=Date.now()+3500;while(!predicate()){assert.ok(Date.now()<deadline,"automatic eye playback timed out");await new Promise(r=>setTimeout(r,20));}};
    await waitUntil(()=>{const tree=live.render(),p=progress(tree);if(p>0&&p<1){observed=true;validateEyeGeometry(visibleEye(tree));
        assert.deepEqual(visibleEye(tree),morph(presets.idle.left,presets.happier.left,p));}return p===1;});
    assert.ok(observed,"real automatic intermediate progress observed");
    button(live.render(),"Reverse Happier → Idle").props.onClick();await waitUntil(()=>progress(live.render())===0);
    button(live.render(),"Play Idle → Happier").props.onClick();await new Promise(r=>setTimeout(r,80));button(live.render(),"Reset eyes to Idle").props.onClick();
    await new Promise(r=>setTimeout(r,1100));assert.equal(progress(live.render()),0);live.cleanup();
    const sadLive=harness(Promise.resolve({animate}));await tick();
    selector(sadLive.render()).props.onChange({target:{value:"sad"}});button(sadLive.render(),"Play Idle → Sad").props.onClick();
    let sadObserved=false;
    await waitUntil(()=>{const tree=sadLive.render(),p=progress(tree);if(p>0&&p<1){sadObserved=true;
        assert.deepEqual(visibleEye(tree),morph(presets.idle.left,presets.sad.left,p));}return p===1;});
    assert.ok(sadObserved);assert.strictEqual(visibleEye(sadLive.render()),presets.sad.left);
    button(sadLive.render(),"Reverse Sad → Idle").props.onClick();await waitUntil(()=>progress(sadLive.render())===0);
    button(sadLive.render(),"Play Idle → Sad").props.onClick();await new Promise(r=>setTimeout(r,80));
    selector(sadLive.render()).props.onChange({target:{value:"happier"}});
    await new Promise(r=>setTimeout(r,1100));assert.equal(progress(sadLive.render()),0);assert.equal(selector(sadLive.render()).props.value,"happier");sadLive.cleanup();
    for(const source of ["idle","sad"]){
        const liveCry=harness(Promise.resolve({animate}));await tick();
        sourceSelector(liveCry.render()).props.onChange({target:{value:source}});
        selector(liveCry.render()).props.onChange({target:{value:"cry"}});
        const title=source==="idle"?"Idle":"Sad";let observed=false;
        button(liveCry.render(),`Play ${title} → Cry`).props.onClick();
        await waitUntil(()=>{const tree=liveCry.render(),p=progress(tree);if(p>0&&p<1){observed=true;for(const side of["left","right"])assert.deepEqual(visibleEye(tree,side),morph(presets[source][side],presets.cry[side],p));}return p===1;});
        assert.ok(observed);assert.strictEqual(visibleEye(liveCry.render()),presets.cry.left);
        button(liveCry.render(),`Reverse Cry → ${title}`).props.onClick();await waitUntil(()=>progress(liveCry.render())===0);liveCry.cleanup();
    }
    const liveThink=harness(Promise.resolve({animate}));await tick();selector(liveThink.render()).props.onChange({target:{value:"thinking"}});
    button(liveThink.render(),"Play Idle → Thinking").props.onClick();let thinkObserved=false;
    await waitUntil(()=>{const tree=liveThink.render(),p=progress(tree);if(p>0&&p<1){thinkObserved=true;
        for(const side of["left","right"])assert.deepEqual(visibleEye(tree,side),morph(presets.idle[side],presets.thinking[side],p));}return p===1;});
    assert.ok(thinkObserved);button(liveThink.render(),"Reverse Thinking → Idle").props.onClick();await waitUntil(()=>progress(liveThink.render())===0);liveThink.cleanup();
    assert.strictEqual(useFaceStore.getState(),before,"all preview interactions leave canonical store untouched");
    const dist=(await Promise.all((await readdir("dist/assets")).filter(f=>f.endsWith(".js")).map(f=>readFile("dist/assets/"+f,"utf8")))).join("");
    assert.doesNotMatch(dist,/data-eye-morph|Eye morph progress/);
    assert.match(dist,/No approved correspondence/, "production uses the guarded existing interpolation dispatcher");

    await mkdir("reports/eye-morphing",{recursive:true});
    await writeFile("reports/eye-morphing/samples.json",JSON.stringify(renders,null,2)+"\n");
    await writeFile("reports/eye-morphing/geometry-metrics.json",JSON.stringify({method:"8 tangent-matched 45-degree cubic arcs; sampled normalized radial error and conservative Euclidean radial bound",metrics},null,2)+"\n");
    const image=s=>"data:image/svg+xml;base64,"+Buffer.from(s).toString("base64");
    const grid=`<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="470"><rect width="100%" height="100%" fill="#080f1d"/>`+renders.map(e=>{
        const x=samples.indexOf(e.progress)*160,y=e.side==="left"?0:235;
        return `<g transform="translate(${x} ${y})"><text x="8" y="22" fill="white" font-size="12">${e.side} ${Math.round(e.progress*100)}%</text><image x="12" y="40" width="${e.width}" height="${e.height}" href="${image(e.svg)}"/></g>`;
    }).join("")+"</svg>";
    await writeFile("reports/eye-morphing/morph-grid.svg",grid);
    console.log("PASS: Happier endpoints/correspondence/101 samples per side/ellipse bound <0.00035; gradients/shadow/layout/reverse/rejection; actual supported source/target selectors, geometry props, play/reverse/reset/scrub/samples/switch cancellation; real automatic Anime.js playback for all five pairs; unmount/stale/early/load-error handling, canonical isolation and production guard. Static/browser visual review is separate.");
    console.log(JSON.stringify(metrics));
} finally { await server.close(); }
await import("./verify-eye-sad-morphing.mjs");
await import("./verify-eye-cry-morphing.mjs");
await import("./verify-eye-thinking-morphing.mjs");
