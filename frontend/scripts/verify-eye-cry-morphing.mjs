// Run from frontend. Actual interpolation/SSR; raster review remains separate.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
const server=await createServer({server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},appType:"custom"});
try {
    const {EYE_EXPRESSION_PRESETS:P,interpolateEyeGeometry:morph,interpolateEyeLayout:layout,
        prepareCryEye:prepare,validateEyeGeometry:validate,generateEyeLayers}=await server.ssrLoadModule("/src/geometry/eyes/index.ts");
    const {FACE_LAYER_LAYOUTS:L}=await server.ssrLoadModule("/src/config/faceLayerLayouts.ts");
    const {default:Eye}=await server.ssrLoadModule("/src/components/face/eyes/ProceduralEye.tsx");
    const React=await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const {renderToStaticMarkup}=await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const render=g=>renderToStaticMarkup(React.createElement(Eye,{geometry:g}));
    const hash=s=>createHash("sha256").update(s).digest("hex");
    const baseline=JSON.parse(await readFile("reports/eye-cry-morphing/existing-baseline.json","utf8"));
    const near=(a,b,e=3e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
    const pointNear=(a,b)=>a.forEach((v,k)=>near(v,b[k]));
    const deepNear=(a,b)=>{if(typeof a==="number")return near(a,b);if(!a||typeof a!=="object")return assert.equal(a,b);
        assert.deepEqual(Object.keys(a),Object.keys(b));for(const k of Object.keys(a))deepNear(a[k],b[k]);};
    const at=(p,[a,b,q],t)=>[0,1].map(k=>(1-t)**3*p[k]+3*(1-t)**2*t*a[k]+3*(1-t)*t*t*b[k]+t**3*q[k]);
    const vertex=(c,i)=>i===0?c.start:c.curves[i-1][2];
    const contour=cs=>({start:cs[0].slice(1),curves:cs.slice(1,-1).map(c=>[c.slice(1,3),c.slice(3,5),c.slice(5,7)])});
    const polygon=c=>c.curves.flatMap((q,i)=>Array.from({length:12},(_,j)=>at(vertex(c,i),q,j/12)));
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const simple=c=>{const p=polygon(c);let area=0;for(let i=0;i<p.length;i++){
        const a=p[i],b=p[(i+1)%p.length];area+=a[0]*b[1]-b[0]*a[1];
        for(let j=i+2;j<p.length;j++){if(i===0&&j===p.length-1)continue;const c=p[j],d=p[(j+1)%p.length];
            assert.ok(!(cross(a,b,c)*cross(a,b,d)<-1e-9&&cross(c,d,a)*cross(c,d,b)<-1e-9),"sampled self-intersection");}}
        assert.ok(area>0,"positive aligned direction");pointNear(c.start,c.curves.at(-1)[2]);};
    const samples=[0,.1,.25,.5,.75,.9,1],audit=[],snapshot=JSON.stringify([P,L]),rendered=[];
    assert.notStrictEqual(prepare("left"),prepare("right"));assert.throws(()=>prepare("mirror"));
    for(const side of["left","right"]){
        for(const target of["happier","sad"])for(let i=0;i<=100;i++)
            assert.equal(hash(JSON.stringify(morph(P.idle[side],P[target][side],i/100))),baseline[target][side][i],"pre-change output unchanged");
        const cry=P.cry[side],sad=P.sad[side],m=prepare(side);
        // Source audit, not an assumption that equal command counts correspond.
        assert.deepEqual(sad.layers[0].children[0].commands,cry.layers[0].children[0].commands,"shared six-cubic body");
        assert.deepEqual(sad.layers[1].commands,cry.layers[1].commands,"shared mixed-command primary outline");
        assert.deepEqual(sad.layers[2],cry.layers[2]);assert.deepEqual(sad.layers[3],cry.layers[3]);
        const water=cry.layers[4];assert.equal(water.attributes.fill,"#76C5FD");assert.equal(water.commands.filter(c=>c[0]==="C").length,16);
        if(side==="right")assert.notDeepEqual(sad.layers[4].children[0].children[1].commands,cry.layers[5].children[0].children[1].commands);
        for(const source of["idle","sad"]){
            const a=P[source][side],b=cry,prepared=m[source];
            for(const t of[0,-1])assert.strictEqual(morph(a,b,t),a);
            for(const t of[1,2])assert.strictEqual(morph(a,b,t),b);
            assert.strictEqual(morph(b,a,0),b);assert.strictEqual(morph(b,a,1),a);
            for(const [name,pair]of Object.entries(prepared.pairs)){
                assert.ok(Object.isFrozen(pair.to.curves));assert.equal(pair.from.curves.length,pair.to.curves.length);
                simple(pair.from);simple(pair.to);assert.equal(pair.landmarkIndices.length,4);
                for(const end of["from","to"])pair[end].curves.forEach((q,i)=>{
                    const span=pair[end+"Spans"][i];for(const t of[0,.13,.5,.91,1])
                        pointNear(at(vertex(pair[end],i),q,t),at(span.start,span.curve,span.a+(span.b-span.a)*t));
                });
                audit.push({side,source,contour:name,segments:pair.to.curves.length,reverse:pair.reverse,
                    anchors:pair.targetAnchors,landmarkIndices:pair.landmarkIndices,
                    from:pair.landmarkIndices.map(i=>vertex(pair.from,i)),to:pair.landmarkIndices.map(i=>vertex(pair.to,i)),
                    attachment:prepared.targetAttachment});
            }
            for(let i=0;i<=100;i++){
                const p=i/100,g=morph(a,b,p);validate(g);assert.deepEqual(morph(a,b,p),g);deepNear(morph(b,a,1-p),g);
                const pos=layout(L[source][side+"Eye"],L.cry[side+"Eye"],p);near(pos.width,g.width);near(pos.height,g.height);
                for(const key of["x","y","width","height"])near(pos[key],(1-p)*L[source][side+"Eye"][key]+p*L.cry[side+"Eye"][key]);
                if(i>0&&i<100){
                    generateEyeLayers(g,"crySample");
                    const body=contour(g.layers[0].children[0].commands),outline=contour(g.layers[1].commands),
                        masking=contour(g.layers[5].children[0].children[1].commands),supplement=contour(g.layers[5].children[1].commands);
                    for(const [name,c]of Object.entries({body,outline,mask:masking,supplement})){
                        simple(c);const pair=prepared.pairs[name];
                        deepNear(c,{start:pair.from.start.map((v,k)=>(1-p)*v+p*pair.to.start[k]),curves:pair.from.curves.map((q,j)=>q.map((v,k)=>v.map((n,axis)=>(1-p)*n+p*pair.to.curves[j][k][axis])))});
                    }
                    assert.equal(g.layers[0].attributes.opacity,undefined);assert.equal(g.layers[1].attributes.opacity,undefined);
                    assert.equal(g.layers[1].attributes.strokeWidth,4);assert.equal(g.layers[5].children[1].attributes.strokeWidth,8);
                    const tear=g.layers[4],matrix=tear.attributes.transform.values,alpha=p*p*(3-2*p);
                    assert.deepEqual(tear.children,[water]);near(tear.attributes.opacity,alpha);near(matrix[0],p);near(matrix[3],p);
                    const attachment=at(vertex(body,prepared.attachmentSpanIndex),body.curves[prepared.attachmentSpanIndex],prepared.attachmentParameter);
                    pointNear(prepared.targetAttachment.map((v,k)=>p*v+matrix[k+4]),attachment);
                    // Connected source attachment lies inside the water polygon.
                    const poly=polygon(contour(water.commands));let inside=false;const [x,y]=prepared.targetAttachment;
                    for(let j=0,k=poly.length-1;j<poly.length;k=j++)if((poly[j][1]>y)!==(poly[k][1]>y)&&x<(poly[k][0]-poly[j][0])*(y-poly[j][1])/(poly[k][1]-poly[j][1])+poly[j][0])inside=!inside;
                    assert.ok(inside,"body attachment is inside actual source water");
                    for(const q of poly){const v=q.map((n,k)=>p*n+matrix[k+4]);assert.ok(v[0]>=0&&v[0]<=g.width&&v[1]>=0&&v[1]<=g.height,"water stays within viewport");}
                    if(side==="right"){const white=g.layers[6];assert.deepEqual(white.children,[cry.layers[6]]);assert.deepEqual(white.attributes,tear.attributes);
                        assert.equal(white.children[0].children[0].attributes.fillOpacity,.8);}
                    if(source==="sad"){
                        const detail=g.layers.at(-2);assert.deepEqual(detail.children,sad.layers.slice(5,9));near(detail.attributes.opacity,1-alpha);
                        const matrix=detail.attributes.transform.values;near(matrix[0],1-p);pointNear(m.sadAttachment.map((v,k)=>(1-p)*v+matrix[k+4]),attachment);
                    }
                    const defs=g.layers.at(-1).children,original=cry.layers.at(-1).children;
                    for(const n of original.filter(n=>n.tag==="filter")){
                        const out=defs.find(d=>d.attributes.id===n.attributes.id);assert.deepEqual(out.children,n.children,"unmodified original filter primitives");
                        if(n.children.some(c=>c.tag==="feGaussianBlur"&&c.attributes.stdDeviation===15))assert.deepEqual(out,n,"white blur definition exact");
                    }
                    const gradient=defs.find(n=>n.tag==="linearGradient"),target=original.find(n=>n.tag==="linearGradient");assert.deepEqual(gradient.children,target.children);
                    if(source==="sad")assert.deepEqual(gradient,target);else for(const [key,v]of[["x1",a.gradient.start[0]],["y1",a.gradient.start[1]],["x2",a.gradient.end[0]],["y2",a.gradient.end[1]]])near(gradient.attributes[key],(1-p)*v+p*target.attributes[key]);
                }
                if(samples.includes(p))for(const reverse of[false,true])rendered.push({transition:reverse?`cry-${source}`:`${source}-cry`,side,
                    progress:reverse?1-p:p,width:g.width,height:g.height,layout:pos,svg:render(reverse?morph(b,a,1-p):g)});
            }
            deepNear(morph(structuredClone(a),structuredClone(b),.5),morph(a,b,.5));
            for(const t of[0,.5,1]){
                assert.throws(()=>morph({...a,width:a.width+1},b,t),/correspondence/);
                assert.throws(()=>morph(a,{...b,height:b.height+1},t),/correspondence/);
                assert.throws(()=>morph(a,P.cry[side==="left"?"right":"left"],t),/sides/);
            }
            for(const t of[NaN,Infinity,-Infinity,".5",null,undefined])assert.throws(()=>morph(a,b,t),/progress/);
        }
        for(const other of[P.happier[side],P.thinking[side],cry])assert.throws(()=>morph(cry,other,.5),/correspondence/);
    }
    const html=renderToStaticMarkup(React.createElement(React.Fragment,null,...["idle","sad"].flatMap(source=>["left","right"].map(side=>React.createElement(Eye,{key:source+side,geometry:morph(P[source][side],P.cry[side],.5)})))));
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
    for(const m of html.matchAll(/(?:url\(#([^)]*)\)|xlink:href="#([^"]+)")/g))assert.ok(ids.includes(m[1]??m[2]));
    assert.equal(JSON.stringify([P,L]),snapshot);
    for(const transition of["idle-cry","cry-idle","sad-cry","cry-sad"]){
        const folder="reports/eye-cry-morphing/"+transition;await mkdir(folder,{recursive:true});
        const rows=rendered.filter(s=>s.transition===transition).sort((a,b)=>a.side.localeCompare(b.side)||a.progress-b.progress);
        // 1 - p may carry floating-point noise; label samples by the canonical grid.
        rows.forEach(s=>s.progress=samples.find(p=>Math.abs(p-s.progress)<1e-8));
        await writeFile(folder+"/samples.json",JSON.stringify(rows,null,2)+"\n");
        const image=s=>"data:image/svg+xml;base64,"+Buffer.from(s).toString("base64");
        const grid='<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="470"><rect width="100%" height="100%" fill="#080f1d"/>'+rows.map(s=>{
            const x=samples.indexOf(s.progress)*160,y=s.side==="left"?0:235;
            return `<g transform="translate(${x} ${y})"><text x="8" y="22" fill="white">${s.side} ${Math.round(s.progress*100)}%</text><image x="8" y="40" width="${s.width}" height="${s.height}" href="${image(s.svg)}"/></g>`;
        }).join("")+"</svg>";await writeFile(folder+"/morph-grid.svg",grid);
    }
    await writeFile("reports/eye-cry-morphing/correspondence.json",JSON.stringify(audit,null,2)+"\n");
    console.log("PASS: Idle/Cry + Sad/Cry; 404 forward + 404 reverse samples; exact endpoints, semantic sectors/directions/native subdivision, simple closed contours, attached geometric water emergence, Sad detail retreat, Cry-right white/blur, filters/gradients/resources/layout/IDs/rejection/determinism and 404 unchanged Happier/Sad baseline hashes. Four visual grids exported; raster review is separate.");
} finally {await server.close();}
