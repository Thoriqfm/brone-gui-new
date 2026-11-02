// Actual source-derived API and React SVG; rendered QA runs separately in Python.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir,realpath} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {createServer} from "vite";
const server=await createServer({server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},appType:"custom"});
try{
    const {EYE_EXPRESSION_PRESETS:P,HAPPIER_TRANSITION_PREVIEW,interpolateEyeGeometry:morph,interpolateEyeLayout:layout,
        prepareIdleThinkingEye:prepare,validateEyeGeometry:validate,generateEyeLayers}=await server.ssrLoadModule("/src/geometry/eyes/index.ts");
    const {FACE_LAYER_LAYOUTS:L}=await server.ssrLoadModule("/src/config/faceLayerLayouts.ts");
    const {default:Eye}=await server.ssrLoadModule("/src/components/face/eyes/ProceduralEye.tsx");
    const React=await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const {renderToStaticMarkup}=await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const render=g=>renderToStaticMarkup(React.createElement(Eye,{geometry:g}));
    const hash=s=>createHash("sha256").update(s).digest("hex");
    const baseline=JSON.parse(await readFile("reports/eye-thinking-morphing/existing-baseline.json","utf8"));
    const near=(a,b,eps=3e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
    const pointNear=(a,b)=>a.forEach((v,k)=>near(v,b[k]));
    const deepNear=(a,b)=>{if(typeof a==="number")return near(a,b);if(!a||typeof a!=="object")return assert.equal(a,b);
        assert.deepEqual(Object.keys(a),Object.keys(b));for(const k of Object.keys(a))deepNear(a[k],b[k]);};
    const at=(p,[a,b,q],t)=>[0,1].map(k=>(1-t)**3*p[k]+3*(1-t)**2*t*a[k]+3*(1-t)*t*t*b[k]+t**3*q[k]);
    const vertex=(c,i)=>i===0?c.start:c.curves[i-1][2];
    const contour=cs=>({start:cs[0].slice(1),curves:cs.slice(1,-1).map(c=>[c.slice(1,3),c.slice(3,5),c.slice(5,7)])});
    const polygon=c=>c.curves.flatMap((q,i)=>Array.from({length:16},(_,j)=>at(vertex(c,i),q,j/16)));
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const simple=c=>{const p=polygon(c);let area=0;for(let i=0;i<p.length;i++){
        const a=p[i],b=p[(i+1)%p.length];area+=a[0]*b[1]-b[0]*a[1];
        for(let j=i+2;j<p.length;j++){if(i===0&&j===p.length-1)continue;const c=p[j],d=p[(j+1)%p.length];
            assert.ok(!(cross(a,b,c)*cross(a,b,d)<-1e-9&&cross(c,d,a)*cross(c,d,b)<-1e-9),"sampled Thinking contour self-intersection");}}
        assert.ok(area>0,"aligned positive contour direction");pointNear(c.start,c.curves.at(-1)[2]);};
    const between=(a,b,t)=>Array.isArray(a)?a.map((v,i)=>between(v,b[i],t)):typeof a==="number"?(1-t)*a+t*b:a;
    const mixContour=(a,b,t)=>({start:between(a.start,b.start,t),curves:between(a.curves,b.curves,t)});
    const samples=[0,.1,.25,.5,.75,.9,1],renders=[],metrics=[],snapshot=JSON.stringify([P,L]);
    assert.notStrictEqual(prepare("left"),prepare("right"));assert.throws(()=>prepare("mirror"),RangeError);
    for(const [pair,sides]of Object.entries(baseline)){
        const [source,target]=pair.split("-");for(const side of["left","right"])for(let i=0;i<=100;i++)
            assert.equal(hash(JSON.stringify(morph(P[source][side],P[target][side],i/100))),sides[side][i],"existing transition unchanged");
    }
    for(const side of["left","right"]){
        const a=P.idle[side],b=P.thinking[side],m=prepare(side);
        assert.equal(m.side,side);assert.ok(Object.isFrozen(m));assert.strictEqual(prepare(side),m);
        assert.strictEqual(morph(a,b,0),a);assert.strictEqual(morph(a,b,-1),a);assert.strictEqual(morph(a,b,1),b);assert.strictEqual(morph(a,b,2),b);
        assert.strictEqual(morph(b,a,0),b);assert.strictEqual(morph(b,a,1),a);
        const sourceHighlight=a.highlights.contour,targetHighlight=m.highlight;
        assert.equal(targetHighlight.curves.length,8);assert.equal(sourceHighlight.curves.length,8);
        // Explicit notch landmarks: upper outer start, right outer approach,
        // inner notch arc/exit and lower outer return, not arbitrary vertices.
        assert.ok(targetHighlight.curves[2][2][0]<targetHighlight.curves[1][2][0]);
        assert.ok(targetHighlight.curves[4][2][1]>targetHighlight.curves[2][2][1]);
        if(side==="left"){
            assert.equal(b.layers.length,6,"Thinking-left has no Sad/Cry lower details");
            for(const [name,pair]of Object.entries(m.pairs)){
                assert.equal(pair.from.curves.length,pair.to.curves.length);assert.equal(pair.reverse,name==="supplement");
                simple(pair.from);simple(pair.to);assert.equal(pair.landmarkIndices.length,4);
                for(const end of["from","to"])pair[end].curves.forEach((q,i)=>{
                    const span=pair[end+"Spans"][i];for(const t of[0,.13,.5,.91,1])
                        pointNear(at(vertex(pair[end],i),q,t),at(span.start,span.curve,span.a+(span.b-span.a)*t));
                });
                const lower=pair.targetAnchors[2],i=Math.floor(lower),t=lower-i,p=vertex(m.native[name],i),[u,v,q]=m.native[name].curves[i];
                near(3*(1-t)**2*(u[1]-p[1])+6*(1-t)*t*(v[1]-u[1])+3*t*t*(q[1]-v[1]),0);
                metrics.push({side,contour:name,segments:pair.to.curves.length,reverse:pair.reverse,anchors:pair.targetAnchors,
                    landmarkIndices:pair.landmarkIndices,sourceLandmarks:pair.landmarkIndices.map(i=>vertex(pair.from,i)),targetLandmarks:pair.landmarkIndices.map(i=>vertex(pair.to,i))});
            }
            assert.deepEqual(m.pairs.body.targetAnchors.slice(0,2),[1.5,2.5]);
            // Straight source L segments remain exactly straight cubics.
            let prev=b.layers[1].commands[0].slice(1),i=0;
            for(const cmd of b.layers[1].commands.slice(1,-1)){
                if(cmd[0]==="L")for(const t of[0,.2,.7,1])pointNear(at(prev,m.native.outline.curves[i],t),prev.map((v,k)=>(1-t)*v+t*cmd[k+1]));
                prev=cmd.slice(-2);i++;
            }
        }else{
            assert.deepEqual(m.outline.from,m.outline.to,"right source outlines are exactly equal, not merely equal counts");
            assert.deepEqual([m.body.cx,m.body.cy],a.body.center);assert.deepEqual([m.body.rx,m.body.ry],a.body.radius);
            assert.deepEqual(m.outline.landmarkIndices,[0,2,4,6]);simple(m.outline.from);
            assert.deepEqual(m.outline.landmarkIndices.map(i=>vertex(m.outline.to,i)),[[64.5,2],[127,85.5],[64.5,169],[2,85.5]]);
            metrics.push({side,contour:"ellipse and outline unchanged",body:m.body,landmarkIndices:m.outline.landmarkIndices,
                targetLandmarks:m.outline.landmarkIndices.map(i=>vertex(m.outline.to,i))});
        }
        for(let i=0;i<=100;i++){
            const t=i/100,g=morph(a,b,t),reverse=morph(b,a,1-t);validate(g);validate(reverse);deepNear(reverse,g);assert.deepEqual(morph(a,b,t),g);
            const pos=layout(L.idle[side+"Eye"],L.thinking[side+"Eye"],t);near(pos.width,g.width);near(pos.height,g.height);
            for(const key of["x","y","width","height"])near(pos[key],(1-t)*L.idle[side+"Eye"][key]+t*L.thinking[side+"Eye"][key]);
            if(i>0&&i<100){
                let small,highlight;
                if(side==="left"){
                    generateEyeLayers(g,"thinking-test");assert.equal(g.layers.length,6);
                    const cs={body:contour(g.layers[0].children[0].commands),outline:contour(g.layers[1].commands),
                        mask:contour(g.layers[4].children[0].children[1].commands),supplement:contour(g.layers[4].children[1].commands)};
                    for(const [name,c]of Object.entries(cs)){simple(c);deepNear(c,mixContour(m.pairs[name].from,m.pairs[name].to,t));}
                    assert.equal(g.layers[0].attributes.opacity,undefined);assert.equal(g.layers[1].attributes.opacity,undefined);
                    assert.equal(g.layers[1].attributes.strokeWidth,4);assert.equal(g.layers[4].children[1].attributes.strokeWidth,8);
                    near(g.layers[4].attributes.opacity,t*t*(3-2*t));
                    const defs=g.layers[5].children,original=b.layers[5].children;
                    for(const n of original.filter(n=>n.tag==="filter"))assert.deepEqual(defs.find(d=>d.attributes.id===n.attributes.id).children,n.children);
                    const gradient=defs.find(n=>n.tag==="linearGradient"),target=original.find(n=>n.tag==="linearGradient");assert.deepEqual(gradient.children,target.children);
                    for(const [key,v]of[["x1",a.gradient.start[0]],["y1",a.gradient.start[1]],["x2",a.gradient.end[0]],["y2",a.gradient.end[1]]])near(gradient.attributes[key],(1-t)*v+t*target.attributes[key]);
                    small=[g.layers[2].attributes.cx,g.layers[2].attributes.cy];highlight=contour(g.layers[3].commands);
                    assert.equal(g.layers[2].attributes.opacity,.96);assert.equal(g.layers[3].attributes.opacity,.96);
                }else{
                    assert.equal("kind"in g,false,"right keeps exact ellipse representation");assert.strictEqual(g.body,a.body);assert.strictEqual(g.outline,a.outline);
                    assert.deepEqual(g.gradient,a.gradient);assert.deepEqual(g.shadow,a.shadow);assert.equal(g.highlights.opacity,.96);
                    small=g.highlights.ellipse.center;highlight=g.highlights.contour;
                }
                simple(highlight);deepNear(highlight,mixContour(sourceHighlight,targetHighlight,t));
                pointNear(small,between(a.highlights.ellipse.center,[m.small.cx,m.small.cy],t));
            }
            for(const direction of["idle-thinking","thinking-idle"])if(samples.includes(t)){
                // Each reverse sample is an actual reverse API call, not a relabelled image.
                const rev=direction==="thinking-idle",p=rev?1-t:t;
                renders.push({direction,side,progress:samples.find(v=>Math.abs(v-p)<1e-8),width:g.width,height:g.height,layout:pos,svg:render(rev?reverse:g)});
            }
        }
        deepNear(morph(structuredClone(a),structuredClone(b),.5),morph(a,b,.5));
        for(const t of[NaN,Infinity,-Infinity,".5",null,undefined])assert.throws(()=>morph(a,b,t),/progress/);
        for(const t of[0,.5,1]){
            for(const edited of[{...b,width:b.width+1},{...b,layers:b.layers.slice(0,-1)}])assert.throws(()=>morph(a,edited,t),RangeError);
            assert.throws(()=>morph({...a,width:a.width+1},b,t),/correspondence/);
            assert.throws(()=>morph(a,P.thinking[side==="left"?"right":"left"],t),/sides/);
            for(const other of[P.sad[side],P.cry[side],P.happier[side],HAPPIER_TRANSITION_PREVIEW[side],b])assert.throws(()=>morph(b,other,t),/correspondence/);
        }
    }
    const html=renderToStaticMarkup(React.createElement(React.Fragment,null,...["left","right"].flatMap(side=>[.1,.5,.9].map(t=>React.createElement(Eye,{key:side+t,geometry:morph(P.idle[side],P.thinking[side],t)})))));
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
    for(const m of html.matchAll(/(?:url\(#([^)]*)\)|xlink:href="#([^"]+)")/g))assert.ok(ids.includes(m[1]??m[2]));
    assert.equal(JSON.stringify([P,L]),snapshot);
    for(const direction of["idle-thinking","thinking-idle"]){
        const folder="reports/eye-thinking-morphing/"+direction;await mkdir(folder,{recursive:true});
        const rows=renders.filter(r=>r.direction===direction).sort((a,b)=>a.side.localeCompare(b.side)||a.progress-b.progress);
        await writeFile(folder+"/samples.json",JSON.stringify(rows,null,2)+"\n");
        const image=s=>"data:image/svg+xml;base64,"+Buffer.from(s).toString("base64");
        const grid='<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="470"><rect width="100%" height="100%" fill="#080f1d"/>'+rows.map(s=>{
            const x=samples.indexOf(s.progress)*160,y=s.side==="left"?0:235;
            return `<g transform="translate(${x} ${y})"><text x="8" y="22" fill="white">${s.side} ${Math.round(s.progress*100)}%</text><image x="8" y="40" width="${s.width}" height="${s.height}" href="${image(s.svg)}"/></g>`;
        }).join("")+"</svg>";await writeFile(folder+"/morph-grid.svg",grid);
    }
    await writeFile("reports/eye-thinking-morphing/correspondence.json",JSON.stringify(metrics,null,2)+"\n");
    console.log("PASS: Thinking independently on both sides, 101 samples/side/direction (404); exact endpoints, semantic landmarks/directions, exact subdivision/lines, closed/sample-simple contours, exact right ellipse, highlights, gradients/filter/mask/resources/layout, unique IDs, determinism/rejection; 808 unchanged prior-pair hashes. Rendered visual QA is separate.");
}finally{await server.close();}
