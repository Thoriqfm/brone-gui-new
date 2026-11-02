import { EYE_EXPRESSION_PRESETS, type EyeExpression } from "../presets";
import { generateEyePath } from "../layerGenerator";
import { generateBlinkGeometry } from "./blinkGeometry";
import type { EyeCommand, EyePoint, LayeredEyeGeometry } from "../types";
import type { BlinkLid, ExpressionBlinkPreset } from "./types";

type Side = "left" | "right";
const prepared: Partial<Record<EyeExpression, Partial<Record<Side, ExpressionBlinkPreset>>>> = {};
function freeze<T>(value: T): T {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}
function lid(xs: readonly number[], ys: readonly number[]): BlinkLid {
    return {start:[xs[0],ys[0]],curve:[[xs[1],ys[1]],[xs[2],ys[2]],[xs[3],ys[3]]]};
}
function pointOnCubic(points: readonly EyePoint[], t: number): EyePoint {
    return [0,1].map(k => (1-t)**3*points[0][k]+3*(1-t)**2*t*points[1][k]+3*(1-t)*t*t*points[2][k]+t**3*points[3][k]) as unknown as EyePoint;
}
/** Analytic lower y extremum of an inspected native cubic; no contour fitting. */
function lowerLandmark(points: readonly EyePoint[]): EyePoint {
    const [p,a,b,q] = points.map(point => point[1]);
    const A = -p+3*a-3*b+q, B = 2*(p-2*a+b), C = a-p;
    const roots = Math.abs(A)<1e-12 ? (Math.abs(B)<1e-12 ? [] : [-C/B]) :
        B*B-4*A*C<0 ? [] : [(-B+Math.sqrt(B*B-4*A*C))/(2*A),(-B-Math.sqrt(B*B-4*A*C))/(2*A)];
    return [0,1,...roots.filter(t => t>0 && t<1)].map(t => pointOnCubic(points,t)).reduce((a,b) => a[1]>b[1]?a:b);
}
function cubic(commands: readonly EyeCommand[], index: number): readonly EyePoint[] {
    const start = commands[index-1], c = commands[index];
    if ((start[0] !== "M" && start[0] !== "C") || c[0] !== "C") throw new RangeError("Missing native blink landmark");
    return [start.slice(-2) as unknown as EyePoint,[c[1],c[2]],[c[3],c[4]],[c[5],c[6]]];
}

/** Source artwork, lid configuration and external face layout remain separate. */
export function prepareExpressionBlink(expression: EyeExpression, side: Side): ExpressionBlinkPreset {
    if (!["happier","sad","cry","thinking"].includes(expression) || (side!=="left" && side!=="right"))
        throw new RangeError("No layered blink configuration");
    const cached = prepared[expression]?.[side];
    if (cached) return cached;
    const source = EYE_EXPRESSION_PRESETS[expression][side] as LayeredEyeGeometry;
    const first = source.layers[0], outline = source.layers[1];
    let preset: ExpressionBlinkPreset;
    if (expression === "thinking" && side === "right") {
        // The actual right ellipse/outline matches Idle; its highlights do not.
        // Share only the proven silhouette motion, never the complete artwork.
        const reference = generateBlinkGeometry(EYE_EXPRESSION_PRESETS.idle.right,1);
        if (!("kind" in reference) || first.tag!=="g" || first.children[0]?.tag!=="ellipse" || outline.tag!=="path")
            throw new RangeError("Missing Thinking-right ellipse");
        const body = first.children[0].attributes;
        if (body.cx!==64.5 || body.cy!==85.5 || body.rx!==60.5 || body.ry!==81.5)
            throw new RangeError("Thinking-right silhouette requires new blink correspondence");
        const xs = [reference.upper.start[0],...reference.upper.curve.map(p => p[0])];
        preset = {family:"thinking-ellipse",upperOpen:lid(xs,[-4,-4,-4,-4]),lowerOpen:lid(xs,[175,175,175,175]),
            closed:reference.upper,boundary:generateEyePath(outline.commands),stroke:"black",strokeWidth:4,
            landmarks:{upper:[[64.5,4]],lower:[64.5,167]}};
    } else if (expression === "happier") {
        if (first.tag!=="path") throw new RangeError("Missing Happier body");
        const commands = first.commands, upper = cubic(commands,1), lower = lowerLandmark(cubic(commands,3));
        // Source top, lateral extrema and lower bridge/shoulders, not an Idle ellipse.
        const top = commands[0].slice(-2) as unknown as EyePoint;
        const lateral = upper[3], shoulder = cubic(commands,2)[3];
        const span = lower[1]-top[1], x0 = 2-8, x3 = lateral[0]+8;
        const xs = [x0,x0+(x3-x0)/3,x0+2*(x3-x0)/3,x3];
        const edge = shoulder[1]-.13*span, arch = .075*span;
        preset = {family:"happier-arch",upperOpen:lid(xs,[lateral[1]-40,top[1]-50,top[1]-50,lateral[1]-40]),
            lowerOpen:lid(xs,[lower[1]+8,lower[1]+8,lower[1]+8,lower[1]+8]),
            closed:lid(xs,[edge,edge-arch*4/3,edge-arch*4/3,edge]),boundary:generateEyePath(commands),
            stroke:"black",strokeWidth:4,landmarks:{upper:[top,lateral],lower,shoulders:[shoulder,cubic(commands,3)[3]]}};
    } else {
        if (first.tag!=="g" || first.children[0]?.tag!=="path" || outline.tag!=="path")
            throw new RangeError("Missing sloping blink contours");
        const commands = first.children[0].commands;
        // Native upper central cubic and lower return, read independently on each side.
        const nativeUpper = cubic(commands,2), lower = lowerLandmark(cubic(commands,5));
        const upper = side === "right" ? [...nativeUpper].reverse() : nativeUpper;
        const x0 = -8, x3 = source.width+8, xs = [x0,x0+(x3-x0)/3,x0+2*(x3-x0)/3,x3];
        // Conservative open support keeps native highlight overpaint and optional
        // lower details/blur. The support envelope is not a replacement source path.
        const upperY = upper.map(p => p[1]-24), bottom = source.height+8;
        const closedY = upper.map((p,i) => .25*p[1]+.75*lower[1]+(i===1 || i===2 ? 6 : 0));
        preset = {family:"sloping",upperOpen:lid(xs,upperY),lowerOpen:lid(xs,[bottom,bottom,bottom,bottom]),
            closed:lid(xs,closedY),boundary:generateEyePath(outline.commands),stroke:"black",strokeWidth:4,
            landmarks:{upper,lower}};
    }
    const result = freeze(preset);
    (prepared[expression] ??= {})[side] = result;
    return result;
}
