// Run from frontend after build. Actual geometry, SSR renderer and component handlers.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, readdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { animate } from "animejs";
import { createServer } from "vite";
const server = await createServer({server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},appType:"custom"});
try {
    const eyes = await server.ssrLoadModule("/src/geometry/eyes/index.ts");
    const { EYE_EXPRESSION_PRESETS:P } = eyes;
    const blink = await server.ssrLoadModule("/src/geometry/eyes/blink/index.ts");
    const {generateBlinkGeometry:generate} = blink;
    const renderer = await server.ssrLoadModule("/src/components/face/eyes/BlinkEye.tsx");
    const expressionRenderer = await server.ssrLoadModule("/src/components/face/eyes/ExpressionBlinkEye.tsx");
    const {default:Preview,DEFAULT_BLINK_TIMING} = await server.ssrLoadModule("/src/components/face/eyes/EyeBlinkPreview.tsx");
    const layouts = await server.ssrLoadModule("/src/config/faceLayerLayouts.ts");
    const {useFaceStore} = await server.ssrLoadModule("/src/stores/faceStore.ts");
    const react = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const jsx = await import(pathToFileURL(await realpath("node_modules/react/jsx-runtime.js")));
    const {renderToStaticMarkup:render} = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const snapshot = JSON.stringify(P), state = useFaceStore.getState();
    const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9, a+" != "+b);
    const at=(lid,t)=>[0,1].map(k=>(1-t)**3*lid.start[k]+3*(1-t)**2*t*lid.curve[0][k]+3*(1-t)*t*t*lid.curve[1][k]+t**3*lid.curve[2][k]);
    const samples=[0,.25,.5,.75,.9,1], renders=[];
    for(const side of ["left","right"]){
        const eye=P.idle[side];
        assert.strictEqual(generate(eye,0),eye);assert.strictEqual(generate(eye,-99),eye);
        assert.deepEqual(generate(eye,99),generate(eye,1));
        assert.deepEqual(generate(structuredClone(eye),.5),generate(eye,.5));
        const closed=generate(eye,1);assert.deepEqual(closed.upper,closed.lower);assert.equal(closed.interiorVisible,false);
        assert.match(closed.upperPath,/^M[^C]+C[^A-Za-z]+$/);
        let previousUpper,previousLower;
        for(let i=0;i<=100;i++){
            const p=i/100,g=generate(eye,p);assert.deepEqual(generate(eye,p),g);
            assert.equal(("kind" in g?g.source:g).side,side);
            if(i>0){
                assert.strictEqual(g.source,eye);assert.match(g.aperture,/^M[^C]+C[^L]+L[^C]+C[^Z]+Z$/);
                assert.doesNotMatch(g.aperture,/NaN|Infinity/);
                for(let j=0;j<=100;j++){
                    const t=j/100,u=at(g.upper,t),l=at(g.lower,t);
                    near(u[0],l[0]);assert.ok(u[1]<=l[1]+1e-9);
                    // Common monotone x and nonnegative gap: simple, connected aperture.
                    if(j)assert.ok(u[0]>at(g.upper,(j-1)/100)[0]);
                    near(l[1]-u[1],(179)*(1-p));
                    if(previousUpper){assert.ok(u[1]>=at(previousUpper,t)[1]-1e-9);assert.ok(l[1]<=at(previousLower,t)[1]+1e-9);}
                }
                previousUpper=g.upper;previousLower=g.lower;
                const reverse=generate(eye,1-(100-i)/100);
                near(at(reverse.upper,.5)[1],at(g.upper,.5)[1]);
                assert.equal(g.interiorVisible,p<1);
            }
            if(samples.includes(p)){
                const svg=render(react.createElement(renderer.default,{geometry:g}));
                assert.ok(svg.includes('data-blink-side="'+side+'"'));
                assert.ok(svg.includes('clipPathUnits="userSpaceOnUse"'));
                if(p>0)assert.match(svg,/data-blink-interior=""[^>]*clip-path="url[(]#/);
                if(p===1){assert.match(svg,/data-blink-interior="" visibility="hidden"/);assert.match(svg,/data-blink-lower="" d=""/);}
                renders.push({side,progress:p,width:eye.width,height:eye.height,svg});
            }
        }
        assert.ok(at(closed.upper,.5)[1]-(eye.body.center[1]-eye.body.radius[1]) >
            (eye.body.center[1]+eye.body.radius[1])-at(closed.lower,.5)[1],"upper travels farther than lower");
        for(const p of [NaN,Infinity,-Infinity,".5",undefined,null])assert.throws(()=>generate(eye,p),/progress/);
        for(const bad of [null,{}, {...eye,side:"mirror"},{...eye,width:NaN},{...eye,width:130},
            {...eye,body:{center:[0,0],radius:[0,1]}},{...eye,outline:{...eye.outline,curves:[]}},
            {...eye,highlights:{...eye.highlights,opacity:.5}},P.happier[side],P.sad[side],P.cry[side],P.thinking[side]])
            for(const p of [0,.5,1])assert.throws(()=>generate(bad,p),RangeError);
    }
    assert.equal(JSON.stringify(P),snapshot);
    const many=render(react.createElement(react.Fragment,null,...renders.map((r,i)=>react.createElement(renderer.default,{key:i,geometry:generate(P.idle[r.side],r.progress)}))));
    const ids=[...many.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
    for(const m of many.matchAll(/url[(]#([^)]*)[)]/g))assert.ok(ids.includes(m[1]));
    const html=render(react.createElement(Preview));assert.ok(html.includes("Play Blink"));assert.ok(html.includes("Blink closure progress"));
    assert.deepEqual(DEFAULT_BLINK_TIMING,{closing:100,hold:40,opening:150});
    for(const timing of [{closing:-1,hold:40,opening:150},{closing:100,hold:NaN,opening:150},{}])
        assert.throws(()=>render(react.createElement(Preview,{timing})),RangeError);

    // Tiny DOM surface: exercise the actual attribute writer and handlers, without claiming browser QA.
    function fakeSvg(side){
        const attrs=new Map([["data-blink-clip","test-"+side],["data-blink-side",side]]), nodes=new Map();
        for(const n of ["aperture","interior","upper","lower"])nodes.set("[data-blink-"+n+"]",{attrs:new Map(),setAttribute(k,v){this.attrs.set(k,v);}});
        return {attrs,nodes,getAttribute:k=>attrs.get(k),querySelector:k=>nodes.get(k)};
    }
    const source=await readFile("src/components/face/eyes/EyeBlinkPreview.tsx","utf8");
    function harness(promise,timing){
        let states=[],refs=[],si=0,ri=0,effect,updates=0;
        const hooks={useState(initial){const i=si++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=v;updates++;}];},
            useRef(initial){return refs[ri++]??=( {current:initial} );},useEffect(fn){effect=fn;}};
        const code=ts.transpileModule(source.replace('import("animejs")','require("driverPromise")'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
        const imports={react:hooks,"react/jsx-runtime":jsx,driverPromise:promise,"../../../geometry/eyes":eyes,
            "../../../geometry/eyes/blink":blink,"../../../config/faceLayerLayouts":layouts,"./BlinkEye":renderer,"./ExpressionBlinkEye":expressionRenderer};
        const module={exports:{}};compileFunction(code,["require","module","exports"])(n=>{assert.ok(n in imports,n);return imports[n];},module,module.exports);
        const tree=()=>{si=0;ri=0;return module.exports.default(timing?{timing}:{});};tree();
        const svgs=[fakeSvg("left"),fakeSvg("right")];refs[0].current={querySelectorAll:()=>svgs};refs[1].current={value:"0"};refs[2].current={textContent:"0%"};
        const cleanup=effect();
        return {tree,cleanup,remount:()=>effect(),svgs,p:()=>Number(refs[1].current.value),updates:()=>updates,output:()=>refs[2].current.textContent};
    }
    const find=(tree,fn)=>{if(!react.isValidElement(tree))return;if(fn(tree))return tree;for(const c of react.Children.toArray(tree.props.children)){const result=find(c,fn);if(result)return result;}};
    const button=(h,text)=>find(h.tree(),e=>e.type==="button"&&react.Children.toArray(e.props.children).join("")===text);
    const seek=(h,p)=>find(h.tree(),e=>e.type==="input").props.onChange({target:{value:String(p)}});
    const tick=()=>new Promise(r=>setImmediate(r));
    const runs=[];
    const fake=(target,options)=>{const run={target,options,cancelled:false,play(){},cancel(){this.cancelled=true;},frame(p){target.progress=p;options.onUpdate();},complete(){options.onComplete();}};runs.push(run);return run;};
    const h=harness(Promise.resolve({animate:fake}));assert.equal(button(h,"Play Blink").props.disabled,true);await tick();
    for(const p of samples){button(h,Math.round(p*100)+"%").props.onClick();near(h.p(),p);assert.equal(h.output(),Math.round(p*100)+"%");
        for(const svg of h.svgs){const g=generate(P.idle[svg.getAttribute("data-blink-side")],p);
            assert.equal(svg.nodes.get("[data-blink-upper]").attrs.get("d"),"kind" in g?g.upperPath:"");}}
    button(h,"Play Blink").props.onClick();let closing=runs.at(-1);near(h.p(),0);assert.equal(closing.options.duration,100);assert.equal(closing.options.delay,0);
    const updates=h.updates();closing.frame(.5);assert.equal(h.updates(),updates,"no per-frame React updates");near(h.p(),.5);
    closing.complete();const opening=runs.at(-1);near(h.p(),1);assert.equal(opening.options.delay,40);assert.equal(opening.options.duration,150);
    opening.frame(.75);near(h.p(),.75);opening.complete();near(h.p(),0);
    for(const cancelAction of [()=>seek(h,.25),()=>button(h,"Reset").props.onClick(),()=>button(h,"Play Blink").props.onClick()]){
        button(h,"Play Blink").props.onClick();const stale=runs.at(-1);stale.frame(.4);cancelAction();const count=runs.length,p=h.p();
        assert.ok(stale.cancelled);stale.frame(.99);stale.complete();near(h.p(),p);assert.equal(runs.length,count);
    }
    button(h,"Play Blink").props.onClick();runs.at(-1).complete();const hold=runs.at(-1);h.cleanup();assert.ok(hold.cancelled);hold.frame(.5);hold.complete();near(h.p(),1);
    const strict=harness(Promise.resolve({animate:fake}));strict.cleanup();const cleanupAgain=strict.remount();await tick();
    button(strict,"Play Blink").props.onClick();assert.equal(runs.at(-1).options.duration,100);cleanupAgain();
    let resolve;const pending=harness(new Promise(r=>{resolve=r;}));pending.cleanup();resolve({animate:fake});await tick();assert.equal(button(pending,"Play Blink").props.disabled,true);
    const failed=harness(Promise.reject(Error("expected")));await tick();assert.ok(render(failed.tree()).includes("Animation failed to load"));failed.cleanup();
    const custom=harness(Promise.resolve({animate:fake}),{closing:80,hold:20,opening:120});await tick();button(custom,"Play Blink").props.onClick();assert.equal(runs.at(-1).options.duration,80);runs.at(-1).complete();assert.equal(runs.at(-1).options.delay,20);assert.equal(runs.at(-1).options.duration,120);custom.cleanup();
    // Installed Anime.js automatic playback through actual component handlers.
    const live=harness(Promise.resolve({animate}));await tick();button(live,"Play Blink").props.onClick();
    let closingSeen=false,openingSeen=false,last=0;const deadline=Date.now()+2000;
    while(true){await new Promise(r=>setTimeout(r,5));const p=live.p();if(p>0&&p<1){if(p>=last)closingSeen=true;else openingSeen=true;}last=p;
        if(render(live.tree()).includes('role="status">Open<'))break;assert.ok(Date.now()<deadline,"automatic blink timed out");}
    assert.ok(closingSeen&&openingSeen);near(live.p(),0);live.cleanup();
    assert.strictEqual(useFaceStore.getState(),state);
    const dist=(await Promise.all((await readdir("dist/assets")).filter(f=>f.endsWith(".js")).map(f=>readFile("dist/assets/"+f,"utf8")))).join("");
    assert.doesNotMatch(dist,/data-blink-|Blink closure progress|Blink Phase 1 requires|Idle procedural eye blinking/);
    const inventory=JSON.parse((await readFile("reports/eye-svg-inventory.json","utf8")).replace(/^﻿/,""));
    for(const item of inventory)assert.equal(createHash("sha256").update(await readFile(item.file)).digest("hex"),item.sha256);
    await mkdir("reports/eye-blinking",{recursive:true});await writeFile("reports/eye-blinking/samples.json",JSON.stringify(renders,null,2)+String.fromCharCode(10));
    const image=s=>"data:image/svg+xml;base64,"+Buffer.from(s).toString("base64");
    const grid='<svg xmlns="http://www.w3.org/2000/svg" width="960" height="470"><rect width="100%" height="100%" fill="#d5deeb"/>'+renders.map(s=>{
        const x=samples.indexOf(s.progress)*160,y=s.side==="left"?0:235;
        return '<g transform="translate('+x+' '+y+')"><text x="8" y="22" fill="black">'+s.side+' '+Math.round(s.progress*100)+'%</text><image x="8" y="40" width="129" height="171" href="'+image(s.svg)+'"/></g>';
    }).join("")+"</svg>";await writeFile("reports/eye-blinking/blink-grid.svg",grid);
    console.log("PASS: exact Idle identity endpoint, 101 samples/side, monotone noncrossing lids, closure, clipped unchanged source details, deterministic/immutable/rejected inputs, finite clamping, reverse opening, unique resources; actual preview controls/timing, real Anime.js closing/opening, cancellation/hold/unmount/StrictMode/import guards, no frame React writes, store isolation, asset hashes and production exclusion. Run existing geometry/morph regression suites separately.");
} finally { await server.close(); }
