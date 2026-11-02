import { EYE_EXPRESSION_PRESETS } from "./presets";
import { validateEyeGeometry } from "./pathGenerator";
import { validateLayeredEye } from "./layerGenerator";
import type { EyeCommand, EyeConfiguration, EyeContour, EyeCurve, EyeEllipse, EyePoint, EyeSvgNode, LayeredEyeGeometry } from "./types";
import type { LayerPosition } from "../../config/faceLayerLayouts";

type Side = "left" | "right";
export function eyeProgress(value: number): number {
    if (!Number.isFinite(value)) throw new RangeError("Eye progress must be finite");
    return Math.max(0, Math.min(1, value));
}
const mix = (a: number, b: number, t: number) => (1 - t) * a + t * b;
const point = (a: EyePoint, b: EyePoint, t: number): EyePoint => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
function finitePoint(p: EyePoint) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
        throw new RangeError("Eye control point must be a finite pair");
}
/** Exact De Casteljau subdivision, without changing a source curve. */
export function splitEyeCubic(p: EyePoint, c: EyeCurve, t: number): readonly [EyeCurve, EyeCurve] {
    finitePoint(p);
    if (!Array.isArray(c) || c.length !== 3 || !Number.isFinite(t) || t <= 0 || t >= 1)
        throw new RangeError("Invalid eye subdivision");
    for (let i = 0; i < 3; i++) finitePoint(c[i]);
    const a = point(p, c[0], t), b = point(c[0], c[1], t), d = point(c[1], c[2], t);
    const e = point(a, b, t), f = point(b, d, t), q = point(e, f, t);
    return [[a, e, q], [f, d, c[2]]];
}
/** Eight 45-degree tangent-matched cubics. Endpoints still use the exact source ellipse. */
export function ellipseEyeContour(ellipse: EyeEllipse): EyeContour {
    if (!ellipse) throw new RangeError("Missing eye ellipse");
    finitePoint(ellipse.center); finitePoint(ellipse.radius);
    if (ellipse.radius.some((r) => r <= 0)) throw new RangeError("Eye ellipse radii must be positive");
    const [cx, cy] = ellipse.center, [rx, ry] = ellipse.radius;
    const unit = (i: number): EyePoint => {
        // Pin cardinal points exactly, avoiding trigonometric closure noise.
        const a = i % 8;
        if (a % 2 === 0) return ([[0, -1], [1, 0], [0, 1], [-1, 0]] as const)[a / 2];
        const angle = -Math.PI / 2 + a * Math.PI / 4;
        return [Math.cos(angle), Math.sin(angle)];
    };
    const k = 4 / 3 * Math.tan(Math.PI / 16);
    const project = ([x, y]: EyePoint): EyePoint => [cx + rx * x, cy + ry * y];
    return { start: project(unit(0)), curves: Array.from({ length: 8 }, (_, i): EyeCurve => {
        const a = unit(i), b = unit(i + 1);
        return [project([a[0] - k * a[1], a[1] + k * a[0]]),
            project([b[0] + k * b[1], b[1] - k * b[0]]), project(b)];
    }) };
}
function contour(commands: readonly EyeCommand[]): EyeContour {
    const first = commands[0];
    if (first[0] !== "M") throw new RangeError("Expected eye move command");
    return { start: [first[1], first[2]], curves: commands.slice(1, -1).map((c): EyeCurve => {
        if (c[0] !== "C") throw new RangeError("Only inspected cubic eye contours can be paired");
        return [[c[1], c[2]], [c[3], c[4]], [c[5], c[6]]];
    }) };
}
function commands(c: EyeContour): readonly EyeCommand[] {
    return [["M", ...c.start], ...c.curves.map(([a, b, end]): EyeCommand => ["C", ...a, ...b, ...end]), ["Z"]];
}
function interpolateContour(a: EyeContour, b: EyeContour, t: number): EyeContour {
    if (a.curves.length !== b.curves.length) throw new RangeError("Incompatible prepared eye contours");
    return { start: point(a.start, b.start, t), curves: a.curves.map((c, i): EyeCurve =>
        [point(c[0], b.curves[i][0], t), point(c[1], b.curves[i][1], t), point(c[2], b.curves[i][2], t)]) };
}
function freeze<T>(value: T): T {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}
const prepared: Partial<Record<Side, ReturnType<typeof prepare>>> = {};
function prepare(side: Side) {
    const idle = EYE_EXPRESSION_PRESETS.idle[side], happier = EYE_EXPRESSION_PRESETS.happier[side];
    const body = happier.layers[0];
    const small = happier.layers.find((n) => n.tag === "ellipse");
    const highlight = happier.layers.find((n) => n.tag === "path" && n.attributes.fill === "white");
    const defs = happier.layers.find((n) => n.tag === "defs");
    const gradient = defs?.children.find((n) => n.tag === "linearGradient");
    if (body.tag !== "path" || !small || highlight?.tag !== "path" || !gradient || !idle.highlights.contour)
        throw new RangeError("Missing inspected Idle/Happier eye features");
    const target = contour(body.commands);
    // Top -> right -> bottom -> left, positive signed area in SVG coordinates.
    // Split upper-right arch, lower bridge and upper-left arch at their inspected midpoints.
    // The lower bridge split is its true bottom y-extremum; shoulders remain source vertices.
    const curves = target.curves.flatMap((c, i) => [0, 2, 4].includes(i)
        ? splitEyeCubic(i === 0 ? target.start : target.curves[i - 1][2], c, 0.5) : [c]);
    // The eight highlight pieces retain the same source semantics: upper outer
    // arc, notch approach/entry/inner arc/exit, lower outer arc, and left arcs.
    // Both inspected highlight nets are the same shape translated by (-2,-2).
    return freeze({ sourceBody: ellipseEyeContour(idle.body), sourceOutline: idle.outline,
        targetBody: { start: target.start, curves }, sourceHighlight: idle.highlights.contour,
        targetHighlight: contour(highlight.commands), small: small.attributes, gradient: gradient.attributes,
        // Cardinal landmarks in every prepared body/outline: starts of segments 0,2,4,6.
        cardinalIndices: [0, 2, 4, 6] as const });
}
export function prepareIdleHappierEye(side: Side) {
    if (side !== "left" && side !== "right") throw new RangeError("Invalid eye side");
    return prepared[side] ??= prepare(side);
}
function sameSource(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const aa = a as Record<string, unknown>, bb = b as Record<string, unknown>;
    const keys = Object.keys(aa);
    return keys.length === Object.keys(bb).length && keys.every((k) => Object.hasOwn(bb, k) && sameSource(aa[k], bb[k]));
}

/** Only inspected same-side canonical pairs; never infer correspondence from topology. */
export function interpolateEyeGeometry(from: EyeConfiguration, to: EyeConfiguration, progress: number): EyeConfiguration {
    const t = eyeProgress(progress);
    validateEyeGeometry(from); validateEyeGeometry(to);
    if (from.side !== to.side) throw new RangeError("Eye sides must match");
    const side = from.side, idle = EYE_EXPRESSION_PRESETS.idle[side], happier = EYE_EXPRESSION_PRESETS.happier[side];
    const thinking = EYE_EXPRESSION_PRESETS.thinking[side];
    const thinkingForward = sameSource(from,idle) && sameSource(to,thinking);
    const thinkingReverse = sameSource(from,thinking) && sameSource(to,idle);
    if(thinkingForward || thinkingReverse){
        if(t===0)return from;
        if(t===1)return to;
        return interpolateThinkingEye(side,thinkingForward?t:1-t);
    }
    const sad = EYE_EXPRESSION_PRESETS.sad[side];
    const cry = EYE_EXPRESSION_PRESETS.cry[side];
    for (const source of ["idle", "sad"] as const) {
        const start = EYE_EXPRESSION_PRESETS[source][side];
        const forward = sameSource(from, start) && sameSource(to, cry);
        const reverse = sameSource(from, cry) && sameSource(to, start);
        if (forward || reverse) {
            if (t === 0) return from;
            if (t === 1) return to;
            return interpolateCryEye(side, source, forward ? t : 1 - t);
        }
    }
    const sadForward = sameSource(from, idle) && sameSource(to, sad);
    const sadReverse = sameSource(from, sad) && sameSource(to, idle);
    if (sadForward || sadReverse) {
        if (t === 0) return from;
        if (t === 1) return to;
        return interpolateSadEye(side, sadForward ? t : 1 - t);
    }
    const forward = sameSource(from, idle) && sameSource(to, happier);
    const reverse = sameSource(from, happier) && sameSource(to, idle);
    if (!forward && !reverse) throw new RangeError("No approved correspondence for these source eyes");
    if (t === 0) return from;
    if (t === 1) return to;
    const p = forward ? t : 1 - t, m = prepareIdleHappierEye(side);
    const body = interpolateContour(m.sourceBody, m.targetBody, p);
    const outline = interpolateContour(m.sourceOutline, m.targetBody, p);
    const highlight = interpolateContour(m.sourceHighlight, m.targetHighlight, p);
    const g = idle.gradient, target = m.gradient, small = idle.highlights.ellipse!;
    const result: LayeredEyeGeometry = { kind: "layered", side,
        width: mix(idle.width, happier.width, p), height: mix(idle.height, happier.height, p), layers: [
            { tag: "g", attributes: { filter: { ref: "morphShadow" } }, children: [
                { tag: "path", attributes: { fill: { ref: "morphGradient" } }, commands: commands(body), children: [] } ] },
            { tag: "path", attributes: { stroke: idle.stroke, strokeWidth: idle.strokeWidth }, commands: commands(outline), children: [] },
            { tag: "ellipse", attributes: { cx: mix(small.center[0], m.small.cx, p), cy: mix(small.center[1], m.small.cy, p),
                rx: small.radius[0], ry: small.radius[1], fill: "white", opacity: idle.highlights.opacity }, children: [] },
            { tag: "path", attributes: { fill: "white", opacity: idle.highlights.opacity }, commands: commands(highlight), children: [] },
            { tag: "defs", attributes: {}, children: [
                { tag: "linearGradient", attributes: { id: "morphGradient", x1: mix(g.start[0], target.x1, p),
                    y1: mix(g.start[1], target.y1, p), x2: mix(g.end[0], target.x2, p), y2: mix(g.end[1], target.y2, p), gradientUnits: "userSpaceOnUse" },
                    children: g.stops.map((s) => ({ tag: "stop", attributes: { offset: s.offset, stopColor: s.color as `#${string}` }, children: [] })) },
                // A fixed source pipeline. Only shadow strength resolves its disappearance;
                // blur, offset, region, compositing and matrices' other entries never morph.
                { tag: "filter", attributes: { id: "morphShadow", x: idle.shadow.region[0], y: idle.shadow.region[1],
                    width: idle.shadow.region[2], height: idle.shadow.region[3], filterUnits: "userSpaceOnUse", colorInterpolationFilters: "sRGB" }, children: [
                    { tag: "feFlood", attributes: { floodOpacity: 0, result: "background" }, children: [] },
                    { tag: "feBlend", attributes: { mode: "normal", in: "SourceGraphic", in2: "background", result: "shape" }, children: [] },
                    { tag: "feColorMatrix", attributes: { in: "SourceAlpha", type: "matrix", values: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,127,0], result: "hardAlpha" }, children: [] },
                    { tag: "feOffset", attributes: { dy: idle.shadow.offsetY }, children: [] },
                    { tag: "feGaussianBlur", attributes: { stdDeviation: idle.shadow.blur }, children: [] },
                    { tag: "feComposite", attributes: { in2: "hardAlpha", operator: "arithmetic", k2: -1, k3: 1 }, children: [] },
                    { tag: "feColorMatrix", attributes: { type: "matrix", values: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,idle.shadow.opacity * (1-p),0] }, children: [] },
                    { tag: "feBlend", attributes: { mode: "normal", in2: "shape", result: "shadow" }, children: [] },
                ] },
            ] },
        ] };
    validateLayeredEye(result);
    return result;
}

// Sad correspondence: upper-edge midpoint -> upper-right corner -> lower
// y-extremum -> upper-left corner. This is an eyelid mapping, not cardinal
// extrema matching: Sad's left/right x-extrema occur near its upper corners.
type Anchors = readonly [number, number, number, number];
function cubicContour(input: readonly EyeCommand[]): EyeContour {
    const first = input[0];
    if (first[0] !== "M") throw new RangeError("Missing source eye move");
    const start: EyePoint = [first[1], first[2]], curves: EyeCurve[] = [];
    let previous = start;
    for (const c of input.slice(1, -1)) {
        const curve: EyeCurve = c[0] === "C" ? [[c[1], c[2]], [c[3], c[4]], [c[5], c[6]]] :
            c[0] === "L" ? [point(previous, [c[1], c[2]], 1/3), point(previous, [c[1], c[2]], 2/3), [c[1], c[2]]] :
                (() => { throw new RangeError("Unsupported Sad source command"); })();
        curves.push(curve); previous = curve[2];
    }
    return { start, curves };
}
function reverseEyeContour(c: EyeContour): EyeContour {
    const starts = [c.start, ...c.curves.slice(0,-1).map((curve) => curve[2])];
    return { start: c.start, curves: c.curves.map(([a,b],i): EyeCurve => [b,a,starts[i]]).reverse() };
}
/** Exact y-extremum of the explicitly selected lower source cubic. */
function lowerExtremum(c: EyeContour, index: number): number {
    const p = index === 0 ? c.start[1] : c.curves[index-1][2][1];
    const [a,b,q] = c.curves[index].map((v) => v[1]);
    const A=-p+3*a-3*b+q, B=2*(p-2*a+b), C=a-p;
    const roots = Math.abs(A)<1e-12 ? Math.abs(B)<1e-12 ? [] : [-C/B] :
        B*B-4*A*C<0 ? [] : [(-B+Math.sqrt(B*B-4*A*C))/(2*A),(-B-Math.sqrt(B*B-4*A*C))/(2*A)];
    const y=(t:number)=>(1-t)**3*p+3*(1-t)**2*t*a+3*(1-t)*t*t*b+t**3*q;
    const candidates=[0,...roots.filter((t)=>t>0&&t<1),1];
    return index+candidates.reduce((best,t)=>y(t)>y(best)?t:best,0);
}
function sliceEyeCurve(start: EyePoint, curve: EyeCurve, a: number, b: number) {
    const prefix = b < 1 ? splitEyeCubic(start,curve,b)[0] : curve;
    if (a === 0) return { start, curve: prefix };
    const [left,right] = splitEyeCubic(start,prefix,a/b);
    return { start: left[2], curve: right };
}
function eyeArcLength(p: EyePoint, [a,b,q]: EyeCurve, end=1): number {
    const speed=(t:number)=>Math.hypot(...[0,1].map((k)=>3*(1-t)**2*(a[k]-p[k])+6*(1-t)*t*(b[k]-a[k])+3*t*t*(q[k]-b[k])));
    const h=end/64; let sum=speed(0)+speed(end);
    for(let i=1;i<64;i++) sum+=(i%2?4:2)*speed(i*h);
    return sum*h/3;
}
interface EyeSpan { readonly start: EyePoint; readonly curve: EyeCurve; readonly a: number; readonly b: number }
function eyeSectors(original: EyeContour, anchors: Anchors, reverse: boolean) {
    const c=reverse?reverseEyeContour(original):original, n=c.curves.length;
    const positions=anchors.map((v)=>reverse?(n-v)%n:v);
    let traversal=0;
    const sectors=positions.map((begin,i)=>{
        let end=positions[(i+1)%4]; if(end<=begin)end+=n;
        traversal+=end-begin;
        const spans: EyeSpan[]=[];
        for(let position=begin;position<end-1e-12;){
            const integer=Math.floor(position), index=integer%n, stop=Math.min(integer+1,end);
            spans.push({start:index===0?c.start:c.curves[index-1][2],curve:c.curves[index],a:position-integer,b:stop-integer});
            position=stop;
        }
        return spans;
    });
    if(Math.abs(traversal-n)>1e-9)throw new RangeError("Sad landmarks must traverse the source exactly once");
    return sectors;
}
/** Union of semantic-sector arc-distance knots; all pieces remain exact subdivisions. */
function alignSadContours(source: EyeContour, target: EyeContour, targetAnchors: Anchors, reverse=false,
    sourceAnchors: Anchors=[0,1,4,7], sourceReverse=false) {
    const ss=eyeSectors(source,sourceAnchors,sourceReverse), tt=eyeSectors(target,targetAnchors,reverse);
    const from: EyeCurve[]=[],to: EyeCurve[]=[],fromSpans: EyeSpan[]=[],toSpans: EyeSpan[]=[],landmarkIndices:number[]=[];
    const metric=(spans:readonly EyeSpan[])=>{
        const parts=spans.map((s)=>sliceEyeCurve(s.start,s.curve,s.a,s.b));
        const lengths=parts.map((s)=>eyeArcLength(s.start,s.curve)), cumulative=[0];
        if(lengths.some((n)=>n<=1e-12))throw new RangeError("Degenerate Sad landmark sector");
        lengths.forEach((n)=>cumulative.push(cumulative.at(-1)!+n));
        const total=cumulative.at(-1)!;
        return{parts,lengths,cumulative,total,knots:cumulative.map((n)=>n/total)};
    };
    const refine=(spans:readonly EyeSpan[],m:ReturnType<typeof metric>,knots:readonly number[])=>knots.slice(0,-1).map((begin,i)=>{
        const end=knots[i+1],middle=(begin+end)/2*m.total;
        const index=m.lengths.findIndex((_,j)=>middle>=m.cumulative[j]&&middle<m.cumulative[j+1]);
        const parameter=(fraction:number)=>{
            const distance=fraction*m.total-m.cumulative[index];
            if(distance<=1e-11)return 0;
            if(distance>=m.lengths[index]-1e-11)return 1;
            let low=0,high=1;
            for(let j=0;j<36;j++){const t=(low+high)/2;if(eyeArcLength(m.parts[index].start,m.parts[index].curve,t)<distance)low=t;else high=t;}
            return(low+high)/2;
        };
        const s=spans[index];
        return{...s,a:s.a+(s.b-s.a)*parameter(begin),b:s.a+(s.b-s.a)*parameter(end)};
    });
    for(let i=0;i<4;i++){
        landmarkIndices.push(from.length);
        const sm=metric(ss[i]),tm=metric(tt[i]);
        const knots=[...new Set([...sm.knots,...tm.knots])].sort((a,b)=>a-b).filter((n,i,all)=>i===0||n-all[i-1]>1e-10);
        const a=refine(ss[i],sm,knots),b=refine(tt[i],tm,knots);
        fromSpans.push(...a);toSpans.push(...b);
        from.push(...a.map((s)=>sliceEyeCurve(s.start,s.curve,s.a,s.b).curve));
        to.push(...b.map((s)=>sliceEyeCurve(s.start,s.curve,s.a,s.b).curve));
    }
    const start=(s:EyeSpan)=>sliceEyeCurve(s.start,s.curve,s.a,s.b).start;
    return {from:{start:start(fromSpans[0]),curves:from},to:{start:start(toSpans[0]),curves:to},
        fromSpans,toSpans,landmarkIndices,targetAnchors,reverse};
}
const sadPrepared: Partial<Record<Side,ReturnType<typeof prepareSad>>>={};
function prepareSad(side:Side, expression: "sad" | "cry" = "sad"){
    const idle=EYE_EXPRESSION_PRESETS.idle[side],sad:LayeredEyeGeometry=EYE_EXPRESSION_PRESETS[expression][side];
    const [group,outline,small,highlight]=sad.layers,extra=sad.layers[expression==="cry"?5:4];
    if(group.tag!=="g"||group.children[0].tag!=="path"||outline.tag!=="path"||small.tag!=="ellipse"||highlight.tag!=="path"||extra.tag!=="g")
        throw new RangeError("Missing Sad eye features");
    const [mask,stroke]=extra.children;
    if(mask.tag!=="mask"||mask.children[1].tag!=="path"||stroke.tag!=="path")throw new RangeError("Missing Sad outline mask");
    const body=cubicContour(group.children[0].commands),outer=cubicContour(outline.commands),
        masking=cubicContour(mask.children[1].commands),supplement=cubicContour(stroke.commands);
    const bodyAnchors=(c:EyeContour):Anchors=>side==="left"?[1.5,2.5,lowerExtremum(c,4),0.5]:[1.5,0.5,lowerExtremum(c,4),2.5];
    const outerAnchors:Anchors=side==="left"?[11.5,0.5,lowerExtremum(outer,5),10.5]:[11.5,10.5,lowerExtremum(outer,5),0.5];
    const extraAnchors:Anchors=side==="left"?[2.5,1.5,lowerExtremum(supplement,5),3.5]:[2.5,3.5,lowerExtremum(supplement,5),1.5];
    const sourceBody=ellipseEyeContour(idle.body);
    const pairs={body:alignSadContours(sourceBody,body,bodyAnchors(body),side==="right"),
        outline:alignSadContours(idle.outline,outer,outerAnchors,side==="right"),
        mask:alignSadContours(sourceBody,masking,bodyAnchors(masking),side==="right"),
        supplement:alignSadContours(sourceBody,supplement,extraAnchors,side==="left")};
    // Attach at the lower body edge directly above the source lower-circle
    // center, not merely at the global bottom (which differs on each side).
    // Sad's attachment lies on the shared Sad/Cry body and inside the Cry water.
    const detail=EYE_EXPRESSION_PRESETS.sad[side].layers[7];
    if(detail.tag!=="path"||detail.commands[1][0]!=="C")throw new RangeError("Missing Sad lower detail");
    const attachmentX=detail.commands[1][5],lowerStart=body.curves[3][2],lowerCurve=body.curves[4];
    const evaluate=(p:EyePoint,[a,b,q]:EyeCurve,t:number):EyePoint=>{
        const axis=(k:0|1)=>(1-t)**3*p[k]+3*(1-t)**2*t*a[k]+3*(1-t)*t*t*b[k]+t**3*q[k];
        return[axis(0),axis(1)];
    };
    let low=0,high=1;
    const ascending=lowerCurve[2][0]>lowerStart[0];
    for(let i=0;i<48;i++){const t=(low+high)/2;if((evaluate(lowerStart,lowerCurve,t)[0]<attachmentX)===ascending)low=t;else high=t;}
    const nativeT=(low+high)/2,canonicalT=side==="right"?1-nativeT:nativeT;
    const samePoint=(a:EyePoint,b:EyePoint)=>a[0]===b[0]&&a[1]===b[1];
    const attachmentSpanIndex=pairs.body.toSpans.findIndex((s)=>samePoint(s.start,side==="right"?lowerCurve[2]:lowerStart)&&
        samePoint(s.curve[2],side==="right"?lowerStart:lowerCurve[2])&&canonicalT>=s.a&&canonicalT<=s.b);
    if(attachmentSpanIndex<0)throw new RangeError("Sad lower attachment outside prepared contour");
    const span=pairs.body.toSpans[attachmentSpanIndex],attachmentParameter=(canonicalT-span.a)/(span.b-span.a);
    const at=(c:EyeContour)=>evaluate(attachmentSpanIndex===0?c.start:c.curves[attachmentSpanIndex-1][2],c.curves[attachmentSpanIndex],attachmentParameter);
    return freeze({pairs,small:small.attributes,highlight:contour(highlight.commands),
        sourceAttachment:at(pairs.body.from),targetAttachment:at(pairs.body.to),attachmentSpanIndex,attachmentParameter,
        native:{body,outline:outer,mask:masking,supplement}});
}
export function prepareIdleSadEye(side:Side){
    if(side!=="left"&&side!=="right")throw new RangeError("Invalid Sad eye side");
    return sadPrepared[side]??=prepareSad(side);
}
function interpolateSadEye(side:Side,p:number):LayeredEyeGeometry{
    const idle=EYE_EXPRESSION_PRESETS.idle[side],sad=EYE_EXPRESSION_PRESETS.sad[side],m=prepareIdleSadEye(side);
    const path=(key:keyof typeof m.pairs)=>commands(interpolateContour(m.pairs[key].from,m.pairs[key].to,p));
    const body=path("body"),outline=path("outline"),maskPath=path("mask"),extraPath=path("supplement");
    const alpha=p*p*(3-2*p),attachment=point(m.sourceAttachment,m.targetAttachment,p);
    // Fixed safe working bounds; source filter primitives never interpolate.
    const region={x:-16,y:-16,width:180,height:205};
    const defs:EyeSvgNode={tag:"defs",attributes:{},children:sad.layers[9].children.map((n):EyeSvgNode=>{
        if(n.tag==="filter")return{...n,attributes:{...n.attributes,...region}};
        if(n.tag==="linearGradient")return{...n,attributes:{...n.attributes,
            x1:mix(idle.gradient.start[0],n.attributes.x1,p),y1:mix(idle.gradient.start[1],n.attributes.y1,p),
            x2:mix(idle.gradient.end[0],n.attributes.x2,p),y2:mix(idle.gradient.end[1],n.attributes.y2,p)}};
        return n;
    })};
    const first=sad.layers[0],outer=sad.layers[1],small=sad.layers[2],highlight=sad.layers[3],extra=sad.layers[4];
    if(first.tag!=="g"||first.children[0].tag!=="path"||outer.tag!=="path"||small.tag!=="ellipse"||highlight.tag!=="path"||extra.tag!=="g")
        throw new RangeError("Unexpected Sad rendering structure");
    const result:LayeredEyeGeometry={kind:"layered",side,width:mix(idle.width,sad.width,p),height:mix(idle.height,sad.height,p),layers:[
        {...first,children:[{...first.children[0],commands:body}]},
        {...outer,commands:outline},
        {...small,attributes:{...small.attributes,cx:mix(idle.highlights.ellipse!.center[0],small.attributes.cx,p),
            cy:mix(idle.highlights.ellipse!.center[1],small.attributes.cy,p)}},
        {...highlight,commands:commands(interpolateContour(idle.highlights.contour!,m.highlight,p))},
        {...extra,attributes:{...extra.attributes,opacity:alpha},children:extra.children.map((n):EyeSvgNode=>{
            if(n.tag==="path")return{...n,commands:extraPath};
            if(n.tag==="mask")return{...n,attributes:{...n.attributes,...region},children:n.children.map((child):EyeSvgNode=>
                child.tag==="rect"?{...child,attributes:{...child.attributes,...region}}:
                child.tag==="path"?{...child,commands:maskPath}:child)};
            return n;
        })},
        // Existing lower-detail paths, use/mask refs and matrix/rotation remain
        // unmodified inside a localized, uniformly growing attachment group.
        {tag:"g",attributes:{opacity:alpha,transform:{kind:"matrix",values:[p,0,0,p,
            attachment[0]-p*m.targetAttachment[0],attachment[1]-p*m.targetAttachment[1]]}},children:sad.layers.slice(5,9)},
        defs,
    ]};
    validateLayeredEye(result);return result;
}
const cryPrepared: Partial<Record<Side, ReturnType<typeof prepareCry>>> = {};
function prepareCry(side: Side) {
    const idle = prepareSad(side, "cry"), sad = prepareIdleSadEye(side);
    // Same inspected semantic sectors, independently subdivided for the subtle
    // Cry-right mask/stroke rounding differences. No Sad detail becomes water.
    const pairs = Object.fromEntries((Object.keys(idle.pairs) as (keyof typeof idle.pairs)[]).map(key => {
        const target = idle.pairs[key], source = sad.pairs[key];
        return [key, alignSadContours(sad.native[key], idle.native[key], target.targetAnchors,
            target.reverse, source.targetAnchors, source.reverse)];
    })) as typeof idle.pairs;
    // The Sad/Cry preparation has different subdivisions from Idle/Cry; map
    // the native attachment parameter into its own span rather than reusing
    // an Idle prepared-array index.
    const original = idle.pairs.body.toSpans[idle.attachmentSpanIndex];
    const nativeT = original.a + (original.b-original.a)*idle.attachmentParameter;
    const attachmentSpanIndex = pairs.body.toSpans.findIndex(s => sameSource(s.start,original.start) &&
        sameSource(s.curve,original.curve) && nativeT>=s.a && nativeT<=s.b);
    if(attachmentSpanIndex<0)throw new RangeError("Missing Sad/Cry attachment span");
    const span=pairs.body.toSpans[attachmentSpanIndex];
    return freeze({ idle, sad: { ...idle, pairs, sourceAttachment:sad.targetAttachment,
        attachmentSpanIndex,attachmentParameter:(nativeT-span.a)/(span.b-span.a) }, sadAttachment: sad.targetAttachment });
}
export function prepareCryEye(side: Side) {
    if (side !== "left" && side !== "right") throw new RangeError("Invalid Cry eye side");
    return cryPrepared[side] ??= prepareCry(side);
}
function interpolateCryEye(side: Side, source: "idle" | "sad", p: number): LayeredEyeGeometry {
    const cry = EYE_EXPRESSION_PRESETS.cry[side], sad = EYE_EXPRESSION_PRESETS.sad[side];
    const start = EYE_EXPRESSION_PRESETS[source][side], prepared = prepareCryEye(side), m = prepared[source];
    const path = (key: keyof typeof m.pairs) => commands(interpolateContour(m.pairs[key].from, m.pairs[key].to, p));
    const alpha = p*p*(3-2*p), region = { x:-16, y:-16, width:180, height:205 };
    const attachment = point(m.sourceAttachment,m.targetAttachment,p);
    const attached = (nodes: readonly EyeSvgNode[], scale: number, opacity: number, anchor: EyePoint): EyeSvgNode => ({
        tag:"g", attributes:{opacity,transform:{kind:"matrix",values:[scale,0,0,scale,
            attachment[0]-scale*anchor[0],attachment[1]-scale*anchor[1]]}}, children:nodes,
    });
    const [first,outer,small,highlight,water,extra] = cry.layers;
    if(first.tag!=="g"||first.children[0].tag!=="path"||outer.tag!=="path"||small.tag!=="ellipse"||highlight.tag!=="path"||water.tag!=="path"||extra.tag!=="g")
        throw new RangeError("Missing inspected Cry eye features");
    const sourceSmall = source === "idle" ? EYE_EXPRESSION_PRESETS.idle[side].highlights.ellipse!.center :
        [small.attributes.cx,small.attributes.cy] as const;
    const sourceHighlight = source === "idle" ? EYE_EXPRESSION_PRESETS.idle[side].highlights.contour! : m.highlight;
    const defs = cry.layers.at(-1)!;
    const gradient = source === "idle" ? EYE_EXPRESSION_PRESETS.idle[side].gradient : null;
    const result: LayeredEyeGeometry = { kind:"layered", side, width:mix(start.width,cry.width,p),height:mix(start.height,cry.height,p),layers:[
        {...first,children:[{...first.children[0],commands:path("body")}]},
        {...outer,commands:path("outline")},
        {...small,attributes:{...small.attributes,cx:mix(sourceSmall[0],small.attributes.cx,p),cy:mix(sourceSmall[1],small.attributes.cy,p)}},
        {...highlight,commands:commands(interpolateContour(sourceHighlight,m.highlight,p))},
        // Procedural collapsed start, not an invented source tear. Native water
        // controls/colors remain intact, growing uniformly about the body edge.
        attached([water],p,alpha,m.targetAttachment),
        {...extra,attributes:{...extra.attributes,opacity:source==="idle"?alpha:1},children:extra.children.map((n):EyeSvgNode=>{
            if(n.tag==="path")return{...n,commands:path("supplement")};
            if(n.tag==="mask")return{...n,attributes:{...n.attributes,...region},children:n.children.map((c):EyeSvgNode=>
                c.tag==="rect"?{...c,attributes:{...c.attributes,...region}}:c.tag==="path"?{...c,commands:path("mask")}:c)};
            return n;
        })},
        // The unique right white ellipse and blur grow with the water. The
        // filter's primitives/region stay in its original local coordinates.
        ...(side==="right"?[attached([cry.layers[6]],p,alpha,m.targetAttachment)]:[]),
        ...(source==="sad"?[attached(sad.layers.slice(5,9),1-p,1-alpha,prepared.sadAttachment)]:[]),
        {...defs,children:[...defs.children.map((n,index):EyeSvgNode=>{
            // Only the first two (inner-shadow) filter regions need workspace;
            // the third, right-only foreground blur retains its native region.
            if(n.tag==="filter" && index<2)return{...n,attributes:{...n.attributes,...region}};
            if(n.tag==="linearGradient" && gradient)return{...n,attributes:{...n.attributes,
                x1:mix(gradient.start[0],n.attributes.x1,p),y1:mix(gradient.start[1],n.attributes.y1,p),
                x2:mix(gradient.end[0],n.attributes.x2,p),y2:mix(gradient.end[1],n.attributes.y2,p)}};
            return n;
        }),...(source==="sad"?sad.layers[9].children.filter(n=>n.tag==="path"):[])]},
    ]};
    validateLayeredEye(result); return result;
}
const thinkingPrepared: Partial<Record<Side, ReturnType<typeof prepareThinking>>> = {};
function prepareThinking(side: Side) {
    const idle=EYE_EXPRESSION_PRESETS.idle[side],target:LayeredEyeGeometry=EYE_EXPRESSION_PRESETS.thinking[side];
    const [group,outline,small,highlight]=target.layers;
    if(group.tag!=="g"||outline.tag!=="path"||small.tag!=="ellipse"||highlight.tag!=="path")
        throw new RangeError("Missing inspected Thinking features");
    // Eight inspected highlight features: upper arc, notch approach/entry,
    // inner arc/exit, lower arc, and the two outer-left arcs on both endpoints.
    const details={small:small.attributes,highlight:contour(highlight.commands)};
    if(side==="right"){
        const body=group.children[0];
        if(body.tag!=="ellipse")throw new RangeError("Missing Thinking-right ellipse");
        return freeze({side:"right" as const,...details,body:body.attributes,
            outline:{from:idle.outline,to:contour(outline.commands),landmarkIndices:[0,2,4,6] as const}});
    }
    const body=group.children[0],extra=target.layers[4];
    if(body.tag!=="path"||extra.tag!=="g")throw new RangeError("Missing Thinking-left contours");
    const [mask,stroke]=extra.children;
    if(mask.tag!=="mask"||mask.children[1].tag!=="path"||stroke.tag!=="path")throw new RangeError("Missing Thinking-left mask");
    const native={body:cubicContour(body.commands),outline:cubicContour(outline.commands),
        mask:cubicContour(mask.children[1].commands),supplement:cubicContour(stroke.commands)};
    const upper=(c:EyeContour):Anchors=>[1.5,2.5,lowerExtremum(c,4),.5];
    const sourceBody=ellipseEyeContour(idle.body);
    return freeze({side:"left" as const,...details,native,pairs:{
        body:alignSadContours(sourceBody,native.body,upper(native.body)),
        outline:alignSadContours(idle.outline,native.outline,[11.5,.5,lowerExtremum(native.outline,5),10.5]),
        mask:alignSadContours(sourceBody,native.mask,upper(native.mask)),
        supplement:alignSadContours(sourceBody,native.supplement,[2.5,1.5,lowerExtremum(native.supplement,5),3.5],true),
    }});
}
export function prepareIdleThinkingEye(side: Side) {
    if(side!=="left"&&side!=="right")throw new RangeError("Invalid Thinking eye side");
    return thinkingPrepared[side]??=prepareThinking(side);
}
function interpolateThinkingEye(side: Side,p: number): EyeConfiguration {
    const idle=EYE_EXPRESSION_PRESETS.idle[side],target=EYE_EXPRESSION_PRESETS.thinking[side],m=prepareIdleThinkingEye(side);
    const highlight=interpolateContour(idle.highlights.contour!,m.highlight,p),small=idle.highlights.ellipse!;
    if(m.side==="right"){
        // The original right body is the same ellipse as Idle. Keep it exact;
        // its independent source outline and highlight controls still pair.
        return {...idle,highlights:{...idle.highlights,
                ellipse:{center:point(small.center,[m.small.cx,m.small.cy],p),radius:small.radius},contour:highlight}};
    }
    const path=(key:keyof typeof m.pairs)=>commands(interpolateContour(m.pairs[key].from,m.pairs[key].to,p));
    const [first,outer,ellipse,notch,extra,defs]=target.layers;
    if(first.tag!=="g"||first.children[0].tag!=="path"||outer.tag!=="path"||ellipse.tag!=="ellipse"||notch.tag!=="path"||extra.tag!=="g"||defs?.tag!=="defs")
        throw new RangeError("Unexpected Thinking-left scene");
    // Fixed padded workspace for tall Idle; native regions return at endpoints.
    // Filter primitives never interpolate or change their source definitions.
    const region={x:-16,y:-16,width:180,height:205};
    const result:LayeredEyeGeometry={kind:"layered",side,width:mix(idle.width,target.width,p),height:mix(idle.height,target.height,p),layers:[
        {...first,children:[{...first.children[0],commands:path("body")}]},
        {...outer,commands:path("outline")},
        {...ellipse,attributes:{...ellipse.attributes,cx:mix(small.center[0],m.small.cx,p),cy:mix(small.center[1],m.small.cy,p)}},
        {...notch,commands:commands(highlight)},
        {...extra,attributes:{...extra.attributes,opacity:p*p*(3-2*p)},children:extra.children.map((n):EyeSvgNode=>{
            if(n.tag==="path")return{...n,commands:path("supplement")};
            if(n.tag==="mask")return{...n,attributes:{...n.attributes,...region},children:n.children.map((c):EyeSvgNode=>
                c.tag==="rect"?{...c,attributes:{...c.attributes,...region}}:c.tag==="path"?{...c,commands:path("mask")}:c)};
            return n;
        })},
        {...defs,children:defs.children.map((n):EyeSvgNode=>{
            if(n.tag==="filter")return{...n,attributes:{...n.attributes,...region}};
            if(n.tag==="linearGradient")return{...n,attributes:{...n.attributes,
                x1:mix(idle.gradient.start[0],n.attributes.x1,p),y1:mix(idle.gradient.start[1],n.attributes.y1,p),
                x2:mix(idle.gradient.end[0],n.attributes.x2,p),y2:mix(idle.gradient.end[1],n.attributes.y2,p)}};
            return n;
        })},
    ]};
    validateLayeredEye(result);return result;
}
export function interpolateEyeLayout(from: LayerPosition, to: LayerPosition, progress: number): LayerPosition {
    const t = eyeProgress(progress);
    for (const p of [from, to]) if (!p || ![p.x, p.y, p.width, p.height].every(Number.isFinite) || p.width <= 0 || p.height <= 0)
        throw new RangeError("Invalid eye layout");
    return { x: mix(from.x, to.x, t), y: mix(from.y, to.y, t), width: mix(from.width, to.width, t), height: mix(from.height, to.height, t) };
}
