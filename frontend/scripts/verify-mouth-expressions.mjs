// Run from frontend: node scripts/verify-mouth-expressions.mjs
import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
    const api = await server.ssrLoadModule("/src/geometry/mouth/index.ts");
    const { MOUTH_PRESETS, MOUTH_EXPRESSIONS, MOUTH_TARGETS, MOUTH_EXPRESSION_PRESETS: presets, IDLE_MOUTH_TRANSITIONS: pairs,
        sampleIdleMouthTransition: sample, interpolateMouthGeometry: morph, interpolateMouthLayout: layout,
        generateMouthPaths: paths, validateMouthGeometry: validate, subdivideCubic: split, reverseContour, alignContours } = api;
    const { default: ProceduralMouth } = await server.ssrLoadModule("/src/components/face/mouth/ProceduralMouth.tsx");
    const { default: Mouth } = await server.ssrLoadModule("/src/components/face/Mouth.tsx");
    const { default: Comparison } = await server.ssrLoadModule("/src/components/face/mouth/MouthGeometryComparison.tsx");
    const { useFaceStore } = await server.ssrLoadModule("/src/stores/faceStore.ts");
    const { createElement } = await import(pathToFileURL(await realpath("node_modules/react/index.js")));
    const { renderToStaticMarkup } = await import(pathToFileURL(await realpath("node_modules/react-dom/server.node.js")));
    const render = (component, props) => renderToStaticMarkup(createElement(component, props));
    const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, a + " != " + b);
    const evaluate = (p, [a, b, q], t) => [0, 1].map((axis) => (1-t)**3*p[axis]+3*(1-t)**2*t*a[axis]+3*(1-t)*t*t*b[axis]+t**3*q[axis]);
    const points = (c) => [c.start, ...c.curves.flat()];
    const polygon = (c, steps = 16) => {
        let previous = c.start; const result = [];
        for (const curve of c.curves) {
            for (let j = 0; j < steps; j++) result.push(evaluate(previous, curve, j / steps));
            previous = curve[2];
        }
        return result;
    };
    const area = (poly) => poly.reduce((sum, p, i) => { const q = poly[(i+1)%poly.length]; return sum+p[0]*q[1]-p[1]*q[0]; }, 0)/2;
    const cross = (p,q,r) => (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
    const simple = (poly) => {
        for (let i=0;i<poly.length;i++) for (let j=i+2;j<poly.length;j++) {
            if (i===0 && j===poly.length-1) continue;
            const p=poly[i],q=poly[(i+1)%poly.length],r=poly[j],s=poly[(j+1)%poly.length];
            assert.ok(!(cross(p,q,r)*cross(p,q,s)<-1e-16 && cross(r,s,p)*cross(r,s,q)<-1e-16), "sampled contour self-intersection");
        }
    };
    const distance = (p,a,b) => {
        const dx=b[0]-a[0],dy=b[1]-a[1], denominator=dx*dx+dy*dy;
        const t=denominator===0?0:Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/denominator));
        return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
    };
    const inside = (p,poly) => {
        let yes=false;
        for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
            const a=poly[i],b=poly[j];
            if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) yes=!yes;
        }
        return yes;
    };
    const sameCurve = (original, prepared, g) => {
        const absolute = (poly) => poly.map(([x,y])=>[x*g.width,y*g.height]);
        const source=absolute(polygon(original,256)), actual=absolute(polygon(prepared,32));
        for (const p of actual) assert.ok(source.some((a,i)=>distance(p,a,source[(i+1)%source.length])<0.003), "subdivision/reversal preserves original contour");
    };
    const filenames={idle:"idle",happy:"happier",sad:"sad",cry:"cry",shock:"shock",thinking:"thinking"};
    const parse = (d) => {
        const n=d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g).map(Number), curves=[];
        for(let i=2;i<n.length;i+=6) curves.push([n.slice(i,i+2),n.slice(i+2,i+4),n.slice(i+4,i+6)]);
        return {start:n.slice(0,2),curves};
    };
    const snapshot=JSON.stringify(presets);
    assert.deepEqual(MOUTH_EXPRESSIONS,["idle","happy","sad","cry","shock","thinking"]);
    for(const name of MOUTH_EXPRESSIONS) {
        const g=presets[name].geometry; validate(g);
        const svg=await readFile("public/assets/face-layers/mouth/"+filenames[name]+"-mouth.svg","utf8");
        const source=[...svg.matchAll(/<path\b[^>]*>/g)].map(m=>m[0]);
        const original=source.map(tag=>parse(tag.match(/d="([^"]+)"/)[1]));
        const dimensions=svg.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1).map(Number);
        assert.deepEqual([g.width,g.height],dimensions);
        assert.equal(g.width,presets[name].layout.width); assert.equal(g.height,presets[name].layout.height);
        near(g.strokeWidth,Number(source.at(-1).match(/stroke-width="([^"]+)"/)[1]));
        near(g.cavityStrokeWidth,Number(source[0].match(/stroke-width="([^"]+)"/)[1]));
        for(const [c,ref] of [[g.cavity,original[0]],...(g.tongue?[[g.tongue,original[1]]]:[])]) {
            assert.equal(c.curves.length,ref.curves.length);
            points(c).forEach((p,i)=>p.forEach((n,axis)=>near(n*(axis?g.height:g.width),points(ref)[i][axis],1e-6)));
        }
        if(name==="idle"||name==="happy") sameCurve(original.at(-1),parse(paths(g).outline),{width:1,height:1});
        else points(g.outline).forEach((p,i)=>p.forEach((n,axis)=>near(n*(axis?g.height:g.width),points(original.at(-1))[i][axis],1e-6)));
        assert.equal(g.tongue===null,name==="thinking");
        const html=render(ProceduralMouth,{geometry:g});
        assert.ok(html.includes('fill="#232322"')); assert.ok(html.includes('stroke="black"'));
        assert.equal(html.includes('fill="#EF775D"'),name!=="thinking");
        assert.equal((html.match(/<path/g)||[]).length,name==="thinking"?2:3);
        const production=render(Mouth,{expression:name}); assert.ok(production.includes("<img")); assert.ok(!production.includes("<svg"));
        console.log("PASS endpoint: "+name+" "+g.width+"x"+g.height+" cavity="+g.cavity.curves.length+" tongue="+(g.tongue?.curves.length??0));
    }
    assert.deepEqual(MOUTH_PRESETS.SAD,MOUTH_PRESETS.CRY,"approved Sad/Cry artwork is identical");
    // Direct expression pairs must preserve artwork at both ends and stay simple
    // throughout the morph, including the tongue disappearing into Thinking.
    for(const from of MOUTH_EXPRESSIONS) for(const to of MOUTH_EXPRESSIONS) if(from!==to) {
        const samplePair=p=>api.sampleMouthTransition(from,to,p);
        assert.strictEqual(samplePair(0),presets[from].geometry);
        assert.strictEqual(samplePair(1),presets[to].geometry);
        assert.throws(()=>samplePair(NaN),RangeError);
        for(const [name,p] of [[from,1e-10],[to,1-1e-10]]) {
            const g=samplePair(p), original=presets[name].geometry;
            sameCurve(original.cavity,g.cavity,original);
            sameCurve(original.outline??original.cavity,g.outline??g.cavity,original);
            if(original.tongue) sameCurve(original.tongue,g.tongue,original);
        }
        for(let i=1;i<20;i++) {
            const p=i/20,g=samplePair(p),reverse=api.sampleMouthTransition(to,from,1-p);
            validate(g); paths(g);
            for(const key of ["cavity","outline","tongue"]) if(g[key]) {
                simple(polygon(g[key]));
                points(g[key]).forEach((point,i)=>point.forEach((n,axis)=>near(n,points(reverse[key])[i][axis])));
            }
        }
    }
    assert.throws(()=>api.sampleMouthTransition("shy","happy",.5),RangeError);
    assert.throws(()=>api.sampleMouthTransition("happy","shy",.5),RangeError);
    assert.equal(JSON.stringify(presets),snapshot,"direct morphs leave source presets untouched");
    console.log("PASS: all 30 directed mouth pairs; exact endpoints, source-curve preservation, simple intermediate contours, reverse symmetry and invalid input rejection");
    assert.notDeepEqual(MOUTH_PRESETS.SAD.outline,MOUTH_PRESETS.SAD.cavity,"independent source outline retained");
    assert.ok(points(MOUTH_PRESETS.SAD.cavity).some(p=>p[1]<0),"valid controls outside viewBox retained");
    // Exact subdivision checked analytically at several split and evaluation parameters.
    for(const g of Object.values(MOUTH_PRESETS)) for(const contour of [g.cavity,g.tongue,g.outline].filter(Boolean)) {
        let p=contour.start;
        for(const curve of contour.curves) {
            for(const t of [0.1,0.25,0.5,0.9]) {
                const [left,right]=split(p,curve,t);
                for(let j=0;j<=20;j++) {
                    const u=j/20;
                    evaluate(p,left,u).forEach((n,axis)=>near(n,evaluate(p,curve,t*u)[axis]));
                    evaluate(left[2],right,u).forEach((n,axis)=>near(n,evaluate(p,curve,t+(1-t)*u)[axis]));
                }
            }
            p=curve[2];
        }
        assert.deepEqual(reverseContour(reverseContour(contour)),contour);
    }
    for(const t of [0,1,-1,NaN,Infinity]) assert.throws(()=>split([0,0],[[0,1],[1,1],[1,0]],t),RangeError);
    for(const target of MOUTH_TARGETS) {
        const [a,b]=pairs[target]; const endpoint=presets[target].geometry;
        assert.equal(a.cavity.curves.length,b.cavity.curves.length);
        assert.equal(a.tongue.curves.length,b.tongue.curves.length);
        assert.ok(a.cavity.curves.length<=12 && a.tongue.curves.length<=20,"bounded topology");
        if(target!=="happy") {
            for(const g of [a,b]) {
                assert.ok(area(polygon(g.cavity))<0,"aligned cavity direction");
                assert.ok(area(polygon(g.outline))<0,"aligned outline direction");
                near(g.cavity.start[0],0.5,0.015);
                const poly=polygon(g.cavity,64), vertices=[g.cavity.start,...g.cavity.curves.map(c=>c[2])];
                assert.ok(vertices.some(p=>Math.abs(p[0]-Math.min(...poly.map(p=>p[0])))<0.0001),"left corner landmark retained");
                assert.ok(vertices.some(p=>Math.abs(p[0]-Math.max(...poly.map(p=>p[0])))<0.0001),"right corner landmark retained");
                if(target!=="thinking" || g===a) assert.ok(area(polygon(g.tongue))>0,"tongue direction aligned");
            }
            sameCurve(MOUTH_PRESETS.IDLE.cavity,a.cavity,a);
            sameCurve(endpoint.cavity,b.cavity,b);
            sameCurve(MOUTH_PRESETS.IDLE.cavity,a.outline,a);
            sameCurve(endpoint.outline,b.outline,b);
            if(endpoint.tongue) {sameCurve(MOUTH_PRESETS.IDLE.tongue,a.tongue,a);sameCurve(endpoint.tongue,b.tongue,b);}
        }
        assert.strictEqual(sample(target,0),MOUTH_PRESETS.IDLE);
        assert.strictEqual(sample(target,1),endpoint);
        for(let i=0;i<=100;i++) {
            const t=i/100,g=sample(target,t); validate(g);
            assert.deepEqual(sample(target,t),g,"determinism");
            const d=paths(g);
            for(const key of ["cavity","outline","tongue"]) if(d[key]!==null) {assert.match(d[key],/^M[-+0-9.eE C]+Z$/);assert.ok(!/NaN|Infinity|undefined/.test(d[key]));}
            for(const c of [g.cavity,g.outline,g.tongue].filter(Boolean)) {assert.ok(points(c).flat().every(Number.isFinite));simple(polygon(c));}
            if(g.tongue) {
                const absolute=c=>polygon(c).map(([x,y])=>[x*g.width,y*g.height]);
                const cavity=absolute(g.cavity), outline=absolute(g.outline??g.cavity), tongue=absolute(g.tongue);
                const contained=tongue.every(p=>inside(p,cavity)||outline.some((a,j)=>distance(p,a,outline[(j+1)%outline.length])<=g.strokeWidth/2+0.08));
                if(!contained) {
                    assert.equal(g.clipTongue,true,target+" protruding intermediate tongue must be clipped at "+t);
                    const markup=render(ProceduralMouth,{geometry:g});
                    assert.ok(markup.includes('<clipPath'));assert.ok(markup.includes('clip-path="url(#'));
                    assert.ok(markup.includes('clipPathUnits="userSpaceOnUse"'));
                }
                if(target!=="thinking") assert.ok(tongue.some(p=>inside(p,cavity)),"tongue remains connected to cavity interior");
            }
            const pos=layout(presets.idle.layout,presets[target].layout,t);
            near(pos.width,g.width);near(pos.height,g.height);
            for(const key of ["x","y","width","height"]) near(pos[key],presets.idle.layout[key]*(1-t)+presets[target].layout[key]*t);
            if(target==="happy") assert.deepEqual(g,morph(MOUTH_PRESETS.IDLE,MOUTH_PRESETS.HAPPY,t),"original Happy algorithm unchanged");
            if(target==="thinking" && i>0 && i<100) near(g.tongueOpacity,1-t);
            if(i>0&&i<100) {
                for(const key of ["cavity","outline","tongue"]) {
                    const aa=key==="outline"?(a.outline??a.cavity):a[key],bb=key==="outline"?(b.outline??b.cavity):b[key],cc=key==="outline"?(g.outline??g.cavity):g[key];
                    points(cc).forEach((p,j)=>p.forEach((n,axis)=>near(n,points(aa)[j][axis]*(1-t)+points(bb)[j][axis]*t)));
                }
            }
        }
        console.log("PASS transition: idle → "+target+"; 101 validated samples with sampled simple contours; prepared "+a.cavity.curves.length+"/"+a.tongue.curves.length+" segments");
    }
    assert.strictEqual(sample("thinking",-1),MOUTH_PRESETS.IDLE);assert.strictEqual(sample("thinking",2),MOUTH_PRESETS.THINKING);
    for(const t of [NaN,Infinity,"0.5",undefined]) assert.throws(()=>sample("sad",t));
    assert.throws(()=>sample("shy",0.5));assert.throws(()=>sample("happier-transition",0.5));
    assert.throws(()=>validate({...MOUTH_PRESETS.SAD,outline:{...MOUTH_PRESETS.SAD.outline,curves:[]}}));
    for(const opacity of [-1,2,NaN,Infinity]) assert.throws(()=>validate({...MOUTH_PRESETS.IDLE,tongueOpacity:opacity}));
    assert.throws(()=>alignContours(MOUTH_PRESETS.IDLE.cavity,MOUTH_PRESETS.IDLE.cavity,{anchors:[0,2,1,3]},{anchors:[0,1,2,3]}));
    assert.equal(JSON.stringify(presets),snapshot,"presets/layout inputs unchanged");
    const before=useFaceStore.getState(), comparison=render(Comparison);assert.strictEqual(useFaceStore.getState(),before);
    for(const target of MOUTH_TARGETS) assert.ok(comparison.includes('value="'+target+'"'),"selector target "+target);
    console.log("PASS: all source endpoints and outlines, normalization, analytic De Casteljau, reversal, explicit corner/direction correspondence, bounded topology, tongue collapse/visibility, all intermediate controls/layouts, source curve preservation, invalid data and isolated preview. Visual parity requires actual visual review.");
} finally {await server.close();}
