// Source-faithful Idle/Sad correspondence, masks/details, and protected regressions.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import { assertPhaseIntegrity } from "./verify-phase-integrity.mjs";
const server=await createServer({server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},appType:"custom"});
try{
    const {EYE_EXPRESSION_PRESETS:presets,HAPPIER_TRANSITION_PREVIEW,interpolateEyeGeometry:morph,
        interpolateEyeLayout:layout,prepareIdleSadEye:prepare,validateEyeGeometry,generateEyeLayers}=await server.ssrLoadModule("/src/geometry/eyes/index.ts");
    const {FACE_LAYER_LAYOUTS:positions}=await server.ssrLoadModule("/src/config/faceLayerLayouts.ts");
    const {default:ProceduralEye}=await server.ssrLoadModule("/src/components/face/eyes/ProceduralEye.tsx");
    const react=await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const {renderToStaticMarkup}=await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const render=g=>renderToStaticMarkup(react.createElement(ProceduralEye,{geometry:g}));
    const hash=s=>createHash("sha256").update(s).digest("hex");
    const baseline=JSON.parse(await readFile("reports/eye-sad-morphing/happier-baseline.json","utf8"));
    const protectedFiles=JSON.parse(await readFile("reports/eye-sad-morphing/protected-baseline.json","utf8"));
    for(const [file,expected]of Object.entries(protectedFiles))await assertPhaseIntegrity(file,expected);
    const near=(a,b,eps=2e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
    const nearPoint=(a,b)=>a.forEach((v,i)=>near(v,b[i]));
    const deepNear=(a,b)=>{
        if(typeof a==="number"){near(a,b);return;}
        if(!a||typeof a!=="object"){assert.equal(a,b);return;}
        assert.deepEqual(Object.keys(a),Object.keys(b));for(const key of Object.keys(a))deepNear(a[key],b[key]);
    };
    const evaluate=(p,[a,b,q],t)=>[0,1].map(k=>(1-t)**3*p[k]+3*(1-t)**2*t*a[k]+3*(1-t)*t*t*b[k]+t**3*q[k]);
    const vertex=(c,i)=>i===0?c.start:c.curves[i-1][2];
    const polygon=(c,steps=16)=>c.curves.flatMap((curve,i)=>Array.from({length:steps},(_,j)=>evaluate(vertex(c,i),curve,j/steps)));
    const area=c=>{const p=polygon(c);return p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;};
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const simple=c=>{const p=polygon(c);for(let i=0;i<p.length;i++)for(let j=i+2;j<p.length;j++){
        if(i===0&&j===p.length-1)continue;
        const a=p[i],b=p[(i+1)%p.length],c=p[j],d=p[(j+1)%p.length];
        assert.ok(!(cross(a,b,c)*cross(a,b,d)<-1e-9&&cross(c,d,a)*cross(c,d,b)<-1e-9),"sampled Sad contour self-intersection");
    }};
    const fromCommands=input=>({start:input[0].slice(1),curves:input.slice(1,-1).map(c=>[c.slice(1,3),c.slice(3,5),c.slice(5,7)])});
    const renders=[],metrics=[],samples=[0,.1,.25,.5,.75,.9,1],snapshot=JSON.stringify([presets,positions]);
    assert.notStrictEqual(prepare("left"),prepare("right"));
    for(const side of["left","right"]){
        const a=presets.idle[side],b=presets.sad[side],m=prepare(side);
        assert.strictEqual(morph(a,b,0),a);assert.strictEqual(morph(a,b,1),b);
        assert.strictEqual(morph(a,b,-1),a);assert.strictEqual(morph(a,b,2),b);
        assert.strictEqual(morph(b,a,0),b);assert.strictEqual(morph(b,a,1),a);
        assert.equal(m.pairs.body.reverse,side==="right");assert.equal(m.pairs.outline.reverse,side==="right");
        assert.equal(m.pairs.supplement.reverse,side==="left");
        assert.deepEqual(m.pairs.body.targetAnchors.slice(0,2),side==="left"?[1.5,2.5]:[1.5,.5]);
        near(m.targetAttachment[0],b.layers[7].commands[1][5]);
        assert.ok(m.sourceAttachment[1]>150&&m.sourceAttachment[1]<168,"attachment lies on lower Idle edge");
        for(const [name,pair]of Object.entries(m.pairs)){
            assert.equal(pair.from.curves.length,pair.to.curves.length);assert.ok(Object.isFrozen(pair.to.curves));
            assert.ok(area(pair.from)>0&&area(pair.to)>0,"canonical positive contour directions");
            for(const which of["from","to"]){
                const c=pair[which],spans=pair[which+"Spans"];
                nearPoint(c.start,c.curves.at(-1)[2]);
                c.curves.forEach((curve,i)=>{
                    const span=spans[i];
                    for(const t of[0,.13,.5,.91,1])nearPoint(evaluate(vertex(c,i),curve,t),evaluate(span.start,span.curve,span.a+(span.b-span.a)*t));
                });
            }
            const lower=pair.targetAnchors[2],index=Math.floor(lower),t=lower-index;
            const p=vertex(m.native[name],index),[u,v,q]=m.native[name].curves[index];
            near(3*(1-t)**2*(u[1]-p[1])+6*(1-t)*t*(v[1]-u[1])+3*t*t*(q[1]-v[1]),0);
            metrics.push({side,contour:name,segments:pair.to.curves.length,targetAnchors:pair.targetAnchors,
                reverse:pair.reverse,landmarkIndices:pair.landmarkIndices,
                ...(name==="body"?{detailAttachment:{source:m.sourceAttachment,target:m.targetAttachment,
                    preparedCurveIndex:m.attachmentSpanIndex,parameter:m.attachmentParameter}}:{}),
                sourceLandmarks:pair.landmarkIndices.map(i=>vertex(pair.from,i)),targetLandmarks:pair.landmarkIndices.map(i=>vertex(pair.to,i))});
        }
        // Source L segments remain exact straight cubics, not fitted arcs.
        const sourceOutline=b.layers[1].commands;let previous=sourceOutline[0].slice(1),index=0;
        for(const cmd of sourceOutline.slice(1,-1)){
            if(cmd[0]==="L")for(const t of[0,.2,.7,1])nearPoint(evaluate(previous,m.native.outline.curves[index],t),previous.map((v,k)=>v*(1-t)+cmd[k+1]*t));
            previous=cmd.slice(-2);index++;
        }
        for(let i=0;i<=100;i++){
            assert.equal(hash(JSON.stringify(morph(a,presets.happier[side],i/100))),baseline[side][i],"exact pre-change Happier output");
            const t=i/100,g=morph(a,b,t);assert.equal(g.side,side);validateEyeGeometry(g);
            assert.deepEqual(morph(a,b,t),g);deepNear(morph(b,a,1-t),g);
            const position=layout(positions.idle[side+"Eye"],positions.sad[side+"Eye"],t);
            near(g.width,position.width);near(g.height,position.height);
            for(const key of["x","y","width","height"])near(position[key],positions.idle[side+"Eye"][key]*(1-t)+positions.sad[side+"Eye"][key]*t);
            if(i>0&&i<100){
                generateEyeLayers(g,"sample");
                const cs={body:fromCommands(g.layers[0].children[0].commands),outline:fromCommands(g.layers[1].commands),
                    mask:fromCommands(g.layers[4].children[0].children[1].commands),supplement:fromCommands(g.layers[4].children[1].commands)};
                for(const [name,c]of Object.entries(cs)){
                    simple(c);nearPoint(c.start,c.curves.at(-1)[2]);assert.ok(area(c)>0);
                    const pair=m.pairs[name],aa=[pair.from.start,...pair.from.curves.flat()],bb=[pair.to.start,...pair.to.curves.flat()];
                    [c.start,...c.curves.flat()].forEach((p,j)=>p.forEach((n,k)=>{assert.ok(Number.isFinite(n));near(n,aa[j][k]*(1-t)+bb[j][k]*t);}));
                }
                assert.equal(g.layers[0].attributes.opacity,undefined);assert.equal(g.layers[1].attributes.opacity,undefined);
                assert.equal(g.layers[1].attributes.strokeWidth,4);assert.equal(g.layers[4].children[1].attributes.strokeWidth,8);
                near(g.layers[4].attributes.opacity,t*t*(3-2*t));
                const detail=g.layers[5];near(detail.attributes.opacity,t*t*(3-2*t));
                assert.deepEqual(detail.children,b.layers.slice(5,9),"unchanged detail source geometry/use/mask/transforms");
                const transform=detail.attributes.transform.values;
                near(transform[0],t);near(transform[3],t);assert.equal(transform[1],0);assert.equal(transform[2],0);
                near(transform[4],(1-t)*m.sourceAttachment[0]);near(transform[5],(1-t)*m.sourceAttachment[1]);
                const onBody=evaluate(vertex(cs.body,m.attachmentSpanIndex),cs.body.curves[m.attachmentSpanIndex],m.attachmentParameter);
                nearPoint(onBody,m.targetAttachment.map((n,k)=>t*n+transform[k+4]));
                const defs=g.layers[6].children,originalDefs=b.layers[9].children;
                for(let j=0;j<2;j++)assert.deepEqual(defs[j].children,originalDefs[j].children,"unchanged filter primitives");
                const gradient=defs.find(n=>n.tag==="linearGradient"),target=originalDefs.find(n=>n.tag==="linearGradient");
                for(const [key,source]of[["x1",a.gradient.start[0]],["y1",a.gradient.start[1]],["x2",a.gradient.end[0]],["y2",a.gradient.end[1]]])near(gradient.attributes[key],source*(1-t)+target.attributes[key]*t);
                assert.deepEqual(gradient.children,target.children);
                const small=g.layers[2].attributes;near(small.cx,a.highlights.ellipse.center[0]*(1-t)+b.layers[2].attributes.cx*t);
                assert.equal(small.opacity,.96);assert.equal(g.layers[3].attributes.opacity,.96);
            }
            if(samples.includes(t))renders.push({side,progress:t,width:g.width,height:g.height,layout:position,svg:render(g)});
        }
        deepNear(morph(structuredClone(a),structuredClone(b),.5),morph(a,b,.5));
        for(const other of[HAPPIER_TRANSITION_PREVIEW[side],{...b,width:143}])
            for(const t of[0,.5,1])assert.throws(()=>morph(a,other,t),/correspondence/);
        assert.throws(()=>morph(b,presets.happier[side],.5),/correspondence/);
        assert.throws(()=>morph(a,presets.sad[side==="left"?"right":"left"],.5),/sides/);
        for(const progress of[NaN,Infinity,-Infinity,".5",null,undefined])assert.throws(()=>morph(a,b,progress),/progress/);
        const broken=structuredClone(b);broken.layers[4].children[1].attributes.mask.ref="missing";assert.throws(()=>morph(a,broken,.5),RangeError);
    }
    const combined=renderToStaticMarkup(react.createElement(react.Fragment,null,...["left","right"].flatMap(side=>[.1,.5,.9].map(t=>react.createElement(ProceduralEye,{key:side+t,geometry:morph(presets.idle[side],presets.sad[side],t)})))));
    const ids=[...combined.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
    for(const match of combined.matchAll(/(?:url\(#([^)]*)\)|xlink:href="#([^"]+)")/g))assert.ok(ids.includes(match[1]??match[2]));
    assert.equal(JSON.stringify([presets,positions]),snapshot);
    await mkdir("reports/eye-sad-morphing",{recursive:true});
    await writeFile("reports/eye-sad-morphing/samples.json",JSON.stringify(renders,null,2)+"\n");
    await writeFile("reports/eye-sad-morphing/correspondence.json",JSON.stringify(metrics,null,2)+"\n");
    const image=s=>"data:image/svg+xml;base64,"+Buffer.from(s).toString("base64");
    const grid='<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="470"><rect width="100%" height="100%" fill="#080f1d"/>'+renders.map(e=>{
        const x=samples.indexOf(e.progress)*160,y=e.side==="left"?0:235;
        return `<g transform="translate(${x} ${y})"><text x="8" y="22" fill="white" font-size="12">${e.side} ${Math.round(e.progress*100)}%</text><image x="8" y="40" width="${e.width}" height="${e.height}" href="${image(e.svg)}"/></g>`;
    }).join("")+"</svg>";
    await writeFile("reports/eye-sad-morphing/morph-grid.svg",grid);
    console.log("PASS: both Idle/Sad endpoint identities; 101 samples per side; explicit landmarks/direction, exact De Casteljau span and line preservation, finite/simple/closed body/outline/masks, original detail geometry and filters, localized emergence, gradients/layout/reverse/clamping/rejection, unique IDs/resources, 202 exact Happier baseline hashes and protected file integrity. Visual review/raster tests are separate.");
}finally{await server.close();}
