// Phase 2: actual geometry/renderer/component handlers. Run from frontend after build.
import assert from "node:assert/strict";
import {readFile,writeFile,mkdir,readdir,realpath} from "node:fs/promises";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {compileFunction} from "node:vm";
import ts from "typescript";
import {animate} from "animejs";
import {createServer} from "vite";
import {assertPhaseIntegrity} from "./verify-phase-integrity.mjs";
const folder="reports/eye-expression-blinking";
const server=await createServer({server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},appType:"custom"});
try {
    const eyes=await server.ssrLoadModule("/src/geometry/eyes/index.ts");
    const {EYE_EXPRESSION_PRESETS:P,EYE_EXPRESSIONS:expressions}=eyes;
    const blink=await server.ssrLoadModule("/src/geometry/eyes/blink/index.ts");
    const {generateBlinkGeometry:idle,generateExpressionBlinkGeometry:generate,prepareExpressionBlink:prepare}=blink;
    const renderer=await server.ssrLoadModule("/src/components/face/eyes/BlinkEye.tsx");
    const expressionRenderer=await server.ssrLoadModule("/src/components/face/eyes/ExpressionBlinkEye.tsx");
    const {default:Preview}=await server.ssrLoadModule("/src/components/face/eyes/EyeBlinkPreview.tsx");
    const layouts=await server.ssrLoadModule("/src/config/faceLayerLayouts.ts");
    const {FACE_LAYER_LAYOUTS:L}=layouts;
    const {FACE_LAYER_COMPOSITIONS:C,FACE_LAYER_ASSETS:A}=await server.ssrLoadModule("/src/config/faceLayerAssets.ts");
    const {useFaceStore}=await server.ssrLoadModule("/src/stores/faceStore.ts");
    const react=await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const jsx=await import(pathToFileURL(await realpath("node_modules/react/jsx-runtime.js")));
    const {renderToStaticMarkup:render}=await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const svg=(expression,geometry)=>render(react.createElement(expressionRenderer.default,{expression,geometry}));
    const interiorMarkup = text => { const match=text.match(/<g data-blink-interior[^>]*>([\s\S]*)<\/g><g clip-path=/); assert.ok(match,"source interior group"); return match[1]; };
    const hash=s=>createHash("sha256").update(s).digest("hex");
    const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,a+" != "+b);
    const at=(lid,t)=>[0,1].map(k=>(1-t)**3*lid.start[k]+3*(1-t)**2*t*lid.curve[0][k]+3*(1-t)*t*t*lid.curve[1][k]+t**3*lid.curve[2][k]);
    const isBlink=g=>g.kind==="idle-blink"||g.kind==="expression-blink";
    const sourceOf=g=>isBlink(g)?g.source:g;
    const state=useFaceStore.getState(), snapshot=JSON.stringify([P,L,C,A]);
    const baseline=JSON.parse(await readFile(folder+"/idle-phase1-baseline.json","utf8"));
    assert.equal(hash(await readFile(folder+"/idle-phase1-baseline.json")),"9f7a18a127a166aa26c869896c51ee3738b7838207a031091d9cebd36cbbbc82","immutable pre-edit baseline file");
    assert.equal(baseline.capturedBeforePhase2,true);
    for(const [path,expected] of Object.entries(baseline.protectedFiles))await assertPhaseIntegrity(path,expected);
    for(const side of ["left","right"])for(const row of baseline.sides[side]) {
        const g=idle(P.idle[side],row.progress);
        assert.equal(hash(JSON.stringify(g)),row.geometry,"Phase 1 geometry baseline");
        assert.equal(hash(render(react.createElement(renderer.default,{geometry:g}))),row.svg,"Phase 1 SVG baseline");
        assert.deepEqual(generate("idle",side,row.progress),g);
        assert.equal(hash(svg("idle",generate("idle",side,row.progress))),row.svg,"compatible extension keeps exact Phase 1 SVG");
    }
    assert.throws(()=>svg("sad",P.idle.left),RangeError);
    assert.throws(()=>svg("idle",P.happier.left),RangeError);
    assert.throws(()=>svg("sad",{...P.sad.left,width:1}),RangeError);
    assert.deepEqual(expressions,["idle","happy","happier","sad","cry","shock","thinking"]);
    const samples=[0,.25,.5,.75,.9,1],renders=[],metrics=[];
    const nums=d=>(d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[]).map(Number);
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const simple=points=>{for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){
        if(i===0&&j===points.length-1)continue;
        const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
        assert.ok(!(cross(a,b,c)*cross(a,b,d)<-1e-9 && cross(c,d,a)*cross(c,d,b)<-1e-9),"sampled aperture self-intersection");
    }};
    const expectedLayouts={idle:[[115,154,129,171],[556,154,129,171]],happy:[[115,154,129,171],[556,154,129,171]],
        shock:[[115,154,129,171],[556,154,129,171]],happier:[[104,133,123,139],[573,133,123,139]],
        sad:[[104,148,142,156],[554.25,148,142,156]],cry:[[104,148,142,145],[554.25,148,142,183]],
        thinking:[[102.5,167.5,142,145],[560.25,154,129,171]]};
    for(const expression of expressions)for(const [sideIndex,side] of ["left","right"].entries()) {
        const eye=P[expression][side], layout=L[expression][side+"Eye"];
        assert.deepEqual([layout.x,layout.y,layout.width,layout.height],expectedLayouts[expression][sideIndex]);
        assert.equal(layout.width,eye.width);assert.equal(layout.height,eye.height);
        assert.strictEqual(generate(expression,side,0),eye);assert.strictEqual(generate(expression,side,-1),eye);
        assert.deepEqual(generate(expression,side,2),generate(expression,side,1));
        assert.deepEqual(generate(expression,side,.5,structuredClone(eye)),generate(expression,side,.5));
        const reversed=Object.fromEntries(Object.entries(eye).reverse());assert.deepEqual(generate(expression,side,.5,reversed),generate(expression,side,.5));
        const shared=["idle","happy","shock"].includes(expression), cfg=shared?null:prepare(expression,side);
        if(cfg){assert.ok(Object.isFrozen(cfg.closed.curve));assert.strictEqual(prepare(expression,side),cfg);}
        const openMarkup=interiorMarkup(svg(expression,eye));
        const closed=generate(expression,side,1);
        assert.deepEqual(closed.upper,closed.lower);assert.equal(closed.interiorVisible,false);
        let previous=null,largestGap=0;
        for(let i=0;i<=100;i++) {
            const p=i/100,g=generate(expression,side,p);
            assert.deepEqual(generate(expression,side,p),g);assert.strictEqual(sourceOf(g),eye);
            if(shared)assert.deepEqual(g,idle(P.idle[side],p),"confirmed Idle family motion");
            if(p>0) {
                assert.match(g.aperture,/^M[^C]+C[^L]+L[^C]+C[^Z]+Z$/);
                assert.ok(nums(g.aperture).every(Number.isFinite));assert.equal(g.interiorVisible,p<1);
                const points=[];
                for(let j=0;j<=100;j++) {
                    const t=j/100,u=at(g.upper,t),l=at(g.lower,t);near(u[0],l[0]);
                    assert.ok(l[1]>=u[1]-1e-9);largestGap=Math.max(largestGap,l[1]-u[1]);
                    if(j)assert.ok(u[0]>at(g.upper,(j-1)/100)[0]);
                    if(previous){assert.ok(u[1]>=at(previous.upper,t)[1]-1e-9);assert.ok(l[1]<=at(previous.lower,t)[1]+1e-9);}
                    if(j%4===0)points.push(u);
                }
                if(p<1)simple([...points,...Array.from({length:26},(_,j)=>at(g.lower,1-j/25))]);
                const reverse=generate(expression,side,1-(100-i)/100);
                for(const lid of ["upper","lower"])for(const t of [0,.13,.5,.91,1])at(g[lid],t).forEach((v,k)=>near(v,at(reverse[lid],t)[k]));
                previous=g;
                if(!shared)assert.equal(g.expression,expression);
            }
            if(samples.includes(p)) {
                const output=svg(expression,g);
                assert.equal(interiorMarkup(output),openMarkup,"all source paint, masks, gradients, filters and details stay identical through blinking");
                if(expression==="cry")assert.equal((output.match(/fill="#76C5FD"/g)||[]).length,1,"one retained water path");
                if(expression==="cry" && side==="right")assert.equal((output.match(/stdDeviation="15"/g)||[]).length,1,"one unchanged right-detail blur");
                const ids=[...output.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
                for(const m of output.matchAll(/(?:url\(#([^)]*)\)|xlink:href="#([^"]+)")/g))assert.ok(ids.includes(m[1]??m[2]));
                if(p===1){assert.match(output,/data-blink-interior="" visibility="hidden"/);assert.match(output,/data-blink-lower="" d=""/);}
                if(p>0)assert.match(output,/data-blink-interior=""[^>]*clip-path="url\(#/);
                // Source data, including all water/mask/filter primitives, is retained verbatim at every sample.
                assert.strictEqual(sourceOf(g),eye);
                const asset=A[C[expression][side+"Eye"]];
                renders.push({expression,side,progress:p,width:eye.width,height:eye.height,layout,
                    originalFile:"public"+asset.src,upper:isBlink(g)?g.upper:null,lower:isBlink(g)?g.lower:null,svg:output});
            }
        }
        metrics.push({expression,side,samples:101,family:cfg?.family??"idle",landmarks:cfg?.landmarks??null,closed:closed.upper,largestGap});
        for(const bad of [NaN,Infinity,-Infinity,".5",null,undefined])assert.throws(()=>generate(expression,side,bad),/progress/);
        for(const bad of [null,{}, {...eye,width:eye.width+1},{...eye,side:side==="left"?"right":"left"},
            {...eye,height:NaN},"kind" in eye?{...eye,layers:eye.layers.slice(0,-1)}:{...eye,strokeWidth:0}])
            for(const p of [0,.5,1])assert.throws(()=>generate(expression,side,p,bad),RangeError);
    }
    for(const expression of ["shy","happier-transition","toString","",null,undefined])assert.throws(()=>generate(expression,"left",.5),RangeError);
    for(const side of ["mirror",null,undefined])assert.throws(()=>generate("idle",side,.5),RangeError);
    assert.throws(()=>prepare("idle","left"),RangeError);assert.throws(()=>prepare("sad","mirror"),RangeError);
    const happier=prepare("happier","left"),sadLeft=prepare("sad","left"),sadRight=prepare("sad","right");
    assert.equal(happier.family,"happier-arch");near(happier.landmarks.lower[1],136.41675);
    assert.ok(at(happier.closed,.5)[1]<happier.closed.start[1],"Happier's own upward arch");
    assert.ok(sadLeft.closed.start[1]>sadLeft.closed.curve[2][1]);assert.ok(sadRight.closed.start[1]<sadRight.closed.curve[2][1]);
    assert.notDeepEqual(sadLeft.closed,sadRight.closed);assert.notStrictEqual(sadLeft,sadRight);
    assert.notDeepEqual(prepare("thinking","left").closed,prepare("thinking","right").closed);
    assert.deepEqual(prepare("thinking","right").closed,idle(P.idle.right,1).upper,"proven right ellipse motion, independent source highlights");
    assert.notDeepEqual(P.thinking.right,P.idle.right);
    for(const side of ["left","right"]) {
        for(const expression of ["sad","cry","thinking"])if(!(expression==="thinking"&&side==="right"))near(prepare(expression,side).landmarks.lower[1],138.5940890161);
        const sad=P.sad[side],cry=P.cry[side];
        assert.equal(sad.layers[5].tag,"use");assert.equal(sad.layers[6].tag,"mask");assert.equal(sad.layers[8].tag,"ellipse");
        assert.equal(cry.layers[4].attributes.fill,"#76C5FD");assert.equal(cry.layers[4].commands.filter(c=>c[0]==="C").length,16);
        for(const p of [.25,.5,.75,.9,1]) {
            assert.strictEqual(generate("sad",side,p).source.layers[8],sad.layers[8]);
            assert.strictEqual(generate("cry",side,p).source.layers[4],cry.layers[4]);
            if(side==="right")assert.strictEqual(generate("cry",side,p).source.layers[6],cry.layers[6]);
        }
    }
    const all=render(react.createElement(react.Fragment,null,...renders.map((s,i)=>react.createElement(expressionRenderer.default,{key:i,expression:s.expression,geometry:generate(s.expression,s.side,s.progress)}))));
    const allIds=[...all.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(allIds.length,new Set(allIds).size);
    for(const m of all.matchAll(/(?:url\(#([^)]*)\)|xlink:href="#([^"]+)")/g))assert.ok(allIds.includes(m[1]??m[2]));

    // Actual preview hooks, handlers and DOM writer, using the same tiny surface as Phase 1.
    function fakeSvg(side) {
        const attrs=new Map([["data-blink-clip","test-"+side],["data-blink-side",side]]),nodes=new Map();
        for(const n of ["aperture","interior","upper","lower"])nodes.set("[data-blink-"+n+"]",{attrs:new Map(),setAttribute(k,v){this.attrs.set(k,v);}});
        return {getAttribute:k=>attrs.get(k),querySelector:k=>nodes.get(k),nodes};
    }
    const original=await readFile("src/components/face/eyes/EyeBlinkPreview.tsx","utf8");
    function harness(promise) {
        let states=[],refs=[],si=0,ri=0,effect,updates=0;
        const hooks={useState(initial){const i=si++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=v;updates++;}];},
            useRef(initial){return refs[ri++]??={current:initial};},useEffect(fn){effect=fn;}};
        const code=ts.transpileModule(original.replace('import("animejs")','require("driverPromise")'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
        const imports={react:hooks,"react/jsx-runtime":jsx,driverPromise:promise,"../../../geometry/eyes":eyes,
            "../../../geometry/eyes/blink":blink,"../../../config/faceLayerLayouts":layouts,"./ExpressionBlinkEye":expressionRenderer};
        const module={exports:{}};compileFunction(code,["require","module","exports"])(n=>{assert.ok(n in imports,n);return imports[n];},module,module.exports);
        const tree=()=>{si=0;ri=0;return module.exports.default({});};tree();
        const svgs=[fakeSvg("left"),fakeSvg("right")];refs[0].current={querySelectorAll:()=>svgs};refs[1].current={value:"0"};refs[2].current={textContent:"0%"};
        const cleanup=effect();return {tree,cleanup,remount:()=>effect(),svgs,p:()=>Number(refs[1].current.value),updates:()=>updates};
    }
    const find=(tree,fn)=>{if(!react.isValidElement(tree))return;if(fn(tree))return tree;for(const c of react.Children.toArray(tree.props.children)){const r=find(c,fn);if(r)return r;}};
    const button=(h,label)=>find(h.tree(),e=>e.type==="button"&&react.Children.toArray(e.props.children).join("")===label);
    const selector=h=>find(h.tree(),e=>e.type==="select"&&e.props["aria-label"]==="Blink expression");
    const select=(h,expression)=>selector(h).props.onChange({target:{value:expression}});
    const tick=()=>new Promise(r=>setImmediate(r));
    const checkDom=(h,expression,p)=> {
        near(h.p(),p);
        for(const dom of h.svgs) {
            const side=dom.getAttribute("data-blink-side"),g=generate(expression,side,p);
            assert.equal(dom.nodes.get("[data-blink-upper]").attrs.get("d"),isBlink(g)?g.upperPath:"");
            assert.equal(dom.nodes.get("[data-blink-interior]").attrs.get("visibility"),p===1?"hidden":"visible");
        }
    };
    const runs=[],fake=(target,options)=>{const run={target,options,cancelled:false,play(){},cancel(){this.cancelled=true;},frame(p){target.progress=p;options.onUpdate();},complete(){options.onComplete();}};runs.push(run);return run;};
    const h=harness(Promise.resolve({animate:fake}));await tick();
    assert.deepEqual(react.Children.toArray(selector(h).props.children).map(e=>e.props.value),expressions);
    for(const expression of expressions) {
        select(h,expression);assert.equal(selector(h).props.value,expression);near(h.p(),0);
        for(const side of ["left","right"]) {
            const e=find(h.tree(),e=>e.type===expressionRenderer.default&&e.props.geometry.side===side);
            assert.strictEqual(e.props.geometry,P[expression][side]);assert.equal(e.props.expression,expression);
            const wrapper=find(h.tree(),e=>e.props.className==="face-layer procedural-eye"&&e.props.style.left===L[expression][side+"Eye"].x/800*100+"%");
            assert.ok(wrapper);assert.equal(wrapper.props.style.height,L[expression][side+"Eye"].height/480*100+"%");
        }
        for(const p of samples){button(h,Math.round(p*100)+"%").props.onClick();checkDom(h,expression,p);}
        button(h,"Play Blink").props.onClick();const closing=runs.at(-1),updates=h.updates();
        assert.equal(closing.options.duration,100);closing.frame(.5);assert.equal(h.updates(),updates);checkDom(h,expression,.5);
        select(h,expression);assert.equal(closing.cancelled,false,"reselection preserves playback");
        closing.complete();const opening=runs.at(-1);assert.equal(opening.options.delay,40);assert.equal(opening.options.duration,150);
        opening.frame(.75);checkDom(h,expression,.75);opening.complete();checkDom(h,expression,0);
        button(h,"Play Blink").props.onClick();const scrubbed=runs.at(-1);scrubbed.frame(.4);
        find(h.tree(),e=>e.type==="input").props.onChange({target:{value:".375"}});
        assert.ok(scrubbed.cancelled);scrubbed.frame(.9);scrubbed.complete();checkDom(h,expression,.375);
        button(h,"Reset").props.onClick();checkDom(h,expression,0);
        button(h,"Play Blink").props.onClick();const stale=runs.at(-1);stale.frame(.4);
        const next=expressions[(expressions.indexOf(expression)+1)%expressions.length];select(h,next);
        assert.ok(stale.cancelled);near(h.p(),0);const n=runs.length;stale.frame(.99);stale.complete();assert.equal(runs.length,n);near(h.p(),0);
        assert.strictEqual(find(h.tree(),e=>e.type===expressionRenderer.default&&e.props.geometry.side==="left").props.geometry,P[next].left);
        button(h,"Reset").props.onClick();checkDom(h,next,0);
    }
    const selected=selector(h).props.value;select(h,"shy");assert.equal(selector(h).props.value,selected);
    button(h,"Play Blink").props.onClick();runs.at(-1).complete();const hold=runs.at(-1);select(h,"cry");assert.ok(hold.cancelled);hold.frame(.5);hold.complete();near(h.p(),0);h.cleanup();
    let resolve;const pending=harness(new Promise(r=>{resolve=r;}));select(pending,"thinking");button(pending,"100%").props.onClick();resolve({animate:fake});await tick();
    assert.equal(selector(pending).props.value,"thinking");near(pending.p(),1);assert.ok(render(pending.tree()).includes('role="status">Closed<'));pending.cleanup();
    const strict=harness(Promise.resolve({animate:fake}));strict.cleanup();const cleanup=strict.remount();await tick();select(strict,"sad");button(strict,"Play Blink").props.onClick();const unmounted=runs.at(-1);cleanup();assert.ok(unmounted.cancelled);unmounted.frame(.7);unmounted.complete();near(strict.p(),0);
    for(const expression of expressions) {
        const live=harness(Promise.resolve({animate}));await tick();select(live,expression);button(live,"Play Blink").props.onClick();
        let up=false,down=false,last=0;const deadline=Date.now()+2000;
        while(true){await new Promise(r=>setTimeout(r,5));const p=live.p();if(p>0&&p<1){if(p>=last)up=true;else down=true;checkDom(live,expression,p);}last=p;
            if(render(live.tree()).includes('role="status">Open<'))break;assert.ok(Date.now()<deadline,"automatic expression blink timeout");}
        assert.ok(up&&down);checkDom(live,expression,0);live.cleanup();
    }
    const switched=harness(Promise.resolve({animate}));await tick();select(switched,"cry");button(switched,"Play Blink").props.onClick();
    await new Promise(r=>setTimeout(r,35));select(switched,"thinking");await new Promise(r=>setTimeout(r,350));near(switched.p(),0);assert.equal(selector(switched).props.value,"thinking");switched.cleanup();
    assert.strictEqual(useFaceStore.getState(),state);assert.equal(JSON.stringify([P,L,C,A]),snapshot);
    const dist=(await Promise.all((await readdir("dist/assets")).filter(f=>f.endsWith(".js")).map(f=>readFile("dist/assets/"+f,"utf8")))).join("");
    assert.doesNotMatch(dist,/data-blink-|expression-blink-|Blink expression:|No layered blink configuration|Shared blink artwork changed/);
    await mkdir(folder,{recursive:true});await writeFile(folder+"/samples.json",JSON.stringify(renders,null,2)+"\n");
    await writeFile(folder+"/geometry-metrics.json",JSON.stringify(metrics,null,2)+"\n");
    const image=s=>"data:image/svg+xml;base64,"+Buffer.from(s).toString("base64");
    for(const expression of expressions) {
        const rows=renders.filter(s=>s.expression===expression);
        const grid='<svg xmlns="http://www.w3.org/2000/svg" width="960" height="470"><rect width="100%" height="100%" fill="#d5deeb"/>'+rows.map(s=>{
            const x=samples.indexOf(s.progress)*160,y=s.side==="left"?0:235;
            return '<g transform="translate('+x+' '+y+')"><text x="8" y="22" fill="black">'+expression+' '+s.side+' '+Math.round(s.progress*100)+'%</text><image x="8" y="40" width="'+s.width+'" height="'+s.height+'" href="'+image(s.svg)+'"/></g>';
        }).join("")+"</svg>";
        await mkdir(folder+"/"+expression,{recursive:true});await writeFile(folder+"/"+expression+"/blink-grid.svg",grid);
        const layoutGrid='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="540"><rect width="100%" height="100%" fill="#d5deeb"/>'+samples.map((p,i)=>{
            const content=rows.filter(s=>s.progress===p).map(s=>'<image x="'+s.layout.x+'" y="'+s.layout.y+'" width="'+s.layout.width+'" height="'+s.layout.height+'" href="'+image(s.svg)+'"/>').join("");
            return '<g transform="translate('+(i%3*400)+' '+(Math.floor(i/3)*270)+')"><text x="12" y="24">'+expression+' '+Math.round(p*100)+'%</text><svg y="30" width="400" height="240" viewBox="0 0 800 480">'+content+'</svg></g>';
        }).join("")+"</svg>";
        await writeFile(folder+"/"+expression+"/layout-grid.svg",layoutGrid);
    }
    console.log("PASS: seven expressions / both sides / 1,414 dense geometry samples; exact endpoints, native landmarks, distinct slope/arch/ellipse closures, monotone simple apertures, source detail/water/mask/filter preservation, layouts, unique refs, validation/immutability; 202 unchanged Phase 1 geometry and SVG hashes plus 63 protected files; actual handlers, all-expression real Anime.js playback, switching/hold/stale/StrictMode/async cancellation and production exclusion. Raster QA runs separately.");
} finally {await server.close();}
